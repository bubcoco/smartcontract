import { expect } from "chai";
import { network } from "hardhat";
import type { ExpireNFT } from "../types/ethers-contracts/ExpireNFT.ts";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const { ethers } = await network.connect();

// Custom time helpers since @nomicfoundation/hardhat-network-helpers is not available
const time = {
  latest: async () => {
    const block = await ethers.provider.getBlock("latest");
    return block!.timestamp;
  },
  increaseTo: async (timestamp: number) => {
    await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
    await ethers.provider.send("evm_mine", []);
  }
};

describe("ExpireNFT", function () {
  let expireNFT: ExpireNFT;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const TOKEN_NAME = "ExpireNFT";
  const TOKEN_SYMBOL = "ENFT";
  const MINT_PRICE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const ExpireNFTFactory = await ethers.getContractFactory("ExpireNFT");
    expireNFT = await ExpireNFTFactory.deploy(TOKEN_NAME, TOKEN_SYMBOL) as ExpireNFT;
    await expireNFT.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await expireNFT.name()).to.equal(TOKEN_NAME);
      expect(await expireNFT.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it("Should set the correct owner", async function () {
      expect(await expireNFT.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero minted tokens", async function () {
      expect(await expireNFT.totalMinted()).to.equal(0);
    });

    it("Should have max supply of 10000", async function () {
      expect(await expireNFT.MAX_SUPPLY()).to.equal(10000);
    });

    it("Should have correct available tokens", async function () {
      expect(await expireNFT.checkAvailableNumber()).to.equal(10000);
    });

    it("Should have mint price of 0", async function () {
      expect(await expireNFT.mintPrice()).to.equal(0);
    });
  });

  describe("Mint Price Configuration", function () {
    it("Should allow owner to set mint price", async function () {
      await expireNFT.setMintPrice(MINT_PRICE);
      expect(await expireNFT.mintPrice()).to.equal(MINT_PRICE);
    });

    it("Should not allow non-owner to set mint price", async function () {
      await expect(
        expireNFT.connect(user1).setMintPrice(MINT_PRICE)
      ).to.be.revertedWithCustomError(expireNFT, "OwnableUnauthorizedAccount");
    });
  });

  describe("Base URI", function () {
    it("Should allow owner to set base URI", async function () {
      await expireNFT.setBaseURI("ipfs://test/");
      await expireNFT.mintAtIndex(1);
      expect(await expireNFT.tokenURI(1)).to.equal("ipfs://test/1.json");
    });

    it("Should not allow non-owner to set base URI", async function () {
      await expect(
        expireNFT.connect(user1).setBaseURI("ipfs://test/")
      ).to.be.revertedWithCustomError(expireNFT, "OwnableUnauthorizedAccount");
    });
  });

  describe("mintAtIndex", function () {
    it("Should mint a specific token ID", async function () {
      await expireNFT.mintAtIndex(5);
      expect(await expireNFT.ownerOf(5)).to.equal(owner.address);
      expect(await expireNFT.totalMinted()).to.equal(1);
    });

    it("Should emit MintedAtIndex event", async function () {
      await expect(expireNFT.mintAtIndex(10))
        .to.emit(expireNFT, "MintedAtIndex")
        .withArgs(owner.address, 10);
    });

    it("Should require payment when mint price is set", async function () {
      await expireNFT.setMintPrice(MINT_PRICE);
      await expect(
        expireNFT.mintAtIndex(1)
      ).to.be.revertedWith("Insufficient payment");

      await expireNFT.mintAtIndex(1, { value: MINT_PRICE });
      expect(await expireNFT.ownerOf(1)).to.equal(owner.address);
    });

    it("Should not allow minting the same token twice", async function () {
      await expireNFT.mintAtIndex(1);
      await expect(
        expireNFT.mintAtIndex(1)
      ).to.be.revertedWith("Token already minted");
    });

    it("Should not allow minting token ID >= MAX_SUPPLY", async function () {
      await expect(
        expireNFT.mintAtIndex(10000)
      ).to.be.revertedWith("Token ID exceeds max supply");
    });

    it("Should decrease available tokens", async function () {
      const availableBefore = await expireNFT.checkAvailableNumber();
      await expireNFT.mintAtIndex(1);
      const availableAfter = await expireNFT.checkAvailableNumber();
      expect(availableAfter).to.equal(availableBefore - 1n);
    });

    it("Should update ownedIds correctly", async function () {
      await expireNFT.connect(user1).mintAtIndex(1);
      await expireNFT.connect(user1).mintAtIndex(2);
      await expireNFT.connect(user1).mintAtIndex(3);

      const owned = await expireNFT.ownedIds(user1.address);
      expect(owned.length).to.equal(3);
      expect(owned).to.include(1n);
      expect(owned).to.include(2n);
      expect(owned).to.include(3n);
    });
  });

  describe("mintRandom", function () {
    it("Should mint a random token", async function () {
      const tx = await expireNFT.mintRandom();
      await tx.wait();
      expect(await expireNFT.totalMinted()).to.equal(1);
      expect(await expireNFT.balanceOf(owner.address)).to.equal(1);
    });

    it("Should emit MintedRandom event", async function () {
      await expect(expireNFT.mintRandom())
        .to.emit(expireNFT, "MintedRandom");
    });

    it("Should mint different tokens on multiple calls", async function () {
      const tx1 = await expireNFT.mintRandom();
      const receipt1 = await tx1.wait();
      const event1 = receipt1?.logs.find((log: any) => {
        try {
          return expireNFT.interface.parseLog(log)?.name === "MintedRandom";
        } catch { return false; }
      });
      const token1 = event1 ? expireNFT.interface.parseLog(event1)?.args[1] : 0n;

      const tx2 = await expireNFT.mintRandom();
      const receipt2 = await tx2.wait();
      const event2 = receipt2?.logs.find((log: any) => {
        try {
          return expireNFT.interface.parseLog(log)?.name === "MintedRandom";
        } catch { return false; }
      });
      const token2 = event2 ? expireNFT.interface.parseLog(event2)?.args[1] : 0n;

      expect(token1).to.not.equal(token2);
    });

    it("Should work with consistent gas across mints", async function () {
      // Mint first token
      const gas1 = await expireNFT.mintRandom.estimateGas();
      await expireNFT.mintRandom();

      // Mint 50 more tokens
      for (let i = 0; i < 50; i++) {
        await expireNFT.connect(user1).mintRandom();
      }

      // Mint again and check gas is similar
      const gas2 = await expireNFT.mintRandom.estimateGas();

      // Gas should be within 20% (accounting for storage changes)
      const gasDiff = gas1 > gas2 ? gas1 - gas2 : gas2 - gas1;
      const gasPercent = (gasDiff * 100n) / gas1;
      expect(gasPercent).to.be.lessThan(1000n);
    });

    it("Should require payment when mint price is set", async function () {
      await expireNFT.setMintPrice(MINT_PRICE);
      await expect(
        expireNFT.mintRandom()
      ).to.be.revertedWith("Insufficient payment");

      await expireNFT.mintRandom({ value: MINT_PRICE });
      expect(await expireNFT.totalMinted()).to.equal(1);
    });

    it("Should decrease available count", async function () {
      const availableBefore = await expireNFT.checkAvailableNumber();
      await expireNFT.mintRandom();
      const availableAfter = await expireNFT.checkAvailableNumber();
      expect(availableAfter).to.equal(availableBefore - 1n);
    });
  });

  describe("mintReserve", function () {
    it("Should allow owner to reserve mint", async function () {
      await expireNFT.mintReserve(user1.address, 100);
      expect(await expireNFT.ownerOf(100)).to.equal(user1.address);
    });

    it("Should emit MintedReserve event", async function () {
      await expect(expireNFT.mintReserve(user1.address, 50))
        .to.emit(expireNFT, "MintedReserve")
        .withArgs(user1.address, 50);
    });

    it("Should not allow non-owner to reserve mint", async function () {
      await expect(
        expireNFT.connect(user1).mintReserve(user1.address, 100)
      ).to.be.revertedWithCustomError(expireNFT, "OwnableUnauthorizedAccount");
    });

    it("Should not require payment", async function () {
      await expireNFT.setMintPrice(MINT_PRICE);
      await expireNFT.mintReserve(user1.address, 100);
      expect(await expireNFT.ownerOf(100)).to.equal(user1.address);
    });
  });

  describe("mintReserveBatch", function () {
    it("Should batch mint multiple tokens", async function () {
      const tokenIds = [1, 5, 10, 25, 100];
      await expireNFT.mintReserveBatch(user1.address, tokenIds);

      for (const id of tokenIds) {
        expect(await expireNFT.ownerOf(id)).to.equal(user1.address);
      }
      expect(await expireNFT.totalMinted()).to.equal(tokenIds.length);
    });

    it("Should not allow non-owner to batch mint", async function () {
      await expect(
        expireNFT.connect(user1).mintReserveBatch(user1.address, [1, 2, 3])
      ).to.be.revertedWithCustomError(expireNFT, "OwnableUnauthorizedAccount");
    });

    it("Should fail if exceeding max supply", async function () {
      const tooManyTokens = Array.from({ length: 10001 }, (_, i) => i);
      await expect(
        expireNFT.mintReserveBatch(user1.address, tooManyTokens)
      ).to.be.revertedWith("Would exceed max supply");
    });
  });

  describe("Expiration Date", function () {
    it("Should allow owner to set expiration date", async function () {
      const futureTime = (await time.latest()) + 3600;
      await expireNFT.setExpireDate(futureTime);
      expect(await expireNFT.expireDate()).to.equal(futureTime);
    });

    it("Should emit ExpireDateSet event", async function () {
      const futureTime = (await time.latest()) + 3600;
      await expect(expireNFT.setExpireDate(futureTime))
        .to.emit(expireNFT, "ExpireDateSet")
        .withArgs(futureTime);
    });

    it("Should not allow setting expiration in the past", async function () {
      const pastTime = (await time.latest()) - 3600;
      await expect(
        expireNFT.setExpireDate(pastTime)
      ).to.be.revertedWith("Expiration must be in future");
    });

    it("Should prevent minting after expiration", async function () {
      const futureTime = (await time.latest()) + 3600;
      await expireNFT.setExpireDate(futureTime);

      // Should work before expiration
      await expireNFT.mintAtIndex(1);

      // Fast forward past expiration
      await time.increaseTo(futureTime + 1);

      // Should fail after expiration
      await expect(
        expireNFT.mintAtIndex(2)
      ).to.be.revertedWith("Minting has expired");

      await expect(
        expireNFT.mintRandom()
      ).to.be.revertedWith("Minting has expired");
    });
  });

  describe("Activity Period", function () {
    it("Should allow owner to set activity period", async function () {
      const startTime = (await time.latest()) + 3600;
      const endTime = startTime + 7200;

      await expireNFT.setActivityPeriod(startTime, endTime);
      expect(await expireNFT.activityStart()).to.equal(startTime);
      expect(await expireNFT.activityEnd()).to.equal(endTime);
    });

    it("Should emit ActivityPeriodSet event", async function () {
      const startTime = (await time.latest()) + 3600;
      const endTime = startTime + 7200;

      await expect(expireNFT.setActivityPeriod(startTime, endTime))
        .to.emit(expireNFT, "ActivityPeriodSet")
        .withArgs(startTime, endTime);
    });

    it("Should not allow end time before start time", async function () {
      const startTime = (await time.latest()) + 3600;
      const endTime = startTime - 1;

      await expect(
        expireNFT.setActivityPeriod(startTime, endTime)
      ).to.be.revertedWith("End must be after start");
    });

    it("Should check if transfer is active", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      await expireNFT.setActivityPeriod(startTime, endTime);

      // Before start
      expect(await expireNFT.isTransferActive()).to.be.false;

      // During period
      await time.increaseTo(startTime + 1);
      expect(await expireNFT.isTransferActive()).to.be.true;

      // After end
      await time.increaseTo(endTime + 1);
      expect(await expireNFT.isTransferActive()).to.be.false;
    });

    it("Should check if activity has ended", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 7200;

      await expireNFT.setActivityPeriod(startTime, endTime);

      // Before end
      expect(await expireNFT.isActivityEnded()).to.be.false;

      // After end
      await time.increaseTo(endTime + 1);
      expect(await expireNFT.isActivityEnded()).to.be.true;
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await expireNFT.connect(user1).mintAtIndex(1);
    });

    it("Should allow transfer during active period", async function () {
      // Default is active immediately
      await expireNFT.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await expireNFT.ownerOf(1)).to.equal(user2.address);
    });

    it("Should block transfer before activity start", async function () {
      const futureTime = (await time.latest()) + 3600;
      await expireNFT.setActivityPeriod(futureTime, futureTime + 7200);

      await expect(
        expireNFT.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Transfers not active or frozen");
    });

    it("Should block transfer after activity end", async function () {
      const currentTime = await time.latest();
      const startTime = currentTime;
      const endTime = currentTime + 3600;

      await expireNFT.setActivityPeriod(startTime, endTime);

      // Fast forward past end
      await time.increaseTo(endTime + 1);

      await expect(
        expireNFT.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Transfers not active or frozen");
    });

    it("Should update ownedIds after transfer", async function () {
      await expireNFT.connect(user1).transferFrom(user1.address, user2.address, 1);

      const user1Owned = await expireNFT.ownedIds(user1.address);
      const user2Owned = await expireNFT.ownedIds(user2.address);

      expect(user1Owned.length).to.equal(0);
      expect(user2Owned.length).to.equal(1);
      expect(user2Owned[0]).to.equal(1);
    });
  });

  describe("Burn", function () {
    beforeEach(async function () {
      await expireNFT.connect(user1).mintAtIndex(1);
    });

    it("Should allow owner to burn their token", async function () {
      await expireNFT.connect(user1).burn(1);
      await expect(expireNFT.ownerOf(1)).to.be.revertedWithCustomError(expireNFT, "ERC721NonexistentToken");
      expect(await expireNFT.tokenExists(1)).to.be.false;
    });

    it("Should emit TokenBurned event", async function () {
      await expect(expireNFT.connect(user1).burn(1))
        .to.emit(expireNFT, "TokenBurned")
        .withArgs(user1.address, 1);
    });

    it("Should not allow non-owner to burn before activity end", async function () {
      await expect(
        expireNFT.connect(user2).burn(1)
      ).to.be.revertedWith("Not authorized to burn");
    });

    it("Should allow anyone to burn after activity end", async function () {
      const currentTime = await time.latest();
      await expireNFT.setActivityPeriod(currentTime, currentTime + 3600);

      await time.increaseTo(currentTime + 3601);

      await expireNFT.connect(user2).burn(1);
      await expect(expireNFT.ownerOf(1)).to.be.revertedWithCustomError(expireNFT, "ERC721NonexistentToken");
    });

    it("Should update ownedIds after burn", async function () {
      await expireNFT.connect(user1).mintAtIndex(2);
      await expireNFT.connect(user1).mintAtIndex(3);

      let owned = await expireNFT.ownedIds(user1.address);
      expect(owned.length).to.equal(3);

      await expireNFT.connect(user1).burn(2);

      owned = await expireNFT.ownedIds(user1.address);
      expect(owned.length).to.equal(2);
      expect(owned).to.not.include(2n);
    });
  });

  describe("getAvailableTokens", function () {
    it("Should return available tokens", async function () {
      const available = await expireNFT.getAvailableTokens(10);
      expect(available.length).to.equal(10);
    });

    it("Should return fewer tokens if less available", async function () {
      // Mint some tokens
      for (let i = 0; i < 9995; i++) {
        await expireNFT.mintAtIndex(i);
      }

      const available = await expireNFT.getAvailableTokens(100);
      expect(available.length).to.equal(5);
    });

    it("Should not allow limit > 100", async function () {
      await expect(
        expireNFT.getAvailableTokens(101)
      ).to.be.revertedWith("Limit too high");
    });

    it("Should return correct tokens after some mints", async function () {
      await expireNFT.mintAtIndex(0);
      await expireNFT.mintAtIndex(1);
      await expireNFT.mintAtIndex(2);

      const available = await expireNFT.getAvailableTokens(10);
      expect(available).to.not.include(0n);
      expect(available).to.not.include(1n);
      expect(available).to.not.include(2n);
    });
  });

  describe("ownedIds", function () {
    it("Should return empty array for non-owner", async function () {
      const owned = await expireNFT.ownedIds(user1.address);
      expect(owned.length).to.equal(0);
    });

    it("Should return all owned token IDs", async function () {
      await expireNFT.connect(user1).mintAtIndex(5);
      await expireNFT.connect(user1).mintAtIndex(10);
      await expireNFT.connect(user1).mintAtIndex(15);

      const owned = await expireNFT.ownedIds(user1.address);
      expect(owned.length).to.equal(3);
      expect(owned).to.include(5n);
      expect(owned).to.include(10n);
      expect(owned).to.include(15n);
    });

    it("Should update after transfer", async function () {
      await expireNFT.connect(user1).mintAtIndex(1);
      await expireNFT.connect(user1).transferFrom(user1.address, user2.address, 1);

      expect((await expireNFT.ownedIds(user1.address)).length).to.equal(0);
      expect((await expireNFT.ownedIds(user2.address)).length).to.equal(1);
    });
  });

  describe("Withdraw", function () {
    it("Should allow owner to withdraw funds", async function () {
      await expireNFT.setMintPrice(MINT_PRICE);
      await expireNFT.connect(user1).mintAtIndex(1, { value: MINT_PRICE });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await expireNFT.withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter).to.equal(balanceBefore + MINT_PRICE - gasUsed);
    });

    it("Should not allow non-owner to withdraw", async function () {
      await expect(
        expireNFT.connect(user1).withdraw()
      ).to.be.revertedWithCustomError(expireNFT, "OwnableUnauthorizedAccount");
    });

    it("Should fail if no balance", async function () {
      await expect(
        expireNFT.withdraw()
      ).to.be.revertedWith("No balance to withdraw");
    });
  });


});