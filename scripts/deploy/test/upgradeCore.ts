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
    await upgrades.validateUpgrade(borrowerOperations.address, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 implementation validated");
    const borrowerOperationsV2 = await upgrades.prepareUpgrade(borrowerOperations.address, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 implementation deployed :", borrowerOperationsV2);
    const borrowerOperationsUpgraded = await upgrades.upgradeProxy(borrowerOperations.address, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 upgraded with :", borrowerOperationsUpgraded.address);


    console.log("Upgrading TroveManager...");
    const TroveManagerV2 = await ethers.getContractFactory("TroveManager");
    await upgrades.validateUpgrade(troveManager.address, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 implementation validated");
    const troveManagerV2 = await upgrades.prepareUpgrade(troveManager.address, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 implementation deployed :", troveManagerV2);
    const troveManagerUpgraded = await upgrades.upgradeProxy(troveManager.address, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 upgraded with :", troveManagerUpgraded.address);


    console.log("Upgrading LiquidationManager...");
    const LiquidationManagerV2 = await ethers.getContractFactory("LiquidationManager");
    await upgrades.validateUpgrade(liquidationManager.address, LiquidationManagerV2);
    console.log("LiquidationManagerV2 implementation validated");
    const liquidationManagerV2 = await upgrades.prepareUpgrade(liquidationManager.address, LiquidationManagerV2);
    console.log("LiquidationManagerV2 implementation deployed :", liquidationManagerV2);
    const liquidationManagerUpgraded = await upgrades.upgradeProxy(liquidationManager.address, LiquidationManagerV2);
    console.log("LiquidationManagerV2 upgraded with :", liquidationManagerUpgraded.address);


    console.log("Upgrading StabilityPool...");
    const StabilityPoolV2 = await ethers.getContractFactory("StabilityPool");
    await upgrades.validateUpgrade(stabilityPool.address, StabilityPoolV2);
    console.log("StabilityPoolV2 implementation validated");
    const stabilityPoolV2 = await upgrades.prepareUpgrade(stabilityPool.address, StabilityPoolV2);
    console.log("StabilityPoolV2 implementation deployed :", stabilityPoolV2);
    const stabilityPoolUpgraded = await upgrades.upgradeProxy(stabilityPool.address, StabilityPoolV2);
    console.log("StabilityPoolV2 upgraded with :", stabilityPoolUpgraded.address);


    console.log("Upgrading PriceFeed...");
    const PriceFeedV2 = await ethers.getContractFactory("PriceFeed");
    await upgrades.validateUpgrade(priceFeed.address, PriceFeedV2);
    console.log("PriceFeedV2 implementation validated");
    const priceFeedV2 = await upgrades.prepareUpgrade(priceFeed.address, PriceFeedV2);
    console.log("PriceFeedV2 implementation deployed :", priceFeedV2);
    const priceFeedUpgraded = await upgrades.upgradeProxy(priceFeed.address, PriceFeedV2);
    console.log("PriceFeedV2 upgraded with :", priceFeedUpgraded.address);


    console.log("Upgrading SortedTroves...");
    const SortedTrovesV2 = await ethers.getContractFactory("SortedTroves");
    await upgrades.validateUpgrade(sortedTroves.address, SortedTrovesV2);
    console.log("SortedTrovesV2 implementation validated");
    const sortedTrovesV2 = await upgrades.prepareUpgrade(sortedTroves.address, SortedTrovesV2);
    console.log("SortedTrovesV2 implementation deployed :", sortedTrovesV2);
    const sortedTrovesUpgraded = await upgrades.upgradeProxy(sortedTroves.address, SortedTrovesV2);
    console.log("SortedTrovesV2 upgraded with :", sortedTrovesUpgraded.address);
}