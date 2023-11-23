import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import { ethers } from "hardhat";

const addresses = DEPLOYED_ADDRESSES[11155111];

export const openTrove = async () => {
  const signers = await ethers.getSigners();
  const testToken = await ethers.getContractAt(
    "CollateralToken",
    addresses.TestToken
  );
  console.log("Minting...");
  await testToken.mint(signers[0].address, "100000000000000000000000");
  console.log("Mint Done...");

  console.log("Approving...");
  await testToken.approve(
    addresses.BorrowOperations,
    "100000000000000000000000"
  );
  console.log("Approve Done...");

  const factory = await ethers.getContractAt("Factory", addresses.Factory);
  const troveManager = await factory.troveManagers(0);

  console.log(
    "params:",
    troveManager,
    signers[0].address,
    "1000000000000000000",
    "9686596495220448859",
    "10800000000000000000000",
    ethers.constants.AddressZero,
    ethers.constants.AddressZero
  );

  console.log("Opening a trove...");
  const borrowOperations = await ethers.getContractAt(
    "BorrowerOperations",
    addresses.BorrowOperations
  );
  await borrowOperations.openTrove(
    troveManager,
    signers[0].address,
    "1000000000000000000",
    "9686596495220448859",
    "10800000000000000000000",
    ethers.constants.AddressZero,
    ethers.constants.AddressZero
  );
  console.log("Opening a trove done...");
};
