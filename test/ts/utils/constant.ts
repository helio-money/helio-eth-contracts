import { ethers } from "hardhat";

export const ZERO_ADDRESS = ethers.constants.AddressZero;
export const ZERO = ethers.constants.Zero;

// seconds in a minute, hour, day, week
export const MINUTE = 60;
export const HOUR = MINUTE * 60;
export const DAY = HOUR * 24;
export const WEEK = DAY * 7;

export const GWEI = ethers.utils.parseUnits("1", "gwei");
export const ETHER = ethers.utils.parseEther("1");

export const _1E9 = GWEI;
export const _1E18 = ETHER;
