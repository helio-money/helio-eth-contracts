import { DEPLOYED_ADDRESSES } from "../../constants/deployed_addresses";
import { DEPLOYMENT_PARAMS } from "../../constants/index";
import { ethers } from "hardhat";

const addresses = DEPLOYED_ADDRESSES[11155111];
const params = DEPLOYMENT_PARAMS[11155111];

export const initPriceFeed = async () => {
  const priceFeed = await ethers.getContractAt(
    "PriceFeed",
    addresses.PriceFeed
  );
  await priceFeed.setOracle(
    addresses.TestToken,
    params.ethFeed,
    3600,
    "0x00000000",
    18,
    false
  );
};
