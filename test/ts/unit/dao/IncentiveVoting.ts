import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { IncentiveVoting, ListaCore, MockListaToken, MockListaVault, TokenLocker } from "../../../../typechain-types";
import { ETHER, WEEK, ZERO_ADDRESS, _1E18, increase } from "../../utils";

describe("IncentiveVoting Contract", () => {
  // constants
  const INITIAL_LISTA_TOKENS = ETHER.mul(1000);

  // contracts
  let incentiveVoting: IncentiveVoting;
  let listaCore: ListaCore;
  let tokenLocker: TokenLocker;
  let listaToken: MockListaToken;
  let listaVault: MockListaVault;

  // signers
  let owner: Signer;
  let guardian: Signer;
  let feeReceiver: Signer;
  let manager: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(async () => {
    // signers
    [owner, guardian, feeReceiver, manager, user1, user2] = await ethers.getSigners();

    // deploy ListaCore
    listaCore = await ethers.deployContract("ListaCore", [
      owner.getAddress(),
      guardian.getAddress(),
      ZERO_ADDRESS,
      feeReceiver.getAddress()
    ]) as ListaCore;
    await listaCore.deployed();

    // deploy TokenLocker
    tokenLocker = await ethers.deployContract("TokenLocker", [
      listaCore.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      manager.getAddress(),
      _1E18,
    ]) as TokenLocker;

    // deploy MockListaVault
    listaVault = await ethers.deployContract("MockListaVault") as MockListaVault;
    await listaVault.deployed();

    // deploy ListaToken
    listaToken = await ethers.deployContract("MockListaToken", [
      listaVault.address,
      ZERO_ADDRESS,
      tokenLocker.address,
    ]) as MockListaToken;
    await listaToken.deployed();

    // deploy IncentiveVoting
    incentiveVoting = await ethers.deployContract("IncentiveVoting", [
      listaCore.address,
      tokenLocker.address,
      listaVault.address,
    ]) as IncentiveVoting;

    // init properties
    await tokenLocker.setLockToken(listaToken.address);
    await tokenLocker.setIncentiveVoter(incentiveVoting.address);
    await listaVault.setIncentiveVoting(incentiveVoting.address);

    // mint tokens
    await listaToken._mintInternal(await manager.getAddress(), INITIAL_LISTA_TOKENS.mul(1000));
    await listaToken.connect(manager).transfer(listaVault.address, INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await owner.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await user1.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await user2.getAddress(), INITIAL_LISTA_TOKENS);
  });

  describe("setVault(address)", async () => {
    it("Should revert if caller is not owner", async () => {
      await expect(incentiveVoting.connect(user1).setVault(user2.getAddress()))
        .to.be.revertedWith("Only owner");
    });

    it("Should OK", async () => {
      await incentiveVoting.setVault(user1.getAddress());

      expect(await incentiveVoting.vault()).to.eq(await user1.getAddress());
    });
  });

  describe("getAccountRegisteredLocks(address)", async () => {
    it("Should OK if account has no locks", async () => {
      const [frozenWeight, lockData] = await incentiveVoting.getAccountRegisteredLocks(user1.getAddress());
      expect(frozenWeight).to.be.equal(0);
      expect(lockData).to.be.an("array").lengthOf(0);
    });

    it("Should OK if account has locks", async () => {
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      const [frozenWeight, lockData] = await incentiveVoting.getAccountRegisteredLocks(user1.getAddress());
      expect(frozenWeight).to.be.equal(0);
      expect(lockData).to.be.an("array").lengthOf(1);
      expect(lockData[0].amount).to.be.equal(1);
      expect(lockData[0].weeksToUnlock).to.be.equal(10);
    });

    it("Should OK if unlcok week is passed", async () => {
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      await increase(WEEK * 11);

      const [frozenWeight, lockData] = await incentiveVoting.getAccountRegisteredLocks(user1.getAddress());
      expect(frozenWeight).to.be.equal(0);
      expect(lockData).to.be.an("array").lengthOf(0);
    });

    it("Should OK with frozen weight", async () => {
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.connect(user1).freeze();
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      const [frozenWeight, lockData] = await incentiveVoting.getAccountRegisteredLocks(user1.getAddress());
      expect(frozenWeight).to.be.equal(52);
      expect(lockData).to.be.an("array").lengthOf(0);
    });
  });

  describe("getAccountCurrentVotes(address)", async () => {
    it("Should OK if account has no votes", async () => {
      const votes = await incentiveVoting.getAccountCurrentVotes(user1.getAddress());
      expect(votes).to.be.an("array").lengthOf(0);
    });

    it("Should OK if account has votes", async () => {
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      await incentiveVoting.connect(user1).registerAccountWeightAndVote(
        user1.getAddress(),
        10,
        [],
      );
    });
  });

  describe("getReceiverWeight(uint256)", async () => {
    it("The same as getReceiverWeightAt(idx, getWeek())", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      expect(await incentiveVoting.getReceiverWeight(0))
        .to.be.equal(await incentiveVoting.getReceiverWeightAt(0, await incentiveVoting.getWeek()));
    });
  });

  describe("getReceiverWeightAt(uint256, uint256)", async () => {
    it("Return 0 if receiver has no registered weight", async () => {
      expect(await incentiveVoting.getReceiverWeightAt(1, 1))
        .to.be.equal(0);
    });

    it("Return if the week has updated", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await increase(WEEK * 10);

      expect(await incentiveVoting.getReceiverWeightAt(0, 0))
        .to.be.equal(10);
    });

    it("Return 0 if the weight at the updatedWeek is 0", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await increase(WEEK * 15);
      await incentiveVoting.getReceiverWeightWrite(0);
      await increase(WEEK * 5);

      expect(await incentiveVoting.getReceiverWeightAt(0, 20))
        .to.be.equal(0);
    });

    it("Return the weight at the week", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await increase(WEEK * 20);

      expect(await incentiveVoting.getReceiverWeightAt(0, 9))
        .to.be.equal(1);
    });
  });

  describe("getTotalWeight()", async () => {
    it("The same as getTotalWeightAt(getWeek())", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.lock(user2.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await incentiveVoting.connect(user2).registerAccountWeightAndVote(user2.getAddress(), 10, [{ id: 0, points: 10000 }]);

      expect(await incentiveVoting.getTotalWeight())
        .to.be.equal(await incentiveVoting.getTotalWeightAt(await incentiveVoting.getWeek()));
    });
  });

  describe("getTotalWeightAt(uint256)", async () => {
    it("Return when week is less than and equal to updatedWeek", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.lock(user2.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await incentiveVoting.connect(user2).registerAccountWeightAndVote(user2.getAddress(), 10, [{ id: 0, points: 10000 }]);

      expect(await incentiveVoting.getTotalWeightAt(0))
        .to.be.equal(20);
    });

    it("Return 0 if the weight at the updatedWeek is 0", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.lock(user2.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await incentiveVoting.connect(user2).registerAccountWeightAndVote(user2.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await increase(WEEK * 15);
      await incentiveVoting.getTotalWeightWrite();
      await increase(WEEK * 5);

      expect(await incentiveVoting.getTotalWeightAt(20))
        .to.be.equal(0);
    });

    it("Return the weight at the week", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.lock(user2.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await incentiveVoting.connect(user2).registerAccountWeightAndVote(user2.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await increase(WEEK * 20);

      expect(await incentiveVoting.getTotalWeightAt(9))
        .to.be.equal(2);
    });
  });

  describe("getReceiverWeightWrite(uint256)", async () => {
    it("Should revert the idx is greater than receiverCount", async () => {
      await expect(incentiveVoting.getReceiverWeightWrite(1))
        .to.be.revertedWith("Invalid ID");
    });

    it("Return weight and update updatedWeek", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      await increase(WEEK * 10);
      await expect(incentiveVoting.getReceiverWeightWrite(0))
        .not.to.be.reverted;

      expect(await incentiveVoting.receiverUpdatedWeek(0))
        .to.be.equal(await incentiveVoting.getWeek());
    });
  });

  describe("getTotalWeightWrite()", async () => {
    it("Return weight and update totalUpdatedWeek", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.lock(user2.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await incentiveVoting.connect(user2).registerAccountWeightAndVote(user2.getAddress(), 10, [{ id: 0, points: 10000 }]);

      await increase(WEEK * 10);
      await expect(incentiveVoting.getTotalWeightWrite())
        .not.to.be.reverted;

      expect(await incentiveVoting.totalUpdatedWeek())
        .to.be.equal(await incentiveVoting.getWeek());
    });
  });

  describe("getReceiverVotePct(uint256, uint256)", async () => {
    it("Return 0 if totalWeightWrite is 0", async () => {
      await listaVault.registerNewReceiver();
      expect(await incentiveVoting.callStatic.getReceiverVotePct(0, 1))
        .to.be.equal(0);
    });

    it("Return the vote percentage at the week", async () => {
      await listaVault.registerNewReceiver();
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.lock(user2.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await incentiveVoting.connect(user2).registerAccountWeightAndVote(user2.getAddress(), 10, [{ id: 1, points: 10000 }]);
      await increase(WEEK);

      expect(await incentiveVoting.callStatic.getReceiverVotePct(0, 1))
        .to.be.equal(_1E18.div(2)); // 1e18 * 10 / 20
    });
  });

  describe("registerNewReceiver()", async () => {
    it("Should revert if caller is not vaule", async () => {
      await expect(incentiveVoting.connect(user1).registerNewReceiver())
        .to.be.revertedWith("Not Treasury");
    });

    it("Should OK", async () => {
      await increase(WEEK);

      await expect(listaVault.registerNewReceiver())
        .not.to.be.reverted;
      expect(await incentiveVoting.receiverCount())
        .to.be.equal(1);
      expect(await incentiveVoting.receiverUpdatedWeek(0))
        .to.be.equal(1);
    });
  });

  describe("registerAccountWeight(address, uint256)", async () => {
    it("Should revert if caller is not the account or delegated", async () => {
      await expect(incentiveVoting.connect(owner).registerAccountWeight(user1.getAddress(), 10))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert if account has no locks", async () => {
      await expect(incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10))
        .to.be.revertedWith("No active locks");
    });

    it("Should OK with active votes", async () => {
      // create votes
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);
      await expect(tx).to.be.emit(incentiveVoting, "AccountWeightRegistered");
    });

    it("Should OK without active votes", async () => {
      await tokenLocker.lock(user1.getAddress(), 1, 10);

      const tx = await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);
      await expect(tx).to.be.emit(incentiveVoting, "AccountWeightRegistered");
    });

    it("Should OK with fronzen weight", async () => {
      // create votes
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.connect(user1).freeze();
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);
      await expect(tx).to.be.emit(incentiveVoting, "AccountWeightRegistered");
    });
  });

  describe("registerAccountWeightAndVote(address, uint256, Vote[])", async () => {
    it("Should revert if caller is not the account or delegated", async () => {
      await expect(incentiveVoting.connect(owner).registerAccountWeightAndVote(user1.getAddress(), 10, []))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert if account has no locks", async () => {
      await expect(incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, []))
        .to.be.revertedWith("No active locks");
    });

    it("Should revert if exceed max vote points", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);

      await expect(incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10001 }]))
        .to.be.revertedWith("Exceeded max vote points");
    });

    it("Should OK with active votes", async () => {
      // create votes
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      // create new votes
      const tx = await incentiveVoting.connect(user1)
        .registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await expect(tx).to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx).to.be.emit(incentiveVoting, "ClearedVotes");

      expect(await incentiveVoting.getReceiverWeight(0))
        .to.be.equal(10);
      expect(await incentiveVoting.getAccountCurrentVotes(user1.getAddress()))
        .to.be.an("array").lengthOf(1);
    });

    it("Should OK without active votes", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);

      const tx = await incentiveVoting.connect(user1)
        .registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await expect(tx).to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx).not.to.be.emit(incentiveVoting, "ClearedVotes");

      expect(await incentiveVoting.getReceiverWeight(0))
        .to.be.equal(10);
      expect(await incentiveVoting.getAccountCurrentVotes(user1.getAddress()))
        .to.be.an("array").lengthOf(1);
    });

    it("Should OK with fronzen weight", async () => {
      // create votes
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.connect(user1).freeze();
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);
      await expect(tx).to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx).to.be.emit(incentiveVoting, "ClearedVotes");
    });
  });

  describe("vote(address, Vote[], bool)", async () => {
    it("Should revert if caller is not the account or delegated", async () => {
      await expect(incentiveVoting.connect(owner).vote(user1.getAddress(), [], false))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert if account has no registered weight", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);

      await expect(incentiveVoting.connect(user1).vote(user1.getAddress(), [], false))
        .to.be.revertedWith("No registered weight");
    });

    it("Should revert if registered weight expired", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);
      await increase(WEEK * 11);

      await expect(incentiveVoting.connect(user1).vote(user1.getAddress(), [{ id: 0, points: 10000 }], true))
        .to.be.revertedWith("Registered weight has expired");
    });

    it("Should OK if clearPrevious is true", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      const tx = await incentiveVoting.connect(user1).vote(user1.getAddress(), [{ id: 0, points: 10000 }], true);
      await expect(tx)
        .to.be.emit(incentiveVoting, "ClearedVotes");
    });

    it("Should OK if clearPrevious is false", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      const tx = await incentiveVoting.connect(user1).vote(user1.getAddress(), [{ id: 0, points: 10000 }], false);
      await expect(tx)
        .not.to.be.emit(incentiveVoting, "ClearedVotes");
    });
  });

  describe("clearVote(address)", async () => {
    it("Should revert if caller is not the account or delegated", async () => {
      await expect(incentiveVoting.connect(owner).clearVote(user1.getAddress()))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should OK if account has frozen weight", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.connect(user1).freeze();
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await incentiveVoting.connect(user1).clearVote(user1.getAddress());
      await expect(tx)
        .to.be.emit(incentiveVoting, "ClearedVotes");
      expect(await incentiveVoting.getAccountCurrentVotes(user1.getAddress()))
        .to.be.an("array").lengthOf(0);
    });

    it("Should OK if account has no frozen weight", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await incentiveVoting.connect(user1).clearVote(user1.getAddress());
      await expect(tx)
        .to.be.emit(incentiveVoting, "ClearedVotes");
      expect(await incentiveVoting.getAccountCurrentVotes(user1.getAddress()))
        .to.be.an("array").lengthOf(0);
    });
  });

  describe("clearRegisteredWeight(address)", async () => {
    it("Should revert if caller is not the account or delegated or TokenLocker", async () => {
      await expect(incentiveVoting.connect(owner).clearRegisteredWeight(user1.getAddress()))
        .to.be.revertedWith("Delegate not approved");

      await expect(incentiveVoting.connect(user1).clearRegisteredWeight(user1.getAddress()))
        .not.to.be.rejectedWith("Delegate not approved");
    });

    it("Should OK if account has locks and no votes", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeight(user1.getAddress(), 10);

      const tx = await incentiveVoting.connect(user1).clearRegisteredWeight(user1.getAddress());
      await expect(tx)
        .to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx)
        .not.to.be.emit(incentiveVoting, "ClearedVotes");
    });

    it("Should OK if account has locks and votes", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await incentiveVoting.connect(user1).clearRegisteredWeight(user1.getAddress());
      await expect(tx)
        .to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx)
        .to.be.emit(incentiveVoting, "ClearedVotes");
    });
  });

  describe("unfreeze(address, bool)", async () => {
    it("Should revert if caller is not TokenLocker", async () => {
      await expect(incentiveVoting.connect(owner).unfreeze(user1.getAddress(), false))
        .to.be.revertedWithoutReason();
    });

    it("Should OK if account as frozen weights and keep voting", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.connect(user1).freeze();
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await tokenLocker.connect(user1).unfreeze(true);
      await expect(tx)
        .to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx)
        .not.to.be.emit(incentiveVoting, "ClearedVotes");
    });

    it("Should OK if account as frozen weights and clear voting", async () => {
      await listaVault.registerNewReceiver();
      await tokenLocker.lock(user1.getAddress(), 1, 10);
      await tokenLocker.connect(user1).freeze();
      await incentiveVoting.connect(user1).registerAccountWeightAndVote(user1.getAddress(), 10, [{ id: 0, points: 10000 }]);

      const tx = await tokenLocker.connect(user1).unfreeze(false);
      await expect(tx)
        .to.be.emit(incentiveVoting, "AccountWeightRegistered");
      await expect(tx)
        .to.be.emit(incentiveVoting, "ClearedVotes");
    });
  });
});
