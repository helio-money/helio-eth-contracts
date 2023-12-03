import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import type { ListaCore, MockAggregator, MockInternalPriceFeed, PriceFeed } from "../../../../typechain-types";

describe("PriceFeed", () => {
  const ZERO_ADDRESS = ethers.constants.AddressZero;
  const FAKE_GUARDIAN_ADDRESS = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";
  const FAKE_TOKEN_ADDRESS = "0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd";
  const abi = new ethers.utils.AbiCoder();

  let listaCore: ListaCore;
  let priceFeed: PriceFeed;
  let internalPriceFeed: MockInternalPriceFeed;
  let aggregator: MockAggregator;

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let feeReceiver: Signer;

  beforeEach(async () => {
    [owner, user1, user2, feeReceiver] = await ethers.getSigners();

    aggregator = await ethers.deployContract("MockAggregator") as MockAggregator;
    await aggregator.deployed();

    listaCore = await ethers.deployContract("ListaCore", [
      await owner.getAddress(),
      FAKE_GUARDIAN_ADDRESS,
      ZERO_ADDRESS,
      await feeReceiver.getAddress()
    ]) as ListaCore;
    await listaCore.deployed();

    priceFeed = await ethers.deployContract("PriceFeed", [
      listaCore.address,
      aggregator.address
    ]) as PriceFeed;
    await priceFeed.deployed();

    internalPriceFeed = await ethers.deployContract("MockInternalPriceFeed", [
      listaCore.address,
      aggregator.address
    ]) as MockInternalPriceFeed;
    await internalPriceFeed.deployed();
  });

  const encodeCallData = (name: string, types: string[], values: any[]) => {
    return `${ethers.utils.id(name).slice(0, 10)}${abi.encode(types, values).slice(2)}`;
  }

  describe("Deployment", () => {
    it("Should OK when read ListaOwnable", async () => {
      expect(await priceFeed.LISTA_CORE()).to.be.equal(listaCore.address);
      expect(await priceFeed.owner()).to.be.equal(await owner.getAddress());
      expect(await priceFeed.guardian()).to.be.equal(FAKE_GUARDIAN_ADDRESS);
    });

    it("Should OK after construct", async () => {
      const oracleRecord = await priceFeed.oracleRecords(ZERO_ADDRESS);

      expect(oracleRecord.chainLinkOracle).to.be.equal(aggregator.address);
      expect(oracleRecord.decimals).to.be.equal(8);
      expect(oracleRecord.heartbeat).to.be.equal(3600);
      expect(oracleRecord.sharePriceSignature).to.be.equal(ethers.utils.hexZeroPad('0x00', 4));
      expect(oracleRecord.sharePriceDecimals).to.be.equal(0);
      expect(oracleRecord.isFeedWorking).to.be.true;
      expect(oracleRecord.isEthIndexed).to.be.false;

      await expect(priceFeed.deployTransaction)
        .to.emit(priceFeed, "NewOracleRegistered")
        .withArgs(ZERO_ADDRESS, aggregator.address, false);
    });

    it("Should revert if not listaCore owner", async () => {
      await expect(priceFeed.connect(user1)
        .setOracle(
          FAKE_TOKEN_ADDRESS,
          aggregator.address,
          3600,
          "0x00000000",
          0,
          false
        )).to.be.revertedWith("Only owner")
    });
  });

  describe("internal functions", () => {
    it("fetchFeedResponse", async () => {
      const currentRes = await internalPriceFeed.fetchCurrentFeedResponse(aggregator.address);
      let block = await ethers.provider.getBlock("latest");

      expect(currentRes.roundId).to.be.equal(2);
      expect(currentRes.answer).to.be.equal(190000000000);
      expect(currentRes.timestamp).to.be.equal(block.timestamp - 2 * 60);
      expect(currentRes.success).to.be.true;

      const prevRes = await internalPriceFeed.fetchPrevFeedResponse(aggregator.address, currentRes.roundId);
      block = await ethers.provider.getBlock("latest");
      expect(prevRes.roundId).to.be.equal(1);
      expect(prevRes.answer).to.be.equal(190000000000);
      expect(prevRes.timestamp).to.be.equal(block.timestamp - 5 * 60);
      expect(prevRes.success).to.be.true;

      const res = await internalPriceFeed.fetchFeedResponses(aggregator.address, 2);
      expect(res.currResponse.roundId).to.be.equal(currentRes.roundId);
      expect(res.currResponse.answer).to.be.equal(currentRes.answer);

      expect(res.prevResponse.roundId).to.be.equal(0);
      expect(res.prevResponse.answer).to.be.equal(0);
      expect(res.prevResponse.success).to.be.false;
      expect(res.updated).to.be.false;

      // last roundId = 1
      const res1 = await internalPriceFeed.fetchFeedResponses(aggregator.address, 1);
      expect(res1.currResponse.roundId).to.be.equal(currentRes.roundId);
      expect(res1.currResponse.answer).to.be.equal(currentRes.answer);
      expect(res1.currResponse.success).to.be.equal(currentRes.success);

      expect(res1.prevResponse.roundId).to.be.equal(prevRes.roundId);
      expect(res1.prevResponse.answer).to.be.equal(prevRes.answer);
      expect(res1.prevResponse.success).to.be.equal(prevRes.success);

      // last roundId = 0
      const res0 = await internalPriceFeed.fetchFeedResponses(aggregator.address, 0);
      expect(res0.currResponse.roundId).to.be.equal(currentRes.roundId);
      expect(res0.currResponse.answer).to.be.equal(currentRes.answer);
      expect(res0.currResponse.success).to.be.equal(currentRes.success);

      expect(res0.prevResponse.roundId).to.be.equal(prevRes.roundId);
      expect(res0.prevResponse.answer).to.be.equal(prevRes.answer);
      expect(res0.prevResponse.success).to.be.true;

      const prevRes0 = await internalPriceFeed.fetchPrevFeedResponse(aggregator.address, 0);
      expect(prevRes0.roundId).to.be.equal(0);
      expect(prevRes0.answer).to.be.equal(0);
      expect(prevRes0.success).to.be.false;
    });

    it("isFeedWorking", async () => {
      let lastroundId = 2;
      const feed2 = await internalPriceFeed.fetchFeedResponses(aggregator.address, lastroundId);
      expect(await internalPriceFeed.isValidResponse(feed2.currResponse)).to.be.true;
      expect(await internalPriceFeed.isValidResponse(feed2.prevResponse)).to.be.false;
      expect(await internalPriceFeed.isFeedWorking(feed2.currResponse, feed2.prevResponse)).to.be.false;

      lastroundId = 1;
      const feed1 = await internalPriceFeed.fetchFeedResponses(aggregator.address, lastroundId);
      expect(await internalPriceFeed.isValidResponse(feed1.currResponse)).to.be.true;
      expect(await internalPriceFeed.isValidResponse(feed1.prevResponse)).to.be.true;
      expect(await internalPriceFeed.isFeedWorking(feed1.currResponse, feed1.prevResponse)).to.be.true;

      lastroundId = 0;
      const feed0 = await internalPriceFeed.fetchFeedResponses(aggregator.address, lastroundId);
      expect(await internalPriceFeed.isValidResponse(feed0.currResponse)).to.be.true;
      expect(await internalPriceFeed.isValidResponse(feed0.prevResponse)).to.be.true;
      expect(await internalPriceFeed.isFeedWorking(feed0.currResponse, feed0.prevResponse)).to.be.true;
    });

    it("_scalePriceByDigits", async () => {
      const targetDecimals = await internalPriceFeed.TARGET_DIGITS();
      const base = BigNumber.from("10");

      // decimals = 6 < targetDecimals
      let price = BigNumber.from("123456");
      let decimals = BigNumber.from(price.toString().length);
      let value = await internalPriceFeed.scalePriceByDigits(price, decimals);
      expect(decimals).to.be.equal(6);
      expect(decimals).to.be.lt(targetDecimals);
      expect(value).to.be.equal(base.pow(targetDecimals.sub(decimals)).mul(price));

      // decimals = 18 == targetDecimals
      price = BigNumber.from("111111111111111111");
      decimals = BigNumber.from(price.toString().length);
      value = await internalPriceFeed.scalePriceByDigits(price, decimals);
      expect(decimals).to.be.equal(18);
      expect(decimals).to.be.equal(targetDecimals);
      expect(value).to.be.equal(price);

      // decimals = 20 > targetDecimals
      price = BigNumber.from("11111111111111111111");
      decimals = BigNumber.from(price.toString().length);
      value = await internalPriceFeed.scalePriceByDigits(price, decimals);
      expect(decimals).to.be.equal(20);
      expect(decimals).to.be.gt(targetDecimals);
      expect(value).to.be.equal(price.div(base.pow(decimals.sub(targetDecimals))));
    });

    it("_isPriceChangeAboveMaxDeviation", async () => {
      const targetDecimals = await internalPriceFeed.TARGET_DIGITS();
      // 1e18
      const precision = ethers.utils.parseEther("1");
      // 5e17
      const maxDeviation = precision.div(2);

      // 1. decimal < targetDecimals
      // 1.1 deviation > maxDeviation
      let prevAnswer = BigNumber.from(100000);
      let currentAnswer = BigNumber.from(500000);
      let decimals = BigNumber.from(currentAnswer.toString().length);
      let max = prevAnswer.gt(currentAnswer) ? prevAnswer : currentAnswer;
      let min = prevAnswer.gt(currentAnswer) ? currentAnswer : prevAnswer;
      let deviationPercent = (max.toNumber() - min.toNumber()) / max.toNumber();
      let integerDeviationPercent = max.sub(min).mul(precision).div(max);
      expect(decimals).to.be.lt(targetDecimals);
      expect(deviationPercent).to.be.gt(0.5);
      let prevResponse = { roundId: 1, answer: prevAnswer, timestamp: 0, success: true };
      let currentResponse = { roundId: 2, answer: currentAnswer, timestamp: 0, success: true };
      expect(await internalPriceFeed.isPriceChangeAboveMaxDeviation(currentResponse, prevResponse, decimals)).to.be.true;
      expect(integerDeviationPercent).to.be.gt(maxDeviation);
      expect(integerDeviationPercent).to.be.equal(BigNumber.from((deviationPercent * 1e18).toString()));

      // 1.2 deviation <= maxDeviation
      prevAnswer = BigNumber.from(260000);
      currentAnswer = BigNumber.from(500000);
      decimals = BigNumber.from(currentAnswer.toString().length);
      max = prevAnswer.gt(currentAnswer) ? prevAnswer : currentAnswer;
      min = prevAnswer.gt(currentAnswer) ? currentAnswer : prevAnswer;
      deviationPercent = (max.toNumber() - min.toNumber()) / max.toNumber();
      integerDeviationPercent = max.sub(min).mul(precision).div(max);
      expect(decimals).to.be.lt(targetDecimals);
      prevResponse = { roundId: 1, answer: prevAnswer, timestamp: 0, success: true };
      currentResponse = { roundId: 2, answer: currentAnswer, timestamp: 0, success: true };
      expect(await internalPriceFeed.isPriceChangeAboveMaxDeviation(currentResponse, prevResponse, decimals)).to.be.false;
      expect(deviationPercent).to.be.lt(0.5);
      expect(integerDeviationPercent).to.be.lt(maxDeviation);
      expect(integerDeviationPercent).to.be.equal(BigNumber.from((deviationPercent * 1e18).toString()));

      // 2. decimal == targetDecimals
      // 2.1 deviation > maxDeviation
      prevAnswer = BigNumber.from("111111111111111111");
      currentAnswer = BigNumber.from("55555555555555500");
      decimals = BigNumber.from(prevAnswer.toString().length);
      max = prevAnswer.gt(currentAnswer) ? prevAnswer : currentAnswer;
      min = prevAnswer.gt(currentAnswer) ? currentAnswer : prevAnswer;
      deviationPercent = 1 - Number(min.toString()) / Number(max.toString());
      integerDeviationPercent = max.sub(min).mul(precision).div(max);
      expect(decimals).to.be.equal(targetDecimals);
      prevResponse = { roundId: 1, answer: prevAnswer, timestamp: 0, success: true };
      currentResponse = { roundId: 2, answer: currentAnswer, timestamp: 0, success: true };
      expect(await internalPriceFeed.isPriceChangeAboveMaxDeviation(currentResponse, prevResponse, decimals)).to.be.true;
      expect(deviationPercent).to.be.gt(0.5);
      expect(integerDeviationPercent).to.be.gt(maxDeviation);

      // 2.2 deviation <= maxDeviation
      prevAnswer = BigNumber.from("111111111111111111");
      currentAnswer = BigNumber.from("55555555555556050");
      decimals = BigNumber.from(prevAnswer.toString().length);
      max = prevAnswer.gt(currentAnswer) ? prevAnswer : currentAnswer;
      min = prevAnswer.gt(currentAnswer) ? currentAnswer : prevAnswer;
      deviationPercent = 1 - Number(min.toString()) / Number(max.toString());
      integerDeviationPercent = max.sub(min).mul(precision).div(max);
      expect(decimals).to.be.equal(targetDecimals);
      prevResponse = { roundId: 1, answer: prevAnswer, timestamp: 0, success: true };
      currentResponse = { roundId: 2, answer: currentAnswer, timestamp: 0, success: true };
      expect(await internalPriceFeed.isPriceChangeAboveMaxDeviation(currentResponse, prevResponse, decimals)).to.be.false;
      expect(deviationPercent).to.be.lt(0.5);
      expect(integerDeviationPercent).to.be.lt(maxDeviation);
    });

    it("_updateFeedStatus", async () => {
      let fakeOracle = FAKE_GUARDIAN_ADDRESS;
      let fakeToken = FAKE_TOKEN_ADDRESS;

      let isWorking = true;
      let oracleRecord = {
        chainLinkOracle: fakeOracle,
        decimals: 9,
        heartbeat: 3600,
        isFeedWorking: isWorking,
        sharePriceSignature: '0x00000000',
        sharePriceDecimals: 8,
        isEthIndexed: false
      };
      await internalPriceFeed.setOracle(
        fakeToken,
        aggregator.address,
        oracleRecord.heartbeat,
        oracleRecord.sharePriceSignature,
        oracleRecord.sharePriceDecimals,
        oracleRecord.isEthIndexed
      );

      // working = true
      const tx1 = await internalPriceFeed.updateFeedStatus(fakeToken, oracleRecord, isWorking);
      await expect(tx1).to.emit(internalPriceFeed, "PriceFeedStatusUpdated").withArgs(fakeToken, fakeOracle, isWorking);

      const record = await internalPriceFeed.oracleRecords(fakeToken);
      expect(record.isFeedWorking).to.be.equal(isWorking);

      // working = false
      isWorking = false;
      const tx2 = await internalPriceFeed.updateFeedStatus(fakeToken, oracleRecord, isWorking);
      await expect(tx2).to.emit(internalPriceFeed, "PriceFeedStatusUpdated").withArgs(fakeToken, fakeOracle, isWorking);

      const record2 = await internalPriceFeed.oracleRecords(fakeToken);
      expect(record2.isFeedWorking).to.be.equal(isWorking);
    });

    it("_storePrice", async () => {
      const price = 111111111111111111n;
      const timestamp = 1701180691;
      const roundId = 7;
      const tx = await internalPriceFeed.storePrice(FAKE_TOKEN_ADDRESS, price, timestamp, roundId);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const priceRecord = await internalPriceFeed.priceRecords(FAKE_TOKEN_ADDRESS);
      expect(priceRecord.scaledPrice).to.be.equal(price);
      expect(priceRecord.timestamp).to.be.equal(timestamp);
      expect(priceRecord.lastUpdated).to.be.equal(block.timestamp);
      expect(priceRecord.roundId).to.be.equal(roundId);

      await expect(tx).to.emit(internalPriceFeed, "PriceRecordUpdated").withArgs(FAKE_TOKEN_ADDRESS, price);
    });

    it("_isPriceStale", async () => {
      const timeout = await internalPriceFeed.RESPONSE_TIMEOUT_BUFFER();
      let block = await ethers.provider.getBlock("latest");

      const currentTimestampAndTimeout = timeout.add(block.timestamp);
      const priceTimestamp = BigNumber.from(1701180691);
      const staledElapse = BigNumber.from(block.timestamp).sub(priceTimestamp);

      // if staled
      const staledHeartbeat = staledElapse.sub(timeout).sub(1);
      expect(staledElapse).to.be.gt(staledHeartbeat.add(timeout));
      expect(await internalPriceFeed.isPriceStale(priceTimestamp, staledHeartbeat)).to.be.true;

      // if not staled
      const heartbeat = BigNumber.from(3600);
      const elapse = heartbeat.add(timeout).sub(1);
      block = await ethers.provider.getBlock("latest");

      expect(elapse).to.be.lt(heartbeat.add(timeout));
      expect(await internalPriceFeed.isPriceStale(BigNumber.from(block.timestamp).sub(elapse), heartbeat)).to.be.false;
    });
  });

  describe("set Functions", () => {
    it("Should OK when processFeedResponses", async () => {
      const heartbeat = 123;
      const sig = "0x00000000"
      const decimals = await aggregator.decimals();
      const lastRoundId = 1;

      const res = await internalPriceFeed.fetchFeedResponses(aggregator.address, lastRoundId);
      const oracleRecord = {
        chainLinkOracle: aggregator.address,
        decimals,
        heartbeat,
        sharePriceSignature: sig,
        sharePriceDecimals: 8,
        isFeedWorking: false,
        isEthIndexed: false
      };
      const priceRecord = {
        scaledPrice: 0,
        timestamp: 0,
        lastUpdated: 0,
        roundId: 0
      };
      const isValidResponse = await internalPriceFeed.isFeedWorking(res.currResponse, res.prevResponse);
      expect(isValidResponse).to.be.true;

      const tx = await internalPriceFeed.processFeedResponses(
        FAKE_TOKEN_ADDRESS,
        oracleRecord,
        res.currResponse,
        res.prevResponse,
        priceRecord
      );
      const currentAnswer = res.currResponse.answer;
      await expect(tx).to.emit(internalPriceFeed, "PriceRecordUpdated")
        .withArgs(FAKE_TOKEN_ADDRESS, currentAnswer.mul(BigNumber.from("10").pow(18 - decimals)));
      await expect(tx).to.emit(internalPriceFeed, "PriceFeedStatusUpdated")
        .withArgs(FAKE_TOKEN_ADDRESS, aggregator.address, true);
    });

    it("_processFeedResponses with isValiddResponse = false", async () => {
      const heartbeat = 3600;
      const decimals = await aggregator.decimals();
      const lastRoundId = 2;
      const res = await internalPriceFeed.fetchFeedResponses(aggregator.address, lastRoundId);
      const oracleRecord = {
        chainLinkOracle: aggregator.address,
        decimals,
        heartbeat,
        sharePriceSignature: "0x00000000",
        sharePriceDecimals: 8,
        isFeedWorking: true,
        isEthIndexed: false
      };
      const block = await ethers.provider.getBlock("latest");
      const priceRecord = {
        scaledPrice: ethers.utils.parseEther("12"),
        timestamp: block.timestamp,
        lastUpdated: 1701177091,
        roundId: 0
      };
      const isValidResponse = await internalPriceFeed.isFeedWorking(res.currResponse, res.prevResponse);
      expect(isValidResponse).to.be.false;

      const isPriceStaled = await internalPriceFeed.isPriceStale(priceRecord.timestamp, oracleRecord.heartbeat);
      expect(isPriceStaled).to.be.false;

      const oldOracleWorking = await internalPriceFeed.oracleRecords(FAKE_TOKEN_ADDRESS);
      const tx = await internalPriceFeed.processFeedResponses(
        FAKE_TOKEN_ADDRESS,
        oracleRecord,
        res.currResponse,
        res.prevResponse,
        priceRecord
      );
      expect((await internalPriceFeed.oracleRecords(FAKE_TOKEN_ADDRESS)).isFeedWorking).to.be.equal(!oldOracleWorking);
      await expect(tx).to.emit(internalPriceFeed, "PriceFeedStatusUpdated").withArgs(FAKE_TOKEN_ADDRESS, aggregator.address, false);
    });

    it("fetchPrice", async () => {
      let scaledPrice = ethers.utils.parseEther("2");
      let startTimestamp = await internalPriceFeed.timestamp();
      await internalPriceFeed.storePrice(
        ZERO_ADDRESS,
        scaledPrice,
        startTimestamp,
        2
      );

      await ethers.provider.send("evm_setNextBlockTimestamp", [startTimestamp.add(100).toNumber()]);
      await ethers.provider.send("evm_mine", []);

      let priceRecord = await internalPriceFeed.priceRecords(ZERO_ADDRESS);
      expect(priceRecord.roundId).to.be.equal(2);

      let res = await internalPriceFeed.fetchFeedResponses(aggregator.address, priceRecord.roundId);
      const isStaled = await internalPriceFeed.isPriceStale(priceRecord.timestamp, 3600);
      // go to the right branch: !updated == true
      expect(priceRecord.lastUpdated).to.be.not.equal(await internalPriceFeed.timestamp());
      expect(res.updated).to.be.false;
      expect(isStaled).to.be.false;

      // check returned price
      const returnedPrice = await ethers.provider.call({
        to: internalPriceFeed.address,
        data: encodeCallData("fetchPrice(address)", ["address"], [ZERO_ADDRESS])
      });
      expect(returnedPrice).to.be.equal(abi.encode(["uint"], [scaledPrice]))
    });

    it("_calcEthPrice", async () => {
      const amount = 12;
      const roundId = 2;
      const base = BigNumber.from("10");

      const data = await ethers.provider.call({
        to: internalPriceFeed.address,
        data: encodeCallData("calcEthPrice(uint256)", ["uint256"], [amount])
      });
      const price = abi.decode(['uint256'], data)[0];

      const roundData = await aggregator.getRoundData(roundId);
      const answer = roundData[1];
      const decimals = await aggregator.decimals();
      expect(price).to.be.equal(answer.mul(amount).div(base.pow(decimals)));
    });
  });

  describe("Revert", () => {
    it("Shoult revert if heartbeat > 86400", async () => {
      await expect(priceFeed.setOracle(
        FAKE_TOKEN_ADDRESS,
        aggregator.address,
        90000,
        "0x00000000",
        0,
        false
      )).to.be.revertedWithCustomError(priceFeed, "PriceFeed__HeartbeatOutOfBoundsError");
    });

    it("Should revert if feed not working when setOracle", async () => {
      await aggregator.setPrice(0);

      const res = await internalPriceFeed.fetchFeedResponses(aggregator.address, 0);
      const isWorking = await internalPriceFeed.isFeedWorking(res.currResponse, res.prevResponse);
      expect(isWorking).to.be.false;

      await expect(priceFeed.setOracle(
        FAKE_TOKEN_ADDRESS,
        aggregator.address,
        86400,
        "0x00000000",
        0,
        false
      ))
        .to.be.revertedWithCustomError(priceFeed, "PriceFeed__InvalidFeedResponseError")
        .withArgs(FAKE_TOKEN_ADDRESS);
    });

    it("Should revert if price is staled with setOracle", async () => {
      const priceRecord = await internalPriceFeed.priceRecords(ZERO_ADDRESS);

      await ethers.provider.send("evm_setNextBlockTimestamp", [priceRecord.timestamp + 3600 + 3600]);
      await ethers.provider.send("evm_mine", []);

      await aggregator.setUpdatedAt(priceRecord.timestamp);
      await aggregator.setPriceIsAlwaysUpToDate(false);

      const currentResponse = await internalPriceFeed.fetchCurrentFeedResponse(aggregator.address);
      const isStaled = await internalPriceFeed.isPriceStale(currentResponse.timestamp, 3600);
      expect(isStaled).to.be.true;
      await expect(internalPriceFeed.setOracle(
        FAKE_TOKEN_ADDRESS,
        aggregator.address,
        3600,
        "0x00000000",
        0,
        false
      ))
        .to.revertedWithCustomError(internalPriceFeed, "PriceFeed__FeedFrozenError")
        .withArgs(FAKE_TOKEN_ADDRESS);
    });

    it("Should revert if price lastUpdated is 0", async () => {
      const priceRecord = await priceFeed.priceRecords(FAKE_TOKEN_ADDRESS);
      await expect(priceFeed.fetchPrice(FAKE_TOKEN_ADDRESS))
        .to.revertedWithCustomError(priceFeed, "PriceFeed__UnknownFeedError")
        .withArgs(FAKE_TOKEN_ADDRESS);
    });

    it("Should revert if updated == false and price is staled", async () => {
      const priceRecord = await priceFeed.priceRecords(ZERO_ADDRESS);

      await ethers.provider.send("evm_setNextBlockTimestamp", [priceRecord.timestamp + 3600 + 3600]);
      await ethers.provider.send("evm_mine", []);
      await aggregator.setUpdatedAt(priceRecord.timestamp);
      await aggregator.setPriceIsAlwaysUpToDate(false);

      const feedRes = await internalPriceFeed.fetchFeedResponses(aggregator.address, 2);
      const isStaled = await internalPriceFeed.isPriceStale(priceRecord.timestamp, 3600);
      expect(feedRes.updated).to.be.false;
      expect(isStaled).to.be.true;

      await expect(priceFeed.fetchPrice(ZERO_ADDRESS))
        .to.be.revertedWithCustomError(priceFeed, "PriceFeed__FeedFrozenError")
        .withArgs(ZERO_ADDRESS);
    });
  });
});
