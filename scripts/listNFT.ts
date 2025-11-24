import { ethers } from "hardhat";

async function main() {
  const marketplaceAddress = process.env.MARKETPLACE_ADDRESS || "";
  const nftAddress = process.env.NFT_ADDRESS || "";
  const tokenId = process.env.TOKEN_ID || "0";
  const price = process.env.PRICE || "1"; // in tokens
  const isERC721 = process.env.IS_ERC721 !== "false";

  if (!marketplaceAddress || !nftAddress) {
    throw new Error("Please set MARKETPLACE_ADDRESS and NFT_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  console.log(`Listing NFT from account: ${signer.address}`);
  console.log(`Marketplace: ${marketplaceAddress}`);
  console.log(`NFT Contract: ${nftAddress}`);
  console.log(`Token ID: ${tokenId}`);
  console.log(`Price: ${price} tokens`);
  console.log(`Type: ${isERC721 ? "ERC721" : "ERC1155"}\n`);

  const marketplace = await ethers.getContractAt("Marketplace", marketplaceAddress);
  const priceWei = ethers.parseEther(price);

  if (isERC721) {
    const nft = await ethers.getContractAt("IERC721", nftAddress);
    
    // Check ownership
    const owner = await nft.ownerOf(tokenId);
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error(`You don't own token ${tokenId}`);
    }

    // Approve if needed
    const isApproved = await nft.isApprovedForAll(signer.address, marketplaceAddress);
    if (!isApproved) {
      console.log("Approving marketplace...");
      const approveTx = await nft.setApprovalForAll(marketplaceAddress, true);
      await approveTx.wait();
      console.log("✅ Approved\n");
    }

    // List
    console.log("Listing NFT...");
    const listTx = await marketplace.listERC721(nftAddress, tokenId, priceWei);
    const receipt = await listTx.wait();

    const listEvent = receipt?.logs
      .map(log => {
        try {
          return marketplace.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find(event => event?.name === "ItemListed");

    if (listEvent) {
      console.log("✅ NFT Listed Successfully!");
      console.log(`Listing ID: ${listEvent.args.listingId}`);
      console.log(`Price: ${ethers.formatEther(listEvent.args.pricePerToken)} tokens`);
    }
  } else {
    // ERC1155 listing
    const amount = process.env.AMOUNT || "1";
    const nft = await ethers.getContractAt("IERC1155", nftAddress);

    // Check balance
    const balance = await nft.balanceOf(signer.address, tokenId);
    if (balance < BigInt(amount)) {
      throw new Error(`Insufficient balance. You have ${balance} but trying to list ${amount}`);
    }

    // Approve if needed
    const isApproved = await nft.isApprovedForAll(signer.address, marketplaceAddress);
    if (!isApproved) {
      console.log("Approving marketplace...");
      const approveTx = await nft.setApprovalForAll(marketplaceAddress, true);
      await approveTx.wait();
      console.log("✅ Approved\n");
    }

    // List
    console.log(`Listing ${amount} tokens...`);
    const listTx = await marketplace.listERC1155(nftAddress, tokenId, amount, priceWei);
    const receipt = await listTx.wait();

    const listEvent = receipt?.logs
      .map(log => {
        try {
          return marketplace.interface.parseLog({ topics: log.topics as string[], data: log.data });
        } catch {
          return null;
        }
      })
      .find(event => event?.name === "ItemListed");

    if (listEvent) {
      console.log("✅ NFT Listed Successfully!");
      console.log(`Listing ID: ${listEvent.args.listingId}`);
      console.log(`Amount: ${listEvent.args.amount}`);
      console.log(`Price per token: ${ethers.formatEther(listEvent.args.pricePerToken)} tokens`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });