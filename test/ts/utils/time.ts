import { BigNumber } from "ethers";
import { DAY, WEEK } from "./constant";
const { time } = require('@nomicfoundation/hardhat-network-helpers');

/**
 * Get the week of the current timestamp relative to the startTimestamp.
 * @param startTimestamp
 * @param currentTimestamp
 * @returns weeks since startTimestamp
 */
export const getWeek = (startTimestamp: number, currentTimestamp: number): number => {
  if (currentTimestamp < startTimestamp) {
    throw new Error("currentTimestamp must be greater than or equal to startTimestamp");
  }
  return Math.floor((currentTimestamp - startTimestamp) / WEEK);
}

export const now = async (): Promise<number> => {
  return time.latest();
}

export const increase = async (seconds: number | BigNumber | Promise<number | BigNumber>) => {
  await time.increase(await seconds);
}

export const increaseTo = async (timestamp: number | BigNumber | Promise<number | BigNumber>) => {
  await time.increaseTo(timestamp);
}

/**
 * Get the week day of the current timestamp relative to the startTimestamp.
 * @param startTimestamp 
 * @param currentTimestamp 
 * @returns week day since startTimestamp
 */
export const getWeekDay = (startTimestamp: number, currentTimestamp: number): number => {
  if (currentTimestamp < startTimestamp) {
    throw new Error("currentTimestamp must be greater than or equal to startTimestamp");
  }
  return Math.floor((currentTimestamp - startTimestamp) / DAY) % 7;
}

/**
 * Get the timestamp of the next week relative to the startTimestamp.
 * If the current timestamp is in the same week, the current timestamp + 1week is returned.
 * @param startTimestamp 
 * @param currentTimestamp 
 * @param weekDay 
 * @returns timestamp of the next specified week day
 */
export const nextWeekDay = (startTimestamp: number, currentTimestamp: number, weekDay: number): number => {
  if (currentTimestamp < startTimestamp) {
    throw new Error("currentTimestamp must be greater than or equal to startTimestamp");
  }
  if (weekDay < 0 || weekDay > 6) {
    throw new Error("weekDay must be between 0 and 6");
  }
  const currentWeekDay = getWeekDay(startTimestamp, currentTimestamp);
  if (currentWeekDay === weekDay) {
    return currentTimestamp + WEEK;
  }
  const daysToAdd = (weekDay - currentWeekDay + 7) % 7;
  return currentTimestamp + daysToAdd * DAY;
}

export const getNthWeek = (startTimestamp: number, n: number): number => {
  return startTimestamp + n * WEEK;
}
