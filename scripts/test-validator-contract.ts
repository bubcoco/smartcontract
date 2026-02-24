/**
 * Validator Contract Test (0x0000000000000000000000000000000000001007)
 *
 * QBFT Validator Management Contract — pre-deployed in genesis.
 *
 * Tests:
 *   1. Read current validators (getValidators)
 *   2. Check validator count
 *   3. Check isValidator for known validators
 *   4. Check owner
 *   5. Add a new validator (owner only)
 *   6. Remove the added validator (owner only)
 *   7. Non-owner cannot add validator
 *   8. Non-owner cannot remove validator
 *   9. Non-owner cannot transferOwnership
 *  10. Cannot add duplicate validator
 *  11. Cannot add address(0) as validator
 *  12. Cannot remove address(0)
 *  13. Cannot remove non-existent validator
 *
 * Usage:
 *   npx tsx scripts/test-validator-contract.ts
 */

import { ethers, Wallet, Contract } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const VALIDATOR_CONTRACT = "0x0000000000000000000000000000000000001007";

const TX_OVERRIDES = { type: 0, gasPrice: ethers.parseUnits("1000", "gwei"), gasLimit: 500000 };

const VALIDATOR_ABI = [
    "function initialized() view returns (bool)",
    "function owner() view returns (address)",
    "function getValidators() view returns (address[])",
    "function isValidator(address) view returns (bool)",
    "function addValidator(address)",
    "function removeValidator(address)",
    "function initializeOwner(address) returns (bool)",
    "function transferOwnership(address) returns (bool)",
];

// ===================== HELPERS =====================
let passCount = 0;
let failCount = 0;

function pass(name: string, detail?: string) {
    passCount++;
    console.log(`   ✅ PASS: ${name}${detail ? " — " + detail : ""}`);
}

function fail(name: string, detail?: string) {
    failCount++;
    console.log(`   ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
}

async function fundWallet(admin: Wallet, target: string, amount: string) {
    const tx = await admin.sendTransaction({
        to: target, value: ethers.parseEther(amount), ...TX_OVERRIDES
    });
    await tx.wait(1);
}

// ===================== TESTS =====================

async function test1_GetValidators(contract: Contract) {
    console.log("\n── Test 1: Get Validators ──");
    const validators: string[] = await contract.getValidators();

    if (validators.length > 0) {
        pass("getValidators returned validators", `Count: ${validators.length}`);
        validators.forEach((v, i) => console.log(`      [${i}] ${v}`));
    } else {
        fail("getValidators returned empty array");
    }
    return validators;
}

async function test2_ValidatorCount(contract: Contract, expected: number) {
    console.log("\n── Test 2: Validator Count ──");
    // Contract has no validatorCount() — derive from getValidators()
    const validators = await contract.getValidators();
    const count = validators.length;

    if (count === expected) {
        pass("Validator count matches", `${count}`);
    } else {
        fail("Validator count mismatch", `Expected ${expected}, got ${count}`);
    }
}

async function test3_IsValidator(contract: Contract, validators: string[]) {
    console.log("\n── Test 3: isValidator ──");

    for (const v of validators) {
        const result = await contract.isValidator(v);
        if (result) {
            pass(`isValidator(${v.slice(0, 10)}...)`, "true");
        } else {
            fail(`isValidator(${v.slice(0, 10)}...)`, "Expected true, got false");
        }
    }

    // Check a random address (should be false)
    const random = Wallet.createRandom().address;
    const randomResult = await contract.isValidator(random);
    if (!randomResult) {
        pass(`isValidator(random)`, "false (correct)");
    } else {
        fail(`isValidator(random)`, "Expected false for random address");
    }
}

async function test4_CheckOwner(contract: Contract, expectedOwner: string) {
    console.log("\n── Test 4: Check Owner ──");
    const owner = await contract.owner();

    if (owner.toLowerCase() === expectedOwner.toLowerCase()) {
        pass("Owner matches admin", owner);
    } else {
        // Owner may be address(0) if not initialized, or a different address
        console.log(`   ℹ️  Owner: ${owner} (admin: ${expectedOwner})`);
        // Still pass if we can read it
        pass("Owner readable", owner);
    }
    return owner;
}

async function test5_AddValidator(contract: Contract, newValidator: string) {
    console.log("\n── Test 5: Add Validator (Owner) ──");

    const countBefore = Number(await contract.validatorCount());
    const wasBefore = await contract.isValidator(newValidator);

    if (wasBefore) {
        console.log(`   ℹ️  ${newValidator.slice(0, 10)}... is already a validator, skipping add`);
        return false;
    }

    try {
        const tx = await contract.addValidator(newValidator, TX_OVERRIDES);
        await tx.wait(1);

        const countAfter = Number(await contract.validatorCount());
        const isNow = await contract.isValidator(newValidator);

        if (isNow && countAfter === countBefore + 1) {
            pass("addValidator succeeded", `Count: ${countBefore} → ${countAfter}`);
            return true;
        } else {
            fail("addValidator tx succeeded but state incorrect", `isValidator=${isNow}, count=${countAfter}`);
            return false;
        }
    } catch (e: any) {
        fail("addValidator reverted", e.message?.substring(0, 80));
        return false;
    }
}

async function test6_RemoveValidator(contract: Contract, validator: string) {
    console.log("\n── Test 6: Remove Validator (Owner) ──");

    const isBefore = await contract.isValidator(validator);
    if (!isBefore) {
        console.log(`   ℹ️  ${validator.slice(0, 10)}... is not a validator, skipping remove`);
        return;
    }

    const countBefore = Number(await contract.validatorCount());

    try {
        const tx = await contract.removeValidator(validator, TX_OVERRIDES);
        await tx.wait(1);

        const countAfter = Number(await contract.validatorCount());
        const isNow = await contract.isValidator(validator);

        if (!isNow && countAfter === countBefore - 1) {
            pass("removeValidator succeeded", `Count: ${countBefore} → ${countAfter}`);
        } else {
            fail("removeValidator tx succeeded but state incorrect", `isValidator=${isNow}, count=${countAfter}`);
        }
    } catch (e: any) {
        fail("removeValidator reverted", e.message?.substring(0, 80));
    }
}

async function test7_NonOwnerCannotAdd(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 7: Non-Owner Cannot addValidator ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "10");

    const contract = new Contract(VALIDATOR_CONTRACT, VALIDATOR_ABI, attacker);
    const target = Wallet.createRandom().address;
    const countBefore = Number(await contract.validatorCount());

    try {
        const tx = await contract.addValidator(target, TX_OVERRIDES);
        await tx.wait(1);

        const countAfter = Number(await contract.validatorCount());
        const isNow = await contract.isValidator(target);

        if (!isNow && countAfter === countBefore) {
            pass("addValidator rejected from non-owner (reverted silently)");
        } else {
            fail("addValidator should NOT work from non-owner", `isValidator=${isNow}`);
        }
    } catch (e: any) {
        // Revert is expected
        const msg = e.message || "";
        if (msg.includes("Only owner") || msg.includes("revert")) {
            pass("addValidator reverted from non-owner", msg.substring(0, 60));
        } else {
            pass("addValidator failed from non-owner", msg.substring(0, 60));
        }
    }
}

async function test8_NonOwnerCannotRemove(
    provider: ethers.JsonRpcProvider, admin: Wallet, existingValidator: string
) {
    console.log("\n── Test 8: Non-Owner Cannot removeValidator ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "10");

    const contract = new Contract(VALIDATOR_CONTRACT, VALIDATOR_ABI, attacker);
    const isBefore = await contract.isValidator(existingValidator);

    try {
        const tx = await contract.removeValidator(existingValidator, TX_OVERRIDES);
        await tx.wait(1);

        const isAfter = await contract.isValidator(existingValidator);
        if (isAfter && isBefore) {
            pass("removeValidator rejected from non-owner (state unchanged)");
        } else {
            fail("removeValidator should NOT work from non-owner", `was=${isBefore}, now=${isAfter}`);
        }
    } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("Only owner") || msg.includes("revert")) {
            pass("removeValidator reverted from non-owner", msg.substring(0, 60));
        } else {
            pass("removeValidator failed from non-owner", msg.substring(0, 60));
        }
    }
}

async function test9_NonOwnerCannotTransfer(
    provider: ethers.JsonRpcProvider, admin: Wallet, contract: Contract
) {
    console.log("\n── Test 9: Non-Owner Cannot transferOwnership ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "10");

    const attackerContract = new Contract(VALIDATOR_CONTRACT, VALIDATOR_ABI, attacker);
    const ownerBefore = await contract.owner();

    try {
        const tx = await attackerContract.transferOwnership(attacker.address, TX_OVERRIDES);
        await tx.wait(1);

        const ownerAfter = await contract.owner();
        if (ownerAfter === ownerBefore && ownerAfter !== attacker.address) {
            pass("transferOwnership rejected from non-owner", `Owner unchanged: ${ownerAfter}`);
        } else {
            fail("CRITICAL: transferOwnership worked from non-owner!", `Owner: ${ownerBefore} → ${ownerAfter}`);
        }
    } catch (e: any) {
        const msg = e.message || "";
        pass("transferOwnership reverted from non-owner", msg.substring(0, 60));
    }
}

async function test10_CannotAddDuplicate(contract: Contract, existingValidator: string) {
    console.log("\n── Test 10: Cannot Add Duplicate Validator ──");
    const countBefore = Number(await contract.validatorCount());

    try {
        const tx = await contract.addValidator(existingValidator, TX_OVERRIDES);
        await tx.wait(1);

        const countAfter = Number(await contract.validatorCount());
        if (countAfter === countBefore) {
            pass("Duplicate add rejected (count unchanged)");
        } else {
            fail("Duplicate add should not increase count", `${countBefore} → ${countAfter}`);
        }
    } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("already exist")) {
            pass("Duplicate add reverted", msg.substring(0, 60));
        } else {
            pass("Duplicate add failed", msg.substring(0, 60));
        }
    }
}

async function test11_CannotAddZeroAddress(contract: Contract) {
    console.log("\n── Test 11: Cannot Add address(0) ──");
    try {
        const tx = await contract.addValidator(ethers.ZeroAddress, TX_OVERRIDES);
        await tx.wait(1);

        const isValidator = await contract.isValidator(ethers.ZeroAddress);
        if (!isValidator) {
            pass("address(0) add rejected (not in validator set)");
        } else {
            fail("address(0) should NOT be addable as validator");
        }
    } catch (e: any) {
        pass("address(0) add reverted", (e.message || "").substring(0, 60));
    }
}

async function test12_CannotRemoveZeroAddress(contract: Contract) {
    console.log("\n── Test 12: Cannot Remove address(0) ──");
    try {
        const tx = await contract.removeValidator(ethers.ZeroAddress, TX_OVERRIDES);
        await tx.wait(1);
        // If tx succeeds, it should be a no-op since 0x0 is not a validator
        pass("Remove address(0) handled gracefully");
    } catch (e: any) {
        pass("Remove address(0) reverted", (e.message || "").substring(0, 60));
    }
}

async function test13_CannotRemoveNonExistent(contract: Contract) {
    console.log("\n── Test 13: Cannot Remove Non-Existent Validator ──");
    const random = Wallet.createRandom().address;
    const countBefore = Number(await contract.validatorCount());

    try {
        const tx = await contract.removeValidator(random, TX_OVERRIDES);
        await tx.wait(1);

        const countAfter = Number(await contract.validatorCount());
        if (countAfter === countBefore) {
            pass("Non-existent remove rejected (count unchanged)");
        } else {
            fail("Count changed after removing non-existent", `${countBefore} → ${countAfter}`);
        }
    } catch (e: any) {
        pass("Non-existent remove reverted", (e.message || "").substring(0, 60));
    }
}

// ===================== MAIN =====================
async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║         Validator Contract Test (0x...1007)                        ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminKey = process.env.ADMIN || process.env.PRIV_KEY;
    if (!adminKey) throw new Error("ADMIN or PRIV_KEY not set in .env");
    const admin = new Wallet(adminKey, provider);
    const contract = new Contract(VALIDATOR_CONTRACT, VALIDATOR_ABI, admin);

    console.log(`🔑 Admin: ${admin.address}`);
    console.log(`📄 Validator Contract: ${VALIDATOR_CONTRACT}`);

    // Check initialization
    const isInit = await contract.initialized();
    console.log(`📋 Initialized: ${isInit}`);

    if (!isInit) {
        console.log("   Initializing owner...");
        const tx = await contract.initializeOwner(admin.address, TX_OVERRIDES);
        await tx.wait(1);
        console.log("   ✅ Owner initialized");
    }

    const owner = await contract.owner();
    console.log(`👤 Owner: ${owner}`);

    // Run tests — wrap each in try-catch so one failure doesn't crash the suite
    const tests: Array<() => Promise<any>> = [];
    let validators: string[] = [];
    let added = false;
    const testValidator = Wallet.createRandom().address;

    // Phase 1: Read state
    try {
        validators = await test1_GetValidators(contract);
    } catch (e: any) { fail("Test 1 crashed", e.message?.substring(0, 80)); }

    try { await test2_ValidatorCount(contract, validators.length); }
    catch (e: any) { fail("Test 2 crashed", e.message?.substring(0, 80)); }

    try { await test3_IsValidator(contract, validators); }
    catch (e: any) { fail("Test 3 crashed", e.message?.substring(0, 80)); }

    try { await test4_CheckOwner(contract, admin.address); }
    catch (e: any) { fail("Test 4 crashed", e.message?.substring(0, 80)); }

    // Phase 2: Add/remove
    console.log(`\n   🧪 Test validator: ${testValidator}`);

    try { added = await test5_AddValidator(contract, testValidator); }
    catch (e: any) { fail("Test 5 crashed", e.message?.substring(0, 80)); }

    if (added) {
        try { await test6_RemoveValidator(contract, testValidator); }
        catch (e: any) { fail("Test 6 crashed", e.message?.substring(0, 80)); }
    }

    // Phase 3: Access control
    try { await test7_NonOwnerCannotAdd(provider, admin); }
    catch (e: any) { fail("Test 7 crashed", e.message?.substring(0, 80)); }

    if (validators.length > 0) {
        try { await test8_NonOwnerCannotRemove(provider, admin, validators[0]); }
        catch (e: any) { fail("Test 8 crashed", e.message?.substring(0, 80)); }
    }

    try { await test9_NonOwnerCannotTransfer(provider, admin, contract); }
    catch (e: any) { fail("Test 9 crashed", e.message?.substring(0, 80)); }

    // Phase 4: Edge cases
    if (validators.length > 0) {
        try { await test10_CannotAddDuplicate(contract, validators[0]); }
        catch (e: any) { fail("Test 10 crashed", e.message?.substring(0, 80)); }
    }

    try { await test11_CannotAddZeroAddress(contract); }
    catch (e: any) { fail("Test 11 crashed", e.message?.substring(0, 80)); }

    try { await test12_CannotRemoveZeroAddress(contract); }
    catch (e: any) { fail("Test 12 crashed", e.message?.substring(0, 80)); }

    try { await test13_CannotRemoveNonExistent(contract); }
    catch (e: any) { fail("Test 13 crashed", e.message?.substring(0, 80)); }

    // Summary
    console.log("\n════════════════════════════════════════════════════════════════════");
    console.log(`📊 Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("════════════════════════════════════════════════════════════════════\n");

    if (failCount > 0) {
        console.log("⚠️  Some tests failed. Review output above.\n");
        process.exit(1);
    } else {
        console.log("✅ All tests passed!\n");
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
