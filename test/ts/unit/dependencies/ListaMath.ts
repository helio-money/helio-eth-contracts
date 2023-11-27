import { ListaMathHelper } from "../../../../typechain-types";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

describe("ListaMath Library", async () => {
  let listaMatchLib: ListaMathHelper;

  beforeEach(async () => {
    const C = await ethers.getContractFactory("ListaMathHelper");
    listaMatchLib = await C.deploy();
    await listaMatchLib.deployed();
  });

  describe("_min(uint256, uint256)", async () => {
    it("Return the minimum of two numbers", async () => {
      expect(await listaMatchLib._min(1, 2)).to.equal(1);
    });

    it("Return the minimum of two numbers in reverse order", async () => {
      expect(await listaMatchLib._min(2, 1)).to.equal(1);
    });

    it("Return the minimum of two same numbers", async () => {
      expect(await listaMatchLib._min(1, 1)).to.equal(1);
    });

    it("Return the minimum of min uint256 and max uint256", async () => {
      expect(await listaMatchLib._min(0, ethers.constants.MaxUint256)).to.equal(
        0
      );
    });
  });

  describe("_max(uint256, uint256)", async () => {
    it("Return the maximum of two numbers", async () => {
      expect(await listaMatchLib._max(1, 2)).to.equal(2);
    });

    it("Return the maximum of two numbers in reverse order", async () => {
      expect(await listaMatchLib._max(2, 1)).to.equal(2);
    });

    it("Return the maximum of two same numbers", async () => {
      expect(await listaMatchLib._max(1, 1)).to.equal(1);
    });

    it("Return the maximum of min uint256 and max uint256", async () => {
      expect(await listaMatchLib._max(0, ethers.constants.MaxUint256)).to.equal(
        ethers.constants.MaxUint256
      );
    });
  });

  describe("decMul(uint256, uint256)", async () => {
    describe("normal cases", async () => {
      it("Return the multiplication of two numbers", async () => {
        const a = parseEther("2");
        const b = parseEther("3");
        const res = parseEther("6");
        expect(await listaMatchLib.decMul(a, b)).to.equal(res);
      });

      it("Return the multiplication of two numbers in reverse order", async () => {
        const x = parseEther("3");
        const y = parseEther("2");
        const res = parseEther("6");
        expect(await listaMatchLib.decMul(x, y)).to.equal(res);
      });

      it("Return the multiplication of zero and a number", async () => {
        const x = parseEther("0");
        const y = parseEther("3");
        const res = parseEther("0");
        expect(await listaMatchLib.decMul(x, y)).to.equal(res);
      });

      it("Round product up if 19'th mantissa digit >= 5", async () => {
        // PRODUCT = x * y = 1e36 + 5e17, precision = 1e36
        const PRODUCT = parseEther("1")
          .mul(parseEther("1"))
          .add(parseEther("0.5")); // the 19'th digit is 5
        const x = PRODUCT.div(10);
        const y = 10;
        const res = PRODUCT.div(parseEther("1")).add(1); // round up
        expect(await listaMatchLib.decMul(x, y)).to.equal(res);
      });

      it("Round product down if 19'th mantissa digit < 5", async () => {
        // PRODUCT = x * y = 1e36 + 4e17, precision = 1e36
        const PRODUCT = parseEther("1")
          .mul(parseEther("1"))
          .add(parseEther("0.4")); // the 19'th digit is 4
        const x = PRODUCT.div(10);
        const y = 10;
        const res = PRODUCT.div(parseEther("1")); // round down
        expect(await listaMatchLib.decMul(x, y)).to.equal(res);
      });
    });

    describe("overflow", async () => {
      it("Shouldn't overflow if the product of two numbers is less than and equal to MaxUint256 - 0.5 eth", async () => {
        // PRODUCT = x * y, precision = 1e36
        const PRODUCT = ethers.constants.MaxUint256.sub(parseEther("0.5"));
        const x = PRODUCT.div(10);
        const y = 10;
        const res = PRODUCT.div(parseEther("1"));
        await expect(listaMatchLib.decMul(x, y)).not.to.rejected;
        expect(await listaMatchLib.decMul(x, y)).to.equal(res);
      });

      it("Should overflow if the product of two numbers is greater than MaxUint256 - 0.5 eth", async () => {
        // PRODUCT = x * y, precision = 1e36
        const PRODUCT = ethers.constants.MaxUint256.sub(parseEther("0.5")).add(
          1
        );
        const x = PRODUCT.div(10).add(parseEther("1"));
        const y = 10;
        await expect(listaMatchLib.decMul(x, y)).to.rejected;
      });
    });
  });

  describe("_decPow(uint256, uint256)", async () => {
    describe("normal cases", async () => {
      it("Return the power of the integer base", async () => {
        const base = parseEther("2");
        const minutes = 3;
        const res = parseEther("8");
        expect(await listaMatchLib._decPow(base, minutes)).to.equal(res);
      });

      it("Return the power of the decimal base", async () => {
        const base = parseEther("2.5");
        const minutes = 3;
        const res = parseEther("15.625");
        expect(await listaMatchLib._decPow(base, minutes)).to.equal(res);
      });
    });

    describe("overflow", async () => {
      it("Should overflow if the power is greater than MaxUint256 / 1e36", async () => {
        const base = parseEther("2");
        const minutes = 137; // 2^137 * 1e36 = 1.742245718635205e77
        await expect(listaMatchLib._decPow(base, minutes)).to.rejected;
      });

      it("Shouldn't overflow if the res is less than and equal to MaxUint256", async () => {
        const base = parseEther("2");
        const minutes = 136; // 2^136 * 1e36 = 8.711228593176025e76
        // const res = BigNumber.from(2).pow(255);
        // expect(await listaMatchLib._decPow(base, minutes)).to.equal(res);
        await expect(listaMatchLib._decPow(base, minutes)).not.to.rejected;
      });

      it("Should underflow if the minutes has decimal part", async () => {
        const base = parseEther("2.5");
        const minutes = 1.5;
        await expect(listaMatchLib._decPow(base, minutes)).to.rejectedWith(
          `underflow [ See: https://links.ethers.org/v5-errors-NUMERIC_FAULT-underflow ] (fault="underflow", operation="BigNumber.from", value=1.5, code=NUMERIC_FAULT, version=bignumber/5.7.0)`
        );
      });
    });
  });

  describe("_getAbsoluteDifference(uint256, uint256)", async () => {
    it("Return the absolute difference of two numbers", async () => {
      const a = parseEther("0.5");
      const b = parseEther("3");
      const res = parseEther("2.5");
      expect(await listaMatchLib._getAbsoluteDifference(a, b)).to.equal(res);
    });

    it("Return the absolute difference of two numbers in reverse order", async () => {
      const a = parseEther("3");
      const b = parseEther("0.5");
      const res = parseEther("2.5");
      expect(await listaMatchLib._getAbsoluteDifference(a, b)).to.equal(res);
    });

    it("Return the absolute difference of two same numbers", async () => {
      const a = parseEther("1");
      const b = parseEther("1");
      const res = parseEther("0");
      expect(await listaMatchLib._getAbsoluteDifference(a, b)).to.equal(res);
    });
  });

  describe("_computeNominalCR(uint256, uint256)", async () => {
    describe("normal cases", async () => {
      it("Return the nominal CR of two numbers", async () => {
        const coll = parseEther("3");
        const debt = parseEther("0.5");
        const res = parseEther("600"); // 3 / 0.5 * 1e20
        expect(await listaMatchLib._computeNominalCR(coll, debt)).to.equal(res);
      });

      it("Return the MaxUint256 if the denominator is 0", async () => {
        const coll = parseEther("3");
        const debt = parseEther("0");
        const res = BigNumber.from(ethers.constants.MaxUint256);
        expect(await listaMatchLib._computeNominalCR(coll, debt)).to.equal(res);
      });
    });

    describe("truncate", async () => {
      it("Shouldn't truncate to 0 if the denominator is 1e20 times less than and equal to the numerator", async () => {
        const coll = BigNumber.from(1); // 1
        const debt = parseEther("100"); // 1e20
        const res = BigNumber.from(1); // 1
        expect(await listaMatchLib._computeNominalCR(coll, debt)).to.equal(res);
      });

      it("Should truncate to 0 if the denominator is 1e20 times greater than the numerator", async () => {
        const coll = BigNumber.from(1); // 1
        const debt = parseEther("100").add(1); // 1e20 + 1
        const res = BigNumber.from(0); // truncate to 0
        expect(await listaMatchLib._computeNominalCR(coll, debt)).to.equal(res);
      });
    });

    describe("overflow", async () => {
      it("Shouldn't overflow if the numerator is less than and equal to MaxUint256 / 1e20", async () => {
        const coll = ethers.constants.MaxUint256.div(parseEther("100"));
        const debt = coll;
        const res = parseEther("100"); // 1e20
        expect(await listaMatchLib._computeNominalCR(coll, debt)).to.equal(res);
      });

      it("Should overflow if the numerator is greater than MaxUint256 / 1e20", async () => {
        const coll = ethers.constants.MaxUint256.div(parseEther("100")).add(1);
        const debt = coll;
        await expect(listaMatchLib._computeNominalCR(coll, debt)).to.rejected;
      });
    });
  });

  describe("_computeCR(uint256, uint256, uint256)", async () => {
    describe("normal cases", async () => {
      it("Return the nominal CR of two numbers", async () => {
        const coll = parseEther("3");
        const debt = parseEther("0.5");
        const price = parseEther("1"); // 1e18
        const res = parseEther("6"); // 3 / 0.5 * 1e18
        expect(
          await listaMatchLib["_computeCR(uint256,uint256,uint256)"](
            coll,
            debt,
            price
          )
        ).to.equal(res);
      });

      it("Return the MaxUint256 if the denominator is 0", async () => {
        const coll = parseEther("3");
        const debt = parseEther("0");
        const price = parseEther("1"); // 1e18
        const res = BigNumber.from(ethers.constants.MaxUint256);
        expect(
          await listaMatchLib["_computeCR(uint256,uint256,uint256)"](
            coll,
            debt,
            price
          )
        ).to.equal(res);
      });
    });

    describe("truncate", async () => {
      it("Shouldn't truncate to 0 if the denominator is 1e18(price) times less than and equal to the numerator", async () => {
        const coll = BigNumber.from(1); // 1
        const debt = parseEther("1"); // 1e18
        const price = parseEther("1"); // 1e18
        const res = BigNumber.from(1); // 1
        expect(
          await listaMatchLib["_computeCR(uint256,uint256,uint256)"](
            coll,
            debt,
            price
          )
        ).to.equal(res);
      });

      it("Should truncate to 0 if the denominator is 1e18(price) times greater than the numerator", async () => {
        const coll = BigNumber.from(1); // 1
        const debt = parseEther("1").add(1); // 1e18 + 1
        const price = parseEther("1"); // 1e18
        const res = BigNumber.from(0); // truncate to 0
        expect(
          await listaMatchLib["_computeCR(uint256,uint256,uint256)"](
            coll,
            debt,
            price
          )
        ).to.equal(res);
      });
    });

    describe("overflow", async () => {
      it("Shouldn't overflow if the numerator is less than and equal to MaxUint256 / 1e18(price)", async () => {
        const price = parseEther("1"); // 1e18
        const coll = ethers.constants.MaxUint256.div(price);
        const debt = coll;
        const res = parseEther("1"); // 1e18
        expect(
          await listaMatchLib["_computeCR(uint256,uint256,uint256)"](
            coll,
            debt,
            price
          )
        ).to.equal(res);
      });

      it("Should overflow if the numerator is greater than MaxUint256 / 1e18(price)", async () => {
        const price = parseEther("1"); // 1e18
        const coll = ethers.constants.MaxUint256.div(price).add(1);
        const debt = coll;
        await expect(
          listaMatchLib["_computeCR(uint256,uint256,uint256)"](
            coll,
            debt,
            price
          )
        ).to.rejected;
      });
    });
  });

  describe("_computeCR(uint256, uint256)", async () => {
    describe("normal cases", async () => {
      it("Return the nominal CR of two numbers", async () => {
        const coll = parseEther("3");
        const debt = parseEther("0.5");
        const res = BigNumber.from(6); // 3 / 0.5
        expect(
          await listaMatchLib["_computeCR(uint256,uint256)"](coll, debt)
        ).to.equal(res);
      });

      it("Return the MaxUint256 if the denominator is 0", async () => {
        const coll = parseEther("3");
        const debt = parseEther("0");
        const res = BigNumber.from(ethers.constants.MaxUint256);
        expect(
          await listaMatchLib["_computeCR(uint256,uint256)"](coll, debt)
        ).to.equal(res);
      });
    });

    describe("truncate", async () => {
      it("Shouldn't truncate to 0 if the denominator is less than the numerator", async () => {
        const coll = parseEther("1").add(1);
        const debt = parseEther("1");
        const res = BigNumber.from(1); // 1
        expect(
          await listaMatchLib["_computeCR(uint256,uint256)"](coll, debt)
        ).to.equal(res);
      });

      it("Shouldn't truncate to 0 if the denominator is equal to the numerator", async () => {
        const coll = parseEther("1");
        const debt = parseEther("1");
        const res = BigNumber.from(1); // 1
        expect(
          await listaMatchLib["_computeCR(uint256,uint256)"](coll, debt)
        ).to.equal(res);
      });

      it("Should truncate to 0 if the denominator is greater than the numerator", async () => {
        const coll = parseEther("1").sub(1);
        const debt = parseEther("1");
        const res = BigNumber.from(0); // truncate to 0
        expect(
          await listaMatchLib["_computeCR(uint256,uint256)"](coll, debt)
        ).to.equal(res);
      });
    });

    describe("overflow", async () => {
      it("Shouldn't overflow", async () => {
        const coll = ethers.constants.MaxUint256;
        const debt = BigNumber.from(1);
        const res = ethers.constants.MaxUint256;
        expect(
          await listaMatchLib["_computeCR(uint256,uint256)"](coll, debt)
        ).to.equal(res);
      });
    });
  });
});
