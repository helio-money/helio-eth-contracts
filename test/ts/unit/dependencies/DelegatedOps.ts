import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { MockDelegatedOps } from "../../../../typechain-types";

describe("DelegatedOps", async () => {
  let mockDelegatedOps: MockDelegatedOps;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    mockDelegatedOps = await ethers.deployContract("MockDelegatedOps") as MockDelegatedOps;
    await mockDelegatedOps.deployed();
  });

  describe("DelegatedOps", async () => {
    it("Should OK when the account is caller", async () => {
      await expect(mockDelegatedOps.connect(user1).isCallerOrDelegated(user1.getAddress()))
        .not.to.be.revertedWith('Delegate not approved')
        .to.be.true;
    });

    it("Should OK to delegate and revoke", async () => {
      // user1 delegate user2
      await expect(mockDelegatedOps.connect(user1).setDelegateApproval(user2.getAddress(), true))
        .not.to.be.reverted;

      // user2 call isCallerOrDelegated with user1
      await expect(mockDelegatedOps.connect(user2).isCallerOrDelegated(user1.getAddress()))
        .not.to.be.revertedWith('Delegate not approved')
        .to.be.true;

      // user1 revoke user2
      await expect(mockDelegatedOps.connect(user1).setDelegateApproval(user2.getAddress(), false))
        .not.to.be.reverted;

      // user2 call isCallerOrDelegated with user1
      await expect(mockDelegatedOps.connect(user2).isCallerOrDelegated(user1.getAddress()))
        .to.be.revertedWith('Delegate not approved');
    });

    it("Should revert when the account is not caller and is not isApprovedDelegate", async () => {
      // user2 call isCallerOrDelegated with user1
      await expect(mockDelegatedOps.connect(user2).isCallerOrDelegated(user1.getAddress()))
        .to.be.revertedWith('Delegate not approved');
    });
  });
});
