import { expect } from "chai";
import { ethers } from "hardhat";
import { ETHER } from "../../utils";
import { AirdropDistributorHelper } from "../../utils/AirdropDistributorHelper";
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("AirdropDistributor Contract", () => {
  let helper: AirdropDistributorHelper

  beforeEach(async () => {
    helper = new AirdropDistributorHelper(await ethers.getSigners());
    await helper.init();
  });

  describe("setMerkleRoot(bytes32)", async () => {
    it("should revert if not called by owner", async () => {
      await expect(helper.airdropDistributor(helper.user1).setMerkleRoot(helper.merkleRoot))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Set merkle root", async () => {
      const tx = await helper.airdropDistributor().setMerkleRoot(helper.merkleRoot);
      await expect(tx)
        .to.be.emit(helper.airdropDistributor(), "MerkleRootSet").withArgs(helper.merkleRoot, await helper.airdropDistributor().canClaimUntil());
    });

    it("Should revert if merkle root is already set", async () => {
      await helper.airdropDistributor().setMerkleRoot(helper.merkleRoot);

      await expect(helper.airdropDistributor().setMerkleRoot(helper.merkleRoot))
        .to.be.revertedWith("merkleRoot already set");
    });
  });

  describe("sweepUnclaimedTokens()", async () => {
    it("Should revert if the merkle root is not set", async () => {
      await expect(helper.airdropDistributor().sweepUnclaimedTokens())
        .to.be.revertedWith("merkleRoot not set");
    });

    it("Should revert when before the canClaimUntil", async () => {
      await helper.setMerkleRoot();

      await expect(helper.airdropDistributor().sweepUnclaimedTokens())
        .to.be.revertedWith("Claims still active");
    });

    it("Should revert if the allowance is 0", async () => {
      await helper.setMerkleRoot();
      time.increaseTo((await helper.airdropDistributor().canClaimUntil()).add(1));

      await expect(helper.airdropDistributor().sweepUnclaimedTokens())
        .to.be.revertedWith("Nothing to sweep");
    });

    it("Should OK", async () => {
      await helper.setMerkleRoot();
      time.increaseTo((await helper.airdropDistributor().canClaimUntil()).add(1));

      // increase allowance
      const allowance = ETHER.mul(10);
      await helper.listaToken._approveInternal(helper.listaVault.address, helper.airdropDistributor().address, allowance);

      await expect(helper.airdropDistributor().sweepUnclaimedTokens())
        .not.to.be.reverted;
    });
  });

  describe("isClaimed(uint256)", async () => {
    it("Retrun false if the index is not claimed", async () => {
      expect(await helper.airdropDistributor().isClaimed(0))
        .to.be.false;
    });

    it("Retrun true if the index is claimed", async () => { });
  });

  describe("sclaim(address, address, uint256, uint256, bytes32[])", async () => {
    it("Should revert if the sender is not the owner when sender is not the claimant", async () => {
      const [node1] = helper.originNodes;
      await expect(helper.airdropDistributor(helper.user1).claim(node1.proxy, node1.account, node1.index, node1.amount, helper.merkleTree.getHexProof(node1.leaf)))
        .to.be.revertedWith("onlyOwner");
    });

    it("Should revert if the claimant is not the contract when sender is not the claimant", async () => {
      const [node0] = helper.originNodes;
      await expect(helper.airdropDistributor().claim(helper.user2.getAddress(), node0.account, node0.index, node0.amount, helper.merkleTree.getHexProof(node0.leaf)))
        .to.be.revertedWith("Claimant must be a contract");
    });

    it("Should revert if the merkle root has not been set", async () => {
      const [node0] = helper.originNodes;
      await expect(helper.airdropDistributor().claim(node0.proxy, node0.account, node0.index, node0.amount, helper.merkleTree.getHexProof(node0.leaf)))
        .to.be.revertedWith("merkleRoot not set");
    });

    it("Should revert when after the canClaimUntil", async () => {
      await helper.setMerkleRoot();
      time.increaseTo((await helper.airdropDistributor().canClaimUntil()).add(1));

      const [node0] = helper.originNodes;
      await expect(helper.airdropDistributor().claim(node0.proxy, node0.account, node0.index, node0.amount, helper.merkleTree.getHexProof(node0.leaf)))
        .to.be.revertedWith("Claims period has finished");
    });

    it("Should revert if then index has already been claimed", async () => {

    });

    it("Should revert if the proof is invalid", async () => {
      await helper.setMerkleRoot();

      const [node0, node1] = helper.originNodes;
      await expect(helper.airdropDistributor().claim(node0.proxy, node0.account, node0.index, node0.amount, helper.merkleTree.getHexProof(node1.leaf)))
        .to.be.revertedWith("Invalid proof");
    });

    it("Claim with callback", async () => {
      await helper.setMerkleRoot();

      // increase allowance
      const allowance = ETHER.mul(10);
      await helper.listaToken._approveInternal(helper.listaVault.address, helper.airdropDistributor().address, allowance);

      const [node0] = helper.originNodes;
      await helper.airdropDistributor(helper.user1).setClaimCallback(helper.claimCallback.address);

      const tx = await helper.airdropDistributor().claim(node0.proxy, node0.account, node0.index, node0.amount, helper.merkleTree.getHexProof(node0.leaf));
      await expect(tx)
        .to.be.emit(helper.airdropDistributor(), "Claimed")
        .to.be.emit(helper.claimCallback, "CallbackClaimed").withArgs(node0.proxy, node0.amount);
    });

    it("Claim without callback", async () => {
      await helper.setMerkleRoot();

      // increase allowance
      const allowance = ETHER.mul(10);
      await helper.listaToken._approveInternal(helper.listaVault.address, helper.airdropDistributor().address, allowance);

      const [node0] = helper.originNodes;

      const tx = await helper.airdropDistributor().claim(node0.proxy, node0.account, node0.index, node0.amount, helper.merkleTree.getHexProof(node0.leaf));
      await expect(tx)
        .to.be.emit(helper.airdropDistributor(), "Claimed")
        .not.to.be.emit(helper.claimCallback, "CallbackClaimed");
    });
  });

  describe("setClaimCallback(address)", async () => {
    it("Set the claim callback", async () => {
      await expect(helper.airdropDistributor().setClaimCallback(helper.claimCallback.address))
        .not.to.be.reverted;

      expect(await helper.airdropDistributor().claimCallback(helper.owner.getAddress()))
        .to.be.equal(helper.claimCallback.address);
    });
  });
});
