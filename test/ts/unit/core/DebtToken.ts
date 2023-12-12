import { beforeEach } from "mocha";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { DebtToken, MockERC3156FlashBorrower, MockListaCore } from "../../../../typechain-types";
import { parseEther } from "ethers/lib/utils";
import { expect } from "chai";
import { abi, DAY, ZERO_ADDRESS } from "../../utils";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {TypedDataSigner, VoidSigner} from "@ethersproject/abstract-signer/src.ts";

describe("DebtToken", () => {
  let stabilityPool: Signer;
  let stabilityPoolAddress: string;
  let borrowerOperationsAddress: string;
  let layerZeroEndpoint = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
  let factory: string;
  let listaCore: MockListaCore;
  let debtToken: DebtToken;

  const gasCompensation = parseEther("200");
  const tokenName = "debt";
  const tokenSymbol = "DEBT";
  const FLASH_LOAN_FEE = 9;
  const ERC3156_RETURN_VALUE = ethers.utils.id("ERC3156FlashBorrower.onFlashLoan");
  const UINT256_MAX = BigNumber.from("2").pow(256).sub(1);

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let id: string;
  let id1: string;
  let id2: string;
  let gasPool: string;
  beforeEach(async () => {
    let user3: Signer;
    [owner, user1, user2, user3, stabilityPool] = await ethers.getSigners();
    [id, id1, id2, gasPool, stabilityPoolAddress] = [await owner.getAddress(), await user1.getAddress(), await user2.getAddress(), await user3.getAddress(), await stabilityPool.getAddress()];

    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();

    factory = await owner.getAddress();
    borrowerOperationsAddress = await owner.getAddress();
    debtToken = await ethers.deployContract("DebtToken", [
      tokenName,
      tokenSymbol,
      stabilityPoolAddress,
      borrowerOperationsAddress,
      listaCore.address,
      layerZeroEndpoint,
      factory,
      gasPool,
      gasCompensation
    ]) as DebtToken;
    await debtToken.deployed();
  })

  const balanceOf = async (account: string) => {
    return await debtToken.balanceOf(account);
  }

  const flashFee = (amount: BigNumber) => {
    return amount.mul(FLASH_LOAN_FEE).div(1e4);
  }

  const permit = async (signer: Signer, spender: string, amount: BigNumber, deadline: number) => {
    const domain = {
      name: tokenName,
      version: "1",
      chainId: ethers.provider.network.chainId,
      verifyingContract: debtToken.address
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ]
    };
    const owner = await signer.getAddress();
    const message = {
      owner,
      spender,
      value: amount,
      nonce: await debtToken.nonces(id1),
      deadline,
    };

    let sig = await (signer as VoidSigner)._signTypedData(domain, types, message);
    expect(ethers.utils.verifyTypedData(domain, types, message, sig)).to.be.equal(owner);
    return sig;
  }

  describe("Deployment", () => {
    it("Should right after deployment", async () => {
      expect(await debtToken.name()).to.be.equal(tokenName);
      expect(await debtToken.symbol()).to.be.equal(tokenSymbol);
      expect(await debtToken.stabilityPoolAddress()).to.be.equal(stabilityPoolAddress);
      expect(await debtToken.lzEndpoint()).to.be.equal(layerZeroEndpoint);
      expect(await debtToken.borrowerOperationsAddress()).to.be.equal(borrowerOperationsAddress);
      expect(await debtToken.factory()).to.be.equal(factory);
      expect(await debtToken.gasPool()).to.be.equal(gasPool);
      expect(await debtToken.DEBT_GAS_COMPENSATION()).to.be.equal(gasCompensation);
    });
  })

  describe("Functions", () => {
    it("enableTroveManager", async () => {
      const fakeTroveManager = await user2.getAddress();
      await expect(debtToken.connect(user1).enableTroveManager(fakeTroveManager)).to.be.revertedWith("!Factory");

      expect(await debtToken.troveManager(fakeTroveManager)).to.be.false;
      await debtToken.enableTroveManager(fakeTroveManager);
      expect(await debtToken.troveManager(fakeTroveManager)).to.be.true;
    });

    it("mintWithGasCompensation and burnWithGasCompensation", async () => {
      const account = await user1.getAddress();
      await expect(debtToken.connect(user1).mintWithGasCompensation(account, 100)).to.be.reverted;

      // mint
      const amount = 100;
      const accountBeforeBalance = await balanceOf(account);
      const gasPollBeforeBalance = await balanceOf(gasPool);
      const tx1 = await debtToken.mintWithGasCompensation(account, amount);
      const accountAfterBalance = await balanceOf(account);
      const gasPoolAfterBalance = await balanceOf(gasPool);

      expect(accountAfterBalance.sub(accountBeforeBalance)).to.be.equal(amount);
      expect(gasPoolAfterBalance.sub(gasPollBeforeBalance)).to.be.equal(gasCompensation);
      await expect(tx1)
        .to.emit(debtToken, "Transfer").withArgs(ZERO_ADDRESS, account, amount)
        .to.emit(debtToken, "Transfer").withArgs(ZERO_ADDRESS, gasPool, gasCompensation);

      // burn
      const burnAmount = 43;
      await expect(debtToken.connect(user1).burnWithGasCompensation(account, burnAmount)).to.be.reverted;

      const tx2 = await debtToken.burnWithGasCompensation(account, burnAmount);
      const accountAfterBurn = await balanceOf(account);
      const gasPoolAfterBurn = await balanceOf(gasPool);

      expect(accountAfterBalance.sub(accountAfterBurn)).to.be.equal(burnAmount);
      expect(gasPoolAfterBalance.sub(gasPoolAfterBurn)).to.be.equal(gasCompensation);
      await expect(tx2)
        .to.emit(debtToken, "Transfer").withArgs(account, ZERO_ADDRESS, burnAmount)
        .to.emit(debtToken, "Transfer").withArgs(gasPool, ZERO_ADDRESS, gasCompensation);
    });

    it("mint and burn", async () => {
      const amount = 77;
      expect(await debtToken.troveManager(id1)).to.be.false;
      expect(id1).to.be.not.equal(borrowerOperationsAddress);
      await expect(debtToken.connect(user1).mint(id1, amount)).to.be.revertedWith("Debt: Caller not BO/TM");

      const beforeBalance = await balanceOf(id1);
      const tx1 = await debtToken.mint(id1, amount);
      const afterBalance = await balanceOf(id1);

      expect(afterBalance.sub(beforeBalance)).to.be.equal(amount);
      await expect(tx1).to.emit(debtToken, "Transfer").withArgs(ZERO_ADDRESS, id1, amount);

      // burn
      const burnAmount = 63;
      await expect(debtToken.burn(id1, burnAmount)).to.be.revertedWith("Debt: Caller not TroveManager");
      await debtToken.enableTroveManager(id);

      const tx2 = await debtToken.burn(id1, burnAmount);
      const afterBurnBalance = await balanceOf(id1);
      expect(afterBalance.sub(afterBurnBalance)).to.be.equal(burnAmount);
      await expect(tx2).to.emit(debtToken, "Transfer").withArgs(id1, ZERO_ADDRESS, burnAmount);

      // mint from troveManager
      const amount3 = parseEther("3");
      await debtToken.enableTroveManager(id2);
      const tx3 = await debtToken.connect(user2).mint(id1, amount3);
      const afterMintBalance = await balanceOf(id1);
      await expect(tx3).to.emit(debtToken, "Transfer").withArgs(ZERO_ADDRESS, id1, amount3);
      expect(afterMintBalance.sub(afterBurnBalance)).to.be.equal(amount3);
    });

    it("sendToSP", async () => {
      const sender = id1;
      const amount = 100;
      await expect(debtToken.sendToSP(sender, amount)).to.be.revertedWith("Debt: Caller not StabilityPool");
      await debtToken.mint(sender, 1000);

      const beforeBalance = await balanceOf(sender);
      const SPBeforeBalance = await balanceOf(stabilityPoolAddress);
      const tx = await debtToken.connect(stabilityPool).sendToSP(sender, amount);
      const afterBalance = await balanceOf(sender);
      const SPAfterBalance = await balanceOf(stabilityPoolAddress);

      expect(beforeBalance.sub(afterBalance)).to.be.equal(amount);
      expect(SPAfterBalance.sub(SPBeforeBalance)).to.be.equal(amount);
      await expect(tx).to.emit(debtToken, "Transfer")
        .withArgs(sender, stabilityPoolAddress, amount);
    });

    it("returnFromPool", async () => {
      const poolAddress = await user2.getAddress();
      await debtToken.mint(poolAddress, 1000);
      const receiver = await user1.getAddress();
      const amount = 123;

      await expect(debtToken.returnFromPool(poolAddress, receiver, amount)).to.be.revertedWith("Debt: Caller not TM/SP");

      const poolBeforeBalance = await balanceOf(poolAddress);
      const receiverBeforeBalance = await balanceOf(receiver);
      const tx = await debtToken.connect(stabilityPool).returnFromPool(poolAddress, receiver, amount);
      const poolAfterBalance = await balanceOf(poolAddress);
      const receiverAfterBalance = await balanceOf(receiver);

      expect(poolBeforeBalance.sub(poolAfterBalance)).to.be.equal(amount);
      expect(receiverAfterBalance.sub(receiverBeforeBalance)).to.be.equal(amount);
      await expect(tx).to.emit(debtToken, "Transfer").withArgs(poolAddress, receiver, amount);

      // enabled trove
      await debtToken.enableTroveManager(await owner.getAddress());
      const amount2 = 456;
      const poolBeforeBalance2 = await balanceOf(poolAddress);
      const receiverBeforeBalance2 = await balanceOf(receiver);
      const tx2 = await debtToken.connect(owner).returnFromPool(poolAddress, receiver, amount2);
      const poolAfterBalance2 = await balanceOf(poolAddress);
      const receiverAfterBalance2 = await balanceOf(receiver);

      expect(poolBeforeBalance2.sub(poolAfterBalance2)).to.be.equal(amount2);
      expect(receiverAfterBalance2.sub(receiverBeforeBalance2)).to.be.equal(amount2);
      await expect(tx2).to.emit(debtToken, "Transfer").withArgs(poolAddress, receiver, amount2);
    });

    it("transfer", async () => {
      const amount = 123;
      await debtToken.mint(id, 10000);

      // require check
      const message1 = "Debt: Cannot transfer tokens directly to the Debt token contract or the zero address";
      await expect(debtToken.transfer(ZERO_ADDRESS, amount)).to.be.revertedWith(message1);
      await expect(debtToken.transfer(debtToken.address, amount)).to.be.revertedWith(message1);

      const message2 = "Debt: Cannot transfer tokens directly to the StabilityPool, TroveManager or BorrowerOps";
      await expect(debtToken.transfer(stabilityPoolAddress, amount)).to.be.revertedWith(message2);
      await expect(debtToken.transfer(borrowerOperationsAddress, amount)).to.be.revertedWith(message2);
      await debtToken.enableTroveManager(id1);
      await expect(debtToken.transfer(id1, amount)).to.be.revertedWith(message2);

      // normal
      const recipient = id2;
      const senderBeforeBalance = await balanceOf(id);
      const recipientBeforeBalance = await balanceOf(recipient);
      const tx = await debtToken.transfer(recipient, amount);
      const senderAfterBalance = await balanceOf(id);
      const recipientAfterBalance = await balanceOf(recipient);

      expect(senderAfterBalance.sub(senderBeforeBalance)).to.be.equal(amount * (-1));
      expect(recipientAfterBalance.sub(recipientBeforeBalance)).to.be.equal(amount);
      await expect(tx).to.emit(debtToken, "Transfer").withArgs(id, recipient, amount);
    });

    it("transferFrom", async () => {
      await debtToken.mint(id1, 1000);
      const amount = 100;
      await debtToken.connect(user1).increaseAllowance(id, amount);

      const id1BeforeBalance = await balanceOf(id1);
      const id2BeforeBalance = await balanceOf(id2);
      const tx = await debtToken.transferFrom(id1, id2, amount);
      const id1AfterBalance = await balanceOf(id1);
      const id2AfterBalance = await balanceOf(id2);

      await expect(tx).to.emit(debtToken, "Transfer").withArgs(id1, id2, amount);
      expect(id1AfterBalance.sub(id1BeforeBalance)).to.be.equal(amount * (-1));
      expect(id2AfterBalance.sub(id2BeforeBalance)).to.be.equal(amount);
    });

    it("maxFlashLoan", async () => {
      const supply = parseEther("13789");
      await debtToken.mint(id, supply);

      expect(await debtToken.totalSupply()).to.be.equal(supply);
      const maxLoanAmount = UINT256_MAX.sub(supply);
      expect(await debtToken.maxFlashLoan(debtToken.address)).to.be.equal(maxLoanAmount);
      expect(await debtToken.maxFlashLoan(id)).to.be.equal(0);
      expect(await debtToken.maxFlashLoan(ZERO_ADDRESS)).to.be.equal(0);
    });

    it("flashFee", async () => {
      const amount = parseEther("237");
      expect(await debtToken.flashFee(debtToken.address, amount)).to.be.equal(flashFee(amount));
      expect(await debtToken.flashFee(debtToken.address, 0)).to.be.equal(0);
      expect(await debtToken.flashFee(ZERO_ADDRESS, amount)).to.be.equal(0);
    });

    it("domainSeparator", async () => {
      const separator = ethers.utils.keccak256(
        abi.encode(
          "bytes32,bytes32,bytes32,uint256,address".split(","),
          [
            ethers.utils.id("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            ethers.utils.id(tokenName),
            ethers.utils.id("1"),
            ethers.provider.network.chainId,
            debtToken.address
          ]
        )
      );
      expect(await debtToken.domainSeparator()).to.be.equal(separator);
    });

    it("permit", async () => {
      const owner = id1;
      const spender = id2;
      const deadline = (await time.latest()) + DAY;
      const amount = parseEther("137");

      // 1. invalid deadline
      // prepare time
      const now1 = await time.latest();
      const nextTime1 = now1 + 10 * 60;
      await time.setNextBlockTimestamp(nextTime1);
      // check
      const sig1 = await permit(user1, spender, amount, now1);
      const splitedSig = ethers.utils.splitSignature(sig1);
      await expect(debtToken.permit(owner, spender, amount, nextTime1 - 1, splitedSig.v, splitedSig.r, splitedSig.s)).to.be.revertedWith("Debt: expired deadline");

      // 2. valid sig
      // prepare time
      const nextTime2 = nextTime1 + 600;
      await time.setNextBlockTimestamp(nextTime2);
      const deadline2 = nextTime2 + 700;
      expect(deadline2).to.be.gte(nextTime2);
      const sig2 = await permit(user1, spender, amount, deadline2);
      const splitedSig2 = ethers.utils.splitSignature(sig2);

      const beforeAllow = await debtToken.allowance(owner, spender);
      const beforeNonce = await debtToken.nonces(owner);
      const tx = await debtToken.permit(owner, spender, amount, deadline2, splitedSig2.v, splitedSig2.r, splitedSig2.s);
      const afterAllow = await debtToken.allowance(owner, spender);
      await expect(tx).to.emit(debtToken, "Approval").withArgs(owner, spender, amount);
      expect(afterAllow.sub(beforeAllow)).to.be.equal(amount);
      expect(await debtToken.nonces(owner)).to.be.equal(beforeNonce.add(1));

      // 3. invalid sig
      await expect(debtToken.permit(owner, spender, amount, deadline, splitedSig2.v, splitedSig2.r, splitedSig2.s)).to.be.revertedWith("Debt: invalid signature");
    });

    it("flashLoan", async () => {
      const receiver = await ethers.deployContract("MockERC3156FlashBorrower", []) as MockERC3156FlashBorrower;
      const fakeData = ethers.utils.id("testData");
      const fakeReturnValue = ethers.utils.id("testValue");

      await expect(debtToken.flashLoan(receiver.address, id, 100, fakeData)).to.be.revertedWith("ERC20FlashMint: wrong token");

      const supply = parseEther("13789");
      await debtToken.mint(id, supply);
      const maxLoadAmount = UINT256_MAX.sub(supply);
      await expect(debtToken.flashLoan(receiver.address, debtToken.address, maxLoadAmount.add(1), fakeData)).to.be.revertedWith("ERC20FlashMint: amount exceeds maxFlashLoan");

      const amount = parseEther("337");
      await receiver.setReturnValue(fakeReturnValue);
      await expect(debtToken.flashLoan(receiver.address, debtToken.address, amount, fakeData)).to.be.revertedWith("ERC20FlashMint: invalid return value");

      // normal
      await receiver.setReturnValue(ERC3156_RETURN_VALUE);
      const fee = flashFee(amount);
      const feeReceiver = id2;
      await listaCore.setFeeReceiver(feeReceiver);
      await debtToken.mint(receiver.address, fee);

      const tx = await debtToken.flashLoan(receiver.address, debtToken.address, amount, fakeData);
      await expect(tx).to.emit(debtToken, "Transfer").withArgs(ZERO_ADDRESS, receiver.address, amount);
      await expect(tx).to.emit(debtToken, "Transfer").withArgs(receiver.address, ZERO_ADDRESS, amount);
      await expect(tx).to.emit(debtToken, "Transfer").withArgs(receiver.address, feeReceiver, fee);
    });
  })
})
