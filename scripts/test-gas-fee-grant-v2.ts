import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test GasFeeGrant Precompile
 * Precompile Address: 0x0000000000000000000000000000000000001006
 */

const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║               Test GasFeeGrant Precompile                          ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_ADDRESS}\n`);

    // 2. Define ABI
    // Based on GasFeeGrantPrecompiledContract.java
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function transferOwnership(address newOwner) returns (bool)",
        // grant returns: granter, allowance, spendLimit, periodLimit, periodCanSpend, startTime, endTime, latestTransaction, period
        "function grant(address grantee, address program) view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        // setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime)
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function revokeFeeGrant(address grantee, address program) returns (bool)"
    ];

    const precompile = new ethers.Contract(GAS_FEE_GRANT_ADDRESS, abi, wallet);

    // 3. Check Initialization & Owner
    console.log("🔍 Checking Status...");
    try {
        const isInitialized = await precompile.initialized();
        console.log(`   Initialized: ${isInitialized}`);

        let currentOwner = "";

        if (!isInitialized) {
            console.log("   ⚠️  Not initialized. Attempting to initialize...");
            const tx = await precompile.initializeOwner(wallet.address);
            await tx.wait(1);
            console.log("   ✅ Initialized!");
        }

        try {
            currentOwner = await precompile.owner();
            console.log(`   Owner: ${currentOwner}`);
        } catch (e) {
            console.log(`   ⚠️ Could not get owner yet.`);
        }

        if (currentOwner && currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.log("   ❌ You are not the owner. Cannot proceed with write tests.");
            return;
        }

    } catch (e: any) {
        console.log(`   ❌ Error checking status: ${e.message}`);
        return;
    }

    // 4. Create a Grant
    console.log("\n🎁 Testing Grant Creation...");

    // --- NEW: Zero Fee Verification Logic ---
    // Critical: MainnetTransactionProcessor.java check:
    // final boolean isGranted = !sender.getStorageValue(FEE_GRANT_FLAG_STORAGE).isZero() && (sender.getBalance()).isZero();
    // Grantee MUST HAVE 0 BALANCE to use the grant!

    console.log("   Creating fresh wallet with 0 balance for Grantee...");
    const granteeWallet = ethers.Wallet.createRandom().connect(provider);
    const grantee = granteeWallet.address;
    console.log(`   Fresh Grantee: ${grantee}`);
    const balance = await provider.getBalance(grantee);
    console.log(`   Grantee Balance: ${balance} (Must be 0)`);

    // Deploy Counter Contract
    console.log("\n🚀 Deploying Counter Contract...");
    const COUNTER_BYTECODE = "0x6080604052348015600f57600080fd5b5060a48061001e6000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c80630c55699c146037578063371303c014604d575b600080fd5b603d610055565b6040516001600160a01b0390911681526020015b60405180910390f35b604f61007c565b005b60005481565b60008054600101905556fea2646970667358221220e8b23315757d5444ca9394628f411b933830c238b0071374ac6e1599546270e564736f6c63430008140033";

    const factory = new ethers.ContractFactory(
        ["function inc()", "function x() view returns (uint256)"],
        COUNTER_BYTECODE,
        wallet
    );

    let counterContract;
    try {
        counterContract = await factory.deploy();
        await counterContract.waitForDeployment();
    } catch (e: any) {
        console.log(`❌ Deployment failed: ${e.message}`);
        return;
    }
    const program = await counterContract.getAddress();
    console.log(`   Granted Program (Counter): ${program}`);

    const granter = wallet.address;
    const spendLimit = ethers.parseEther("0.1");
    const period = 3600;
    const periodLimit = ethers.parseEther("0.1");
    const endTime = Math.floor(Date.now() / 1000) + 86400;

    console.log(`   Grantee: ${grantee}`);
    console.log(`   Program: ${program}`);
    console.log(`   Spend Limit: 0.1 ETH`);
    console.log(`   Period Limit: 0.1 ETH`);

    try {
        const tx = await precompile.setFeeGrant(
            granter,
            grantee,
            program,
            spendLimit,
            period,
            periodLimit,
            endTime
        );
        console.log(`   ⏳ Sending setFeeGrant tx: ${tx.hash}`);
        const receipt = await tx.wait(1);
        console.log(`   ✅ Grant created in block ${receipt.blockNumber}`);
    } catch (e: any) {
        console.log(`   ❌ Error creating grant: ${e.message}`);
        return;
    }

    // 5. Verify Grant
    console.log("\n🧐 Verifying Grant...");
    try {
        const isGranted = await precompile.isGrantedForProgram(grantee, program);
        console.log(`   isGrantedForProgram: ${isGranted}`);

        if (isGranted) {
            const grantDetails = await precompile.grant(grantee, program);
            // Returns: granter, allowance, spendLimit, periodLimit, periodCanSpend, startTime, endTime, latestTransaction, period
            // They come as BigInts mostly
            console.log(`   Grant Details:`);
            // First item is granter (uint256) -> convert to address
            const granterAddr = ethers.zeroPadValue(ethers.toBeHex(grantDetails[0]), 20);
            console.log(`     Granter: ${granterAddr}`);
            console.log(`     Allowance: ${grantDetails[1]}`);
            console.log(`     SpendLimit: ${ethers.formatEther(grantDetails[2])}`);
            console.log(`     PeriodLimit: ${ethers.formatEther(grantDetails[3])}`);
            console.log(`     PeriodCanSpend: ${ethers.formatEther(grantDetails[4])}`);
            console.log(`     EndTime: ${grantDetails[6]}`);
        } else {
            console.log("   ❌ Grant not found after setting it.");
            return;
        }

    } catch (e: any) {
        console.log(`   ❌ Error verifying grant: ${e.message}`);
        return;
    }

    // --- NEW: Zero Fee Transaction Test ---
    console.log("\n💸 Testing Zero Fee Transaction...");
    try {
        const balanceBefore = await provider.getBalance(grantee);
        console.log(`   Grantee Balance Before: ${ethers.formatEther(balanceBefore)} ETH`);

        // Connect grantee to contract
        const counterAsGrantee = new ethers.Contract(program, ["function inc()"], granteeWallet);

        console.log("   ⏳ Grantee sending inc()...");
        // Critical: Gas Price must meets node's min-gas-price (1 Gwei based on conf_validator.toml)
        // AND Grantee has 0 balance.
        // We set gasPrice = 1 Gwei. 
        const minGasPrice = ethers.parseUnits("1", "gwei");
        console.log(`   Using Gas Price: ${ethers.formatUnits(minGasPrice, "gwei")} Gwei`);
        const tx = await counterAsGrantee.inc({
            gasPrice: minGasPrice,
            gasLimit: 100000
        });
        const receipt = await tx.wait(1);

        const balanceAfter = await provider.getBalance(grantee);
        console.log(`   Grantee Balance After:  ${ethers.formatEther(balanceAfter)} ETH`);

        if (balanceBefore === 0n && balanceAfter === 0n) {
            console.log("   ✅ SUCCESS: Grantee with 0 balance successfully executed transaction!");
        } else {
            console.log("   ⚠️  WARNING: Grantee balance changed?");
        }

    } catch (e: any) {
        console.log(`   ❌ Error sending transaction: ${e.message}`);
    }
    // --- End New Logic ---

    // 6. Revoke Grant
    console.log("\n🚫 Testing Grant Revocation...");
    try {
        const tx = await precompile.revokeFeeGrant(grantee, program);
        console.log(`   ⏳ Sending revokeFeeGrant tx: ${tx.hash}`);
        await tx.wait(1);
        console.log("   ✅ Grant revoked.");

        const isGranted = await precompile.isGrantedForProgram(grantee, program);
        console.log(`   isGrantedForProgram (after revoke): ${isGranted}`);
    } catch (e: any) {
        console.log(`   ❌ Error revoking grant: ${e.message}`);
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
