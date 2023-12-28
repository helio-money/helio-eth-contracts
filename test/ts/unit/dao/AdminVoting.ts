import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { AdminVotingHelper, WEEK } from "../../utils";

describe("AdminVoting Contract", async () => {
  let helper: AdminVotingHelper;

  beforeEach(async () => {
    helper = new AdminVotingHelper(await ethers.getSigners());
    await helper.init();
  });

  describe("properties", async () => {
    it("MAX_PCT should be 10000", async () => {
      expect(await helper.adminVoting().MAX_PCT())
        .to.be.equal(helper.MAX_PCT);
    });
  });

  describe("getProposalCount()", async () => {
    it("Return 0 when no proposal", async () => {
      await helper.expectProposalCount(0);
    });

    it("Return length of proposal array", async () => {
      // create a proposal
      await helper.prepareWithCreateOneProposal();

      await helper.expectProposalCount(1);
    });
  });

  describe("minCreateProposalWeight()", async () => {
    it("Return 0 at the first week", async () => {
      // lock tokens with 100 total weight
      await helper.allUsersLock();

      // current week is 0
      expect(await helper.getWeek())
        .to.be.equal(0);

      // current totalWeight is 100
      expect(await helper.getTotalWeight())
        .to.be.equal(100);

      // minCreateProposalWeight is 0
      expect(await helper.adminVoting().minCreateProposalWeight())
        .to.be.equal(0);
    });

    it("Return 0 if the total weight of the last week is 0", async () => {
      // jump to the first week
      await helper.increaseTo(1);

      // lock tokens with 100 total weight
      await helper.allUsersLock();

      // get the total weight at the last week
      const lastWeekTotalWeight = await helper.getTotalWeight(0);
      expect(lastWeekTotalWeight)
        .to.be.equal(0);

      // expect 0
      expect(await helper.adminVoting().minCreateProposalWeight())
        .to.be.equal(helper.minCreateProposalPct * lastWeekTotalWeight.toNumber() / helper.MAX_PCT)
        .to.be.equal(0);
    });

    it("Return minCreateProposalPct * totalWeight of the last week / MAX_PCT", async () => {
      await helper.prepareToProposal(1);

      // get the total weight at the last week
      const lastWeekTotalWeight = await helper.getTotalWeight(1);
      expect(lastWeekTotalWeight)
        .to.be.equal(100);

      // expect 2000 * 100 / 10000 = 20
      expect(await helper.adminVoting().minCreateProposalWeight())
        .to.be.equal(helper.minCreateProposalPct * lastWeekTotalWeight.toNumber() / helper.MAX_PCT)
        .to.be.equal(20);
    });
  });

  describe("getProposalData(uint256)", async () => {
    it("Should revert if the id does not exist", async () => {
      await expect(helper.adminVoting().getProposalData(1))
        .to.be.revertedWithPanic(0x32);
    });

    it("Return a unexecutable proposal if the proposal has been processed", async () => {
      // create a proposal
      await helper.prepareWithCreateOneProposal();
      const week = await helper.getWeek();
      const createdAt = await helper.now();

      // execute the proposal
      await helper.executeThePreparedProposal();

      // get proposal data
      const proposalData = await helper.adminVoting().getProposalData(0);
      expect(proposalData.week)
        .to.be.equal(week - 1);
      expect(proposalData.createdAt)
        .to.be.equal(createdAt);
      expect(proposalData.currentWeight)
        .to.be.greaterThanOrEqual(proposalData.requiredWeight);
      expect(proposalData.executed)
        .to.be.true;
      expect(proposalData.canExecute)
        .to.be.false;
    });

    it("Return a unexecutable proposal if the weight is less than required", async () => {
      // create a proposal
      await helper.prepareWithCreateOneProposal();
      const week = await helper.getWeek();
      const createdAt = await helper.now();

      // vote for the proposal
      await helper.voteToPassTheProposal(0, false);

      // get proposal data
      const proposalData = await helper.adminVoting().getProposalData(0);
      expect(proposalData.week)
        .to.be.equal(week - 1);
      expect(proposalData.createdAt)
        .to.be.equal(createdAt);
      expect(proposalData.currentWeight)
        .to.be.lessThan(proposalData.requiredWeight);
      expect(proposalData.executed)
        .to.be.false;
      expect(proposalData.canExecute)
        .to.be.false;
    });

    it("Return a unexecutable proposal when the time before the canExecutionAfter", async () => {
      // create a proposal
      await helper.prepareWithCreateOneProposal();
      const week = await helper.getWeek();
      const createdAt = await helper.now();

      // vote for the proposal
      await helper.voteToPassTheProposal(0);

      // get proposal data
      const proposalData = await helper.adminVoting().getProposalData(0);
      expect(proposalData.week)
        .to.be.equal(week - 1);
      expect(proposalData.createdAt)
        .to.be.equal(createdAt);
      expect(proposalData.currentWeight)
        .to.be.greaterThanOrEqual(proposalData.requiredWeight);
      expect(proposalData.executed)
        .to.be.false;
      expect(proposalData.canExecute)
        .to.be.false;
    });

    it("Return a unexecutable proposal if expired", async () => {
      // create a proposal
      await helper.prepareWithCreateOneProposal();
      const week = await helper.getWeek();
      const createdAt = await helper.now();

      // vote for the proposal
      await helper.voteToPassTheProposal(0);

      // expire the proposal
      const MIN_TIME_TO_EXECUTION = await helper.adminVoting().MIN_TIME_TO_EXECUTION();
      const MAX_TIME_TO_EXECUTION = await helper.adminVoting().MAX_TIME_TO_EXECUTION();
      await helper.increase(MIN_TIME_TO_EXECUTION.add(MAX_TIME_TO_EXECUTION).toNumber());

      // get proposal data
      const proposalData = await helper.adminVoting().getProposalData(0);
      expect(proposalData.week)
        .to.be.equal(week - 1);
      expect(proposalData.createdAt)
        .to.be.equal(createdAt);
      expect(proposalData.currentWeight)
        .to.be.greaterThanOrEqual(proposalData.requiredWeight);
      expect(proposalData.executed)
        .to.be.false;
      expect(proposalData.canExecute)
        .to.be.false;
    });

    it("Return a executable proposal", async () => {
      // create a proposal
      await helper.prepareWithCreateOneProposal();
      const week = await helper.getWeek();
      const createdAt = await helper.now();

      // vote for the proposal
      await helper.voteToPassTheProposal(0);

      // expire the proposal
      const MIN_TIME_TO_EXECUTION = await helper.adminVoting().MIN_TIME_TO_EXECUTION();
      await helper.increase(MIN_TIME_TO_EXECUTION.toNumber() + 1);

      // get proposal data
      const proposalData = await helper.adminVoting().getProposalData(0);
      expect(proposalData.week)
        .to.be.equal(week - 1);
      expect(proposalData.createdAt)
        .to.be.equal(createdAt);
      expect(proposalData.currentWeight)
        .to.be.greaterThanOrEqual(proposalData.requiredWeight);
      expect(proposalData.executed)
        .to.be.false;
      expect(proposalData.canExecute)
        .to.be.true;
    });
  });

  describe("createNewProposal(address, Action[]) ", async () => {
    it("Should revert if isn't the caller or delegated", async () => {
      await expect(helper.adminVoting(helper.user1).createNewProposal(helper.user2.getAddress(), []))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert if the payload is empty", async () => {
      await expect(helper.adminVoting(helper.user1).createNewProposal(helper.user1.getAddress(), []))
        .to.be.revertedWith("Empty payload");
    });

    it("Should revert if the account create proposal too frequently", async () => {
      // create a proposal by user1
      await helper.prepareWithCreateOneProposal();
      await helper.expectProposalCount(1);

      // go through less than 1 week
      await helper.increase(WEEK - 1);

      await expect(helper.adminVoting(helper.user2)
        .createNewProposal(helper.user2.getAddress(), [helper.newProposalPayload(2)]))
        .to.be.revertedWith("MIN_TIME_BETWEEN_PROPOSALS");
      await helper.expectProposalCount(1);
    });

    it("Should revert at the first week", async () => {
      await expect(helper.adminVoting(helper.user2)
        .createNewProposal(helper.user2.getAddress(), [helper.newProposalPayload(2)]))
        .to.be.revertedWith("No proposals in first week");
    });

    it("Should revert if the total weight of the last week is less than minCreateProposalWeight", async () => {
      await helper.prepareToProposal(1);
      await helper.increase(WEEK);

      const accountWeight = await helper.getAccountWeight(helper.user1);
      const minCreateProposalWeight = await helper.adminVoting().minCreateProposalWeight();
      expect(accountWeight)
        .to.be.lessThan(minCreateProposalWeight);

      await expect(helper.adminVoting(helper.user1)
        .createNewProposal(helper.user1.getAddress(), [helper.newProposalPayload(2)]))
        .to.be.revertedWith("Not enough weight to propose");
    });

    it("Should revert if proposal to set guardian during bootstrap", async () => {
      // prepare and jump to the last week of bootstrap
      await helper.prepareToProposal(helper.bootstrapFinishWeek - 1);

      // create a new proposal to set the new guardian
      await expect(helper.adminVoting(helper.user2)
        .createNewProposal(helper.user2.getAddress(), [await helper.newProposalPayloadSetGuardian(helper.newGuardian)]))
        .to.be.revertedWith("Cannot change guardian during bootstrap");
    });

    it("Should revert if required weight is 0", async () => {
      const _num = 100;
      await helper.lock(helper.user2, BigNumber.from(1), 2);
      await helper.increase(WEEK * 2);

      // total weight is greater than 0, but required weight is 0
      const totalWeight = await helper.getTotalWeight(await (helper.getWeek()) - 1);
      const requiredWeight = totalWeight.mul(helper.passingPct).div(helper.MAX_PCT);
      expect(requiredWeight)
        .to.be.equal(0);

      // create a new proposal to set the mutableNum to _num
      await expect(helper.adminVoting(helper.user2)
        .createNewProposal(helper.user2.getAddress(), [helper.newProposalPayload(_num)]))
        .to.be.revertedWith("Not enough total lock weight");
    });

    it("Create a new proposal", async () => {
      const _num = 100;
      await helper.prepareToProposal(1);

      // create a new proposal to set the mutableNum to _num
      await expect(helper.adminVoting(helper.user2)
        .createNewProposal(helper.user2.getAddress(), [helper.newProposalPayload(_num)]))
        .not.to.be.reverted;

      await helper.expectProposalCount(1);
    });

    it("Create a new proposal by delegated", async () => {
      const _num = 100;
      await helper.prepareToProposal(1);

      // user2 delegate user1
      await helper.adminVoting(helper.user2).setDelegateApproval(helper.user1.getAddress(), true);

      // create a new proposal to set the mutableNum to _num by user2, but caller is user1
      await expect(helper.adminVoting(helper.user1)
        .createNewProposal(helper.user2.getAddress(), [helper.newProposalPayload(_num)]))
        .not.to.be.reverted;

      await helper.expectProposalCount(1);
    });

    it("Create a new proposal to set guardian", async () => {
      await helper.prepareToProposal(await helper.bootstrapFinishWeek);

      // create a new proposal to set the new guardian
      await expect(helper.adminVoting(helper.user2)
        .createNewProposal(helper.user2.getAddress(), [await helper.newProposalPayloadSetGuardian(helper.newGuardian)]))
        .not.to.be.reverted;

      await helper.expectProposalCount(1);
    });

  });

  describe("voteForProposal(address, uint256, uint256)", async () => {
    beforeEach(async () => {
      // create a proposal by user2
      await helper.prepareWithCreateOneProposal();
    });

    it("Should revert if vote by unapproved delegate", async () => {
      // get proposal data
      let proposalData = await helper.adminVoting().getProposalData(0);
      const user3Weight = await helper.getAccountWeight(helper.user3, proposalData.week.toNumber());
      const ownerWeight = await helper.getAccountWeight(helper.owner, proposalData.week.toNumber());
      const votingWeight = user3Weight.add(ownerWeight);

      expect(votingWeight)
        .to.be.greaterThanOrEqual(proposalData.requiredWeight);

      await expect(helper.adminVoting(helper.user1).voteForProposal(helper.user3.getAddress(), 0, 1))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert if the proposal does not exist", async () => {
      // user1 vote for the proposal
      await expect(helper.adminVoting(helper.user1).voteForProposal(helper.user1.getAddress(), 1, 1))
        .to.be.revertedWith("Invalid ID");
    });

    it("Should revert if the proposal has been executed", async () => {
      // another user vote lock tokens
      await helper.lock(helper.guardian, BigNumber.from(1), 10);

      // execute the proposal
      await helper.executeThePreparedProposal();

      // user1 vote for the proposal
      await expect(helper.adminVoting(helper.guardian).voteForProposal(helper.guardian.getAddress(), 0, 1))
        .to.be.revertedWith("Proposal already processed");
    });

    it("Should revert if the voting period has closed", async () => {
      await helper.increase((await helper.adminVoting().VOTING_PERIOD()).toNumber());

      // user1 vote for the proposal
      await expect(helper.adminVoting(helper.user1).voteForProposal(helper.user1.getAddress(), 0, 1))
        .to.be.revertedWith("Voting period has closed");
    });

    it("Should revert if the user has voted", async () => {
      // user1 vote for the proposal
      await helper.adminVoting(helper.user1).voteForProposal(helper.user1.getAddress(), 0, 1);

      // user1 vote for the proposal again
      await expect(helper.adminVoting(helper.user1).voteForProposal(helper.user1.getAddress(), 0, 1))
        .to.be.revertedWith("Already voted");
    });

    it("Should revert if the user vote with 0 weight", async () => {
      // newGuardian vote for the proposal
      await expect(helper.adminVoting(helper.newGuardian).voteForProposal(helper.newGuardian.getAddress(), 0, 0))
        .to.be.revertedWith("No vote weight");
    });

    it("Should revert if the user has not enough weight", async () => {
      // user who has no weight vote for the proposal
      await expect(helper.adminVoting(helper.newGuardian).voteForProposal(helper.newGuardian.getAddress(), 0, 1))
        .to.be.revertedWith("Weight exceeds account weight");
    });

    it("Vote for the proposal using all account weight if the weight is 0", async () => {
      // get proposal data
      const proposalData = await helper.adminVoting().getProposalData(0);
      const accountweight = await helper.getAccountWeight(helper.user1, proposalData.week.toNumber());

      // user1 vote for the proposal with 0 weight
      expect(await helper.adminVoting(helper.user1).voteForProposal(helper.user1.getAddress(), 0, 0))
        .not.to.be.reverted;

      expect(await helper.adminVoting().accountVoteWeights(helper.user1.getAddress(), 0))
        .to.be.equal(accountweight)
        .not.to.be.equal(0);
    });

    it("Update canExecuteAfter if the proposal weight is greater than requiredWeight", async () => {
      // get proposal data
      let proposalData = await helper.adminVoting().getProposalData(0);
      const user3Weight = await helper.getAccountWeight(helper.user3, proposalData.week.toNumber());
      const ownerWeight = await helper.getAccountWeight(helper.owner, proposalData.week.toNumber());
      const votingWeight = user3Weight.add(ownerWeight);

      expect(votingWeight)
        .to.be.greaterThanOrEqual(proposalData.requiredWeight);

      // user3 vote for the proposal
      await helper.adminVoting(helper.user3).voteForProposal(helper.user3.getAddress(), 0, user3Weight);
      // owner vote for the proposal
      await helper.adminVoting(helper.owner).voteForProposal(helper.owner.getAddress(), 0, ownerWeight);

      // proposal should can be executed
      proposalData = await helper.adminVoting().getProposalData(0);
      expect(proposalData.canExecuteAfter)
        .to.be.greaterThan(0);
      expect(proposalData.currentWeight)
        .to.be.equal(votingWeight);
    });
  });

  describe("cancelProposal(uint256)", async () => {
    beforeEach(async () => {
      // create a proposal by user2
      await helper.prepareWithCreateOneProposal();
    });

    it("Should revert if cancel by non-guardian", async () => {
      await expect(helper.adminVoting(helper.user1).cancelProposal(0))
        .to.be.revertedWith("Only guardian can cancel proposals");
    });

    it("Should revert if the proposal does not exist", async () => {
      await expect(helper.adminVoting(helper.guardian).cancelProposal(1))
        .to.be.revertedWith("Invalid ID");
    });

    it("Should revert when cancel the set guardian proposal", async () => {
      // jump to the last week of bootstrap
      await helper.prepareToProposal(await helper.bootstrapFinishWeek);

      // create a new proposal to set the new guardian
      await expect(helper.adminVoting(helper.user3)
        .createNewProposal(helper.user3.getAddress(), [await helper.newProposalPayloadSetGuardian(helper.newGuardian)]))
        .not.to.be.reverted;

      // cancel the proposal
      await expect(helper.adminVoting(helper.guardian).cancelProposal(1))
        .to.be.revertedWith("Guardian replacement not cancellable");
    });

    it("Cancel the proposal", async () => {
      // proposal should not be processed before cancel
      let proposalData = await helper.adminVoting().getProposalDataById(0);
      expect(proposalData.processed)
        .to.be.false;

      // cancel the proposal
      await expect(helper.adminVoting(helper.guardian).cancelProposal(0))
        .not.to.be.reverted;

      // proposal should be processed after cancel
      proposalData = await helper.adminVoting().getProposalDataById(0);
      expect(proposalData.processed)
        .to.be.true;
    });

  });

  describe("executeProposal(uint256)", async () => {
    let setNum: number;
    beforeEach(async () => {
      // create a proposal by user2
      setNum = await helper.prepareWithCreateOneProposal();

      // vote for the proposal
      await helper.voteToPassTheProposal(0);
      // // user1 vote for the proposal
      // await helper.adminVoting(helper.user1).voteForProposal(helper.user1.getAddress(), 0, 0);
      // // user2 vote for the proposal
      // await helper.adminVoting(helper.user2).voteForProposal(helper.user2.getAddress(), 0, 0);
      // // user3 vote for the proposal
      // await helper.adminVoting(helper.user3).voteForProposal(helper.user3.getAddress(), 0, 0);
      // // owner vote for the proposal
      // await helper.adminVoting(helper.owner).voteForProposal(helper.owner.getAddress(), 0, 0);
    });

    it("Should revert if the proposal does not exist", async () => {
      await expect(helper.adminVoting(helper.user1).executeProposal(1))
        .to.be.revertedWith("Invalid ID");
    });

    it("Should revert if the proposal has been processes", async () => {
      // cancel the proposal
      await helper.adminVoting(helper.guardian).cancelProposal(0);

      await expect(helper.adminVoting(helper.user1).executeProposal(0))
        .to.be.revertedWith("Already processed");
    });

    it("Should revert if the proposal has not been passed", async () => {
      // jump to the last week of bootstrap
      await helper.prepareToProposal(await helper.bootstrapFinishWeek);

      // create a new proposal to set the new guardian
      await expect(helper.adminVoting(helper.user3)
        .createNewProposal(helper.user3.getAddress(), [await helper.newProposalPayloadSetGuardian(helper.newGuardian)]))
        .not.to.be.reverted;

      await expect(helper.adminVoting(helper.user3).executeProposal(1))
        .to.be.revertedWith("Not passed");
    });

    it("Should revert when before the canExecuteAfter", async () => {
      const proposalData = await helper.adminVoting().getProposalData(0);
      expect(await helper.now())
        .to.be.lessThan(proposalData.canExecuteAfter);

      await expect(helper.adminVoting(helper.user3).executeProposal(0))
        .to.be.revertedWith("MIN_TIME_TO_EXECUTION");
    });

    it("Should revert if the proposal has been expired", async () => {
      const MIN_TIME_TO_EXECUTION = await helper.adminVoting().MIN_TIME_TO_EXECUTION();
      const MAX_TIME_TO_EXECUTION = await helper.adminVoting().MAX_TIME_TO_EXECUTION();
      await helper.increase(MIN_TIME_TO_EXECUTION.add(MAX_TIME_TO_EXECUTION).toNumber());

      await expect(helper.adminVoting(helper.user3).executeProposal(0))
        .to.be.revertedWith("MAX_TIME_TO_EXECUTION");
    });

    it("Execute the proposal", async () => {
      await helper.increase(WEEK);

      // before execute
      await helper.expectMutableNum(0);

      // execute the proposal
      await expect(helper.adminVoting(helper.user3).executeProposal(0))
        .not.to.be.reverted;

      // after execute
      await helper.expectMutableNum(setNum);
    });
  });

  describe("setMinCreateProposalPct(uint256)", async () => {
    it("Should revert if isn't called by proposal", async () => {
      await expect(helper.adminVoting(helper.user1).setMinCreateProposalPct(1))
        .to.be.revertedWith("Only callable via proposal");
    });

    it("Should revert if the pct is greater than MAX_PCT", async () => {
      const MAX_PCT = await helper.adminVoting().MAX_PCT();
      await helper.prepareToProposal(1);
      // create a new proposal to set the minCreateProposalPct to MAX_PCT + 1
      await helper.adminVoting(helper.user2)
        .createNewProposal(
          helper.user2.getAddress(),
          [helper.newProposalPayloadSetMinCreateProposalPct(MAX_PCT.add(1).toNumber())]
        );

      // vote and execute for the proposal
      await helper.voteToPassTheProposal(0);
      await helper.increase(WEEK);

      await expect(helper.adminVoting().executeProposal(0))
        .to.be.revertedWith("Invalid value");
    });

    it("Set minCreateProposalPct by proposal", async () => {
      const MAX_PCT = await helper.adminVoting().MAX_PCT();
      await helper.prepareToProposal(1);
      // create a new proposal to set the minCreateProposalPct to MAX_PCT + 1
      await helper.adminVoting(helper.user2)
        .createNewProposal(
          helper.user2.getAddress(),
          [helper.newProposalPayloadSetMinCreateProposalPct(MAX_PCT.toNumber())]
        );

      // vote and execute for the proposal
      await helper.voteToPassTheProposal(0);
      await helper.increase(WEEK);

      await expect(helper.adminVoting().executeProposal(0))
        .not.to.be.reverted;

      expect(await helper.adminVoting().minCreateProposalPct())
        .to.be.equal(MAX_PCT);
    });
  });

  describe("setPassingPct(uint256)", async () => {
    it("Should revert if isn't called by proposal", async () => {
      await expect(helper.adminVoting(helper.user1).setPassingPct(1))
        .to.be.revertedWith("Only callable via proposal");
    });

    it("Should revert if the pct is 0", async () => {
      await helper.prepareToProposal(1);
      // create a new proposal to set the passingPct to 0
      await helper.adminVoting(helper.user2)
        .createNewProposal(
          helper.user2.getAddress(),
          [helper.newProposalPayloadSetPassingPct(0)]
        );

      // vote and execute for the proposal
      await helper.voteToPassTheProposal(0);
      await helper.increase(WEEK);

      await expect(helper.adminVoting().executeProposal(0))
        .to.be.revertedWith("pct must be nonzero");
    });

    it("Should revert if the pct is greater than MAX_PCT", async () => {
      const MAX_PCT = await helper.adminVoting().MAX_PCT();
      await helper.prepareToProposal(1);
      // create a new proposal to set the passingPct to MAX_PCT + 1
      await helper.adminVoting(helper.user2)
        .createNewProposal(
          helper.user2.getAddress(),
          [helper.newProposalPayloadSetPassingPct(MAX_PCT.add(1).toNumber())]
        );

      // vote and execute for the proposal
      await helper.voteToPassTheProposal(0);
      await helper.increase(WEEK);

      await expect(helper.adminVoting().executeProposal(0))
        .to.be.revertedWith("Invalid value");
    });

    it("Set passingPct by proposal", async () => {
      const MAX_PCT = await helper.adminVoting().MAX_PCT();
      await helper.prepareToProposal(1);
      // create a new proposal to set the passingPct to MAX_PCT + 1
      await helper.adminVoting(helper.user2)
        .createNewProposal(
          helper.user2.getAddress(),
          [helper.newProposalPayloadSetPassingPct(MAX_PCT.toNumber())]
        );

      // vote and execute for the proposal
      await helper.voteToPassTheProposal(0);
      await helper.increase(WEEK);

      await expect(helper.adminVoting().executeProposal(0))
        .not.to.be.reverted;

      expect(await helper.adminVoting().passingPct())
        .to.be.equal(MAX_PCT);
    });
  });

  describe("acceptTransferOwnership()", async () => {
    it("Can accept transfer ownership", async () => {
      // Should revert because list core pendingOwner hasn't been set
      await expect(helper.adminVoting().acceptTransferOwnership())
        .to.be.revertedWith("Only new owner");
    });
  });
});
