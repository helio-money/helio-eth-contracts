import { expect } from "chai";
import { Signer, Wallet } from "ethers";
import { ethers } from "hardhat";
import { ListaToken } from "../../../../typechain-types";
import { DAY, ETHER, ZERO_ADDRESS, getPermitDigest, now, sign } from "../../utils";

describe("ListaToken Contract", () => {
  // contants
  let tokenName: string;
  let chainId: number;

  // contracts
  let listaToken: ListaToken;

  // signers
  let deployer: Signer;
  let vault: Signer; // mock ListaVault
  let locker: Signer; // mock ListaTokenLocker
  let user1: Signer;
  let owner = Wallet.createRandom();

  beforeEach(async () => {
    // signers
    [deployer, vault, locker, user1] = await ethers.getSigners();

    // deploy contracts
    listaToken = await ethers.deployContract("ListaToken", [
      vault.getAddress(),
      ZERO_ADDRESS,
      locker.getAddress(),
    ]) as ListaToken;
    await listaToken.deployed();

    // init properties
    tokenName = await listaToken.name();
    chainId = ethers.provider.network.chainId;
  });

  describe("mintToVault(uint256)", async () => {
    it("Should revert if caller is not the vault", async () => {
      await expect(listaToken.connect(user1).mintToVault(1))
        .to.be.revertedWithoutReason();
    });

    it("Should revert if maxTotalSupply is not 0", async () => {
      await expect(listaToken.connect(vault).mintToVault(1));

      await expect(listaToken.connect(vault).mintToVault(1))
        .to.be.revertedWithoutReason();
    });

    it("Should OK", async () => {
      await expect(listaToken.connect(vault).mintToVault(1))
        .not.to.be.reverted;

      expect(await listaToken.totalSupply())
        .to.be.equal(1);
    });
  });

  describe("permit(address, address, uint256, uint256, uint8, bytes32, bytes32)", async () => {
    beforeEach(async () => {
      // mint to owner
      await listaToken.connect(vault).mintToVault(ETHER.mul(1000));
      await listaToken.connect(vault).transfer(deployer.getAddress(), ETHER.mul(100));
    });

    it("Should revert if deadline is in the past", async () => {
      const approve = {
        owner: await owner.getAddress(),
        spender: await user1.getAddress(),
        value: ETHER,
      }
      const deadline = await now() - 1;
      const nonce = await listaToken.nonces(owner.getAddress());
      // EIP712 digest
      const digest = getPermitDigest(tokenName, listaToken.address, chainId, approve, nonce, deadline);

      // sign
      const { v, r, s } = sign(digest, Buffer.from(owner.privateKey.slice(2), "hex"));

      await expect(listaToken.permit(
        approve.owner,
        approve.spender,
        approve.value,
        deadline,
        v,
        r,
        s,
      ))
        .to.be.revertedWith("LISTA: expired deadline");
    });

    it("Should revert if the recoveredAddress is not the owner", async () => {
      const approve = {
        owner: await owner.getAddress(),
        spender: await user1.getAddress(),
        value: ETHER,
      }
      const deadline = await now() + DAY;
      const nonce = await listaToken.nonces(owner.getAddress());
      // EIP712 digest
      const digest = getPermitDigest(tokenName, listaToken.address, chainId, approve, nonce, deadline);

      // sign
      const { v, r, s } = sign(digest, Buffer.from(owner.privateKey.slice(2), "hex"));

      await expect(listaToken.permit(
        await deployer.getAddress(),
        approve.spender,
        approve.value,
        deadline,
        v,
        r,
        s,
      ))
        .to.be.revertedWith("LISTA: invalid signature");
    });

    it("Should OK", async () => {
      const approve = {
        owner: await owner.getAddress(),
        spender: await user1.getAddress(),
        value: ETHER,
      }
      const deadline = await now() + DAY;
      const nonce = await listaToken.nonces(owner.getAddress());
      // EIP712 digest
      const digest = getPermitDigest(tokenName, listaToken.address, chainId, approve, nonce, deadline);

      // sign
      const { v, r, s } = sign(digest, Buffer.from(owner.privateKey.slice(2), "hex"));

      const tx = await listaToken.permit(
        approve.owner,
        approve.spender,
        approve.value,
        deadline,
        v,
        r,
        s,
      );

      await expect(tx)
        .to.be.emit(listaToken, "Approval");
    });
  });

  describe("transferToLocker(address, uint256)", async () => {
    it("Should revert if caller is not the locker", async () => {
      await expect(listaToken.connect(user1).transferToLocker(await user1.getAddress(), 1))
        .to.be.revertedWith("Not locker");
    });

    it("Should OK", async () => {
      // mint to vault
      await listaToken.connect(vault).mintToVault(ETHER.mul(1000));

      // transfer to locker
      const tx = await listaToken.connect(locker).transferToLocker(vault.getAddress(), ETHER.mul(100));

      await expect(tx)
        .to.be.emit(listaToken, "Transfer");

      expect(await listaToken.balanceOf(await locker.getAddress()))
        .to.be.equal(ETHER.mul(100));
    });
  });
});
