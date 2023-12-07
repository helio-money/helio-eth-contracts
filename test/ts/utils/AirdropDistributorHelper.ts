import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import MerkleTree from "merkletreejs";
import { AirdropDistributor, ListaCore, ListaVault, MockClaimCallBack, MockListaToken, TokenLocker } from "../../../typechain-types";
import { ETHER, ZERO_ADDRESS, _1E18 } from "./constant";

export class AirdropDistributorHelper {
  // constants
  public readonly INITIAL_LISTA_TOKENS = ETHER.mul(1000);
  private readonly LOCK_WEEKS = 13;
  public airdropProxy = "";

  // contracts
  private mockAirdropDistributor: AirdropDistributor;
  private listaCore: ListaCore;
  private tokenLocker: TokenLocker;
  public listaVault: ListaVault;
  public listaToken: MockListaToken;
  public claimCallback: MockClaimCallBack;

  // signers
  public owner: Signer;
  public guardian: Signer;
  public feeReceiver: Signer;
  public manager: Signer;
  public vault: Signer;
  public user1: Signer;
  public user2: Signer;
  public user3: Signer;
  public user4: Signer;
  public user5: Signer;
  public user6: Signer;
  public user7: Signer;
  public user8: Signer;

  // merkle
  public originNodes: {
    account: string;
    index: BigNumber;
    proxy: string;
    amount: BigNumber;
    leaf: string;
  }[];
  public merkleTree: MerkleTree;
  public merkleRoot: string;

  constructor(
    signers: Signer[]
  ) {
    // signers
    [this.owner, this.guardian, this.feeReceiver, this.manager, this.vault, this.user1, this.user2, this.user3, this.user4, this.user5, this.user6, this.user7, this.user8] = signers;

    // contracts
    this.mockAirdropDistributor = null as any;
    this.listaCore = null as any;
    this.listaVault = null as any;
    this.tokenLocker = null as any;
    this.listaToken = null as any;
    this.claimCallback = null as any;

    // merkle
    this.originNodes = [];
    this.merkleTree = null as any;
    this.merkleRoot = null as any;
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
    this.tokenLocker = await ethers.deployContract("TokenLocker", [
      this.listaCore.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      await this.manager.getAddress(),
      _1E18,
    ]) as TokenLocker;
    await this.tokenLocker.deployed();

    // deploy ListaToken
    this.listaToken = await ethers.deployContract("MockListaToken", [
      await this.vault.getAddress(),
      ZERO_ADDRESS,
      this.tokenLocker.address,
    ]) as MockListaToken;
    await this.listaToken.deployed();

    // deploy ListaVault
    this.listaVault = await ethers.deployContract("ListaVault", [
      this.listaCore.address,
      this.listaToken.address,
      this.tokenLocker.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      await this.manager.getAddress(),
    ]) as ListaVault;
    await this.listaVault.deployed();

    // deploy AirdropDistributor
    this.mockAirdropDistributor = await ethers.deployContract("AirdropDistributor", [
      this.listaToken.address,
      this.tokenLocker.address,
      this.listaVault.address,
      this.LOCK_WEEKS,
    ]) as AirdropDistributor;
    await this.mockAirdropDistributor.deployed();

    // deploy MockClaimCallBack
    this.claimCallback = await ethers.deployContract("MockClaimCallBack", []) as MockClaimCallBack;
    await this.claimCallback.deployed();

    // init properties
    await this.tokenLocker.setLockToken(this.listaToken.address);
    this.airdropProxy = this.mockAirdropDistributor.address;

    // mint INITIAL_LISTA_TOKENS to each user
    await this.listaToken._mintInternal(this.manager.getAddress(), this.INITIAL_LISTA_TOKENS.mul(1000));
    await this.listaToken.connect(this.manager).transfer(this.owner.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user1.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user2.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user3.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user4.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user5.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user6.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user7.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.user8.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.guardian.getAddress(), this.INITIAL_LISTA_TOKENS);
    await this.listaToken.connect(this.manager).transfer(this.listaVault.address, this.INITIAL_LISTA_TOKENS);

    // init origin proof
    await this.initMerkleTree();
  }

  private async initMerkleTree() {
    const users = [this.user1, this.user2, this.user3, this.user4, this.user5, this.user6, this.user7, this.user8];
    const addresses = await Promise.all(users.map(u => u.getAddress()));
    const merkleTreeNodes = [] as string[];

    for (let i = 0; i < addresses.length; i++) {
      const node = {
        account: addresses[i],
        index: BigNumber.from(i),
        proxy: this.airdropProxy,
        amount: BigNumber.from(10).mul(i + 1),
        leaf: "",
      }
      const leaf = ethers.utils.solidityKeccak256(["uint256", "address", "uint256"], [node.index, node.proxy, node.amount]);
      node.leaf = leaf;
      this.originNodes.push(node);
      merkleTreeNodes.push(ethers.utils.solidityKeccak256(["uint256", "address", "uint256"], [node.index, node.proxy, node.amount]));
    };

    this.merkleTree = new MerkleTree(merkleTreeNodes, ethers.utils.keccak256, { sortPairs: true });
    this.merkleRoot = this.merkleTree.getHexRoot();
  }

  public airdropDistributor(user: Signer | string = this.owner) {
    return this.mockAirdropDistributor.connect(user);
  }

  public async setMerkleRoot() {
    await this.airdropDistributor().setMerkleRoot(this.merkleRoot);
  }
}
