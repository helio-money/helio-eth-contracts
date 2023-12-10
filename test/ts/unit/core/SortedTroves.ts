import { ethers } from "hardhat";
import { Signer } from "ethers";
import { MockTroveManager, SortedTroves } from "../../../../typechain-types";
import { expect } from "chai";
import { ZERO_ADDRESS } from "../../utils";

describe("SortedTrove", () => {
  let troveManager: MockTroveManager;
  let sortedTroves: SortedTroves;
  let nodeIdToNICR: Map<string, number>;

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  let id: string;
  let id1: string;
  let id2: string;
  let id3: string;
  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    troveManager = await ethers.deployContract("MockTroveManager", []) as MockTroveManager;
    await troveManager.deployed();

    sortedTroves = await ethers.deployContract("SortedTroves", []) as SortedTroves;
    await sortedTroves.deployed();
    await sortedTroves.setAddresses(troveManager.address);
    await troveManager.setSortedTroves(sortedTroves.address);

    id = await owner.getAddress();
    id1 = await user1.getAddress();
    id2 = await user2.getAddress();
    id3 = await user3.getAddress();
  })

  const initChain = async (nodes: {
    id: string,
    NICR: number,
    prevId: string | null,
    nextId: string | null
  }[]) => {
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i];
      await insertNode(nodes[i]);
    }
  }
  const insertNode = async (node: {
    id: string,
    NICR: number,
    prevId: string | null,
    nextId: string | null
  }) => {
    // set test info
    await troveManager.setNICR(node.id, node.NICR);
    return await troveManager.insert(
      node.id,
      node.NICR,
      node.prevId == null ? ZERO_ADDRESS : node.prevId,
      node.nextId == null ? ZERO_ADDRESS : node.nextId
    );
  }

  const createNode = (prevId: string, nextId: string) => {
    return { prevId, nextId };
  }
  const removeNode = async (id: string) => {
    const tx = await troveManager.remove(id);
    await troveManager.setNICR(id, 0);
    return tx;
  }

  describe("Deployment", () => {
    it("Should right after deployment", async () => {
      expect(await sortedTroves.troveManager()).to.be.equal(troveManager.address);
    });
  })

  describe("Function", () => {
    it("validInsertPosition", async () => {
      expect(await sortedTroves.validInsertPosition(0, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.true;
    });

    it("insert", async () => {
      const NICR = 100;
      const tx = await troveManager.insert(
        id,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      );

      await expect(tx).to.emit(sortedTroves, "NodeAdded").withArgs(id, NICR);
      const data = await sortedTroves.data();
      expect(data.head).to.be.equal(id);
      expect(data.tail).to.be.equal(id);
      expect(data.size).to.be.equal(1);
      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id)).to.be.equal(ZERO_ADDRESS);
      await troveManager.setNICR(id, NICR);

      // 2. insert the same id
      await expect(troveManager.insert(
        id,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      )).to.be.revertedWith("SortedTroves: List already contains the node");
      await expect(troveManager.insert(
        ZERO_ADDRESS,
        NICR,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      )).to.be.revertedWith("SortedTroves: Id cannot be zero");

      // 3. add a valid node with the same NICR
      const id3 = await user2.getAddress();
      const tx3 = await troveManager.insert(
        id3,
        NICR,
        id,
        ZERO_ADDRESS
      );
      await expect(tx3).to.emit(sortedTroves, "NodeAdded").withArgs(id3, NICR);
      const data3 = await sortedTroves.data();
      expect(data3.head).to.be.equal(id);
      expect(data3.tail).to.be.equal(id3);
      expect(data3.size).to.be.equal(2);
      expect(await sortedTroves.getPrev(id3)).to.be.equal(id);
      expect(await sortedTroves.getNext(id3)).to.be.equal(ZERO_ADDRESS);
      await troveManager.setNICR(id3, NICR);

      // 4. add a valid node
      const id4 = await user3.getAddress();
      const NICR4 = 98;
      const tx4 = await troveManager.insert(
        id4,
        NICR4,
        id3,
        ZERO_ADDRESS
      );
      await expect(tx4).to.emit(sortedTroves, "NodeAdded").withArgs(id4, NICR4);
      const data4 = await sortedTroves.data();
      expect(data4.head).to.be.equal(id);
      expect(data4.tail).to.be.equal(id4);
      expect(data4.size).to.be.equal(3);
      expect(await sortedTroves.getPrev(id4)).to.be.equal(id3);
      expect(await sortedTroves.getNext(id4)).to.be.equal(ZERO_ADDRESS);
      await troveManager.setNICR(id4, NICR4);
    });

    it("insert check order", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id2, NICR: 80, prevId: id1, nextId: null },
        { id: id1, NICR: 90, prevId: null, nextId: id2 },
        { id: id3, NICR: 110, prevId: id, nextId: id1 },
      ];
      await initChain(nodes);

      expect(await sortedTroves.getFirst()).to.be.equal(id3);
      expect(await sortedTroves.getLast()).to.be.equal(id2);
      expect(await sortedTroves.getSize()).to.be.equal(nodes.length);
      expect(await sortedTroves.isEmpty()).to.be.false;

      expect(await sortedTroves.getPrev(id)).to.be.equal(id3);
      expect(await sortedTroves.getNext(id)).to.be.equal(id1);

      expect(await sortedTroves.getPrev(id1)).to.be.equal(id);
      expect(await sortedTroves.getNext(id1)).to.be.equal(id2);

      expect(await sortedTroves.getPrev(id2)).to.be.equal(id1);
      expect(await sortedTroves.getNext(id2)).to.be.equal(ZERO_ADDRESS);

      expect(await sortedTroves.getPrev(id3)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id3)).to.be.equal(id);
    });

    it("remove when data.size == 0", async () => {
      await expect(troveManager.remove(ZERO_ADDRESS)).to.be.revertedWith("SortedTroves: List does not contain the id");
      await expect(troveManager.remove(id)).to.be.revertedWith("SortedTroves: List does not contain the id");
    });

    it("remove when data.size == 1", async () => {
      let nodes: {
        id: string,
        NICR: number,
        prevId: string | null,
        nextId: string | null
      }[] = [
          { id: id, NICR: 100, prevId: null, nextId: null },
        ];
      await initChain(nodes);

      expect(await sortedTroves.contains(id)).to.be.true;
      const tx1 = await troveManager.remove(id);
      expect(await sortedTroves.contains(id)).to.be.false;
      expect(await sortedTroves.isEmpty()).to.be.true;
      expect(await sortedTroves.getFirst()).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getLast()).to.be.equal(ZERO_ADDRESS);
      await expect(tx1).to.emit(sortedTroves, "NodeRemoved").withArgs(id);
    });

    it("remove the head", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 98, prevId: id, nextId: null },
        { id: id2, NICR: 98, prevId: id1, nextId: null },
        { id: id3, NICR: 97, prevId: id2, nextId: null },
      ];
      await initChain(nodes);

      const tx = await troveManager.remove(id);

      await expect(tx).to.emit(sortedTroves, "NodeRemoved").withArgs(id);
      expect(await sortedTroves.contains(id)).to.be.false;
      expect(await sortedTroves.contains(id1)).to.be.true;
      expect(await sortedTroves.contains(id2)).to.be.true;
      expect(await sortedTroves.contains(id3)).to.be.true;
      expect(await sortedTroves.isEmpty()).to.be.false;
      expect(await sortedTroves.getFirst()).to.be.equal(id1);
      expect(await sortedTroves.getLast()).to.be.equal(id3);
      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id1)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id2)).to.be.equal(id1);
      expect(await sortedTroves.getPrev(id3)).to.be.equal(id2);
      expect(await sortedTroves.getNext(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id1)).to.be.equal(id2);
      expect(await sortedTroves.getNext(id2)).to.be.equal(id3);
      expect(await sortedTroves.getNext(id3)).to.be.equal(ZERO_ADDRESS);
    });

    it("remove the tail", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 98, prevId: id, nextId: null },
        { id: id2, NICR: 98, prevId: id1, nextId: null },
        { id: id3, NICR: 97, prevId: id2, nextId: null },
      ];
      await initChain(nodes);

      const tx = await troveManager.remove(id3);

      await expect(tx).to.emit(sortedTroves, "NodeRemoved").withArgs(id3);
      expect(await sortedTroves.contains(id)).to.be.true;
      expect(await sortedTroves.contains(id1)).to.be.true;
      expect(await sortedTroves.contains(id2)).to.be.true
      expect(await sortedTroves.contains(id3)).to.be.false
      expect(await sortedTroves.isEmpty()).to.be.false;
      expect(await sortedTroves.getFirst()).to.be.equal(id);
      expect(await sortedTroves.getLast()).to.be.equal(id2);
      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id1)).to.be.equal(id);
      expect(await sortedTroves.getPrev(id2)).to.be.equal(id1);
      expect(await sortedTroves.getPrev(id3)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id)).to.be.equal(id1);
      expect(await sortedTroves.getNext(id1)).to.be.equal(id2);
      expect(await sortedTroves.getNext(id2)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id3)).to.be.equal(ZERO_ADDRESS);
    });

    it("remove the middle node", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 98, prevId: id, nextId: null },
        { id: id2, NICR: 98, prevId: id1, nextId: null },
        { id: id3, NICR: 97, prevId: id2, nextId: null },
      ];
      await initChain(nodes);

      const tx = await troveManager.remove(id2);

      await expect(tx).to.emit(sortedTroves, "NodeRemoved").withArgs(id2);
      expect(await sortedTroves.getSize()).to.be.equal(nodes.length - 1);
      expect(await sortedTroves.contains(id)).to.be.true;
      expect(await sortedTroves.contains(id1)).to.be.true;
      expect(await sortedTroves.contains(id2)).to.be.false;
      expect(await sortedTroves.contains(id3)).to.be.true;
      expect(await sortedTroves.isEmpty()).to.be.false;
      expect(await sortedTroves.getFirst()).to.be.equal(id);
      expect(await sortedTroves.getLast()).to.be.equal(id3);
      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id1)).to.be.equal(id);
      expect(await sortedTroves.getPrev(id2)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id3)).to.be.equal(id1);
      expect(await sortedTroves.getNext(id)).to.be.equal(id1);
      expect(await sortedTroves.getNext(id1)).to.be.equal(id3);
      expect(await sortedTroves.getNext(id2)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id3)).to.be.equal(ZERO_ADDRESS);

      // remove id1
      const tx2 = await troveManager.remove(id1);

      await expect(tx2).to.emit(sortedTroves, "NodeRemoved").withArgs(id1);
      expect(await sortedTroves.getSize()).to.be.equal(nodes.length - 2);
      expect(await sortedTroves.contains(id)).to.be.true;
      expect(await sortedTroves.contains(id1)).to.be.false;
      expect(await sortedTroves.contains(id2)).to.be.false;
      expect(await sortedTroves.contains(id3)).to.be.true;
      expect(await sortedTroves.isEmpty()).to.be.false;
      expect(await sortedTroves.getFirst()).to.be.equal(id);
      expect(await sortedTroves.getLast()).to.be.equal(id3);
      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id1)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id2)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id3)).to.be.equal(id);
      expect(await sortedTroves.getNext(id)).to.be.equal(id3);
      expect(await sortedTroves.getNext(id1)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id2)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id3)).to.be.equal(ZERO_ADDRESS);
    });

    it("remove to empty list", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 98, prevId: id, nextId: null },
        { id: id2, NICR: 98, prevId: id1, nextId: null },
      ];
      await initChain(nodes);

      const tx1 = await troveManager.remove(id1);
      const tx = await troveManager.remove(id);
      const tx2 = await troveManager.remove(id2);

      await expect(tx).to.emit(sortedTroves, "NodeRemoved").withArgs(id);
      await expect(tx1).to.emit(sortedTroves, "NodeRemoved").withArgs(id1);
      await expect(tx2).to.emit(sortedTroves, "NodeRemoved").withArgs(id2);
      expect(await sortedTroves.getSize()).to.be.equal(0);
      expect(await sortedTroves.contains(id)).to.be.false;
      expect(await sortedTroves.contains(id1)).to.be.false;
      expect(await sortedTroves.contains(id2)).to.be.false;
      expect(await sortedTroves.isEmpty()).to.be.true;
      expect(await sortedTroves.getFirst()).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id1)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id2)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id2)).to.be.equal(ZERO_ADDRESS);
    });

    it("reInsert", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 98, prevId: id, nextId: null },
        { id: id2, NICR: 98, prevId: id1, nextId: null },
      ];
      await initChain(nodes);

      const newNICR = 70;
      let newNode = { id: id1, NICR: newNICR, prevId: ZERO_ADDRESS, nextId: id2 };
      await troveManager.setNICR(newNode.id, newNode.NICR);

      // check
      const tx = await troveManager.reInsert(newNode.id, newNICR, newNode.prevId, newNode.nextId);

      await expect(tx).to.emit(sortedTroves, "NodeRemoved").withArgs(id1);
      await expect(tx).to.emit(sortedTroves, "NodeAdded").withArgs(id1, newNICR);
      expect(await sortedTroves.getFirst()).to.be.equal(id);
      expect(await sortedTroves.getLast()).to.be.equal(id1);
      expect(await sortedTroves.getSize()).to.be.equal(3);
      expect(await sortedTroves.isEmpty()).to.be.false;

      expect(await sortedTroves.getPrev(id)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getPrev(id1)).to.be.equal(id2);
      expect(await sortedTroves.getPrev(id2)).to.be.equal(id);

      expect(await sortedTroves.getNext(id)).to.be.equal(id2);
      expect(await sortedTroves.getNext(id1)).to.be.equal(ZERO_ADDRESS);
      expect(await sortedTroves.getNext(id2)).to.be.equal(id1);
    });

    it("findInsertPosition with right/wrong id", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 90, prevId: id, nextId: null },
        { id: id2, NICR: 80, prevId: id1, nextId: null },
      ];
      await initChain(nodes);

      // 1. with zero id
      const NICR = 88;
      const pos = await sortedTroves.findInsertPosition(NICR, ZERO_ADDRESS, ZERO_ADDRESS);
      expect(pos[0]).to.be.equal(nodes[1].id);
      expect(pos[1]).to.be.equal(nodes[2].id);

      // 1.1. with wrong id
      const pos2 = await sortedTroves.findInsertPosition(NICR, id, id1);
      expect(pos2[0]).to.be.equal(nodes[1].id);
      expect(pos2[1]).to.be.equal(nodes[2].id);

      const pos3 = await sortedTroves.findInsertPosition(NICR, id2, ZERO_ADDRESS);
      expect(pos3[0]).to.be.equal(nodes[1].id);
      expect(pos3[1]).to.be.equal(nodes[2].id);

      const pos4 = await sortedTroves.findInsertPosition(NICR, ZERO_ADDRESS, id);
      expect(pos4[0]).to.be.equal(nodes[1].id);
      expect(pos4[1]).to.be.equal(nodes[2].id);

      // 2. new NICR
      const NICR2 = 70;
      const pos5 = await sortedTroves.findInsertPosition(NICR2, ZERO_ADDRESS, ZERO_ADDRESS);
      expect(pos5[0]).to.be.equal(nodes[2].id);
      expect(pos5[1]).to.be.equal(ZERO_ADDRESS);

      // 2.1. with wrong id
      const pos6 = await sortedTroves.findInsertPosition(NICR2, id, id1);
      expect(pos6[0]).to.be.equal(nodes[2].id);
      expect(pos6[1]).to.be.equal(ZERO_ADDRESS);

      const pos7 = await sortedTroves.findInsertPosition(NICR2, id2, ZERO_ADDRESS);
      expect(pos7[0]).to.be.equal(nodes[2].id);
      expect(pos7[1]).to.be.equal(ZERO_ADDRESS);

      const pos8 = await sortedTroves.findInsertPosition(NICR2, ZERO_ADDRESS, id);
      expect(pos8[0]).to.be.equal(nodes[2].id);
      expect(pos8[1]).to.be.equal(ZERO_ADDRESS);

      const pos9 = await sortedTroves.findInsertPosition(99, ZERO_ADDRESS, id1);
      expect(pos9[0]).to.be.equal(id);
      expect(pos9[1]).to.be.equal(id1);

      const pos10 = await sortedTroves.findInsertPosition(89, id, id2);
      expect(pos10[0]).to.be.equal(nodes[1].id);
      expect(pos10[1]).to.be.equal(nodes[2].id);
    });

    it("findInsertPosition with not contained id", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 90, prevId: id, nextId: null },
        { id: id2, NICR: 80, prevId: id1, nextId: null },
      ];
      await initChain(nodes);

      const pos = await sortedTroves.findInsertPosition(87, id3, ZERO_ADDRESS);
      expect(pos[0]).to.be.equal(id1);
      expect(pos[1]).to.be.equal(id2);

      const pos2 = await sortedTroves.findInsertPosition(87, ZERO_ADDRESS, id3);
      expect(pos[0]).to.be.equal(id1);
      expect(pos[1]).to.be.equal(id2);

    });

    it("findInsertPosition with _ascendList", async () => {
      let nodes = [
        { id: id, NICR: 100, prevId: null, nextId: null },
        { id: id1, NICR: 90, prevId: id, nextId: null },
        { id: id2, NICR: 80, prevId: id1, nextId: null },
      ];
      await initChain(nodes);

      const pos = await sortedTroves.findInsertPosition(80, ZERO_ADDRESS, id2);
      expect(pos[0]).to.be.equal(nodes[2].id);
      expect(pos[1]).to.be.equal(ZERO_ADDRESS);

      const pos1 = await sortedTroves.findInsertPosition(100, id, ZERO_ADDRESS);
      expect(pos1[0]).to.be.equal(ZERO_ADDRESS);
      expect(pos1[1]).to.be.equal(nodes[0].id);
    });
  })

  describe("Revert", () => {
    it("Should revert if already set trove manager", async () => {
      await expect(sortedTroves.setAddresses(troveManager.address)).to.be.revertedWith("Already set");
    });

    it("Should revert if NICR = 0", async () => {
      await expect(troveManager.insert(id, 0, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith("SortedTroves: NICR must be positive");
    });

    it("Should revert if sender is not TroveManager", async () => {
      const errorMessage = "SortedTroves: Caller is not the TroveManager";
      await expect(sortedTroves.insert(id, 0, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith(errorMessage);
      await expect(sortedTroves.reInsert(id, 100, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith(errorMessage);
      await expect(sortedTroves.remove(id)).to.be.revertedWith(errorMessage);
    });
  })
})
