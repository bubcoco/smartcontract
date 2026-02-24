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
    "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
    "function revokeFeeGrant(address grantee, address program) returns (bool)",
    "function isGrantedForProgram(address grantee, address program) view returns (bool)",
    "function isExpired(address grantee, address program) view returns (bool)",
    "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
];

const COUNTER_ARTIFACT_PATH = resolve(__dirname, "../artifacts/contracts/Counter.sol/Counter.json");

const gasPrice = parseUnits("2000", "gwei");
const GAS_LIMIT = 100000;

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
    const exists = await precompile.isGrantedForProgram(grantee, program);
    if (exists) {
        console.log(`   🗑️  Revoking old ${label} grant...`);
        const rtx = await precompile.revokeFeeGrant(grantee, program);
        await rtx.wait(1);
    }

    // Calculate block-based endTime
    const blocksUntilExpiry = Math.ceil((expiryMinutes * 60) / blockTimeSec);
    const endTimeBlock = currentBlock + blocksUntilExpiry;

    const spendLimit = ethers.parseEther(amountEth);
    const period = 3600 * 24 * 365; // 1 year period
    const periodLimit = spendLimit;

    // Pre-check with staticCall
    const willSucceed = await precompile.setFeeGrant.staticCall(
        admin.address, grantee, program, spendLimit, period, periodLimit, endTimeBlock
    );
    if (!willSucceed) {
        throw new Error(`setFeeGrant would return FALSE for ${label}`);
    }

    const tx = await precompile.setFeeGrant(
        admin.address, grantee, program, spendLimit, period, periodLimit, endTimeBlock
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
    const block0 = await provider.getBlock(block1!.number - 10);
    const blockTimeSec = block0 && block1
        ? Math.max(1, Math.round((block1.timestamp - block0.timestamp) / 10))
        : 1;
    const currentBlock = block1!.number;
    console.log(`\n   ⏱  Block time: ~${blockTimeSec}s, current block: ${currentBlock}`);

    // 3. Create Grants
    console.log("\n── Step 2: Create Program-Specific Grants ──");
    const precompile = new ethers.Contract(FEE_GRANT_ADDRESS, GRANT_ABI, admin);

    // Also revoke any wildcard grant to avoid interference
    const wildcardExists = await precompile.isGrantedForProgram(user.address, ethers.ZeroAddress);
    if (wildcardExists) {
        console.log("   🗑️  Revoking existing wildcard grant...");
        const rtx = await precompile.revokeFeeGrant(user.address, ethers.ZeroAddress);
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
        sent: 0, errors: 0, grantUsedCount: 0, senderPaidCount: 0,
        depleted: false, depletedAt: "", expired: false, expiredAt: "",
    };
    const statsB: GrantStats = {
        label: "B", program: counterB,
        sent: 0, errors: 0, grantUsedCount: 0, senderPaidCount: 0,
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

        process.stdout.write(`\r[${elapsed}s] A:${statsA.sent}✅${statsA.errors}❌ | B:${statsB.sent}✅${statsB.errors}❌ | nonce:${nonce}  `);

        try {
            await contract.inc({ nonce, gasLimit: GAS_LIMIT, gasPrice });
            stats.sent++;
            nonce++;
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
                    console.log(`\n   ⚡ Grant ${s.label} DEPLETED at ${s.depletedAt} — remaining: ${ethers.formatEther(gs.remaining)} ETH`);
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
    console.log(`❌ Total Errors: ${statsA.errors + statsB.errors} (A:${statsA.errors} + B:${statsB.errors})`);
    console.log(`📊 Rate: ${((statsA.sent + statsB.sent) / parseFloat(elapsedTotal)).toFixed(1)} tx/s`);

    console.log(`\n── Grant A (10 ETH, 5min expiry) — ${counterA} ──`);
    console.log(`   Sent: ${statsA.sent} | Errors: ${statsA.errors}`);
    console.log(`   Depleted: ${statsA.depleted ? `YES at ${statsA.depletedAt}` : "NO"}`);
    console.log(`   Expired:  ${statsA.expired ? `YES at ${statsA.expiredAt}` : "NO"}`);
    if (grantADetails) {
        console.log(`   Remaining: spendLimit=${ethers.formatEther(grantADetails.spendLimit)} ETH, periodCanSpend=${ethers.formatEther(grantADetails.periodCanSpend)} ETH`);
    }

    console.log(`\n── Grant B (30 ETH, 7min expiry) — ${counterB} ──`);
    console.log(`   Sent: ${statsB.sent} | Errors: ${statsB.errors}`);
    console.log(`   Depleted: ${statsB.depleted ? `YES at ${statsB.depletedAt}` : "NO"}`);
    console.log(`   Expired:  ${statsB.expired ? `YES at ${statsB.expiredAt}` : "NO"}`);
    if (grantBDetails) {
        console.log(`   Remaining: spendLimit=${ethers.formatEther(grantBDetails.spendLimit)} ETH, periodCanSpend=${ethers.formatEther(grantBDetails.periodCanSpend)} ETH`);
    }

    console.log(`\n── Balance Changes ──`);
    console.log(`   User:    ${ethers.formatEther(userBalBefore)} → ${ethers.formatEther(userBalAfter)} (${userDiff >= 0n ? "-" : "+"}${ethers.formatEther(userDiff >= 0n ? userDiff : -userDiff)} ETH)`);
    console.log(`   Granter: ${ethers.formatEther(granterBalBefore)} → ${ethers.formatEther(granterBalAfter)} (${granterDiff >= 0n ? "-" : "+"}${ethers.formatEther(granterDiff >= 0n ? granterDiff : -granterDiff)} ETH)`);

    console.log(`\n── Timeline ──`);
    const events: { time: string; event: string }[] = [];
    if (statsA.depleted) events.push({ time: statsA.depletedAt, event: "Grant A depleted (10 ETH used)" });
    if (statsA.expired) events.push({ time: statsA.expiredAt, event: "Grant A expired (5min)" });
    if (statsB.depleted) events.push({ time: statsB.depletedAt, event: "Grant B depleted (30 ETH used)" });
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
