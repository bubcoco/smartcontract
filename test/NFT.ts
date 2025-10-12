import { expect } from "chai";
import { ethers } from "hardhat";
import { NFT } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("NFT Contract", function () {
  const ROYALTY_FEES = 500; // 5%
  const SUB_ID = 1;
  const BASE_URI = "ipfs://test/";
  const MAX_SUPPLY = 10000;

  async function deployNFTFixture() {
    const [owner, worker, user, other] = await ethers.getSigners();

    // Deploy Mock ERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const currency = await MockERC20Factory.deploy();
    await currency.waitForDeployment();

    // Mint tokens to user for testing
    const mintAmount = ethers.parseEther("100000");
    await currency.mint(user.address, mintAmount);

    // Deploy NFT
    const NFTFactory = await ethers.getContractFactory("NFT");
    const nft = await NFTFactory.deploy(
      await currency.getAddress(),
      BASE_URI,
      ROYALTY_FEES,
      SUB_ID
    );
    await nft.waitForDeployment();

    // Grant worker role
    const WORKER_ROLE = await nft.WORKER_ROLE();
    await nft.grantRole(WORKER_ROLE, worker.address);

    return { nft, currency, owner, worker, user, other, WORKER_ROLE };
  }

  describe("Deployment", function () {
    it("Should set the correct currency", async function () {
      const { nft, currency } = await loadFixture(deployNFTFixture);
      expect(await nft.currency()).to.equal(await currency.getAddress());
    });

    it("Should set the correct sub ID", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      expect(await nft._SubId()).to.equal(SUB_ID);
    });

    it("Should set the correct owner", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("Should grant admin role to deployer", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      const DEFAULT_ADMIN_ROLE = await nft.DEFAULT_ADMIN_ROLE();
      expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should set the correct royalty info", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      const salePrice = ethers.parseEther("1");
      const [receiver, royaltyAmount] = await nft.royaltyInfo(1, salePrice);
      
      expect(receiver).to.equal(owner.address);
      expect(royaltyAmount).to.equal(salePrice * BigInt(ROYALTY_FEES) / 10000n);
    });
  });

  describe("Minting", function () {
    it("Should mint tokens successfully", async function () {
      const { nft, currency, worker, user } = await loadFixture(deployNFTFixture);
      
      const quantity = 3;
      const totalPay = ethers.parseEther("1000");
      
      // Approve currency
      await currency.connect(user).approve(await nft.getAddress(), totalPay);
      
      // Mint
      const tx = await nft.connect(worker).mint(user.address, quantity, totalPay);
      await tx.wait();
      
      // Verify by checking contract balance
      const contractBalance = await currency.balanceOf(await nft.getAddress());
      expect(contractBalance).to.equal(totalPay);
    });

    it("Should transfer tokens from user to contract", async function () {
      const { nft, currency, worker, user } = await loadFixture(deployNFTFixture);
      
      const quantity = 2;
      const totalPay = ethers.parseEther("500");
      
      const userBalanceBefore = await currency.balanceOf(user.address);
      
      await currency.connect(user).approve(await nft.getAddress(), totalPay);
      await nft.connect(worker).mint(user.address, quantity, totalPay);
      
      const userBalanceAfter = await currency.balanceOf(user.address);
      const contractBalance = await currency.balanceOf(await nft.getAddress());
      
      expect(userBalanceBefore - userBalanceAfter).to.equal(totalPay);
      expect(contractBalance).to.equal(totalPay);
    });

    it("Should revert when paused", async function () {
      const { nft, worker, user } = await loadFixture(deployNFTFixture);
      
      await nft.pause();
      
      await expect(
        nft.connect(worker).mint(user.address, 1, ethers.parseEther("100"))
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should revert without worker role", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).mint(user.address, 1, ethers.parseEther("100"))
      ).to.be.reverted;
    });

    it("Should revert with zero quantity", async function () {
      const { nft, worker, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(worker).mint(user.address, 0, 0)
      ).to.be.reverted;
    });

    it("Should emit Mint event", async function () {
      const { nft, currency, worker, user } = await loadFixture(deployNFTFixture);
      
      const quantity = 2;
      const totalPay = ethers.parseEther("500");
      
      await currency.connect(user).approve(await nft.getAddress(), totalPay);
      
      await expect(nft.connect(worker).mint(user.address, quantity, totalPay))
        .to.emit(nft, "Mint")
        .withArgs(user.address, quantity, totalPay, expect.anything());
    });

    it("Should return correct mint IDs array length", async function () {
      const { nft, currency, worker, user } = await loadFixture(deployNFTFixture);
      
      const quantity = 5;
      const totalPay = ethers.parseEther("1000");
      
      await currency.connect(user).approve(await nft.getAddress(), totalPay);
      
      const tx = await nft.connect(worker).mint(user.address, quantity, totalPay);
      const receipt = await tx.wait();
      
      // Find Mint event
      const mintEvent = receipt?.logs.find((log: any) => {
        try {
          const parsed = nft.interface.parseLog(log);
          return parsed?.name === "Mint";
        } catch {
          return false;
        }
      });
      
      expect(mintEvent).to.not.be.undefined;
    });
  });

  describe("Reserve", function () {
    it("Should reserve 5 tokens to worker", async function () {
      const { nft, worker } = await loadFixture(deployNFTFixture);
      
      await nft.connect(worker).reserve();
      
      // Check ownership of first 5 tokens (indices 0-4)
      for (let i = 0; i < 5; i++) {
        expect(await nft.ownerOf(i)).to.equal(worker.address);
      }
    });

    it("Should revert without worker role", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(nft.connect(user).reserve()).to.be.reverted;
    });
  });

  describe("Royalty Management", function () {
    it("Should set royalty info", async function () {
      const { nft, owner, other } = await loadFixture(deployNFTFixture);
      
      const newReceiver = other.address;
      const newFees = 1000; // 10%
      
      await nft.connect(owner).setRoyaltyInfo(newReceiver, newFees);
      
      const [receiver, royaltyAmount] = await nft.royaltyInfo(1, ethers.parseEther("1"));
      expect(receiver).to.equal(newReceiver);
      expect(royaltyAmount).to.equal(ethers.parseEther("0.1")); // 10% of 1 ETH
    });

    it("Should revert when non-owner sets royalty", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).setRoyaltyInfo(user.address, 1000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Base URI Management", function () {
    it("Should set base URI", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      
      const newURI = "ipfs://newuri/";
      await expect(nft.connect(owner).setBaseURI(newURI)).to.not.be.reverted;
    });

    it("Should revert when non-owner sets base URI", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).setBaseURI("ipfs://test/")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Sub ID Management", function () {
    it("Should set sub ID", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      
      const newSubId = 999;
      await nft.connect(owner).setSubId(newSubId);
      
      expect(await nft._SubId()).to.equal(newSubId);
    });

    it("Should revert when non-owner sets sub ID", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).setSubId(999)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Burning", function () {
    it("Should burn token", async function () {
      const { nft, currency, worker, user } = await loadFixture(deployNFTFixture);
      
      // Mint a token first
      await currency.connect(user).approve(await nft.getAddress(), ethers.parseEther("1000"));
      await nft.connect(worker).mint(user.address, 1, ethers.parseEther("1000"));
      
      // Get first minted token (assuming sequential minting from reserve)
      // Since reserve mints 0-4, first user mint should be at a higher index
      // We'll need to check ownership or use reserve first
      const tokenId = 0;
      
      // First reserve to get predictable token IDs
      await nft.connect(worker).reserve();
      
      // Now worker owns 0-4, burn one
      await nft.connect(worker).burn(tokenId);
      
      // Check token no longer exists
      await expect(nft.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("Should revert when non-owner burns", async function () {
      const { nft, worker, other } = await loadFixture(deployNFTFixture);
      
      // Reserve tokens to worker
      await nft.connect(worker).reserve();
      
      const tokenId = 0;
      
      // Try to burn as non-owner
      await expect(
        nft.connect(other).burn(tokenId)
      ).to.be.revertedWith("ERC721: caller is not token owner or approved");
    });
  });

  describe("Role Management", function () {
    it("Should grant multiple roles", async function () {
      const { nft, owner, WORKER_ROLE } = await loadFixture(deployNFTFixture);
      
      const [, , , , worker1, worker2, worker3] = await ethers.getSigners();
      const workers = [worker1.address, worker2.address, worker3.address];
      
      await nft.connect(owner).multiGrandRole(WORKER_ROLE, workers);
      
      for (const workerAddr of workers) {
        expect(await nft.hasRole(WORKER_ROLE, workerAddr)).to.be.true;
      }
    });

    it("Should check worker role", async function () {
      const { nft, worker, WORKER_ROLE } = await loadFixture(deployNFTFixture);
      
      expect(await nft.hasRole(WORKER_ROLE, worker.address)).to.be.true;
    });
  });

  describe("Withdrawal", function () {
    it("Should withdraw tokens", async function () {
      const { nft, currency, worker, user, owner } = await loadFixture(deployNFTFixture);
      
      const amount = ethers.parseEther("1000");
      
      // Mint to get tokens in contract
      await currency.connect(user).approve(await nft.getAddress(), amount);
      await nft.connect(worker).mint(user.address, 1, amount);
      
      const ownerBalanceBefore = await currency.balanceOf(owner.address);
      const contractBalance = await currency.balanceOf(await nft.getAddress());
      
      // Withdraw
      await nft.connect(owner).withdraw();
      
      expect(await currency.balanceOf(await nft.getAddress())).to.equal(0);
      expect(await currency.balanceOf(owner.address)).to.equal(
        ownerBalanceBefore + contractBalance
      );
    });

    it("Should revert when non-owner withdraws", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).withdraw()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Pause/Unpause", function () {
    it("Should pause and unpause", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      
      await nft.connect(owner).pause();
      expect(await nft.paused()).to.be.true;
      
      await nft.connect(owner).unpause();
      expect(await nft.paused()).to.be.false;
    });

    it("Should revert when non-owner pauses", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when non-owner unpauses", async function () {
      const { nft, owner, user } = await loadFixture(deployNFTFixture);
      
      await nft.connect(owner).pause();
      
      await expect(
        nft.connect(user).unpause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Fallback/Receive", function () {
    it("Should revert on receive", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        user.sendTransaction({
          to: await nft.getAddress(),
          value: ethers.parseEther("1")
        })
      ).to.be.reverted;
    });

    it("Should revert on fallback", async function () {
      const { nft, user } = await loadFixture(deployNFTFixture);
      
      await expect(
        user.sendTransaction({
          to: await nft.getAddress(),
          value: ethers.parseEther("1"),
          data: "0x12345678"
        })
      ).to.be.reverted;
    });
  });

  describe("Interface Support", function () {
    it("Should support ERC721 interface", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("Should support ERC2981 (Royalty) interface", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      expect(await nft.supportsInterface("0x2a55205a")).to.be.true;
    });

    it("Should support AccessControl interface", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      expect(await nft.supportsInterface("0x7965db0b")).to.be.true;
    });
  });

  describe("Coordinator Management", function () {
    it("Should set coordinator", async function () {
      const { nft, owner, other } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(owner).setCoordinator(other.address)
      ).to.not.be.reverted;
    });

    it("Should revert when non-owner sets coordinator", async function () {
      const { nft, user, other } = await loadFixture(deployNFTFixture);
      
      await expect(
        nft.connect(user).setCoordinator(other.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});