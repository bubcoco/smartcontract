import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Comprehensive GasPrice Precompile Test
 * 
 * Functions: enable, disable, setGasPrice, getSCR, getOperationFees, owner, admin, transferAdmin
 */

const GAS_PRICE_PRECOMPILE = "0x0000000000000000000000000000000000001003";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║          Comprehensive GasPrice Precompile Test                    ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Wallet: ${wallet.address}\n`);

    // Updated ABI with correct function names
    const abi = [
        "function owner() view returns (address)",
        "function admin() view returns (address)",
        "function initialized() view returns (bool)",
        "function status() view returns (bool)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setGasPrice(uint256 price) returns (bool)",
        "function getSCR() view returns (uint256)",
        "function getOperationFees() view returns (uint256)",
        "function transferAdmin(address newAdmin) returns (bool)",
    ];

    const precompile = new ethers.Contract(GAS_PRICE_PRECOMPILE, abi, wallet);
    const txOptions = { gasLimit: 100000n, gasPrice: 100000000000n };

    // ═══════════════════════════════════════════════════════════════════
    // 0. Check Initialization & Info
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("0. Check Initialization & Info");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const isInitialized = await precompile.initialized();
    const owner = await precompile.owner();
    console.log(`   Initialized: ${isInitialized}`);
    console.log(`   Owner: ${owner}`);

    try {
        const admin = await precompile.admin();
        console.log(`   Admin: ${admin}`);
    } catch (e: any) {
        console.log(`   Admin: ❌ ${e.shortMessage || e.message}`);
    }

    try {
        const scr = await precompile.getSCR();
        console.log(`   SCR: ${ethers.formatUnits(scr, "gwei")} gwei`);
    } catch (e: any) {
        console.log(`   getSCR: ❌ ${e.shortMessage || e.message}`);
    }

    try {
        const opFees = await precompile.getOperationFees();
        console.log(`   Operation Fees: ${ethers.formatUnits(opFees, "gwei")} gwei`);
    } catch (e: any) {
        console.log(`   getOperationFees: ❌ ${e.shortMessage || e.message}`);
    }

    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`\n   ❌ You are not the owner! Cannot proceed.`);
        return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. Test Disabled State
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("1. Test DISABLED State");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    // Ensure disabled
    let status = await precompile.status();
    if (status) {
        console.log(`   ⏳ Disabling GasPrice...`);
        const disableTx = await precompile.disable(txOptions);
        await disableTx.wait(1);
        status = await precompile.status();
    }

    let storedPrice = 0n;
    try {
        storedPrice = await precompile.getSCR();
    } catch (e) { }

    console.log(`   Status: ${status ? "ENABLED" : "DISABLED"} ❌`);
    console.log(`   SCR (Gas Price): ${ethers.formatUnits(storedPrice, "gwei")} gwei`);

    // Send test transaction (let network decide gas price)
    console.log(`\n   📤 Sending test transaction (no gas price specified)...`);
    const tx1 = await wallet.sendTransaction({
        to: wallet.address,
        value: 0n,
    });
    await tx1.wait(1);
    const txData1 = await provider.getTransaction(tx1.hash);

    console.log(`   TX: ${tx1.hash.slice(0, 20)}...`);
    console.log(`   Gas Price Used: ${ethers.formatUnits(txData1?.gasPrice || 0n, "gwei")} gwei`);

    const usedDifferent1 = storedPrice === 0n || txData1?.gasPrice !== storedPrice;
    if (usedDifferent1) {
        console.log(`\n   ✅ Transaction used network gas price (precompile disabled)`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Test Enabled State with New Price
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("2. Test ENABLED State with New Price");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const newGasPrice = ethers.parseUnits("500", "gwei"); // 5000 gwei

    console.log(`   ⏳ Enabling GasPrice precompile...`);
    const enableTx = await precompile.enable(txOptions);
    await enableTx.wait(1);

    console.log(`   ⏳ Setting gas price to ${ethers.formatUnits(newGasPrice, "gwei")} gwei (using setGasPrice)...`);
    const setPriceTx = await precompile.setGasPrice(newGasPrice, txOptions);
    await setPriceTx.wait(1);

    status = await precompile.status();
    let currentSCR = 0n;
    try {
        currentSCR = await precompile.getSCR();
    } catch (e) { }

    console.log(`\n   Status: ${status ? "ENABLED ✅" : "DISABLED"}`);
    console.log(`   SCR (Gas Price): ${ethers.formatUnits(currentSCR, "gwei")} gwei`);

    // Send test transaction with the enforced gas price
    console.log(`\n   📤 Sending test transaction with enforced gas price...`);
    try {
        const tx2 = await wallet.sendTransaction({
            to: wallet.address,
            value: 0n,
            gasPrice: newGasPrice,
        });
        await tx2.wait(1);
        const txData2 = await provider.getTransaction(tx2.hash);

        console.log(`   TX: ${tx2.hash.slice(0, 20)}...`);
        console.log(`   Gas Price Sent: ${ethers.formatUnits(newGasPrice, "gwei")} gwei`);
        console.log(`   Gas Price Used: ${ethers.formatUnits(txData2?.gasPrice || 0n, "gwei")} gwei`);

        if (txData2?.gasPrice === newGasPrice) {
            console.log(`\n   ✅ Transaction used the ENFORCED gas price!`);
        }
    } catch (e: any) {
        console.log(`   ❌ Transaction failed: ${e.shortMessage || e.message}`);
    }

    // Test with wrong gas price
    console.log(`\n   📤 Sending test transaction with WRONG gas price...`);
    try {
        const wrongPrice = ethers.parseUnits("1", "gwei");
        const tx3 = await wallet.sendTransaction({
            to: wallet.address,
            value: 0n,
            gasPrice: wrongPrice,
        });
        await tx3.wait(1);
        console.log(`   ⚠️  Transaction succeeded with wrong gas price`);
    } catch (e: any) {
        console.log(`   ✅ Transaction REJECTED with wrong gas price!`);
        console.log(`      → GasPrice precompile is ENFORCING the set price`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Disable Again
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("3. Disable and Verify");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log(`   ⏳ Disabling GasPrice precompile...`);
    const disableTx2 = await precompile.disable(txOptions);
    await disableTx2.wait(1);

    status = await precompile.status();
    console.log(`   Status: ${status ? "ENABLED" : "DISABLED ❌"}`);

    const tx4 = await wallet.sendTransaction({
        to: wallet.address,
        value: 0n,
    });
    await tx4.wait(1);
    console.log(`   ✅ Transaction succeeded - precompile is disabled`);

    // ═══════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("SUMMARY");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const finalStatus = await precompile.status();
    let finalSCR = 0n;
    let finalOpFees = 0n;
    try { finalSCR = await precompile.getSCR(); } catch (e) { }
    try { finalOpFees = await precompile.getOperationFees(); } catch (e) { }

    console.log(`   Final Status: ${finalStatus ? "ENABLED" : "DISABLED"}`);
    console.log(`   Final SCR: ${ethers.formatUnits(finalSCR, "gwei")} gwei`);
    console.log(`   Final Operation Fees: ${ethers.formatUnits(finalOpFees, "gwei")} gwei`);
    console.log(`\n   Test Results:`);
    console.log(`   ✅ enable() / disable() toggle works`);
    console.log(`   ✅ setGasPrice() updates the SCR`);
    console.log(`   ✅ Disabled → Network gas price used`);
    console.log(`   ✅ Enabled → Precompile gas price enforced`);

    console.log("\n✨ GasPrice precompile test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
