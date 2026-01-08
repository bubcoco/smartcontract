/**
 * Besu QBFT High-Performance Benchmark Script
 * 
 * This script finds the maximum sustainable TPS of your Besu network.
 * It uses many parallel accounts to maximize throughput.
 * 
 * Usage:
 *   npx tsx benchmark/benchmark.ts
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

  // ========== HIGH TPS SETTINGS ==========
  // More accounts = more parallel transactions = higher TPS
  numAccounts: 20,

  // Total transactions to send per benchmark (increase for better averages)
  totalTransactions: 300,

  // Target TPS - set high and let the chain be the limiter
  targetTPS: 200,

  // Benchmark modes
  benchmarks: {
    nativeTransfer: true,   // Simple ETH transfers (fastest)
    counterInc: true,       // Counter.inc() calls
    counterIncBy: false,    // Skip incBy - similar to inc
  },

  // Wait time for confirmations (seconds)
  confirmationWait: 20,

  // Cooldown between benchmarks (seconds)  
  cooldownTime: 10,

  // Report output
  outputDir: "./benchmark/reports",

  // Gas settings
  gasLimit: 100000n,
  gasPrice: parseUnits("1000", "gwei"),
};

// Counter contract ABI and bytecode
const COUNTER_ABI = [
  "function inc() external",
  "function incBy(uint256 by) external",
  "function x() external view returns (uint256)",
  "event Increment(uint256 by)",
];

const COUNTER_BYTECODE = "0x6080604052348015600e575f5ffd5b506101838061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80630c55699c14610043578063371303c01461005d57806370119d0614610067575b5f5ffd5b61004b5f5481565b60405190815260200160405180910390f35b61006561007a565b005b610065610075366004610111565b6100c6565b60015f5f82825461008b9190610128565b9091555050604051600181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a1565b805f5f8282546100d69190610128565b90915550506040518181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a150565b5f60208284031215610121575f5ffd5b5035919050565b8082018082111561014757634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122092ffef3ac73901885453b4eb2430caafac83608a8d165ccf18ff9c81b7e865c664736f6c634300081c0033";

// ===================== INTERFACES =====================
interface TransactionResult {
  hash: string;
  sendTime: number;
  confirmTime?: number;
  latency?: number;
  success: boolean;
  error?: string;
  nonce: number;
  accountIndex: number;
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
  p95Latency: number;
  p99Latency: number;
  actualTPS: number;
  throughput: number;
  successRate: number;
}

interface AccountState {
  wallet: Wallet;
  nonce: number;
  address: string;
  pending: number;
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

  // Get current nonce for main wallet
  let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "latest"));
  console.log(`   Main wallet nonce: ${mainNonce}`);

  const fundAmount = parseEther("50"); // 50 ETH per account

  // Fund accounts sequentially to avoid nonce conflicts
  for (let i = 0; i < count; i++) {
    const randomWallet = Wallet.createRandom().connect(provider);

    try {
      const fundTx = await mainWallet.sendTransaction({
        to: randomWallet.address,
        value: fundAmount,
        gasLimit: 21000n,
        gasPrice: CONFIG.gasPrice,
        nonce: mainNonce,
      });
      mainNonce++; // Increment nonce for next tx

      await fundTx.wait();

      const nonce = await provider.getTransactionCount(randomWallet.address);
      accounts.push({
        wallet: randomWallet,
        nonce: Number(nonce),
        address: randomWallet.address,
        pending: 0,
      });

      process.stdout.write(`\r   Funded: ${i + 1}/${count} accounts`);
    } catch (error: any) {
      console.log(`\n   ⚠️ Error funding account ${i + 1}: ${error.message.substring(0, 50)}...`);
      // Refresh nonce and retry
      mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
      i--; // Retry this account
      await sleep(1000); // Wait a bit before retrying
    }
  }

  console.log(`\n   ✅ Created and funded ${count} accounts\n`);
  return accounts;
}

// ===================== BENCHMARK FUNCTIONS =====================

async function benchmarkNativeTransfer(
  accounts: AccountState[],
  provider: Provider
): Promise<BenchmarkResult> {
  console.log("\n🚀 Starting Native Transfer Benchmark...");
  console.log(`   Target TPS: ${CONFIG.targetTPS}`);
  console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);
  console.log(`   Parallel Accounts: ${CONFIG.numAccounts}`);

  const results: TransactionResult[] = [];
  const startTime = Date.now();
  const txInterval = 1000 / CONFIG.targetTPS;

  const recipient = Wallet.createRandom().address;
  const amount = parseEther("0.001");

  let txCount = 0;
  let accountIndex = 0;
  let lastProgressUpdate = 0;

  // Fire transactions as fast as the target TPS allows
  while (txCount < CONFIG.totalTransactions) {
    const account = accounts[accountIndex % accounts.length];
    const sendTime = Date.now();

    try {
      const tx = await account.wallet.sendTransaction({
        to: recipient,
        value: amount,
        gasLimit: 21000n,
        gasPrice: CONFIG.gasPrice,
        nonce: account.nonce,
      });

      account.nonce++;
      account.pending++;

      const result: TransactionResult = {
        hash: tx.hash,
        sendTime,
        success: true,
        nonce: account.nonce - 1,
        accountIndex: accountIndex % accounts.length,
      };

      // Track confirmation in background
      tx.wait().then(() => {
        result.confirmTime = Date.now();
        result.latency = result.confirmTime - result.sendTime;
        account.pending--;
      }).catch((err: any) => {
        result.success = false;
        result.error = err.message;
        account.pending--;
      });

      results.push(result);
      txCount++;

    } catch (error: any) {
      results.push({
        hash: "",
        sendTime,
        success: false,
        error: error.message,
        nonce: account.nonce,
        accountIndex: accountIndex % accounts.length,
      });

      // Refresh nonce on error
      if (error.message.includes("nonce")) {
        const newNonce = await provider.getTransactionCount(account.address, "pending");
        account.nonce = Number(newNonce);
      }
    }

    accountIndex++;

    // Progress update every 50 tx
    if (txCount - lastProgressUpdate >= 50) {
      const elapsed = (Date.now() - startTime) / 1000;
      const currentTPS = txCount / elapsed;
      process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.totalTransactions} | Rate: ${currentTPS.toFixed(1)} TPS`);
      lastProgressUpdate = txCount;
    }

    // Rate limiting
    const elapsed = Date.now() - startTime;
    const expectedTime = txCount * txInterval;
    if (elapsed < expectedTime) {
      await sleep(Math.min(expectedTime - elapsed, 10)); // Max 10ms sleep
    }
  }

  const sendEndTime = Date.now();
  const sendDuration = (sendEndTime - startTime) / 1000;
  console.log(`\n   Sent ${txCount} tx in ${sendDuration.toFixed(2)}s (${(txCount / sendDuration).toFixed(1)} TPS send rate)`);
  console.log(`   Waiting ${CONFIG.confirmationWait}s for confirmations...`);
  await sleep(CONFIG.confirmationWait * 1000);

  const endTime = Date.now();
  return calculateResults("Native Transfer", results, startTime, endTime);
}

async function benchmarkCounter(
  accounts: AccountState[],
  provider: Provider,
  method: "inc" | "incBy",
  mainWallet: Wallet
): Promise<BenchmarkResult> {
  console.log(`\n🚀 Starting Counter.${method}() Benchmark...`);
  console.log(`   Target TPS: ${CONFIG.targetTPS}`);
  console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

  // Deploy Counter contract
  console.log("   Deploying Counter contract...");
  const factory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, mainWallet);
  const counter = await factory.deploy({ gasPrice: CONFIG.gasPrice });
  await counter.waitForDeployment();
  const counterAddress = await counter.getAddress();
  console.log(`   Counter deployed at: ${counterAddress}`);

  const results: TransactionResult[] = [];
  const startTime = Date.now();
  const txInterval = 1000 / CONFIG.targetTPS;

  let txCount = 0;
  let accountIndex = 0;
  let lastProgressUpdate = 0;

  while (txCount < CONFIG.totalTransactions) {
    const account = accounts[accountIndex % accounts.length];
    const sendTime = Date.now();

    try {
      const counterInstance = new Contract(counterAddress, COUNTER_ABI, account.wallet);

      let tx: any;
      if (method === "inc") {
        tx = await counterInstance.inc({
          gasLimit: CONFIG.gasLimit,
          gasPrice: CONFIG.gasPrice,
          nonce: account.nonce,
        });
      } else {
        tx = await counterInstance.incBy(5, {
          gasLimit: CONFIG.gasLimit,
          gasPrice: CONFIG.gasPrice,
          nonce: account.nonce,
        });
      }

      account.nonce++;
      account.pending++;

      const result: TransactionResult = {
        hash: tx.hash,
        sendTime,
        success: true,
        nonce: account.nonce - 1,
        accountIndex: accountIndex % accounts.length,
      };

      tx.wait().then(() => {
        result.confirmTime = Date.now();
        result.latency = result.confirmTime - result.sendTime;
        account.pending--;
      }).catch((err: any) => {
        result.success = false;
        result.error = err.message;
        account.pending--;
      });

      results.push(result);
      txCount++;

    } catch (error: any) {
      results.push({
        hash: "", sendTime, success: false, error: error.message,
        nonce: account.nonce, accountIndex: accountIndex % accounts.length,
      });
      if (error.message.includes("nonce")) {
        account.nonce = Number(await provider.getTransactionCount(account.address, "pending"));
      }
    }

    accountIndex++;

    if (txCount - lastProgressUpdate >= 50) {
      const elapsed = (Date.now() - startTime) / 1000;
      const currentTPS = txCount / elapsed;
      process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.totalTransactions} | Rate: ${currentTPS.toFixed(1)} TPS`);
      lastProgressUpdate = txCount;
    }

    const elapsed = Date.now() - startTime;
    const expectedTime = txCount * txInterval;
    if (elapsed < expectedTime) await sleep(Math.min(expectedTime - elapsed, 10));
  }

  const sendEndTime = Date.now();
  const sendDuration = (sendEndTime - startTime) / 1000;
  console.log(`\n   Sent ${txCount} tx in ${sendDuration.toFixed(2)}s (${(txCount / sendDuration).toFixed(1)} TPS send rate)`);
  console.log(`   Waiting ${CONFIG.confirmationWait}s for confirmations...`);
  await sleep(CONFIG.confirmationWait * 1000);

  const endTime = Date.now();
  return calculateResults(`Counter.${method}()`, results, startTime, endTime);
}

function calculateResults(
  name: string,
  results: TransactionResult[],
  startTime: number,
  endTime: number
): BenchmarkResult {
  const successfulTx = results.filter(r => r.success && r.latency);
  const failedTx = results.filter(r => !r.success);
  const latencies = successfulTx.map(r => r.latency!).filter(l => l > 0);

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
    p95Latency: percentile(latencies, 95),
    p99Latency: percentile(latencies, 99),
    actualTPS: results.length / (duration / 1000),
    throughput: successfulTx.length / (duration / 1000),
    successRate: results.length > 0 ? (successfulTx.length / results.length) * 100 : 0,
  };
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log("\n" + "=".repeat(80));
  console.log("📊 BENCHMARK RESULTS");
  console.log("=".repeat(80));

  let maxThroughput = 0;
  let bestBenchmark = "";

  for (const r of results) {
    if (r.throughput > maxThroughput) {
      maxThroughput = r.throughput;
      bestBenchmark = r.name;
    }

    console.log(`\n📈 ${r.name}`);
    console.log("-".repeat(60));
    console.log(`   Duration:      ${formatDuration(r.duration)}`);
    console.log(`   Total TX:      ${r.totalTx}`);
    console.log(`   ✅ Success:     ${r.successTx} (${r.successRate.toFixed(1)}%)`);
    console.log(`   ❌ Failed:      ${r.failedTx}`);
    console.log(`   📤 Send Rate:   ${r.actualTPS.toFixed(2)} TPS`);
    console.log(`   🚀 Throughput:  ${r.throughput.toFixed(2)} TPS`);
    console.log(`   ⏱️  Avg Latency: ${formatDuration(r.avgLatency)}`);
    console.log(`   ⏱️  P95 Latency: ${formatDuration(r.p95Latency)}`);
    console.log(`   ⏱️  P99 Latency: ${formatDuration(r.p99Latency)}`);
    console.log(`   ⏱️  Min/Max:     ${formatDuration(r.minLatency)} / ${formatDuration(r.maxLatency)}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`🏆 PEAK THROUGHPUT: ${maxThroughput.toFixed(2)} TPS (${bestBenchmark})`);
  console.log("=".repeat(80));

  const jsonPath = `${CONFIG.outputDir}/benchmark-${timestamp}.json`;
  const configForJson = { ...CONFIG, gasPrice: CONFIG.gasPrice.toString(), gasLimit: CONFIG.gasLimit.toString() };
  fs.writeFileSync(jsonPath, JSON.stringify({ config: configForJson, results }, null, 2));
  console.log(`\n📄 JSON Report: ${jsonPath}`);

  const htmlPath = `${CONFIG.outputDir}/benchmark-${timestamp}.html`;
  const html = generateHTMLReport(results, maxThroughput, bestBenchmark);
  fs.writeFileSync(htmlPath, html);
  console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(results: BenchmarkResult[], maxThroughput: number, bestBenchmark: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Besu QBFT Benchmark Results</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      min-height: 100vh; color: #fff; padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      text-align: center; margin-bottom: 0.5rem; font-size: 2.5rem;
      background: linear-gradient(90deg, #00d2ff, #3a7bd5, #ff6b6b);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .subtitle { text-align: center; color: #888; margin-bottom: 2rem; }
    .peak {
      background: linear-gradient(135deg, rgba(0,210,255,0.2), rgba(255,107,107,0.2));
      border: 2px solid #00d2ff; border-radius: 20px; padding: 2rem;
      margin-bottom: 2rem; text-align: center;
    }
    .peak h2 { color: #00d2ff; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; background: linear-gradient(90deg, #00d2ff, #3a7bd5);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .peak .label { color: #888; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(255,255,255,0.05); border-radius: 16px; padding: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px);
    }
    .card h2 { font-size: 1.3rem; margin-bottom: 1rem; color: #3a7bd5; }
    .stat { display: flex; justify-content: space-between; padding: 0.6rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.05); }
    .stat-label { color: #888; }
    .stat-value { font-weight: 600; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .highlight { color: #00d2ff; font-weight: 700; font-size: 1.2rem; }
    .config { 
      background: rgba(255,255,255,0.02); border-radius: 8px; padding: 1rem;
      margin-top: 2rem; font-size: 0.85rem; color: #666;
    }
    .config code { color: #00d2ff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Besu QBFT Benchmark Report</h1>
    <p class="subtitle">Generated: ${new Date().toLocaleString()}</p>
    
    <div class="peak">
      <h2>🏆 Peak Throughput</h2>
      <div class="tps">${maxThroughput.toFixed(1)}</div>
      <div class="label">Transactions per Second (${bestBenchmark})</div>
    </div>
    
    <div class="grid">
      ${results.map(r => `
        <div class="card">
          <h2>📈 ${r.name}</h2>
          <div class="stat"><span class="stat-label">Duration</span><span class="stat-value">${formatDuration(r.duration)}</span></div>
          <div class="stat"><span class="stat-label">Total TX</span><span class="stat-value">${r.totalTx}</span></div>
          <div class="stat"><span class="stat-label">Successful</span><span class="stat-value success">${r.successTx} (${r.successRate.toFixed(1)}%)</span></div>
          <div class="stat"><span class="stat-label">Failed</span><span class="stat-value ${r.failedTx > 0 ? 'error' : ''}">${r.failedTx}</span></div>
          <div class="stat"><span class="stat-label">Send Rate</span><span class="stat-value">${r.actualTPS.toFixed(2)} TPS</span></div>
          <div class="stat"><span class="stat-label">Throughput</span><span class="stat-value highlight">${r.throughput.toFixed(2)} TPS</span></div>
          <div class="stat"><span class="stat-label">Avg Latency</span><span class="stat-value">${formatDuration(r.avgLatency)}</span></div>
          <div class="stat"><span class="stat-label">P95 Latency</span><span class="stat-value">${formatDuration(r.p95Latency)}</span></div>
          <div class="stat"><span class="stat-label">P99 Latency</span><span class="stat-value">${formatDuration(r.p99Latency)}</span></div>
        </div>
      `).join('')}
    </div>
    
    <div class="config">
      <strong>Configuration:</strong>
      Target TPS: <code>${CONFIG.targetTPS}</code> | 
      Transactions: <code>${CONFIG.totalTransactions}</code> | 
      Accounts: <code>${CONFIG.numAccounts}</code> |
      Gas Price: <code>${ethers.formatUnits(CONFIG.gasPrice, 'gwei')} gwei</code>
    </div>
  </div>
</body>
</html>`;
}

// ===================== MAIN =====================
async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("🔥 BESU QBFT HIGH-PERFORMANCE BENCHMARK");
  console.log("=".repeat(80));

  // Validate private key
  if (!CONFIG.privateKey) {
    throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
  }

  console.log(`Target TPS: ${CONFIG.targetTPS}`);
  console.log(`Transactions per test: ${CONFIG.totalTransactions}`);
  console.log(`Parallel Accounts: ${CONFIG.numAccounts}`);
  console.log(`RPC URL: ${CONFIG.rpcUrl}`);

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const mainWallet = new Wallet(CONFIG.privateKey, provider);

  const network = await provider.getNetwork();
  console.log(`\nNetwork chainId: ${network.chainId}`);

  const accounts = await createAccounts(provider, mainWallet, CONFIG.numAccounts);
  const results: BenchmarkResult[] = [];

  if (CONFIG.benchmarks.nativeTransfer) {
    results.push(await benchmarkNativeTransfer(accounts, provider));
    console.log(`\n   Cooling down (${CONFIG.cooldownTime}s)...`);
    await sleep(CONFIG.cooldownTime * 1000);
    for (const a of accounts) a.nonce = Number(await provider.getTransactionCount(a.address, "pending"));
  }

  if (CONFIG.benchmarks.counterInc) {
    results.push(await benchmarkCounter(accounts, provider, "inc", mainWallet));
    console.log(`\n   Cooling down (${CONFIG.cooldownTime}s)...`);
    await sleep(CONFIG.cooldownTime * 1000);
    for (const a of accounts) a.nonce = Number(await provider.getTransactionCount(a.address, "pending"));
  }

  if (CONFIG.benchmarks.counterIncBy) {
    results.push(await benchmarkCounter(accounts, provider, "incBy", mainWallet));
  }

  generateReport(results);
  console.log("✅ Benchmark complete!");
}

main().catch(console.error);
