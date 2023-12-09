import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { getContractAddress } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllocationVesting, ListaCore, ListaVault, MockListaToken, TokenLocker } from "../../../../typechain-types";
import { ETHER, WEEK, ZERO_ADDRESS, _1E18, now } from "../../utils";

describe("AllocationVesting Conract", () => {
  // constants
  const INITIAL_LISTA_TOKENS = ETHER.mul(1000);
  const TOTAL_ALLOCATION = ETHER.mul(100);
  const MAX_TOTAL_PRECLAIM_PCT = 10;
  const VESTING_START = 0;
  const deployAllocationVesting = async (
    options: {
      vestingStart?: number,
      allocationSplits?: AllocationVesting.AllocationSplitStruct[]
    } = {
        vestingStart: VESTING_START,
        allocationSplits: []
      }) => {
    // deploy AllocationVesting
    allocationVesting = await ethers.deployContract("AllocationVesting", [
      listaToken.address,
      tokenLocker.address,
      TOTAL_ALLOCATION,
      listaVault.address,
      MAX_TOTAL_PRECLAIM_PCT,
      options.vestingStart || VESTING_START,
      options.allocationSplits || [],
    ]) as AllocationVesting;
    await allocationVesting.deployed();
  };

  // contracts
  let allocationVesting: AllocationVesting;
  let listaCore: ListaCore;
  let tokenLocker: TokenLocker;
  let listaVault: ListaVault;
  let listaToken: MockListaToken;

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

    // init properties
    await tokenLocker.setLockToken(listaToken.address);

    // mint to users
    await listaToken._mintInternal(await manager.getAddress(), INITIAL_LISTA_TOKENS.mul(1000));
    await listaToken.connect(manager).transfer(listaVault.address, INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await owner.getAddress(), INITIAL_LISTA_TOKENS);
    await listaToken.connect(manager).transfer(await user1.getAddress(), INITIAL_LISTA_TOKENS);
  });

  describe("constructor(address, address, uint256, address, uint256, uint256, AllocationSplitStruct[])", () => {
    beforeEach(async () => {
      await deployAllocationVesting();
    });

    it("Should revert ZeroTotalAllocation if totalAllocation_ is 0", async () => {
      await expect(ethers.deployContract("AllocationVesting", [
        listaToken.address,
        tokenLocker.address,
        0,
        listaVault.address,
        MAX_TOTAL_PRECLAIM_PCT,
        VESTING_START,
        [],
      ])).to.be.revertedWithCustomError(allocationVesting, "ZeroTotalAllocation");
    });

    it("Should revert if maxTotalPreclaimPct_ is greater than 20", async () => {
      await expect(ethers.deployContract("AllocationVesting", [
        listaToken.address,
        tokenLocker.address,
        TOTAL_ALLOCATION,
        listaVault.address,
        21,
        VESTING_START,
        [],
      ])).to.be.revertedWithCustomError(allocationVesting, "WrongMaxTotalPreclaimPct");
    });

    it("Should revert ZeroAllocation if any points is 0", async () => {
      await expect(ethers.deployContract("AllocationVesting", [
        listaToken.address,
        tokenLocker.address,
        TOTAL_ALLOCATION,
        listaVault.address,
        MAX_TOTAL_PRECLAIM_PCT,
        VESTING_START,
        [
          {
            recipient: await owner.getAddress(),
            points: 0,
            numberOfWeeks: 1,
          }
        ],
      ])).to.be.revertedWithCustomError(allocationVesting, "ZeroAllocation");
    });

    it("Should revert ZeroNumberOfWeeks if any numberOfWeeks is 0", async () => {
      await expect(ethers.deployContract("AllocationVesting", [
        listaToken.address,
        tokenLocker.address,
        TOTAL_ALLOCATION,
        listaVault.address,
        MAX_TOTAL_PRECLAIM_PCT,
        VESTING_START,
        [
          {
            recipient: await owner.getAddress(),
            points: 1,
            numberOfWeeks: 0,
          }
        ],
      ])).to.be.revertedWithCustomError(allocationVesting, "ZeroNumberOfWeeks");
    });

    it("Should revert DuplicateAllocation if recipient is duplicated", async () => {
      await expect(ethers.deployContract("AllocationVesting", [
        listaToken.address,
        tokenLocker.address,
        TOTAL_ALLOCATION,
        listaVault.address,
        MAX_TOTAL_PRECLAIM_PCT,
        VESTING_START,
        [
          {
            recipient: await owner.getAddress(),
            points: 1,
            numberOfWeeks: 1,
          },
          {
            recipient: await owner.getAddress(),
            points: 1,
            numberOfWeeks: 1,
          }
        ],
      ])).to.be.revertedWithCustomError(allocationVesting, "DuplicateAllocation");
    });
  });

  describe("transferPoints(address, address, uint256)", () => {
    it("Should revert if the caller isn't the owner or delegated", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting();

      await expect(allocationVesting.transferPoints(await user1.getAddress(), await user2.getAddress(), 1))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert SelfTransfer if from is equal to to", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting();

      await expect(allocationVesting.transferPoints(await owner.getAddress(), await owner.getAddress(), 1))
        .to.be.revertedWithCustomError(allocationVesting, "SelfTransfer");
    });

    it("Should revert IncompatibleVestingPeriod if numberOfWeeksTo is not 0 and numberOfWeeksTo is not equal to numberOfWeesFrom", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
          {
            recipient: user1.getAddress(),
            points: BigNumber.from(5),
            numberOfWeeks: BigNumber.from(6),
          }]
      });

      await expect(allocationVesting.transferPoints(owner.getAddress(), user1.getAddress(), 1))
        .to.be.revertedWithCustomError(allocationVesting, "IncompatibleVestingPeriod");
    });

    // TODO
    it("Should revert LockedAllocation if totalVested is less than fromAllocation.claimed", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
          {
            recipient: user1.getAddress(),
            points: BigNumber.from(5),
            numberOfWeeks: BigNumber.from(6),
          },
        ]
      });

      // await expect(allocationVesting.transferPoints(owner.getAddress(), user1.getAddress(), 1))
      //   .to.be.revertedWithCustomError(allocationVesting, "LockedAllocation");
    });

    it("Should revert ZeroAllocation if points is 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      await expect(allocationVesting.transferPoints(owner.getAddress(), user1.getAddress(), 0))
        .to.be.revertedWithCustomError(allocationVesting, "ZeroAllocation");
    });

    it("Should revert InsufficientPoints if pointsFrom is less than points", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
          {
            recipient: user1.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.transferPoints(owner.getAddress(), await user1.getAddress(), 20))
        .to.be.revertedWithCustomError(allocationVesting, "InsufficientPoints");
    });

    it("Should revert NothingToClaim if claim 0 points", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: 0,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
          {
            recipient: user1.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.transferPoints(owner.getAddress(), await user1.getAddress(), 10))
        .to.be.revertedWithCustomError(allocationVesting, "NothingToClaim");
    });

    it("Should ok if numberOfWeeksTo is 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.transferPoints(owner.getAddress(), await user1.getAddress(), 10))
        .not.to.be.reverted;
    });

    it("Should ok if numberOfWeeksTo is not 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
          {
            recipient: user1.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.transferPoints(owner.getAddress(), await user1.getAddress(), 10))
        .not.to.be.reverted;
    });
  });

  describe("lockFutureClaims(address, uint256)", () => {
    it("Should revert if the caller isn't the owner or delegated", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting();

      await expect(allocationVesting.lockFutureClaims(await user1.getAddress(), 1))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should OK", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.lockFutureClaims(owner.getAddress(), 0))
        .not.to.be.reverted;
    });
  });

  describe("lockFutureClaimsWithReceiver(address, address, uint256)", () => {
    it("Should revert if the caller isn't the owner or delegated", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting();

      await expect(allocationVesting.lockFutureClaimsWithReceiver(await user1.getAddress(), await user2.getAddress(), 1))
        .to.be.revertedWith("Delegate not approved");
    });

    it("Should revert CannotLock if allocation.points is 0 or vestingStart is 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: 0,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      await expect(allocationVesting.lockFutureClaimsWithReceiver(owner.getAddress(), await user1.getAddress(), 1))
        .to.be.revertedWithCustomError(allocationVesting, "CannotLock");
    });

    it("Should revert PreclaimTooLarge if total claimed is greater than maxTotalPreclaimPct or amount is greater than unclaimed", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.lockFutureClaimsWithReceiver(owner.getAddress(), await user1.getAddress(), ETHER.mul(1000)))
        .to.be.revertedWithCustomError(allocationVesting, "PreclaimTooLarge");
    });

    it("Should revert if the the lock amount is less than lockToTokenRatio", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.lockFutureClaimsWithReceiver(owner.getAddress(), await user1.getAddress(), 10))
        .to.be.revertedWith("Amount must be nonzero");
    });

    it("Should OK when amount is 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.lockFutureClaimsWithReceiver(owner.getAddress(), await user1.getAddress(), 0))
        .not.to.be.reverted;
    });

    it("Should OK when amount is not 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(4),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.lockFutureClaimsWithReceiver(owner.getAddress(), await user1.getAddress(), ETHER.mul(2)))
        .not.to.be.reverted;
    });

  });

  describe("claim(address)", () => {
    it("Should revert NothingToClaim if claim 0 points", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: 0,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(1),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.claim(owner.getAddress()))
        .to.be.revertedWithCustomError(allocationVesting, "NothingToClaim");
    });

    it("Should OK", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(1),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      await expect(allocationVesting.claim(owner.getAddress()))
        .not.to.be.reverted;
    });
  });

  describe("claimableNow(address)", () => {
    it("Should OK", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(1),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      expect(await allocationVesting.claimableNow(owner.getAddress()))
        .to.be.equal(ETHER.mul(100));
    });
  });

  describe("unclaimed(address)", () => {
    it("Should OK", async () => {
      const points = BigNumber.from(10);
      const totalPoints = points.mul(2);

      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: points,
            numberOfWeeks: BigNumber.from(1),
          },
          {
            recipient: user1.getAddress(),
            points: points,
            numberOfWeeks: BigNumber.from(1),
          },
        ]
      });

      // increase allowance
      await listaToken._approveInternal(listaVault.address, allocationVesting.address, INITIAL_LISTA_TOKENS);

      expect(await allocationVesting.unclaimed(owner.getAddress()))
        .to.be.equal(TOTAL_ALLOCATION.mul(points).div(totalPoints));
    });
  });

  describe("preclaimable(address)", () => {
    it("Return 0 if the vestingStart is 0", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: 0,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(1),
          },
        ]
      });

      expect(await allocationVesting.preclaimable(owner.getAddress()))
        .to.be.equal(0);
    });

    it("Should OK", async () => {
      // deploy AllocationVesting
      await deployAllocationVesting({
        vestingStart: await now() - WEEK * 2,
        allocationSplits: [
          {
            recipient: owner.getAddress(),
            points: BigNumber.from(10),
            numberOfWeeks: BigNumber.from(1),
          },
        ]
      });

      expect(await allocationVesting.preclaimable(owner.getAddress()))
        .to.be.equal(ETHER.mul(10));
    });
  });
});
