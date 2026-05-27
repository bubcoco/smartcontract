import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Initialize a precompile owner if needed.
 *
 * Usage:
 *   npx tsx scripts/init-precompile.ts --address 0x0000000000000000000000000000000000001003
 *   npx tsx scripts/init-precompile.ts --name gas-price
 *   npx tsx scripts/init-precompile.ts --name fee-grant --rpc http://localhost:8545
 *
 * If the precompile is already initialized, the script only reports status.
 * If not initialized, it calls initializeOwner(env.ADMIN address).
 */

const PRECOMPILE_ADDRESSES: Record<string, string> = {
    "native-minter": "0x0000000000000000000000000000000000001001",
    "address-registry": "0x0000000000000000000000000000000000001002",
    "gas-price": "0x0000000000000000000000000000000000001003",
    "revenue-ratio": "0x0000000000000000000000000000000000001004",
    "treasury-registry": "0x0000000000000000000000000000000000001005",
    "fee-grant": "0x0000000000000000000000000000000000001006",
};

const PRECOMPILE_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
];

function parseArgs() {
    const args: Record<string, string | boolean> = {};

    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i].startsWith("--")) {
            const key = process.argv[i].substring(2);
            const value = process.argv[i + 1];
            if (value && !value.startsWith("--")) {
                args[key] = value;
                i++;
            } else {
                args[key] = true;
            }
        }
    }

    return args;
}

function getPrecompileAddress(args: Record<string, string | boolean>) {
    if (typeof args.address === "string") {
        return args.address;
    }

    if (typeof args.name === "string") {
        return PRECOMPILE_ADDRESSES[args.name] ?? args.name;
    }

    return undefined;
}

function normalizeInitialized(value: unknown): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "bigint") {
        return value !== 0n;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        return value !== "0" && value.toLowerCase() !== "false";
    }

    return Boolean(value);
}

async function main() {
    const args = parseArgs();
    const targetAddress = getPrecompileAddress(args);
    const rpcUrl = typeof args.rpc === "string" ? args.rpc : process.env.RPC_URL || "http://localhost:8545";
    const adminKey = process.env.ADMIN;

    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Initialize Precompile If Needed                     ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    if (!targetAddress) {
        console.error("Usage: npx tsx scripts/init-precompile.ts --address <precompile-address>");
        console.error("   or: npx tsx scripts/init-precompile.ts --name <native-minter|address-registry|gas-price|revenue-ratio|treasury-registry|fee-grant>");
        process.exit(1);
    }

    if (!ethers.isAddress(targetAddress)) {
        throw new Error(`Invalid precompile address: ${targetAddress}`);
    }

    if (!adminKey) {
        throw new Error("ADMIN private key not set in .env");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(adminKey, provider);
    const precompile = new ethers.Contract(targetAddress, PRECOMPILE_ABI, wallet);
    const txOptions = { gasLimit: 500000n, gasPrice: ethers.parseUnits("1000", "gwei") };

    console.log(`🌐 RPC:        ${rpcUrl}`);
    console.log(`📄 Precompile: ${targetAddress}`);
    console.log(`👤 ADMIN:      ${wallet.address}\n`);

    let initializedRaw: unknown;
    let initialized = false;

    try {
        initializedRaw = await precompile.initialized();
        initialized = normalizeInitialized(initializedRaw);
        console.log(`📊 Initialized: ${initialized} (raw: ${String(initializedRaw)})`);
    } catch (error: any) {
        throw new Error(`Failed to read initialized(): ${error.shortMessage || error.message}`);
    }

    let owner = "unknown";
    try {
        owner = await precompile.owner();
        console.log(`👤 Owner:       ${owner}`);
    } catch (error: any) {
        console.log(`⚠️  Could not read owner(): ${error.shortMessage || error.message}`);
    }

    if (initialized) {
        console.log("\n✅ Precompile is already initialized. Nothing to do.");
        return;
    }

    console.log("\n⏳ Precompile not initialized. Initializing with ADMIN address...");

    try {
        const tx = await precompile.initializeOwner(wallet.address, txOptions);
        console.log(`📤 TX: ${tx.hash}`);

        const receipt = await tx.wait(1);
        console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);

        const initializedAfterRaw = await precompile.initialized();
        const initializedAfter = normalizeInitialized(initializedAfterRaw);
        const ownerAfter = await precompile.owner().catch(() => "unknown");

        console.log(`📊 Initialized After: ${initializedAfter} (raw: ${String(initializedAfterRaw)})`);
        console.log(`👤 Owner After:       ${ownerAfter}`);

        if (!initializedAfter) {
            throw new Error("initializeOwner transaction completed, but precompile still reports uninitialized state");
        }

        console.log("\n🎉 Precompile initialized successfully.");
    } catch (error: any) {
        throw new Error(`Failed to initialize precompile: ${error.shortMessage || error.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
