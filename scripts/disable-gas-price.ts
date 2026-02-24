import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Script to disable GasPrice precompile
 * Functions: enable, disable, setGasPrice, getSCR, getOperationFees, owner, admin, transferAdmin
 */

const GAS_PRICE_PRECOMPILE = "0x0000000000000000000000000000000000001003";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Disable GasPrice Precompile                          ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Admin Wallet: ${wallet.address}`);
    console.log(`📄 GasPrice Precompile: ${GAS_PRICE_PRECOMPILE}\n`);

    const abi = [
        "function owner() view returns (address)",
        "function admin() view returns (address)",
        "function initialized() view returns (bool)",
        "function status() view returns (bool)",
        "function getSCR() view returns (uint256)",
        "function getOperationFees() view returns (uint256)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setGasPrice(uint256 price) returns (bool)",
        "function transferAdmin(address newAdmin) returns (bool)",
    ];

    const precompile = new ethers.Contract(GAS_PRICE_PRECOMPILE, abi, wallet);
    const txOptions = { gasLimit: 500000n, gasPrice: 100000000000n };

    // Check current status
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Current Status");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const owner = await precompile.owner();
    const statusBefore = await precompile.status();

    let scr = 0n;
    let opFees = 0n;
    try { scr = await precompile.getSCR(); } catch (e) { }
    try { opFees = await precompile.getOperationFees(); } catch (e) { }

    console.log(`Owner: ${owner}`);
    console.log(`Status: ${statusBefore ? "ENABLED ✅" : "DISABLED ❌"}`);
    console.log(`SCR (Gas Price): ${ethers.formatUnits(scr, "gwei")} gwei`);
    console.log(`Operation Fees: ${ethers.formatUnits(opFees, "gwei")} gwei`);

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error(`Cannot disable: wallet ${wallet.address} is not the owner (${owner})`);
    }

    if (!statusBefore) {
        console.log("\n⚠️  GasPrice is already disabled!");
        return;
    }

    // Disable
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Disabling GasPrice...");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const tx = await precompile.disable(txOptions);
    console.log(`📤 TX: ${tx.hash}`);

    const receipt = await tx.wait(1);
    console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt?.gasUsed.toString()}`);

    // Verify
    const statusAfter = await precompile.status();
    console.log(`\n📊 New Status: ${statusAfter ? "ENABLED ✅" : "DISABLED ❌"}`);

    if (!statusAfter) {
        console.log("\n✨ GasPrice precompile successfully disabled!");
    } else {
        console.log("\n⚠️  Disable may have failed - status is still enabled");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
