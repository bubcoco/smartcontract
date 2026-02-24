import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Transfer Ownership of NativeMinter Precompile
 * 
 * Usage:
 *   npx tsx scripts/transfer-native-minter-ownership.ts --address 0x1234...
 */

const NATIVE_MINTER_PRECOMPILE = "0x0000000000000000000000000000000000001001";

function parseArgs(): { address?: string } {
    const args = process.argv.slice(2);
    const result: { address?: string } = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--address" && args[i + 1]) {
            result.address = args[i + 1];
            i++;
        }
    }
    return result;
}

async function main() {
    const args = parseArgs();

    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║          Transfer NativeMinter Ownership                           ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    if (!args.address) {
        console.log("❌ Missing required argument: --address\n");
        console.log("📋 Usage:");
        console.log("   npx tsx scripts/transfer-native-minter-ownership.ts --address <new_owner>");
        console.log("\n📖 Example:");
        console.log("   npx tsx scripts/transfer-native-minter-ownership.ts --address 0x1234567890abcdef1234567890abcdef12345678");
        return;
    }

    // Validate address
    if (!ethers.isAddress(args.address)) {
        console.log(`❌ Invalid address: ${args.address}`);
        return;
    }

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Current Wallet: ${wallet.address}`);
    console.log(`📄 NativeMinter: ${NATIVE_MINTER_PRECOMPILE}`);
    console.log(`🎯 New Owner: ${args.address}\n`);

    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function transferOwnership(address newOwner) returns (bool)",
    ];

    const precompile = new ethers.Contract(NATIVE_MINTER_PRECOMPILE, abi, wallet);

    // Check current status
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Current Status");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const isInitialized = await precompile.initialized();
    const currentOwner = await precompile.owner();

    console.log(`   Initialized: ${isInitialized}`);
    console.log(`   Current Owner: ${currentOwner}`);

    if (!isInitialized) {
        console.log("\n❌ NativeMinter is not initialized!");
        return;
    }

    if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`\n❌ You are not the owner!`);
        console.log(`   Your wallet: ${wallet.address}`);
        console.log(`   Current owner: ${currentOwner}`);
        return;
    }

    if (currentOwner.toLowerCase() === args.address.toLowerCase()) {
        console.log(`\n⚠️  ${args.address} is already the owner!`);
        return;
    }

    // Transfer ownership
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Transferring Ownership");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log(`   From: ${wallet.address}`);
    console.log(`   To:   ${args.address}`);

    const txOptions = { gasLimit: 100000n, gasPrice: ethers.parseUnits("100", "gwei") };

    console.log(`\n   ⏳ Sending transaction...`);
    const tx = await precompile.transferOwnership(args.address, txOptions);
    console.log(`   📤 TX: ${tx.hash}`);

    const receipt = await tx.wait(1);
    console.log(`   ✅ Confirmed in block ${receipt?.blockNumber}`);
    console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);

    // Verify
    const newOwner = await precompile.owner();
    console.log(`\n   📊 New Owner: ${newOwner}`);

    if (newOwner.toLowerCase() === args.address.toLowerCase()) {
        console.log("\n✨ Ownership transferred successfully!");
    } else {
        console.log("\n⚠️  Transfer may have failed - owner didn't change");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
