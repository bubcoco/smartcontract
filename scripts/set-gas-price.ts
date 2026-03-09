import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Set GasPrice Precompile
 * 
 * Usage:
 *   npx tsx scripts/set-gas-price.ts --price 50      # Set to 50 gwei and enable
 *   npx tsx scripts/set-gas-price.ts --disable       # Disable gas price control
 *   npx tsx scripts/set-gas-price.ts --enable        # Enable with current price
 *   npx tsx scripts/set-gas-price.ts --status        # Just show status
 *   npx tsx scripts/set-gas-price.ts --block latest  # Get gas price from latest block
 *   npx tsx scripts/set-gas-price.ts --block 12345   # Get gas price from block 12345
 */

const GAS_PRICE_PRECOMPILE = "0x0000000000000000000000000000000000001003";

function parseArgs(): { price?: number; disable?: boolean; enable?: boolean; status?: boolean; block?: string } {
    const args = process.argv.slice(2);
    const result: { price?: number; disable?: boolean; enable?: boolean; status?: boolean; block?: string } = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--price" && args[i + 1]) {
            result.price = parseFloat(args[i + 1]);
            i++;
        } else if (args[i] === "--disable") {
            result.disable = true;
        } else if (args[i] === "--enable") {
            result.enable = true;
        } else if (args[i] === "--status") {
            result.status = true;
        } else if (args[i] === "--block" && args[i + 1]) {
            result.block = args[i + 1];
            i++;
        }
    }
    return result;
}

async function main() {
    const args = parseArgs();

    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Set GasPrice Precompile                              ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Wallet: ${wallet.address}\n`);

    // Handle --block flag first (doesn't need precompile)
    if (args.block) {
        const blockTag = args.block === "latest" ? "latest" : parseInt(args.block);
        console.log(`📦 Getting gas price from block: ${blockTag}\n`);

        try {
            const block = await provider.getBlock(blockTag);
            if (!block) {
                console.log("❌ Block not found!");
                return;
            }

            console.log(`📦 Block Number: ${block.number}`);
            console.log(`📅 Timestamp: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
            console.log(`🔢 Transactions: ${block.transactions.length}`);

            if (block.baseFeePerGas) {
                console.log(`💰 Base Fee: ${ethers.formatUnits(block.baseFeePerGas, "gwei")} gwei`);
            }

            // Get fee data from network
            const feeData = await provider.getFeeData();
            console.log(`\n📊 Network Fee Data:`);
            console.log(`   Gas Price: ${feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, "gwei") : "N/A"} gwei`);
            console.log(`   Max Fee: ${feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, "gwei") : "N/A"} gwei`);
            console.log(`   Max Priority Fee: ${feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei") : "N/A"} gwei`);

            // If block has transactions, show sample gas prices
            if (block.transactions.length > 0) {
                console.log(`\n📤 Sample Transaction Gas Prices:`);
                const sampleCount = Math.min(5, block.transactions.length);
                for (let i = 0; i < sampleCount; i++) {
                    const txHash = block.transactions[i];
                    const tx = await provider.getTransaction(txHash);
                    if (tx?.gasPrice) {
                        console.log(`   TX ${i + 1}: ${ethers.formatUnits(tx.gasPrice, "gwei")} gwei`);
                    }
                }
            }
        } catch (e: any) {
            console.log(`❌ Error: ${e.shortMessage || e.message}`);
        }
        return;
    }

    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function status() view returns (bool)",
        "function gasPrice() view returns (uint256)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setGasPrice(uint256 price) returns (bool)",
    ];

    const precompile = new ethers.Contract(GAS_PRICE_PRECOMPILE, abi, wallet);

    // Get current status and gas price
    const status = await precompile.status();
    const owner = await precompile.owner();
    const currentGasPrice = await precompile.gasPrice();

    console.log(`📊 Current Status: ${status ? "ENABLED ✅" : "DISABLED ❌"}`);
    console.log(`💰 Current Gas Price: ${ethers.formatUnits(currentGasPrice, "gwei")} gwei`);
    console.log(`👤 Owner: ${owner}`);

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log("\n❌ You are not the owner! Cannot proceed.");
        return;
    }

    // Just show status
    if (args.status || (!args.price && !args.disable && !args.enable)) {
        if (!args.status) {
            console.log("\n📋 Usage:");
            console.log("   npx tsx scripts/set-gas-price.ts --price <gwei>   Set price and enable");
            console.log("   npx tsx scripts/set-gas-price.ts --disable        Disable gas price control");
            console.log("   npx tsx scripts/set-gas-price.ts --enable         Enable with current price");
            console.log("   npx tsx scripts/set-gas-price.ts --status         Show status");
            console.log("   npx tsx scripts/set-gas-price.ts --block <num>    Get gas price from block");
        }
        return;
    }

    // IMPORTANT: When precompile is enabled, we MUST use the enforced gas price!
    // Otherwise the transaction will be rejected
    let txGasPrice: bigint;
    if (status && currentGasPrice > 0n) {
        // Use the enforced gas price when enabled
        txGasPrice = currentGasPrice;
        console.log(`\n⚠️  Using enforced gas price: ${ethers.formatUnits(txGasPrice, "gwei")} gwei`);
    } else {
        // Use a high gas price when disabled
        txGasPrice = ethers.parseUnits("1000", "gwei");
    }

    const txOptions = { gasLimit: 100000n, gasPrice: txGasPrice };

    // Disable
    if (args.disable) {
        if (!status) {
            console.log("\n⚠️  Already disabled!");
            return;
        }
        console.log("\n⏳ Disabling GasPrice...");
        const tx = await precompile.disable(txOptions);
        console.log(`📤 TX: ${tx.hash}`);
        await tx.wait(1);
        console.log("✅ GasPrice disabled!");
        return;
    }

    // Enable only
    if (args.enable && !args.price) {
        if (status) {
            console.log("\n⚠️  Already enabled!");
            return;
        }
        console.log("\n⏳ Enabling GasPrice...");
        const tx = await precompile.enable(txOptions);
        console.log(`📤 TX: ${tx.hash}`);
        await tx.wait(1);
        console.log("✅ GasPrice enabled!");
        return;
    }

    // Set price and enable
    if (args.price) {
        const newPrice = ethers.parseUnits(args.price.toString(), "gwei");

        // Enable first if disabled
        if (!status) {
            console.log("\n⏳ Enabling GasPrice...");
            const enableTx = await precompile.enable(txOptions);
            await enableTx.wait(1);
            console.log("✅ Enabled");
        }

        console.log(`\n⏳ Setting gas price to ${args.price} gwei...`);
        const setPriceTx = await precompile.setGasPrice(newPrice, txOptions);
        console.log(`📤 TX: ${setPriceTx.hash}`);
        await setPriceTx.wait(1);

        console.log(`✅ Gas price set to ${args.price} gwei!`);
        console.log(`\n📊 New Status: ENABLED ✅`);
        console.log(`💰 New Gas Price: ${args.price} gwei`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
