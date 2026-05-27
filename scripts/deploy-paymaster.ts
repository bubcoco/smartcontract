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
 * Deployment and Test Script for Paymaster Contract
 * 
 * This script:
 * 1. Deploys the Paymaster contract
 * 2. Deposits funds for gas subsidies
 * 3. Initializes the GasFeeGrant precompile (if needed)
 * 4. Whitelists programs
 * 5. Sets up grants for users
 * 6. Tests the gas subsidy flow
 */

const GAS_FEE_GRANT_PRECOMPILE = "0x0000000000000000000000000000000000001006";

// Paymaster ABI
const PAYMASTER_ABI = [
    // Constructor params
    "constructor(uint256 _defaultSpendLimit, uint32 _defaultPeriod, uint256 _defaultPeriodLimit, bool _usePeriodicAllowance)",

    // State variables
    "function defaultSpendLimit() view returns (uint256)",
    "function defaultPeriod() view returns (uint32)",
    "function defaultPeriodLimit() view returns (uint256)",
    "function usePeriodicAllowance() view returns (bool)",
    "function operators(address) view returns (bool)",
    "function whitelistedPrograms(address) view returns (bool)",
    "function activeGrants(address, address) view returns (bool)",
    "function totalActiveGrants() view returns (uint256)",

    // Deposit/Withdraw
    "function deposit() payable",
    "function withdraw(uint256 amount)",
    "function withdrawAll()",
    "function getBalance() view returns (uint256)",

    // Precompile management
    "function initializePrecompile()",
    "function isPrecompileOwner() view returns (bool)",
    "function getPrecompileOwner() view returns (address)",
    "function isPrecompileInitialized() view returns (bool)",

    // Operator management
    "function addOperator(address operator)",
    "function removeOperator(address operator)",

    // Program whitelist
    "function whitelistProgram(address program)",
    "function removeFromWhitelist(address program)",
    "function batchWhitelistPrograms(address[] programs)",

    // Grant management
    "function setGrant(address grantee, address program)",
    "function setGrantWithParams(address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime)",
    "function setUniversalGrant(address grantee)",
    "function batchSetGrants(address[] grantees, address program)",
    "function revokeGrant(address grantee, address program)",
    "function batchRevokeGrants(address[] grantees, address program)",

    // Configuration
    "function updateDefaults(uint256 _spendLimit, uint32 _period, uint256 _periodLimit, bool _usePeriodicAllowance)",

    // View functions
    "function isGrantActive(address grantee, address program) view returns (bool)",
    "function getGrantDetails(address grantee, address program) view returns (tuple(address granter, uint8 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint32 period))",
    "function getRemainingAllowance(address grantee, address program) view returns (uint256)",
    "function isGrantExpired(address grantee, address program) view returns (bool)",
    "function getPeriodReset(address grantee, address program) view returns (uint256)",

    // Events
    "event Deposited(address indexed depositor, uint256 amount)",
    "event GrantCreated(address indexed grantee, address indexed program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime)",
    "event GrantRevoked(address indexed grantee, address indexed program)",
    "event PrecompileInitialized(address indexed owner)"
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║           Paymaster Deployment and Test Script                    ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not set");

    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🔗 Connected to: ${rpcUrl}`);
    console.log(`👤 Deployer: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

    const txOptions = {
        gasLimit: 5000000n,
        gasPrice: 10000000000000n
    };

    // ═══════════════════════════════════════════════════════════════════
    // Step 1: Read and compile Paymaster contract
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 1: Compile and Deploy Paymaster Contract");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    // Read compiled artifact (assuming Hardhat compile has been run)
    const artifactPath = resolve(__dirname, "../artifacts/contracts/Paymaster.sol/Paymaster.json");

    if (!fs.existsSync(artifactPath)) {
        console.log("⚠️  Paymaster artifact not found. Please run 'npx hardhat compile' first.");
        console.log(`   Expected path: ${artifactPath}`);
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const PaymasterFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    // Constructor parameters
    const defaultSpendLimit = ethers.parseEther("50");  // 50 ETH per tx max
    const defaultPeriod = 1000;  // 1000 blocks
    const defaultPeriodLimit = ethers.parseEther("100");  // 100 ETH per period
    const usePeriodicAllowance = true;

    console.log("📝 Deployment Parameters:");
    console.log(`   Default Spend Limit: ${ethers.formatEther(defaultSpendLimit)} ETH`);
    console.log(`   Default Period: ${defaultPeriod} blocks`);
    console.log(`   Default Period Limit: ${ethers.formatEther(defaultPeriodLimit)} ETH`);
    console.log(`   Use Periodic Allowance: ${usePeriodicAllowance}\n`);

    console.log("⏳ Deploying Paymaster contract...");
    const paymaster = await PaymasterFactory.deploy(
        defaultSpendLimit,
        defaultPeriod,
        defaultPeriodLimit,
        usePeriodicAllowance,
        txOptions
    );

    await paymaster.waitForDeployment();
    const paymasterAddress = await paymaster.getAddress();
    console.log(`✅ Paymaster deployed at: ${paymasterAddress}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 2: Deposit funds
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 2: Deposit Funds for Gas Subsidies");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const depositAmount = ethers.parseEther("10");  // 10 ETH
    console.log(`📤 Depositing ${ethers.formatEther(depositAmount)} ETH...`);

    const depositTx = await paymaster.deposit({ ...txOptions, value: depositAmount });
    await depositTx.wait(1);

    const paymasterBalance = await paymaster.getBalance();
    console.log(`✅ Paymaster balance: ${ethers.formatEther(paymasterBalance)} ETH\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 3: Initialize precompile (if needed)
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 3: Initialize GasFeeGrant Precompile");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const isPrecompileInit = await paymaster.isPrecompileInitialized();
    console.log(`📋 Precompile initialized: ${isPrecompileInit}`);

    if (!isPrecompileInit) {
        console.log("⏳ Initializing precompile with Paymaster as owner...");
        const initTx = await paymaster.initializePrecompile(txOptions);
        await initTx.wait(1);
        console.log("✅ Precompile initialized!");
    } else {
        const precompileOwner = await paymaster.getPrecompileOwner();
        console.log(`👑 Current precompile owner: ${precompileOwner}`);

        if (precompileOwner.toLowerCase() !== paymasterAddress.toLowerCase()) {
            console.log("⚠️  Warning: Paymaster is not the precompile owner.");
            console.log("   Grant operations may fail unless ownership is transferred.");
        }
    }

    const isOwner = await paymaster.isPrecompileOwner();
    console.log(`✅ Paymaster is precompile owner: ${isOwner}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 4: Whitelist programs
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 4: Whitelist Programs");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    // Example: Whitelist ContractFactory2
    const contractFactory = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0";
    console.log(`📝 Whitelisting program: ${contractFactory}`);

    const whitelistTx = await paymaster.whitelistProgram(contractFactory, txOptions);
    await whitelistTx.wait(1);
    console.log("✅ Program whitelisted!\n");

    // ═══════════════════════════════════════════════════════════════════
    // Step 5: Set up grants
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Step 5: Set Up Gas Fee Grants");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const grantee = wallet.address;  // Grant to ourselves for testing
    console.log(`📝 Setting grant for: ${grantee}`);
    console.log(`   Program: ${contractFactory}\n`);

    try {
        const grantTx = await paymaster.setGrant(grantee, contractFactory, txOptions);
        await grantTx.wait(1);
        console.log("✅ Grant created successfully!\n");

        // Verify grant
        const isActive = await paymaster.isGrantActive(grantee, contractFactory);
        console.log(`📋 Grant active: ${isActive}`);

        const remaining = await paymaster.getRemainingAllowance(grantee, contractFactory);
        console.log(`📊 Remaining allowance: ${ethers.formatEther(remaining)} ETH`);
    } catch (error: any) {
        console.log(`❌ Failed to set grant: ${error.message}`);
        console.log("   This may happen if Paymaster is not the precompile owner.");
    }

    // ═══════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Deployment Summary");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    console.log(`📄 Paymaster Address: ${paymasterAddress}`);
    console.log(`💰 Paymaster Balance: ${ethers.formatEther(await paymaster.getBalance())} ETH`);
    console.log(`📊 Total Active Grants: ${await paymaster.totalActiveGrants()}`);
    console.log(`👑 Is Precompile Owner: ${await paymaster.isPrecompileOwner()}`);

    console.log("\n✨ Deployment completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
