import { closeTrove } from "./init/closeTrove";
import { deployNewInstance } from "./init/deployNewInstance";
import { initPriceFeed } from "./init/initPriceFeed";
import { openTrove } from "./init/openTrove";
import { adjustTrove } from "./init/adjustTrove";
import { depositToSP, withdrawFromSP } from "./init/depositToSP";

async function main() {
  await openTrove();
  await adjustTrove();
  await depositToSP();
  await withdrawFromSP();
  await closeTrove();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
