import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { AdminVoting, ListaCore, ListaToken, MockIncentiveVoting, MockInternalAdminVoting, TokenLocker } from "../../../typechain-types";
import { ETHER, WEEK, ZERO_ADDRESS, _1E18 } from "./constant";
import { encodeCallData } from "./contract";
import { getNthWeek, getWeek } from "./time";
const { time } = require('@nomicfoundation/hardhat-network-helpers');

export class AdminVotingHelper {
  // constants
  public readonly INITIAL_LISTA_TOKENS = ETHER.mul(1000);
  public readonly MAX_PCT = 10000; // 100%
  public readonly minCreateProposalPct = 2000; // 20%
  public readonly passingPct = 7000; // 70%
  public readonly bootstrapFinishWeek = 3;

  // signers
  public owner: Signer; // 40% weight
  public guardian: Signer;
  public newGuardian: Signer;
  public feeReceiver: Signer;
  public manager: Signer;
  public vault: Signer;
  public user1: Signer; // 10% weight
  public user2: Signer; // 20% weight
  public user3: Signer; // 30% weight

  // contracts
  private listaCore: ListaCore;
  private tokenLocker: TokenLocker;
  private listaToken: ListaToken;
  private incentiveVoting: MockIncentiveVoting;
  private mockAdminVoting: MockInternalAdminVoting;

  // properties
  private startTimestamp: BigNumber;
  private bootstrapFinish; // the last second of the bootstrapFinishWeek (3)

  constructor(
    signers: Signer[],
  ) {
    // signers
    [this.owner, this.guardian, this.newGuardian, this.feeReceiver, this.manager, this.vault, this.user1, this.user2, this.user3] = signers;

    // contracts
    this.listaCore = null as any;
    this.tokenLocker = null as any;
    this.listaToken = null as any;
    this.incentiveVoting = null as any;
    this.mockAdminVoting = null as any;

    // properties
    this.startTimestamp = null as any;
    this.bootstrapFinish = 0;
  }

  async init() {
    // deploy ListaCore
    this.listaCore = await ethers.deployContract("ListaCore", [
      await this.owner.getAddress(),
      this.guardian.getAddress(),
      ZERO_ADDRESS,
      await this.feeReceiver.getAddress()
    ]) as ListaCore;
    await this.listaCore.deployed();

    // deploy TokenLocker
    this.tokenLocker = await ethers.deployContract("MockInternalTokenLocker", [
      this.listaCore.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      await this.manager.getAddress(),
      _1E18,
    ]) as TokenLocker;

    // deploy ListaToken
    this.listaToken = await ethers.deployContract("ListaToken", [
      // ZERO_ADDRESS,
      await this.vault.getAddress(),
      ZERO_ADDRESS,
      this.tokenLocker.address,
    ]) as ListaToken;
    await this.listaToken.deployed();

    // deploy MockIncentiveVoting
    this.incentiveVoting = await ethers.deployContract("MockIncentiveVoting") as MockIncentiveVoting;
    await this.incentiveVoting.deployed();

    // init TokenLocker properties
    await this.tokenLocker.setLockToken(this.listaToken.address);
    await this.tokenLocker.setIncentiveVoter(this.incentiveVoting.address);

    // set properties
    this.startTimestamp = await this.listaCore.startTime();
    this.bootstrapFinish = this.getNthWeek(this.bootstrapFinishWeek + 1) - 1; // the last second of the week

    // deploy AdminVoting
    this.mockAdminVoting = await ethers.deployContract("MockInternalAdminVoting", [
      this.listaCore.address,
      this.tokenLocker.address,
      this.minCreateProposalPct, // 20%
      this.passingPct, // 70%
      this.bootstrapFinish,
    ]) as MockInternalAdminVoting;

    // mint INITIAL_LISTA_TOKENS to each user
    await this.listaToken.connect(this.vault).mintToVault(this.INITIAL_LISTA_TOKENS.mul(10));
    await this.listaToken.connect(this.vault).transfer(this.owner.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.vault).transfer(this.user1.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.vault).transfer(this.user2.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.vault).transfer(this.user3.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.vault).transfer(this.guardian.getAddress(), this.INITIAL_LISTA_TOKENS);

    return {
      adminVoting: this.mockAdminVoting,
    };
  }

  adminVoting(user: Signer = this.owner) {
    return this.mockAdminVoting.connect(user);
  }

  async now(): Promise<number> {
    return time.latest();
  }

  async getWeek(): Promise<number> {
    return getWeek(this.startTimestamp.toNumber(), await this.now());
  }

  getNthWeek(n: number): number {
    return getNthWeek(this.startTimestamp.toNumber(), n);
  }

  async increaseTo(week: number) {
    const currentWeek = await this.getWeek();
    if (currentWeek > week) {
      throw new Error("Cannot jump to a past week");
    } else if (currentWeek === week) {
      return;
    }

    await time.increaseTo(this.getNthWeek(week));
  }

  async increase(seconds: number) {
    await time.increase(seconds);
  }

  /**
   * All users lock some tokens. Total weight is 10 * 10 = 100.
   * user1: 1 token for 10 week. 10% weight
   * user2: 2 tokens for 10 weeks. 20% weight
   * user3: 3 tokens for 10 weeks. 30% weight
   * owner: 4 tokens for 10 weeks. 40% weight
   */
  async allUsersLock() {
    await this.tokenLocker.connect(this.user1).lock(this.user1.getAddress(), 1, 10);
    await this.tokenLocker.connect(this.user2).lock(this.user2.getAddress(), 2, 10);
    await this.tokenLocker.connect(this.user3).lock(this.user3.getAddress(), 3, 10);
    await this.tokenLocker.connect(this.owner).lock(this.owner.getAddress(), 4, 10);
  }

  async lock(user: Signer, amount: BigNumber, week: number) {
    await this.tokenLocker.connect(user).lock(user.getAddress(), amount, week);
  }

  async prepareToProposal(week: number) {
    await this.increaseTo(week);

    // lock tokens with 100 total weight
    await this.allUsersLock();

    // jump to the next week, so the total weight of the last week is 100
    await this.increase(WEEK);
  }

  /**
   * For testing. Create a proposal by user2.
   * 
   * 1. jump to the first week
   * 2. lock tokens with 100 total weight
   * 3. jump to the second week
   * 4. create a proposal by user2
   */
  async prepareWithCreateOneProposal() {
    const setNum = 1;
    await this.prepareToProposal(1);

    // create a proposal. the proposalId should be 0.
    await this.adminVoting(this.user2)
      .createNewProposal(
        this.user2.getAddress(),
        [this.newProposalPayload(setNum)]
      );
    return setNum;
  }

  async executeThePreparedProposal() {
    await this.voteToPassTheProposal(0);
    await this.increase(WEEK);
    await this.adminVoting().executeProposal(0);
  }

  async getTotalWeight(week?: number): Promise<BigNumber> {
    if (week === undefined) {
      week = await this.getWeek();
    }
    return this.tokenLocker.getTotalWeightAt(week);
  }

  async getAccountWeight(account: Signer, week?: number): Promise<BigNumber> {
    if (week === undefined) {
      week = await this.getWeek();
    }
    return this.tokenLocker.getAccountWeightAt(account.getAddress(), week);
  }

  /**
   * Create a new proposal to set the mutableNum.
   */
  newProposalPayload(_num: number): AdminVoting.ActionStruct {
    return {
      target: this.adminVoting().address,
      data: encodeCallData('setMutableNum(uint256)', ['uint256'], [_num]),
    };
  }

  newProposalPayloadSetMinCreateProposalPct(_pct: number): AdminVoting.ActionStruct {
    return {
      target: this.adminVoting().address,
      data: encodeCallData('setMinCreateProposalPct(uint256)', ['uint256'], [_pct]),
    };
  }

  newProposalPayloadSetPassingPct(_pct: number): AdminVoting.ActionStruct {
    return {
      target: this.adminVoting().address,
      data: encodeCallData('setPassingPct(uint256)', ['uint256'], [_pct]),
    };
  }

  /**
   * Create a new proposal to set guardian.
   */
  async newProposalPayloadSetGuardian(newGuardian: Signer): Promise<AdminVoting.ActionStruct> {
    return {
      target: this.listaCore.address,
      data: encodeCallData('setGuardian(address)', ['address'], [await newGuardian.getAddress()]),
    };
  }

  async voteToPassTheProposal(proposalId: number, passWeight: boolean = true) {
    await this.adminVoting(this.user1).voteForProposal(this.user1.getAddress(), proposalId, 0);
    await this.adminVoting(this.user2).voteForProposal(this.user2.getAddress(), proposalId, 0);
    if (passWeight) {
      await this.adminVoting(this.user3).voteForProposal(this.user3.getAddress(), proposalId, 0);
      await this.adminVoting(this.owner).voteForProposal(this.owner.getAddress(), proposalId, 0);
    }
  }

  async expectProposalCount(expected: number) {
    expect(await this.adminVoting().getProposalCount())
      .to.be.equal(expected);
  }

  async expectMutableNum(expected: number) {
    expect(await this.adminVoting().mutableNum())
      .to.be.equal(expected);
  }
}
