import { Contract } from "ethers";
import hre, { ethers } from "hardhat";
import { Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { expect } from "chai";


export const openTrove = async(troveManager: Contract, borrowerOperations: Contract, wBETH: string) => {
    let signer: Signer;
    if (hre.network.name === "hardhat") {
      const signers = await ethers.getSigners();
      signer = signers[0];
    } else {
      throw Error("Unsupported network");
    }

    const collateralToken = await ethers.getContractAt("CollateralToken", wBETH);
    await collateralToken.deployed();
    await collateralToken.mint(await signer.getAddress(), "100000000000000000000000");

    expect(await collateralToken.balanceOf(troveManager.address)).to.equal(0);
    expect(await collateralToken.balanceOf(await signer.getAddress())).to.equal("100000000000000000000000");
    await collateralToken.connect(signer).approve(borrowerOperations.address, parseEther("10000000000000"));

    try {
        const tx = await borrowerOperations.openTrove(
            troveManager.address,
            await signer.getAddress(),
            0, // collAmount
            parseEther("0.33").toString(), // maxFeePercentage
            parseEther("100").toString(), // debtAmount
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            {
              value: parseEther("1000"),
            }
        );
        expect(await collateralToken.balanceOf(borrowerOperations.address)).to.equal("1000000000000000000000");
        expect(await collateralToken.balanceOf(troveManager.address)).to.equal("1000000000000000000000");

        console.log("openTrove done");
    } catch (e) {
        console.log("openTrove error", e);
    }
}


export const depositToSP = async (stabilityPool: Contract) => {
    await stabilityPool.provideToSP(100);
    console.log("Deposited 100 lisUSD to StabilityPool");
  }