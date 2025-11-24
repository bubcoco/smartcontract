import { ethers } from "hardhat";

async function main() {
  const marketplaceAddress = process.env.MARKETPLACE_ADDRESS || "";
  
  if (!marketplaceAddress) {
    throw new Error("Please set MARKETPLACE_ADDRESS environment variable");
  }

  const [signer] = await ethers.getSigners();
  console.log(`Using account: ${signer.address}\n`);

  const marketplace = await ethers.getContractAt("Marketplace", marketplaceAddress);

  // Example 1: List an ERC721 NFT
  console.log("=== Example 1: List ERC721 NFT ===");
  const nft721Address = process.env.NFT721_ADDRESS || "";
  const tokenId = 0;
  const price = ethers.parseEther("1"); // 1 token

  if (nft721Address) {
    const nft721 = await ethers.getContractAt("IERC721", nft721Address);
    
    // Approve marketplace
    const approveTx = await nft721.setApprovalForAll(marketplaceAddress, true);
    await approveTx.wait();
    console.log("✅ Approved marketplace");

    // List NFT
    const listTx = await marketplace.listERC721(nft721Address, tokenId, price);
    const listReceipt = await listTx.wait();
    
    const listEvent = listReceipt?.logs
      .map(log => {
        try {
          return marketplace.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find(event => event?.name === "ItemListed");

    if (listEvent) {
      console.log(`✅ Listed NFT - Listing ID: ${listEvent.args.listingId}`);
      console.log(`   Price: ${ethers.formatEther(listEvent.args.pricePerToken)} tokens`);
    }
  }

  // Example 2: Buy with single payment token
  console.log("\n=== Example 2: Buy with Single Token ===");
  const listingId = 0;
  const paymentTokenAddress = process.env.WMATIC_ADDRESS || "";

  if (paymentTokenAddress) {
    const paymentToken = await ethers.getContractAt("IERC20", paymentTokenAddress);
    
    // Approve payment
    const approveTx = await paymentToken.approve(marketplaceAddress, price);
    await approveTx.wait();
    console.log("✅ Approved payment token");

    // Buy
    const buyTx = await marketplace.buyWithSingleToken(
      listingId,
      paymentTokenAddress,
      1
    );
    await buyTx.wait();
    console.log("✅ Purchase completed");
  }

  // Example 3: Buy with mixed payment (30% USDT, 70% WMATIC)
  console.log("\n=== Example 3: Buy with Mixed Payment ===");
  const usdtAddress = process.env.USDT_ADDRESS || "";
  const wmaticAddress = process.env.WMATIC_ADDRESS || "";

  if (usdtAddress && wmaticAddress) {
    const paymentSplits = [
      {
        token: usdtAddress,
        percentage: 3000 // 30%
      },
      {
        token: wmaticAddress,
        percentage: 7000 // 70%
      }
    ];

    const usdt = await ethers.getContractAt("IERC20", usdtAddress);
    const wmatic = await ethers.getContractAt("IERC20", wmaticAddress);

    // Calculate amounts
    const usdtAmount = (price * BigInt(3000)) / BigInt(10000);
    const wmaticAmount = (price * BigInt(7000)) / BigInt(10000);

    // Approve both tokens
    await usdt.approve(marketplaceAddress, usdtAmount);
    await wmatic.approve(marketplaceAddress, wmaticAmount);
    console.log("✅ Approved both payment tokens");

    // Buy with mixed payment
    const buyTx = await marketplace.buyWithMixedPayment(
      listingId,
      1,
      paymentSplits
    );
    await buyTx.wait();
    console.log("✅ Mixed payment purchase completed");
    console.log(`   Paid: 30% USDT (${ethers.formatEther(usdtAmount)})`);
    console.log(`   Paid: 70% WMATIC (${ethers.formatEther(wmaticAmount)})`);
  }

  // Example 4: Create an offer with mixed payment
  console.log("\n=== Example 4: Create Offer with Mixed Payment ===");
  
  if (usdtAddress && wmaticAddress) {
    const paymentSplits = [
      {
        token: usdtAddress,
        percentage: 4000 // 40%
      },
      {
        token: wmaticAddress,
        percentage: 6000 // 60%
      }
    ];

    const usdt = await ethers.getContractAt("IERC20", usdtAddress);
    const wmatic = await ethers.getContractAt("IERC20", wmaticAddress);

    const usdtAmount = (price * BigInt(4000)) / BigInt(10000);
    const wmaticAmount = (price * BigInt(6000)) / BigInt(10000);

    // Approve both tokens
    await usdt.approve(marketplaceAddress, usdtAmount);
    await wmatic.approve(marketplaceAddress, wmaticAmount);

    // Create offer (valid for 7 days)
    const offerTx = await marketplace.createOffer(
      listingId,
      1,
      paymentSplits,
      7 * 24 * 60 * 60 // 7 days in seconds
    );
    const offerReceipt = await offerTx.wait();

    const offerEvent = offerReceipt?.logs
      .map(log => {
        try {
          return marketplace.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find(event => event?.name === "OfferCreated");

    if (offerEvent) {
      console.log(`✅ Offer created - Offer ID: ${offerEvent.args.offerId}`);
      console.log(`   Total Amount: ${ethers.formatEther(offerEvent.args.totalAmount)}`);
      console.log(`   Payment: 40% USDT + 60% WMATIC`);
    }
  }

  // Get marketplace statistics
  console.log("\n=== Marketplace Statistics ===");
  const enabledTokens = await marketplace.getEnabledPaymentTokens();
  console.log(`Enabled Payment Tokens: ${enabledTokens.length}`);
  
  for (const token of enabledTokens) {
    const tokenInfo = await marketplace.paymentTokens(token);
    console.log(`  - ${tokenInfo.symbol}: ${token}`);
  }

  const platformFee = await marketplace.platformFee();
  console.log(`Platform Fee: ${Number(platformFee) / 100}%`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });