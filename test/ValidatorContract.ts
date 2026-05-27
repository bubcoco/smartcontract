import { expect } from "chai";
import { network } from "hardhat";
import type { ValidatorContract } from "../types/ethers-contracts/ValidatorContract.ts";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const { ethers } = await network.connect();

describe("ValidatorContract", function () {
  let validator: ValidatorContract;
  let owner: SignerWithAddress;
  let committee1: SignerWithAddress;
  let committee2: SignerWithAddress;
  let node1: SignerWithAddress;
  let node2: SignerWithAddress;
  let node3: SignerWithAddress;
  let attacker: SignerWithAddress;

  beforeEach(async function () {
    [owner, committee1, committee2, node1, node2, node3, attacker] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ValidatorContract");
    validator = (await Factory.deploy()) as unknown as ValidatorContract;
    await validator.waitForDeployment();
  });

  // ═══════════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════════

  describe("Initialization", function () {
    it("Should not be initialized on deploy", async function () {
      expect(await validator.initialized()).to.equal(false);
    });

    it("Should initialize owner", async function () {
      await expect(validator.initializeOwner(owner.address))
        .to.emit(validator, "OwnershipTransferred")
        .withArgs(ethers.ZeroAddress, owner.address);

      expect(await validator.initialized()).to.equal(true);
      expect(await validator.owner()).to.equal(owner.address);
    });

    it("Should revert on double initialization", async function () {
      await validator.initializeOwner(owner.address);
      await expect(
        validator.initializeOwner(attacker.address)
      ).to.be.revertedWithCustomError(validator, "AlreadyInitialized");
    });

    it("Should revert initializing with zero address", async function () {
      await expect(
        validator.initializeOwner(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(validator, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Ownership
  // ═══════════════════════════════════════════════════════════════════

  describe("Ownership", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
    });

    it("Should transfer ownership", async function () {
      await expect(validator.transferOwnership(committee1.address))
        .to.emit(validator, "OwnershipTransferred")
        .withArgs(owner.address, committee1.address);

      expect(await validator.owner()).to.equal(committee1.address);
    });

    it("Should revert transfer to zero address", async function () {
      await expect(
        validator.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(validator, "ZeroAddress");
    });

    it("Should revert transfer from non-owner", async function () {
      await expect(
        validator.connect(attacker).transferOwnership(attacker.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Validator Management — Owner
  // ═══════════════════════════════════════════════════════════════════

  describe("Add Validator (Owner)", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
    });

    it("Should add a validator", async function () {
      await expect(validator.addValidator(node1.address))
        .to.emit(validator, "ValidatorAdded")
        .withArgs(node1.address, owner.address);

      expect(await validator.isValidator(node1.address)).to.equal(true);
      expect(await validator.validatorCount()).to.equal(1);
    });

    it("Should add multiple validators", async function () {
      await validator.addValidator(node1.address);
      await validator.addValidator(node2.address);
      await validator.addValidator(node3.address);

      expect(await validator.validatorCount()).to.equal(3);
      const list = await validator.getValidators();
      expect(list).to.include(node1.address);
      expect(list).to.include(node2.address);
      expect(list).to.include(node3.address);
    });

    it("Should revert adding zero address", async function () {
      await expect(
        validator.addValidator(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(validator, "ZeroAddress");
    });

    it("Should revert adding duplicate validator", async function () {
      await validator.addValidator(node1.address);
      await expect(
        validator.addValidator(node1.address)
      ).to.be.revertedWithCustomError(validator, "ValidatorAlreadyExists");
    });

    it("Should revert from non-owner/non-committee", async function () {
      await expect(
        validator.connect(attacker).addValidator(node1.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwnerOrCommittee");
    });
  });

  describe("Remove Validator (Owner)", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
      await validator.addValidator(node1.address);
      await validator.addValidator(node2.address);
      await validator.addValidator(node3.address);
    });

    it("Should remove a validator", async function () {
      await expect(validator.removeValidator(node2.address))
        .to.emit(validator, "ValidatorRemoved")
        .withArgs(node2.address, owner.address);

      expect(await validator.isValidator(node2.address)).to.equal(false);
      expect(await validator.validatorCount()).to.equal(2);
    });

    it("Should maintain other validators after removal", async function () {
      await validator.removeValidator(node1.address);

      expect(await validator.isValidator(node2.address)).to.equal(true);
      expect(await validator.isValidator(node3.address)).to.equal(true);
      expect(await validator.validatorCount()).to.equal(2);
    });

    it("Should revert removing zero address", async function () {
      await expect(
        validator.removeValidator(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(validator, "ZeroAddress");
    });

    it("Should revert removing non-existent validator", async function () {
      await expect(
        validator.removeValidator(attacker.address)
      ).to.be.revertedWithCustomError(validator, "ValidatorNotFound");
    });

    it("Should revert from non-owner/non-committee", async function () {
      await expect(
        validator.connect(attacker).removeValidator(node1.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwnerOrCommittee");
    });

    it("Should handle removing all validators", async function () {
      await validator.removeValidator(node1.address);
      await validator.removeValidator(node2.address);
      await validator.removeValidator(node3.address);

      expect(await validator.validatorCount()).to.equal(0);
      expect(await validator.getValidators()).to.deep.equal([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Committee Management
  // ═══════════════════════════════════════════════════════════════════

  describe("Committee Management", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
    });

    it("Should add a committee member", async function () {
      await expect(validator.addCommitteeMember(committee1.address))
        .to.emit(validator, "CommitteeMemberAdded")
        .withArgs(committee1.address, owner.address);

      expect(await validator.isCommitteeMember(committee1.address)).to.equal(true);
      expect(await validator.committeeCount()).to.equal(1);
    });

    it("Should add multiple committee members", async function () {
      await validator.addCommitteeMember(committee1.address);
      await validator.addCommitteeMember(committee2.address);

      expect(await validator.committeeCount()).to.equal(2);
      const list = await validator.getCommitteeMembers();
      expect(list).to.include(committee1.address);
      expect(list).to.include(committee2.address);
    });

    it("Should remove a committee member", async function () {
      await validator.addCommitteeMember(committee1.address);

      await expect(validator.removeCommitteeMember(committee1.address))
        .to.emit(validator, "CommitteeMemberRemoved")
        .withArgs(committee1.address, owner.address);

      expect(await validator.isCommitteeMember(committee1.address)).to.equal(false);
      expect(await validator.committeeCount()).to.equal(0);
    });

    it("Should revert adding zero address to committee", async function () {
      await expect(
        validator.addCommitteeMember(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(validator, "ZeroAddress");
    });

    it("Should revert adding duplicate committee member", async function () {
      await validator.addCommitteeMember(committee1.address);
      await expect(
        validator.addCommitteeMember(committee1.address)
      ).to.be.revertedWithCustomError(validator, "CommitteeMemberAlreadyExists");
    });

    it("Should revert removing non-existent committee member", async function () {
      await expect(
        validator.removeCommitteeMember(committee1.address)
      ).to.be.revertedWithCustomError(validator, "CommitteeMemberNotFound");
    });

    it("Should revert non-owner adding committee member", async function () {
      await expect(
        validator.connect(attacker).addCommitteeMember(attacker.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwner");
    });

    it("Should revert non-owner removing committee member", async function () {
      await validator.addCommitteeMember(committee1.address);
      await expect(
        validator.connect(attacker).removeCommitteeMember(committee1.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwner");
    });

    it("Should revert committee member managing other committee members", async function () {
      await validator.addCommitteeMember(committee1.address);
      await expect(
        validator.connect(committee1).addCommitteeMember(committee2.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Committee — Validator Operations
  // ═══════════════════════════════════════════════════════════════════

  describe("Committee Validator Operations", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
      await validator.addCommitteeMember(committee1.address);
      await validator.addCommitteeMember(committee2.address);
    });

    it("Committee member can add a validator", async function () {
      await expect(validator.connect(committee1).addValidator(node1.address))
        .to.emit(validator, "ValidatorAdded")
        .withArgs(node1.address, committee1.address);

      expect(await validator.isValidator(node1.address)).to.equal(true);
    });

    it("Committee member can remove a validator", async function () {
      await validator.addValidator(node1.address);

      await expect(validator.connect(committee1).removeValidator(node1.address))
        .to.emit(validator, "ValidatorRemoved")
        .withArgs(node1.address, committee1.address);

      expect(await validator.isValidator(node1.address)).to.equal(false);
    });

    it("Different committee members can manage validators", async function () {
      await validator.connect(committee1).addValidator(node1.address);
      await validator.connect(committee2).addValidator(node2.address);

      expect(await validator.validatorCount()).to.equal(2);

      await validator.connect(committee2).removeValidator(node1.address);
      expect(await validator.validatorCount()).to.equal(1);
      expect(await validator.isValidator(node2.address)).to.equal(true);
    });

    it("Removed committee member loses validator management rights", async function () {
      await validator.removeCommitteeMember(committee1.address);

      await expect(
        validator.connect(committee1).addValidator(node1.address)
      ).to.be.revertedWithCustomError(validator, "OnlyOwnerOrCommittee");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // View Functions
  // ═══════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
    });

    it("Should return empty arrays initially", async function () {
      expect(await validator.getValidators()).to.deep.equal([]);
      expect(await validator.getCommitteeMembers()).to.deep.equal([]);
      expect(await validator.validatorCount()).to.equal(0);
      expect(await validator.committeeCount()).to.equal(0);
    });

    it("isValidator returns false for non-validator", async function () {
      expect(await validator.isValidator(attacker.address)).to.equal(false);
    });

    it("isCommitteeMember returns false for non-member", async function () {
      expect(await validator.isCommitteeMember(attacker.address)).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await validator.initializeOwner(owner.address);
    });

    it("Same address can be both validator and committee member", async function () {
      await validator.addCommitteeMember(node1.address);
      await validator.addValidator(node1.address);

      expect(await validator.isValidator(node1.address)).to.equal(true);
      expect(await validator.isCommitteeMember(node1.address)).to.equal(true);
    });

    it("Removing from committee does not affect validator status", async function () {
      await validator.addCommitteeMember(node1.address);
      await validator.addValidator(node1.address);
      await validator.removeCommitteeMember(node1.address);

      expect(await validator.isValidator(node1.address)).to.equal(true);
      expect(await validator.isCommitteeMember(node1.address)).to.equal(false);
    });

    it("Removing from validators does not affect committee status", async function () {
      await validator.addCommitteeMember(node1.address);
      await validator.addValidator(node1.address);
      await validator.removeValidator(node1.address);

      expect(await validator.isValidator(node1.address)).to.equal(false);
      expect(await validator.isCommitteeMember(node1.address)).to.equal(true);
    });

    it("Swap-and-pop maintains correct list after middle removal", async function () {
      await validator.addValidator(node1.address);
      await validator.addValidator(node2.address);
      await validator.addValidator(node3.address);

      // Remove middle element
      await validator.removeValidator(node2.address);

      const list = await validator.getValidators();
      expect(list.length).to.equal(2);
      expect(list).to.include(node1.address);
      expect(list).to.include(node3.address);
      expect(list).to.not.include(node2.address);
    });

    it("Swap-and-pop maintains correct list after first removal", async function () {
      await validator.addValidator(node1.address);
      await validator.addValidator(node2.address);
      await validator.addValidator(node3.address);

      // Remove first element
      await validator.removeValidator(node1.address);

      const list = await validator.getValidators();
      expect(list.length).to.equal(2);
      expect(list).to.include(node2.address);
      expect(list).to.include(node3.address);
    });

    it("Swap-and-pop maintains correct list after last removal", async function () {
      await validator.addValidator(node1.address);
      await validator.addValidator(node2.address);
      await validator.addValidator(node3.address);

      // Remove last element
      await validator.removeValidator(node3.address);

      const list = await validator.getValidators();
      expect(list.length).to.equal(2);
      expect(list).to.include(node1.address);
      expect(list).to.include(node2.address);
    });
  });
});
