import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Comprehensive GasFeeGrant Precompile Test
 * 
 * Uses the actual Besu implementation functions:
 * - addGrantUser / removeGrantUser
 * - addGrantContract / removeGrantContract
 * - isGranted
 * - getGranter
 */

const GAS_FEE_GRANT_PRECOMPILE = "0x0000000000000000000000000000000000001006";

// Test addresses
const TEST_USER = "0x54e7Ef5795d350Ae257Af47FEdF211bC8b0C5621";
const TEST_CONTRACT = "0xf88Cd430CBf20A240F12650A72A4C11Df74aA28e"; // Any contract address

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║          Comprehensive GasFeeGrant Precompile Test                 ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Admin Wallet: ${wallet.address}`);
    console.log(`📄 GasFeeGrant: ${GAS_FEE_GRANT_PRECOMPILE}`);
    console.log(`🎯 Test User: ${TEST_USER}`);
    console.log(`📝 Test Contract: ${TEST_CONTRACT}\n`);

    // ABI based on actual Besu implementation
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function addGrantUser(address user) returns (bool)",
        "function removeGrantUser(address user) returns (bool)",
        "function addGrantContract(address contractAddress) returns (bool)",
        "function removeGrantContract(address contractAddress) returns (bool)",
        "function isGranted(address account) view returns (bool)",
        "function getGranter() view returns (address)",
    ];

    const precompile = new ethers.Contract(GAS_FEE_GRANT_PRECOMPILE, abi, wallet);
    const txOptions = { gasLimit: 500000n, gasPrice: 100000000000n };

    // ═══════════════════════════════════════════════════════════════════
    // 1. Check Initialization
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("1. Check Initialization");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    let isInitialized = await precompile.initialized();
    let owner = await precompile.owner();

    console.log(`   Initialized: ${isInitialized}`);
    console.log(`   Owner: ${owner}`);

    if (!isInitialized) {
        console.log(`\n   ⏳ Initializing precompile...`);
        try {
            const initTx = await precompile.initializeOwner(wallet.address, txOptions);
            console.log(`   📤 TX: ${initTx.hash}`);
            await initTx.wait(1);
            console.log(`   ✅ Initialized!`);
            isInitialized = await precompile.initialized();
            owner = await precompile.owner();
        } catch (e: any) {
            console.log(`   ❌ Init failed: ${e.shortMessage || e.message}`);
        }
    } else {
        console.log(`\n   ✅ Already initialized`);
    }

    // Get granter
    try {
        const granter = await precompile.getGranter();
        console.log(`   Granter: ${granter}`);
    } catch (e: any) {
        console.log(`   getGranter: ❌ ${e.shortMessage || e.message}`);
    }

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`\n   ❌ You are not the owner! Cannot proceed.`);
        return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Check Current Grant Status
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("2. Check Current Grant Status");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    try {
        const userGranted = await precompile.isGranted(TEST_USER);
        console.log(`   User ${TEST_USER.slice(0, 10)}... isGranted: ${userGranted}`);
    } catch (e: any) {
        console.log(`   isGranted(user): ❌ ${e.shortMessage || e.message}`);
    }

    try {
        const contractGranted = await precompile.isGranted(TEST_CONTRACT);
        console.log(`   Contract ${TEST_CONTRACT.slice(0, 10)}... isGranted: ${contractGranted}`);
    } catch (e: any) {
        console.log(`   isGranted(contract): ❌ ${e.shortMessage || e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Add Grant User
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("3. Add Grant User");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log(`   ⏳ Adding grant user: ${TEST_USER}...`);
    try {
        const addUserTx = await precompile.addGrantUser(TEST_USER, txOptions);
        console.log(`   📤 TX: ${addUserTx.hash}`);
        const receipt = await addUserTx.wait(1);
        console.log(`   ✅ Confirmed in block ${receipt?.blockNumber}`);
        console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);
    } catch (e: any) {
        console.log(`   ❌ addGrantUser failed: ${e.shortMessage || e.message}`);
    }

    // Verify
    try {
        const userGranted = await precompile.isGranted(TEST_USER);
        console.log(`\n   Verification - isGranted: ${userGranted ? "✅ true" : "❌ false"}`);
    } catch (e: any) {
        console.log(`   Verification failed: ${e.shortMessage || e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Add Grant Contract
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("4. Add Grant Contract");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log(`   ⏳ Adding grant contract: ${TEST_CONTRACT}...`);
    try {
        const addContractTx = await precompile.addGrantContract(TEST_CONTRACT, txOptions);
        console.log(`   📤 TX: ${addContractTx.hash}`);
        const receipt = await addContractTx.wait(1);
        console.log(`   ✅ Confirmed in block ${receipt?.blockNumber}`);
        console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);
    } catch (e: any) {
        console.log(`   ❌ addGrantContract failed: ${e.shortMessage || e.message}`);
    }

    // Verify
    try {
        const contractGranted = await precompile.isGranted(TEST_CONTRACT);
        console.log(`\n   Verification - isGranted: ${contractGranted ? "✅ true" : "❌ false"}`);
    } catch (e: any) {
        console.log(`   Verification failed: ${e.shortMessage || e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. Test Remove Functions
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("5. Test Remove Functions (then re-add)");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    // Remove user
    console.log(`   ⏳ Removing grant user...`);
    try {
        const removeTx = await precompile.removeGrantUser(TEST_USER, txOptions);
        await removeTx.wait(1);
        const isGranted = await precompile.isGranted(TEST_USER);
        console.log(`   After remove - isGranted: ${isGranted ? "❌ Still granted" : "✅ Removed"}`);
    } catch (e: any) {
        console.log(`   ❌ removeGrantUser failed: ${e.shortMessage || e.message}`);
    }

    // Re-add user
    console.log(`\n   ⏳ Re-adding grant user...`);
    try {
        const reAddTx = await precompile.addGrantUser(TEST_USER, txOptions);
        await reAddTx.wait(1);
        const isGranted = await precompile.isGranted(TEST_USER);
        console.log(`   After re-add - isGranted: ${isGranted ? "✅ Granted" : "❌ Not granted"}`);
    } catch (e: any) {
        console.log(`   ❌ Re-add failed: ${e.shortMessage || e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("SUMMARY");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const finalInit = await precompile.initialized();
    const finalOwner = await precompile.owner();

    let finalGranter = "N/A";
    try {
        finalGranter = await precompile.getGranter();
    } catch (e) { }

    let userGranted = false;
    let contractGranted = false;
    try {
        userGranted = await precompile.isGranted(TEST_USER);
    } catch (e) { }
    try {
        contractGranted = await precompile.isGranted(TEST_CONTRACT);
    } catch (e) { }

    console.log(`   ✅ Initialized: ${finalInit}`);
    console.log(`   ✅ Owner: ${finalOwner}`);
    console.log(`   📋 Granter: ${finalGranter}`);
    console.log(`   ${userGranted ? "✅" : "❌"} User Grant: ${TEST_USER.slice(0, 10)}...`);
    console.log(`   ${contractGranted ? "✅" : "❌"} Contract Grant: ${TEST_CONTRACT.slice(0, 10)}...`);

    if (userGranted || contractGranted) {
        console.log(`\n   🎉 GasFeeGrant precompile is working correctly!`);
        console.log(`      Gas fees for granted accounts will be paid by the granter.`);
    }

    console.log("\n✨ GasFeeGrant test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
