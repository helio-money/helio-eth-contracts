import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import { expect } from "chai";


export const upgradeCore = async (borrowerOperations: Contract, troveManager: Contract, liquidationManager: Contract, stabilityPool: Contract, priceFeed: Contract, sortedTroves: Contract) => {
    console.log("Upgrading Core...");

    let owner: Signer;
    if (hre.network.name === "hardhat") {
        const signers = await ethers.getSigners();
        owner = signers[0];
    } else if (hre.network.name === "sepolia") {
        const deployerKey = process.env.SEPOLIA_DEPLOYER_KEY || ""; // Provide a default value if undefined
        owner = new ethers.Wallet(deployerKey);
    } else {
        throw Error("Unsupported network");
    }

    console.log("Upgrading BorrowerOperations...");
    const BorrowerOperationsV2 = await ethers.getContractFactory("BorrowerOperations");
    await upgrades.validateUpgrade(borrowerOperations.target, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 implementation validated");
    const borrowerOperationsV2 = await upgrades.prepareUpgrade(borrowerOperations.target, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 implementation deployed :", borrowerOperationsV2);
    const borrowerOperationsUpgraded = await upgrades.upgradeProxy(borrowerOperations.target, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 upgraded with :", borrowerOperationsUpgraded.target);


    console.log("Upgrading TroveManager...");
    const TroveManagerV2 = await ethers.getContractFactory("TroveManager");
    await upgrades.validateUpgrade(troveManager.target, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 implementation validated");
    const troveManagerV2 = await upgrades.prepareUpgrade(troveManager.target, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 implementation deployed :", troveManagerV2);
    const troveManagerUpgraded = await upgrades.upgradeProxy(troveManager.target, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 upgraded with :", troveManagerUpgraded.target);


    console.log("Upgrading LiquidationManager...");
    const LiquidationManagerV2 = await ethers.getContractFactory("LiquidationManager");
    await upgrades.validateUpgrade(liquidationManager.target, LiquidationManagerV2);
    console.log("LiquidationManagerV2 implementation validated");
    const liquidationManagerV2 = await upgrades.prepareUpgrade(liquidationManager.target, LiquidationManagerV2);
    console.log("LiquidationManagerV2 implementation deployed :", liquidationManagerV2);
    const liquidationManagerUpgraded = await upgrades.upgradeProxy(liquidationManager.target, LiquidationManagerV2);
    console.log("LiquidationManagerV2 upgraded with :", liquidationManagerUpgraded.target);


    console.log("Upgrading StabilityPool...");
    const StabilityPoolV2 = await ethers.getContractFactory("StabilityPool");
    await upgrades.validateUpgrade(stabilityPool.target, StabilityPoolV2);
    console.log("StabilityPoolV2 implementation validated");
    const stabilityPoolV2 = await upgrades.prepareUpgrade(stabilityPool.target, StabilityPoolV2);
    console.log("StabilityPoolV2 implementation deployed :", stabilityPoolV2);
    const stabilityPoolUpgraded = await upgrades.upgradeProxy(stabilityPool.target, StabilityPoolV2);
    console.log("StabilityPoolV2 upgraded with :", stabilityPoolUpgraded.target);


    console.log("Upgrading PriceFeed...");
    const PriceFeedV2 = await ethers.getContractFactory("PriceFeed");
    await upgrades.validateUpgrade(priceFeed.target, PriceFeedV2);
    console.log("PriceFeedV2 implementation validated");
    const priceFeedV2 = await upgrades.prepareUpgrade(priceFeed.target, PriceFeedV2);
    console.log("PriceFeedV2 implementation deployed :", priceFeedV2);
    const priceFeedUpgraded = await upgrades.upgradeProxy(priceFeed.target, PriceFeedV2);
    console.log("PriceFeedV2 upgraded with :", priceFeedUpgraded.target);


    console.log("Upgrading SortedTroves...");
    const SortedTrovesV2 = await ethers.getContractFactory("SortedTroves");
    await upgrades.validateUpgrade(sortedTroves.target, SortedTrovesV2);
    console.log("SortedTrovesV2 implementation validated");
    const sortedTrovesV2 = await upgrades.prepareUpgrade(sortedTroves.target, SortedTrovesV2);
    console.log("SortedTrovesV2 implementation deployed :", sortedTrovesV2);
    const sortedTrovesUpgraded = await upgrades.upgradeProxy(sortedTroves.target, SortedTrovesV2);
    console.log("SortedTrovesV2 upgraded with :", sortedTrovesUpgraded.target);
}