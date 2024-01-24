import { DEPLOYMENT_PARAMS } from "../../../constants";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";

const params = DEPLOYMENT_PARAMS[11155111];

export const deployListaToken = async (
    vault: Contract,
    tokenLocker: Contract
) => {
    console.log("Deploying ListaToken...");
    const listaToken = await ethers.deployContract("ListaToken", [
        vault.target,
        params.lzEndpoint,
        tokenLocker.target,
    ]);
    await listaToken.waitForDeployment();
    console.log("ListaToken deployed to:", listaToken.target);

    console.log("Updating LockToken in TokenLocker...");
    await tokenLocker.setLockToken(listaToken.target);
    console.log("Updated LockToken in TokenLocker...");

    while (hre.network.name !== "hardhat") {
        try {
            await hre.run("verify:verify", {
                address: listaToken.target,
                constructorArguments: [
                    vault.target,
                    params.lzEndpoint,
                    tokenLocker.target,
                ],
            });
            break;
        } catch (e) {
            console.log("retrying...");
        }
    }

    return listaToken;
};
