import { expect } from "chai";
import { Signer } from "ethers";
import { getContractAddress } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { EmissionSchedule, ListaCore, ListaVault, MockIncentiveVoting, MockListaToken, MockListaVault, TokenLocker } from "../../../../typechain-types";
import { ETHER, ZERO_ADDRESS, _1E18 } from "../../utils";

describe("EmissionSchedule Contract", () => {
  // constants
  const MAX_PCT = 10000;
  let MAX_LOCK_WEEKS = 52;
  const INITIAL_LISTA_TOKENS = ETHER.mul(1000);
  const INITIAL_LOCK_WEEKS = 52;
  const LOCK_DECAY_WEEKS = 52;
  const WEEKLY_PCT = 10;
  const SCHEDULED_WEEKLY_PCT = [] as [number, number][];

  // contracts
  let emissionSchedule: EmissionSchedule;
  let listaCore: ListaCore;
  let tokenLocker: TokenLocker;
  let listaToken: MockListaToken;
  let listaVault: ListaVault;
  let incentiveVoting: MockIncentiveVoting

  // signers
  let owner: Signer;
  let guardian: Signer;
  let feeReceiver: Signer;
  let manager: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  beforeEach(async () => {
    // signers
    [owner, guardian, feeReceiver, manager, user1, user2, user3] = await ethers.getSigners();

    // deploy ListaCore
    listaCore = await ethers.deployContract("ListaCore", [
      owner.getAddress(),
      guardian.getAddress(),
      ZERO_ADDRESS,
      feeReceiver.getAddress()
    ]) as ListaCore;
    await listaCore.deployed();

    // deploy TokenLocker
    tokenLocker = await ethers.deployContract("TokenLocker", [
      listaCore.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      manager.getAddress(),
      _1E18,
    ]) as TokenLocker;
    await tokenLocker.deployed();

    // calculate ListaVault address
    const listaVaultAddress = getContractAddress({
      from: await owner.getAddress(),
      nonce: (await ethers.provider.getTransactionCount(await owner.getAddress())) + 1,
    })

    // deploy ListaToken
    listaToken = await ethers.deployContract("MockListaToken", [
      listaVaultAddress,
      ZERO_ADDRESS,
      tokenLocker.address,
    ]) as MockListaToken;
    await listaToken.deployed();

    // deploy ListaVault
    listaVault = await ethers.deployContract("ListaVault", [
      listaCore.address,
      listaToken.address,
      tokenLocker.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      await manager.getAddress(),
    ]) as ListaVault;
    await listaVault.deployed();
    expect(listaVault.address).to.be.equal(listaVaultAddress);

    // deploy MockIncentiveVoting
    incentiveVoting = await ethers.deployContract("MockIncentiveVoting") as MockIncentiveVoting;
    await incentiveVoting.deployed();

    // deploy EmissionSchedule
    emissionSchedule = await ethers.deployContract("EmissionSchedule", [
      listaCore.address,
      incentiveVoting.address,
      listaVault.address,
      INITIAL_LOCK_WEEKS,
      LOCK_DECAY_WEEKS,
      WEEKLY_PCT,
      SCHEDULED_WEEKLY_PCT,
    ]) as EmissionSchedule;
    await emissionSchedule.deployed();

    // init properties
    await tokenLocker.setLockToken(listaToken.address);
    MAX_LOCK_WEEKS = await emissionSchedule.MAX_LOCK_WEEKS().then((v) => v.toNumber());

    // mint to users
    await listaToken._mintInternal(await manager.getAddress(), INITIAL_LISTA_TOKENS.mul(1000));
    await listaToken.connect(manager).transfer(listaVault.address, INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await owner.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await user1.getAddress(), INITIAL_LISTA_TOKENS);
  });

  describe("getWeeklyPctSchedule()", async () => {
    it("Return an empty array when no weekly percentage", async () => {
      expect(await emissionSchedule.getWeeklyPctSchedule())
        .to.be.an("array").that.is.empty;
    });

    it("Return the weekly percentage schedule", async () => {
      const schedules = [[2, 4500], [1, 5000]] as [number, number][];
      await emissionSchedule.setWeeklyPctSchedule(schedules);

      expect(await emissionSchedule.getWeeklyPctSchedule())
        .to.deep.equal(schedules);
    });
  });

  describe("setWeeklyPctSchedule(uint64[2][])", async () => {
    it("Should revert if caller is not owner", async () => {
      const schedules = [[2, 4500], [1, 5000]] as [number, number][];

      await expect(emissionSchedule.connect(user1).setWeeklyPctSchedule(schedules))
        .to.be.revertedWith("Only owner");
    });

    it("Should revert if the schedule is not sorted by week in descending order", async function () {
      const invalidSchedule = [[1, 4500], [1, 5000]] as [number, number][];
      await expect(emissionSchedule.setWeeklyPctSchedule(invalidSchedule))
        .to.be.revertedWith("Must sort by week descending");
    });

    it("Should revert if any weekly percentage in the schedule exceeds MAX_PCT", async function () {
      const invalidSchedule = [[1, MAX_PCT + 1]] as [number, number][];
      await expect(emissionSchedule.setWeeklyPctSchedule(invalidSchedule))
        .to.be.revertedWith("Cannot exceed MAX_PCT");
    });

    it("Should revert if week is 0", async () => {
      const invalidSchedule = [[0, 4000]] as [number, number][];
      await expect(emissionSchedule.setWeeklyPctSchedule(invalidSchedule))
        .to.be.revertedWith("Cannot schedule past weeks");
    });

    it("Set the weekly percentage schedule", async function () {
      const schedules = [[2, 4500], [1, 5000]] as [number, number][];
      await emissionSchedule.setWeeklyPctSchedule(schedules);
      const schedule = await emissionSchedule.getWeeklyPctSchedule();
      expect(schedule).to.deep.equal(schedules);
    });
  });

  describe("setLockParameters(uint64, uint64)", async () => {
    it("Should revert if caller is not owner", async () => {
      await expect(emissionSchedule.connect(user1).setLockParameters(1, 1))
        .to.be.revertedWith("Only owner");
    });

    it("Should revert if _lockWeeks exceed MAX_LOCK_WEEKS", async () => {
      await expect(emissionSchedule.setLockParameters(MAX_LOCK_WEEKS + 1, 1))
        .to.be.revertedWith("Cannot exceed MAX_LOCK_WEEKS");
    });

    it("Should revert if _lockDecayWeeks is 0", async () => {
      await expect(emissionSchedule.setLockParameters(1, 0))
        .to.be.revertedWith("Decay weeks cannot be 0");
    });

    it("Set the lock parameters", async () => {
      await emissionSchedule.setLockParameters(1, 1);

      const lockWeeks = await emissionSchedule.lockWeeks();
      const lockDecayWeeks = await emissionSchedule.lockDecayWeeks();
      expect(lockWeeks).to.be.equal(1);
      expect(lockDecayWeeks).to.be.equal(1);
    });
  });

  describe("getReceiverWeeklyEmissions(uint256, uint256, uint256)", async () => {
    it("Return the receiver's weekly emissions", async () => {
      const id = 1;
      const week = 2;
      const totalWeeklyEmissions = 1000;

      // mock incentive voting
      const mockPct = ETHER.div(100);
      await incentiveVoting.mockSetReceiverVotePct(id, week, mockPct);

      expect(await emissionSchedule.callStatic.getReceiverWeeklyEmissions(id, week, totalWeeklyEmissions))
        .to.be.equal(mockPct.mul(totalWeeklyEmissions).div(_1E18));
    });
  });

  describe("getTotalWeeklyEmissions(uint256, uint256)", async () => {
    let mockListVault: MockListaVault;
    let mockEmissionSchedule: EmissionSchedule;

    beforeEach(async () => {
      // deploy MockListaVault
      mockListVault = await ethers.deployContract("MockListaVault") as MockListaVault;
      await mockListVault.deployed();

      // deploy EmissionSchedule
      mockEmissionSchedule = await ethers.deployContract("EmissionSchedule", [
        listaCore.address,
        incentiveVoting.address,
        mockListVault.address,
        INITIAL_LOCK_WEEKS,
        LOCK_DECAY_WEEKS,
        WEEKLY_PCT,
        SCHEDULED_WEEKLY_PCT,
      ]) as EmissionSchedule;
      await mockEmissionSchedule.deployed();

      // init properties
      await mockListVault.setEmissionSchedule(mockEmissionSchedule.address);
    });

    it("Should revert if caller is not ListaVault", async () => {
      await expect(emissionSchedule.getTotalWeeklyEmissions(1, 1))
        .to.be.revertedWithoutReason();
    });

    it("Return when lock is 0", async () => {
      const week = 1;
      const unallocatedTotal = 0;

      // set lock parameters
      const lockWeeks = 0;
      const lockDecayWeeks = LOCK_DECAY_WEEKS;
      await mockEmissionSchedule.setLockParameters(lockWeeks, lockDecayWeeks);

      // set scheduled weekly percentage
      await mockEmissionSchedule.setWeeklyPctSchedule([[1, 5000]]);

      await expect(mockListVault.getTotalWeeklyEmissions(week, unallocatedTotal))
        .not.to.be.reverted;
    });

    it("Return when lock greater than 0 and week % lockDecayWeeks is 0", async () => {
      const week = 0;
      const unallocatedTotal = 0;

      // set lock parameters
      const lockWeeks = 1;
      const lockDecayWeeks = LOCK_DECAY_WEEKS + 1;
      await mockEmissionSchedule.setLockParameters(lockWeeks, lockDecayWeeks);

      await expect(mockListVault.getTotalWeeklyEmissions(week, unallocatedTotal))
        .not.to.be.reverted;
    });
  });
});
