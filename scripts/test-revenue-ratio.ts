import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test RevenueRatio Precompile
 * Precompile Address: 0x0000000000000000000000000000000000001004
 */

const REVENUE_RATIO_ADDRESS = "0x0000000000000000000000000000000000001004";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Test RevenueRatio Precompile                         ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${REVENUE_RATIO_ADDRESS}\n`);

    // 2. Define ABI
    // Based on RevenueRatioPrecompiledContract.java
    // "setRevenueRatio(uint8,uint8,uint8,uint8)"
    // The implementation takes 4 slices of 32 bytes each from calldata.
    // So in JS/Ethers, passing uint256 is safest to ensure 32-byte alignment.
    // If we pass uint8, ethers might pack it differently depending on context, but here it's function arguments.
    // Let's try uint256 as the implementation uses UInt256.fromBytes(slice(32)).

    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function transferOwnership(address newOwner) returns (bool)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function status() view returns (bool)",
        "function contractRatio() view returns (uint256)",
        "function coinbaseRatio() view returns (uint256)",
        "function providerRatio() view returns (uint256)",
        "function treasuryRatio() view returns (uint256)",
        // Based on Java signature: setRevenueRatio(uint8,uint8,uint8,uint8)
        // Ethers will handle packing to 32-byte slots if the precompile expects it, 
        // OR it will pack tight if it were solidity. 
        // Precompiles usually take raw calldata. 
        // The Java code does: calldata.slice(0, 32), slice(32, 32), etc.
        // This implies it EXPECTS 32-byte words for each argument, despite the signature saying uint8.
        // If we use "uint8", ethers might encode it as 32-bytes anyway for non-packed calls?
        // Let's stick to uint256 in ABI to force 32-byte alignment which Java expects.
        // Wait, the failure might be due to something else? 
        // "missing revert data" -> often means revert without reason OR precompile returning failure (false).

        // Let's trying creating a workaround by manually encoding calldata to ensure 32-byte alignment logic.
        // But first, let's try assuming the signature string in ABI key matters for selector calculation.
        // Java: Hash.keccak256(Bytes.of("setRevenueRatio(uint8,uint8,uint8,uint8)".getBytes(UTF_8)))
        // So the SELECTOR expects uint8. 
        // But the BODY reads 32-byte slices.
        // So we need ABI to say "uint8" for selector, but we need to send 32-byte padded data?
        // Ethers defaults to ABI encoding which pads uint8 to 32 bytes in standard function calls.
        // So "function setRevenueRatio(uint8, uint8, uint8, uint8)" should work AND produce correct selector.
        "function setRevenueRatio(uint8 contractRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)"
    ];

    const precompile = new ethers.Contract(REVENUE_RATIO_ADDRESS, abi, wallet);

    // 3. Check Initialization & Owner
    console.log("🔍 Checking Status...");
    try {
        const isInitialized = await precompile.initialized();
        console.log(`   Initialized: ${isInitialized}`);

        let currentOwner = "";

        if (!isInitialized) {
            console.log("   ⚠️  Not initialized. Attempting to initialize...");
            const tx = await precompile.initializeOwner(wallet.address);
            await tx.wait(1);
            console.log("   ✅ Initialized!");
        }

        try {
            currentOwner = await precompile.owner();
            console.log(`   Owner: ${currentOwner}`);
        } catch (e) {
            console.log(`   ⚠️ Could not get owner yet.`);
        }

        if (currentOwner && currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.log("   ❌ You are not the owner. Cannot proceed with write tests.");
            return;
        }

    } catch (e: any) {
        console.log(`   ❌ Error checking status: ${e.message}`);
        return;
    }

    // 4. Set Revenue Ratios
    console.log("\n📊 Testing Set Revenue Ratio...");

    // Ratios must sum to 100
    // Java: if (!totalRatio.equals(UInt256.valueOf(100L))) return FALSE;
    const r1 = 10;
    const r2 = 20;
    const r3 = 30;
    const r4 = 40; // Sum = 100

    console.log(`   Contract Ratio: ${r1}`);
    console.log(`   Coinbase Ratio: ${r2}`);
    console.log(`   Provider Ratio: ${r3}`);
    console.log(`   Treasury Ratio: ${r4}`);

    try {
        const tx = await precompile.setRevenueRatio(r1, r2, r3, r4);
        console.log(`   ⏳ Sending setRevenueRatio tx: ${tx.hash}`);
        await tx.wait(1);
        console.log("   ✅ Ratios set.");
    } catch (e: any) {
        console.log(`   ❌ Error setting revenue ratio: ${e.message}`);
    }

    // 5. Verify Ratios
    console.log("\n🧐 Verifying Ratios...");
    try {
        const c1 = await precompile.contractRatio();
        const c2 = await precompile.coinbaseRatio();
        const c3 = await precompile.providerRatio();
        const c4 = await precompile.treasuryRatio();

        console.log(`   contractRatio(): ${c1}`);
        console.log(`   coinbaseRatio(): ${c2}`);
        console.log(`   providerRatio(): ${c3}`);
        console.log(`   treasuryRatio(): ${c4}`);

        if (c1 == BigInt(r1) && c2 == BigInt(r2) && c3 == BigInt(r3) && c4 == BigInt(r4)) {
            console.log("   ✅ Verified: Ratios updated correctly.");
        } else {
            console.log("   ❌ Verification failed: Ratios do not match.");
        }

    } catch (e: any) {
        console.log(`   ❌ Error verifying ratios: ${e.message}`);
    }

    // 6. Test Enable/Disable/Status
    console.log("\n🔄 Testing Status (Enable/Disable)...");
    try {
        const statusBefore = await precompile.status();
        console.log(`   Initial Status: ${statusBefore}`);

        if (statusBefore) {
            console.log("   🔻 Disabling...");
            const tx = await precompile.disable();
            await tx.wait(1);
        } else {
            console.log("   🔺 Enabling...");
            const tx = await precompile.enable();
            await tx.wait(1);
        }

        const statusAfter = await precompile.status();
        console.log(`   New Status: ${statusAfter}`);

    } catch (e: any) {
        console.log(`   ❌ Error toggling status: ${e.message}`);
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
