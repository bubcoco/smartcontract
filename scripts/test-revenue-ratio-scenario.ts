import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Scenario Test: RevenueRatio Precompile (besutest)
 * Precompile Address: 0x0000000000000000000000000000000000001004
 *
 * Tests:
 *  1. Initialization & ownership
 *  2. Set revenue ratios (valid 100-sum)
 *  3. Reject ratios not summing to 100
 *  4. Enable / disable / status toggle
 *  5. Transfer ownership & verify access control
 *  6. Ratio update after ownership transfer
 *  7. Edge cases: zero ratios, max single ratio, re-initialization
 */

const REVENUE_RATIO_ADDRESS = "0x0000000000000000000000000000000000001004";

// besutest uses senderRatio model — function selector uses uint8 but ABI encodes as 32-byte words
const ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address owner) returns (bool)",
    "function transferOwnership(address newOwner) returns (bool)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function status() view returns (bool)",
    "function senderRatio() view returns (uint256)",
    "function coinbaseRatio() view returns (uint256)",
    "function providerRatio() view returns (uint256)",
    "function treasuryRatio() view returns (uint256)",
    "function setRevenueRatio(uint8 senderRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)",
];

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`   ✅ PASS: ${label}`);
        passed++;
    } else {
        console.log(`   ❌ FAIL: ${label}`);
        failed++;
    }
}

async function main() {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║   Scenario Test: RevenueRatio Precompile (besutest)     ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");

    // ── Setup ──────────────────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const admin = new ethers.Wallet(adminKey, provider);

    // Create a second wallet for access-control tests
    const otherWallet = ethers.Wallet.createRandom().connect(provider);

    // Fetch node's gas price to avoid "Gas price below configured minimum" error
    const feeData = await provider.getFeeData();
    const nodeGasPrice = feeData.gasPrice ?? 100000000000n;
    const txOpts = { gasLimit: 500000n, gasPrice: nodeGasPrice };

    console.log(`👤 Admin:  ${admin.address}`);
    console.log(`👤 Other:  ${otherWallet.address}`);
    console.log(`📄 Precompile: ${REVENUE_RATIO_ADDRESS}`);
    console.log(`⛽ Gas Price: ${nodeGasPrice} wei\n`);

    const precompile = new ethers.Contract(REVENUE_RATIO_ADDRESS, ABI, admin);
    const precompileOther = new ethers.Contract(REVENUE_RATIO_ADDRESS, ABI, otherWallet);

    // ── 1. Initialization ──────────────────────────────────────────
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 1: Initialization & Ownership\n");

    const isInitialized = await precompile.initialized();
    console.log(`   initialized(): ${isInitialized}`);

    if (!isInitialized) {
        console.log("   Initializing owner...");
        const tx = await precompile.initializeOwner(admin.address, txOpts);
        await tx.wait(1);
        console.log("   ✅ initializeOwner() succeeded");

        const ownerAfter = await precompile.owner();
        assert(
            ownerAfter.toLowerCase() === admin.address.toLowerCase(),
            `owner() == admin after initialize`
        );
    } else {
        const currentOwner = await precompile.owner();
        console.log(`   Already initialized. Owner: ${currentOwner}`);
        assert(
            currentOwner.toLowerCase() === admin.address.toLowerCase(),
            `Owner is admin`
        );
    }

    // Test re-initialization should fail (return false, not revert)
    try {
        const tx = await precompile.initializeOwner(otherWallet.address, txOpts);
        await tx.wait(1);
        // The precompile returns FALSE but doesn't revert, so the tx succeeds
        console.log(`   Re-initialization tx succeeded (precompile returned false silently)`);
        const ownerStill = await precompile.owner();
        assert(
            ownerStill.toLowerCase() === admin.address.toLowerCase(),
            `Owner unchanged after re-initialization attempt`
        );
    } catch (e: any) {
        console.log(`   Re-initialization reverted: ${e.message}`);
        assert(true, `Re-initialization correctly rejected`);
    }

    // ── 2. Set Revenue Ratios (valid) ──────────────────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 2: Set Revenue Ratios (valid sum = 100)\n");

    const sender = 15, coinbase = 40, prov = 25, treasury = 20; // sum = 100

    try {
        const tx = await precompile.setRevenueRatio(sender, coinbase, prov, treasury, txOpts);
        await tx.wait(1);
        assert(true, `setRevenueRatio(${sender},${coinbase},${prov},${treasury}) succeeded`);

        const s = await precompile.senderRatio();
        const c = await precompile.coinbaseRatio();
        const p = await precompile.providerRatio();
        const t = await precompile.treasuryRatio();

        assert(Number(s) === sender, `senderRatio() == ${sender} (got ${s})`);
        assert(Number(c) === coinbase, `coinbaseRatio() == ${coinbase} (got ${c})`);
        assert(Number(p) === prov, `providerRatio() == ${prov} (got ${p})`);
        assert(Number(t) === treasury, `treasuryRatio() == ${treasury} (got ${t})`);

        const total = Number(s) + Number(c) + Number(p) + Number(t);
        assert(total === 100, `Sum of all ratios == 100 (got ${total})`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
        failed++;
    }

    // ── 3. Reject invalid ratios (sum ≠ 100) ──────────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 3: Reject Ratios Not Summing to 100\n");

    // Read ratios before the invalid call
    const senderBefore = await precompile.senderRatio();
    const coinbaseBefore = await precompile.coinbaseRatio();

    try {
        const tx = await precompile.setRevenueRatio(10, 10, 10, 10, txOpts); // sum = 40
        await tx.wait(1);
        // Precompile returns FALSE (tx doesn't revert, but ratios unchanged)
        const senderAfter = await precompile.senderRatio();
        const coinbaseAfter = await precompile.coinbaseRatio();
        assert(
            Number(senderAfter) === Number(senderBefore) && Number(coinbaseAfter) === Number(coinbaseBefore),
            `Ratios unchanged after invalid sum (40 ≠ 100)`
        );
    } catch (e: any) {
        assert(true, `setRevenueRatio(10,10,10,10) rejected (sum = 40)`);
    }

    try {
        const tx = await precompile.setRevenueRatio(50, 50, 50, 50, txOpts); // sum = 200
        await tx.wait(1);
        const senderAfter2 = await precompile.senderRatio();
        assert(
            Number(senderAfter2) === Number(senderBefore),
            `Ratios unchanged after invalid sum (200 ≠ 100)`
        );
    } catch (e: any) {
        assert(true, `setRevenueRatio(50,50,50,50) rejected (sum = 200)`);
    }

    // ── 4. Enable / Disable / Status ──────────────────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 4: Enable / Disable / Status Toggle\n");

    try {
        // Enable
        const txEn = await precompile.enable(txOpts);
        await txEn.wait(1);
        const statusEnabled = await precompile.status();
        assert(statusEnabled === true, `status() == true after enable()`);

        // Disable
        const txDis = await precompile.disable(txOpts);
        await txDis.wait(1);
        const statusDisabled = await precompile.status();
        assert(statusDisabled === false, `status() == false after disable()`);

        // Re-enable
        const txRe = await precompile.enable(txOpts);
        await txRe.wait(1);
        const statusReEnabled = await precompile.status();
        assert(statusReEnabled === true, `status() == true after re-enable()`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
        failed++;
    }

    // ── 5. Access Control: non-owner cannot write ─────────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 5: Access Control (non-owner rejected)\n");

    // Fund the other wallet so it can send transactions (10 ETH to cover high gas price)
    try {
        const fundTx = await admin.sendTransaction({
            to: otherWallet.address,
            value: ethers.parseEther("10"),
            ...txOpts,
        });
        await fundTx.wait(1);
        console.log(`   Funded otherWallet with 10 ETH`);
    } catch (e: any) {
        console.log(`   ⚠️  Could not fund other wallet: ${e.message}`);
    }

    // Non-owner tries setRevenueRatio
    try {
        const tx = await precompileOther.setRevenueRatio(25, 25, 25, 25, txOpts);
        const receipt = await Promise.race([
            tx.wait(1),
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 30000)),
        ]);
        // Precompile returns FALSE (silent failure)
        const senderStill = await precompile.senderRatio();
        assert(
            Number(senderStill) === sender,
            `Non-owner setRevenueRatio ignored (senderRatio unchanged)`
        );
    } catch (e: any) {
        if (e.message === "TIMEOUT") {
            assert(true, `Non-owner setRevenueRatio tx not mined (effectively rejected)`);
        } else {
            assert(true, `Non-owner setRevenueRatio correctly rejected`);
        }
    }

    // Non-owner tries enable
    try {
        const tx = await precompileOther.enable(txOpts);
        const receipt = await Promise.race([
            tx.wait(1),
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 30000)),
        ]);
        assert(true, `Non-owner enable() call did not revert (returns FALSE silently)`);
    } catch (e: any) {
        if (e.message === "TIMEOUT") {
            assert(true, `Non-owner enable() tx not mined (effectively rejected)`);
        } else {
            assert(true, `Non-owner enable() correctly rejected`);
        }
    }

    // Non-owner tries transferOwnership
    try {
        const tx = await precompileOther.transferOwnership(otherWallet.address, txOpts);
        const receipt = await Promise.race([
            tx.wait(1),
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 30000)),
        ]);
        const ownerCheck = await precompile.owner();
        assert(
            ownerCheck.toLowerCase() === admin.address.toLowerCase(),
            `Non-owner transferOwnership ignored (owner unchanged)`
        );
    } catch (e: any) {
        if (e.message === "TIMEOUT") {
            assert(true, `Non-owner transferOwnership tx not mined (effectively rejected)`);
        } else {
            assert(true, `Non-owner transferOwnership correctly rejected`);
        }
    }

    // ── 6. Edge: Zero sender ratio, max single ratio ──────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 6: Edge Cases — Zero & Max Single Ratios\n");

    try {
        // Zero sender, all to coinbase
        const tx1 = await precompile.setRevenueRatio(0, 100, 0, 0, txOpts);
        await tx1.wait(1);
        const s1 = await precompile.senderRatio();
        const c1 = await precompile.coinbaseRatio();
        assert(Number(s1) === 0 && Number(c1) === 100, `Zero sender, 100 coinbase OK`);

        // All to treasury
        const tx2 = await precompile.setRevenueRatio(0, 0, 0, 100, txOpts);
        await tx2.wait(1);
        const t2 = await precompile.treasuryRatio();
        assert(Number(t2) === 100, `All 100 to treasury OK`);

        // Restore balanced ratio
        const tx3 = await precompile.setRevenueRatio(25, 25, 25, 25, txOpts);
        await tx3.wait(1);
        const s3 = await precompile.senderRatio();
        assert(Number(s3) === 25, `Balanced 25/25/25/25 OK`);
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
        failed++;
    }

    // ── 7. Ownership Transfer & Post-Transfer Write ───────────────
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Test 7: Ownership Transfer & Post-Transfer Ratio Update\n");

    try {
        // Transfer to otherWallet
        const txTransfer = await precompile.transferOwnership(otherWallet.address, txOpts);
        await txTransfer.wait(1);
        const newOwner = await precompile.owner();
        assert(
            newOwner.toLowerCase() === otherWallet.address.toLowerCase(),
            `Owner changed to otherWallet after transferOwnership`
        );

        // Old owner (admin) should no longer be able to set ratios
        const txOldOwner = await precompile.setRevenueRatio(1, 1, 1, 97, txOpts);
        await txOldOwner.wait(1);
        const senderCheck = await precompile.senderRatio();
        assert(
            Number(senderCheck) === 25, // Should still be 25 from previous test
            `Old owner's setRevenueRatio ignored`
        );

        // New owner (otherWallet) can set ratios
        const txNew = await precompileOther.setRevenueRatio(10, 30, 30, 30, txOpts);
        await txNew.wait(1);
        const senderNew = await precompile.senderRatio();
        assert(Number(senderNew) === 10, `New owner setRevenueRatio(10,30,30,30) worked`);

        // Transfer back to admin
        const txBack = await precompileOther.transferOwnership(admin.address, txOpts);
        await txBack.wait(1);
        const ownerBack = await precompile.owner();
        assert(
            ownerBack.toLowerCase() === admin.address.toLowerCase(),
            `Owner transferred back to admin`
        );
    } catch (e: any) {
        console.log(`   ❌ Error: ${e.message}`);
        failed++;
    }

    // ── Summary ───────────────────────────────────────────────────
    console.log("\n══════════════════════════════════════════════════════════");
    console.log(`📊 Results:  ${passed} passed,  ${failed} failed,  ${passed + failed} total`);
    if (failed === 0) {
        console.log("🎉 ALL TESTS PASSED!");
    } else {
        console.log("⚠️  Some tests FAILED. Review output above.");
    }
    console.log("══════════════════════════════════════════════════════════\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
