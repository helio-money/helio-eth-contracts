import hre, { ethers, upgrades } from "hardhat";
const inquirer = require('inquirer');

async function main() {
    console.log('Lista upgradeable tool');

    let contractName = '';
    let proxyAddress = '';
    inquirer.prompt([
        {
            type: 'list',
            name: 'contract',
            message: 'Select contract to upgrade',
            choices: ['BorrowerOperations', 'TroveManager', 'LiquidationManager', 'StabilityPool', 'PriceFeed', 'SortedTroves'],
        },
    ]).then(async (name) => {
        contractName = name.contract;
        inquirer.prompt([
            {
                type: 'input',
                name: 'proxyAddress',
                message: 'Enter proxy address',
            },
            ]).then(async (proxy) => {
                proxyAddress = proxy.proxyAddress;
                console.log('Proxy address: ', proxyAddress);

                switch (contractName) {
                    case 'BorrowerOperations':
                        await upgradeBorrowerOperations(proxyAddress);
                        break;
                    case 'TroveManager':
                        await upgradeTroveManager(proxyAddress);
                        break;
                    case 'LiquidationManager':
                        await upgradeLiquidationManager(proxyAddress);
                        break;
                    case 'StabilityPool':
                        await upgradeStabilityPool(proxyAddress);
                        break;
                    case 'PriceFeed':
                        await upgradePriceFeed(proxyAddress);
                        break;
                    case 'SortedTroves':
                        await upgradeSortedTroves(proxyAddress);
                        break;
                    default:
                        console.log('Invalid contract name');
                        break;
                }
            });
    });
}

main();

const upgradeBorrowerOperations = async (proxyAddress: string) => {
    console.log("Upgrading BorrowerOperations...");
    const BorrowerOperationsV2 = await ethers.getContractFactory("BorrowerOperations");
    await upgrades.validateUpgrade(proxyAddress, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 implementation validated");
    const borrowerOperationsV2 = await upgrades.prepareUpgrade(proxyAddress, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 implementation deployed :", borrowerOperationsV2);
    const borrowerOperationsUpgraded = await upgrades.upgradeProxy(proxyAddress, BorrowerOperationsV2);
    console.log("BorrowerOperationsV2 upgraded with :", borrowerOperationsUpgraded.address);
}

const upgradeTroveManager = async (proxyAddress: string) => {
    console.log("Upgrading TroveManager...");
    const TroveManagerV2 = await ethers.getContractFactory("TroveManager");
    await upgrades.validateUpgrade(proxyAddress, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 implementation validated");
    const troveManagerV2 = await upgrades.prepareUpgrade(proxyAddress, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 implementation deployed :", troveManagerV2);
    const troveManagerUpgraded = await upgrades.upgradeProxy(proxyAddress, TroveManagerV2, { unsafeAllow: ['constructor'] });
    console.log("TroveManagerV2 upgraded with :", troveManagerUpgraded.address);
}

const upgradeLiquidationManager = async (proxyAddress: string) => {
    console.log("Upgrading LiquidationManager...");
    const LiquidationManagerV2 = await ethers.getContractFactory("LiquidationManager");
    await upgrades.validateUpgrade(proxyAddress, LiquidationManagerV2);
    console.log("LiquidationManagerV2 implementation validated");
    const liquidationManagerV2 = await upgrades.prepareUpgrade(proxyAddress, LiquidationManagerV2);
    console.log("LiquidationManagerV2 implementation deployed :", liquidationManagerV2);
    const liquidationManagerUpgraded = await upgrades.upgradeProxy(proxyAddress, LiquidationManagerV2);
    console.log("LiquidationManagerV2 upgraded with :", liquidationManagerUpgraded.address);
}

const upgradeStabilityPool = async (proxyAddress: string) => {
    console.log("Upgrading StabilityPool...");
    const StabilityPoolV2 = await ethers.getContractFactory("StabilityPool");
    await upgrades.validateUpgrade(proxyAddress, StabilityPoolV2);
    console.log("StabilityPoolV2 implementation validated");
    const stabilityPoolV2 = await upgrades.prepareUpgrade(proxyAddress, StabilityPoolV2);
    console.log("StabilityPoolV2 implementation deployed :", stabilityPoolV2);
    const stabilityPoolUpgraded = await upgrades.upgradeProxy(proxyAddress, StabilityPoolV2);
    console.log("StabilityPoolV2 upgraded with :", stabilityPoolUpgraded.address);
}

const upgradePriceFeed = async (proxyAddress: string) => {
    console.log("Upgrading PriceFeed...");
    const PriceFeedV2 = await ethers.getContractFactory("PriceFeed");
    await upgrades.validateUpgrade(proxyAddress, PriceFeedV2);
    console.log("PriceFeedV2 implementation validated");
    const priceFeedV2 = await upgrades.prepareUpgrade(proxyAddress, PriceFeedV2);
    console.log("PriceFeedV2 implementation deployed :", priceFeedV2);
    const priceFeedUpgraded = await upgrades.upgradeProxy(proxyAddress, PriceFeedV2);
    console.log("PriceFeedV2 upgraded with :", priceFeedUpgraded.address);
}

const upgradeSortedTroves = async (proxyAddress: string) => {
    console.log("Upgrading SortedTroves...");
    const SortedTrovesV2 = await ethers.getContractFactory("SortedTroves");
    await upgrades.validateUpgrade(proxyAddress, SortedTrovesV2);
    console.log("SortedTrovesV2 implementation validated");
    const sortedTrovesV2 = await upgrades.prepareUpgrade(proxyAddress, SortedTrovesV2);
    console.log("SortedTrovesV2 implementation deployed :", sortedTrovesV2);
    const sortedTrovesUpgraded = await upgrades.upgradeProxy(proxyAddress, SortedTrovesV2);
    console.log("SortedTrovesV2 upgraded with :", sortedTrovesUpgraded.address);
}