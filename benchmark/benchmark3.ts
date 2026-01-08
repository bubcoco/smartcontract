/**
 * Besu QBFT Confirmation-Based Benchmark Script
 * 
 * This script measures CONFIRMED transactions, not just submissions.
 * It waits for each transaction to be confirmed before counting it.
 * 
 * Usage:
 *   npx tsx benchmark/benchmark3.ts
 * 
 * BESU CONFIGURATION RECOMMENDATIONS:
 *   For high TPS benchmarking, configure your Besu nodes with:
 *   --tx-pool-limit-by-account-percentage=1.0  (allow one account to fill pool)
 *   --tx-pool-max-size=10000                   (larger transaction pool)
 *   --rpc-tx-feecap=0                          (no fee cap for testing)
 */

import { ethers, Wallet, Contract, Provider, formatEther, parseEther, parseUnits } from "ethers";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { loadDeployedAddresses } from "./deployed-addresses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// Load deployed contract addresses from Ignition
const deployedAddresses = loadDeployedAddresses();

// ===================== CONFIGURATION =====================
const CONFIG = {
    // Network RPC
    rpcUrl: process.env.RPC_URL || "http://localhost:8545",

    // Private key from .env (required)
    privateKey: process.env.PRIV_KEY || process.env.ADMIN,

    // ========== BENCHMARK SETTINGS ==========
    // More accounts = better parallelism = higher TPS
    // 50 accounts allows ~500+ TPS if network supports it
    numAccounts: 50,

    // Total transactions per benchmark test
    totalTransactions: 200,

    // Max concurrent pending transactions per account
    // Keep low (2-3) to avoid nonce gaps on failures
    maxPendingPerAccount: 3,

    // Benchmark modes
    benchmarks: {
        nativeTransfer: true,
        counterInc: true,
        erc20Transfer: true,
    },

    // Report output
    outputDir: "./benchmark/reports",

    // Gas settings (no gasPrice - let network decide)
    gasLimit: 200000n,

    // Re-fetch nonce from network after this many consecutive errors
    nonceRefreshThreshold: 3,
};

// Counter contract ABI and bytecode
const COUNTER_ABI = [
    "function inc() external",
    "function incBy(uint256 by) external",
    "function x() external view returns (uint256)",
    "event Increment(uint256 by)",
];

const COUNTER_BYTECODE = "0x6080604052348015600e575f5ffd5b506101838061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80630c55699c14610043578063371303c01461005d57806370119d0614610067575b5f5ffd5b61004b5f5481565b60405190815260200160405180910390f35b61006561007a565b005b610065610075366004610111565b6100c6565b60015f5f82825461008b9190610128565b9091555050604051600181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a1565b805f5f8282546100d69190610128565b90915550506040518181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a150565b5f60208284031215610121575f5ffd5b5035919050565b8082018082111561014757634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122092ffef3ac73901885453b4eb2430caafac83608a8d165ccf18ff9c81b7e865c664736f6c634300081c0033";

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// ===================== INTERFACES =====================
interface TransactionResult {
    hash: string;
    sendTime: number;
    confirmTime: number;
    latency: number;
    success: boolean;
    error?: string;
    nonce: number;
    accountIndex: number;
    blockNumber?: number;
}

interface BenchmarkResult {
    name: string;
    duration: number;
    totalTx: number;
    successTx: number;
    failedTx: number;
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    confirmedTPS: number;  // Key metric: confirmed transactions per second
    successRate: number;
}

interface AccountState {
    wallet: Wallet;
    nonce: number;
    address: string;
    pendingCount: number;
    consecutiveErrors: number;  // Track errors for nonce recovery
}

// ===================== HELPER FUNCTIONS =====================
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

async function createAccounts(provider: Provider, mainWallet: Wallet, count: number): Promise<AccountState[]> {
    console.log(`\n📝 Creating ${count} test accounts...`);
    const accounts: AccountState[] = [];

    const mainBalance = await provider.getBalance(mainWallet.address);
    console.log(`   Main account: ${mainWallet.address}`);
    console.log(`   Balance: ${formatEther(mainBalance)} ETH`);

    // Use "pending" to get the next available nonce including pending txs
    let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
    console.log(`   Main wallet nonce (pending): ${mainNonce}`);

    const fundAmount = parseEther("50");
    let retryCount = 0;
    const maxRetries = 10;

    for (let i = 0; i < count; i++) {
        const randomWallet = Wallet.createRandom().connect(provider);

        try {
            const txOverrides = {
                gasLimit: 21000n,
                nonce: mainNonce
            };

            const fundTx = await mainWallet.sendTransaction({
                to: randomWallet.address,
                value: fundAmount,
                ...txOverrides,
            });
            mainNonce++;
            retryCount = 0;

            await fundTx.wait();

            const nonce = await provider.getTransactionCount(randomWallet.address);
            accounts.push({
                wallet: randomWallet,
                nonce: Number(nonce),
                address: randomWallet.address,
                pendingCount: 0,
                consecutiveErrors: 0,
            });

            process.stdout.write(`\r   Funded: ${i + 1}/${count} accounts`);
        } catch (error: any) {
            retryCount++;
            if (retryCount > maxRetries) {
                console.log(`\n   ❌ Max retries exceeded, stopping account creation`);
                break;
            }
            console.log(`\n   ⚠️ Error funding account ${i + 1} (retry ${retryCount}): ${error.message.substring(0, 50)}...`);
            // Refresh nonce from pending state
            mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
            i--;
            // Wait longer between retries (exponential backoff)
            await sleep(Math.min(2000 * retryCount, 10000));
        }
    }

    console.log(`\n   ✅ Created and funded ${accounts.length} accounts\n`);
    return accounts;
}

function calculateResults(
    name: string,
    results: TransactionResult[],
    startTime: number,
    endTime: number
): BenchmarkResult {
    const successfulTx = results.filter(r => r.success);
    const failedTx = results.filter(r => !r.success);
    const latencies = successfulTx.map(r => r.latency);

    const duration = endTime - startTime;

    return {
        name,
        duration,
        totalTx: results.length,
        successTx: successfulTx.length,
        failedTx: failedTx.length,
        avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
        maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
        p50Latency: percentile(latencies, 50),
        p95Latency: percentile(latencies, 95),
        p99Latency: percentile(latencies, 99),
        confirmedTPS: successfulTx.length / (duration / 1000),
        successRate: results.length > 0 ? (successfulTx.length / results.length) * 100 : 0,
    };
}

// ===================== SEND AND CONFIRM TRANSACTION =====================

async function sendAndConfirm(
    sendFn: () => Promise<any>,
    account: AccountState,
    accountIndex: number,
    provider: Provider
): Promise<TransactionResult> {
    const sendTime = Date.now();
    const usedNonce = account.nonce;

    try {
        const tx = await sendFn();
        account.nonce++;
        account.pendingCount++;
        account.consecutiveErrors = 0; // Reset on success

        // Wait for confirmation
        const receipt = await tx.wait();

        const confirmTime = Date.now();
        account.pendingCount--;

        return {
            hash: tx.hash,
            sendTime,
            confirmTime,
            latency: confirmTime - sendTime,
            success: receipt.status === 1,
            nonce: usedNonce,
            accountIndex,
            blockNumber: receipt.blockNumber,
        };
    } catch (error: any) {
        account.pendingCount--;
        account.consecutiveErrors++;

        // If we hit threshold, refresh nonce from network
        if (account.consecutiveErrors >= CONFIG.nonceRefreshThreshold) {
            const networkNonce = Number(await provider.getTransactionCount(account.address, "pending"));
            account.nonce = networkNonce;
            account.consecutiveErrors = 0;
        }

        return {
            hash: "",
            sendTime,
            confirmTime: Date.now(),
            latency: Date.now() - sendTime,
            success: false,
            error: error.message,
            nonce: usedNonce,
            accountIndex,
        };
    }
}

// ===================== BENCHMARK FUNCTIONS =====================

async function benchmarkNativeTransfer(
    accounts: AccountState[],
    provider: Provider
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Native Transfer Benchmark (Confirmation-Based)...");
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);
    console.log(`   Parallel Accounts: ${CONFIG.numAccounts}`);
    console.log(`   Max Pending per Account: ${CONFIG.maxPendingPerAccount}`);

    const results: TransactionResult[] = [];
    const startTime = Date.now();

    const recipient = Wallet.createRandom().address;
    const amount = parseEther("0.001");

    let confirmed = 0;
    let sent = 0;
    const pendingPromises: Promise<TransactionResult>[] = [];

    // Send transactions with controlled parallelism
    while (confirmed < CONFIG.totalTransactions) {
        // Find an account with room for more pending tx
        for (const account of accounts) {
            if (sent >= CONFIG.totalTransactions) break;
            if (account.pendingCount >= CONFIG.maxPendingPerAccount) continue;

            const accountIndex = accounts.indexOf(account);

            const txOverrides = {
                gasLimit: 21000n,
                nonce: account.nonce
            };

            const promise = sendAndConfirm(
                () => account.wallet.sendTransaction({
                    to: recipient,
                    value: amount,
                    ...txOverrides,
                }),
                account,
                accountIndex,
                provider
            );
            account.pendingCount++;
            sent++;

            promise.then(result => {
                account.pendingCount--;
                results.push(result);
                confirmed++;

                if (confirmed % 10 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    process.stdout.write(`\r   Confirmed: ${confirmed}/${CONFIG.totalTransactions} | Rate: ${(confirmed / elapsed).toFixed(1)} TPS`);
                }
            });

            pendingPromises.push(promise);
        }

        // Wait a bit if all accounts are busy
        if (accounts.every(a => a.pendingCount >= CONFIG.maxPendingPerAccount)) {
            await sleep(100);
        }

        // Check for completed promises
        if (results.length < sent) {
            await sleep(50);
        }
    }

    // Wait for all remaining confirmations
    await Promise.all(pendingPromises);

    const endTime = Date.now();
    console.log(`\n   ✅ All ${confirmed} transactions confirmed`);

    return calculateResults("Native Transfer", results, startTime, endTime);
}

async function benchmarkCounterInc(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Counter.inc() Benchmark (Confirmation-Based)...");
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

    // Deploy Counter contract
    console.log("   Deploying Counter contract...");
    const factory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, mainWallet);
    const counter = await factory.deploy({ gasLimit: 500000n });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`   Counter deployed at: ${counterAddress}`);

    // Refresh nonces
    for (const a of accounts) {
        a.nonce = Number(await provider.getTransactionCount(a.address, "latest"));
    }

    const results: TransactionResult[] = [];
    const startTime = Date.now();

    let confirmed = 0;
    let sent = 0;
    const pendingPromises: Promise<TransactionResult>[] = [];

    while (confirmed < CONFIG.totalTransactions) {
        for (const account of accounts) {
            if (sent >= CONFIG.totalTransactions) break;
            if (account.pendingCount >= CONFIG.maxPendingPerAccount) continue;

            const accountIndex = accounts.indexOf(account);
            const counterInstance = new Contract(counterAddress, COUNTER_ABI, account.wallet);

            const txOverrides = {
                gasLimit: CONFIG.gasLimit,
                nonce: account.nonce
            };

            const promise = sendAndConfirm(
                () => counterInstance.inc(txOverrides),
                account,
                accountIndex,
                provider
            );
            account.pendingCount++;
            sent++;

            promise.then(result => {
                account.pendingCount--;
                results.push(result);
                confirmed++;

                if (confirmed % 10 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    process.stdout.write(`\r   Confirmed: ${confirmed}/${CONFIG.totalTransactions} | Rate: ${(confirmed / elapsed).toFixed(1)} TPS`);
                }
            });

            pendingPromises.push(promise);
        }

        if (accounts.every(a => a.pendingCount >= CONFIG.maxPendingPerAccount)) {
            await sleep(100);
        }

        if (results.length < sent) {
            await sleep(50);
        }
    }

    await Promise.all(pendingPromises);

    const endTime = Date.now();
    console.log(`\n   ✅ All ${confirmed} transactions confirmed`);

    // Verify counter value
    const finalValue = await counter.x();
    console.log(`   Counter final value: ${finalValue}`);

    return calculateResults("Counter.inc()", results, startTime, endTime);
}

async function benchmarkERC20Transfer(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting ERC20 Transfer Benchmark (Confirmation-Based)...");
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

    // Deploy ERC20 token using artifact
    console.log("   Deploying ERC20 token...");

    let token: Contract;
    try {
        const path = await import("path");
        const artifactPath = path.resolve(__dirname, "../artifacts/contracts/ContractFactory2.sol/SimpleERC20.json");
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

        const tokenFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, mainWallet);
        const initialSupply = parseEther("1000000");

        const deployed = await tokenFactory.deploy("Benchmark Token", "BENCH", 18, initialSupply, mainWallet.address, {
            gasLimit: 5000000n,
        });
        await deployed.waitForDeployment();
        token = deployed;
        console.log(`   Token deployed at: ${await token.getAddress()}`);
    } catch (error) {
        console.log("   ⚠️ Could not deploy ERC20 token, skipping benchmark");
        return {
            name: "ERC20 Transfer",
            duration: 0, totalTx: 0, successTx: 0, failedTx: 0,
            avgLatency: 0, minLatency: 0, maxLatency: 0,
            p50Latency: 0, p95Latency: 0, p99Latency: 0,
            confirmedTPS: 0, successRate: 0,
        };
    }

    const tokenAddress = await token.getAddress();

    // Distribute tokens to test accounts
    console.log("   Distributing tokens to test accounts...");
    const tokenAmount = parseEther("10000");
    for (let i = 0; i < accounts.length; i++) {
        const tx = await token.transfer(accounts[i].address, tokenAmount, { gasLimit: 100000n });
        await tx.wait();
    }
    console.log("   ✅ Tokens distributed");

    // Refresh nonces
    for (const a of accounts) {
        a.nonce = Number(await provider.getTransactionCount(a.address, "latest"));
    }

    const results: TransactionResult[] = [];
    const startTime = Date.now();

    const recipient = Wallet.createRandom().address;
    const transferAmount = parseEther("1");

    let confirmed = 0;
    let sent = 0;
    const pendingPromises: Promise<TransactionResult>[] = [];

    while (confirmed < CONFIG.totalTransactions) {
        for (const account of accounts) {
            if (sent >= CONFIG.totalTransactions) break;
            if (account.pendingCount >= CONFIG.maxPendingPerAccount) continue;

            const accountIndex = accounts.indexOf(account);
            const tokenInstance = new Contract(tokenAddress, ERC20_ABI, account.wallet);

            const txOverrides = {
                gasLimit: CONFIG.gasLimit,
                nonce: account.nonce
            };

            const promise = sendAndConfirm(
                () => tokenInstance.transfer(recipient, transferAmount, txOverrides),
                account,
                accountIndex,
                provider
            );
            account.pendingCount++;
            sent++;

            promise.then(result => {
                account.pendingCount--;
                results.push(result);
                confirmed++;

                if (confirmed % 10 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    process.stdout.write(`\r   Confirmed: ${confirmed}/${CONFIG.totalTransactions} | Rate: ${(confirmed / elapsed).toFixed(1)} TPS`);
                }
            });

            pendingPromises.push(promise);
        }

        if (accounts.every(a => a.pendingCount >= CONFIG.maxPendingPerAccount)) {
            await sleep(100);
        }

        if (results.length < sent) {
            await sleep(50);
        }
    }

    await Promise.all(pendingPromises);

    const endTime = Date.now();
    console.log(`\n   ✅ All ${confirmed} transactions confirmed`);

    return calculateResults("ERC20 Transfer", results, startTime, endTime);
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 CONFIRMATION-BASED BENCHMARK RESULTS");
    console.log("=".repeat(80));

    let maxTPS = 0;
    let bestBenchmark = "";

    for (const r of results) {
        if (r.totalTx === 0) continue;

        if (r.confirmedTPS > maxTPS) {
            maxTPS = r.confirmedTPS;
            bestBenchmark = r.name;
        }

        console.log(`\n📈 ${r.name}`);
        console.log("-".repeat(60));
        console.log(`   Duration:       ${formatDuration(r.duration)}`);
        console.log(`   Total TX:       ${r.totalTx}`);
        console.log(`   ✅ Confirmed:    ${r.successTx} (${r.successRate.toFixed(1)}%)`);
        console.log(`   ❌ Failed:       ${r.failedTx}`);
        console.log(`   🚀 Confirmed TPS: ${r.confirmedTPS.toFixed(2)} TPS`);
        console.log(`   ⏱️  Avg Latency:  ${formatDuration(r.avgLatency)}`);
        console.log(`   ⏱️  P50 Latency:  ${formatDuration(r.p50Latency)}`);
        console.log(`   ⏱️  P95 Latency:  ${formatDuration(r.p95Latency)}`);
        console.log(`   ⏱️  P99 Latency:  ${formatDuration(r.p99Latency)}`);
        console.log(`   ⏱️  Min/Max:      ${formatDuration(r.minLatency)} / ${formatDuration(r.maxLatency)}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log(`🏆 PEAK CONFIRMED TPS: ${maxTPS.toFixed(2)} TPS (${bestBenchmark})`);
    console.log("=".repeat(80));

    const jsonPath = `${CONFIG.outputDir}/benchmark3-${timestamp}.json`;
    const configForJson = { ...CONFIG, gasLimit: CONFIG.gasLimit.toString() };
    fs.writeFileSync(jsonPath, JSON.stringify({ config: configForJson, results }, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    const htmlPath = `${CONFIG.outputDir}/benchmark3-${timestamp}.html`;
    const html = generateHTMLReport(results, maxTPS, bestBenchmark);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(results: BenchmarkResult[], maxTPS: number, bestBenchmark: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Besu Confirmation-Based Benchmark</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh; color: #fff; padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { 
      text-align: center; margin-bottom: 0.5rem; font-size: 2.5rem;
      background: linear-gradient(90deg, #00ff87, #60efff);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .subtitle { text-align: center; color: #888; margin-bottom: 2rem; }
    .peak {
      background: linear-gradient(135deg, rgba(0,255,135,0.15), rgba(96,239,255,0.15));
      border: 2px solid #00ff87; border-radius: 20px; padding: 2rem;
      margin-bottom: 2rem; text-align: center;
    }
    .peak h2 { color: #00ff87; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; background: linear-gradient(90deg, #00ff87, #60efff);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .peak .label { color: #888; }
    .note { 
      background: rgba(0,255,135,0.1); border-left: 4px solid #00ff87; 
      padding: 1rem; margin-bottom: 2rem; border-radius: 0 8px 8px 0;
    }
    .note strong { color: #00ff87; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(255,255,255,0.05); border-radius: 16px; padding: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px);
    }
    .card h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #60efff; }
    .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; }
    .stat-label { color: #888; }
    .stat-value { font-weight: 600; }
    .success { color: #00ff87; }
    .error { color: #ff6b6b; }
    .highlight { color: #00ff87; font-weight: 700; font-size: 1.2rem; }
    .config { 
      background: rgba(255,255,255,0.02); border-radius: 8px; padding: 1rem;
      margin-top: 2rem; font-size: 0.85rem; color: #666;
    }
    .config code { color: #00ff87; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Besu Confirmation-Based Benchmark</h1>
    <p class="subtitle">Measuring CONFIRMED transactions | Generated: ${new Date().toLocaleString()}</p>
    
    <div class="note">
      <strong>📊 Key Difference:</strong> This benchmark waits for each transaction to be confirmed on-chain 
      before counting it. This gives you the true, reliable throughput of your blockchain network.
    </div>
    
    <div class="peak">
      <h2>🏆 Peak Confirmed TPS</h2>
      <div class="tps">${maxTPS.toFixed(1)}</div>
      <div class="label">Confirmed Transactions per Second (${bestBenchmark})</div>
    </div>
    
    <div class="grid">
      ${results.filter(r => r.totalTx > 0).map(r => `
        <div class="card">
          <h2>📈 ${r.name}</h2>
          <div class="stat"><span class="stat-label">Duration</span><span class="stat-value">${formatDuration(r.duration)}</span></div>
          <div class="stat"><span class="stat-label">Total TX</span><span class="stat-value">${r.totalTx}</span></div>
          <div class="stat"><span class="stat-label">Confirmed</span><span class="stat-value success">${r.successTx} (${r.successRate.toFixed(1)}%)</span></div>
          <div class="stat"><span class="stat-label">Failed</span><span class="stat-value ${r.failedTx > 0 ? 'error' : ''}">${r.failedTx}</span></div>
          <div class="stat"><span class="stat-label">Confirmed TPS</span><span class="stat-value highlight">${r.confirmedTPS.toFixed(2)} TPS</span></div>
          <div class="stat"><span class="stat-label">Avg Latency</span><span class="stat-value">${formatDuration(r.avgLatency)}</span></div>
          <div class="stat"><span class="stat-label">P50 Latency</span><span class="stat-value">${formatDuration(r.p50Latency)}</span></div>
          <div class="stat"><span class="stat-label">P95 Latency</span><span class="stat-value">${formatDuration(r.p95Latency)}</span></div>
        </div>
      `).join('')}
    </div>
    
    <div class="config">
      <strong>Configuration:</strong>
      Transactions: <code>${CONFIG.totalTransactions}</code> | 
      Accounts: <code>${CONFIG.numAccounts}</code> |
      Max Pending: <code>${CONFIG.maxPendingPerAccount}</code> per account |
      Gas Limit: <code>${CONFIG.gasLimit.toString()}</code>
    </div>
  </div>
</body>
</html>`;
}

// ===================== MAIN =====================
async function main() {
    console.log("\n" + "=".repeat(80));
    console.log("✅ BESU QBFT CONFIRMATION-BASED BENCHMARK");
    console.log("=".repeat(80));
    console.log("\n📝 This benchmark measures CONFIRMED transactions, not just submissions.");
    console.log("   Each transaction is awaited until it's included in a block.\n");

    if (!CONFIG.privateKey) {
        throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
    }

    console.log(`Total Transactions per test: ${CONFIG.totalTransactions}`);
    console.log(`Parallel Accounts: ${CONFIG.numAccounts}`);
    console.log(`Max Pending per Account: ${CONFIG.maxPendingPerAccount}`);
    console.log(`RPC URL: ${CONFIG.rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    const mainWallet = new Wallet(CONFIG.privateKey, provider);

    const network = await provider.getNetwork();
    console.log(`\nNetwork chainId: ${network.chainId}`);

    const accounts = await createAccounts(provider, mainWallet, CONFIG.numAccounts);
    const results: BenchmarkResult[] = [];

    if (CONFIG.benchmarks.nativeTransfer) {
        results.push(await benchmarkNativeTransfer(accounts, provider));
        console.log("\n   Cooling down (5s)...");
        await sleep(5000);
        for (const a of accounts) {
            a.nonce = Number(await provider.getTransactionCount(a.address, "latest"));
            a.pendingCount = 0;
            a.consecutiveErrors = 0;
        }
    }

    if (CONFIG.benchmarks.counterInc) {
        results.push(await benchmarkCounterInc(accounts, provider, mainWallet));
        console.log("\n   Cooling down (5s)...");
        await sleep(5000);
        for (const a of accounts) {
            a.nonce = Number(await provider.getTransactionCount(a.address, "latest"));
            a.pendingCount = 0;
            a.consecutiveErrors = 0;
        }
    }

    if (CONFIG.benchmarks.erc20Transfer) {
        results.push(await benchmarkERC20Transfer(accounts, provider, mainWallet));
    }

    generateReport(results);
    console.log("✅ Confirmation-based benchmark complete!");
}

main().catch(console.error);
