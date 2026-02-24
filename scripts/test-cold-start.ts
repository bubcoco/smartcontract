/**
 * ============================================================
 *  Cold Start Latency Test for Besu / Polygon Edge (IBFT 2.0)
 * ============================================================
 *
 * Purpose:
 *   Verify that the node "wakes up" immediately when a transaction
 *   is submitted during an empty-block sleep period, rather than
 *   waiting for the full xemptyblockperiodseconds timer to expire.
 *   Also validates that block production cadence matches
 *   blockperiodseconds under sustained transaction load.
 *
 * How it works:
 *   Phase 1 — Wait for the chain to enter sleep mode (no new blocks).
 *   Phase 2 — Send a single wake-up tx and measure cold-start latency.
 *   Phase 3 — Fire a burst of transactions simultaneously and verify
 *             that consecutive blocks are spaced at ~blockperiodseconds.
 *
 * Usage:
 *   npx tsx scripts/test-cold-start.ts
 *   npx hardhat run scripts/test-cold-start.ts --network loaffinity
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load .env from the project root
dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

// ─────────────────────────────────────────────────────────────
//  🔧 CONFIGURATION — Edit these values to match your setup
// ─────────────────────────────────────────────────────────────

/**
 * Your node's JSON-RPC URL.
 * Change this if your node is running on a different host/port.
 */
const RPC_URL = "http://localhost:8545";

/**
 * Private key of a funded account.
 * Loaded from the PRIV_KEY variable in your .env file.
 * Make sure .env contains:  PRIV_KEY=0xYourPrivateKeyHere
 */
const PRIVATE_KEY = process.env.PRIV_KEY!;

if (!PRIVATE_KEY) {
    console.error("  ❌ PRIV_KEY is not set in your .env file.");
    process.exit(1);
}

/**
 * How many seconds of inactivity (no new block) before we consider
 * the chain to be "sleeping".  Should be greater than blockperiodseconds (4s)
 * but less than xemptyblockperiodseconds (45s).
 */
const SLEEP_THRESHOLD_SECONDS = 10;

/**
 * Maximum time (seconds) to pass before we consider wake-on-tx a failure.
 * With blockperiodseconds = 4s, a healthy wake should mine within ~4-5s.
 */
const PASS_THRESHOLD_SECONDS = 6;

/**
 * How often (ms) we poll for new blocks while waiting for sleep.
 */
const POLL_INTERVAL_MS = 1000;

/**
 * Maximum time (seconds) to wait for the chain to enter sleep mode
 * before giving up.
 */
const MAX_WAIT_FOR_SLEEP_SECONDS = 120;

/**
 * Number of rounds (intervals) in Phase 3.
 * One transaction is sent per round.
 */
const INTERVAL_ROUNDS = 10;

/**
 * Delay between each round in Phase 3 (milliseconds).
 * Set to ~2s so transactions span multiple block periods.
 */
const INTERVAL_DELAY_MS = 2000;

/**
 * Expected block period in seconds (after transition at block 800).
 * Used in Phase 3 to validate block timing.
 */
const EXPECTED_BLOCK_PERIOD_SECONDS = 4;

/**
 * Tolerance (±seconds) for block period deviation in Phase 3.
 * A gap of EXPECTED ± TOLERANCE is considered acceptable.
 */
const BLOCK_PERIOD_TOLERANCE_SECONDS = 2;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function now(): number {
    return Date.now() / 1000; // seconds
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(seconds: number): string {
    return `${seconds.toFixed(2)}s`;
}

// ─────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  ❄️  Cold Start & Block Period Test");
    console.log("═══════════════════════════════════════════════════════");
    console.log();

    // ── Step 0: Connect ──────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const network = await provider.getNetwork();

    console.log(`  RPC URL       : ${RPC_URL}`);
    console.log(`  Chain ID      : ${network.chainId}`);
    console.log(`  Account       : ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`  Balance       : ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        console.error("\n  ❌ Account has zero balance. Fund it before running this test.");
        process.exit(1);
    }

    console.log(`\n  Sleep threshold: ${SLEEP_THRESHOLD_SECONDS}s  (no new block)`);
    console.log(`  Pass threshold : < ${PASS_THRESHOLD_SECONDS}s  (tx mine time)`);
    console.log();

    // ══════════════════════════════════════════════════════════
    //  Phase 1: Wait for the chain to enter "sleep mode"
    // ══════════════════════════════════════════════════════════
    console.log("──────────────────────────────────────────────────────");
    console.log("  ⏳ Phase 1: Waiting for the chain to enter sleep mode...");
    console.log("──────────────────────────────────────────────────────");

    let lastBlockNumber = await provider.getBlockNumber();
    let lastBlockTime = now();
    const waitStart = now();

    console.log(`  Current block : #${lastBlockNumber}`);
    console.log(`  Watching for ${SLEEP_THRESHOLD_SECONDS}s gap between blocks...\n`);

    let sleeping = false;

    while (!sleeping) {
        // Timeout guard
        if (now() - waitStart > MAX_WAIT_FOR_SLEEP_SECONDS) {
            console.error(
                `\n  ❌ Timeout: Chain did not enter sleep mode within ${MAX_WAIT_FOR_SLEEP_SECONDS}s.`
            );
            console.error(
                "     Make sure xemptyblockperiodseconds is configured and no other"
            );
            console.error("     transactions are being sent to the chain.");
            process.exit(1);
        }

        await sleep(POLL_INTERVAL_MS);

        const currentBlock = await provider.getBlockNumber();

        if (currentBlock > lastBlockNumber) {
            // New block appeared — reset the timer
            const gap = now() - lastBlockTime;
            console.log(
                `  📦 Block #${currentBlock} arrived (gap: ${formatDuration(gap)})`
            );
            lastBlockNumber = currentBlock;
            lastBlockTime = now();
        } else {
            // No new block — check if we've waited long enough
            const idleTime = now() - lastBlockTime;
            if (idleTime >= SLEEP_THRESHOLD_SECONDS) {
                sleeping = true;
                console.log(
                    `\n  💤 Chain is sleeping! No new block for ${formatDuration(idleTime)}.`
                );
                console.log(`     Last block: #${lastBlockNumber}\n`);
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Phase 2: Cold-start wake-up test (single tx)
    // ══════════════════════════════════════════════════════════
    console.log("──────────────────────────────────────────────────────");
    console.log("  🚀 Phase 2: Sending wake-up transaction...");
    console.log("──────────────────────────────────────────────────────");

    let currentNonce = await provider.getTransactionCount(wallet.address, "pending");

    // Build a simple 0-value self-transfer (loaffinity: 100 gwei gas price)
    const tx: ethers.TransactionRequest = {
        to: wallet.address, // self-transfer
        value: 0n,
        nonce: currentNonce,
        gasLimit: 21000n,               // standard transfer gas
        gasPrice: 100000000000n,        // 100 gwei — must match loaffinity min-gas-price
    };

    // Start the timer RIGHT BEFORE sending
    const sendTimestamp = now();
    console.log(`\n  ⏱  Timer started at ${new Date().toISOString()}`);

    const txResponse = await wallet.sendTransaction(tx);
    console.log(`  📤 Tx sent     : ${txResponse.hash}`);
    console.log(`     Nonce       : ${currentNonce}`);
    currentNonce++;

    // Wait for the transaction to be mined
    console.log("\n  ⏳ Waiting for transaction receipt (mining)...\n");

    const receipt = await txResponse.wait();
    const mineTimestamp = now();
    const latency = mineTimestamp - sendTimestamp;

    if (!receipt) {
        console.error("  ❌ Transaction receipt is null — tx may have been dropped.");
        process.exit(1);
    }

    console.log(`  ✅ Tx mined in block #${receipt.blockNumber}`);
    console.log(`     Gas used    : ${receipt.gasUsed.toString()}`);
    console.log(`     Status      : ${receipt.status === 1 ? "Success" : "Failed"}`);

    // Phase 2 verdict
    console.log();
    console.log("══════════════════════════════════════════════════════");
    console.log("  📊 Phase 2 Results — Cold Start Latency");
    console.log("══════════════════════════════════════════════════════");
    console.log();
    console.log(`  Cold-start latency : ${formatDuration(latency)}`);
    console.log();

    const phase2Pass = latency < PASS_THRESHOLD_SECONDS;

    if (phase2Pass) {
        console.log(
            `  ✅ PASS — Wake-on-Tx is working! (${formatDuration(latency)} < ${PASS_THRESHOLD_SECONDS}s)`
        );
        console.log(
            "     The node woke up and mined the transaction promptly."
        );
    } else {
        console.log(
            `  ❌ FAIL — Latency too high (${formatDuration(latency)} ≥ ${PASS_THRESHOLD_SECONDS}s)`
        );
        console.log(
            "     The node likely waited for the xemptyblockperiodseconds timer"
        );
        console.log(
            "     to expire before producing a block. Check your genesis.json"
        );
        console.log(
            "     configuration and ensure xemptyblockperiodseconds is set correctly."
        );
    }

    // ══════════════════════════════════════════════════════════
    //  Phase 3: Block period cadence test (interval rounds)
    // ══════════════════════════════════════════════════════════
    console.log();
    console.log("──────────────────────────────────────────────────────");
    console.log(`  🔥 Phase 3: Block period test — ${INTERVAL_ROUNDS} rounds, ${INTERVAL_DELAY_MS}ms apart`);
    console.log("──────────────────────────────────────────────────────");
    console.log();
    console.log(`  Expected block period : ${EXPECTED_BLOCK_PERIOD_SECONDS}s (±${BLOCK_PERIOD_TOLERANCE_SECONDS}s tolerance)`);
    console.log();

    // Send one transaction per round at fixed intervals
    interface RoundResult {
        round: number;
        hash: string;
        nonce: number;
        sentAt: number;
        receipt: ethers.TransactionReceipt | null;
    }

    const rounds: RoundResult[] = [];

    for (let i = 0; i < INTERVAL_ROUNDS; i++) {
        const roundTx: ethers.TransactionRequest = {
            to: wallet.address,
            value: 0n,
            nonce: currentNonce + i,
            gasLimit: 21000n,
            gasPrice: 100000000000n,
        };

        const sentAt = now();
        const resp = await wallet.sendTransaction(roundTx);
        console.log(`  📤 Round ${i + 1}/${INTERVAL_ROUNDS}  |  nonce ${resp.nonce}  |  ${resp.hash}`);

        rounds.push({
            round: i + 1,
            hash: resp.hash,
            nonce: resp.nonce!,
            sentAt,
            receipt: null,
        });

        // Wait between rounds (skip delay after the last one)
        if (i < INTERVAL_ROUNDS - 1) {
            await sleep(INTERVAL_DELAY_MS);
        }
    }

    // Wait for ALL receipts
    console.log("\n  ⏳ Waiting for all receipts...\n");

    for (const round of rounds) {
        round.receipt = await provider.waitForTransaction(round.hash);
    }

    // Group transactions by block number and get block timestamps
    const blockNumbers = [...new Set(
        rounds
            .filter((r) => r.receipt !== null)
            .map((r) => r.receipt!.blockNumber)
    )].sort((a, b) => a - b);

    console.log(`  📦 Transactions spread across ${blockNumbers.length} block(s):\n`);

    // Fetch block timestamps
    interface BlockInfo {
        number: number;
        timestamp: number;
        txCount: number;
        roundNumbers: number[];
    }

    const blockInfos: BlockInfo[] = [];

    for (const blockNum of blockNumbers) {
        const block = await provider.getBlock(blockNum);
        if (!block) continue;

        const roundsInBlock = rounds.filter(
            (r) => r.receipt !== null && r.receipt!.blockNumber === blockNum
        );

        blockInfos.push({
            number: blockNum,
            timestamp: block.timestamp,
            txCount: roundsInBlock.length,
            roundNumbers: roundsInBlock.map((r) => r.round),
        });
    }

    // Print block details and measure gaps
    const blockGaps: number[] = [];

    for (let i = 0; i < blockInfos.length; i++) {
        const info = blockInfos[i];
        const time = new Date(info.timestamp * 1000).toISOString();
        const roundsLabel = `rounds [${info.roundNumbers.join(",")}]`;

        if (i === 0) {
            console.log(
                `  Block #${info.number}  |  ${time}  |  ${info.txCount} tx(s)  |  ${roundsLabel}  |  (first)`
            );
        } else {
            const gap = info.timestamp - blockInfos[i - 1].timestamp;
            blockGaps.push(gap);
            console.log(
                `  Block #${info.number}  |  ${time}  |  ${info.txCount} tx(s)  |  ${roundsLabel}  |  gap: ${gap}s`
            );
        }
    }

    // Phase 3 verdict
    console.log();
    console.log("══════════════════════════════════════════════════════");
    console.log("  📊 Phase 3 Results — Block Period Cadence");
    console.log("══════════════════════════════════════════════════════");
    console.log();

    let phase3Pass = true;

    if (blockGaps.length === 0) {
        console.log(
            `  ℹ️  All ${INTERVAL_ROUNDS} rounds were mined in a single block #${blockInfos[0].number}.`
        );
        console.log(
            "     Cannot measure inter-block timing. Try increasing INTERVAL_DELAY_MS."
        );
        console.log();
        console.log("  ✅ PASS — Block is batching transactions correctly.");
    } else {
        const avgGap = blockGaps.reduce((a, b) => a + b, 0) / blockGaps.length;
        const minGap = Math.min(...blockGaps);
        const maxGap = Math.max(...blockGaps);

        console.log(`  Block gaps     : [${blockGaps.map((g) => g + "s").join(", ")}]`);
        console.log(`  Average gap    : ${avgGap.toFixed(2)}s`);
        console.log(`  Min / Max gap  : ${minGap}s / ${maxGap}s`);
        console.log(`  Expected       : ${EXPECTED_BLOCK_PERIOD_SECONDS}s (±${BLOCK_PERIOD_TOLERANCE_SECONDS}s)`);
        console.log();

        const lowerBound = EXPECTED_BLOCK_PERIOD_SECONDS - BLOCK_PERIOD_TOLERANCE_SECONDS;
        const upperBound = EXPECTED_BLOCK_PERIOD_SECONDS + BLOCK_PERIOD_TOLERANCE_SECONDS;

        for (let i = 0; i < blockGaps.length; i++) {
            const gap = blockGaps[i];
            const inRange = gap >= lowerBound && gap <= upperBound;

            if (!inRange) {
                phase3Pass = false;
                console.log(
                    `  ❌ Gap ${i + 1}: ${gap}s — OUT OF RANGE (expected ${lowerBound}-${upperBound}s)`
                );
            } else {
                console.log(
                    `  ✅ Gap ${i + 1}: ${gap}s — OK`
                );
            }
        }

        console.log();

        if (phase3Pass) {
            console.log(
                `  ✅ PASS — Block period cadence is correct (~${EXPECTED_BLOCK_PERIOD_SECONDS}s).`
            );
        } else {
            console.log(
                `  ❌ FAIL — Block period deviation detected.`
            );
            console.log(
                "     Some blocks were produced outside the expected interval."
            );
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Final Summary
    // ══════════════════════════════════════════════════════════
    console.log();
    console.log("══════════════════════════════════════════════════════");
    console.log("  🏁 FINAL SUMMARY");
    console.log("══════════════════════════════════════════════════════");
    console.log();
    console.log(`  Phase 2 (Cold Start)    : ${phase2Pass ? "✅ PASS" : "❌ FAIL"}  (${formatDuration(latency)})`);
    console.log(`  Phase 3 (Block Period)  : ${phase3Pass ? "✅ PASS" : "❌ FAIL"}  (${INTERVAL_ROUNDS} rounds, ${blockInfos.length} blocks)`);
    console.log();
    console.log("──────────────────────────────────────────────────────");
    console.log("  Config reference (loaffinity genesis.json):");
    console.log(`    blockperiodseconds         = 2s (initial) → 4s (after block 800)`);
    console.log(`    xemptyblockperiodseconds   = 60s (initial) → 45s (after block 800)`);
    console.log(`    Sleep detection threshold  = ${SLEEP_THRESHOLD_SECONDS}s`);
    console.log(`    Pass/Fail threshold        = ${PASS_THRESHOLD_SECONDS}s`);
    console.log(`    Interval rounds            = ${INTERVAL_ROUNDS} (every ${INTERVAL_DELAY_MS}ms)`);
    console.log(`    Expected block period      = ${EXPECTED_BLOCK_PERIOD_SECONDS}s (±${BLOCK_PERIOD_TOLERANCE_SECONDS}s)`);
    console.log("──────────────────────────────────────────────────────\n");
}

// ─────────────────────────────────────────────────────────────
//  Entry point
// ─────────────────────────────────────────────────────────────

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n  ❌ Unhandled error:\n", error);
        process.exit(1);
    });
