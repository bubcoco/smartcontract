import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test AddressRegistry Precompile
 * Precompile Address: 0x0000000000000000000000000000000000001002
 */

const ADDRESS_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000001002";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Test AddressRegistry Precompile                      ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${ADDRESS_REGISTRY_ADDRESS}\n`);

    // 2. Define ABI
    // Based on AddressRegistryPrecompiledContract.java
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function transferOwnership(address newOwner) returns (bool)",
        "function contains(address addr) view returns (bool)",
        "function discovery(address addr) view returns (bytes32)", // returns storage value at slot
        "function addToRegistry(address toAdd, address initiator) returns (bool)",
        "function removeFromRegistry(address toRemove) returns (bool)"
    ];

    const precompile = new ethers.Contract(ADDRESS_REGISTRY_ADDRESS, abi, wallet);

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

    // 4. Add to Registry
    console.log("\n📝 Testing Add to Registry...");
    const testAddress = ethers.Wallet.createRandom().address;
    const initiator = wallet.address;

    console.log(`   Adding Address: ${testAddress}`);
    console.log(`   Initiator: ${initiator}`);

    try {
        // addToRegistry(address toAdd, address initiator)
        // Note: The Java code takes initiator but doesn't seem to store it specifically in a mapping?
        // It stores: contract.setStorageValue(slot, UInt256.fromBytes(calldata.slice(32))); 
        // Slice 32 starts after function selector? No, calldata here is without selector.
        // Slice 32 is likely the second argument (initiator) + padding?
        // Java: takes 32 bytes from offset 32. 
        // Input: [12 bytes padding][20 bytes address1][12 bytes padding][20 bytes address2]
        // Slice 32 is the start of the second 32-byte word (initiator)
        // So it stores the initiator address as the value in the registry?

        const tx = await precompile.addToRegistry(testAddress, initiator);
        console.log(`   ⏳ Sending addToRegistry tx: ${tx.hash}`);
        await tx.wait(1);
        console.log("   ✅ Address added.");
    } catch (e: any) {
        console.log(`   ❌ Error adding to registry: ${e.message}`);
    }

    // 5. Verify Containment
    console.log("\n🧐 Verifying Registry...");
    try {
        const isContains = await precompile.contains(testAddress);
        console.log(`   contains(${testAddress}): ${isContains}`);

        const discoveryVal = await precompile.discovery(testAddress);
        console.log(`   discovery(${testAddress}): ${discoveryVal}`);
        // Should contain the initiator address (padded)

    } catch (e: any) {
        console.log(`   ❌ Error verifying registry: ${e.message}`);
    }

    // 6. Remove from Registry
    console.log("\n🚫 Testing Remove from Registry...");
    try {
        const tx = await precompile.removeFromRegistry(testAddress);
        console.log(`   ⏳ Sending removeFromRegistry tx: ${tx.hash}`);
        await tx.wait(1);
        console.log("   ✅ Address removed.");

        const isContains = await precompile.contains(testAddress);
        console.log(`   contains(${testAddress}) after remove: ${isContains}`);
    } catch (e: any) {
        console.log(`   ❌ Error removing from registry: ${e.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
