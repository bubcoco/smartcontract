/**
 * Besu QBFT Duration-Based Stress Test (benchmark8.ts)
 * 
 * COMBINES the best of benchmark3 and benchmark7:
 * - Duration-based testing (run for X seconds)
 * - Stable nonce management from benchmark3
 * - Multiple transaction types (native, contract calls)
 * - Controlled parallelism to prevent RPC overload
 * - Fire-and-forget with async confirmation tracking
 * 
 * Usage:
 *   npx tsx benchmark/benchmark8.ts                    # Default (60s test)
 *   npx tsx benchmark/benchmark8.ts --duration=120     # 120 second test
 *   npx tsx benchmark/benchmark8.ts --accounts=30      # More accounts
 *   npx tsx benchmark/benchmark8.ts --pending=5        # Max pending per account
 */

import { ethers, Wallet, Contract, formatEther, parseEther, parseUnits } from "ethers";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('\n⚠️ Uncaught exception:', err.message);
});
process.on('unhandledRejection', () => {
    // Silently handle background promise rejections
});

// Parse CLI arguments
function parseArg(name: string, defaultVal: number): number {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? parseInt(arg.split('=')[1]) : defaultVal;
}

const TURBO_MODE = process.argv.includes('--turbo');

// ===================== CONFIGURATION =====================
const CONFIG = {
    rpcUrl: process.env.RPC_URL || "http://localhost:8545",
    privateKey: process.env.PRIV_KEY || process.env.ADMIN,

    // Test settings - AGGRESSIVE for stress testing
    testDuration: parseArg('duration', 60),
    numAccounts: parseArg('accounts', TURBO_MODE ? 50 : 30),
    maxPendingPerAccount: parseArg('pending', TURBO_MODE ? 30 : 15),

    // Funding
    fundAmount: parseEther("20"),
    txAmount: parseEther("0.001"),

    // Gas
    gasLimit: 21000n,
    gasPrice: parseUnits("1000", "gwei"),

    // Report
    outputDir: "./benchmark/reports",

    // Nonce recovery
    nonceRefreshThreshold: 5,

    // Delays (ms) - minimal for max throughput
    loopDelay: TURBO_MODE ? 1 : 5,
    cooldownMs: 2000,
};

// Counter contract for contract call benchmark
const COUNTER_ABI = [
    "function inc() external",
    "function x() external view returns (uint256)",
];
const COUNTER_BYTECODE = "0x6080604052348015600e575f5ffd5b506101838061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80630c55699c14610043578063371303c01461005d57806370119d0614610067575b5f5ffd5b61004b5f5481565b60405190815260200160405180910390f35b61006561007a565b005b610065610075366004610111565b6100c6565b60015f5f82825461008b9190610128565b9091555050604051600181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a1565b805f5f8282546100d69190610128565b90915550506040518181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a150565b5f60208284031215610121575f5ffd5b5035919050565b8082018082111561014757634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122092ffef3ac73901885453b4eb2430caafac83608a8d165ccf18ff9c81b7e865c664736f6c634300081c0033";

// ===================== TYPES =====================
interface AccountState {
    wallet: ethers.HDNodeWallet;
    address: string;
    nonce: number;
    pendingCount: number;
    txSent: number;
    txConfirmed: number;
    txFailed: number;
    consecutiveErrors: number;
}

interface TxResult {
    hash: string;
    sendTime: number;
    confirmTime?: number;
    latency?: number;
    success: boolean;
}

interface BenchmarkResult {
    name: string;
    duration: number;
    totalSent: number;
    totalConfirmed: number;
    totalFailed: number;
    confirmedTPS: number;
    sendTPS: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    successRate: number;
}

// ===================== HELPERS =====================
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

// ===================== ACCOUNT SETUP =====================
async function setupAccounts(
    provider: ethers.JsonRpcProvider,
    mainWallet: Wallet
): Promise<AccountState[]> {
    console.log(`\n📝 Setting up ${CONFIG.numAccounts} accounts...`);

    const mainBalance = await provider.getBalance(mainWallet.address);
    console.log(`   Main: ${mainWallet.address}`);
    console.log(`   Balance: ${formatEther(mainBalance)} ETH`);

    const accounts: AccountState[] = [];
    let mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");

    // Create and fund accounts
    for (let i = 0; i < CONFIG.numAccounts; i++) {
        const wallet = Wallet.createRandom().connect(provider);
        accounts.push({
            wallet,
            address: wallet.address,
            nonce: 0,
            pendingCount: 0,
            txSent: 0,
            txConfirmed: 0,
            txFailed: 0,
            consecutiveErrors: 0,
        });
    }

    // Fund in batches
    console.log(`   Funding ${accounts.length} accounts...`);
    const batchSize = 5;
    for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);
        const promises = batch.map(async (acc, j) => {
            try {
                const tx = await mainWallet.sendTransaction({
                    to: acc.address,
                    value: CONFIG.fundAmount,
                    gasLimit: 21000n,
                    gasPrice: CONFIG.gasPrice,
                    nonce: mainNonce + j,
                });
                await tx.wait();
            } catch (e) {
                // Retry once
                await sleep(500);
                const tx = await mainWallet.sendTransaction({
                    to: acc.address,
                    value: CONFIG.fundAmount,
                    gasLimit: 21000n,
                    gasPrice: CONFIG.gasPrice,
                });
                await tx.wait();
            }
        });
        mainNonce += batch.length;
        await Promise.all(promises);
        process.stdout.write(`\r   Funded: ${Math.min(i + batchSize, accounts.length)}/${accounts.length}`);
    }
    console.log("");

    // Get nonces
    for (const acc of accounts) {
        acc.nonce = await provider.getTransactionCount(acc.address, "pending");
    }

    console.log(`   ✅ ${accounts.length} accounts ready\n`);
    return accounts;
}

// ===================== DURATION-BASED BENCHMARK =====================
async function runDurationBenchmark(
    name: string,
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider,
    sendTxFn: (account: AccountState) => Promise<ethers.TransactionResponse | null>
): Promise<BenchmarkResult> {
    console.log(`\n🚀 ${name}`);
    console.log(`   Duration: ${CONFIG.testDuration}s`);
    console.log(`   Accounts: ${accounts.length}`);
    console.log(`   Max pending/account: ${CONFIG.maxPendingPerAccount}`);
    console.log(`   Max parallel TX: ${accounts.length * CONFIG.maxPendingPerAccount}`);
    if (TURBO_MODE) console.log(`   ⚡ TURBO MODE ENABLED`);
    console.log("");

    const results: TxResult[] = [];
    const startTime = Date.now();
    const endTime = startTime + CONFIG.testDuration * 1000;

    let totalSent = 0;
    let totalConfirmed = 0;
    let totalFailed = 0;
    let lastProgressTime = startTime;

    // Reset account state
    for (const acc of accounts) {
        acc.nonce = await provider.getTransactionCount(acc.address, "pending");
        acc.pendingCount = 0;
        acc.txSent = 0;
        acc.txConfirmed = 0;
        acc.txFailed = 0;
        acc.consecutiveErrors = 0;
    }

    // Main loop
    while (Date.now() < endTime) {
        const now = Date.now();

        // Send from accounts that have room
        for (const account of accounts) {
            if (account.pendingCount >= CONFIG.maxPendingPerAccount) continue;

            const sendTime = Date.now();
            const usedNonce = account.nonce;

            try {
                const tx = await sendTxFn(account);
                if (!tx) continue;

                account.nonce++;
                account.pendingCount++;
                account.txSent++;
                totalSent++;

                const result: TxResult = {
                    hash: tx.hash,
                    sendTime,
                    success: false,
                };
                results.push(result);

                // Track confirmation asynchronously
                tx.wait().then(receipt => {
                    result.confirmTime = Date.now();
                    result.latency = result.confirmTime - sendTime;
                    result.success = receipt?.status === 1;
                    account.pendingCount--;

                    if (result.success) {
                        account.txConfirmed++;
                        totalConfirmed++;
                        account.consecutiveErrors = 0;
                    } else {
                        account.txFailed++;
                        totalFailed++;
                    }
                }).catch(() => {
                    result.success = false;
                    account.pendingCount--;
                    account.txFailed++;
                    totalFailed++;
                    account.consecutiveErrors++;

                    // Refresh nonce if too many errors
                    if (account.consecutiveErrors >= CONFIG.nonceRefreshThreshold) {
                        provider.getTransactionCount(account.address, "pending").then(n => {
                            account.nonce = n;
                            account.consecutiveErrors = 0;
                        });
                    }
                });

            } catch (error: any) {
                account.consecutiveErrors++;
                if (account.consecutiveErrors >= CONFIG.nonceRefreshThreshold) {
                    account.nonce = await provider.getTransactionCount(account.address, "pending");
                    account.consecutiveErrors = 0;
                }
            }
        }

        // Progress update every second
        if (now - lastProgressTime >= 1000) {
            const elapsed = (now - startTime) / 1000;
            const remaining = Math.max(0, (endTime - now) / 1000);
            const pendingTotal = accounts.reduce((sum, a) => sum + a.pendingCount, 0);
            const tps = elapsed > 0 ? totalConfirmed / elapsed : 0;

            process.stdout.write(
                `\r⚡ Sent: ${totalSent} | ✅ Confirmed: ${totalConfirmed} (${tps.toFixed(1)} TPS) | ` +
                `⏳ Pending: ${pendingTotal} | Time: ${elapsed.toFixed(0)}s (${remaining.toFixed(0)}s left)   `
            );
            lastProgressTime = now;
        }

        await sleep(CONFIG.loopDelay);
    }

    // Wait for pending confirmations (max 30s)
    console.log("\n\n   ⏳ Waiting for pending confirmations...");
    const waitStart = Date.now();
    while (Date.now() - waitStart < 30000) {
        const pending = accounts.reduce((sum, a) => sum + a.pendingCount, 0);
        if (pending === 0) break;
        await sleep(500);
    }

    const duration = Date.now() - startTime;

    // Calculate latencies
    const confirmedResults = results.filter(r => r.success && r.latency);
    const latencies = confirmedResults.map(r => r.latency!);

    const result: BenchmarkResult = {
        name,
        duration,
        totalSent,
        totalConfirmed: confirmedResults.length,
        totalFailed: results.filter(r => !r.success).length,
        confirmedTPS: confirmedResults.length / (duration / 1000),
        sendTPS: totalSent / (duration / 1000),
        avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        p50Latency: percentile(latencies, 50),
        p95Latency: percentile(latencies, 95),
        successRate: totalSent > 0 ? (confirmedResults.length / totalSent) * 100 : 0,
    };

    console.log(`   ✅ Complete: ${result.totalConfirmed} confirmed, ${result.confirmedTPS.toFixed(2)} TPS\n`);
    return result;
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 DURATION-BASED STRESS TEST RESULTS");
    console.log("=".repeat(80));

    let maxTPS = 0;
    let bestName = "";

    for (const r of results) {
        if (r.confirmedTPS > maxTPS) {
            maxTPS = r.confirmedTPS;
            bestName = r.name;
        }

        console.log(`\n📈 ${r.name}`);
        console.log("-".repeat(60));
        console.log(`   Duration:       ${formatDuration(r.duration)}`);
        console.log(`   Total Sent:     ${r.totalSent}`);
        console.log(`   ✅ Confirmed:    ${r.totalConfirmed} (${r.successRate.toFixed(1)}%)`);
        console.log(`   ❌ Failed:       ${r.totalFailed}`);
        console.log(`   🚀 Confirmed TPS: ${r.confirmedTPS.toFixed(2)} TPS`);
        console.log(`   📤 Send TPS:      ${r.sendTPS.toFixed(2)} tx/s`);
        console.log(`   ⏱️  Avg Latency:   ${formatDuration(r.avgLatency)}`);
        console.log(`   ⏱️  P50 Latency:   ${formatDuration(r.p50Latency)}`);
        console.log(`   ⏱️  P95 Latency:   ${formatDuration(r.p95Latency)}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log(`🏆 PEAK CONFIRMED TPS: ${maxTPS.toFixed(2)} TPS (${bestName})`);
    console.log("=".repeat(80));

    // Save JSON
    const jsonPath = `${CONFIG.outputDir}/benchmark8-${timestamp}.json`;
    fs.writeFileSync(jsonPath, JSON.stringify({
        config: {
            testDuration: CONFIG.testDuration,
            numAccounts: CONFIG.numAccounts,
            maxPendingPerAccount: CONFIG.maxPendingPerAccount,
        },
        results,
        timestamp: new Date().toISOString(),
    }, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    // Save HTML
    const htmlPath = `${CONFIG.outputDir}/benchmark8-${timestamp}.html`;
    const html = generateHTML(results, maxTPS, bestName);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTML(results: BenchmarkResult[], maxTPS: number, bestName: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Besu Duration Stress Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); min-height: 100vh; color: #fff; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 2rem; font-size: 2rem; color: #00ff87; }
    .peak { background: rgba(0,255,135,0.1); border: 2px solid #00ff87; border-radius: 20px; padding: 2rem; text-align: center; margin-bottom: 2rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; color: #00ff87; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .card { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 1.5rem; }
    .card h2 { color: #60efff; margin-bottom: 1rem; }
    .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .stat-label { color: #888; }
    .highlight { color: #00ff87; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ Duration-Based Stress Test</h1>
    <div class="peak">
      <div>🏆 Peak Confirmed TPS</div>
      <div class="tps">${maxTPS.toFixed(1)}</div>
      <div>${bestName}</div>
    </div>
    <div class="grid">
      ${results.map(r => `
        <div class="card">
          <h2>${r.name}</h2>
          <div class="stat"><span class="stat-label">Duration</span><span>${formatDuration(r.duration)}</span></div>
          <div class="stat"><span class="stat-label">Sent</span><span>${r.totalSent}</span></div>
          <div class="stat"><span class="stat-label">Confirmed</span><span class="highlight">${r.totalConfirmed}</span></div>
          <div class="stat"><span class="stat-label">Confirmed TPS</span><span class="highlight">${r.confirmedTPS.toFixed(2)}</span></div>
          <div class="stat"><span class="stat-label">Success Rate</span><span>${r.successRate.toFixed(1)}%</span></div>
          <div class="stat"><span class="stat-label">P50 Latency</span><span>${formatDuration(r.p50Latency)}</span></div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
}

// ===================== MAIN =====================
async function main() {
    console.log("\n" + "=".repeat(80));
    console.log("⚡ BESU AGGRESSIVE STRESS TEST (benchmark8)");
    console.log("=".repeat(80));
    console.log("\n📝 Maximum throughput stress test.\n");
    if (TURBO_MODE) {
        console.log("🚀 TURBO MODE: Maximum aggression enabled!\n");
    }

    if (!CONFIG.privateKey) {
        throw new Error("PRIV_KEY not set");
    }

    console.log(`Duration:           ${CONFIG.testDuration}s`);
    console.log(`Accounts:           ${CONFIG.numAccounts}`);
    console.log(`Max Pending/Acct:   ${CONFIG.maxPendingPerAccount}`);
    console.log(`RPC URL:            ${CONFIG.rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, undefined, { staticNetwork: true });
    const mainWallet = new Wallet(CONFIG.privateKey, provider);

    const network = await provider.getNetwork();
    console.log(`Chain ID:           ${network.chainId}`);

    const accounts = await setupAccounts(provider, mainWallet);
    const results: BenchmarkResult[] = [];

    // Native transfer benchmark - use a random address (NOT precompile 0x1!)
    const recipient = Wallet.createRandom().address;
    results.push(await runDurationBenchmark(
        "Native Transfer",
        accounts,
        provider,
        async (account) => {
            return account.wallet.sendTransaction({
                to: recipient,
                value: CONFIG.txAmount,
                gasLimit: CONFIG.gasLimit,
                gasPrice: CONFIG.gasPrice,
                nonce: account.nonce,
            });
        }
    ));

    await sleep(CONFIG.cooldownMs);

    // Counter.inc() benchmark
    console.log("   Deploying Counter contract...");
    const factory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, mainWallet);
    const counter = await factory.deploy({ gasLimit: 500000n });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`   Counter at: ${counterAddress}`);

    results.push(await runDurationBenchmark(
        "Counter.inc()",
        accounts,
        provider,
        async (account) => {
            const c = new Contract(counterAddress, COUNTER_ABI, account.wallet);
            return c.inc({
                gasLimit: 100000n,
                gasPrice: CONFIG.gasPrice,
                nonce: account.nonce,
            });
        }
    ));

    generateReport(results);
    console.log("✅ Benchmark complete!\n");
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
