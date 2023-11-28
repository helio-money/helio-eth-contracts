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
        vault.address,
        params.lzEndpoint,
        tokenLocker.address,
    ]);
    await listaToken.deployed();
    console.log("ListaToken deployed to:", await listaToken.address);

    console.log("Updating LockToken in TokenLocker...");
    await tokenLocker.setLockToken(listaToken.address);
    console.log("Updated LockToken in TokenLocker...");

    while (true) {
        try {
            await hre.run("verify:verify", {
                address: listaToken.address,
                constructorArguments: [
                    vault.address,
                    params.lzEndpoint,
                    tokenLocker.address,
                ],
            });
            break;
        } catch (e) {
            console.log("retrying...");
        }
    }

    return listaToken;
};
