import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WS_URL = "ws://localhost:8546";
const ADDRESSES_PATH = path.resolve(__dirname, "../deployed-addresses.json");
if (!fs.existsSync(ADDRESSES_PATH)) {
    throw new Error(`Addresses file not found at ${ADDRESSES_PATH}. Run deployment script first.`);
}
const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
const MARKETPLACE_ADDRESS = addresses.Marketplace;
const MOCK_COUPON_ADDRESS = addresses.MockCoupon;

const ARTIFACT_PATH = path.resolve(__dirname, "../artifacts/contracts/Marketplace.sol/Marketplace.json");

async function main() {
    console.log(`Connecting to WebSocket: ${WS_URL}`);
    const provider = new ethers.WebSocketProvider(WS_URL);

    // Keep the process alive
    /*
    provider._websocket.on("close", () => {
        console.log("WebSocket connection closed. Reconnecting...");
        setTimeout(main, 1000);
    });
    */
    // Ethers v6 WebSocketProvider handles some reconnection but let's keep it simple for now and just log errors.

    // Load ABI
    if (!fs.existsSync(ARTIFACT_PATH)) {
        throw new Error(`Artifact not found at ${ARTIFACT_PATH}. Run 'npx hardhat compile' first.`);
    }
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
    const abi = artifact.abi;

    const contract = new ethers.Contract(MARKETPLACE_ADDRESS, abi, provider);

    // Coupon Contract
    // Load Coupon ABI (using IBaseCoupon or similar, or just defining it manually for simplicity or loading artifact)
    // We'll load MockCoupon artifact
    const COUPON_ARTIFACT_PATH = path.resolve(__dirname, "../artifacts/contracts/mocks/MockCoupon.sol/MockCoupon.json");
    if (!fs.existsSync(COUPON_ARTIFACT_PATH)) {
        throw new Error(`Artifact not found at ${COUPON_ARTIFACT_PATH}`);
    }
    const couponArtifact = JSON.parse(fs.readFileSync(COUPON_ARTIFACT_PATH, "utf8"));
    const couponContract = new ethers.Contract(MOCK_COUPON_ADDRESS, couponArtifact.abi, provider);

    console.log(`Listening for events on Marketplace at ${MARKETPLACE_ADDRESS}...`);
    console.log(`Listening for events on Coupon at ${MOCK_COUPON_ADDRESS}...`);

    // Fetch existing active listings
    try {
        console.log("Fetching active listings...");
        // getAllActiveListings() returns Listing[]
        const activeListings = await contract.getAllActiveListings();
        console.log(`Found ${activeListings.length} active listings:`);

        activeListings.forEach((listing, index) => {
            console.log(`\n[Active Listing #${index + 1}]`);
            // Listing struct is array-like in ethers v6 results usually, but if named it might have properties
            // Listing: [seller, typeId, amount, pricePerUnit, paymentToken, active, listedAt]
            console.log(`Seller: ${listing.seller}`);
            console.log(`Type ID: ${listing.typeId.toString()}`);
            console.log(`Amount: ${listing.amount.toString()}`);
            console.log(`Price: ${ethers.formatUnits(listing.pricePerUnit, 18)} THB`);
            console.log(`Payment Token: ${listing.paymentToken}`);
            console.log(`Listed At: ${new Date(Number(listing.listedAt) * 1000).toLocaleString()}`);
        });
        console.log("\n--------------------------------------------------\n");
    } catch (error) {
        console.error("Error fetching active listings:", error);
    }

    /*
    event CouponListed(
        uint256 indexed listingId,
        uint256 indexed typeId,
        address indexed seller,
        uint256 amount,
        uint256 pricePerUnit,
        address paymentToken
    );
    */

    contract.on("CouponListed", (listingId, typeId, seller, amount, pricePerUnit, paymentToken, event) => {
        console.log("\n--- New Coupon Listed ---");
        console.log(`Listing ID: ${listingId.toString()}`);
        console.log(`Type ID: ${typeId.toString()}`);
        console.log(`Seller: ${seller}`);
        console.log(`Amount: ${amount.toString()}`);
        console.log(`Price: ${ethers.formatUnits(pricePerUnit, 18)} THB (assuming 18 decimals)`); // Adjust decimals if needed
        console.log(`Payment Token: ${paymentToken}`);
        console.log(`Block Number: ${event.log.blockNumber}`);
        console.log("-------------------------\n");
    });

    contract.on("CouponSold", (listingId, typeId, seller, buyer, amount, totalPrice, paymentToken, event) => {
        console.log("\n--- Coupon Sold ---");
        console.log(`Listing ID: ${listingId.toString()}`);
        console.log(`Buyer: ${buyer}`);
        console.log(`Amount: ${amount.toString()}`);
        console.log(`Total Price: ${ethers.formatUnits(totalPrice, 18)}`);
        console.log("-------------------\n");
    });

    couponContract.on("CouponRedeemed", (typeId, redeemer, amount, event) => {
        console.log("\n--- Coupon Redeemed ---");
        console.log(`Type ID: ${typeId.toString()}`);
        console.log(`Redeemer: ${redeemer}`);
        console.log(`Amount: ${amount.toString()}`);
        console.log("-----------------------\n");
    });

    contract.on("CouponDelisted", (listingId, seller, event) => {
        console.log("\n--- Coupon Delisted ---");
        console.log(`Listing ID: ${listingId.toString()}`);
        console.log(`Seller: ${seller}`);
        console.log("-----------------------\n");
    });

    console.log("Subscribed to CouponListed and CouponSold events.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
