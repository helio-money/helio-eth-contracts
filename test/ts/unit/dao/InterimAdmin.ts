import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { InterimAdmin, ListaCore, MockAdminVoting } from "../../../../typechain-types";
import { ZERO_ADDRESS, encodeCallData, increase } from "../../utils";

describe("InterimAdmin Contract", async () => {
  // contracts
  let interimAdmin: InterimAdmin;
  let listaCore: ListaCore;
  let adminVoting: MockAdminVoting;

  // signers
  let owner: Signer;
  let guardian: Signer;
  let feeReceiver: Signer;
  let user1: Signer;
  let user2: Signer;

  // methods
  const newProposal = (values: number[]) => values.map(v => ({
    target: adminVoting.address,
    data: encodeCallData('executeByProposal(uint256)', ['uint256'], [v]),
  }));
  const newProposalSetGuardian = () => ([{
    target: adminVoting.address,
    data: encodeCallData('setGuardian(address)', ['address'], [listaCore.address]),
  }]);

  beforeEach(async () => {
    // signers 
    [owner, guardian, feeReceiver, user1, user2] = await ethers.getSigners();

    // deploy List
    listaCore = await ethers.deployContract("ListaCore", [
      owner.getAddress(),
      guardian.getAddress(),
      ZERO_ADDRESS,
      feeReceiver.getAddress()
    ]) as ListaCore;
    await listaCore.deployed();

    // deploy AdminVoting
    adminVoting = await ethers.deployContract("MockAdminVoting", []) as MockAdminVoting;
    await adminVoting.deployed();

    // deploy InterimAdmin
    interimAdmin = await ethers.deployContract("InterimAdmin", [
      listaCore.address,
    ]) as InterimAdmin;
    await interimAdmin.deployed();

    // init properties
    await interimAdmin.setAdminVoting(adminVoting.address);
    await adminVoting.setListaCore(listaCore.address);
  });

  describe("setAdminVoting()", async () => {
    let interimAdmin: InterimAdmin;

    beforeEach(async () => {
      // deploy InterimAdmin without adminVoting
      interimAdmin = await ethers.deployContract("InterimAdmin", [
        listaCore.address,
      ]) as InterimAdmin;
      await interimAdmin.deployed();
    });

    it("Should revert if caller is not owner", async () => {
      await expect(interimAdmin.connect(user1).setAdminVoting(adminVoting.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if adminVoting already set", async () => {
      await interimAdmin.setAdminVoting(adminVoting.address);

      await expect(interimAdmin.setAdminVoting(adminVoting.address))
        .to.be.revertedWith("Already set");
    });

    it("Should revert if _adminVoting is not contract address", async () => {
      await expect(interimAdmin.setAdminVoting(user1.getAddress()))
        .to.be.revertedWith("adminVoting must be a contract");
    });

    it("Should OK", async () => {
      await expect(interimAdmin.setAdminVoting(adminVoting.address))
        .not.to.be.reverted;
      expect(await interimAdmin.adminVoting()).to.equal(adminVoting.address);
    });
  });

  describe("getProposalCount()", async () => {
    it("Return 0 if no proposal", async () => {
      expect(await interimAdmin.getProposalCount())
        .to.be.equal(0);
    });

    it("Return count of proposals", async () => {
      const proposal = newProposal([0, 1]);
      await interimAdmin.createNewProposal(proposal);

      expect(await interimAdmin.getProposalCount())
        .to.be.equal(1);
    });
  });

  describe("getProposalData()", async () => {
    it("Should revert if id is not exists", async () => {
      await expect(interimAdmin.getProposalData(0))
        .to.be.revertedWithPanic(0x32);
    });

    it("Return the proposal data", async () => {
      const proposal = newProposal([0]);
      await interimAdmin.createNewProposal(proposal);

      await expect(interimAdmin.getProposalData(0))
        .not.to.be.reverted;
    });
  });

  describe("createNewProposal()", async () => {
    it("Should revert if caller is not owner or guardian", async () => {
      await expect(interimAdmin.connect(guardian).createNewProposal(newProposal([0])))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if payload is empty", async () => {
      await expect(interimAdmin.createNewProposal([]))
        .to.be.revertedWith("Empty payload");
    });

    it("Should revert if currentDailyCount >= MAX_DAILY_COUNT", async () => {
      // create MAX_DAILY_COUNT proposals
      const MAX_DAILY_PROPOSALS = await interimAdmin.MAX_DAILY_PROPOSALS().then(v => v.toNumber());
      for (let i = 0; i < MAX_DAILY_PROPOSALS; i++) {
        await interimAdmin.createNewProposal(newProposal([i]));
      }

      await expect(interimAdmin.createNewProposal(newProposal([1])))
        .to.be.revertedWith("MAX_DAILY_PROPOSALS");
    });

    it("Should revert when change guardian", async () => {
      const proposals = newProposalSetGuardian();
      await expect(interimAdmin.createNewProposal(proposals))
        .to.be.revertedWith("Cannot change guardian");
    });

    it("Should OK", async () => {
      const tx = await interimAdmin.createNewProposal(newProposal([1]));
      await expect(tx).not.to.reverted;
      await expect(tx).to.emit(interimAdmin, "ProposalCreated");
    });
  });

  describe("cancelProposal()", async () => {
    it("Should revert if caller is not owner or guardian", async () => {
      await expect(interimAdmin.connect(user1).cancelProposal(0))
        .to.be.revertedWith("Unauthorized");
    });

    it("Should revert if the proposal is not exists", async () => {
      await expect(interimAdmin.cancelProposal(0))
        .to.be.revertedWith("Invalid ID");
    });

    it("Cancelled by owner", async () => {
      const proposal = newProposal([0]);
      await interimAdmin.createNewProposal(proposal);

      const tx = await interimAdmin.cancelProposal(0);
      await expect(tx).not.to.be.reverted;
      await expect(tx).to.be.emit(interimAdmin, "ProposalCancelled");

      const proposalData = await interimAdmin.getProposalData(0);
      expect(proposalData.canExecute).to.be.false;
    });

    it("Cancelled by guardian", async () => {
      const proposal = newProposal([0]);
      await interimAdmin.createNewProposal(proposal);

      const tx = await interimAdmin.connect(guardian).cancelProposal(0);
      await expect(tx).not.to.be.reverted;
      await expect(tx).to.be.emit(interimAdmin, "ProposalCancelled");

      const proposalData = await interimAdmin.getProposalData(0);
      expect(proposalData.canExecute).to.be.false;
    });
  });

  describe("executeProposal()", async () => {
    beforeEach(async () => {
      await interimAdmin.createNewProposal(newProposal([0]));
    });

    it("Should revert if caller is not owner", async () => {
      await expect(interimAdmin.connect(guardian).executeProposal(0))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if the proposal is not exists", async () => {
      await expect(interimAdmin.executeProposal(1))
        .to.be.revertedWith("Invalid ID");
    });

    it("Should revert if the proposal is already processed", async () => {
      await interimAdmin.cancelProposal(0);

      await expect(interimAdmin.executeProposal(0))
        .to.be.revertedWith("Already processed");
    });

    it("Should revert when MIN_TIME_TO_EXECUTION is not passed", async () => {
      await expect(interimAdmin.executeProposal(0))
        .to.be.revertedWith("MIN_TIME_TO_EXECUTION");
    });

    it("Should revert when MAX_TIME_TO_EXECUTION is passed", async () => {
      const MIN_TIME_TO_EXECUTION = await interimAdmin.MIN_TIME_TO_EXECUTION();
      const MAX_TIME_TO_EXECUTION = await interimAdmin.MAX_TIME_TO_EXECUTION();
      await increase(MIN_TIME_TO_EXECUTION.add(MAX_TIME_TO_EXECUTION));

      await expect(interimAdmin.executeProposal(0))
        .to.be.revertedWith("MAX_TIME_TO_EXECUTION");
    });

    it("Execute by owner", async () => {
      const MIN_TIME_TO_EXECUTION = await interimAdmin.MIN_TIME_TO_EXECUTION();
      await increase(MIN_TIME_TO_EXECUTION.add(1));

      const tx = await interimAdmin.executeProposal(0);
      await expect(tx).not.to.be.reverted;
      await expect(tx).to.be.emit(interimAdmin, "ProposalExecuted");
      await expect(tx).to.be.emit(adminVoting, "ProposalExecuted");

      const proposalData = await interimAdmin.getProposalData(0);
      expect(proposalData.canExecute).to.be.false;
    });
  });

  describe("acceptTransferOwnership()", async () => {
    it("Should revert if caller is not owner", async () => {
      await expect(interimAdmin.connect(user1).acceptTransferOwnership())
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when before deadline", async () => {
      await listaCore.commitTransferOwnership(interimAdmin.address);

      await expect(interimAdmin.acceptTransferOwnership())
        .to.be.revertedWith("Deadline not passed");
    });

    it("Should OK", async () => {
      await listaCore.commitTransferOwnership(interimAdmin.address);

      // pass deadline
      await increase(listaCore.OWNERSHIP_TRANSFER_DELAY());

      await expect(interimAdmin.acceptTransferOwnership())
        .not.to.be.reverted;

      expect(await listaCore.owner()).to.equal(interimAdmin.address);
    });
  });

  describe("transferOwnershipToAdminVoting()", async () => {
    it("Should rever if caller is not owner or guardian", async () => {
      await expect(interimAdmin.connect(user1).transferOwnershipToAdminVoting())
        .to.be.revertedWith("Unauthorized");
    });

    it("Should revert if interimAdmin is not the owner of listaCore", async () => {
      await expect(interimAdmin.transferOwnershipToAdminVoting())
        .to.be.revertedWith("Only owner");
    });

    it("Should OK if caller is owner", async () => {
      // transfer listaCore ownership to interimAdmin
      await listaCore.commitTransferOwnership(interimAdmin.address);
      await increase(listaCore.OWNERSHIP_TRANSFER_DELAY());
      await interimAdmin.acceptTransferOwnership();

      await expect(interimAdmin.transferOwnershipToAdminVoting())
        .not.to.be.reverted;

      expect(await listaCore.pendingOwner())
        .to.be.equal(adminVoting.address);
    });

    it("Should OK if caller is guardian", async () => {
      // transfer listaCore ownership to interimAdmin
      await listaCore.commitTransferOwnership(interimAdmin.address);
      await increase(listaCore.OWNERSHIP_TRANSFER_DELAY());
      await interimAdmin.acceptTransferOwnership();

      await expect(interimAdmin.connect(guardian).transferOwnershipToAdminVoting())
        .not.to.be.reverted;

      expect(await listaCore.pendingOwner())
        .to.be.equal(adminVoting.address);
    });
  });
});
