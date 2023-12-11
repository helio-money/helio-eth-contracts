import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";
import {
  InternalLiquidationManager,
  MockBorrowerOperations,
  MockSortedTroves,
  MockTroveManager
} from "../../../../typechain-types";
import { parseEther } from "ethers/lib/utils";
import { expect } from "chai";
import {
  _1E18,
  abi,
  applyLiquidationValuesToTotals,
  gasCompensation,
  initTotalsParam,
  liquidateNormalMode,
  liquidateWithoutSP,
  min,
  PERCENT_DIVISOR,
  tryLiquidateWithCap,
  ZERO
} from "../../utils";

describe("LiquidationManager", () => {
  let stabilityPool: Contract;
  let borrowOperations: MockBorrowerOperations;
  let factory: string;
  let sortedTroves: MockSortedTroves;
  let troveManager: MockTroveManager;
  let liquidationManager: InternalLiquidationManager;

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  let id: string;
  let id1: string;
  let id2: string;
  let id3: string;
  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();
    [id, id1, id2, id3] = [await owner.getAddress(), await user1.getAddress(), await user2.getAddress(), await user3.getAddress()];

    stabilityPool = await ethers.deployContract("MockStabilityPool", []);
    borrowOperations = await ethers.deployContract("MockBorrowerOperations", []) as MockBorrowerOperations;

    sortedTroves = await ethers.deployContract("MockSortedTroves", []) as MockSortedTroves;
    await sortedTroves.deployed();

    troveManager = await ethers.deployContract("MockTroveManager", []) as MockTroveManager;
    await troveManager.setSortedTroves(sortedTroves.address);

    factory = await owner.getAddress();
    liquidationManager = await ethers.deployContract("InternalLiquidationManager", [
      stabilityPool.address,
      borrowOperations.address,
      factory,
      gasCompensation
    ]) as InternalLiquidationManager;
    await liquidationManager.deployed();
  })

  const isTroveManagerEnabled = async (addr: string) => {
    let pos = ethers.utils.solidityKeccak256(["uint256", "uint256"], [addr, 0]);
    let data = await ethers.provider.getStorageAt(liquidationManager.address, pos);
    return abi.decode(["bool"], data)[0];
  }

  describe("Deployment", () => {
    it("Should OK after deployment", async () => {
      expect(await liquidationManager.DEBT_GAS_COMPENSATION()).to.be.equal(gasCompensation);
      expect(await liquidationManager.stabilityPool()).to.be.equal(stabilityPool.address);
      expect(await liquidationManager.borrowerOperations()).to.be.equal(borrowOperations.address);
      expect(await liquidationManager.factory()).to.be.equal(factory);
    })
  })

  describe("Functions", () => {
    it("enableTroveManager", async () => {
      expect(await isTroveManagerEnabled(troveManager.address)).to.be.false;
      await liquidationManager.enableTroveManager(troveManager.address);
      expect(await isTroveManagerEnabled(troveManager.address)).to.be.true;

      await expect(liquidationManager.connect(user1).enableTroveManager(troveManager.address)).to.be.revertedWith("Not factory");
    });

    it("_applyLiquidationValuesToTotals", async () => {
      const totals = {
        totalCollInSequence: 1,
        totalDebtInSequence: 2,
        totalCollGasCompensation: 3,
        totalDebtGasCompensation: 4,
        totalDebtToOffset: 5,
        totalCollToSendToSP: 6,
        totalDebtToRedistribute: 7,
        totalCollToRedistribute: 8,
        totalCollSurplus: 9
      };
      const singleLiquidation = {
        entireTroveDebt: 10,
        entireTroveColl: 11,
        collGasCompensation: 12,
        debtGasCompensation: 13,
        debtToOffset: 14,
        collToSendToSP: 15,
        debtToRedistribute: 16,
        collToRedistribute: 17,
        collSurplus: 18
      };

      const result = await liquidationManager.applyLiquidationValuesToTotals(totals, singleLiquidation);

      expect(result.totalCollGasCompensation).to.be.equal(totals.totalCollGasCompensation + singleLiquidation.collGasCompensation);
      expect(result.totalDebtGasCompensation).to.be.equal(totals.totalDebtGasCompensation + singleLiquidation.debtGasCompensation);
      expect(result.totalDebtInSequence).to.be.equal(totals.totalDebtInSequence + singleLiquidation.entireTroveDebt);
      expect(result.totalCollInSequence).to.be.equal(totals.totalCollInSequence + singleLiquidation.entireTroveColl);
      expect(result.totalDebtToOffset).to.be.equal(totals.totalDebtToOffset + singleLiquidation.debtToOffset);
      expect(result.totalCollToSendToSP).to.be.equal(totals.totalCollToSendToSP + singleLiquidation.collToSendToSP);
      expect(result.totalDebtToRedistribute).to.be.equal(totals.totalDebtToRedistribute + singleLiquidation.debtToRedistribute);
      expect(result.totalCollToRedistribute).to.be.equal(totals.totalCollToRedistribute + singleLiquidation.collToRedistribute);
      expect(result.totalCollSurplus).to.be.equal(totals.totalCollSurplus + singleLiquidation.collSurplus);
    });

    it("_getOffsetAndRedistributionVals when sunsetting", async () => {
      const coll = parseEther("1000");
      const debt = parseEther("100");

      const result = await liquidationManager.getOffsetAndRedistributionVals(debt, coll, 0, true);

      expect(result.debtToOffset).to.be.equal(0);
      expect(result.collToSendToSP).to.be.equal(0);
      expect(result.debtToRedistribute).to.be.equal(debt);
      expect(result.collToRedistribute).to.be.equal(coll);
    });

    it("_getOffsetAndRedistributionVals when not sunsetting", async () => {
      const coll = parseEther("1000");
      const debt = parseEther("100");
      const debtInStabilityPool = parseEther("88");

      const result = await liquidationManager.getOffsetAndRedistributionVals(debt, coll, debtInStabilityPool, false);

      const debtToOffset = min(debt, debtInStabilityPool);
      const debtToRedistribute = debt.sub(debtToOffset);
      const collToSP = coll.mul(debtToOffset).div(debt);
      const collToRedistribute = coll.sub(collToSP);

      expect(debtInStabilityPool).to.be.gt(0);
      expect(result.debtToOffset).to.be.equal(debtToOffset);
      expect(result.collToSendToSP).to.be.equal(collToSP);
      expect(result.debtToRedistribute).to.be.equal(debtToRedistribute);
      expect(result.collToRedistribute).to.be.equal(collToRedistribute);
    });

    it("_liquidateNormalMode", async () => {
      const debt = parseEther("100");
      const debtInSP = parseEther("150");

      const account = await owner.getAddress();
      const pendingCollReward = parseEther("10");
      const pendingDebtReward = parseEther("5");
      await troveManager.setPendingRewards(pendingCollReward, pendingDebtReward);
      const trove = { debt: parseEther("20"), coll: parseEther("300") };
      await troveManager.setUserTrove(account, trove.coll, trove.debt);

      const entireTroveColl = trove.coll.add(pendingCollReward);
      const entireTroveDebt = trove.debt.add(pendingDebtReward);
      const collGasCompensation = entireTroveColl.div(PERCENT_DIVISOR);
      const collToLiquidate = entireTroveColl.sub(collGasCompensation);
      const collToSP = collToLiquidate.mul(debt).div(debt);

      // check
      const result = await liquidationManager.callStatic.liquidateNormalMode(troveManager.address, account, debt, false);

      expect(result.entireTroveColl).to.be.equal(entireTroveColl);
      expect(result.collGasCompensation).to.be.equal(collGasCompensation);
      expect(result.collToSendToSP).to.be.equal(collToSP);
      expect(result.collToRedistribute).to.be.equal(collToLiquidate.sub(collToSP));
      expect(result.collSurplus).to.be.equal(0);

      expect(result.entireTroveDebt).to.be.equal(entireTroveDebt);
      expect(result.debtGasCompensation).to.be.equal(gasCompensation);
      expect(result.debtToOffset).to.be.equal(min(entireTroveDebt, debtInSP));
      expect(result.debtToRedistribute).to.be.equal(entireTroveDebt.sub(min(entireTroveDebt, debtInSP)));
    });

    it("_liquidateWithoutSP", async () => {
      const account = await owner.getAddress();
      const pendingCollReward = parseEther("10");
      const pendingDebtReward = parseEther("5");
      await troveManager.setPendingRewards(pendingCollReward, pendingDebtReward);
      const trove = { debt: parseEther("20"), coll: parseEther("300") };
      await troveManager.setUserTrove(account, trove.coll, trove.debt);

      const entireTroveColl = trove.coll.add(pendingCollReward);
      const entireTroveDebt = trove.debt.add(pendingDebtReward);
      const collGasCompensation = entireTroveColl.div(PERCENT_DIVISOR);
      const collToLiquidate = entireTroveColl.sub(collGasCompensation);

      const result = await liquidationManager.callStatic.liquidateWithoutSP(troveManager.address, account);

      expect(result.entireTroveColl).to.be.equal(entireTroveColl);
      expect(result.collGasCompensation).to.be.equal(collGasCompensation);
      expect(result.collToSendToSP).to.be.equal(0);
      expect(result.collToRedistribute).to.be.equal(collToLiquidate);
      expect(result.collSurplus).to.be.equal(0);

      expect(result.entireTroveDebt).to.be.equal(entireTroveDebt);
      expect(result.debtGasCompensation).to.be.equal(gasCompensation);
      expect(result.debtToOffset).to.be.equal(0);
      expect(result.debtToRedistribute).to.be.equal(entireTroveDebt);
    });

    it("_tryLiquidateWithCap", async () => {
      const account = await owner.getAddress();
      const debtInSP = parseEther("150");
      const pendingCollReward = parseEther("10");
      const pendingDebtReward = parseEther("5");

      await troveManager.setPendingRewards(pendingCollReward, pendingDebtReward);
      const trove = { debt: parseEther("20"), coll: parseEther("300") };
      await troveManager.setUserTrove(account, trove.coll, trove.debt);

      const entireTroveColl = trove.coll.add(pendingCollReward);
      const entireTroveDebt = trove.debt.add(pendingDebtReward);

      // 1. entireTroveDebt <= DebtInSP
      const MCR1 = parseEther("0.15");
      const price1 = parseEther("0.2");
      const collToOffset1 = entireTroveDebt.mul(MCR1).div(price1);
      const collGasCompensation1 = collToOffset1.div(PERCENT_DIVISOR);
      const collToSurplus = entireTroveColl.sub(collToOffset1);

      expect(collToSurplus).to.be.gt(0);
      expect(entireTroveDebt).to.be.lte(debtInSP);

      const result1 = await liquidationManager.callStatic.tryLiquidateWithCap(troveManager.address, account, debtInSP, MCR1, price1);
      expect(result1.entireTroveColl).to.be.equal(entireTroveColl);
      expect(result1.collGasCompensation).to.be.equal(collGasCompensation1);
      expect(result1.collToSendToSP).to.be.equal(collToOffset1.sub(collGasCompensation1));
      expect(result1.collToRedistribute).to.be.equal(0);
      expect(result1.collSurplus).to.be.equal(entireTroveColl.sub(collToOffset1));

      expect(result1.entireTroveDebt).to.be.equal(entireTroveDebt);
      expect(result1.debtGasCompensation).to.be.equal(gasCompensation);
      expect(result1.debtToOffset).to.be.equal(entireTroveDebt);
      expect(result1.debtToRedistribute).to.be.equal(0);

      // 2. entireTroveDebt > DebtInSP
      const debtInSP2 = parseEther("20");
      expect(entireTroveDebt).to.be.gt(debtInSP2);

      const result2 = await liquidationManager.callStatic.tryLiquidateWithCap(troveManager.address, account, debtInSP2, MCR1, price1);
      expect(result2.entireTroveColl).to.be.equal(0);
      expect(result2.collGasCompensation).to.be.equal(0);
      expect(result2.collToSendToSP).to.be.equal(0);
      expect(result2.collToRedistribute).to.be.equal(0);
      expect(result2.collSurplus).to.be.equal(0);
      expect(result2.entireTroveDebt).to.be.equal(0);
      expect(result2.debtGasCompensation).to.be.equal(0);
      expect(result2.debtToOffset).to.be.equal(0);
      expect(result2.debtToRedistribute).to.be.equal(0);
    });

    it("liquidateTroves with sunsetting = false", async () => {
      const maxICR = parseEther("1.4");
      const totalDebtInSP = parseEther("300");
      await stabilityPool.setTotalDebt(totalDebtInSP);

      await expect(liquidationManager.liquidateTroves(troveManager.address, 2, maxICR)).to.be.revertedWith("TroveManager not approved")

      await liquidationManager.enableTroveManager(troveManager.address);
      await expect(liquidationManager.liquidateTroves(troveManager.address, 2, maxICR)).to.be.revertedWith("TroveManager: nothing to liquidate");

      await troveManager.setTroveOwnersCount(2);
      const MCR = parseEther("1.1");
      await troveManager.setMCR(MCR);
      let ICR = parseEther("1.5");
      await troveManager.setICR(id, ICR);
      await troveManager.setICR(id1, parseEther("0.12"));
      await sortedTroves.setLast(id);
      // ICR > maxICR
      expect(ICR).to.be.gt(maxICR);
      await expect(liquidationManager.liquidateTroves(troveManager.address, 100, maxICR)).to.be.revertedWith("TroveManager: nothing to liquidate");

      // ICR <= maxICR
      const trove = { debt: parseEther("20"), coll: parseEther("300") };
      await troveManager.setUserTrove(id, trove.coll, trove.debt);
      const pendingCollReward = parseEther("10");
      const pendingDebtReward = parseEther("5");
      await troveManager.setPendingRewards(pendingCollReward, pendingDebtReward);
      ICR = parseEther("0.1");
      await troveManager.setICR(id, ICR);

      let entireDebt = trove.debt.add(pendingDebtReward);
      let entireColl = trove.coll.add(pendingCollReward);
      const collGasCompensation = entireColl.div(PERCENT_DIVISOR);

      expect(ICR).to.be.lte(maxICR);
      const tx1 = await liquidationManager.liquidateTroves(troveManager.address, 100, maxICR);
      await expect(tx1).to.emit(liquidationManager, "Liquidation")
        .withArgs(entireDebt, entireColl.sub(collGasCompensation).sub(0), collGasCompensation, gasCompensation);

      // 100% < ICR < MCR
      ICR = parseEther("1.05");
      await troveManager.setICR(id, ICR);
      expect(ICR).to.be.lt(MCR);
      const tx2 = await liquidationManager.liquidateTroves(troveManager.address, 100, maxICR);
      await expect(tx2).to.emit(liquidationManager, "Liquidation")
        .withArgs(entireDebt, entireColl.sub(collGasCompensation).sub(0), collGasCompensation, gasCompensation);

      // MCR <= ICR
      ICR = parseEther("1.2");
      await troveManager.setICR(id, ICR);
      expect(ICR).to.be.lte(maxICR);
      expect(ICR).to.be.gte(MCR);
      const globalSysPricedColl = BigNumber.from("1856399999999999908567389094712105238528");
      const globalSysDebt = parseEther("1428");
      await borrowOperations.setGlobalSystemBalances(globalSysPricedColl, globalSysDebt);
      const CCR = parseEther("1.5");
      const TCR = globalSysPricedColl.div(globalSysDebt);

      expect(ICR).to.be.lt(TCR);
      expect(TCR).to.be.lt(CCR);

      const price = parseEther("0.11");
      await troveManager.setPrice(price);
      const singleLiquidation = await tryLiquidateWithCap(troveManager, id, totalDebtInSP, MCR, price);

      const tx3 = await liquidationManager.liquidateTroves(troveManager.address, 100, maxICR);
      await expect(tx3).to.emit(liquidationManager, "Liquidation")
        .withArgs(
          entireDebt,
          singleLiquidation.entireTroveColl.sub(singleLiquidation.collGasCompensation).sub(singleLiquidation.collSurplus),
          singleLiquidation.collGasCompensation,
          gasCompensation
        );
    });

    it("batchLiquidateTroves and liquidate", async () => {
      await expect(liquidationManager.batchLiquidateTroves(troveManager.address, [])).to.be.revertedWith("TroveManager not approved");
      await liquidationManager.enableTroveManager(troveManager.address);
      await expect(liquidationManager.batchLiquidateTroves(troveManager.address, [])).to.be.revertedWith("TroveManager: Calldata address array must not be empty");
      const troveArray = [id, id1];
      await expect(liquidationManager.batchLiquidateTroves(troveManager.address, troveArray)).to.be.revertedWith("TroveManager: nothing to liquidate");

      const totalDebtInSP = parseEther("5000");
      await stabilityPool.setTotalDebt(totalDebtInSP);
      const price = parseEther("0.11");
      await troveManager.setPrice(price);
      await troveManager.setTroveOwnersCount(2);
      let ICR = parseEther("1");
      await troveManager.setICR(id, ICR);
      const trove = { debt: parseEther("20"), coll: parseEther("300") };
      await troveManager.setUserTrove(id, trove.coll, trove.debt);
      const pendingCollReward = parseEther("10");
      const pendingDebtReward = parseEther("5");
      await troveManager.setPendingRewards(pendingCollReward, pendingDebtReward);

      // 1. ICR <= 100%
      expect(ICR).to.be.lte(_1E18);
      const singleLiqParam = await liquidateWithoutSP(troveManager, id);
      const totalsParam = initTotalsParam();
      await applyLiquidationValuesToTotals(totalsParam, singleLiqParam);
      const tx = await liquidationManager.batchLiquidateTroves(troveManager.address, troveArray);
      await expect(tx).to.emit(liquidationManager, "Liquidation")
        .withArgs(
          totalsParam.totalDebtInSequence,
          totalsParam.totalCollInSequence.sub(totalsParam.totalCollGasCompensation).sub(totalsParam.totalCollSurplus),
          totalsParam.totalCollGasCompensation,
          totalsParam.totalDebtGasCompensation
        );
      await expect(liquidationManager.liquidate(troveManager.address, id)).to.be.not.reverted;
      await expect(liquidationManager.connect(user2).liquidate(troveManager.address, id1)).to.be.revertedWith("TroveManager: Trove does not exist or is closed");

      // 2. 100% < ICR < MCR
      const sunsetting = false;
      const MCR = parseEther("1.1");
      await troveManager.setMCR(MCR);
      ICR = parseEther("1.004");
      await troveManager.setICR(id, ICR);
      expect(await troveManager.getCurrentICR(id, ZERO)).to.be.gt(_1E18);
      expect(await troveManager.getCurrentICR(id, ZERO)).to.be.lt(MCR);

      let singleLiqParam2 = await liquidateNormalMode(troveManager, id, totalDebtInSP, sunsetting);
      const totals2 = initTotalsParam();
      await applyLiquidationValuesToTotals(totals2, singleLiqParam2);

      const tx2 = await liquidationManager.batchLiquidateTroves(troveManager.address, troveArray);
      await expect(tx2).to.emit(liquidationManager, "Liquidation")
        .withArgs(
          totals2.totalDebtInSequence,
          totals2.totalCollInSequence.sub(totals2.totalCollGasCompensation).sub(totals2.totalCollSurplus),
          totals2.totalCollGasCompensation,
          totals2.totalDebtGasCompensation
        );

      // 3. ICR >= MCR
      ICR = MCR.add(1);
      await troveManager.setICR(id, ICR);
      await troveManager.setICR(id1, MCR.sub(parseEther("0.01")));
      await troveManager.setICR(id2, _1E18.sub(1));
      await troveManager.setICR(id3, _1E18);
      // await troveManager.setICR(id4, MCR);
      await troveManager.setTroveOwnersCount(4);
      const globalSysPricedColl = BigNumber.from("1856399999999999908567389094712105238528");
      const globalSysDebt = parseEther("1428");
      await borrowOperations.setGlobalSystemBalances(globalSysPricedColl, globalSysDebt);
      expect(await troveManager.getCurrentICR(id, ZERO)).to.be.gte(MCR);

      let totalDebtInSP2 = totalDebtInSP;
      let totals3 = initTotalsParam();
      await stabilityPool.setTotalDebt(totalDebtInSP2);
      const singleLiq1 = await tryLiquidateWithCap(troveManager, id, totalDebtInSP2, MCR, price);
      totalDebtInSP2 = totalDebtInSP2.sub(singleLiq1.debtToOffset);
      // console.log(111, singleLiq1.debtToOffset);
      applyLiquidationValuesToTotals(totals3, singleLiq1);

      const singleLiq2 = await liquidateWithoutSP(troveManager, id1);
      totalDebtInSP2 = totalDebtInSP2.sub(singleLiq2.debtToOffset);
      // console.log(111, singleLiq2.debtToOffset);
      applyLiquidationValuesToTotals(totals3, singleLiq2);

      const singleLiq3 = await liquidateNormalMode(troveManager, id2, totalDebtInSP2, sunsetting);
      // totalDebtInSP2 = totalDebtInSP2.sub(singleLiq3.debtToOffset);
      // console.log(111, singleLiq3.debtToOffset);
      applyLiquidationValuesToTotals(totals3, singleLiq3);
      // console.log(111, totals2)

      const tx3 = await liquidationManager.batchLiquidateTroves(troveManager.address, [id, id1, id2, id3]);
      await expect(tx3).to.emit(liquidationManager, "Liquidation")
        .withArgs(
          totals3.totalDebtInSequence,
          totals3.totalCollInSequence.sub(totals3.totalCollGasCompensation).sub(totals3.totalCollSurplus),
          totals3.totalCollGasCompensation,
          totals3.totalDebtGasCompensation
        );

      // 4. liquidate call
      // await troveManager.setICR(id, _1E18.sub(1));
      // await borrowOperations.setGlobalSystemBalances(globalSysPricedColl, globalSysDebt);
      // await troveManager.setTroveOwnersCount(1);
      // const tx4 = await liquidationManager.liquidate(troveManager.address, id);

    });
  })
});
