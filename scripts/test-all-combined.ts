/**
 * Combined Precompile Test Suite
 *
 * Merges three test scripts into a single executable:
 *   SUITE A — Fee Grant Core Impact Tests (27 tests)
 *   SUITE B — Comprehensive Precompile Read Tests (6 precompiles)
 *   SUITE C — GasPrice Enforcement + Revenue Distribution (3 parts)
 *
 * Usage:
 *   npx tsx scripts/test-all-combined.ts
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
// All overrides include explicit gasLimit to bypass eth_estimateGas, which can
// reject valid transactions during simulation (e.g. sponsored or high-gas-price txs).
const TX_OVERRIDES = { type: 0, gasPrice: ethers.parseUnits("1000", "gwei"), gasLimit: 500000 };
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
    "function wildcard(address grantee) returns (bool)",
    "function isGrantedForAllProgram(address grantee) view returns (bool)",
];

const COUNTER_ARTIFACT_PATH = path.resolve(__dirname, "../artifacts/contracts/Counter.sol/Counter.json");

const FACTORY_ABI = [
    "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to) external returns (address)"
];

const FAST_TX_TIMEOUT_MS = 45_000;

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
    const tx = await admin.sendTransaction({ to: target, value: ethers.parseEther(amount), ...TRANSFER_OVERRIDES });
    await waitForReceipt(tx, `fundWallet:${target}`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`TIMEOUT: ${label} did not complete in ${ms / 1000}s`)), ms)
        )
    ]);
}

async function waitForReceipt(tx: { wait: (confirmations?: number) => Promise<any> }, label: string, confirmations = 1) {
    return withTimeout(tx.wait(confirmations), FAST_TX_TIMEOUT_MS, label);
}

async function waitForReceiptWithDiagnostics(
    provider: ethers.JsonRpcProvider,
    tx: ethers.TransactionResponse,
    label: string,
    confirmations = 1,
    timeoutMs = FAST_TX_TIMEOUT_MS
) {
    const sentAt = Date.now();
    console.log(`   🔎 ${label}: tx=${tx.hash} nonce=${tx.nonce} gasLimit=${tx.gasLimit?.toString?.() ?? "n/a"}`);

    const receiptPromise = tx.wait(confirmations);

    try {
        const receipt = await withTimeout(receiptPromise, timeoutMs, label);
        if (!receipt) {
            throw new Error(`${label} returned no receipt after wait()`);
        }
        console.log(`   🔎 ${label}: mined in block ${receipt.blockNumber}, status=${receipt.status}, waited=${((Date.now() - sentAt) / 1000).toFixed(1)}s`);
        return receipt;
    } catch (error: any) {
        // ethers throws TRANSACTION_REPLACED when a newer tx with the same nonce is mined.
        // If the replacement was NOT cancelled (i.e. it succeeded), use its receipt.
        if (error?.code === "TRANSACTION_REPLACED" && !error?.cancelled && error?.receipt) {
            const rep = error.receipt;
            console.log(`   🔎 ${label}: replaced-but-mined in block ${rep.blockNumber}, status=${rep.status}, waited=${((Date.now() - sentAt) / 1000).toFixed(1)}s`);
            return rep;
        }

        const latestBlock = await provider.getBlockNumber().catch(() => -1);
        const pendingTx = await provider.getTransaction(tx.hash).catch(() => null);
        const receipt = await provider.getTransactionReceipt(tx.hash).catch(() => null);

        const detailParts = [
            `tx=${tx.hash}`,
            `latestBlock=${latestBlock}`,
            `providerTx=${pendingTx ? "found" : "missing"}`,
            `providerReceipt=${receipt ? `found(status=${receipt.status}, block=${receipt.blockNumber})` : "missing"}`,
            `waited=${((Date.now() - sentAt) / 1000).toFixed(1)}s`
        ];

        if (pendingTx) {
            detailParts.push(`txBlock=${pendingTx.blockNumber ?? "pending"}`);
            detailParts.push(`txNonce=${pendingTx.nonce}`);
            detailParts.push(`from=${pendingTx.from}`);
            detailParts.push(`to=${pendingTx.to ?? "contract-creation"}`);
        }

        throw new Error(`${error.message} | ${detailParts.join(" | ")}`);
    }
}

/**
 * Flush any pending transactions for a wallet by sending a 0-value self-transfer at the
 * current pending nonce, then waiting for it. This clears stuck mempool entries left by
 * timed-out tests so subsequent tests start with a clean nonce sequence.
 */
async function flushPendingTxs(wallet: Wallet, provider: ethers.JsonRpcProvider) {
    const latestNonce = await provider.getTransactionCount(wallet.address, "latest");
    const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
    if (pendingNonce <= latestNonce) return; // nothing pending

    console.log(`   🧹 Flushing ${pendingNonce - latestNonce} pending tx(s) for ${wallet.address.slice(0, 10)}…`);
    // Send a no-op self-transfer at each pending slot to evict stuck txs.
    for (let n = latestNonce; n < pendingNonce; n++) {
        try {
            const flushTx = await wallet.sendTransaction({
                to: wallet.address,
                value: 0n,
                nonce: n,
                ...TRANSFER_OVERRIDES,
                // Raise gasPrice slightly to beat any stuck tx at this nonce.
                gasPrice: TX_OVERRIDES.gasPrice * 2n,
            });
            await withTimeout(flushTx.wait(1).catch(() => null), 20000, `flush nonce ${n}`);
        } catch { /* ignore replacement/timeout errors during flush */ }
    }
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
    const currentBlock = await precompile.runner!.provider!.getBlockNumber();
    const endTime = currentBlock + endTimeOffset;
    const tx = await precompile.setFeeGrant(
        granter, grantee, program, spendLimit, periodSeconds, periodLimit, endTime,
        TX_OVERRIDES
    );
    await waitForReceipt(tx, `grantFee:${program}`);
}

async function revokeFee(precompile: Contract, grantee: string, program: string) {
    const tx = await precompile.revokeFeeGrant(grantee, program, TX_OVERRIDES);
    await waitForReceipt(tx, `revokeFee:${program}`);
}

// ===================== PRECOMPILE READ-TEST CONFIG (Suite B) =====================
const PRECOMPILES = {
    NATIVE_MINTER: "0x0000000000000000000000000000000000001001",
    ADDRESS_REGISTRY: "0x0000000000000000000000000000000000001002",
    GAS_PRICE: "0x0000000000000000000000000000000000001003",
    REVENUE_RATIO: "0x0000000000000000000000000000000000001004",
    TREASURY_REGISTRY: "0x0000000000000000000000000000000000001005",
    GAS_FEE_GRANT: "0x0000000000000000000000000000000000001006",
};

// ABIs for each precompile
const ABIS = {
    NATIVE_MINTER: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function totalsupply() view returns (uint256)",
        "function mint(address to, uint256 value) returns (bool, string)",
    ],
    ADDRESS_REGISTRY: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function contains(address account) view returns (bool)",
        "function addToRegistry(address account) returns (bool)",
        "function removeFromRegistry(address account) returns (bool)",
    ],
    GAS_PRICE: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function gasPrice() view returns (uint256)",
        "function status() view returns (bool)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setGasPrice(uint256 price) returns (bool)",
    ],
    REVENUE_RATIO: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function status() view returns (bool)",
        "function senderRatio() view returns (uint256)",
        "function coinbaseRatio() view returns (uint256)",
        "function providerRatio() view returns (uint256)",
        "function treasuryRatio() view returns (uint256)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setRevenueRatio(uint8 contractRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)",
    ],
    TREASURY_REGISTRY: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function treasuryAt() view returns (address)",
        "function setTreasury(address treasury) returns (bool)",
    ],
    GAS_FEE_GRANT: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        "function grant(address grantee, address program) view returns (address granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function revokeFeeGrant(address grantee, address program) returns (bool)",
        "function periodCanSpend(address grantee, address program) view returns (uint256)",
    ],
};

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    details?: any;
}

async function testPrecompile(
    name: string,
    testFn: () => Promise<TestResult[]>
): Promise<{ name: string; results: TestResult[] }> {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  Testing: ${name}`);
    console.log(`${"═".repeat(70)}`);

    try {
        const results = await testFn();
        return { name, results };
    } catch (e: any) {
        return {
            name,
            results: [{ name: "Connection", passed: false, message: e.shortMessage || e.message }],
        };
    }
}

// ===================== GASPRICE + REVENUE CONFIG (Suite C) =====================
// ── Precompile addresses ────────────────────────────────────────────────────
const GAS_PRICE_ADDR      = "0x0000000000000000000000000000000000001003";
const REVENUE_RATIO_ADDR  = "0x0000000000000000000000000000000000001004";
const TREASURY_REG_ADDR   = "0x0000000000000000000000000000000000001005";

// ── ABIs ────────────────────────────────────────────────────────────────────
const GAS_PRICE_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
    "function status() view returns (bool)",
    "function gasPrice() view returns (uint256)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function setGasPrice(uint256 price) returns (bool)",
];

const REVENUE_RATIO_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
    "function status() view returns (bool)",
    "function senderRatio() view returns (uint256)",
    "function coinbaseRatio() view returns (uint256)",
    "function providerRatio() view returns (uint256)",
    "function treasuryRatio() view returns (uint256)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function setRevenueRatio(uint8 senderRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)",
];

const TREASURY_REG_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
    "function treasuryAt() view returns (address)",
    "function setTreasury(address) returns (bool)",
    "function providerAt() view returns (address)",
    "function setProvider(address) returns (bool)",
];

// ── Suite C assertion helper (uses unified passCount/failCount) ─────────────
const failures: string[] = [];

function assertCondition(condition: boolean, label: string) {
    if (condition) {
        console.log(`      ✅ PASS: ${label}`);
        passCount++;
    } else {
        console.log(`      ❌ FAIL: ${label}`);
        failCount++;
        failures.push(label);
    }
}

function section(title: string) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${"─".repeat(70)}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Ensure a precompile is initialized and owned by `owner`. Returns false if we are not the owner. */
async function ensureInit(contract: ethers.Contract, ownerAddr: string, txOpts: object): Promise<boolean> {
    const isInit: boolean = await contract.initialized();
    if (!isInit) {
        const tx = await contract.initializeOwner(ownerAddr, txOpts);
        await tx.wait(1);
    }
    const storedOwner: string = await contract.owner();
    return storedOwner.toLowerCase() === ownerAddr.toLowerCase();
}

/** Send a bare ETH transfer using raw gasPrice (legacy tx type 0) and return the receipt. */
async function sendLegacyTx(
    provider: ethers.JsonRpcProvider,
    wallet: ethers.Wallet,
    to: string,
    gasPriceWei: bigint,
    gasLimit = 21_000n,
): Promise<ethers.TransactionReceipt | null> {
    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    const network = await provider.getNetwork();
    const tx = await wallet.sendTransaction({
        to,
        value: 0n,
        gasLimit,
        gasPrice: gasPriceWei,
        nonce,
        type: 0,
        chainId: network.chainId,
    });
    return tx.wait(1);
}

/** Attempt a tx that is expected to be excluded from block production (floor enforcement).
 *
 *  Two-phase check:
 *   Phase 1 — if sendTransaction throws immediately → mempool-level rejection → PASS (ideal)
 *   Phase 2 — if tx hash returned, poll until `minExclusionBlocks` are produced and receipt
 *              is still null → block-level enforcement confirmed → PASS (current behaviour)
 *
 *  IMPORTANT: use a dedicated wallet that is NOT shared with other tests. Stuck txs leave
 *  a pending nonce that would block subsequent txs from the same wallet.
 */
async function expectNotMined(
    provider: ethers.JsonRpcProvider,
    wallet: ethers.Wallet,
    to: string,
    gasPriceWei: bigint,
    label: string,
    minExclusionBlocks = 3,
    timeoutMs = 60_000,
): Promise<void> {
    let txHash: string | undefined;

    try {
        const nonce = await provider.getTransactionCount(wallet.address, "pending");
        const network = await provider.getNetwork();
        const response = await wallet.sendTransaction({
            to, value: 0n, gasLimit: 21_000n,
            gasPrice: gasPriceWei, nonce, type: 0,
            chainId: network.chainId,
        });
        txHash = response.hash;
    } catch (e: any) {
        // Mempool-level rejection — ideal early enforcement
        const msg: string = (e?.message ?? "") + (e?.info?.error?.message ?? "");
        const isGasPriceError = msg.toLowerCase().includes("too low")
            || msg.toLowerCase().includes("price")
            || msg.toLowerCase().includes("underpriced")
            || msg.toLowerCase().includes("below");
        assertCondition(isGasPriceError,
            `${label} — rejected at mempool (got: "${msg.slice(0, 120)}")`);
        return;
    }

    // Tx entered mempool — confirm it stays unincluded for `minExclusionBlocks`
    const startBlock = await provider.getBlockNumber();
    const deadline   = Date.now() + timeoutMs;
    let blocksObserved = 0;

    while (Date.now() < deadline) {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt !== null) {
            assertCondition(false, `${label} — tx was included in block ${receipt.blockNumber} despite underpricing`);
            return;
        }
        const currentBlock = await provider.getBlockNumber();
        blocksObserved = currentBlock - startBlock;
        if (blocksObserved >= minExclusionBlocks) {
            assertCondition(true,
                `${label} — excluded from ${blocksObserved} consecutive blocks (floor enforced at block-build time)`);
            return;
        }
        await new Promise(r => setTimeout(r, 2_000));
    }
    assertCondition(false, `${label} — timed out waiting for ${minExclusionBlocks} blocks to confirm exclusion (only saw ${blocksObserved})`);
}

// ===================== SUITE A: FEE GRANT TESTS =====================
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
    const isGranted = await precompile.isGrantedForProgram(wallet.address, factoryAddress);
    const grantData = await precompile.grant(wallet.address, factoryAddress);
    if (!isGranted || grantData.allowance === 0n) {
        fail(
            "Setup: grant should exist before sponsored contract call",
            `isGranted=${isGranted}, allowance=${grantData.allowance.toString()}, spendLimit=${grantData.spendLimit.toString()}`
        );
        return;
    }

    const granteeBalanceBefore = await provider.getBalance(wallet.address);
    const granterBalanceBefore = await provider.getBalance(admin.address);

    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    const estimatedGas = await factory.createERC20.estimateGas(
        "TestGranted",
        "TGR",
        18,
        1000,
        wallet.address,
        CONTRACT_OVERRIDES
    );
    const gasLimit = (estimatedGas * 12n) / 10n;
    console.log(`   🔎 test3 granted contract call: estimatedGas=${estimatedGas.toString()} bufferedGasLimit=${gasLimit.toString()}`);

    const tx = await factory.createERC20(
        "TestGranted",
        "TGR",
        18,
        1000,
        wallet.address,
        { ...CONTRACT_OVERRIDES, gasLimit }
    );
    await waitForReceiptWithDiagnostics(provider, tx, "test3 granted contract call");

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

    // Create grant with 1 wei spend limit — too low for any gas.
    // endTime is block-number-based (isExpired checks blockNumber >= endTime).
    // Use currentBlock + 100000 as a far-future block to keep the grant live.
    const currentBlock6 = await provider.getBlockNumber();
    const txGrant = await precompile.setFeeGrant(
        admin.address, wallet.address, factoryAddress,
        1n, 86400, 1n, currentBlock6 + 100000, // 1 wei spend limit; endTime = far future block
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

    // Grant with poorGranter as the granter address (has 0 ETH).
    // endTime is block-number-based; use currentBlock + 100000 as a far-future block.
    const spendLimit = ethers.parseEther("1000");
    const currentBlock7 = await provider.getBlockNumber();
    const txGrant = await precompile.setFeeGrant(
        poorGranter.address, wallet.address, factoryAddress,
        spendLimit, 86400, spendLimit, currentBlock7 + 100000,
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

    if (coinbaseBalAfter > coinbaseBalBefore) {
        pass("Coinbase balance increased (fees received)", `Before: ${ethers.formatEther(coinbaseBalBefore)}, After: ${ethers.formatEther(coinbaseBalAfter)}`);
    } else {
        fail("Coinbase balance should have increased after receiving tx fees", `Before: ${ethers.formatEther(coinbaseBalBefore)}, After: ${ethers.formatEther(coinbaseBalAfter)}`);
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

    // Grant A: small limit (0.12 ETH — just above the upfront check of 0.1 ETH)
    // The upfront check uses gasLimit × gasPrice = 100k × 1000 gwei = 0.1 ETH
    // After 1 tx deducting ~0.044 ETH actual cost, remaining ~0.076 ETH < 0.1 → grant depleted
    // Note: Counter.inc() uses ~26k gas × 1000 gwei = ~0.026 ETH actual cost per tx
    // Grant B: larger limit (10 ETH)
    const endTime = Math.floor(Date.now() / 1000) + 86400;
    await grantFee(precompile, admin.address, wallet.address, addrA, "0.12", 86400, 86400);
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
    console.log(`   Spamming Counter A to deplete grant (0.12 ETH spendLimit)...`);
    for (let i = 0; i < 10; i++) {
        try {
            const tx = await contractA.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
            await tx.wait(1);
        } catch { }
    }

    // spendLimit is a live decremented budget (updateFeeGrantBudgetAfterExecution writes slot+2
    // after each sponsored tx). After enough sponsored txs the remaining spendLimit drops below
    // the upfrontGasCost threshold, causing enforceFeeGrantBudget to fall back to the sender.
    let grantAData;
    try {
        grantAData = await precompile.grant(wallet.address, addrA);
    } catch { }
    if (grantAData) {
        console.log(`   📋 Grant A remaining spendLimit: ${ethers.formatEther(grantAData.spendLimit)} ETH`);
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
            pass("Grant A exhausted for current tx pricing", "Processor fell back to sender payment");
            pass("Phase 3: Counter A after depletion — sender pays gas (fallback)", `User: -${ethers.formatEther(userBal3 - userBal4)} ETH`);
        } else if (granterBal4 < granterBal3) {
            fail("Phase 3: Grant A should be depleted but granter still paid");
        } else {
            fail("Phase 3: Expected either sender or granter to pay gas");
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

async function test16_WildcardGrantMulticall(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 16: Wildcard Grant — Zero Balance Multicall ──");

    if (!fs.existsSync(COUNTER_ARTIFACT_PATH)) {
        fail("Counter artifact not found — compile first");
        return;
    }
    const counterArtifact = JSON.parse(fs.readFileSync(COUNTER_ARTIFACT_PATH, "utf-8"));
    const { ContractFactory: CF } = await import("ethers");

    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);
    const wallet = Wallet.createRandom().connect(provider);
    const recipient = Wallet.createRandom().address;

    // Verify wallet starts with 0 balance
    const startBal = await provider.getBalance(wallet.address);
    console.log(`   Wallet: ${wallet.address} (balance: ${ethers.formatEther(startBal)} ETH)`);

    // Deploy a Counter for the wallet to call later
    const counterFactory = new CF(counterArtifact.abi, counterArtifact.bytecode, admin);
    const counter = await counterFactory.deploy(TX_OVERRIDES);
    await counter.waitForDeployment();
    const counterAddr = await counter.getAddress();
    console.log(`   Counter: ${counterAddr}`);

    // === Phase 1: Grant wildcard ===
    const txWild = await precompile.wildcard(wallet.address, TX_OVERRIDES);
    await txWild.wait(1);

    const isGranted = await precompile.isGrantedForAllProgram(wallet.address);
    if (isGranted) {
        pass("Wildcard granted to zero-balance wallet");
    } else {
        fail("Wildcard grant failed");
        return;
    }

    // === Phase 2: Multicall with wildcard (granter = admin) ===
    const granterBal1 = await provider.getBalance(admin.address);

    // 2a: Native transfer
    try {
        const tx = await wallet.sendTransaction({
            to: recipient,
            value: 0,
            ...TRANSFER_OVERRIDES
        });
        await withTimeout(tx.wait(1), 30000, "wildcard transfer");
        pass("Wildcard: native transfer (0 value) — granter paid");
    } catch (e: any) {
        fail("Wildcard: native transfer failed", e.message?.substring(0, 80));
    }

    // 2b: Contract call (Counter.inc)
    try {
        const counterWallet = new Contract(counterAddr, counterArtifact.abi, wallet);
        const tx = await counterWallet.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
        await withTimeout(tx.wait(1), 30000, "wildcard counter.inc");
        pass("Wildcard: contract call (Counter.inc) — granter paid");
    } catch (e: any) {
        fail("Wildcard: contract call failed", e.message?.substring(0, 80));
    }

    // 2c: Contract creation (deploy Counter from wallet)
    try {
        const walletFactory = new CF(counterArtifact.abi, counterArtifact.bytecode, wallet);
        const newCounter = await walletFactory.deploy({ ...TX_OVERRIDES, gasLimit: 1000000 });
        await newCounter.waitForDeployment();
        const newAddr = await newCounter.getAddress();
        pass("Wildcard: contract creation — granter paid", `Deployed at: ${newAddr}`);
    } catch (e: any) {
        fail("Wildcard: contract creation failed", e.message?.substring(0, 80));
    }

    // 2d: ERC20 mint via ContractFactory
    try {
        const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
        const tx = await factory.createERC20("WildcardToken", "WCT", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
        await withTimeout(tx.wait(1), 30000, "wildcard erc20 mint");
        pass("Wildcard: ERC20 mint via factory — granter paid");
    } catch (e: any) {
        fail("Wildcard: ERC20 mint failed", e.message?.substring(0, 80));
    }

    const granterBal2 = await provider.getBalance(admin.address);
    const walletBal2 = await provider.getBalance(wallet.address);
    console.log(`   📋 Granter spent: ${ethers.formatEther(granterBal1 - granterBal2)} ETH`);
    console.log(`   📋 Wallet balance still: ${ethers.formatEther(walletBal2)} ETH`);

    if (granterBal2 < granterBal1) {
        pass("Granter paid for all wildcard operations");
    } else {
        fail("Granter should have paid for wildcard operations");
    }

    // === Phase 3: Revoke wildcard ===
    const ZERO_PROGRAM = "0x0000000000000000000000000000000000000000";
    const txRevoke = await precompile.revokeFeeGrant(wallet.address, ZERO_PROGRAM, TX_OVERRIDES);
    await txRevoke.wait(1);

    const isStillGranted = await precompile.isGrantedForAllProgram(wallet.address);
    if (!isStillGranted) {
        pass("Wildcard revoked successfully");
    } else {
        fail("Wildcard should have been revoked");
    }

    // === Phase 4: Retry multicall after revoke (should fail — 0 balance, no grant) ===
    console.log(`   Retrying operations after revoke (expect failures)...`);
    let postRevokePass = true;

    // 4a: Native transfer — should fail (0 balance, no grant)
    try {
        const tx = await wallet.sendTransaction({
            to: recipient,
            value: 0,
            ...TRANSFER_OVERRIDES
        });
        await withTimeout(tx.wait(1), 15000, "post-revoke transfer");
        // Wallet has 0 ETH and no grant — if the tx was somehow mined, nobody should have
        // paid gas from the wallet (balance cannot go negative). This is an unexpected outcome.
        fail("Post-revoke: transfer should have been rejected (0 balance, no grant)");
        postRevokePass = false;
    } catch {
        pass("Post-revoke: transfer correctly rejected (insufficient funds)");
    }

    // 4b: Contract call — should fail
    try {
        const counterWallet = new Contract(counterAddr, counterArtifact.abi, wallet);
        const tx = await counterWallet.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
        await withTimeout(tx.wait(1), 15000, "post-revoke contract call");
        fail("Post-revoke: contract call should have failed");
        postRevokePass = false;
    } catch {
        pass("Post-revoke: contract call correctly rejected");
    }

    if (postRevokePass) {
        pass("Post-revoke verification complete — wildcard fully revoked");
    }
}

async function test17_WildcardLazyCleanupPoorGranter(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 17: Wildcard Lazy Cleanup — Poor Granter ──");

    const wallet = Wallet.createRandom().connect(provider);
    const recipient = Wallet.createRandom().address;
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // Fund sender enough to pay after fallback.
    await fundWallet(admin, wallet.address, "0.2");

    // Create a real wildcard first while the owner/granter is healthy.
    const txGrant = await precompile.wildcard(wallet.address, TX_OVERRIDES);
    await txGrant.wait(1);

    const grantedBefore = await precompile.isGrantedForAllProgram(wallet.address);
    if (!grantedBefore) {
        fail("Setup failed: wildcard should exist before lazy cleanup test");
        return;
    }

    // Drain owner balance below the 1 ETH threshold so the runtime lazy-revokes on use.
    const adminBalCurrent = await provider.getBalance(admin.address);
    const keepWei = ethers.parseEther("0.5");
    if (adminBalCurrent <= keepWei) {
        fail("Setup failed: admin balance already below threshold", `Balance: ${ethers.formatEther(adminBalCurrent)} ETH`);
        return;
    }

    const drainTx = await admin.sendTransaction({
        to: recipient,
        value: adminBalCurrent - keepWei,
        ...TRANSFER_OVERRIDES,
    });
    await waitForReceipt(drainTx, "test17 drain owner below threshold");

    const userBalBefore = await provider.getBalance(wallet.address);
    const granterBalBefore = await provider.getBalance(admin.address);

    const tx = await wallet.sendTransaction({
        to: recipient,
        value: 0,
        ...TRANSFER_OVERRIDES
    });
    await withTimeout(tx.wait(1), 30000, "wildcard lazy cleanup tx");

    const userBalAfter = await provider.getBalance(wallet.address);
    const granterBalAfter = await provider.getBalance(admin.address);
    const grantedAfter = await precompile.isGrantedForAllProgram(wallet.address);
    const grantDataAfter = await precompile.grant(wallet.address, ethers.ZeroAddress);
    const feeGrantFlagSlot = "0x330bb6449068d17e3815a045685a05a106741a6e960986b3c72eb86cb692da00";
    const walletGrantFlag = await provider.getStorage(wallet.address, feeGrantFlagSlot);

    if (userBalAfter < userBalBefore) {
        pass("Lazy cleanup fallback charged sender", `User paid: ${ethers.formatEther(userBalBefore - userBalAfter)} ETH`);
    } else {
        fail("Sender should pay after poor granter lazy cleanup");
    }

    if (granterBalAfter === granterBalBefore) {
        pass("Below-threshold owner did not pay after lazy cleanup trigger");
    } else {
        fail("Below-threshold owner should not pay after lazy cleanup", `Diff: ${ethers.formatEther(granterBalBefore - granterBalAfter)} ETH`);
    }

    if (!grantedAfter && grantDataAfter.allowance === 0n && BigInt(walletGrantFlag) === 0n) {
        pass("Wildcard grant cleared lazily on first attempted use");
    } else {
        fail(
            "Wildcard grant should be cleared after lazy cleanup trigger",
            `isGranted=${grantedAfter}, allowance=${grantDataAfter.allowance.toString()}, flag=${walletGrantFlag}`
        );
    }

    // ── Restore admin balance via NativeMinter so subsequent tests can function ──
    const NATIVE_MINTER_ADDRESS = "0x0000000000000000000000000000000000001001";
    const NATIVE_MINTER_ABI = ["function mint(address to, uint256 value) returns (bool, string)"];
    const minter = new Contract(NATIVE_MINTER_ADDRESS, NATIVE_MINTER_ABI, admin);
    const mintAmount = ethers.parseEther("90000");
    const mintTx = await minter.mint(admin.address, mintAmount, { ...TX_OVERRIDES, gasLimit: 200000 });
    await waitForReceipt(mintTx, "test17 restore admin balance via NativeMinter");
    const restoredBal = await provider.getBalance(admin.address);
    console.log(`   🔄 Admin balance restored to ${ethers.formatEther(restoredBal)} ETH via NativeMinter`);
}

async function test18_WildcardCleanupPersists(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 18: Wildcard Cleanup Persists Across Follow-up Tx ──");

    const wallet = Wallet.createRandom().connect(provider);
    const recipient = Wallet.createRandom().address;
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, wallet.address, "0.2");

    // create then explicitly remove wildcard to simulate already-cleaned state persistence
    const txWild = await precompile.wildcard(wallet.address, TX_OVERRIDES);
    await txWild.wait(1);
    const txRevoke = await precompile.revokeFeeGrant(wallet.address, ethers.ZeroAddress, TX_OVERRIDES);
    await txRevoke.wait(1);

    const grantedBefore = await precompile.isGrantedForAllProgram(wallet.address);
    if (grantedBefore) {
        fail("Setup failed: wildcard should already be cleared before persistence check");
        return;
    }

    const balBefore = await provider.getBalance(wallet.address);
    const tx = await wallet.sendTransaction({
        to: recipient,
        value: 0,
        ...TRANSFER_OVERRIDES
    });
    await withTimeout(tx.wait(1), 30000, "post-cleanup follow-up tx");
    const balAfter = await provider.getBalance(wallet.address);

    if (balAfter < balBefore) {
        pass("Follow-up tx paid by sender after cleanup persisted", `Gas cost: ${ethers.formatEther(balBefore - balAfter)} ETH`);
    } else {
        fail("Sender should continue paying after wildcard cleanup persistence");
    }
}

async function test19_WildcardLazyCleanupPerGrantee(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 19: Wildcard Lazy Cleanup Is Per-Grantee ──");

    const granteeA = Wallet.createRandom().connect(provider);
    const granteeB = Wallet.createRandom().connect(provider);
    const recipient = Wallet.createRandom().address;
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    await fundWallet(admin, granteeA.address, "0.2");

    const txWildA = await precompile.wildcard(granteeA.address, TX_OVERRIDES);
    await txWildA.wait(1);
    const txWildB = await precompile.wildcard(granteeB.address, TX_OVERRIDES);
    await txWildB.wait(1);

    // Trigger cleanup on grantee A by revoking its wildcard, while B should stay granted
    const txRevokeA = await precompile.revokeFeeGrant(granteeA.address, ethers.ZeroAddress, TX_OVERRIDES);
    await txRevokeA.wait(1);

    const grantA = await precompile.isGrantedForAllProgram(granteeA.address);
    const grantB = await precompile.isGrantedForAllProgram(granteeB.address);

    if (!grantA) {
        pass("Grantee A wildcard cleared");
    } else {
        fail("Grantee A wildcard should be cleared");
    }

    if (grantB) {
        pass("Grantee B wildcard remains active");
    } else {
        fail("Grantee B wildcard should remain unaffected");
        return;
    }

    const balBeforeB = await provider.getBalance(granteeB.address);
    const adminBalBefore = await provider.getBalance(admin.address);

    const nonceB = await provider.getTransactionCount(granteeB.address);
    const signedTx = await granteeB.signTransaction({
        chainId: Number((await provider.getNetwork()).chainId),
        nonce: nonceB,
        to: recipient,
        value: 0n,
        ...TRANSFER_OVERRIDES
    });
    const tx = await provider.broadcastTransaction(signedTx);
    await withTimeout(tx.wait(1), 30000, "per-grantee unaffected tx");

    const balAfterB = await provider.getBalance(granteeB.address);
    const adminBalAfter = await provider.getBalance(admin.address);

    if (balAfterB === balBeforeB && adminBalAfter < adminBalBefore) {
        pass("Unaffected grantee still uses wildcard sponsorship");
    } else {
        fail("Other grantee should remain sponsored", `User diff: ${ethers.formatEther(balBeforeB - balAfterB)}, Admin diff: ${ethers.formatEther(adminBalBefore - adminBalAfter)}`);
    }

    // Cleanup B
    try { await revokeFee(precompile, granteeB.address, ethers.ZeroAddress); } catch { }
}

async function test20_FreshGrantZeroBalanceCoverage(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 20: Fresh Zero-Balance Sender Uses Grant Across Tx Types ──");

    if (!fs.existsSync(COUNTER_ARTIFACT_PATH)) {
        fail("Counter artifact not found — compile first");
        return;
    }

    const counterArtifact = JSON.parse(fs.readFileSync(COUNTER_ARTIFACT_PATH, "utf-8"));
    const { ContractFactory: CF } = await import("ethers");

    const wallet = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    const startBal = await provider.getBalance(wallet.address);
    if (startBal === 0n) {
        pass("Setup: fresh sender starts with zero balance");
    } else {
        fail("Setup: fresh sender should start with zero balance", `Balance: ${ethers.formatEther(startBal)} ETH`);
        return;
    }

    // Sanity: without grant, factory creation should fail for zero-balance sender
    const factoryNoGrant = new Contract(factoryAddress, FACTORY_ABI, wallet);
    try {
        const tx = await factoryNoGrant.createERC20("NoGrant", "NOG", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
        await withTimeout(tx.wait(1), 15000, "sanity no-grant tx");
        fail("Sanity check without grant should fail for zero-balance sender");
        return;
    } catch {
        pass("Sanity check without grant rejected for zero-balance sender");
    }

    // Deploy a target contract from admin so we can test a second granted program after creation
    const counterFactory = new CF(counterArtifact.abi, counterArtifact.bytecode, admin);
    const counter = await counterFactory.deploy(TX_OVERRIDES);
    await counter.waitForDeployment();
    const counterAddr = await counter.getAddress();

    // Create grants for both programs from the actual owner-admin
    await grantFee(precompile, admin.address, wallet.address, factoryAddress, "1000", 86400, 86400);
    await grantFee(precompile, admin.address, wallet.address, counterAddr, "1000", 86400, 86400);

    const grantFactoryBefore = await precompile.grant(wallet.address, factoryAddress);
    const grantCounterBefore = await precompile.grant(wallet.address, counterAddr);

    const factoryGranted = await precompile.isGrantedForProgram(wallet.address, factoryAddress);
    const counterGranted = await precompile.isGrantedForProgram(wallet.address, counterAddr);
    if (factoryGranted && counterGranted) {
        pass("Setup: both zero-balance sender grants created");
    } else {
        fail("Setup: expected both grants to exist", `factory=${factoryGranted}, counter=${counterGranted}`);
        return;
    }

    const granterBalBefore = await provider.getBalance(admin.address);

    // Phase 1: zero-balance sender uses grant for factory createERC20
    const factory = new Contract(factoryAddress, FACTORY_ABI, wallet);
    try {
        const tx = await factory.createERC20("GrantBacked", "GBK", 18, 1000, wallet.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx, "test20 factory createERC20", 1, 30000);
        pass("Zero-balance sender deployed ERC20 via grant");
    } catch (e: any) {
        fail("Zero-balance sender should deploy ERC20 via grant", e.message?.substring(0, 160));
    }

    // Phase 2: zero-balance sender calls existing counter via separate grant
    const counterWallet = new Contract(counterAddr, counterArtifact.abi, wallet);
    try {
        const tx = await counterWallet.inc({ ...TX_OVERRIDES, gasLimit: 100000 });
        await waitForReceiptWithDiagnostics(provider, tx, "test20 counter interaction", 1, 30000);
        pass("Zero-balance sender called target contract via grant");
    } catch (e: any) {
        fail("Zero-balance sender should call contract via grant", e.message?.substring(0, 160));
    }

    const walletBalAfter = await provider.getBalance(wallet.address);
    const granterBalAfter = await provider.getBalance(admin.address);
    const grantFactoryAfter = await precompile.grant(wallet.address, factoryAddress);
    const grantCounterAfter = await precompile.grant(wallet.address, counterAddr);

    if (walletBalAfter === 0n) {
        pass("Zero-balance sender stayed unfunded while using grant");
    } else {
        fail("Sender should remain at zero balance when grant covers gas", `Balance: ${ethers.formatEther(walletBalAfter)} ETH`);
    }

    if (granterBalAfter < granterBalBefore) {
        pass("Granter paid for zero-balance sender operations", `Diff: ${ethers.formatEther(granterBalBefore - granterBalAfter)} ETH`);
    } else {
        fail("Granter should pay for zero-balance sender operations");
    }

    if (grantFactoryAfter.spendLimit < grantFactoryBefore.spendLimit || grantFactoryAfter.periodCanSpend < grantFactoryBefore.periodCanSpend) {
        pass(
            "Test 20 / Factory grant accounting decremented",
            `spendLimit: ${ethers.formatEther(grantFactoryBefore.spendLimit)} -> ${ethers.formatEther(grantFactoryAfter.spendLimit)} ETH`
        );
    } else {
        fail(
            "Test 20 / Factory grant accounting should decrement after sponsored spend",
            `spendLimit: ${ethers.formatEther(grantFactoryBefore.spendLimit)} -> ${ethers.formatEther(grantFactoryAfter.spendLimit)} ETH`
        );
    }

    if (grantCounterAfter.spendLimit < grantCounterBefore.spendLimit || grantCounterAfter.periodCanSpend < grantCounterBefore.periodCanSpend) {
        pass(
            "Test 20 / Counter grant accounting decremented",
            `spendLimit: ${ethers.formatEther(grantCounterBefore.spendLimit)} -> ${ethers.formatEther(grantCounterAfter.spendLimit)} ETH`
        );
    } else {
        fail(
            "Test 20 / Counter grant accounting should decrement after sponsored spend",
            `spendLimit: ${ethers.formatEther(grantCounterBefore.spendLimit)} -> ${ethers.formatEther(grantCounterAfter.spendLimit)} ETH`
        );
    }

    try { await revokeFee(precompile, wallet.address, factoryAddress); } catch { }
    try { await revokeFee(precompile, wallet.address, counterAddr); } catch { }
}

// ===================== TESTS 21-27 =====================

async function test21_UnlimitedSpendLimit(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 21: Unlimited Spend Limit (spendLimit=0) ──");

    const grantee = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // spendLimit=0 means unlimited budget. The precompile rejects spendLimit=0 AND endTime=0
    // simultaneously (both-unlimited guard), so we set a far-future endTime.
    const currentBlock21 = await provider.getBlockNumber();
    const farEndTime = currentBlock21 + 100000;
    // period=0 + periodLimit=0 means no per-period cap (allowance=1 type)
    const txGrant = await precompile.setFeeGrant(
        admin.address, grantee.address, factoryAddress,
        0, 0, 0, farEndTime,
        TX_OVERRIDES
    );
    await waitForReceipt(txGrant, "test21 setFeeGrant unlimited");

    const grantData = await precompile.grant(grantee.address, factoryAddress);
    if (grantData.spendLimit === 0n && grantData.allowance === 1n) {
        pass("Unlimited grant created with spendLimit=0, allowance=1");
    } else {
        fail("Expected spendLimit=0, allowance=1 for unlimited grant", `spendLimit=${grantData.spendLimit}, allowance=${grantData.allowance}`);
        return;
    }

    const granterBal0 = await provider.getBalance(admin.address);

    // First sponsored tx
    const factory = new Contract(factoryAddress, FACTORY_ABI, grantee);
    try {
        const tx1 = await factory.createERC20("Unlimited1", "UNL1", 18, 1000, grantee.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx1, "test21 tx1 unlimited sponsored", 1, 30000);
        pass("Unlimited grant: first tx sponsored");
    } catch (e: any) {
        fail("Unlimited grant: first tx should be sponsored", e.message?.substring(0, 160));
        try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
        return;
    }

    // Second sponsored tx — spendLimit still 0 (should not exhaust)
    try {
        const tx2 = await factory.createERC20("Unlimited2", "UNL2", 18, 1000, grantee.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx2, "test21 tx2 unlimited sponsored", 1, 30000);
        pass("Unlimited grant: second tx sponsored without exhaustion");
    } catch (e: any) {
        fail("Unlimited grant: second tx should still be sponsored", e.message?.substring(0, 160));
        try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
        return;
    }

    const granterBal1 = await provider.getBalance(admin.address);
    const grantAfter = await precompile.grant(grantee.address, factoryAddress);
    const granteeBal = await provider.getBalance(grantee.address);

    if (granterBal1 < granterBal0) {
        pass("Unlimited grant: granter paid for both txs", `Spent: ${ethers.formatEther(granterBal0 - granterBal1)} ETH`);
    } else {
        fail("Granter should have paid for both unlimited-grant txs");
    }

    if (granteeBal === 0n) {
        pass("Unlimited grant: grantee balance remains zero");
    } else {
        fail("Grantee should stay at zero balance with grant", `Balance: ${ethers.formatEther(granteeBal)} ETH`);
    }

    if (grantAfter.spendLimit === 0n) {
        pass("Unlimited grant: spendLimit remains 0 after multiple uses");
    } else {
        fail("spendLimit should stay 0 (unlimited) after use", `Got: ${grantAfter.spendLimit.toString()}`);
    }

    try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
}

async function test22_TransferOwnershipNewOwnerCanGrant(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 22: transferOwnership → New Owner Can Create Fee Grants ──");

    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);
    const newOwner = Wallet.createRandom().connect(provider);
    const grantee = Wallet.createRandom().connect(provider);

    // Fund newOwner so it can pay for transactions
    await fundWallet(admin, newOwner.address, "10");

    // Transfer ownership to newOwner
    try {
        const txTransfer = await precompile.transferOwnership(newOwner.address, TX_OVERRIDES);
        await waitForReceipt(txTransfer, "test22 transferOwnership");
    } catch (e: any) {
        fail("transferOwnership failed", e.message?.substring(0, 160));
        return;
    }

    const ownerAfter = await precompile.owner();
    if (ownerAfter.toLowerCase() === newOwner.address.toLowerCase()) {
        pass("Ownership transferred to newOwner", newOwner.address);
    } else {
        fail("owner() should reflect newOwner after transfer", `Got: ${ownerAfter}`);
        // Restore ownership before returning
        try {
            const precompileNew = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, newOwner);
            await waitForReceipt(await precompileNew.transferOwnership(admin.address, TX_OVERRIDES), "test22 restore owner A");
        } catch { }
        return;
    }

    // Old owner (admin) should now fail to create a grant.
    // The precompile returns FALSE (not revert) when onlyOwner check fails,
    // so we verify by checking that no grant was actually created.
    try {
        const txOld = await precompile.setFeeGrant(
            admin.address, grantee.address, factoryAddress,
            ethers.parseEther("1"), 0, 0, 0,
            TX_OVERRIDES
        );
        await waitForReceipt(txOld, "test22 old-owner setFeeGrant");
    } catch { /* silent */ }
    const oldOwnerGrantCreated = await precompile.isGrantedForProgram(grantee.address, factoryAddress);
    if (!oldOwnerGrantCreated) {
        pass("Old owner correctly rejected from setFeeGrant after ownership transfer");
    } else {
        fail("Old owner should not be able to setFeeGrant after ownership transfer");
    }

    // New owner creates a grant
    const precompileNew = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, newOwner);
    try {
        const txNewGrant = await precompileNew.setFeeGrant(
            newOwner.address, grantee.address, factoryAddress,
            ethers.parseEther("5"), 0, 0, 0,
            TX_OVERRIDES
        );
        await waitForReceipt(txNewGrant, "test22 newOwner setFeeGrant");
        pass("New owner successfully created a fee grant");
    } catch (e: any) {
        fail("New owner should be able to setFeeGrant", e.message?.substring(0, 160));
        try { await waitForReceipt(await precompileNew.transferOwnership(admin.address, TX_OVERRIDES), "test22 restore owner B"); } catch { }
        return;
    }

    const grantData = await precompile.grant(grantee.address, factoryAddress);
    // granter is returned as a bytes32 (left-padded 32-byte address); extract the 20-byte address
    const granterAddr = ethers.getAddress("0x" + grantData.granter.slice(-40));
    if (granterAddr.toLowerCase() === newOwner.address.toLowerCase()) {
        pass("Grant record shows newOwner as granter", newOwner.address);
    } else {
        fail("grant.granter should be newOwner", `Got: ${granterAddr}`);
    }

    // Sponsored tx using the new owner's grant
    const factory = new Contract(factoryAddress, FACTORY_ABI, grantee);
    const newOwnerBal0 = await provider.getBalance(newOwner.address);
    try {
        const tx = await factory.createERC20("OwnerShift", "OWS", 18, 100, grantee.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx, "test22 sponsored via new-owner grant", 1, 30000);
        pass("Grantee tx sponsored by new owner's grant");
    } catch (e: any) {
        fail("Sponsored tx should work under new owner's grant", e.message?.substring(0, 160));
    }

    const newOwnerBal1 = await provider.getBalance(newOwner.address);
    if (newOwnerBal1 < newOwnerBal0) {
        pass("New owner paid gas for sponsored grantee tx", `Spent: ${ethers.formatEther(newOwnerBal0 - newOwnerBal1)} ETH`);
    } else {
        fail("New owner should have paid for sponsored grantee tx");
    }

    // Cleanup: revoke grant and restore admin as owner
    try { await waitForReceipt(await precompileNew.revokeFeeGrant(grantee.address, factoryAddress, TX_OVERRIDES), "test22 revoke cleanup"); } catch { }
    try { await waitForReceipt(await precompileNew.transferOwnership(admin.address, TX_OVERRIDES), "test22 restore admin ownership"); } catch { }

    const ownerRestored = await precompile.owner();
    if (ownerRestored.toLowerCase() === admin.address.toLowerCase()) {
        pass("Admin ownership restored after test");
    } else {
        fail("Could not restore admin as owner — subsequent tests may fail", `Current owner: ${ownerRestored}`);
    }
}

async function test23_GrantViewFieldVerification(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 23: grant() View Function Returns Correct Field Values ──");

    const grantee = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    const spendLimit = ethers.parseEther("42");
    const periodLimit = ethers.parseEther("7");
    const period = 3600; // 1 hour
    // Set endTime = current block number + 1000 (block-based expiry)
    const currentBlock = await provider.getBlockNumber();
    const endTime = currentBlock + 1000;

    const txGrant = await precompile.setFeeGrant(
        admin.address, grantee.address, factoryAddress,
        spendLimit, period, periodLimit, endTime,
        TX_OVERRIDES
    );
    await waitForReceipt(txGrant, "test23 setFeeGrant for field check");

    const g = await precompile.grant(grantee.address, factoryAddress);

    // granter is stored as a 32-byte left-padded value — extract the 20-byte address
    const granterAddr = ethers.getAddress("0x" + g.granter.slice(-40));
    if (granterAddr.toLowerCase() === admin.address.toLowerCase()) {
        pass("grant().granter matches admin address");
    } else {
        fail("grant().granter mismatch", `Expected: ${admin.address}, Got: ${granterAddr}`);
    }

    // allowance = 2 for a scoped grant with period limit (period>0 && periodLimit>0)
    // allowance = 1 for a scoped grant without period limits
    const expectedAllowance = (period > 0 && periodLimit > 0n) ? 2n : 1n;
    if (g.allowance === expectedAllowance) {
        pass(`grant().allowance = ${expectedAllowance} (period grant with period/periodLimit set)`);
    } else {
        fail(`grant().allowance should be ${expectedAllowance}`, `Got: ${g.allowance.toString()}`);
    }

    // spendLimit
    if (g.spendLimit === spendLimit) {
        pass("grant().spendLimit matches configured value", `${ethers.formatEther(spendLimit)} ETH`);
    } else {
        fail("grant().spendLimit mismatch", `Expected: ${spendLimit}, Got: ${g.spendLimit}`);
    }

    // periodLimit
    if (g.periodLimit === periodLimit) {
        pass("grant().periodLimit matches configured value", `${ethers.formatEther(periodLimit)} ETH`);
    } else {
        fail("grant().periodLimit mismatch", `Expected: ${periodLimit}, Got: ${g.periodLimit}`);
    }

    // periodCanSpend: for a fresh allowance=2 grant, periodCanSpend() reads slot+3 (periodLimit)
    // when latestTransaction + period > periodReset. At creation latestTransaction=startBlock,
    // periodReset=startBlock, so latestTransaction+period > periodReset → returns slot+4 (=periodLimit).
    if (g.periodCanSpend === periodLimit) {
        pass("grant().periodCanSpend = periodLimit (fresh grant, no spend yet)");
    } else {
        fail("grant().periodCanSpend should equal periodLimit on fresh grant", `Expected: ${periodLimit}, Got: ${g.periodCanSpend}`);
    }

    // startTime > 0
    if (g.startTime > 0n) {
        pass("grant().startTime > 0 (recorded)", `block ${g.startTime.toString()}`);
    } else {
        fail("grant().startTime should be > 0");
    }

    // endTime matches what we set
    if (g.endTime === BigInt(endTime)) {
        pass("grant().endTime matches configured endTime", `block ${endTime}`);
    } else {
        fail("grant().endTime mismatch", `Expected: ${endTime}, Got: ${g.endTime.toString()}`);
    }

    // latestTransaction is set to the block at grant creation time (not 0)
    if (g.latestTransaction === g.startTime) {
        pass("grant().latestTransaction = startTime (grant creation block)");
    } else {
        fail("grant().latestTransaction should equal startTime (creation block)", `latestTx=${g.latestTransaction}, startTime=${g.startTime}`);
    }

    // period matches
    if (g.period === BigInt(period)) {
        pass("grant().period matches configured period", `${period}s`);
    } else {
        fail("grant().period mismatch", `Expected: ${period}, Got: ${g.period.toString()}`);
    }

    // isGrantedForProgram should agree
    const isGranted = await precompile.isGrantedForProgram(grantee.address, factoryAddress);
    if (isGranted) {
        pass("isGrantedForProgram() = true after setFeeGrant");
    } else {
        fail("isGrantedForProgram() should return true");
    }

    // isExpired should be false
    const isExp = await precompile.isExpired(grantee.address, factoryAddress);
    if (!isExp) {
        pass("isExpired() = false for non-expired grant");
    } else {
        fail("isExpired() should return false for a fresh grant with endTime=block+" + 1000);
    }

    try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
}

async function test24_PeriodLimitEnforcement(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 24: Period Limit Enforcement ──");

    const grantee = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // Give grantee enough to cover worst-case gas for CONTRACT_OVERRIDES (5M * 1000gwei = 5 ETH)
    // when the period limit is exhausted and fallback to sender is triggered.
    await fundWallet(admin, grantee.address, "6");

    // spendLimit=10 ETH (non-zero so grant is not rejected), period=86400 blocks, periodLimit=1 wei.
    // A 1-wei per-period cap means any real tx cost exhausts the period budget immediately,
    // causing fallback to the sender for the second tx in the same period.
    const currentBlock24 = await provider.getBlockNumber();
    const txGrant = await precompile.setFeeGrant(
        admin.address, grantee.address, factoryAddress,
        ethers.parseEther("10"), 86400, 1, currentBlock24 + 100000,
        TX_OVERRIDES
    );
    await waitForReceipt(txGrant, "test24 setFeeGrant period limit=1");

    const grantBefore = await precompile.grant(grantee.address, factoryAddress);
    // With allowance=2 (period grant), periodCanSpend on a fresh grant returns slot+4 = periodLimit = 1
    if (grantBefore.periodCanSpend === 1n) {
        pass("Period limit set to 1 wei — periodCanSpend=1");
    } else {
        fail("periodCanSpend should be 1 wei", `Got: ${grantBefore.periodCanSpend.toString()}`);
        try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
        return;
    }

    const granterBal0 = await provider.getBalance(admin.address);
    const granteeBal0 = await provider.getBalance(grantee.address);

    // First tx: periodCanSpend = 1 wei. enforceFeeGrantBudget checks upfrontGasCost > periodCanSpend
    // and immediately returns FeeGrantContext.disabled() — grant is never charged, grantee pays.
    // updateFeeGrantBudgetAfterExecution is skipped (useGrant=false), so slot+4 stays at 1 wei.
    const factory = new Contract(factoryAddress, FACTORY_ABI, grantee);
    try {
        const tx1 = await factory.createERC20("PeriodTest1", "PT1", 18, 1000, grantee.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx1, "test24 tx1 (period limit)", 1, 30000);

        const granterBal1 = await provider.getBalance(admin.address);
        const granteeBal1 = await provider.getBalance(grantee.address);

        // Granter must NOT pay — the 1-wei period budget is below any real upfrontGasCost,
        // so enforceFeeGrantBudget returns disabled() before any granter deduction.
        if (granteeBal1 < granteeBal0) {
            pass("Period limit: grantee paid tx1 (period budget 1 wei < upfrontGasCost → fallback)", `Grantee cost: ${ethers.formatEther(granteeBal0 - granteeBal1)} ETH`);
        } else if (granterBal1 < granterBal0) {
            fail("Period limit: granter should NOT pay when periodCanSpend (1 wei) < upfrontGasCost", `Granter paid: ${ethers.formatEther(granterBal0 - granterBal1)} ETH`);
        } else {
            fail("Period limit: nobody paid gas for tx1");
        }
        console.log(`   Granter diff: ${ethers.formatEther(granterBal0 - (await provider.getBalance(admin.address)))} ETH`);
        console.log(`   Grantee diff: ${ethers.formatEther(granteeBal0 - (await provider.getBalance(grantee.address)))} ETH`);
    } catch (e: any) {
        fail("test24 tx1 should not throw", e.message?.substring(0, 160));
        try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
        return;
    }

    // After first tx, periodCanSpend should be unchanged (1 wei) because the rx
    // fell back to the sender, leaving the grant untouched.
    const grantAfterTx1 = await precompile.grant(grantee.address, factoryAddress);
    if (grantAfterTx1.periodCanSpend === 1n) {
        pass("Period budget untouched after exceeding period limit (fallback to sender)");
    } else {
        fail("periodCanSpend should remain 1 wei after falling back to sender", `Got: ${grantAfterTx1.periodCanSpend.toString()}`);
    }

    const granterBal2 = await provider.getBalance(admin.address);
    const granteeBal2 = await provider.getBalance(grantee.address);

    // Second tx in same period: period budget = 0, falls back to grantee
    try {
        const tx2 = await factory.createERC20("PeriodTest2", "PT2", 18, 1000, grantee.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx2, "test24 tx2 (after period exhaustion)", 1, 30000);

        const granterBal3 = await provider.getBalance(admin.address);
        const granteeBal3 = await provider.getBalance(grantee.address);

        if (granteeBal3 < granteeBal2) {
            pass("Period limit: grantee paid for second tx after period exhaustion", `Grantee cost: ${ethers.formatEther(granteeBal2 - granteeBal3)} ETH`);
        } else if (granterBal3 < granterBal2) {
            fail("Granter should NOT pay second tx after period limit exhausted");
        } else {
            fail("Period limit: nobody paid for second tx");
        }
    } catch (e: any) {
        fail("test24 tx2 should not throw (grantee has balance)", e.message?.substring(0, 160));
    }

    try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
}

async function test25_MultiGranteeIsolationOnRevoke(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 25: Multiple Grantees Same Granter — Revoke One, Other Unaffected ──");

    const granteeA = Wallet.createRandom().connect(provider);
    const granteeB = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // Both grantees start with zero balance
    const startBalA = await provider.getBalance(granteeA.address);
    const startBalB = await provider.getBalance(granteeB.address);
    if (startBalA === 0n && startBalB === 0n) {
        pass("Setup: both grantees start with zero balance");
    } else {
        fail("Setup: grantees should start with zero balance", `A=${ethers.formatEther(startBalA)}, B=${ethers.formatEther(startBalB)}`);
    }

    // Grant to both
    await grantFee(precompile, admin.address, granteeA.address, factoryAddress, "10", 86400, 86400);
    await grantFee(precompile, admin.address, granteeB.address, factoryAddress, "10", 86400, 86400);

    const grantedA0 = await precompile.isGrantedForProgram(granteeA.address, factoryAddress);
    const grantedB0 = await precompile.isGrantedForProgram(granteeB.address, factoryAddress);
    if (grantedA0 && grantedB0) {
        pass("Both grantees granted by same granter");
    } else {
        fail("Setup: both grants should be active", `A=${grantedA0}, B=${grantedB0}`);
        return;
    }

    // Revoke grantee A only
    await revokeFee(precompile, granteeA.address, factoryAddress);

    const grantedA1 = await precompile.isGrantedForProgram(granteeA.address, factoryAddress);
    const grantedB1 = await precompile.isGrantedForProgram(granteeB.address, factoryAddress);

    if (!grantedA1) {
        pass("Grantee A revoked successfully");
    } else {
        fail("Grantee A should be revoked");
    }
    if (grantedB1) {
        pass("Grantee B unaffected by revocation of grantee A");
    } else {
        fail("Grantee B should remain active after revoking grantee A");
        return;
    }

    // Grantee A (revoked, zero balance) should fail
    const factoryA = new Contract(factoryAddress, FACTORY_ABI, granteeA);
    try {
        const txA = await factoryA.createERC20("RevokedA", "RA", 18, 100, granteeA.address, CONTRACT_OVERRIDES);
        await withTimeout(txA.wait(1), 15000, "test25 revoked grantee A tx");
        fail("Revoked grantee A with zero balance should not succeed");
    } catch {
        pass("Revoked grantee A correctly rejected (zero balance, no grant)");
    }

    // Grantee B (active, zero balance) should succeed
    const factoryB = new Contract(factoryAddress, FACTORY_ABI, granteeB);
    const granterBal0 = await provider.getBalance(admin.address);
    try {
        const txB = await factoryB.createERC20("ActiveB", "AB", 18, 100, granteeB.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, txB, "test25 active grantee B tx", 1, 30000);
        pass("Active grantee B successfully sponsored after A's revocation");
    } catch (e: any) {
        fail("Active grantee B should still be sponsored", e.message?.substring(0, 160));
        try { await revokeFee(precompile, granteeB.address, factoryAddress); } catch { }
        return;
    }

    const granterBal1 = await provider.getBalance(admin.address);
    const balA = await provider.getBalance(granteeA.address);
    const balB = await provider.getBalance(granteeB.address);

    if (granterBal1 < granterBal0) {
        pass("Granter paid for grantee B's tx", `Spent: ${ethers.formatEther(granterBal0 - granterBal1)} ETH`);
    } else {
        fail("Granter should pay for grantee B's tx");
    }
    if (balA === 0n) {
        pass("Grantee A balance stays zero (correctly rejected)");
    }
    if (balB === 0n) {
        pass("Grantee B balance stays zero (grant covered gas)");
    } else {
        fail("Grantee B should remain at zero balance", `Got: ${ethers.formatEther(balB)} ETH`);
    }

    try { await revokeFee(precompile, granteeB.address, factoryAddress); } catch { }
}

async function test26_ScopedGrantNativeTransfer(
    provider: ethers.JsonRpcProvider, admin: Wallet
) {
    console.log("\n── Test 26: Scoped Grant for Native ETH Transfer ──");

    const grantee = Wallet.createRandom().connect(provider);
    const recipient = Wallet.createRandom().address;
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // Fund grantee with just enough to cover a single 0-value transfer (21 000 * 1000 gwei)
    // We give 0 so it truly relies on the grant
    const startBal = await provider.getBalance(grantee.address);
    if (startBal !== 0n) {
        fail("Setup: grantee must start with zero balance for this test");
        return;
    }
    pass("Setup: grantee has zero balance");

    // Grant scoped to ZeroAddress = allows native transfers
    const ZERO_PROGRAM = ethers.ZeroAddress;
    const txGrant = await precompile.setFeeGrant(
        admin.address, grantee.address, ZERO_PROGRAM,
        ethers.parseEther("1"), 86400, ethers.parseEther("1"), 0,
        TX_OVERRIDES
    );
    await waitForReceipt(txGrant, "test26 setFeeGrant zero-program for native transfer");

    const isGranted = await precompile.isGrantedForProgram(grantee.address, ZERO_PROGRAM);
    if (isGranted) {
        pass("Scoped grant to ZeroAddress created");
    } else {
        fail("Grant to ZeroAddress should be active");
        return;
    }

    const granterBal0 = await provider.getBalance(admin.address);

    // Native transfer from zero-balance grantee (0 value, to recipient)
    try {
        const tx = await grantee.sendTransaction({
            to: recipient,
            value: 0n,
            ...TRANSFER_OVERRIDES
        });
        await withTimeout(tx.wait(1), 30000, "test26 native transfer zero-value");
        pass("Scoped ZeroAddress grant: native transfer broadcast succeeded");
    } catch (e: any) {
        fail("Scoped ZeroAddress grant: native transfer should succeed", e.message?.substring(0, 160));
        try { await revokeFee(precompile, grantee.address, ZERO_PROGRAM); } catch { }
        return;
    }

    const granterBal1 = await provider.getBalance(admin.address);
    const granteeBal1 = await provider.getBalance(grantee.address);

    if (granterBal1 < granterBal0) {
        pass("Native transfer gas paid by granter via ZeroAddress scoped grant", `Spent: ${ethers.formatEther(granterBal0 - granterBal1)} ETH`);
    } else {
        fail("Granter should have paid for native transfer via ZeroAddress grant");
    }

    if (granteeBal1 === 0n) {
        pass("Grantee balance remains zero after sponsored native transfer");
    } else {
        fail("Grantee balance should remain zero", `Got: ${ethers.formatEther(granteeBal1)} ETH`);
    }

    // Non-zero-program tx should NOT be covered by this ZeroAddress grant
    // (grant is scoped specifically to ZeroAddress, not a wildcard)
    // Just verify isGrantedForProgram for a random contract address returns false
    const randomAddr = Wallet.createRandom().address;
    const isGrantedOther = await precompile.isGrantedForProgram(grantee.address, randomAddr);
    if (!isGrantedOther) {
        pass("ZeroAddress-scoped grant does not cover other program addresses");
    } else {
        fail("ZeroAddress-scoped grant should NOT cover arbitrary program addresses");
    }

    try { await revokeFee(precompile, grantee.address, ZERO_PROGRAM); } catch { }
}

async function test27_ReGrantAfterRevoke(
    provider: ethers.JsonRpcProvider, admin: Wallet, factoryAddress: string
) {
    console.log("\n── Test 27: Re-Grant After Revoke Works Correctly ──");

    const grantee = Wallet.createRandom().connect(provider);
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    // === Phase 1: Initial grant ===
    await grantFee(precompile, admin.address, grantee.address, factoryAddress, "5", 86400, 86400);

    const grant1 = await precompile.grant(grantee.address, factoryAddress);
    // grantFee helper uses period=86400 and periodLimit=spendLimit (both non-zero) → allowance=2
    if (grant1.allowance === 1n || grant1.allowance === 2n) {
        pass("Re-grant phase 1: initial grant active", `allowance=${grant1.allowance.toString()}`);
    } else {
        fail("Re-grant phase 1: initial grant should be active", `allowance=${grant1.allowance.toString()}`);
        return;
    }

    // === Phase 2: Revoke grant ===
    await revokeFee(precompile, grantee.address, factoryAddress);

    const isGranted2 = await precompile.isGrantedForProgram(grantee.address, factoryAddress);
    if (!isGranted2) {
        pass("Re-grant phase 2: grant revoked");
    } else {
        fail("Re-grant phase 2: grant should be revoked");
        return;
    }

    // === Phase 3: Re-grant with different spend limit ===
    const newSpendLimit = ethers.parseEther("99");
    const txReGrant = await precompile.setFeeGrant(
        admin.address, grantee.address, factoryAddress,
        newSpendLimit, 86400, newSpendLimit, 0,
        TX_OVERRIDES
    );
    await waitForReceipt(txReGrant, "test27 re-grant");

    const grant3 = await precompile.grant(grantee.address, factoryAddress);
    // Re-grant with period+periodLimit → allowance=2
    if (grant3.allowance === 1n || grant3.allowance === 2n) {
        pass("Re-grant phase 3: grant active again after revoke+re-grant", `allowance=${grant3.allowance.toString()}`);
    } else {
        fail("Re-grant phase 3: re-grant should be active", `allowance=${grant3.allowance.toString()}`);
        try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
        return;
    }

    if (grant3.spendLimit === newSpendLimit) {
        pass("Re-grant phase 3: new spendLimit reflects re-grant parameters", `${ethers.formatEther(newSpendLimit)} ETH`);
    } else {
        fail("Re-grant spendLimit should reflect new value", `Expected: ${newSpendLimit}, Got: ${grant3.spendLimit.toString()}`);
    }

    // === Phase 4: Sponsored tx using re-grant ===
    const factory = new Contract(factoryAddress, FACTORY_ABI, grantee);
    const granterBal0 = await provider.getBalance(admin.address);
    try {
        const tx = await factory.createERC20("ReGrant", "RGT", 18, 100, grantee.address, CONTRACT_OVERRIDES);
        await waitForReceiptWithDiagnostics(provider, tx, "test27 re-granted sponsored tx", 1, 30000);
        pass("Re-grant phase 4: tx sponsored under re-grant");
    } catch (e: any) {
        fail("Re-grant phase 4: tx should be sponsored under re-grant", e.message?.substring(0, 160));
        try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
        return;
    }

    const granterBal1 = await provider.getBalance(admin.address);
    const granteeBal = await provider.getBalance(grantee.address);

    if (granterBal1 < granterBal0) {
        pass("Re-grant: granter paid for sponsored tx", `Spent: ${ethers.formatEther(granterBal0 - granterBal1)} ETH`);
    } else {
        fail("Granter should pay for re-granted sponsored tx");
    }
    if (granteeBal === 0n) {
        pass("Re-grant: grantee balance remains zero");
    } else {
        fail("Grantee balance should stay zero with re-grant active", `Got: ${ethers.formatEther(granteeBal)} ETH`);
    }

    // Verify spendLimit decremented after use
    const grant4 = await precompile.grant(grantee.address, factoryAddress);
    if (grant4.spendLimit < newSpendLimit) {
        pass("Re-grant: spendLimit decremented after use", `${ethers.formatEther(grant4.spendLimit)} ETH remaining`);
    } else {
        fail("spendLimit should decrease after sponsored tx", `Got: ${ethers.formatEther(grant4.spendLimit)} ETH`);
    }

    try { await revokeFee(precompile, grantee.address, factoryAddress); } catch { }
}

// ===================== UNIFIED MAIN =====================
async function main() {
    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║            Combined Precompile Test Suite                            ║");
    console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

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
    console.log(`📄 GasFeeGrant Precompile: ${GAS_FEE_GRANT_ADDRESS}`);

    // Ensure GasFeeGrant precompile owner is initialized
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);
    try {
        const isInitRaw = await precompile.initialized();
        const isInit = isInitRaw === true || isInitRaw === 1n || isInitRaw === 1;
        const currentOwner = await precompile.owner().catch(() => ethers.ZeroAddress);

        console.log(`   initialized(): ${isInit}`);
        console.log(`   owner(): ${currentOwner}`);

        if (!isInit) {
            console.log("   Initializing precompile owner...");
            const tx = await precompile.initializeOwner(admin.address, TX_OVERRIDES);
            await tx.wait(1);

            const ownerAfter = await precompile.owner().catch(() => ethers.ZeroAddress);
            console.log(`   owner() after init: ${ownerAfter}`);
            if (ownerAfter.toLowerCase() !== admin.address.toLowerCase()) {
                throw new Error(
                    `GasFeeGrant owner mismatch after initialization. Expected ${admin.address}, got ${ownerAfter}`
                );
            }
        } else if (currentOwner.toLowerCase() !== admin.address.toLowerCase()) {
            throw new Error(
                `GasFeeGrant precompile is already initialized to a different owner. ` +
                `Expected admin ${admin.address}, but current owner is ${currentOwner}. ` +
                `Use the matching owner key or reset/reinitialize the chain state before running this suite.`
            );
        }
    } catch (error: any) {
        throw new Error(`Precompile ownership check failed: ${error.shortMessage || error.message}`);
    }

    await flushPendingTxs(admin, provider);

    // ═══════════════════════════════════════════════════════════════════
    // SUITE A — Fee Grant Core Impact Tests
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(70));
    console.log("  SUITE A — Fee Grant Core Impact Tests");
    console.log("═".repeat(70));

    await test1_NormalTransferNoGrant(provider, admin);
    await test2_ContractCallNoGrant(provider, admin, factoryAddress);
    await test3_GrantActiveContractCall(provider, admin, factoryAddress);
    await test4_RevokeGrantRetryTx(provider, admin, factoryAddress);
    await test5_ExpiredGrant(provider, admin, factoryAddress);
    await test6_ExceedsSpendLimit(provider, admin, factoryAddress);
    await test7_GranterInsufficientBalance(provider, admin, factoryAddress);
    await test8_MultipleBlocksStability(provider, admin);
    await test9_CoinbaseReceivesFees(provider, admin);

    await test10_FreshAddressCannotInitialize(provider, admin);
    await test11_FreshAddressCannotSetFeeGrant(provider, admin, factoryAddress);
    await test12_FreshAddressCannotRevokeFeeGrant(provider, admin, factoryAddress);
    await test13_FreshAddressCannotTransferOwnership(provider, admin);
    await test14_FreshAddressCannotStealOwnership(provider, admin);

    await test15_DualProgramGrantExceed(provider, admin);
    await test16_WildcardGrantMulticall(provider, admin, factoryAddress);
    await test17_WildcardLazyCleanupPoorGranter(provider, admin);
    await test18_WildcardCleanupPersists(provider, admin);
    await test19_WildcardLazyCleanupPerGrantee(provider, admin);
    await test20_FreshGrantZeroBalanceCoverage(provider, admin, factoryAddress);
    await test21_UnlimitedSpendLimit(provider, admin, factoryAddress);
    await test22_TransferOwnershipNewOwnerCanGrant(provider, admin, factoryAddress);
    await test23_GrantViewFieldVerification(provider, admin, factoryAddress);
    await test24_PeriodLimitEnforcement(provider, admin, factoryAddress);
    await test25_MultiGranteeIsolationOnRevoke(provider, admin, factoryAddress);
    await test26_ScopedGrantNativeTransfer(provider, admin);
    await test27_ReGrantAfterRevoke(provider, admin, factoryAddress);

    console.log("\n" + "═".repeat(70));
    console.log(`  SUITE A Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("═".repeat(70));

    // ═══════════════════════════════════════════════════════════════════
    // SUITE B — Comprehensive Precompile Read Tests
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(70));
    console.log("  SUITE B — Comprehensive Precompile Read Tests");
    console.log("═".repeat(70));

    await runSuiteB(provider, admin);

    // ═══════════════════════════════════════════════════════════════════
    // SUITE C — GasPrice Enforcement + Revenue Distribution
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(70));
    console.log("  SUITE C — GasPrice Enforcement + Revenue Distribution");
    console.log("═".repeat(70));

    await runSuiteC(provider, admin);

    // ═══════════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(70));
    console.log(`  FINAL: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("═".repeat(70) + "\n");

    if (failCount > 0) {
        console.log("⚠️  Some tests failed. Review output above.\n");
        process.exit(1);
    } else {
        console.log("✅ All tests passed!\n");
    }
}

// ===================== SUITE B: PRECOMPILE READ TESTS =====================
async function runSuiteB(provider: ethers.JsonRpcProvider, wallet: Wallet) {
    const txOptions = { gasLimit: 500000n, gasPrice: 100000000000n };
    const allResults: { name: string; results: TestResult[] }[] = [];

    allResults.push(
        await testPrecompile("NativeMinter (0x1001)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.NATIVE_MINTER, ABIS.NATIVE_MINTER, wallet);

            // Test initialized
            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}`, details: initialized });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            // Test owner
            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner, details: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            // Test totalsupply() using the Java precompile selector name
            try {
                const supply = await contract.totalsupply();
                results.push({ name: "totalsupply()", passed: true, message: `${ethers.formatEther(supply)} ETH`, details: supply });
            } catch (e: any) {
                results.push({ name: "totalsupply()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 2. Test Address Registry Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("AddressRegistry (0x1002)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.ADDRESS_REGISTRY, ABIS.ADDRESS_REGISTRY, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            // Test contains
            try {
                const contains = await contract.contains(wallet.address);
                results.push({ name: "contains(wallet)", passed: true, message: `${contains}` });
            } catch (e: any) {
                results.push({ name: "contains(wallet)", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 3. Test Gas Price Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("GasPrice (0x1003)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.GAS_PRICE, ABIS.GAS_PRICE, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const status = await contract.status();
                results.push({ name: "status()", passed: true, message: `${status}` });
            } catch (e: any) {
                results.push({ name: "status()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const gasPrice = await contract.gasPrice();
                results.push({ name: "gasPrice()", passed: true, message: `${ethers.formatUnits(gasPrice, "gwei")} gwei` });
            } catch (e: any) {
                results.push({ name: "gasPrice()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 4. Test Revenue Ratio Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("RevenueRatio (0x1004)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.REVENUE_RATIO, ABIS.REVENUE_RATIO, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const status = await contract.status();
                results.push({ name: "status()", passed: true, message: `${status}` });
            } catch (e: any) {
                results.push({ name: "status()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const senderR = await contract.senderRatio();
                const coinbaseR = await contract.coinbaseRatio();
                const providerR = await contract.providerRatio();
                const treasuryR = await contract.treasuryRatio();
                results.push({
                    name: "ratios()",
                    passed: true,
                    message: `sender=${senderR}%, coinbase=${coinbaseR}%, provider=${providerR}%, treasury=${treasuryR}%`,
                });
            } catch (e: any) {
                results.push({ name: "ratios()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 5. Test Treasury Registry Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("TreasuryRegistry (0x1005)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.TREASURY_REGISTRY, ABIS.TREASURY_REGISTRY, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const treasury = await contract.treasuryAt();
                results.push({ name: "treasuryAt()", passed: true, message: treasury });
            } catch (e: any) {
                results.push({ name: "treasuryAt()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 6. Test Gas Fee Grant Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("GasFeeGrant (0x1006)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.GAS_FEE_GRANT, ABIS.GAS_FEE_GRANT, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            // Test isGrantedForProgram with a known address
            const testGrantee = "0xAe76b11CEcE311717934938510327203a373E826";
            try {
                const isGranted = await contract.isGrantedForProgram(testGrantee, ethers.ZeroAddress);
                results.push({ name: `isGrantedForProgram(${testGrantee.slice(0, 10)}...)`, passed: true, message: `${isGranted}` });
            } catch (e: any) {
                results.push({ name: `isGrantedForProgram()`, passed: false, message: e.shortMessage || e.message });
            }

            // If granted, try to get grant details
            try {
                const grant = await contract.grant(testGrantee, ethers.ZeroAddress);
                if (grant.granter !== ethers.ZeroAddress) {
                    results.push({
                        name: "grant() details",
                        passed: true,
                        message: `granter=${grant.granter.slice(0, 10)}..., spendLimit=${ethers.formatEther(grant.spendLimit)} ETH`,
                    });
                }
            } catch (e: any) {
                // Ignore if not granted
            }

            return results;
        })
    );

    // Summary for Suite B
    let suiteBPassed = 0;
    let suiteBFailed = 0;

    for (const precompileResult of allResults) {
        console.log(`\n📦 ${precompileResult.name}`);
        for (const result of precompileResult.results) {
            const icon = result.passed ? "✅" : "❌";
            console.log(`   ${icon} ${result.name}: ${result.message}`);
            if (result.passed) { suiteBPassed++; passCount++; }
            else { suiteBFailed++; failCount++; }
        }
    }

    console.log("\n" + "═".repeat(70));
    console.log(`  SUITE B Results: ${suiteBPassed} passed, ${suiteBFailed} failed`);
    console.log("═".repeat(70));
}

// ===================== SUITE C: GASPRICE + REVENUE TESTS =====================
async function runSuiteC(provider: ethers.JsonRpcProvider, admin: Wallet) {
    // sender — used for revenue split and positive-case txs (clean nonce sequence)
    const senderKey = process.env.ADMIN2 ?? ethers.Wallet.createRandom().privateKey;
    const sender = new ethers.Wallet(senderKey, provider);

    // rejectionSender — dedicated wallet for underpriced txs
    const rejectionSender = ethers.Wallet.createRandom().connect(provider) as unknown as ethers.Wallet;

    // Fixed addresses for treasury and provider so we can track balances
    const TREASURY = ethers.Wallet.createRandom().connect(provider);
    const PROVIDER_WALLET = ethers.Wallet.createRandom().connect(provider);

    console.log(`\n👤 Sender:           ${sender.address}`);
    console.log(`👤 RejectionSender:  ${rejectionSender.address}`);
    console.log(`🏦 Treasury:         ${TREASURY.address}`);
    console.log(`🔌 Provider:         ${PROVIDER_WALLET.address}`);

    const ADMIN_GAS = ethers.parseUnits("1000", "gwei");
    const adminTxOpts = { gasLimit: 500_000n, gasPrice: ADMIN_GAS };

    // Fund sender and rejectionSender if needed
    {
        const needsFunding = async (addr: string, threshold: bigint) =>
            (await provider.getBalance(addr)) < threshold;

        const toFund: { addr: string; label: string }[] = [];
        if (await needsFunding(sender.address, ethers.parseEther("0.5")))
            toFund.push({ addr: sender.address, label: "sender" });
        if (await needsFunding(rejectionSender.address, ethers.parseEther("0.01")))
            toFund.push({ addr: rejectionSender.address, label: "rejectionSender" });

        if (toFund.length > 0) {
            section("Funding test wallets");
            for (const { addr, label } of toFund) {
                const amount = label === "sender" ? ethers.parseEther("1") : ethers.parseEther("0.1");
                const tx = await admin.sendTransaction({
                    to: addr, value: amount,
                    gasLimit: 21_000n, gasPrice: ADMIN_GAS,
                });
                await tx.wait(1);
                console.log(`  ✅ Funded ${label} (${addr}) with ${ethers.formatEther(amount)} ETH`);
            }
        }
    }

    const gpContract  = new ethers.Contract(GAS_PRICE_ADDR,     GAS_PRICE_ABI,     admin);
    const rrContract  = new ethers.Contract(REVENUE_RATIO_ADDR, REVENUE_RATIO_ABI, admin);
    const trContract  = new ethers.Contract(TREASURY_REG_ADDR,  TREASURY_REG_ABI,  admin);

    section("Setup: initialise precompiles");

    {
        const gpOk = await ensureInit(gpContract, admin.address, adminTxOpts);
        assertCondition(gpOk, "GasPrice (0x1003) owned by admin");

        const rrOk = await ensureInit(rrContract, admin.address, adminTxOpts);
        assertCondition(rrOk, "RevenueRatio (0x1004) owned by admin");

        const trOk = await ensureInit(trContract, admin.address, adminTxOpts);
        assertCondition(trOk, "TreasuryRegistry (0x1005) owned by admin");
    }

    // ───────────────────────────────────────────────────────────────────────
    // PART 1 — GasPrice floor enforcement
    // ───────────────────────────────────────────────────────────────────────
    section("PART 1 — GasPrice floor enforcement (0x1003)");

    const FLOOR_GWEI = 1_000n; // 1000 gwei
    const FLOOR_WEI  = ethers.parseUnits(FLOOR_GWEI.toString(), "gwei");

    // 1.1 — Disable revenue ratio so Part 1 is isolated
    {
        const rrStatus: boolean = await rrContract.status();
        if (rrStatus) {
            const tx = await rrContract.disable(adminTxOpts);
            await tx.wait(1);
        }
    }

    // 1.2 — Set floor and enable
    console.log(`\n  [1.1] Setting gas price floor to ${FLOOR_GWEI} gwei and enabling...`);
    {
        const txPrice = await gpContract.setGasPrice(FLOOR_WEI, adminTxOpts);
        await txPrice.wait(1);
        const txEnable = await gpContract.enable(adminTxOpts);
        await txEnable.wait(1);

        const storedPrice: bigint = await gpContract.gasPrice();
        const enabled: boolean    = await gpContract.status();
        assertCondition(storedPrice === FLOOR_WEI, `Stored floor = ${FLOOR_GWEI} gwei`);
        assertCondition(enabled, "GasPrice precompile enabled");
    }

    // 1.3 — Tx at exactly floor → must succeed
    console.log(`\n  [1.2] Sending tx at exactly ${FLOOR_GWEI} gwei (should succeed)...`);
    {
        try {
            const receipt = await sendLegacyTx(provider, sender, admin.address, FLOOR_WEI);
            assertCondition(receipt?.status === 1, `Tx at floor (${FLOOR_GWEI} gwei) accepted`);
        } catch (e: any) {
            assertCondition(false, `Tx at floor rejected unexpectedly: ${e.message?.slice(0, 120)}`);
        }
    }

    // 1.4 — Tx at 1 gwei → must be excluded from blocks
    console.log(`\n  [1.3] Sending tx at 1 gwei — floor is ${FLOOR_GWEI} gwei (should be excluded from blocks)...`);
    await expectNotMined(provider, rejectionSender, admin.address, ethers.parseUnits("1", "gwei"),
        "Tx at 1 gwei excluded when floor = 1000 gwei", 1, 90_000);

    // 1.5 — Disable and verify the same 1 gwei tx now passes
    console.log(`\n  [1.4] Disabling GasPrice precompile, re-sending tx at 1 gwei...`);
    {
        const txDisable = await gpContract.disable(adminTxOpts);
        await txDisable.wait(1);
        assertCondition(!(await gpContract.status()), "GasPrice precompile disabled");

        try {
            const receipt = await sendLegacyTx(provider, sender, admin.address, ethers.parseUnits("1", "gwei"));
            assertCondition(receipt?.status === 1, "Tx at 1 gwei accepted after disabling floor");
        } catch (e: any) {
            assertCondition(false, `Tx at 1 gwei still rejected after disable: ${e.message?.slice(0, 120)}`);
        }
    }

    // Re-enable at floor for Part 3
    {
        const txEnable = await gpContract.enable(adminTxOpts);
        await txEnable.wait(1);
    }

    // ───────────────────────────────────────────────────────────────────────
    // PART 2 — Revenue distribution
    // ───────────────────────────────────────────────────────────────────────
    section("PART 2 — Revenue distribution (0x1004 + 0x1005)");

    // Ratios: sender=30, coinbase=40, provider=20, treasury=10
    const SENDER_RATIO   = 30n;
    const COINBASE_RATIO = 40n;
    const PROVIDER_RATIO = 20n;
    const TREASURY_RATIO = 10n;

    // 2.1 — Register treasury and provider
    console.log(`\n  [2.1] Registering treasury (${TREASURY.address}) and provider (${PROVIDER_WALLET.address})...`);
    {
        const txT = await trContract.setTreasury(TREASURY.address, adminTxOpts);
        await txT.wait(1);
        const txP = await trContract.setProvider(PROVIDER_WALLET.address, adminTxOpts);
        await txP.wait(1);

        const storedTreasury: string = await trContract.treasuryAt();
        const storedProvider: string = await trContract.providerAt();
        assertCondition(storedTreasury.toLowerCase() === TREASURY.address.toLowerCase(),
            "Treasury address stored correctly");
        assertCondition(storedProvider.toLowerCase() === PROVIDER_WALLET.address.toLowerCase(),
            "Provider address stored correctly");
    }

    // 2.2 — Set ratios
    console.log(`\n  [2.2] Setting ratios: sender=${SENDER_RATIO} coinbase=${COINBASE_RATIO} provider=${PROVIDER_RATIO} treasury=${TREASURY_RATIO}...`);
    {
        const txRatio = await rrContract.setRevenueRatio(
            SENDER_RATIO, COINBASE_RATIO, PROVIDER_RATIO, TREASURY_RATIO,
            adminTxOpts,
        );
        await txRatio.wait(1);

        const sr: bigint = await rrContract.senderRatio();
        const cr: bigint = await rrContract.coinbaseRatio();
        const pr: bigint = await rrContract.providerRatio();
        const tr: bigint = await rrContract.treasuryRatio();
        assertCondition(sr === SENDER_RATIO && cr === COINBASE_RATIO && pr === PROVIDER_RATIO && tr === TREASURY_RATIO,
            `Ratios stored: sender=${sr} coinbase=${cr} provider=${pr} treasury=${tr}`);
    }

    // 2.3 — Enable revenue ratio
    console.log(`\n  [2.3] Enabling RevenueRatio precompile...`);
    {
        const txEn = await rrContract.enable(adminTxOpts);
        await txEn.wait(1);
        assertCondition(await rrContract.status(), "RevenueRatio enabled");
    }

    // 2.4 — Send a tx and capture balance deltas
    console.log(`\n  [2.4] Sending test tx and measuring balance splits...`);
    {
        const TX_GAS_LIMIT = 21_000n;
        const TX_GAS_PRICE = FLOOR_WEI;

        const receipt = await sendLegacyTx(provider, sender, admin.address, TX_GAS_PRICE, TX_GAS_LIMIT);
        assertCondition(receipt?.status === 1, "Revenue-split tx executed successfully");

        // Use the receipt's block for the ACTUAL coinbase and baseFee.
        // QBFT rotates proposers per block — capture coinbase from the mined block.
        const txBlock        = await provider.getBlock(receipt!.blockNumber);
        const actualCoinbase = txBlock!.miner;
        const baseFee        = txBlock!.baseFeePerGas ?? 0n;

        // Distributed fee = coinbaseWeiDelta inside distributeRevenue
        // For legacy txs: (gasPrice - baseFee) * gasUsed
        const actualDistributedFee = (TX_GAS_PRICE - baseFee) * receipt!.gasUsed;

        // Block-level balance deltas: query at (N-1) and (N) for single-block accuracy
        const prev = receipt!.blockNumber - 1;
        const curr = receipt!.blockNumber;

        const balBefore = {
            coinbase: await provider.getBalance(actualCoinbase, prev),
            treasury: await provider.getBalance(TREASURY.address, prev),
            provider: await provider.getBalance(PROVIDER_WALLET.address, prev),
            sender:   await provider.getBalance(sender.address, prev),
        };
        const balAfter = {
            coinbase: await provider.getBalance(actualCoinbase, curr),
            treasury: await provider.getBalance(TREASURY.address, curr),
            provider: await provider.getBalance(PROVIDER_WALLET.address, curr),
            sender:   await provider.getBalance(sender.address, curr),
        };

        // Expected shares (integer division — matches distributeRevenue in Java)
        const senderShare   = actualDistributedFee * SENDER_RATIO   / 100n;
        const coinbaseShare = actualDistributedFee * COINBASE_RATIO / 100n;
        const providerShare = actualDistributedFee * PROVIDER_RATIO / 100n;
        const treasuryShare = actualDistributedFee * TREASURY_RATIO / 100n;
        const remainder     = actualDistributedFee - senderShare - coinbaseShare - providerShare - treasuryShare;

        console.log(`      Coinbase: ${actualCoinbase}`);
        console.log(`      Base fee: ${ethers.formatUnits(baseFee, "gwei")} gwei`);
        console.log(`      Gas used: ${receipt!.gasUsed}`);
        console.log(`      Distributed fee: ${ethers.formatUnits(actualDistributedFee, "gwei")} gwei`);
        console.log(`      Expected splits:`);
        console.log(`        sender  (${SENDER_RATIO}%): ${ethers.formatUnits(senderShare, "gwei")} gwei`);
        console.log(`        coinbase(${COINBASE_RATIO}%): ${ethers.formatUnits(coinbaseShare + remainder, "gwei")} gwei (inc. dust=${remainder})`);
        console.log(`        provider(${PROVIDER_RATIO}%): ${ethers.formatUnits(providerShare, "gwei")} gwei`);
        console.log(`        treasury(${TREASURY_RATIO}%): ${ethers.formatUnits(treasuryShare, "gwei")} gwei`);

        // Coinbase gets coinbaseShare + integer-division remainder (dust)
        const coinbaseDelta = balAfter.coinbase - balBefore.coinbase;
        assertCondition(coinbaseDelta === coinbaseShare + remainder,
            `Coinbase received ${ethers.formatUnits(coinbaseDelta, "gwei")} gwei (expected ${ethers.formatUnits(coinbaseShare + remainder, "gwei")})`);

        const treasuryDelta = balAfter.treasury - balBefore.treasury;
        assertCondition(treasuryDelta === treasuryShare,
            `Treasury received ${ethers.formatUnits(treasuryDelta, "gwei")} gwei (expected ${ethers.formatUnits(treasuryShare, "gwei")})`);

        const providerDelta = balAfter.provider - balBefore.provider;
        assertCondition(providerDelta === providerShare,
            `Provider received ${ethers.formatUnits(providerDelta, "gwei")} gwei (expected ${ethers.formatUnits(providerShare, "gwei")})`);

        // Sender net cost = full gas paid upfront − cashback received
        const totalGasCost    = TX_GAS_PRICE * receipt!.gasUsed;
        const expectedNetCost = totalGasCost - senderShare;
        const senderNetCost   = balBefore.sender - balAfter.sender;
        assertCondition(senderNetCost === expectedNetCost,
            `Sender net cost ${ethers.formatUnits(senderNetCost, "gwei")} gwei (expected ${ethers.formatUnits(expectedNetCost, "gwei")})`);
    }

    // ───────────────────────────────────────────────────────────────────────
    // PART 3 — Both active simultaneously
    // ───────────────────────────────────────────────────────────────────────
    section("PART 3 — GasPrice floor + Revenue split active simultaneously");

    // At this point: floor = 1000 gwei (enabled), revenue ratio enabled
    // 3.1 — Tx below floor must still be excluded even when revenue ratio is on
    console.log(`\n  [3.1] Tx at 1 gwei with both enforcement and revenue split active (should be excluded)...`);
    await expectNotMined(provider, rejectionSender, admin.address, ethers.parseUnits("1", "gwei"),
        "Tx at 1 gwei excluded even with revenue split active", 1, 90_000);

    // 3.2 — Tx at floor passes and split is applied
    console.log(`\n  [3.2] Tx at ${FLOOR_GWEI} gwei with both active (should succeed with split)...`);
    {
        const receipt = await sendLegacyTx(provider, sender, admin.address, FLOOR_WEI);
        assertCondition(receipt?.status === 1, "Tx at floor succeeds with both features active");

        const txBlock        = await provider.getBlock(receipt!.blockNumber);
        const actualCoinbase = txBlock!.miner;
        const baseFee        = txBlock!.baseFeePerGas ?? 0n;
        const distributedFee = (FLOOR_WEI - baseFee) * receipt!.gasUsed;

        const prev = receipt!.blockNumber - 1;
        const curr = receipt!.blockNumber;

        const treasuryBefore = await provider.getBalance(TREASURY.address, prev);
        const treasuryAfter  = await provider.getBalance(TREASURY.address, curr);
        const providerBefore = await provider.getBalance(PROVIDER_WALLET.address, prev);
        const providerAfter  = await provider.getBalance(PROVIDER_WALLET.address, curr);

        const expectedTreasury = distributedFee * TREASURY_RATIO / 100n;
        const expectedProvider = distributedFee * PROVIDER_RATIO / 100n;

        assertCondition(treasuryAfter - treasuryBefore === expectedTreasury,
            `Treasury split correct (${ethers.formatUnits(treasuryAfter - treasuryBefore, "gwei")} gwei)`);
        assertCondition(providerAfter - providerBefore === expectedProvider,
            `Provider split correct (${ethers.formatUnits(providerAfter - providerBefore, "gwei")} gwei)`);
    }

    // ───────────────────────────────────────────────────────────────────────
    // CLEANUP — leave GasPrice enabled at floor, disable revenue ratio
    // (so other tests/scripts are not affected)
    // ───────────────────────────────────────────────────────────────────────
    {
        const txClean = await rrContract.disable(adminTxOpts);
        await txClean.wait(1);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Suite C Summary
    // ───────────────────────────────────────────────────────────────────────
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  SUITE C Summary`);
    if (failures.length > 0) {
        console.log(`\n  Failed assertions:`);
        failures.forEach(f => console.log(`    ✗ ${f}`));
    }
    console.log(`${"═".repeat(70)}\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
