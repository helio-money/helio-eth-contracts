import { closeTrove } from "./init/closeTrove";
import { deployNewInstance } from "./init/deployNewInstance";
import { initPriceFeed } from "./init/initPriceFeed";
import { openTrove } from "./init/openTrove";

async function main() {
  await initPriceFeed();
  await deployNewInstance();
  await openTrove();
  await closeTrove();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
