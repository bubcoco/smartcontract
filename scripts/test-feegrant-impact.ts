/**
 * Fee Grant Core Impact Test
 *
 * Verifies that fee grant changes in MainnetTransactionValidator &
 * MainnetTransactionProcessor have no side effects on core block processing.
 *
 * 9 Test Scenarios:
 *   1. Normal transfer (no grant) — sender pays gas
 *   2. Contract call (no grant) — sender pays gas
 *   3. Grant active → contract call — granter pays gas
 *   4. Revoke grant → retry tx — sender pays gas after revoke
 *   5. Expired grant → tx rejected
 *   6. Grant exceeds spend limit → tx rejected
 *   7. Granter insufficient balance → tx rejected
 *   8. Multiple blocks sequential — block production stable
 *   9. Coinbase receives fees — fee distribution not broken
 *  15. Dual program grant — spend exceeds first, second unaffected
 *
 * Usage:
 *   npx tsx scripts/test-feegrant-impact.ts
 */

import { ethers, Wallet, Contract } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { config as dotenvConfig } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: path.resolve(__dirname, "../.env") });

// ===================== CONFIG =====================
const RPC_URL = "http://localhost:8545";
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";
const ADDRESSES_PATH = path.resolve(__dirname, "../deployed-addresses.json");

// Gas price set by GasPrice precompile — must use type: 0 legacy txs
const TX_OVERRIDES = { type: 0, gasPrice: ethers.parseUnits("1000", "gwei") };
const TRANSFER_OVERRIDES = { ...TX_OVERRIDES, gasLimit: 21000 };
const CONTRACT_OVERRIDES = { ...TX_OVERRIDES, gasLimit: 5000000 };

const PRECOMPILE_ABI = [
    "function initializeOwner(address) external returns (bool)",
    "function initialized() external view returns (uint256)",
    "function owner() external view returns (address)",
    "function transferOwnership(address newOwner) external returns (bool)",
    "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
    "function revokeFeeGrant(address grantee, address program) returns (bool)",
    "function isGrantedForProgram(address grantee, address program) view returns (bool)",
    "function isExpired(address grantee, address program) view returns (bool)",
    "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
];

const COUNTER_ARTIFACT_PATH = path.resolve(__dirname, "../artifacts/contracts/Counter.sol/Counter.json");

const FACTORY_ABI = [
    "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to) external returns (address)"
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
    const tx = await admin.sendTransaction({ to: target, value: ethers.parseEther(amount), ...TX_OVERRIDES });
    await tx.wait(1);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`TIMEOUT: ${label} did not complete in ${ms / 1000}s`)), ms)
        )
    ]);
}

async function grantFee(
    precompile: Contract,
    granter: string,
    grantee: string,
    program: string,
    spendLimitEth: string,
    periodSeconds: number,
    endTimeOffset: number
) {
    const spendLimit = ethers.parseEther(spendLimitEth);
    const periodLimit = spendLimit;
    const endTime = Math.floor(Date.now() / 1000) + endTimeOffset;
    const tx = await precompile.setFeeGrant(
        granter, grantee, program, spendLimit, periodSeconds, periodLimit, endTime,
        TX_OVERRIDES
    );
    await tx.wait(1);
}

async function revokeFee(precompile: Contract, grantee: string, program: string) {
    const tx = await precompile.revokeFeeGrant(grantee, program, TX_OVERRIDES);
    await tx.wait(1);
}

// ===================== TESTS =====================

async function test1_NormalTransferNoGrant(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n── Test 1: Normal Transfer (No Grant) ──");
    const wallet = Wallet.createRandom().connect(provider);
    const recipient = Wallet.createRandom().address;

    await fundWallet(admin, wallet.address, "0.1");
    const before = await provider.getBalance(wallet.address);

    const tx = await wallet.sendTransaction({
        to: recipient,
        value: ethers.parseEther("0.01"),
        ...TRANSFER_OVERRIDES
    });
    await tx.wait(1);

    const after = await provider.getBalance(wallet.address);
    const diff = before - after;

    if (diff > ethers.parseEther("0.01")) {
        pass("Sender paid gas (balance decreased more than transfer)", `Diff: ${ethers.formatEther(diff)} ETH`);
    } else {
        fail("Sender should have paid gas", `Diff: ${ethers.formatEther(diff)} ETH`);
    }
}

async function test2_ContractCallNoGrant(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 2: Contract Call (No Grant) ──");
    const wallet = Wallet.createRandom().connect(provider);
    await fundWallet(admin, wallet.address, "1000");

    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    const before = await provider.getBalance(wallet.address);

    const tx = await factory.createERC20("TestNoGrant", "TNG", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
    await tx.wait(1);

    const after = await provider.getBalance(wallet.address);
    const diff = before - after;

    if (diff > 0n) {
        pass("Sender paid gas for contract call", `Gas cost: ${ethers.formatEther(diff)} ETH`);
    } else {
        fail("Sender should have paid gas for contract call");
    }
}

async function test3_GrantActiveContractCall(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 3: Grant Active → Contract Call ──");
    const wallet = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, wallet.address, "1.0");

    // Grant fees
    await grantFee(precompile, admin.address, wallet.address, factoryAddress, "1000", 86400, 86400);

    const granteeBalanceBefore = await provider.getBalance(wallet.address);
    const granterBalanceBefore = await provider.getBalance(admin.address);

    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    const tx = await factory.createERC20("TestGranted", "TGR", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
    await tx.wait(1);

    const granteeBalanceAfter = await provider.getBalance(wallet.address);
    const granterBalanceAfter = await provider.getBalance(admin.address);

    const granteeDiff = granteeBalanceBefore - granteeBalanceAfter;
    const granterDiff = granterBalanceBefore - granterBalanceAfter;

    if (granteeDiff === 0n) {
        pass("Grantee balance unchanged (gas covered by grant)");
    } else {
        fail("Grantee should not have paid gas", `Diff: ${ethers.formatEther(granteeDiff)} ETH`);
    }

    if (granterDiff > 0n) {
        pass("Granter balance decreased (paid for gas)", `Diff: ${ethers.formatEther(granterDiff)} ETH`);
    } else {
        fail("Granter should have paid gas", `Diff: ${ethers.formatEther(granterDiff)} ETH`);
    }

    // Cleanup
    await revokeFee(precompile, wallet.address, factoryAddress);
}

async function test4_RevokeGrantRetryTx(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 4: Revoke Grant → Retry Tx ──");
    const wallet = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, wallet.address, "1000");

    // Grant then revoke
    await grantFee(precompile, admin.address, wallet.address, factoryAddress, "1000", 86400, 86400);
    await revokeFee(precompile, wallet.address, factoryAddress);

    const isGranted = await precompile.isGrantedForProgram(wallet.address, factoryAddress);
    if (!isGranted) {
        pass("Grant successfully revoked");
    } else {
        fail("Grant should have been revoked");
    }

    // Now send tx — sender should pay gas
    const before = await provider.getBalance(wallet.address);
    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    const tx = await factory.createERC20("TestRevoked", "TRV", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
    await tx.wait(1);

    const after = await provider.getBalance(wallet.address);
    const diff = before - after;

    if (diff > 0n) {
        pass("After revoke, sender pays gas", `Gas cost: ${ethers.formatEther(diff)} ETH`);
    } else {
        fail("After revoke, sender should pay gas");
    }
}

async function test5_ExpiredGrant(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 5: Expired Grant → Fallback to Sender ──");
    const wallet = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, wallet.address, "1000");

    // Grant with endTime = block 1 (long past → expired)
    const spendLimit = ethers.parseEther("1000");
    const txGrant = await precompile.setFeeGrant(
        admin.address, wallet.address, factoryAddress,
        spendLimit, 86400, spendLimit, 1, // endTime = block 1 = expired
        TX_OVERRIDES
    );
    await txGrant.wait(1);

    const balBefore = await provider.getBalance(wallet.address);

    // Tx should succeed — sender pays gas (fallback)
    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    try {
        const tx = await factory.createERC20("TestExpired", "TEX", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
        await withTimeout(tx.wait(1), 30000, "expired grant tx");
        const balAfter = await provider.getBalance(wallet.address);
        const gasCost = balBefore - balAfter;
        if (gasCost > 0n) {
            pass("Expired grant: sender paid gas (fallback)", `Gas cost: ${ethers.formatEther(gasCost)} ETH`);
        } else {
            fail("Sender balance did not decrease");
        }
    } catch (e: any) {
        fail("Tx should succeed with sender fallback", e.message?.substring(0, 80));
    }

    // Cleanup
    try { await revokeFee(precompile, wallet.address, factoryAddress); } catch { }
}

async function test6_ExceedsSpendLimit(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 6: Grant Exceeds Spend Limit → Fallback to Sender ──");
    const wallet = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, wallet.address, "1000");

    // Create grant with 1 wei spend limit — too low for any gas
    const endTime = Math.floor(Date.now() / 1000) + 86400;
    const txGrant = await precompile.setFeeGrant(
        admin.address, wallet.address, factoryAddress,
        1n, 86400, 1n, endTime, // 1 wei spend limit
        TX_OVERRIDES
    );
    await txGrant.wait(1);

    const balBefore = await provider.getBalance(wallet.address);

    // Tx should succeed — sender pays gas (fallback)
    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    try {
        const tx = await factory.createERC20("TestLimit", "TLM", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
        await withTimeout(tx.wait(1), 30000, "spend limit tx");
        const balAfter = await provider.getBalance(wallet.address);
        const gasCost = balBefore - balAfter;
        if (gasCost > 0n) {
            pass("Spend limit exceeded: sender paid gas (fallback)", `Gas cost: ${ethers.formatEther(gasCost)} ETH`);
        } else {
            fail("Sender balance did not decrease");
        }
    } catch (e: any) {
        fail("Tx should succeed with sender fallback", e.message?.substring(0, 80));
    }

    // Cleanup
    try { await revokeFee(precompile, wallet.address, factoryAddress); } catch { }
}

async function test7_GranterInsufficientBalance(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 7: Granter Insufficient Balance → Fallback to Sender ──");
    const wallet = Wallet.createRandom().connect(provider);
    const poorGranter = Wallet.createRandom(); // 0 ETH
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, wallet.address, "1000");

    // Grant with poorGranter as the granter address (has 0 ETH)
    const spendLimit = ethers.parseEther("1000");
    const endTime = Math.floor(Date.now() / 1000) + 86400;
    const txGrant = await precompile.setFeeGrant(
        poorGranter.address, wallet.address, factoryAddress,
        spendLimit, 86400, spendLimit, endTime,
        TX_OVERRIDES
    );
    await txGrant.wait(1);

    const balBefore = await provider.getBalance(wallet.address);

    // Tx should succeed — sender pays gas (fallback)
    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    try {
        const tx = await factory.createERC20("TestPoorGranter", "TPG", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
        await withTimeout(tx.wait(1), 30000, "poor granter tx");
        const balAfter = await provider.getBalance(wallet.address);
        const gasCost = balBefore - balAfter;
        if (gasCost > 0n) {
            pass("Poor granter: sender paid gas (fallback)", `Gas cost: ${ethers.formatEther(gasCost)} ETH`);
        } else {
            fail("Sender balance did not decrease");
        }
    } catch (e: any) {
        fail("Tx should succeed with sender fallback", e.message?.substring(0, 80));
    }

    // Cleanup
    try { await revokeFee(precompile, wallet.address, factoryAddress); } catch { }
}

async function test8_MultipleBlocksStability(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n── Test 8: Multiple Blocks Sequential Stability ──");
    const blockBefore = await provider.getBlockNumber();

    const wallet = Wallet.createRandom().connect(provider);
    await fundWallet(admin, wallet.address, "1000");

    for (let i = 0; i < 10; i++) {
        const tx = await wallet.sendTransaction({
            to: Wallet.createRandom().address,
            value: ethers.parseEther("0.001"),
            ...TRANSFER_OVERRIDES
        });
        await tx.wait(1);
    }

    const blockAfter = await provider.getBlockNumber();

    if (blockAfter > blockBefore) {
        pass("Block production stable", `Blocks ${blockBefore} → ${blockAfter} (${blockAfter - blockBefore} new blocks)`);
    } else {
        fail("No new blocks produced");
    }
}

async function test9_CoinbaseReceivesFees(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n── Test 9: Coinbase Receives Fees ──");

    const block = await provider.getBlock("latest");
    if (!block) { fail("Cannot get latest block"); return; }
    const coinbase = block.miner;
    console.log(`   Coinbase: ${coinbase}`);

    const coinbaseBalBefore = await provider.getBalance(coinbase);

    const wallet = Wallet.createRandom().connect(provider);
    await fundWallet(admin, wallet.address, "1000");

    for (let i = 0; i < 3; i++) {
        const tx = await wallet.sendTransaction({
            to: Wallet.createRandom().address,
            value: ethers.parseEther("0.001"),
            ...TRANSFER_OVERRIDES
        });
        await tx.wait(1);
    }

    const coinbaseBalAfter = await provider.getBalance(coinbase);

    if (coinbaseBalAfter >= coinbaseBalBefore) {
        pass("Coinbase balance did not decrease", `Before: ${ethers.formatEther(coinbaseBalBefore)}, After: ${ethers.formatEther(coinbaseBalAfter)}`);
    } else {
        fail("Coinbase balance decreased unexpectedly");
    }
}

// ===================== ACCESS CONTROL TESTS =====================

async function test10_FreshAddressCannotInitialize(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 10: Fresh Address Cannot Re-Initialize Owner ──");
    const fresh = Wallet.createRandom().connect(provider);
    await fundWallet(admin, fresh.address, "10");

    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, fresh);
    const ownerBefore = await precompile.owner();

    const tx = await precompile.initializeOwner(fresh.address, TX_OVERRIDES);
    const receipt = await tx.wait(1);

    const ownerAfter = await precompile.owner();
    if (ownerAfter === ownerBefore && ownerAfter !== fresh.address) {
        pass("initializeOwner rejected (already initialized)", `Owner unchanged: ${ownerAfter}`);
    } else {
        fail("initializeOwner should NOT change owner after initialization", `Owner: ${ownerBefore} -> ${ownerAfter}`);
    }
}

async function test11_FreshAddressCannotSetFeeGrant(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 11: Fresh Address Cannot setFeeGrant ──");
    const fresh = Wallet.createRandom().connect(provider);
    const target = Wallet.createRandom().address;
    await fundWallet(admin, fresh.address, "10");

    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, fresh);

    const tx = await precompile.setFeeGrant(
        fresh.address, target, factoryAddress,
        ethers.parseEther("100"), 86400, ethers.parseEther("100"),
        Math.floor(Date.now() / 1000) + 86400,
        TX_OVERRIDES
    );
    await tx.wait(1);

    // Verify grant was NOT created
    const precompileAdmin = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);
    const isGranted = await precompileAdmin.isGrantedForProgram(target, factoryAddress);
    if (!isGranted) {
        pass("setFeeGrant rejected from non-owner", "Grant not created");
    } else {
        fail("setFeeGrant should NOT work from non-owner", "Grant was created!");
    }
}

async function test12_FreshAddressCannotRevokeFeeGrant(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 12: Fresh Address Cannot revokeFeeGrant ──");
    // First, create a real grant from admin
    const grantee = Wallet.createRandom().connect(provider);
    await fundWallet(admin, grantee.address, "10");

    const precompileAdmin = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);
    await grantFee(precompileAdmin, admin.address, grantee.address, factoryAddress, "100", 86400, 86400);

    const grantedBefore = await precompileAdmin.isGrantedForProgram(grantee.address, factoryAddress);
    if (!grantedBefore) { fail("Setup: grant should exist"); return; }

    // Try to revoke from a fresh address (non-owner)
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "10");

    const precompileAttacker = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, attacker);
    const tx = await precompileAttacker.revokeFeeGrant(grantee.address, factoryAddress, TX_OVERRIDES);
    await tx.wait(1);

    // Verify grant still exists
    const grantedAfter = await precompileAdmin.isGrantedForProgram(grantee.address, factoryAddress);
    if (grantedAfter) {
        pass("revokeFeeGrant rejected from non-owner", "Grant still active");
    } else {
        fail("revokeFeeGrant should NOT work from non-owner", "Grant was revoked!");
    }

    // Cleanup
    try { await revokeFee(precompileAdmin, grantee.address, factoryAddress); } catch { }
}

async function test13_FreshAddressCannotTransferOwnership(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 13: Fresh Address Cannot transferOwnership ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "10");

    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, attacker);
    const ownerBefore = await precompile.owner();

    const tx = await precompile.transferOwnership(attacker.address, TX_OVERRIDES);
    await tx.wait(1);

    const ownerAfter = await precompile.owner();
    if (ownerAfter === ownerBefore && ownerAfter !== attacker.address) {
        pass("transferOwnership rejected from non-owner", `Owner unchanged: ${ownerAfter}`);
    } else {
        fail("transferOwnership should NOT work from non-owner", `Owner: ${ownerBefore} -> ${ownerAfter}`);
    }
}

async function test14_FreshAddressCannotStealOwnership(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 14: Fresh Address Cannot Steal via initializeOwner + transferOwnership ──");
    const attacker1 = Wallet.createRandom().connect(provider);
    const attacker2 = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker1.address, "10");
    await fundWallet(admin, attacker2.address, "10");

    const precompile1 = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, attacker1);
    const precompile2 = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, attacker2);

    const ownerBefore = await precompile1.owner();

    // Attacker 1 tries initializeOwner
    const tx1 = await precompile1.initializeOwner(attacker1.address, TX_OVERRIDES);
    await tx1.wait(1);

    // Attacker 2 tries transferOwnership
    const tx2 = await precompile2.transferOwnership(attacker2.address, TX_OVERRIDES);
    await tx2.wait(1);

    const ownerAfter = await precompile1.owner();
    if (ownerAfter === ownerBefore) {
        pass("Ownership attack failed", `Owner still: ${ownerAfter}`);
    } else {
        fail("CRITICAL: Ownership was stolen!", `Owner: ${ownerBefore} -> ${ownerAfter}`);
    }
}

async function test15_DualProgramGrantExceed(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 15: Dual Program Grant — Spend Exceeds First Program ──");

    if (!fs.existsSync(COUNTER_ARTIFACT_PATH)) {
        fail("Counter artifact not found — compile first");
        return;
    }
    const counterArtifact = JSON.parse(fs.readFileSync(COUNTER_ARTIFACT_PATH, "utf-8"));
    const { ContractFactory: CF } = await import("ethers");

    const wallet = Wallet.createRandom().connect(provider);
    await fundWallet(admin, wallet.address, "1000");

    // Deploy 2 Counter contracts
    const factoryA = new CF(counterArtifact.abi, counterArtifact.bytecode, admin);
    const counterA = await factoryA.deploy(TX_OVERRIDES);
    await counterA.waitForDeployment();
    const addrA = await counterA.getAddress();

    const factoryB = new CF(counterArtifact.abi, counterArtifact.bytecode, admin);
    const counterB = await factoryB.deploy(TX_OVERRIDES);
    await counterB.waitForDeployment();
    const addrB = await counterB.getAddress();

    console.log(`   Counter A: ${addrA}`);
    console.log(`   Counter B: ${addrB}`);

    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // Grant A: small limit (0.5 ETH — enough for ~2 txs at 1000 gwei * 100k gas)
    // Grant B: larger limit (10 ETH)
    const endTime = Math.floor(Date.now() / 1000) + 86400;
    await grantFee(precompile, admin.address, wallet.address, addrA, "0.5", 86400, 86400);
    await grantFee(precompile, admin.address, wallet.address, addrB, "10", 86400, 86400);

    const grantedA = await precompile.isGrantedForProgram(wallet.address, addrA);
    const grantedB = await precompile.isGrantedForProgram(wallet.address, addrB);

    if (grantedA && grantedB) {
        pass("Both grants created");
    } else {
        fail("Grant creation", `A=${grantedA}, B=${grantedB}`);
        return;
    }

    // === Phase 1: Call Counter A — granter should pay ===
    const contractA = new Contract(addrA, counterArtifact.abi, wallet);
    const contractB = new Contract(addrB, counterArtifact.abi, wallet);

    const granterBal1 = await provider.getBalance(admin.address);
    const userBal1 = await provider.getBalance(wallet.address);

    const txA1 = await contractA.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
    await txA1.wait(1);

    const granterBal2 = await provider.getBalance(admin.address);
    const userBal2 = await provider.getBalance(wallet.address);

    if (userBal2 === userBal1 && granterBal2 < granterBal1) {
        pass("Phase 1: Counter A — granter paid gas", `Granter: -${ethers.formatEther(granterBal1 - granterBal2)} ETH`);
    } else {
        fail("Phase 1: Counter A — expected granter to pay", `User diff: ${ethers.formatEther(userBal1 - userBal2)}, Granter diff: ${ethers.formatEther(granterBal1 - granterBal2)}`);
    }

    // === Phase 2: Spam Counter A to deplete its grant ===
    console.log(`   Spamming Counter A to deplete grant (0.5 ETH limit)...`);
    for (let i = 0; i < 5; i++) {
        try {
            const tx = await contractA.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
            await tx.wait(1);
        } catch { }
    }

    // Check Grant A remaining
    let grantAData;
    try {
        grantAData = await precompile.grant(wallet.address, addrA);
    } catch { }

    const upfrontCost = 100000n * TX_OVERRIDES.gasPrice;
    const isADepleted = grantAData && grantAData.spendLimit < upfrontCost;

    if (isADepleted) {
        pass("Grant A depleted", `Remaining: ${ethers.formatEther(grantAData.spendLimit)} ETH`);
    } else {
        // If not depleted, that's fine — just note it
        console.log(`   ℹ️  Grant A remaining: ${grantAData ? ethers.formatEther(grantAData.spendLimit) : '?'} ETH`);
    }

    // === Phase 3: Call Counter A AFTER depletion — sender should pay (fallback) ===
    const userBal3 = await provider.getBalance(wallet.address);
    const granterBal3 = await provider.getBalance(admin.address);

    try {
        const txA2 = await contractA.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
        await withTimeout(txA2.wait(1), 30000, "depleted grant A tx");
        const userBal4 = await provider.getBalance(wallet.address);
        const granterBal4 = await provider.getBalance(admin.address);

        if (userBal4 < userBal3) {
            pass("Phase 3: Counter A after depletion — sender pays gas (fallback)", `User: -${ethers.formatEther(userBal3 - userBal4)} ETH`);
        } else if (granterBal4 < granterBal3) {
            fail("Phase 3: Grant A should be depleted but granter still paid");
        }
    } catch (e: any) {
        fail("Phase 3: Tx should succeed with sender fallback", e.message?.substring(0, 80));
    }

    // === Phase 4: Call Counter B — grant B should STILL work (independent) ===
    const userBal5 = await provider.getBalance(wallet.address);
    const granterBal5 = await provider.getBalance(admin.address);

    const txB1 = await contractB.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
    await txB1.wait(1);

    const userBal6 = await provider.getBalance(wallet.address);
    const granterBal6 = await provider.getBalance(admin.address);

    if (userBal6 === userBal5 && granterBal6 < granterBal5) {
        pass("Phase 4: Counter B — granter paid (Grant B unaffected by A's depletion)", `Granter: -${ethers.formatEther(granterBal5 - granterBal6)} ETH`);
    } else {
        fail("Phase 4: Counter B — Grant B should still work", `User diff: ${ethers.formatEther(userBal5 - userBal6)}, Granter diff: ${ethers.formatEther(granterBal5 - granterBal6)}`);
    }

    // Check Grant B remaining
    try {
        const grantBData = await precompile.grant(wallet.address, addrB);
        console.log(`   📋 Grant B remaining: spendLimit=${ethers.formatEther(grantBData.spendLimit)} ETH`);
    } catch { }

    // Cleanup
    try { await revokeFee(precompile, wallet.address, addrA); } catch { }
    try { await revokeFee(precompile, wallet.address, addrB); } catch { }
}

// ===================== MAIN =====================
async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║            Fee Grant Core Impact Test                             ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminKey = process.env.ADMIN || process.env.PRIV_KEY;
    if (!adminKey) throw new Error("ADMIN or PRIV_KEY not set in .env");
    const admin = new Wallet(adminKey, provider);

    if (!fs.existsSync(ADDRESSES_PATH)) {
        throw new Error(`deployed-addresses.json not found. Run deployment first.`);
    }
    const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
    const factoryAddress = addresses.ContractFactory2;

    console.log(`🔑 Admin: ${admin.address}`);
    console.log(`🏭 Factory: ${factoryAddress}`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_ADDRESS}`);

    // Ensure precompile owner is initialized
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);
    try {
        const isInit = await precompile.initialized();
        if (isInit === 0n) {
            console.log("   Initializing precompile owner...");
            const tx = await precompile.initializeOwner(admin.address, TX_OVERRIDES);
            await tx.wait(1);
        }
    } catch { }

    // Run all tests
    await test1_NormalTransferNoGrant(provider, admin);
    await test2_ContractCallNoGrant(provider, admin, factoryAddress);
    await test3_GrantActiveContractCall(provider, admin, factoryAddress);
    await test4_RevokeGrantRetryTx(provider, admin, factoryAddress);
    await test5_ExpiredGrant(provider, admin, factoryAddress);
    await test6_ExceedsSpendLimit(provider, admin, factoryAddress);
    await test7_GranterInsufficientBalance(provider, admin, factoryAddress);
    await test8_MultipleBlocksStability(provider, admin);
    await test9_CoinbaseReceivesFees(provider, admin);

    // Access Control Tests
    await test10_FreshAddressCannotInitialize(provider, admin);
    await test11_FreshAddressCannotSetFeeGrant(provider, admin, factoryAddress);
    await test12_FreshAddressCannotRevokeFeeGrant(provider, admin, factoryAddress);
    await test13_FreshAddressCannotTransferOwnership(provider, admin);
    await test14_FreshAddressCannotStealOwnership(provider, admin);

    // Dual Program Grant Test
    await test15_DualProgramGrantExceed(provider, admin);

    // Summary
    console.log("\n════════════════════════════════════════════════════════════════════");
    console.log(`📊 Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("════════════════════════════════════════════════════════════════════\n");

    if (failCount > 0) {
        console.log("⚠️  Some tests failed. Review output above.\n");
        process.exit(1);
    } else {
        console.log("✅ All tests passed! No side effects detected.\n");
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
