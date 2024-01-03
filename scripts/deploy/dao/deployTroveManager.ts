import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract, Signer } from "ethers";
import hre, { ethers } from "hardhat";
import { Sign } from "crypto";
import { sepolia_addresses } from "../../../constants/deployed_addresses";

const params = DEPLOYMENT_PARAMS[11155111];
//const addresses = sepolia_addresses;

export const deployTroveManager = async (
  listaCore: Contract,
  debtToken: Contract,
  borrowOperations: Contract,
  liquidationManager: Contract,
) => {
  console.log("Deploying TroveManager...");
  const troveManager = await ethers.deployContract("TroveManager", [
    '0xF9a3702659d8bFDb2ff5E3c3f264E479801F63Bf', // listaCore.address,
    params.gasPool,
    '0x15493D9141481505f7CA3e591Cea2cBB03637B1d', // debtToken.address,
    '0xC66772EdB0fF156b3F99E21697e5D6b1a74Dd315', // borrowOperations.address,
    params.vault,
    '0xcf240AaD203A342e0caD90343D2A7A43C851E516', // liquidationManager.address,
    params.gasCompensation
  ]);
  await troveManager.deployed();
  console.log("TroveManager deployed to:", troveManager.address);

  const v = true;
  while (v) {
    try {
      await hre.run("verify:verify", {
        address: troveManager.address,
        constructorArguments: [
          '0xF9a3702659d8bFDb2ff5E3c3f264E479801F63Bf', // listaCore.address,
          params.gasPool,
          '0x15493D9141481505f7CA3e591Cea2cBB03637B1d', // debtToken.address,
          '0xC66772EdB0fF156b3F99E21697e5D6b1a74Dd315', // borrowOperations.address,
          params.vault,
          '0xcf240AaD203A342e0caD90343D2A7A43C851E516', // liquidationManager.address,
          params.gasCompensation
        ],
      });
      break;
    } catch (e) {
      console.log("retrying...", e);
    }
  }

  return troveManager;
};
