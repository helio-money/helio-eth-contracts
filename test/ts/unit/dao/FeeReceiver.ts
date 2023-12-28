import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { CollateralToken, FeeReceiver, MockListaCore } from "../../../../typechain-types";
import { ETHER } from "../../utils";

describe("FeeReceiver Contract", () => {
  let feeReceiver: FeeReceiver;
  let listaCore: MockListaCore;
  let token: CollateralToken;

  // signers
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;

  beforeEach(async () => {
    // signers
    [owner, user1, user2] = await ethers.getSigners();

    // deploy ERC20 token
    token = await ethers.deployContract("CollateralToken", []) as CollateralToken;
    await token.deployed();

    // deploy MockListaCore
    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();
    // set owner
    await listaCore.setOwner(owner.getAddress());

    // deploy FeeReceiver
    feeReceiver = await ethers.deployContract("FeeReceiver", [
      listaCore.address,
    ]) as FeeReceiver;
    await feeReceiver.deployed();

    // mint tokens
    await token.mint(owner.getAddress(), ETHER.mul(1000));
    await token.mint(feeReceiver.address, ETHER.mul(1000));
  });

  describe("transferToken(IERC20, address, uint256)", () => {
    it("Should revert if caller is not owner", async () => {
      await expect(
        feeReceiver.connect(user1).transferToken(token.address, user2.getAddress(), ETHER.mul(100))
      ).to.be.revertedWith("Only owner");
    });

    it("Should OK if caller is owner", async () => {
      const amount = ETHER.mul(100);
      await expect(feeReceiver.connect(owner).transferToken(token.address, user2.getAddress(), amount))
        .not.to.be.reverted;

      expect(await token.balanceOf(feeReceiver.address))
        .to.be.equal(ETHER.mul(1000).sub(amount));
      expect(await token.balanceOf(user2.getAddress()))
        .to.be.equal(amount);
    });
  });

  describe("setTokenApproval(IERC20, address, uint256)", () => {
    it("Should revert if caller is not owern", async () => {
      await expect(
        feeReceiver.connect(user1).setTokenApproval(token.address, user2.getAddress(), ETHER.mul(100))
      ).to.be.revertedWith("Only owner");
    });

    it("Should OK if caller is owner", async () => {
      await expect(feeReceiver.connect(owner).setTokenApproval(token.address, user2.getAddress(), ETHER.mul(100)))
        .not.to.be.reverted;
    });
  });
});
