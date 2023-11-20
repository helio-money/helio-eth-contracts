import { deployMain } from "./deployMain";
import { deployCollateralToken } from "./test/deployCollateralToken";

async function main() {
  // deployMain();
  deployCollateralToken();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
