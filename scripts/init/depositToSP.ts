import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import hre, { ethers } from "hardhat";
import { Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";

const addresses = DEPLOYED_ADDRESSES[11155111];

export const depositToSP = async () => {
  let signer: Signer;
  if (hre.network.name === "hardhat") {
    const signers = await ethers.getSigners();
    signer = signers[0];
  } else if (hre.network.name === "sepolia") {
    const userKey = process.env.SEPOLIA_DEPLOYER_KEY || ""; // Provide a default value if undefined
    signer = new ethers.Wallet(userKey);
  } else {
    throw Error("Unsupported network");
  }
  const stabilityPool = await ethers.getContractAt("StabilityPool", addresses.StabilityPool);

  const tx = await stabilityPool.provideToSP(100);

  console.log("Deposit to SP done...", tx.hash);
}

export const withdrawFromSP = async () => {
  let signer: Signer;
  if (hre.network.name === "hardhat") {
    const signers = await ethers.getSigners();
    signer = signers[0];
  } else if (hre.network.name === "sepolia") {
    const userKey = process.env.SEPOLIA_DEPLOYER_KEY || ""; // Provide a default value if undefined
    signer = new ethers.Wallet(userKey);
  } else {
    throw Error("Unsupported network");
  }
  const stabilityPool = await ethers.getContractAt("StabilityPool", addresses.StabilityPool);

  const tx = await stabilityPool.withdrawFromSP(100);
  console.log("Withdraw from SP done...", tx.hash);
}
