const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");
const ADDRESSES_PATH = path.resolve(__dirname, "../deployed-addresses.json");
if (!fs.existsSync(ADDRESSES_PATH)) {
    throw new Error(`Addresses file not found at ${ADDRESSES_PATH}. Run deployment script first.`);
}
const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
const MOCK_COUPON_ADDRESS = addresses.MockCoupon;
const MARKETPLACE_ADDRESS = addresses.Marketplace;
const MOCK_THB_ADDRESS = addresses.MockTHB;

async function main() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not found");
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log("Wallet:", wallet.address);

    const loadArtifact = (contractPath, name) => {
        const artifactPath = path.join(ARTIFACTS_DIR, contractPath, `${name}.json`);
        return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    };

    // Load contracts
    const mockCouponArtifact = loadArtifact("mocks/MockCoupon.sol", "MockCoupon");
    const mockCoupon = new ethers.Contract(MOCK_COUPON_ADDRESS, mockCouponArtifact.abi, wallet);

    const marketplaceArtifact = loadArtifact("Marketplace.sol", "Marketplace");
    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, marketplaceArtifact.abi, wallet);

    console.log("Creating new Coupon Type...");
    // createCouponType(name, startDate, expireDate)
    const now = Math.floor(Date.now() / 1000);
    const startDate = now - 3600; // Started 1 hour ago
    const expireDate = now + 30 * 24 * 3600; // Expires in 30 days

    // Explicit gas settings
    const overrides = { gasPrice: 100000000000n };

    console.log("Whitelisting deployer...");
    try {
        const txWhitelist = await marketplace.addToWhitelist(wallet.address, overrides);
        console.log("Tx Whitelist sent:", txWhitelist.hash);
        await txWhitelist.wait();
        console.log("Whitelisted.");
    } catch (e) {
        console.log("Whitelist failed or already whitelisted:", e.message);
    }

    const txCreate = await mockCoupon.createCouponType("Mass Test Coupon JS", startDate, expireDate, overrides);
    console.log("Tx Create sent:", txCreate.hash);
    const receiptCreate = await txCreate.wait();
    console.log("Tx Create mined.");

    // Parse logs to find CouponTypeCreated event
    let typeId = 1; // Fallback
    for (const log of receiptCreate.logs) {
        try {
            const parsed = mockCoupon.interface.parseLog(log);
            if (parsed && parsed.name === "CouponTypeCreated") {
                typeId = parsed.args.typeId;
                console.log(`Created Coupon Type ID: ${typeId.toString()}`);
                break;
            }
        } catch (e) { }
    }

    console.log(`Minting 1000 coupons of type ${typeId}...`);
    const txMint = await mockCoupon.mint(wallet.address, typeId, 1000, overrides);
    console.log("Tx Mint sent:", txMint.hash);
    await txMint.wait();
    console.log("Minted.");

    console.log("Approving Marketplace...");
    const txApprove = await mockCoupon.setApprovalForAll(MARKETPLACE_ADDRESS, true, overrides);
    console.log("Tx Approve sent:", txApprove.hash);
    await txApprove.wait();
    console.log("Approved.");

    console.log("Listing 1000 coupons in batches...");
    // List 5 batches of 200
    const price = ethers.parseUnits("10", 18); // 10 THB

    for (let i = 0; i < 5; i++) {
        console.log(`Listing batch ${i + 1}/5 (200 coupons)...`);
        // Get current nonce for each transaction to avoid replacement underpriced errors
        const currentNonce = await wallet.getNonce();
        const txList = await marketplace.listCoupon(typeId, 200, price, MOCK_THB_ADDRESS, { ...overrides, nonce: currentNonce });
        console.log("Tx List sent:", txList.hash);
        await txList.wait();
        console.log(`Batch ${i + 1} listed.`);
    }

    console.log("Mass listing complete!");
}

main().catch(console.error);
