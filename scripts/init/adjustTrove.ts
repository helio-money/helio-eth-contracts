import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import hre, { ethers } from "hardhat";
import { Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";

const addresses = DEPLOYED_ADDRESSES[11155111];

export const adjustTrove = async () => {
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

  const factory = await ethers.getContractAt("Factory", addresses.Factory);
  const troveManager = await factory.troveManagers(0);
  const borrowOperations = await ethers.getContractAt(
    "BorrowerOperations",
    addresses.BorrowOperations
  );

  const tx = await borrowOperations.adjustTrove(
    troveManager,
    await signer.getAddress(),
    parseEther("0.33").toString(), // maxFeePercentage
    0, // collDeposit
    0, // collWithdrawal
    parseEther("100").toString(), // debtChange
    true, // isDebtIncrease
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    {
      value: parseEther("0.1"),
    }
  );

  console.log("Adjust a trove done...", tx.hash);
}
