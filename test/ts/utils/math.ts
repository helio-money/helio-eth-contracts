import { BigNumber } from "ethers";

export function computeCR(coll: BigNumber, debt: BigNumber, price: BigNumber | null = null) {
  if (price == null) {
    price = BigNumber.from(1);
  }

  if (debt.gt(0)) {
    return coll.mul(price).div(debt);
  }
  return BigNumber.from(2).pow(256).sub(1);
}

export function min(a: BigNumber, b: BigNumber): BigNumber {
  return a.lt(b) ? a : b;
}
