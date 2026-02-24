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
const MARKETPLACE_ADDRESS = addresses.Marketplace;
const MOCK_THB_ADDRESS = addresses.MockTHB;
const MOCK_COUPON_ADDRESS = addresses.MockCoupon;
const MOCK_VAULT_ADDRESS = addresses.MockVault;

async function main() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not found");

    // Seller = Deployer
    const sellerWallet = new ethers.Wallet(privateKey, provider);

    // Buyer = New Random Wallet (connected to provider)
    // In local hardhat node, we can use a known private key or just fund a random one.
    // Let's use a random one and fund it with ETH (if needed for gas) and THB.
    // Actually, local hardhat node has pre-funded accounts.
    // Let's use the second account from the mnemonic if possible, or just generate one and send ETH to it from seller.
    const buyerWallet = ethers.Wallet.createRandom().connect(provider);

    console.log("Seller (Deployer):", sellerWallet.address);
    console.log("Buyer (New Wallet):", buyerWallet.address);

    const overrides = { gasPrice: 100000000000n };

    // 1. Fund Buyer with ETH for Gas
    console.log("\n--- Funding Buyer with ETH ---");
    const txEth = await sellerWallet.sendTransaction({
        to: buyerWallet.address,
        value: ethers.parseEther("1.0"), // 1 ETH
        ...overrides
    });
    await txEth.wait();
    console.log("Sent 1 ETH to buyer.");

    // Helper to load contracts
    const loadContract = (name, address, wallet) => {
        const artifactPath = path.join(ARTIFACTS_DIR, name.includes("/") ? name : `${name}.sol/${name}.json`);
        // Handle mocks path difference if needed
        let finalPath = artifactPath;
        if (!fs.existsSync(finalPath)) {
            // Try mocks folder structure
            finalPath = path.join(ARTIFACTS_DIR, "mocks", `${name}.sol`, `${name}.json`);
        }

        const artifact = JSON.parse(fs.readFileSync(finalPath, "utf8"));
        return new ethers.Contract(address, artifact.abi, wallet);
    };

    const thbSeller = loadContract("MockTHB", MOCK_THB_ADDRESS, sellerWallet);
    const thbBuyer = loadContract("MockTHB", MOCK_THB_ADDRESS, buyerWallet);

    const marketplaceBuyer = loadContract("Marketplace", MARKETPLACE_ADDRESS, buyerWallet);
    const marketplaceSeller = loadContract("Marketplace", MARKETPLACE_ADDRESS, sellerWallet);

    const couponBuyer = loadContract("MockCoupon", MOCK_COUPON_ADDRESS, buyerWallet);
    const couponSeller = loadContract("MockCoupon", MOCK_COUPON_ADDRESS, sellerWallet);


    // 2. Fund Buyer with THB
    console.log("\n--- Funding Buyer with THB ---");
    // Mint THB to buyer (Seller is owner of MockTHB)
    const mintAmount = ethers.parseUnits("1000", 18);
    const txMint = await thbSeller.mint(buyerWallet.address, mintAmount, overrides);
    await txMint.wait();
    console.log("Minted 1000 THB to buyer.");

    // 3. Buyer Whitelisting (Marketplace requires whitelisting to buy?)
    // Let's check BaseMarketplace._validatePurchase
    // "if (!whitelist[buyer]) revert NotWhitelisted();"
    // Yes, buyer needs whitelist.
    console.log("\n--- Whitelisting Buyer ---");
    const txWhitelist = await marketplaceSeller.addToWhitelist(buyerWallet.address, overrides);
    await txWhitelist.wait();
    console.log("Buyer whitelisted.");

    // 4. Buy a Coupon
    console.log("\n--- Buying Coupon (Listing ID 1) ---");
    const listingId = 1;
    const buyAmount = 10;

    // Approve Vault to spend Buyer's THB (since payment is THB)
    console.log("Approving Vault for THB...");
    // Need MockVault ABI or simple ERC20 approve? No, ERC20 approve is on Token.
    // ITHB/ERC20 approve(spender, amount)
    const approveAmount = ethers.parseUnits("10000", 18);
    const txApprove = await thbBuyer.approve(MOCK_VAULT_ADDRESS, approveAmount, overrides);
    await txApprove.wait();
    console.log("Approved Vault.");

    // Buy
    // buyCoupon(listingId, amount)
    console.log(`Buying ${buyAmount} coupons from Listing ${listingId}...`);
    try {
        const txBuy = await marketplaceBuyer.buyCoupon(listingId, buyAmount, overrides);
        console.log("Buy Tx:", txBuy.hash);
        await txBuy.wait();
        console.log("Purchase complete.");
    } catch (e) {
        console.error("Buy failed:", e.message);
        // If listing 1 is sold out, try listing 2
    }

    // 5. Redeem Coupon
    console.log("\n--- Redeeming Coupon ---");
    // Fetch listing details to get the correct typeId
    const listing = await marketplaceBuyer.getListing(listingId);
    const typeId = listing.typeId;
    console.log(`Listing ${listingId} is for Type ID: ${typeId}`);

    // Redeem logic: Coupon.redeem(typeId, amount)
    // BaseCoupon.redeem checks logic.
    console.log("Redeeming 5 coupons...");
    try {
        const txRedeem = await couponBuyer.redeem(typeId, 5, overrides);
        console.log("Redeem Tx:", txRedeem.hash);
        await txRedeem.wait();
        console.log("Redemption complete.");
    } catch (e) {
        console.error("Redeem failed:", e.message);
    }

    // 6. Delist Coupon (Seller)
    console.log("\n--- Delisting Coupon (Listing ID 5) ---");
    const delistId = 5;
    try {
        const txDelist = await marketplaceSeller.delistCoupon(delistId, overrides);
        console.log("Delist Tx:", txDelist.hash);
        await txDelist.wait();
        console.log("Delisting complete.");
    } catch (e) {
        console.error("Delist failed:", e.message);
    }

    console.log("\nLifecycle test finished.");
}

main().catch(console.error);
