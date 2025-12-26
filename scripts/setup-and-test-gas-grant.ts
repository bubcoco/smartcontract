import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Script to set up and test Gas Fee Grants for the loaffinity network
 * 
 * This script:
 * 1. Checks if GasFeeGrant precompile is initialized
 * 2. Sets up a gas fee grant for the granted address
 * 3. Calls createERC721 to test the grant
 * 4. Verifies the grant appears in Blockscout
 */

const GAS_FEE_GRANT_PRECOMPILE = "0x0000000000000000000000000000000000001006";
const CONTRACT_FACTORY_ADDRESS = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0";
const GRANTED_ADDRESS = "0xAe76b11CEcE311717934938510327203a373E826";

// ABI for GasFeeGrant precompile
const GAS_FEE_GRANT_ABI = [
    // IOwnable
    "function owner() external view returns (address)",
    "function initialized() external view returns (bool)",
    "function initializeOwner(address owner) external returns (bool)",
    "function transferOwnership(address newOwner) external returns (bool)",

    // IGasFeeGrant
    "function grant(address grantee, address program) external view returns (tuple(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 periodCanSpend, uint256 periodReset, uint256 endTime))",
    "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) external returns (bool)",
    "function revokeFeeGrant(address grantee, address program) external returns (bool)",
    "function periodCanSpend(address grantee, address program) external view returns (uint256)",
    "function periodReset(address grantee, address program) external view returns (uint256)",
    "function isExpired(address grantee, address program) external view returns (bool)",
    "function isGrantedForProgram(address grantee, address program) external view returns (bool)",
    "function isGrantedForAllProgram(address grantee) external view returns (bool)"
];

// ABI for ContractFactory2
const CONTRACT_FACTORY_ABI = [
    "function createERC721(string memory name, string memory symbol, string memory baseTokenURI, address to, uint256 initialMintAmount) external returns (address)",
    "event ERC721Created(address indexed tokenAddress, string name, string symbol, string baseTokenURI, address indexed owner, uint256 initialMintAmount)"
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║   Gas Fee Grant Setup and Test Script for Loaffinity Network      ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // Get private key from environment
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("PRIV_KEY environment variable not set.");
    }

    // Setup provider and wallet
    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🔗 Connected to: ${rpcUrl}`);
    console.log(`👤 Wallet Address: ${wallet.address}`);
    console.log(`📄 GasFeeGrant Precompile: ${GAS_FEE_GRANT_PRECOMPILE}`);
    console.log(`📄 Contract Factory: ${CONTRACT_FACTORY_ADDRESS}\n`);

    // Get balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

    // Create contract instances
    const gasFeeGrant = new ethers.Contract(GAS_FEE_GRANT_PRECOMPILE, GAS_FEE_GRANT_ABI, wallet);
    const contractFactory = new ethers.Contract(CONTRACT_FACTORY_ADDRESS, CONTRACT_FACTORY_ABI, wallet);

    // Transaction options
    const txOptions = {
        gasLimit: 500000n,
        gasPrice: 10000000000000n // 10000 Gwei
    };

    // ═══════════════════════════════════════════════════════════════════
    // Step 1: Check if GasFeeGrant precompile is initialized
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 1: Check GasFeeGrant Precompile Status");
    console.log("═══════════════════════════════════════════════════════════════════");

    try {
        const isInitialized = await gasFeeGrant.initialized();
        console.log(`✅ Initialized: ${isInitialized}`);

        if (isInitialized) {
            const owner = await gasFeeGrant.owner();
            console.log(`👑 Owner: ${owner}`);
        } else {
            console.log("\n⏳ Initializing GasFeeGrant precompile...");
            const initTx = await gasFeeGrant.initializeOwner(wallet.address, txOptions);
            console.log(`📤 Init TX: ${initTx.hash}`);
            await initTx.wait(1, 30000);
            console.log(`✅ Precompile initialized with owner: ${wallet.address}`);
        }
    } catch (error: any) {
        console.log(`❌ Error checking precompile: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Step 2: Check existing grant for the grantee
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 2: Check Existing Grant Status");
    console.log("═══════════════════════════════════════════════════════════════════");

    try {
        // Check for program-specific grant
        const isGrantedForProgram = await gasFeeGrant.isGrantedForProgram(GRANTED_ADDRESS, CONTRACT_FACTORY_ADDRESS);
        console.log(`📋 Grant for ContractFactory: ${isGrantedForProgram}`);

        // Check for universal grant
        const isGrantedForAll = await gasFeeGrant.isGrantedForAllProgram(GRANTED_ADDRESS);
        console.log(`📋 Universal Grant (all programs): ${isGrantedForAll}`);

        if (isGrantedForProgram || isGrantedForAll) {
            const grantDetails = await gasFeeGrant.grant(GRANTED_ADDRESS, CONTRACT_FACTORY_ADDRESS);
            console.log("\n📊 Grant Details:");
            console.log(`   Granter: ${grantDetails.granter}`);
            console.log(`   Grantee: ${grantDetails.grantee}`);
            console.log(`   Program: ${grantDetails.program}`);
            console.log(`   Spend Limit: ${ethers.formatEther(grantDetails.spendLimit)} ETH`);
            console.log(`   Period: ${grantDetails.period} blocks`);
            console.log(`   Period Limit: ${ethers.formatEther(grantDetails.periodLimit)} ETH`);
            console.log(`   Period Can Spend: ${ethers.formatEther(grantDetails.periodCanSpend)} ETH`);
            console.log(`   Period Reset: Block ${grantDetails.periodReset}`);
            console.log(`   End Time: Block ${grantDetails.endTime}`);
        } else {
            console.log("\n⚠️  No grant exists. Setting up a new grant...");

            // Set up a new grant
            const spendLimit = ethers.parseEther("1000"); // 1000 ETH total spend limit
            const period = 1000; // 1000 blocks period
            const periodLimit = ethers.parseEther("100"); // 100 ETH per period
            const endTime = 0n; // No expiration (0 means never expires)

            console.log("\n📝 Setting up gas fee grant:");
            console.log(`   Granter: ${wallet.address}`);
            console.log(`   Grantee: ${GRANTED_ADDRESS}`);
            console.log(`   Program: ${CONTRACT_FACTORY_ADDRESS}`);
            console.log(`   Spend Limit: ${ethers.formatEther(spendLimit)} ETH`);
            console.log(`   Period: ${period} blocks`);
            console.log(`   Period Limit: ${ethers.formatEther(periodLimit)} ETH`);

            const setGrantTx = await gasFeeGrant.setFeeGrant(
                wallet.address,   // granter
                GRANTED_ADDRESS,  // grantee
                CONTRACT_FACTORY_ADDRESS, // program
                spendLimit,       // spendLimit
                period,          // period
                periodLimit,     // periodLimit
                endTime,         // endTime
                txOptions
            );
            console.log(`\n📤 Set Grant TX: ${setGrantTx.hash}`);
            await setGrantTx.wait(1, 30000);
            console.log(`✅ Grant successfully set!`);
        }
    } catch (error: any) {
        console.log(`❌ Error with grants: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Step 3: Create ERC721 to test the grant
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 3: Create ERC721 Token to Test Gas Fee Grant");
    console.log("═══════════════════════════════════════════════════════════════════");

    const timestamp = Date.now();
    const tokenName = `GasGrantTest_${timestamp}`;
    const tokenSymbol = `GGT${timestamp % 10000}`;

    try {
        console.log(`📌 Token Name: ${tokenName}`);
        console.log(`📌 Token Symbol: ${tokenSymbol}\n`);

        const initialBalance = await provider.getBalance(wallet.address);
        console.log(`💰 Balance before: ${ethers.formatEther(initialBalance)} ETH`);

        console.log("⏳ Sending createERC721 transaction...");
        const createTx = await contractFactory.createERC721(
            tokenName,
            tokenSymbol,
            `https://example.com/metadata/${timestamp}/`,
            wallet.address,
            1n,
            { ...txOptions, gasLimit: 5000000n }
        );

        console.log(`📤 Transaction Hash: ${createTx.hash}`);
        console.log("⏳ Waiting for confirmation...\n");

        const receipt = await createTx.wait(1, 60000);

        if (receipt) {
            console.log(`✅ Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
            console.log(`📦 Block Number: ${receipt.blockNumber}`);
            console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);

            const finalBalance = await provider.getBalance(wallet.address);
            console.log(`\n💰 Balance after: ${ethers.formatEther(finalBalance)} ETH`);

            const balanceChange = finalBalance - initialBalance;
            console.log(`📈 Balance Change: ${ethers.formatEther(balanceChange)} ETH`);

            // ═══════════════════════════════════════════════════════════════════
            // Step 4: Verify in Blockscout
            // ═══════════════════════════════════════════════════════════════════
            console.log("\n═══════════════════════════════════════════════════════════════════");
            console.log("Step 4: Verify in Blockscout");
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log(`\n📋 Transaction Hash: ${createTx.hash}\n`);
            console.log(`🌐 Blockscout UI: http://localhost/tx/${createTx.hash}\n`);
            console.log(`🔍 API Endpoint: http://localhost:4000/api/v2/transactions/${createTx.hash}\n`);
            console.log("   Look for 'gas_fee_grant_info' field in the response.\n");
            console.log("   The UI should display:");
            console.log("   • Gas Fee Subsidies: Amount and Granter address");
            console.log("   • Gas Grant Remaining: Remaining allowance amount\n");

            // Check the grant remaining
            try {
                const periodCanSpend = await gasFeeGrant.periodCanSpend(GRANTED_ADDRESS, CONTRACT_FACTORY_ADDRESS);
                console.log(`📊 Period Can Spend (remaining): ${ethers.formatEther(periodCanSpend)} ETH`);
            } catch (e) {
                // Ignore errors
            }
        }
    } catch (error: any) {
        console.log(`\n❌ Transaction failed: ${error.message}`);
    }

    console.log("\n✨ Test completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
