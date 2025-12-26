import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import * as fs from "fs";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test Paymaster Grant Functionality
 * 
 * After ownership transfer, this script:
 * 1. Sets up grants via Paymaster
 * 2. Tests a subsidized transaction
 * 3. Verifies in Blockscout
 */

const PAYMASTER_ADDRESS = "0x4C748A0D79673089059968007a21B76F4cDB733D";
const CONTRACT_FACTORY_ADDRESS = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║              Test Paymaster Grant Functionality                   ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not set");

    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    console.log(`📄 Paymaster: ${PAYMASTER_ADDRESS}`);
    console.log(`📄 ContractFactory: ${CONTRACT_FACTORY_ADDRESS}\n`);

    const txOptions = {
        gasLimit: 500000n,
        gasPrice: 10000000000000n
    };

    // Load Paymaster artifact
    const artifactPath = resolve(__dirname, "../artifacts/contracts/Paymaster.sol/Paymaster.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, artifact.abi, wallet);

    // ═══════════════════════════════════════════════════════════════════
    // Step 1: Verify Paymaster is precompile owner
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 1: Verify Paymaster Status");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const isOwner = await paymaster.isPrecompileOwner();
    console.log(`✅ Paymaster is precompile owner: ${isOwner}`);

    if (!isOwner) {
        console.log("\n❌ Paymaster is not the precompile owner. Cannot set grants.");
        process.exit(1);
    }

    const balance = await paymaster.getBalance();
    console.log(`💰 Paymaster balance: ${ethers.formatEther(balance)} ETH`);

    const defaults = {
        spendLimit: await paymaster.defaultSpendLimit(),
        period: await paymaster.defaultPeriod(),
        periodLimit: await paymaster.defaultPeriodLimit(),
        usePeriodic: await paymaster.usePeriodicAllowance()
    };
    console.log(`\n📋 Default Settings:`);
    console.log(`   Spend Limit: ${ethers.formatEther(defaults.spendLimit)} ETH`);
    console.log(`   Period: ${defaults.period} blocks`);
    console.log(`   Period Limit: ${ethers.formatEther(defaults.periodLimit)} ETH`);
    console.log(`   Use Periodic: ${defaults.usePeriodic}`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 2: Set up grant for the wallet
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 2: Set Up Gas Fee Grant");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const grantee = wallet.address;

    // Check if grant already exists
    const existingGrant = await paymaster.isGrantActive(grantee, CONTRACT_FACTORY_ADDRESS);
    console.log(`📋 Existing grant: ${existingGrant}`);

    if (!existingGrant) {
        console.log(`\n📝 Setting grant for: ${grantee}`);
        console.log(`   Program: ${CONTRACT_FACTORY_ADDRESS}`);

        const grantTx = await paymaster.setGrant(grantee, CONTRACT_FACTORY_ADDRESS, txOptions);
        console.log(`📤 TX Hash: ${grantTx.hash}`);
        await grantTx.wait(1);
        console.log("✅ Grant created!");
    }

    // Verify grant
    const isActive = await paymaster.isGrantActive(grantee, CONTRACT_FACTORY_ADDRESS);
    console.log(`\n📋 Grant active: ${isActive}`);

    const remaining = await paymaster.getRemainingAllowance(grantee, CONTRACT_FACTORY_ADDRESS);
    console.log(`📊 Remaining allowance: ${ethers.formatEther(remaining)} ETH`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 3: Test subsidized transaction
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 3: Test Subsidized Transaction");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const factoryAbi = [
        "function createERC721(string name, string symbol, string baseTokenURI, address to, uint256 initialMintAmount) returns (address)",
        "event ERC721Created(address indexed tokenAddress, string name, string symbol, string baseTokenURI, address indexed owner, uint256 initialMintAmount)"
    ];
    const factory = new ethers.Contract(CONTRACT_FACTORY_ADDRESS, factoryAbi, wallet);

    const timestamp = Date.now();
    const initialBalance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance before: ${ethers.formatEther(initialBalance)} ETH`);

    console.log("\n⏳ Creating ERC721 token (should be gas-subsidized)...");
    const createTx = await factory.createERC721(
        `PaymasterTest_${timestamp}`,
        `PMT${timestamp % 10000}`,
        `https://example.com/paymaster/${timestamp}/`,
        wallet.address,
        1n,
        { ...txOptions, gasLimit: 5000000n }
    );
    console.log(`📤 TX Hash: ${createTx.hash}`);

    const receipt = await createTx.wait(1);
    console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt?.gasUsed.toString()}`);

    const finalBalance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Balance after: ${ethers.formatEther(finalBalance)} ETH`);

    const balanceChange = finalBalance - initialBalance;
    console.log(`📈 Balance change: ${ethers.formatEther(balanceChange)} ETH`);

    // Check remaining allowance
    const newRemaining = await paymaster.getRemainingAllowance(grantee, CONTRACT_FACTORY_ADDRESS);
    console.log(`📊 New remaining allowance: ${ethers.formatEther(newRemaining)} ETH`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 4: Verify in Blockscout
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Step 4: Verify in Blockscout");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log(`🌐 Blockscout UI: http://localhost/tx/${createTx.hash}`);
    console.log(`🔍 API: http://localhost:4000/api/v2/transactions/${createTx.hash}`);
    console.log("\n   The transaction should show:");
    console.log("   • Gas Fee Subsidies: The gas fee amount and Paymaster as granter");
    console.log(`   • Paymaster Address: ${PAYMASTER_ADDRESS}`);

    console.log("\n✨ Test completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
