import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import { ethers } from "hardhat";

const addresses = DEPLOYED_ADDRESSES[11155111];

export const deployNewInstance = async () => {
  const factory = await ethers.getContractAt("Factory", addresses.Factory);
  await factory.deployNewInstance(
    addresses.TestToken,
    addresses.PriceFeed,
    addresses.TroveManager,
    addresses.SortedTroves,
    {
      minuteDecayFactor: "999037758833783000",
      redemptionFeeFloor: "5000000000000000",
      maxRedemptionFee: "1000000000000000000",
      borrowingFeeFloor: 0,
      maxBorrowingFee: 0,
      interestRateInBps: 0,
      maxDebt: "11000000000000000000000",
      MCR: "1100000000000000000",
    }
  );
};
