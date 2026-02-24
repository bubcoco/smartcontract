import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Script to set gas fee grants for multiple addresses
 * 
 * Configuration:
 * - Grantees: 0xAe76b11CEcE311717934938510327203a373E826, 0x54e7Ef5795d350Ae257Af47FEdF211bC8b0C5621
 * - Spend Limit: 1000 ETH
 * - Period: 1 hour (~1200 blocks at 3s/block)
 * - Network: loaffinity
 */

const GAS_FEE_GRANT_PRECOMPILE = "0x0000000000000000000000000000000000001006";

// Grantees to set up
const GRANTEES = [
    "0xAe76b11CEcE311717934938510327203a373E826",
    "0x54e7Ef5795d350Ae257Af47FEdF211bC8b0C5621"
];

// Grant parameters
const SPEND_LIMIT = ethers.parseEther("1000");      // 1000 ETH per transaction
const PERIOD_BLOCKS = 1200;                          // ~1 hour at 3 seconds per block
const PERIOD_LIMIT = ethers.parseEther("1000");     // 1000 ETH per period
const END_TIME = 0n;                                 // No expiration
const PROGRAM = ethers.ZeroAddress;                  // All programs (address(0))

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║             Set Gas Fee Grant Batch Script                         ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // Get ADMIN private key from .env
    const adminKey = process.env.ADMIN;
    if (!adminKey) {
        throw new Error("ADMIN private key not set in .env");
    }

    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Admin Wallet: ${wallet.address}`);
    console.log(`📄 GasFeeGrant Precompile: ${GAS_FEE_GRANT_PRECOMPILE}`);
    console.log(`🌐 Network: loaffinity (chainId: 235)\n`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

    if (balance === 0n) {
        throw new Error("Admin wallet has zero balance!");
    }

    // ABI for the precompile
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function grant(address grantee, address program) view returns (address granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        "function isGrantedForAllProgram(address grantee) view returns (bool)",
        "function periodCanSpend(address grantee, address program) view returns (uint256)"
    ];

    const precompile = new ethers.Contract(GAS_FEE_GRANT_PRECOMPILE, abi, wallet);

    const txOptions = {
        gasLimit: 500000n,
        gasPrice: 100000000000n  // 100 gwei
    };

    // Step 1: Check initialization
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 1: Check Precompile Initialization");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const isInitialized = await precompile.initialized();
    console.log(`Initialized: ${isInitialized}`);

    if (!isInitialized) {
        console.log("\n⏳ Initializing precompile with admin as owner...");
        const initTx = await precompile.initializeOwner(wallet.address, txOptions);
        console.log(`Init TX: ${initTx.hash}`);
        await initTx.wait(1);
        console.log("✅ Initialized!");
    }

    const owner = await precompile.owner();
    console.log(`Owner: ${owner}`);

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`\n⚠️  Warning: Wallet is not the owner of the precompile!`);
        console.log(`   Current owner: ${owner}`);
        console.log(`   Your wallet: ${wallet.address}`);
    }

    // Step 2: Set up grants for each grantee
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 2: Set Gas Fee Grants");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log("📋 Grant Configuration:");
    console.log(`   Granter: ${wallet.address}`);
    console.log(`   Program: ${PROGRAM} (all programs)`);
    console.log(`   Spend Limit: ${ethers.formatEther(SPEND_LIMIT)} ETH per tx`);
    console.log(`   Period: ${PERIOD_BLOCKS} blocks (~1 hour)`);
    console.log(`   Period Limit: ${ethers.formatEther(PERIOD_LIMIT)} ETH`);
    console.log(`   End Time: ${END_TIME === 0n ? "Never expires" : String(END_TIME)}\n`);

    for (const grantee of GRANTEES) {
        console.log(`\n📝 Processing grantee: ${grantee}`);

        // Check if grant already exists using isGrantedForProgram with address(0)
        let hasGrant = false;
        try {
            hasGrant = await precompile.isGrantedForProgram(grantee, PROGRAM);
        } catch (e: any) {
            console.log(`   ⚠️  Could not check existing grant: ${e.shortMessage || e.message}`);
        }

        if (hasGrant) {
            console.log(`   ⚠️  Grant already exists for ${grantee}`);

            // Show existing grant details
            try {
                const grant = await precompile.grant(grantee, PROGRAM);
                console.log(`   📊 Existing Grant:`);
                console.log(`      Granter: ${grant.granter}`);
                console.log(`      Spend Limit: ${ethers.formatEther(grant.spendLimit)} ETH`);
                console.log(`      Period Limit: ${ethers.formatEther(grant.periodLimit)} ETH`);
                console.log(`      Period Can Spend: ${ethers.formatEther(grant.periodCanSpend)} ETH`);
            } catch (e: any) {
                console.log(`      Error reading grant: ${e.shortMessage || e.message}`);
            }
            continue;
        }

        // Set the grant
        console.log(`   ⏳ Setting grant...`);

        try {
            const setTx = await precompile.setFeeGrant(
                wallet.address,     // granter
                grantee,            // grantee
                PROGRAM,            // program (all)
                SPEND_LIMIT,        // spendLimit
                PERIOD_BLOCKS,      // period
                PERIOD_LIMIT,       // periodLimit
                END_TIME,           // endTime
                txOptions
            );
            console.log(`   📤 TX: ${setTx.hash}`);

            const receipt = await setTx.wait(1);
            console.log(`   ✅ Confirmed in block ${receipt?.blockNumber}`);
            console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);

            // Verify the grant was created
            try {
                const verifyGrant = await precompile.isGrantedForProgram(grantee, PROGRAM);
                if (verifyGrant) {
                    console.log(`   ✅ Grant successfully created!`);
                } else {
                    console.log(`   ⚠️  Grant may not be active (isGrantedForProgram returned false)`);
                }
            } catch (e: any) {
                console.log(`   ⚠️  Could not verify grant: ${e.shortMessage || e.message}`);
            }
        } catch (e: any) {
            console.log(`   ❌ Error setting grant: ${e.shortMessage || e.message}`);
            if (e.info?.error?.message) {
                console.log(`      Details: ${e.info.error.message}`);
            }
        }
    }

    // Step 3: Summary
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 3: Summary");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    for (const grantee of GRANTEES) {
        let hasGrant = false;
        try {
            hasGrant = await precompile.isGrantedForProgram(grantee, PROGRAM);
        } catch (e) {
            // Ignore
        }
        const status = hasGrant ? "✅" : "❌";
        console.log(`${status} ${grantee}: ${hasGrant ? "Granted" : "Not Granted"}`);

        if (hasGrant) {
            try {
                const periodSpend = await precompile.periodCanSpend(grantee, PROGRAM);
                console.log(`   Period Can Spend: ${ethers.formatEther(periodSpend)} ETH`);
            } catch (e) {
                // Ignore errors
            }
        }
    }

    const finalBalance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Final Balance: ${ethers.formatEther(finalBalance)} ETH`);
    console.log(`📈 Balance Change: ${ethers.formatEther(finalBalance - balance)} ETH`);

    console.log("\n✨ Done!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Fatal error:", error);
        process.exit(1);
    });
