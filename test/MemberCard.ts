// test/MemberCard.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { MemberCard } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MemberCard", function () {
  let memberCard: MemberCard;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MemberCardFactory = await ethers.getContractFactory("MemberCard");
    memberCard = await MemberCardFactory.deploy();
    await memberCard.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await memberCard.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await memberCard.name()).to.equal("MemberCard");
      expect(await memberCard.symbol()).to.equal("MCARD");
    });

    it("Should have MAX_STAMPS set to 10", async function () {
      expect(await memberCard.MAX_STAMPS()).to.equal(10);
    });
  });

  describe("Minting", function () {
    it("Should mint a new card", async function () {
      const tx = await memberCard.mintCard(user1.address);
      await tx.wait();

      expect(await memberCard.ownerOf(0)).to.equal(user1.address);
    });

    it("Should emit CardMinted event", async function () {
      await expect(memberCard.mintCard(user1.address))
        .to.emit(memberCard, "CardMinted")
        .withArgs(user1.address, 0);
    });

    it("Should initialize card data correctly", async function () {
      await memberCard.mintCard(user1.address);
      
      const [stampCount, redeemed, , canRedeem] = await memberCard.getCardInfo(0);
      expect(stampCount).to.equal(0);
      expect(redeemed).to.equal(false);
      expect(canRedeem).to.equal(false);
    });

    it("Should only allow owner to mint", async function () {
      await expect(
        memberCard.connect(user1).mintCard(user2.address)
      ).to.be.revertedWithCustomError(memberCard, "OwnableUnauthorizedAccount");
    });

    it("Should mint multiple cards with incremental IDs", async function () {
      await memberCard.mintCard(user1.address);
      await memberCard.mintCard(user2.address);
      await memberCard.mintCard(user1.address);

      expect(await memberCard.ownerOf(0)).to.equal(user1.address);
      expect(await memberCard.ownerOf(1)).to.equal(user2.address);
      expect(await memberCard.ownerOf(2)).to.equal(user1.address);
    });
  });

  describe("Stamping", function () {
    beforeEach(async function () {
      await memberCard.mintCard(user1.address);
    });

    it("Should add a stamp to a card", async function () {
      await memberCard.addStamp(0);
      
      const stampCount = await memberCard.getStampCount(0);
      expect(stampCount).to.equal(1);
    });

    it("Should emit Stamped event", async function () {
      const tx = await memberCard.addStamp(0);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(memberCard, "Stamped")
        .withArgs(0, 1, block!.timestamp);
    });

    it("Should record timestamp for each stamp", async function () {
      await memberCard.addStamp(0);
      await memberCard.addStamp(0);
      
      const stamps = await memberCard.getStamps(0);
      expect(stamps.length).to.equal(2);
      expect(stamps[0]).to.be.gt(0);
      expect(stamps[1]).to.be.gte(stamps[0]);
    });

    it("Should allow adding up to 10 stamps", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      
      const stampCount = await memberCard.getStampCount(0);
      expect(stampCount).to.equal(10);
    });

    it("Should not allow adding more than 10 stamps", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      
      await expect(memberCard.addStamp(0))
        .to.be.revertedWith("Card is full");
    });

    it("Should not allow stamping non-existent card", async function () {
      await expect(memberCard.addStamp(999))
        .to.be.revertedWith("Card does not exist");
    });

    it("Should not allow stamping after redemption", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      await memberCard.connect(user1).redeemReward(0);
      
      await expect(memberCard.addStamp(0))
        .to.be.revertedWith("Card already redeemed");
    });

    it("Should only allow owner to add stamps", async function () {
      await expect(
        memberCard.connect(user1).addStamp(0)
      ).to.be.revertedWithCustomError(memberCard, "OwnableUnauthorizedAccount");
    });
  });

  describe("Redemption", function () {
    beforeEach(async function () {
      await memberCard.mintCard(user1.address);
    });

    it("Should allow redemption with 10 stamps", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      
      await expect(memberCard.connect(user1).redeemReward(0))
        .to.emit(memberCard, "Redeemed")
        .withArgs(0, user1.address);
    });

    it("Should set redeemed flag to true", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      await memberCard.connect(user1).redeemReward(0);
      
      expect(await memberCard.isRedeemed(0)).to.equal(true);
    });

    it("Should not allow redemption with less than 10 stamps", async function () {
      for (let i = 0; i < 9; i++) {
        await memberCard.addStamp(0);
      }
      
      await expect(
        memberCard.connect(user1).redeemReward(0)
      ).to.be.revertedWith("Need 10 stamps to redeem");
    });

    it("Should not allow non-owner to redeem", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      
      await expect(
        memberCard.connect(user2).redeemReward(0)
      ).to.be.revertedWith("Not the card owner");
    });

    it("Should not allow double redemption", async function () {
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      await memberCard.connect(user1).redeemReward(0);
      
      await expect(
        memberCard.connect(user1).redeemReward(0)
      ).to.be.revertedWith("Already redeemed");
    });

    it("Should update canRedeem status correctly", async function () {
      let [, , , canRedeem] = await memberCard.getCardInfo(0);
      expect(canRedeem).to.equal(false);

      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      
      [, , , canRedeem] = await memberCard.getCardInfo(0);
      expect(canRedeem).to.equal(true);

      await memberCard.connect(user1).redeemReward(0);
      
      [, , , canRedeem] = await memberCard.getCardInfo(0);
      expect(canRedeem).to.equal(false);
    });
  });

  describe("Card Reset", function () {
    beforeEach(async function () {
      await memberCard.mintCard(user1.address);
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      await memberCard.connect(user1).redeemReward(0);
    });

    it("Should reset a redeemed card", async function () {
      await memberCard.resetCard(0);
      
      const [stampCount, redeemed, stamps] = await memberCard.getCardInfo(0);
      expect(stampCount).to.equal(0);
      expect(redeemed).to.equal(false);
      expect(stamps.length).to.equal(0);
    });

    it("Should not reset non-redeemed card", async function () {
      await memberCard.mintCard(user2.address);
      
      await expect(memberCard.resetCard(1))
        .to.be.revertedWith("Card not yet redeemed");
    });

    it("Should allow stamping after reset", async function () {
      await memberCard.resetCard(0);
      await memberCard.addStamp(0);
      
      const stampCount = await memberCard.getStampCount(0);
      expect(stampCount).to.equal(1);
    });

    it("Should only allow owner to reset", async function () {
      await expect(
        memberCard.connect(user1).resetCard(0)
      ).to.be.revertedWithCustomError(memberCard, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await memberCard.mintCard(user1.address);
      await memberCard.addStamp(0);
      await memberCard.addStamp(0);
    });

    it("Should return correct card info", async function () {
      const [stampCount, redeemed, stamps, canRedeem] = await memberCard.getCardInfo(0);
      
      expect(stampCount).to.equal(2);
      expect(redeemed).to.equal(false);
      expect(stamps.length).to.equal(2);
      expect(canRedeem).to.equal(false);
    });

    it("Should return correct stamp count", async function () {
      expect(await memberCard.getStampCount(0)).to.equal(2);
    });

    it("Should return correct stamps array", async function () {
      const stamps = await memberCard.getStamps(0);
      expect(stamps.length).to.equal(2);
    });

    it("Should return correct redeemed status", async function () {
      expect(await memberCard.isRedeemed(0)).to.equal(false);
    });

    it("Should revert for non-existent card", async function () {
      await expect(memberCard.getCardInfo(999))
        .to.be.revertedWith("Card does not exist");
    });
  });

  describe("Integration Tests", function () {
    it("Should handle complete card lifecycle", async function () {
      // Mint card
      await memberCard.mintCard(user1.address);
      expect(await memberCard.ownerOf(0)).to.equal(user1.address);

      // Add stamps
      for (let i = 0; i < 10; i++) {
        await memberCard.addStamp(0);
      }
      expect(await memberCard.getStampCount(0)).to.equal(10);

      // Redeem
      await memberCard.connect(user1).redeemReward(0);
      expect(await memberCard.isRedeemed(0)).to.equal(true);

      // Reset
      await memberCard.resetCard(0);
      expect(await memberCard.getStampCount(0)).to.equal(0);
      expect(await memberCard.isRedeemed(0)).to.equal(false);
    });

    it("Should handle multiple cards independently", async function () {
      await memberCard.mintCard(user1.address);
      await memberCard.mintCard(user2.address);

      await memberCard.addStamp(0);
      await memberCard.addStamp(0);
      await memberCard.addStamp(1);

      expect(await memberCard.getStampCount(0)).to.equal(2);
      expect(await memberCard.getStampCount(1)).to.equal(1);
    });
  });
});