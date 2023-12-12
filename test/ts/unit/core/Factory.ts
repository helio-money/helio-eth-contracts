import { ethers } from "hardhat";
import {
  Factory,
  InternalLiquidationManager,
  MockBorrowerOperations,
  MockDebtToken,
  MockListaCore,
  MockSortedTroves,
  MockStabilityPool,
  MockTroveManager
} from "../../../../typechain-types";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { abi, gasCompensation, isTroveManagerEnabled, ZERO_ADDRESS } from "../../utils";
import { parseEther } from "ethers/lib/utils";

describe("Factory", () => {
  let listaCore: MockListaCore;
  let stabilityPool: MockStabilityPool;
  let borrowerOperations: MockBorrowerOperations;
  let sortedTroves: MockSortedTroves;
  let troveManager: MockTroveManager;
  let liquidationManager: InternalLiquidationManager;
  let factory: Factory;
  let debtToken: MockDebtToken;

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    listaCore = await ethers.deployContract("MockListaCore", []) as MockListaCore;
    await listaCore.deployed();
    await listaCore.setOwner(await owner.getAddress());
    const startTime = await time.latest();
    await listaCore.setStartTime(startTime);

    debtToken = await ethers.deployContract("MockDebtToken", ["debt", "DEBT"]) as MockDebtToken;
    await debtToken.deployed();

    troveManager = await ethers.deployContract("MockTroveManager", []) as MockTroveManager;
    await troveManager.deployed();

    sortedTroves = await ethers.deployContract("MockSortedTroves", []) as MockSortedTroves;
    await sortedTroves.deployed();

    stabilityPool = await ethers.deployContract("MockStabilityPool", []) as MockStabilityPool;
    await stabilityPool.deployed();

    borrowerOperations = await ethers.deployContract("MockBorrowerOperations", []) as MockBorrowerOperations;
    await borrowerOperations.deployed();

    factory = await ethers.deployContract("Factory", [
      listaCore.address,
      debtToken.address,
      stabilityPool.address,
      borrowerOperations.address,
      sortedTroves.address,
      troveManager.address,
      ZERO_ADDRESS
    ]) as Factory;
    await factory.deployed();

    liquidationManager = await ethers.deployContract("InternalLiquidationManager", [
      stabilityPool.address,
      borrowerOperations.address,
      factory.address,
      gasCompensation
    ]) as InternalLiquidationManager;
    await liquidationManager.deployed();
    await factory.setLiquidationManager(liquidationManager.address);
  })

  const createTroveManager = async (price: BigNumber) => {
    let contract = await ethers.deployContract("MockTroveManager", []) as MockTroveManager;
    await contract.deployed();
    await contract.setPrice(price);
    return contract;
  }

  const createSortedTroves = async () => {
    let contract = await ethers.deployContract("MockSortedTroves", []) as MockSortedTroves;
    await contract.deployed();
    return contract;
  }

  const createDeployParams = () => {
    return {
      minuteDecayFactor: "999037758833783000",
      redemptionFeeFloor: parseEther("2"),
      maxRedemptionFee: parseEther("0.9"),
      borrowingFeeFloor: parseEther("0.006"),
      maxBorrowingFee: parseEther("0.002"),
      interestRateInBps: 100,
      maxDebt: parseEther("1000"),
      MCR: parseEther("1.5"),
    };
  }

  const getNewDeploymentEventParameters = async (txHash: string) => {
    const eventId = ethers.utils.id("NewDeployment(address,address,address,address)");
    const receipt = await ethers.provider.getTransactionReceipt(txHash);
    const logs = receipt.logs.filter(e => e.topics[0] === eventId);
    expect(logs.length).to.be.equal(1);
    const log = logs[0];
    const data = abi.decode("address,address,address,address".split(","), log.data);
    return {
      collateral: data[0],
      priceFeed: data[1],
      troveManager: data[2],
      sortedTroves: data[3]
    };
  }

  describe("Deployment", () => {
    it("Should OK after deployment", async () => {
      expect(await factory.LISTA_CORE()).to.be.equal(listaCore.address);
      expect(await factory.debtToken()).to.be.equal(debtToken.address);
      expect(await factory.stabilityPool()).to.be.equal(stabilityPool.address);
      expect(await factory.borrowerOperations()).to.be.equal(borrowerOperations.address);
      expect(await factory.liquidationManager()).to.be.equal(liquidationManager.address);
      expect(await factory.sortedTrovesImpl()).to.be.equal(sortedTroves.address);
      expect(await factory.troveManagerImpl()).to.be.equal(troveManager.address);
    });
  })

  describe("Functions", () => {
    it("owner check", async () => {
      const fakeAddress = await user3.getAddress();
      await expect(factory.connect(user1).setDebtToken(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(factory.connect(user1).setStabilityPool(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(factory.connect(user1).setBorrowerOperations(fakeAddress)).to.be.revertedWith("Only owner");
      await expect(factory.connect(user1).setLiquidationManager(fakeAddress)).to.be.revertedWith("Only owner");
    });

    it("setImplementations", async () => {
      const fakeTroveManager = "0x3AC225168DF54212A25c1c01fd35bEBFea408FdA";
      const fakeSortedTroves = "0xb5553de315E0EDF504D9150af82DAfa5C4667Fa6";

      expect(await listaCore.owner()).to.be.not.equal(await user1.getAddress());
      await expect(factory.connect(user1).setImplementations(fakeTroveManager, fakeSortedTroves)).to.be.revertedWith("Only owner");

      await factory.setImplementations(fakeTroveManager, fakeSortedTroves);
      expect(await factory.troveManagerImpl()).to.be.equal(fakeTroveManager);
      expect(await factory.sortedTrovesImpl()).to.be.equal(fakeSortedTroves);
    });

    it("deployNewInstance using default impls", async () => {
      const collToken = await ethers.deployContract("MockDebtToken", ["coll", "COLL"]) as MockDebtToken;
      await collToken.deployed();
      const fakePriceFeed = "0x0dd34c1993C76a361b071bA90e44dc515B5dF324";

      const deploymentParams = createDeployParams();
      await expect(factory.connect(user1).deployNewInstance(
        collToken.address,
        fakePriceFeed,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        deploymentParams
      )).to.be.revertedWith("Only owner");
      const tx = await factory.deployNewInstance(
        collToken.address,
        fakePriceFeed,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        deploymentParams
      );
      const eventParams = await getNewDeploymentEventParameters(tx.hash);
      await expect(tx).to.emit(factory, "NewDeployment")
        .withArgs(eventParams.collateral, eventParams.priceFeed, eventParams.troveManager, eventParams.sortedTroves);
      expect(await factory.troveManagerCount()).to.be.equal(1);
      expect(await factory.troveManagers(0)).to.be.equal(eventParams.troveManager);

      const createdTroveManager = await ethers.getContractAt("MockTroveManager", eventParams.troveManager, owner);
      expect(await createdTroveManager.priceFeedAddress()).to.be.equal(fakePriceFeed);
      expect(await createdTroveManager.sortedTrovesAddress()).to.be.equal(eventParams.sortedTroves);
      expect(await createdTroveManager.collToken()).to.be.equal(eventParams.collateral);
      expect(await createdTroveManager.minuteDecayFactor()).to.be.equal(deploymentParams.minuteDecayFactor);
      expect(await createdTroveManager.redemptionFeeFloor()).to.be.equal(deploymentParams.redemptionFeeFloor);
      expect(await createdTroveManager.maxRedemptionFee()).to.be.equal(deploymentParams.maxRedemptionFee);
      expect(await createdTroveManager.borrowingFeeFloor()).to.be.equal(deploymentParams.borrowingFeeFloor);
      expect(await createdTroveManager.maxBorrowingFee()).to.be.equal(deploymentParams.maxBorrowingFee);
      expect(await createdTroveManager.interestRateInBPS()).to.be.equal(deploymentParams.interestRateInBps);
      expect(await createdTroveManager.maxSystemDebt()).to.be.equal(deploymentParams.maxDebt);
      expect(await createdTroveManager.MCR()).to.be.equal(deploymentParams.MCR);

      const createdSortedTroves = await ethers.getContractAt("MockSortedTroves", eventParams.sortedTroves, owner);
      expect(await createdSortedTroves.troveManager()).to.be.equal(createdTroveManager.address);

      expect(await stabilityPool.enabledColls(collToken.address)).to.be.true;
      expect(await isTroveManagerEnabled(liquidationManager.address, createdTroveManager.address)).to.be.true;
      expect(await debtToken.enabledTroveManagers(createdTroveManager.address)).to.be.true;
      expect(await borrowerOperations.managerToCollateral(createdTroveManager.address)).to.be.equal(collToken.address);
    });

    it("deployNewInstance using provided impls", async () => {
      const collToken = await ethers.deployContract("MockDebtToken", ["coll", "COLL"]) as MockDebtToken;
      await collToken.deployed();
      const fakePriceFeed = "0x0dd34c1993C76a361b071bA90e44dc515B5dF324";

      const deploymentParams = createDeployParams();
      const tx = await factory.deployNewInstance(
        collToken.address,
        fakePriceFeed,
        (await createTroveManager(parseEther("10"))).address,
        (await createSortedTroves()).address,
        deploymentParams
      );
      const eventParams = await getNewDeploymentEventParameters(tx.hash);
      await expect(tx).to.emit(factory, "NewDeployment")
        .withArgs(eventParams.collateral, eventParams.priceFeed, eventParams.troveManager, eventParams.sortedTroves);
      expect(await factory.troveManagerCount()).to.be.equal(1);
      expect(await factory.troveManagers(0)).to.be.equal(eventParams.troveManager);

      const createdTroveManager = await ethers.getContractAt("MockTroveManager", eventParams.troveManager, owner);
      expect(await createdTroveManager.priceFeedAddress()).to.be.equal(fakePriceFeed);
      expect(await createdTroveManager.sortedTrovesAddress()).to.be.equal(eventParams.sortedTroves);
      expect(await createdTroveManager.collToken()).to.be.equal(eventParams.collateral);
      expect(await createdTroveManager.minuteDecayFactor()).to.be.equal(deploymentParams.minuteDecayFactor);
      expect(await createdTroveManager.redemptionFeeFloor()).to.be.equal(deploymentParams.redemptionFeeFloor);
      expect(await createdTroveManager.maxRedemptionFee()).to.be.equal(deploymentParams.maxRedemptionFee);
      expect(await createdTroveManager.borrowingFeeFloor()).to.be.equal(deploymentParams.borrowingFeeFloor);
      expect(await createdTroveManager.maxBorrowingFee()).to.be.equal(deploymentParams.maxBorrowingFee);
      expect(await createdTroveManager.interestRateInBPS()).to.be.equal(deploymentParams.interestRateInBps);
      expect(await createdTroveManager.maxSystemDebt()).to.be.equal(deploymentParams.maxDebt);
      expect(await createdTroveManager.MCR()).to.be.equal(deploymentParams.MCR);

      const createdSortedTroves = await ethers.getContractAt("MockSortedTroves", eventParams.sortedTroves, owner);
      expect(await createdSortedTroves.troveManager()).to.be.equal(createdTroveManager.address);

      expect(await stabilityPool.enabledColls(collToken.address)).to.be.true;
      expect(await isTroveManagerEnabled(liquidationManager.address, createdTroveManager.address)).to.be.true;
      expect(await debtToken.enabledTroveManagers(createdTroveManager.address)).to.be.true;
      expect(await borrowerOperations.managerToCollateral(createdTroveManager.address)).to.be.equal(collToken.address);
    });
  })
})
