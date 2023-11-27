import { expect } from "chai";
import { ethers } from "hardhat";
import type { ListaCore } from "../typechain-types";
import { Signer } from "ethers";

describe("ListaCore", () => {
  const testGuardianAddress = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";
  const testPriceFeedAddress = "0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd";
  const ONE_DAY_SECONDS = 24 * 3600;
  const ONE_WEEK_SECONDS = 7 * ONE_DAY_SECONDS;
  const ZERO_ADDRESS = ethers.constants.AddressZero;

  let listaCore: ListaCore;
  let owner: Signer;
  let feeReceiver: Signer;
  let user: Signer;
  let user2: Signer;

  beforeEach(async () => {
    [owner, feeReceiver, user, user2] = await ethers.getSigners();

    listaCore = await ethers.deployContract("ListaCore", [
      await owner.getAddress(),
      testGuardianAddress,
      testPriceFeedAddress,
      await feeReceiver.getAddress()
    ]);
    await listaCore.deployed();
  });

  describe("Deployment", async () => {
    it("Should OK when construct", async () => {
      const tx = listaCore.deployTransaction;
      const block = await ethers.provider.getBlock(tx.block);

      expect(await listaCore.owner()).to.be.equal(await owner.getAddress());
      expect(await listaCore.startTime()).to.be.equal(Math.floor(block.timestamp / ONE_WEEK_SECONDS) * ONE_WEEK_SECONDS);
      expect(await listaCore.feeReceiver()).to.be.equal(await feeReceiver.getAddress());
      expect(await listaCore.priceFeed()).to.be.equal(testPriceFeedAddress);
      expect(await listaCore.pendingOwner()).to.be.equal(ZERO_ADDRESS);
      expect(await listaCore.ownershipTransferDeadline()).to.be.equal(0);
      expect(await listaCore.guardian()).to.be.equal(testGuardianAddress);
      expect(await listaCore.paused()).to.be.equal(false);

      // check event
      await expect(tx).to.emit(listaCore, "GuardianSet").withArgs(testGuardianAddress);
      await expect(tx).to.emit(listaCore, "PriceFeedSet").withArgs(testPriceFeedAddress);
      await expect(tx).to.emit(listaCore, "FeeReceiverSet").withArgs(await feeReceiver.getAddress());
    });
  });

  describe("set Functions", () => {
    it("Should OK when set feeReceiver", async () => {
      const tx = await listaCore.setFeeReceiver(await feeReceiver.getAddress());

      expect(await listaCore.feeReceiver()).to.be.equal(await feeReceiver.getAddress());
      await expect(tx).to.emit(listaCore, "FeeReceiverSet").withArgs(await feeReceiver.getAddress());
    });

    it("Should OK when set priceFeed", async () => {
      const tx = await listaCore.setPriceFeed(testPriceFeedAddress);

      expect(await listaCore.priceFeed()).to.be.equal(testPriceFeedAddress);
      await expect(tx).to.emit(listaCore, "PriceFeedSet").withArgs(testPriceFeedAddress);
    });

    it("Should OK when set guardian", async () => {
      const tx = await listaCore.setGuardian(testGuardianAddress);

      expect(await listaCore.guardian()).to.be.equal(testGuardianAddress);
      await expect(tx).to.emit(listaCore, "GuardianSet").withArgs(testGuardianAddress);
    });

    it("Should OK when set paused/unpaused", async () => {
      const pauseTx = await listaCore.setPaused(true);

      expect(await listaCore.paused()).to.be.equal(true);
      await expect(pauseTx).to.emit(listaCore, "Paused");
      await expect(pauseTx).to.not.emit(listaCore, "Unpaused");

      const unpausedTx = await listaCore.setPaused(false);
      expect(await listaCore.paused()).to.be.equal(false);
      await expect(unpausedTx).to.not.emit(listaCore, "Paused");
      await expect(unpausedTx).to.emit(listaCore, "Unpaused");
    });

    it("Should OK when commitTransferOwnership", async () => {
      const newOwnerAddress = await user.getAddress();
      const tx = await listaCore.commitTransferOwnership(newOwnerAddress);
      const delay = Number(await listaCore.OWNERSHIP_TRANSFER_DELAY());
      const block = await ethers.provider.getBlock(tx.block);
      const timestamp = Number(block.timestamp);
      const deadline = timestamp + delay;

      expect(await listaCore.pendingOwner()).to.be.equal(await user.getAddress());
      expect(await listaCore.ownershipTransferDeadline()).to.be.equal(deadline);
      await expect(tx)
        .to.emit(listaCore, "NewOwnerCommitted")
        .withArgs(
          await owner.getAddress(),
          newOwnerAddress,
          deadline
        );
    });

    it("Should revert when acceptTransferOwnership right after commit transfer", async () => {
      const newOwnerAddress = await user.getAddress();
      await listaCore.commitTransferOwnership(newOwnerAddress);
      const deadline = await listaCore.ownershipTransferDeadline();

      expect(deadline).to.be.not.equal(0);

      await expect(listaCore.connect(user).acceptTransferOwnership()).to.be.revertedWith("Deadline not passed");

      await ethers.provider.send("evm_increaseTime", [deadline.toNumber() + 1]);
      const tx = await listaCore.connect(user).acceptTransferOwnership();

      expect(await listaCore.owner()).to.be.equal(newOwnerAddress);
      expect(await listaCore.pendingOwner()).to.be.equal(ZERO_ADDRESS);
      expect(await listaCore.ownershipTransferDeadline()).to.be.equal(0);

      const oldOwner = await owner.getAddress();
      await expect(tx).to.emit(listaCore, "NewOwnerAccepted").withArgs(oldOwner, newOwnerAddress);
    });

    it("Should OK when revokeTransferOwnership", async () => {
      const oldOwnerAddress = await owner.getAddress();
      const newOwnerAddress = await user.getAddress();
      await listaCore.commitTransferOwnership(newOwnerAddress);

      const tx = await listaCore.revokeTransferOwnership();

      expect(await listaCore.owner()).to.be.equal(oldOwnerAddress);
      expect(await listaCore.pendingOwner()).to.be.equal(ZERO_ADDRESS);
      expect(await listaCore.ownershipTransferDeadline()).to.be.equal(0);

      await expect(tx).to.emit(listaCore, "NewOwnerRevoked").withArgs(oldOwnerAddress, newOwnerAddress);
    });

    it("Should revert after revokeTransferOwnership", async () => {
      const oldOwnerAddress = await owner.getAddress();
      const newOwnerAddress = await user.getAddress();
      await listaCore.commitTransferOwnership(newOwnerAddress);

      await listaCore.revokeTransferOwnership();

      await expect(listaCore.connect(user).acceptTransferOwnership()).to.be.revertedWith("Only new owner");
    });
  });

  describe("modifier", () => {
    it("Should revert if not owner", async () => {
      let fakeAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
      await expect(listaCore.connect(user).setFeeReceiver(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(listaCore.connect(user).setPriceFeed(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(listaCore.connect(user).setGuardian(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(listaCore.connect(user).commitTransferOwnership(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(listaCore.connect(user).revokeTransferOwnership()).to.be.revertedWith("Only owner");

      await expect(listaCore.connect(user).setPaused(true)).to.be.revertedWith("Unauthorized");
    });

    it("Should revert if not new owner", async () => {
      const newOwnerAddress = await user.getAddress();
      await listaCore.commitTransferOwnership(newOwnerAddress);

      await expect(listaCore.connect(user2).acceptTransferOwnership()).to.be.revertedWith("Only new owner");
    });

    it("Should revert if not paused and called from guardian", async () => {
      const fakeGuadian = user2;
      const fakeGuadianAddress = await fakeGuadian.getAddress();
      await listaCore.setGuardian(fakeGuadianAddress);

      expect(await listaCore.paused()).to.be.equal(false);

      await expect(listaCore.connect(fakeGuadian).setPaused(false)).to.be.revertedWith("Unauthorized");
    });
  });

  describe("pause", () => {
    it("Should OK if param is paused, call from guardian", async () => {
      const fakeGuadian = user;
      await listaCore.setGuardian(await fakeGuadian.getAddress());

      await expect(listaCore.connect(fakeGuadian).setPaused(true)).to.be.not.reverted;
    });

    it("Should revert if param is paused, call not from guardian", async () => {
      const fakeGuadian = user;
      await listaCore.setGuardian(await fakeGuadian.getAddress());

      await expect(listaCore.connect(user2).setPaused(true)).to.be.revertedWith("Unauthorized");
    });

    it("Should revert if param is not paused, call from guardian", async () => {
      const fakeGuadian = user;
      await listaCore.setGuardian(await fakeGuadian.getAddress());

      await expect(listaCore.connect(fakeGuadian).setPaused(false)).to.be.revertedWith("Unauthorized");
    });

    it("Should revert if param is not paused, call not from guardian", async () => {
      const fakeGuadian = user;
      await listaCore.setGuardian(await fakeGuadian.getAddress());

      await expect(listaCore.connect(user2).setPaused(false)).to.be.revertedWith("Unauthorized");
    });
  });
});
