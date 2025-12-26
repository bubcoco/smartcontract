import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Simplified script to set up a gas fee grant and verify it works
 */

const GAS_FEE_GRANT_PRECOMPILE = "0x0000000000000000000000000000000000001006";
const CONTRACT_FACTORY_ADDRESS = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0";
const GRANTED_ADDRESS = "0xAe76b11CEcE311717934938510327203a373E826";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║             Gas Fee Grant Direct Setup Script                      ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not set");

    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_PRECOMPILE}\n`);

    // ABI for the precompile
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function grant(address grantee, address program) view returns (address granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        "function periodCanSpend(address grantee, address program) view returns (uint256)"
    ];

    const precompile = new ethers.Contract(GAS_FEE_GRANT_PRECOMPILE, abi, wallet);

    const txOptions = {
        gasLimit: 500000n,
        gasPrice: 10000000000000n
    };

    // Check current state
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 1: Check Current State");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const isInitialized = await precompile.initialized();
    console.log(`Initialized: ${isInitialized}`);

    if (!isInitialized) {
        console.log("\n⏳ Initializing precompile...");
        const initTx = await precompile.initializeOwner(wallet.address, txOptions);
        console.log(`Init TX: ${initTx.hash}`);
        await initTx.wait(1);
        console.log("✅ Initialized!");
    }

    const owner = await precompile.owner();
    console.log(`Owner: ${owner}`);

    // Check if grant exists
    const hasGrant = await precompile.isGrantedForProgram(GRANTED_ADDRESS, CONTRACT_FACTORY_ADDRESS);
    console.log(`\nGrant exists for ${GRANTED_ADDRESS} -> ${CONTRACT_FACTORY_ADDRESS}: ${hasGrant}`);

    // Get grant details
    try {
        const grant = await precompile.grant(GRANTED_ADDRESS, CONTRACT_FACTORY_ADDRESS);
        console.log("\n📊 Current Grant:");
        console.log(`   Granter: ${grant.granter}`);
        console.log(`   Allowance: ${grant.allowance}`);
        console.log(`   Spend Limit: ${ethers.formatEther(grant.spendLimit)} ETH`);
        console.log(`   Period Limit: ${ethers.formatEther(grant.periodLimit)} ETH`);
        console.log(`   Period Can Spend: ${ethers.formatEther(grant.periodCanSpend)} ETH`);
    } catch (e: any) {
        console.log(`   Error getting grant: ${e.message}`);
    }

    // Set up the grant if it doesn't exist
    if (!hasGrant) {
        console.log("\n═══════════════════════════════════════════════════════════════════");
        console.log("Step 2: Set Up Gas Fee Grant");
        console.log("═══════════════════════════════════════════════════════════════════\n");

        // Parameters for setFeeGrant:
        // granter: who is paying for gas (the owner/validator)
        // grantee: who receives the gas subsidy
        // program: which contract the subsidy applies to
        // spendLimit: max gas amount per transaction
        // period: reset period in blocks
        // periodLimit: max gas per period
        // endTime: when the grant expires (0 = never)

        const granter = wallet.address;
        const grantee = GRANTED_ADDRESS;
        const program = CONTRACT_FACTORY_ADDRESS;
        const spendLimit = ethers.parseEther("50"); // 50 ETH per tx
        const period = 1000; // 1000 blocks
        const periodLimit = ethers.parseEther("100"); // 100 ETH per period (must be >= spendLimit)
        const endTime = 0n; // No expiration

        console.log(`📝 Setting grant:`);
        console.log(`   Granter: ${granter}`);
        console.log(`   Grantee: ${grantee}`);
        console.log(`   Program: ${program}`);
        console.log(`   Spend Limit: ${ethers.formatEther(spendLimit)} ETH`);
        console.log(`   Period: ${period} blocks`);
        console.log(`   Period Limit: ${ethers.formatEther(periodLimit)} ETH`);
        console.log(`   End Time: ${endTime} (never)\n`);

        const setTx = await precompile.setFeeGrant(
            granter,
            grantee,
            program,
            spendLimit,
            period,
            periodLimit,
            endTime,
            txOptions
        );
        console.log(`📤 Set Grant TX: ${setTx.hash}`);
        const receipt = await setTx.wait(1);
        console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`);

        // Verify
        const verifyGrant = await precompile.isGrantedForProgram(grantee, program);
        console.log(`\n✅ Grant created: ${verifyGrant}`);
    }

    // Test creating an ERC721
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 3: Test Transaction with Gas Fee Grant");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const factoryAbi = [
        "function createERC721(string name, string symbol, string baseTokenURI, address to, uint256 initialMintAmount) returns (address)",
        "event ERC721Created(address indexed tokenAddress, string name, string symbol, string baseTokenURI, address indexed owner, uint256 initialMintAmount)"
    ];
    const factory = new ethers.Contract(CONTRACT_FACTORY_ADDRESS, factoryAbi, wallet);

    const timestamp = Date.now();
    const initialBalance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance before: ${ethers.formatEther(initialBalance)} ETH`);

    const createTx = await factory.createERC721(
        `GasTest_${timestamp}`,
        `GT${timestamp % 10000}`,
        `https://example.com/meta/${timestamp}/`,
        wallet.address,
        1n,
        { ...txOptions, gasLimit: 5000000n }
    );
    console.log(`\n📤 Create ERC721 TX: ${createTx.hash}`);

    const createReceipt = await createTx.wait(1);
    console.log(`✅ Confirmed in block ${createReceipt?.blockNumber}`);
    console.log(`⛽ Gas used: ${createReceipt?.gasUsed.toString()}`);

    const finalBalance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Balance after: ${ethers.formatEther(finalBalance)} ETH`);
    console.log(`📈 Balance change: ${ethers.formatEther(finalBalance - initialBalance)} ETH`);

    // Check Blockscout
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 4: Verify in Blockscout");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    console.log(`🌐 http://localhost/tx/${createTx.hash}`);
    console.log(`🔍 API: http://localhost:4000/api/v2/transactions/${createTx.hash}`);

    console.log("\n✨ Done!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
