import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test TreasuryRegistry Precompile
 * Precompile Address: 0x0000000000000000000000000000000000001005
 */

const TREASURY_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000001005";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Test TreasuryRegistry Precompile                     ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${TREASURY_REGISTRY_ADDRESS}\n`);

    // 2. Define ABI
    // Based on TreasuryRegistryPrecompiledContract.java
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function transferOwnership(address newOwner) returns (bool)",
        "function treasuryAt() view returns (address)",
        "function setTreasury(address treasury) returns (bool)"
    ];

    const precompile = new ethers.Contract(TREASURY_REGISTRY_ADDRESS, abi, wallet);

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

    // 4. Set Treasury Address
    console.log("\n🏦 Testing Set Treasury...");
    const newTreasury = ethers.Wallet.createRandom().address;
    console.log(`   New Treasury Address: ${newTreasury}`);

    try {
        const tx = await precompile.setTreasury(newTreasury);
        console.log(`   ⏳ Sending setTreasury tx: ${tx.hash}`);
        await tx.wait(1);
        console.log("   ✅ Treasury address set.");
    } catch (e: any) {
        console.log(`   ❌ Error setting treasury: ${e.message}`);
    }

    // 5. Verify Treasury Address
    console.log("\n🧐 Verifying Treasury...");
    try {
        const currentTreasury = await precompile.treasuryAt();
        console.log(`   treasuryAt(): ${currentTreasury}`);

        if (currentTreasury.toLowerCase() === newTreasury.toLowerCase()) {
            console.log("   ✅ Verified: Treasury address updated correctly.");
        } else {
            console.log("   ❌ Verification failed: Addresses do not match.");
        }

    } catch (e: any) {
        console.log(`   ❌ Error verifying treasury: ${e.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
