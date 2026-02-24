import { ethers, Contract } from "ethers";
import * as dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env") });

// GasPrice precompile is ...1003 (FeeGrant is ...1006)
const GAS_PRICE_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000001003";
const GAS_PRICE_ABI = [
    "function setGasPrice(uint256 value) external",
    "function gasPrice() external view returns (uint256)",
    "function initialized() external view returns (uint256)",
    "function initializeOwner(address owner) external",
    "function owner() external view returns (address)"
];

async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let gasPriceGwei: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--gasprice") {
            gasPriceGwei = args[i + 1];
            i++;
        }
    }

    if (!gasPriceGwei) {
        console.error("Usage: npx tsx scripts/set-gasprice.ts --gasprice <value_in_gwei>");
        console.error("Example: npx tsx scripts/set-gasprice.ts --gasprice 1000");
        process.exit(1);
    }

    console.log(`🔌 Connecting to provider...`);
    const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("ADMIN is missing in .env");
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`🔑 Using Admin Account: ${wallet.address}`);

    const gasPriceContract = new Contract(GAS_PRICE_PRECOMPILE_ADDRESS, GAS_PRICE_ABI, wallet);

    try {
        // Check initialization
        const isInit = await gasPriceContract.initialized();
        console.log(`Checking initialization status: ${isInit}`);

        if (isInit !== 0n) {
            try {
                const owner = await gasPriceContract.owner();
                console.log(`👑 Current Owner: ${owner}`);
                if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
                    console.error(`❌ ERROR: You are NOT the owner. You are ${wallet.address}, owner is ${owner}`);
                    return;
                }
            } catch (e) {
                console.log("⚠️ Could not fetch owner() (method might not exist or revert):", e.message);
            }
        }

        if (isInit === 0n) {
            console.log("⚠️ Contract not initialized. Initializing owner...");
            const txInit = await gasPriceContract.initializeOwner(wallet.address, {
                gasLimit: 100000,
                gasPrice: ethers.parseUnits("1000", "gwei"), // Initial bootstrap gas price
                type: 0
            });
            await txInit.wait();
            console.log("✅ Owner initialized.");
        }

        const currentPrice = await gasPriceContract.gasPrice();
        console.log(`📉 Current System Gas Price: ${ethers.formatUnits(currentPrice, "gwei")} gwei`);

        const newPriceWei = ethers.parseUnits(gasPriceGwei, "gwei");
        console.log(`🔄 Setting new gas price to: ${gasPriceGwei} gwei (${newPriceWei.toString()} wei)...`);

        // Use a safe fallback for the setting tx itself (current price + buffer or just high)
        // We use type 0 to ensure it gets accepted regardless of EIP-1559 state
        const tx = await gasPriceContract.setGasPrice(newPriceWei, {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits("1000", "gwei"), // Use a safe high value for the setting tx
            type: 0
        });

        console.log(`⏳ Waiting for confirmation (Tx Hash: ${tx.hash})...`);
        await tx.wait();

        const updatedPrice = await gasPriceContract.gasPrice();
        console.log(`✅ Success! System Gas Price is now: ${ethers.formatUnits(updatedPrice, "gwei")} gwei`);

    } catch (error: any) {
        console.error("❌ Error setting gas price:", error.message || error);

        if (error.code === "CALL_EXCEPTION") {
            console.error("💡 Hint: Are you the owner? Only the owner can set gas price.");
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
