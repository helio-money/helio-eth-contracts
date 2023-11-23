import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import { ethers } from "hardhat";

const addresses = DEPLOYED_ADDRESSES[11155111];

export const closeTrove = async () => {
  const signers = await ethers.getSigners();

  const factory = await ethers.getContractAt("Factory", addresses.Factory);
  const troveManager = await factory.troveManagers(0);

  console.log("Closing trove...");
  const borrowOperations = await ethers.getContractAt(
    "BorrowerOperations",
    addresses.BorrowOperations
  );
  await borrowOperations.closeTrove(troveManager, signers[0].address);
  console.log("Closing trove done...");
};
