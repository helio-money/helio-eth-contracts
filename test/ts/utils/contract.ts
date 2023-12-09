import {ethers} from "hardhat";
import {BigNumber} from "ethers";

export const abi = new ethers.utils.AbiCoder();

export function encodeCallData(funcName: string, argTypes: string[], argValues: any[]): string {
  return `${ethers.utils.id(funcName).slice(0, 10)}${abi.encode(argTypes, argValues).slice(2)}`;
}

export function min(a: BigNumber, b: BigNumber): BigNumber {
  return a.lt(b) ? a : b;
}
