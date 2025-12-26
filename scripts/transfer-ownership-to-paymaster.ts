import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Transfer GasFeeGrant precompile ownership to Paymaster
 */

const GAS_FEE_GRANT_PRECOMPILE = "0x0000000000000000000000000000000000001006";
const PAYMASTER_ADDRESS = "0x4C748A0D79673089059968007a21B76F4cDB733D";

const PRECOMPILE_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function transferOwnership(address newOwner) returns (bool)"
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║    Transfer GasFeeGrant Ownership to Paymaster                    ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not set");

    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`👤 Current Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_PRECOMPILE}`);
    console.log(`📄 Paymaster: ${PAYMASTER_ADDRESS}\n`);

    const precompile = new ethers.Contract(GAS_FEE_GRANT_PRECOMPILE, PRECOMPILE_ABI, wallet);

    const txOptions = {
        gasLimit: 500000n,
        gasPrice: 10000000000000n
    };

    // Check current state
    const currentOwner = await precompile.owner();
    console.log(`👑 Current Owner: ${currentOwner}`);

    if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log("\n❌ You are not the current owner of the precompile.");
        console.log("   Only the current owner can transfer ownership.");
        process.exit(1);
    }

    // Transfer ownership
    console.log(`\n⏳ Transferring ownership to Paymaster...`);
    const tx = await precompile.transferOwnership(PAYMASTER_ADDRESS, txOptions);
    console.log(`📤 TX Hash: ${tx.hash}`);

    await tx.wait(1);
    console.log("✅ Transaction confirmed!");

    // Verify
    const newOwner = await precompile.owner();
    console.log(`\n👑 New Owner: ${newOwner}`);

    if (newOwner.toLowerCase() === PAYMASTER_ADDRESS.toLowerCase()) {
        console.log("✅ Ownership successfully transferred to Paymaster!");
        console.log("\nThe Paymaster can now manage gas fee grants directly.");
    } else {
        console.log("❌ Ownership transfer may have failed.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
