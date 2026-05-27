/**
 * Benchmark 11: Dual Program Fee Grant Expiry Test
 *
 * Tests 2 program-specific grants for 1 user with different limits & expiry:
 *   Program A (Counter1): 10 ETH limit, expires in 5 minutes
 *   Program B (Counter2): 30 ETH limit, expires in 7 minutes
 *
 * Then spams counter.inc() on both, alternating between them,
 * observing grant depletion, expiry transitions, and fallback behavior.
 */

import { ethers, Wallet, parseUnits, ContractFactory } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const ADMIN_KEY = process.env.ADMIN || process.env.PRIV_KEY;
const USER_KEY = process.env.PRIV_KEY;
const FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

const GRANT_ABI = [
    "function initializeOwner(address) external returns (bool)",
    "function initialized() view returns (uint256)",
    "function owner() view returns (address)",
    "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
    "function revokeFeeGrant(address grantee, address program) returns (bool)",
    "function isGrantedForProgram(address grantee, address program) view returns (bool)",
    "function isExpired(address grantee, address program) view returns (bool)",
    "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
];

const COUNTER_ARTIFACT_PATH = resolve(__dirname, "../artifacts/contracts/Counter.sol/Counter.json");

const gasPrice = parseUnits("2000", "gwei");
const GAS_LIMIT = 100000;

// ── Gas helper ──
// Precompile admin calls need an explicit gasPrice that meets the GasPrice precompile
// minimum (slot 3 of 0x1003). Without it, eth_estimateGas sends a zero-gasPrice simulation
// which validateMinGasPrice rejects with TRANSACTION_PRICE_TOO_LOW.
//
// type:0 vs type:2: this chain's genesis has no baseFeePerGas, so baseFee=0 and both tx
// types work. type:0 is used here because getFeeData() always returns a concrete gasPrice
// for legacy chains, whereas type:2 depends on EIP-1559 fee estimation which may be
// unreliable on QBFT chains without a live baseFee.
async function getAdminOverrides(provider: ethers.JsonRpcProvider) {
    const feeData = await provider.getFeeData();
    const gp = feeData.gasPrice ?? parseUnits("1000", "gwei");
    return { type: 0 as const, gasPrice: gp };
}

// ───────────────────────── HELPERS ─────────────────────────

interface GrantConfig {
    label: string;
    amountEth: string;
    expiryMinutes: number;
    counterAddress: string;
}

interface GrantStats {
    label: string;
    program: string;
    sent: number;
    reverted: number;
    errors: number;
    grantUsedCount: number;
    senderPaidCount: number;
    depleted: boolean;
    depletedAt: string;
    expired: boolean;
    expiredAt: string;
}

async function deployCounter(admin: Wallet, counterArtifact: any, label: string): Promise<string> {
    console.log(`   📦 Deploying ${label}...`);
    const factory = new ContractFactory(counterArtifact.abi, counterArtifact.bytecode, admin);
    const counter = await factory.deploy({ gasPrice });
    await counter.waitForDeployment();
    const addr = await counter.getAddress();
    console.log(`   ✅ ${label}: ${addr}`);
    return addr;
}

async function setupGrant(
    precompile: ethers.Contract,
    admin: Wallet,
    grantee: string,
    program: string,
    amountEth: string,
    expiryMinutes: number,
    currentBlock: number,
    blockTimeSec: number,
    label: string
): Promise<void> {
    // Revoke existing grant if any
    const adminOverrides = await getAdminOverrides(admin.provider as ethers.JsonRpcProvider);

    const exists = await precompile.isGrantedForProgram(grantee, program);
    if (exists) {
        console.log(`   🗑️  Revoking old ${label} grant...`);
        const rtx = await precompile.revokeFeeGrant(grantee, program, adminOverrides);
        await rtx.wait(1);
    }

    // Use a non-zero block-based expiry so this remains a normal limited-time grant.
    // Under the current Besu precompile rules, normal grants may be unlimited in one
    // dimension, but not both. This benchmark uses a limited-time, budgeted grant.
    const blocksUntilExpiry = Math.max(1, Math.ceil((expiryMinutes * 60) / blockTimeSec));
    const endTimeBlock = currentBlock + blocksUntilExpiry;

    const spendLimit = ethers.parseEther(amountEth);
    // Use a basic allowance grant. In the current Besu precompile, any non-zero
    // `period` with non-zero `periodLimit` is treated as a periodic allowance and
    // validated with stricter invariants. This benchmark models total-budget
    // depletion plus expiry, so a basic allowance is the correct fit.
    const period = 0;
    const periodLimit = 0;

    const [initialized, owner, stillGranted] = await Promise.all([
        precompile.initialized().catch(() => 0n),
        precompile.owner().catch(() => ethers.ZeroAddress),
        precompile.isGrantedForProgram(grantee, program).catch(() => false),
    ]);

    console.log(
        `   🔎 ${label} preflight: initialized=${initialized.toString()} owner=${owner} exists=${stillGranted} spendLimit=${amountEth}ETH endTimeBlock=${endTimeBlock}`
    );

    // Pre-check with staticCall — pass live gasPrice so GasPrice precompile accepts the simulation
    const willSucceed = await precompile.setFeeGrant.staticCall(
        admin.address, grantee, program, spendLimit, period, periodLimit, endTimeBlock,
        adminOverrides
    );
    if (!willSucceed) {
        throw new Error(`setFeeGrant would return FALSE for ${label} (spendLimit=${amountEth} ETH, endTimeBlock=${endTimeBlock}, blocksUntilExpiry=${blocksUntilExpiry})`);
    }

    const tx = await precompile.setFeeGrant(
        admin.address, grantee, program, spendLimit, period, periodLimit, endTimeBlock,
        adminOverrides
    );
    const receipt = await tx.wait(1);

    const upfrontCost = BigInt(GAS_LIMIT) * gasPrice;
    const estTxs = Number(spendLimit / upfrontCost);

    console.log(`   ✅ ${label}: ${amountEth} ETH, expires block ${endTimeBlock} (~${expiryMinutes}min), ~${estTxs} txs`);
    console.log(`      Created in block ${receipt.blockNumber}`);
}

async function getGrantStatus(precompile: ethers.Contract, grantee: string, program: string) {
    const isGranted = await precompile.isGrantedForProgram(grantee, program);
    if (!isGranted) return { granted: false, expired: false, remaining: 0n };
    const isExp = await precompile.isExpired(grantee, program);
    let remaining = 0n;
    try {
        const g = await precompile.grant(grantee, program);
        remaining = g.spendLimit < g.periodCanSpend ? g.spendLimit : g.periodCanSpend;
    } catch { }
    return { granted: true, expired: isExp, remaining };
}

// ───────────────────────── MAIN ─────────────────────────


async function waitForReceiptAllowRevert(provider: ethers.Provider, txResponse: ethers.TransactionResponse) {
    const receipt = await txResponse.wait(1);
    if (!receipt) {
        throw new Error(`Transaction ${txResponse.hash} was not mined`);
    }
    return receipt;
}

function formatGrantReadback(grantData: any): string[] {
    const lines: string[] = [];
    const allowance = BigInt(grantData.allowance ?? 0n);
    const spendLimit = BigInt(grantData.spendLimit ?? 0n);
    const periodLimit = BigInt(grantData.periodLimit ?? 0n);
    const periodCanSpend = BigInt(grantData.periodCanSpend ?? 0n);
    const period = BigInt(grantData.period ?? 0n);

    lines.push(`Configured spendLimit field: ${ethers.formatEther(spendLimit)} ETH`);

    if (allowance === 2n || period > 0n || periodLimit > 0n) {
        lines.push(`Periodic field snapshot: periodLimit=${ethers.formatEther(periodLimit)} ETH, periodCanSpend=${ethers.formatEther(periodCanSpend)} ETH`);
    } else {
        lines.push(`Periodic field snapshot: N/A (basic allowance; period=0, periodLimit=0)`);
    }

    return lines;
}

function formatPayerShift(userDiff: bigint, granterDiff: bigint): string[] {
    const lines: string[] = [];
    if (userDiff > 0n && granterDiff > 0n) {
        lines.push("Observed payer mix: both sender and granter spent ETH during the run.");
        if (userDiff < granterDiff) {
            lines.push("Interpretation: early txs were grant-funded, then fallback to sender dominated after the grant became unusable for tx upfront cost.");
        } else {
            lines.push("Interpretation: sender-paid fallback dominated a significant portion of the run.");
        }
    } else if (granterDiff > 0n) {
        lines.push("Observed payer mix: granter-funded only.");
    } else if (userDiff > 0n) {
        lines.push("Observed payer mix: sender-funded only (grant path did not materially cover execution during the measured window).");
    } else {
        lines.push("Observed payer mix: no ETH balance movement detected.");
    }
    return lines;
}
async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║   Benchmark 11: Dual Program Grant — Depletion & Expiry Test      ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const admin = new Wallet(ADMIN_KEY!, provider);
    const user = new Wallet(USER_KEY!, provider);

    console.log(`👮 Admin: ${admin.address}`);
    console.log(`👤 User:  ${user.address}`);

    if (!fs.existsSync(COUNTER_ARTIFACT_PATH)) {
        throw new Error("❌ Counter artifact not found. Compile first.");
    }
    const counterArtifact = JSON.parse(fs.readFileSync(COUNTER_ARTIFACT_PATH, "utf-8"));

    // 1. Deploy 2 Counters
    console.log("\n── Step 1: Deploy Counters ──");
    const counterA = await deployCounter(admin, counterArtifact, "Counter A");
    const counterB = await deployCounter(admin, counterArtifact, "Counter B");

    // 2. Estimate block time
    const block1 = await provider.getBlock("latest");
    const block0 = await provider.getBlock(Math.max(0, block1!.number - 10));
    const blockTimeSec = block0 && block1
        ? Math.max(1, Math.round((block1.timestamp - block0.timestamp) / 10))
        : 1;
    const currentBlock = block1!.number;
    console.log(`\n   ⏱  Block time: ~${blockTimeSec}s, current block: ${currentBlock}`);

    // 3. Create Grants
    console.log("\n── Step 2: Create Program-Specific Grants ──");
    const precompile = new ethers.Contract(FEE_GRANT_ADDRESS, GRANT_ABI, admin);

    const mainAdminOverrides = await getAdminOverrides(provider);

    const precompileInitialized = await precompile.initialized().catch(() => 0n);
    if (BigInt(precompileInitialized) === 0n) {
        console.log("   Initializing precompile owner...");
        const tx = await precompile.initializeOwner(admin.address, mainAdminOverrides);
        await tx.wait(1);
    }

    // Also revoke any wildcard grant to avoid interference
    const wildcardExists = await precompile.isGrantedForProgram(user.address, ethers.ZeroAddress);
    if (wildcardExists) {
        console.log("   🗑️  Revoking existing wildcard grant...");
        const rtx = await precompile.revokeFeeGrant(user.address, ethers.ZeroAddress, mainAdminOverrides);
        await rtx.wait(1);
        console.log("   ✅ Wildcard grant revoked");
    }

    await setupGrant(precompile, admin, user.address, counterA, "10", 5, currentBlock, blockTimeSec, "Grant A");
    await setupGrant(precompile, admin, user.address, counterB, "30", 7, currentBlock, blockTimeSec, "Grant B");

    // Pre-check
    const statusA = await getGrantStatus(precompile, user.address, counterA);
    const statusB = await getGrantStatus(precompile, user.address, counterB);
    console.log(`\n   📋 Grant A: granted=${statusA.granted}, remaining=${ethers.formatEther(statusA.remaining)} ETH`);
    console.log(`   📋 Grant B: granted=${statusB.granted}, remaining=${ethers.formatEther(statusB.remaining)} ETH`);

    // Capture balances BEFORE
    const userBalBefore = await provider.getBalance(user.address);
    const granterBalBefore = await provider.getBalance(admin.address);

    // 4. Stress Test — alternate between programs
    const totalDuration = parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || "480") * 1000; // 8 min default
    console.log(`\n── Step 3: Spam inc() for ${totalDuration / 1000}s (alternating A/B) ──`);

    const contractA = new ethers.Contract(counterA, counterArtifact.abi, user);
    const contractB = new ethers.Contract(counterB, counterArtifact.abi, user);

    let nonce = await provider.getTransactionCount(user.address, "latest");

    const statsA: GrantStats = {
        label: "A", program: counterA,
        sent: 0, reverted: 0, errors: 0, grantUsedCount: 0, senderPaidCount: 0,
        depleted: false, depletedAt: "", expired: false, expiredAt: "",
    };
    const statsB: GrantStats = {
        label: "B", program: counterB,
        sent: 0, reverted: 0, errors: 0, grantUsedCount: 0, senderPaidCount: 0,
        depleted: false, depletedAt: "", expired: false, expiredAt: "",
    };

    const startTime = Date.now();
    const endTime = startTime + totalDuration;
    let tick = 0;
    let lastCheckTime = Date.now();
    const CHECK_INTERVAL = 15000; // check grant status every 15s

    while (Date.now() < endTime) {
        // Alternate A and B
        const isA = tick % 2 === 0;
        const contract = isA ? contractA : contractB;
        const stats = isA ? statsA : statsB;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

        process.stdout.write(`\r[${elapsed}s] A:${statsA.sent}✅${statsA.reverted}↩${statsA.errors}❌ | B:${statsB.sent}✅${statsB.reverted}↩${statsB.errors}❌ | nonce:${nonce}  `);

        try {
            const tx = await contract.inc({ nonce, gasLimit: GAS_LIMIT, gasPrice });
            nonce++;
            const receipt = await waitForReceiptAllowRevert(provider, tx);

            if (receipt.status === 0) {
                stats.reverted++;
            } else {
                stats.sent++;
            }
        } catch (e: any) {
            const msg = e.message || "";
            if (msg.includes("nonce") || msg.includes("replacement")) {
                const newNonce = await provider.getTransactionCount(user.address, "latest");
                if (newNonce > nonce) nonce = newNonce;
            }
            stats.errors++;
        }

        tick++;

        // Periodic grant status check
        if (Date.now() - lastCheckTime > CHECK_INTERVAL) {
            lastCheckTime = Date.now();
            const elapsedStr = ((Date.now() - startTime) / 1000).toFixed(0);
            const curBlock = await provider.getBlockNumber();

            for (const s of [statsA, statsB]) {
                const gs = await getGrantStatus(precompile, user.address, s.program);

                if (!s.depleted && gs.remaining < BigInt(GAS_LIMIT) * gasPrice) {
                    s.depleted = true;
                    s.depletedAt = `${elapsedStr}s (block ${curBlock})`;
                    console.log(`\n   ⚡ Grant ${s.label} OPERATIONALLY DEPLETED at ${s.depletedAt} — next tx upfront cost exceeds current usable grant path (${ethers.formatEther(gs.remaining)} ETH snapshot)`);
                }

                if (!s.expired && gs.expired) {
                    s.expired = true;
                    s.expiredAt = `${elapsedStr}s (block ${curBlock})`;
                    console.log(`\n   ⏰ Grant ${s.label} EXPIRED at ${s.expiredAt}`);
                }
            }
        }
    }

    // Final status check
    const finalBlock = await provider.getBlockNumber();
    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);

    for (const s of [statsA, statsB]) {
        const gs = await getGrantStatus(precompile, user.address, s.program);
        if (!s.depleted && gs.remaining < BigInt(GAS_LIMIT) * gasPrice) {
            s.depleted = true;
            s.depletedAt = `${elapsedTotal}s (block ${finalBlock})`;
        }
        if (!s.expired && gs.expired) {
            s.expired = true;
            s.expiredAt = `${elapsedTotal}s (block ${finalBlock})`;
        }
    }

    // Capture balances AFTER
    const userBalAfter = await provider.getBalance(user.address);
    const granterBalAfter = await provider.getBalance(admin.address);
    const userDiff = userBalBefore - userBalAfter;
    const granterDiff = granterBalBefore - granterBalAfter;

    // Get final grant states
    const finalA = await getGrantStatus(precompile, user.address, counterA);
    const finalB = await getGrantStatus(precompile, user.address, counterB);

    let grantADetails: any = null;
    let grantBDetails: any = null;
    try { grantADetails = await precompile.grant(user.address, counterA); } catch { }
    try { grantBDetails = await precompile.grant(user.address, counterB); } catch { }

    // ─────────── RESULTS ───────────
    console.log("\n\n╔════════════════════════════════════════════════════════════════════╗");
    console.log("║                      BENCHMARK 11 RESULTS                         ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝");

    console.log(`\n⏱  Duration: ${elapsedTotal}s`);
    console.log(`📊 Total Sent: ${statsA.sent + statsB.sent} (A:${statsA.sent} + B:${statsB.sent})`);
    console.log(`↩️  Total Reverted But Mined: ${statsA.reverted + statsB.reverted} (A:${statsA.reverted} + B:${statsB.reverted})`);
    console.log(`❌ Total Errors: ${statsA.errors + statsB.errors} (A:${statsA.errors} + B:${statsB.errors})`);
    console.log(`📊 Chain Inclusion Rate: ${((statsA.sent + statsB.sent + statsA.reverted + statsB.reverted) / parseFloat(elapsedTotal)).toFixed(1)} tx/s`);

    console.log(`\n── Grant A (10 ETH, 5min expiry) — ${counterA} ──`);
    console.log(`   Succeeded: ${statsA.sent} | Reverted but mined: ${statsA.reverted} | Errors: ${statsA.errors}`);
    console.log(`   Operationally depleted for current tx pricing: ${statsA.depleted ? `YES at ${statsA.depletedAt}` : "NO"}`);
    console.log(`   Expired:  ${statsA.expired ? `YES at ${statsA.expiredAt}` : "NO"}`);
    if (grantADetails) {
        for (const line of formatGrantReadback(grantADetails)) {
            console.log(`   ${line}`);
        }
    }

    console.log(`\n── Grant B (30 ETH, 7min expiry) — ${counterB} ──`);
    console.log(`   Succeeded: ${statsB.sent} | Reverted but mined: ${statsB.reverted} | Errors: ${statsB.errors}`);
    console.log(`   Operationally depleted for current tx pricing: ${statsB.depleted ? `YES at ${statsB.depletedAt}` : "NO"}`);
    console.log(`   Expired:  ${statsB.expired ? `YES at ${statsB.expiredAt}` : "NO"}`);
    if (grantBDetails) {
        for (const line of formatGrantReadback(grantBDetails)) {
            console.log(`   ${line}`);
        }
    }

    console.log(`\n── Balance Changes ──`);
    console.log(`   User:    ${ethers.formatEther(userBalBefore)} → ${ethers.formatEther(userBalAfter)} (${userDiff >= 0n ? "-" : "+"}${ethers.formatEther(userDiff >= 0n ? userDiff : -userDiff)} ETH)`);
    console.log(`   Granter: ${ethers.formatEther(granterBalBefore)} → ${ethers.formatEther(granterBalAfter)} (${granterDiff >= 0n ? "-" : "+"}${ethers.formatEther(granterDiff >= 0n ? granterDiff : -granterDiff)} ETH)`);
    for (const line of formatPayerShift(userDiff, granterDiff)) {
        console.log(`   ${line}`);
    }

    console.log(`\n── Timeline ──`);
    const events: { time: string; event: string }[] = [];
    if (statsA.depleted) events.push({ time: statsA.depletedAt, event: "Grant A became unusable for current tx pricing (fallback threshold reached)" });
    if (statsA.expired) events.push({ time: statsA.expiredAt, event: "Grant A expired (5min)" });
    if (statsB.depleted) events.push({ time: statsB.depletedAt, event: "Grant B became unusable for current tx pricing (fallback threshold reached)" });
    if (statsB.expired) events.push({ time: statsB.expiredAt, event: "Grant B expired (7min)" });
    events.sort((a, b) => parseFloat(a.time) - parseFloat(b.time));

    if (events.length === 0) {
        console.log("   No depletion or expiry events occurred during the test.");
    } else {
        for (const e of events) {
            console.log(`   ${e.time}: ${e.event}`);
        }
    }
    console.log("");
}

main().catch(console.error);
