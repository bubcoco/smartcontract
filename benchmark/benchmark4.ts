/**
 * Besu QBFT Balance-Based Benchmark Script
 * 
 * Strategy: Each account keeps sending transactions until it has transferred 10 ETH total.
 * This tests sustained network throughput over a longer period.
 * 
 * Usage:
 *   npx tsx benchmark/benchmark4.ts          # Reuse stored accounts (may have nonce issues)
 *   npx tsx benchmark/benchmark4.ts --fresh  # Use fresh accounts each run (recommended)
 *   npx tsx benchmark/benchmark4.ts --clear  # Clear stuck transactions from stored accounts
 * 
 * Commands:
 *   --fresh  Create new accounts each run, ignoring stored accounts
 *   --clear  Clear pending transactions from stored accounts by sending 0-value tx to fill nonce gaps
 * 
 * NOTE: If you see nonce errors after a crash, use --clear first, then run normally.
 * 
 * BESU CONFIGURATION RECOMMENDATIONS:
 *   --tx-pool-limit-by-account-percentage=1.0
 *   --tx-pool-max-size=10000
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

// Parse CLI arguments
const USE_FRESH_ACCOUNTS = process.argv.includes("--fresh");
const CLEAR_PENDING = process.argv.includes("--clear");

// ===================== CONFIGURATION =====================
const CONFIG = {
  // Network RPC
  rpcUrl: process.env.RPC_URL || "http://localhost:8545",

  // Private key from .env (required)
  privateKey: process.env.PRIV_KEY || process.env.ADMIN,

  // ========== BENCHMARK SETTINGS ==========
  // Number of parallel accounts (reduced to avoid RPC overload)
  numAccounts: 10,

  // Initial funding per account (should be > targetSpend)
  initialFunding: parseEther("15"),

  // Each account sends until they've transferred this much
  targetSpend: parseEther("10"),

  // Amount per transaction (larger amount = fewer transactions needed)
  txAmount: parseEther("0.1"),

  // Max concurrent pending transactions per account (1 = sequential per account)
  maxPendingPerAccount: 1,

  // Gas settings
  gasLimit: 21000n,
  gasPrice: parseUnits("1000", "gwei"),

  // Timeout - stop if benchmark runs too long (15 minutes)
  timeoutMs: 15 * 60 * 1000,

  // Report output
  outputDir: "./benchmark/reports",

  // Nonce recovery threshold
  nonceRefreshThreshold: 3,
};

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
  amountSent: bigint;
}

interface AccountState {
  wallet: Wallet;
  nonce: number;
  address: string;
  pendingCount: number;
  consecutiveErrors: number;
  totalSent: bigint;
  isComplete: boolean;
  txCount: number;
}

interface BenchmarkResult {
  name: string;
  duration: number;
  totalTx: number;
  successTx: number;
  failedTx: number;
  totalEthTransferred: string;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p50Latency: number;
  p95Latency: number;
  confirmedTPS: number;
  accountsCompleted: number;
  successRate: number;
}

// ===================== HELPER FUNCTIONS =====================
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Stored account format
interface StoredAccount {
  address: string;
  privateKey: string;
}

const ACCOUNTS_FILE = resolve(__dirname, "./test-accounts.json");

// ===================== ACCOUNT MANAGEMENT =====================

// Load stored accounts from file
function loadStoredAccounts(): StoredAccount[] {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.log("   ⚠️ Could not load stored accounts, starting fresh");
  }
  return [];
}

// Save accounts to file for reuse
function saveStoredAccounts(accounts: StoredAccount[]): void {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

// Clear pending transactions by sending 0-value replacement transactions
async function clearPendingTransactions(provider: Provider): Promise<void> {
  console.log("\n🧹 CLEARING PENDING TRANSACTIONS");
  console.log("=".repeat(60));

  const storedAccounts = loadStoredAccounts();

  if (storedAccounts.length === 0) {
    console.log("   No stored accounts found. Nothing to clear.");
    return;
  }

  console.log(`   Found ${storedAccounts.length} stored accounts`);
  console.log("   Checking for nonce gaps...\n");

  let totalCleared = 0;

  for (let i = 0; i < storedAccounts.length; i++) {
    const acc = storedAccounts[i];
    const wallet = new Wallet(acc.privateKey, provider);

    try {
      // Get confirmed nonce (already mined)
      const confirmedNonce = Number(await provider.getTransactionCount(acc.address, "latest"));
      // Get pending nonce (includes pending tx)
      const pendingNonce = Number(await provider.getTransactionCount(acc.address, "pending"));

      const gap = pendingNonce - confirmedNonce;

      if (gap > 0) {
        console.log(`   Account ${i + 1}: ${acc.address.substring(0, 10)}... has ${gap} pending transactions`);
        console.log(`      Confirmed: ${confirmedNonce}, Pending: ${pendingNonce}`);

        // Send replacement transactions for each nonce in the gap
        for (let nonce = confirmedNonce; nonce < pendingNonce; nonce++) {
          try {
            // Send 0-value transaction to self with higher gas price to replace pending tx
            const tx = await wallet.sendTransaction({
              to: acc.address,  // Send to self
              value: 0n,
              gasLimit: 21000n,
              gasPrice: parseUnits("2000", "gwei"),  // High gas price to replace
              nonce: nonce,
            });

            console.log(`      Replacing nonce ${nonce}... (${tx.hash.substring(0, 10)}...)`);
            await tx.wait();
            totalCleared++;
          } catch (error: any) {
            console.log(`      ⚠️ Failed to clear nonce ${nonce}: ${error.message.substring(0, 40)}...`);
          }
        }
      } else {
        console.log(`   Account ${i + 1}: ${acc.address.substring(0, 10)}... ✅ No pending transactions`);
      }
    } catch (error: any) {
      console.log(`   Account ${i + 1}: ⚠️ Error checking: ${error.message.substring(0, 40)}...`);
    }
  }

  console.log("\n" + "=".repeat(60));
  if (totalCleared > 0) {
    console.log(`✅ Cleared ${totalCleared} pending transactions`);
  } else {
    console.log("✅ No pending transactions to clear");
  }
  console.log("=".repeat(60) + "\n");
}

// Check balances of accounts (fast read operation)
async function checkAccountBalances(
  provider: Provider,
  storedAccounts: StoredAccount[]
): Promise<{ address: string; balance: bigint; privateKey: string }[]> {
  console.log("\n📋 Checking existing account balances...");

  const results: { address: string; balance: bigint; privateKey: string }[] = [];

  // Check balances in parallel for speed
  const balancePromises = storedAccounts.map(async (acc) => {
    const balance = await provider.getBalance(acc.address);
    return { address: acc.address, balance, privateKey: acc.privateKey };
  });

  const balances = await Promise.all(balancePromises);

  let funded = 0;
  let needsFunding = 0;

  for (const b of balances) {
    results.push(b);
    if (b.balance >= CONFIG.initialFunding) {
      funded++;
    } else {
      needsFunding++;
    }
  }

  console.log(`   Found ${storedAccounts.length} stored accounts`);
  console.log(`   ✅ ${funded} accounts already have sufficient funds`);
  console.log(`   ⚠️ ${needsFunding} accounts need funding`);

  return results;
}

// Load or create accounts, only funding those that need it
async function loadOrCreateAccounts(
  provider: Provider,
  mainWallet: Wallet,
  count: number
): Promise<AccountState[]> {
  console.log(`\n📝 Setting up ${count} test accounts...`);

  if (USE_FRESH_ACCOUNTS) {
    console.log(`   🆕 Using FRESH accounts (--fresh flag)`);
  }

  const mainBalance = await provider.getBalance(mainWallet.address);
  console.log(`   Main account: ${mainWallet.address}`);
  console.log(`   Balance: ${formatEther(mainBalance)} ETH`);

  // Load existing accounts (skip if --fresh flag is set)
  let storedAccounts: StoredAccount[] = [];
  if (!USE_FRESH_ACCOUNTS) {
    storedAccounts = loadStoredAccounts();
  }

  // Check balances of existing accounts
  let accountBalances: { address: string; balance: bigint; privateKey: string }[] = [];
  if (storedAccounts.length > 0 && !USE_FRESH_ACCOUNTS) {
    accountBalances = await checkAccountBalances(provider, storedAccounts);
  }

  // Separate accounts with sufficient funds vs those needing funding
  const fundedAccounts = accountBalances.filter(a => a.balance >= CONFIG.initialFunding);
  const needsFunding = accountBalances.filter(a => a.balance < CONFIG.initialFunding);

  // Create new accounts if we don't have enough
  const accountsToCreate = count - storedAccounts.length;
  if (accountsToCreate > 0) {
    console.log(`   Creating ${accountsToCreate} new accounts...`);
    for (let i = 0; i < accountsToCreate; i++) {
      const wallet = Wallet.createRandom();
      storedAccounts.push({
        address: wallet.address,
        privateKey: wallet.privateKey,
      });
      needsFunding.push({
        address: wallet.address,
        balance: 0n,
        privateKey: wallet.privateKey,
      });
    }
    saveStoredAccounts(storedAccounts);
  }

  // Fund accounts that need it
  const accountsToFund = needsFunding.slice(0, count - fundedAccounts.length);

  if (accountsToFund.length > 0) {
    console.log(`\n💰 Funding ${accountsToFund.length} accounts...`);
    let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
    let retryCount = 0;
    const maxRetries = 10;

    for (let i = 0; i < accountsToFund.length; i++) {
      const acc = accountsToFund[i];
      const amountNeeded = CONFIG.initialFunding - acc.balance;

      try {
        const fundTx = await mainWallet.sendTransaction({
          to: acc.address,
          value: amountNeeded,
          gasLimit: 21000n,
          gasPrice: CONFIG.gasPrice,
          nonce: mainNonce
        });
        mainNonce++;
        retryCount = 0;

        await fundTx.wait();
        process.stdout.write(`\r   Funded: ${i + 1}/${accountsToFund.length} accounts`);
      } catch (error: any) {
        retryCount++;
        if (retryCount > maxRetries) {
          console.log(`\n   ❌ Max retries exceeded at account ${i + 1}`);
          break;
        }
        console.log(`\n   ⚠️ Error funding account ${i + 1} (retry ${retryCount}): ${error.message.substring(0, 50)}...`);
        mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
        i--;
        await sleep(Math.min(2000 * retryCount, 10000));
      }
    }
    console.log("");
  } else {
    console.log("   ✅ All accounts already have sufficient funds!");
  }

  // Build the final account states
  const accounts: AccountState[] = [];
  const usedAccounts = [...fundedAccounts, ...accountsToFund].slice(0, count);

  for (const acc of usedAccounts) {
    const wallet = new Wallet(acc.privateKey, provider);
    const nonce = await provider.getTransactionCount(wallet.address);

    accounts.push({
      wallet,
      nonce: Number(nonce),
      address: wallet.address,
      pendingCount: 0,
      consecutiveErrors: 0,
      totalSent: 0n,
      isComplete: false,
      txCount: 0,
    });
  }

  // Save updated accounts
  saveStoredAccounts(storedAccounts.slice(0, Math.max(count, storedAccounts.length)));

  console.log(`   ✅ Ready with ${accounts.length} funded accounts\n`);
  return accounts;
}

// ===================== SEND TRANSACTION =====================
async function sendTransaction(
  account: AccountState,
  recipient: string,
  provider: Provider
): Promise<TransactionResult> {
  const sendTime = Date.now();
  const usedNonce = account.nonce;

  try {
    const tx = await account.wallet.sendTransaction({
      to: recipient,
      value: CONFIG.txAmount,
      gasLimit: CONFIG.gasLimit,
      gasPrice: CONFIG.gasPrice,
      nonce: usedNonce
    });

    account.nonce++;
    account.pendingCount++;

    const receipt = await tx.wait();

    const confirmTime = Date.now();
    account.pendingCount--;
    account.consecutiveErrors = 0;

    if (receipt && receipt.status === 1) {
      account.totalSent += CONFIG.txAmount;
      account.txCount++;

      // Check if account reached target
      if (account.totalSent >= CONFIG.targetSpend) {
        account.isComplete = true;
      }
    }

    return {
      hash: tx.hash,
      sendTime,
      confirmTime,
      latency: confirmTime - sendTime,
      success: receipt?.status === 1,
      nonce: usedNonce,
      accountIndex: -1,
      amountSent: CONFIG.txAmount,
    };
  } catch (error: any) {
    account.pendingCount--;
    account.consecutiveErrors++;

    if (account.consecutiveErrors >= CONFIG.nonceRefreshThreshold) {
      try {
        const networkNonce = Number(await provider.getTransactionCount(account.address, "pending"));
        account.nonce = networkNonce;
      } catch (e) {
        // Ignore nonce refresh errors, continue with current nonce
      }
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
      accountIndex: -1,
      amountSent: 0n,
    };
  }
}

// ===================== MAIN BENCHMARK =====================
async function runBenchmark(accounts: AccountState[], provider: Provider): Promise<BenchmarkResult> {
  console.log("\n🚀 Starting Balance-Based Benchmark...");
  console.log(`   Accounts: ${accounts.length}`);
  console.log(`   Target spend per account: ${formatEther(CONFIG.targetSpend)} ETH`);
  console.log(`   Amount per transaction: ${formatEther(CONFIG.txAmount)} ETH`);
  console.log(`   Expected transactions per account: ~${Number(CONFIG.targetSpend / CONFIG.txAmount)}`);

  const recipient = Wallet.createRandom().address;
  const results: TransactionResult[] = [];
  const startTime = Date.now();

  const pendingPromises: Promise<TransactionResult>[] = [];
  let lastProgressUpdate = 0;

  // Keep running until all accounts complete or timeout
  while (true) {
    const elapsed = Date.now() - startTime;

    // Check timeout
    if (elapsed > CONFIG.timeoutMs) {
      console.log("\n   ⏰ Timeout reached, stopping...");
      break;
    }

    // Check if all accounts are complete
    const activeAccounts = accounts.filter(a => !a.isComplete);
    if (activeAccounts.length === 0) {
      console.log("\n   ✅ All accounts reached target!");
      break;
    }

    // Send transactions from accounts that have room
    let sentThisRound = 0;
    for (const account of activeAccounts) {
      if (account.pendingCount >= CONFIG.maxPendingPerAccount) continue;
      if (account.isComplete) continue;

      const accountIndex = accounts.indexOf(account);

      try {
        const promise = sendTransaction(account, recipient, provider);
        account.pendingCount++;

        promise.then(result => {
          result.accountIndex = accountIndex;
          account.pendingCount--;
          results.push(result);
        }).catch(() => {
          // Handle promise rejection silently
          account.pendingCount--;
        });

        pendingPromises.push(promise);
        sentThisRound++;
      } catch (error) {
        // Skip this account for now if we can't send
        continue;
      }
    }

    // Progress update every second
    if (Date.now() - lastProgressUpdate > 1000) {
      const completed = accounts.filter(a => a.isComplete).length;
      const totalConfirmed = results.filter(r => r.success).length;
      const totalSent = accounts.reduce((sum, a) => sum + a.totalSent, 0n);
      const tps = totalConfirmed / (elapsed / 1000);

      process.stdout.write(
        `\r   Accounts: ${completed}/${accounts.length} done | ` +
        `TX: ${totalConfirmed} confirmed | ` +
        `ETH: ${formatEther(totalSent)} | ` +
        `TPS: ${tps.toFixed(1)} | ` +
        `Time: ${formatDuration(elapsed)}`
      );
      lastProgressUpdate = Date.now();
    }

    // Small delay if nothing was sent
    if (sentThisRound === 0) {
      await sleep(50);
    }
  }

  // Wait for remaining confirmations (max 30s)
  console.log("\n   Waiting for pending transactions...");
  const waitStart = Date.now();
  while (pendingPromises.length > results.length && Date.now() - waitStart < 30000) {
    await sleep(500);
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Calculate results
  const successTx = results.filter(r => r.success);
  const failedTx = results.filter(r => !r.success);
  const latencies = successTx.map(r => r.latency);
  const totalEthTransferred = accounts.reduce((sum, a) => sum + a.totalSent, 0n);
  const accountsCompleted = accounts.filter(a => a.isComplete).length;

  return {
    name: "Balance-Based Benchmark",
    duration,
    totalTx: results.length,
    successTx: successTx.length,
    failedTx: failedTx.length,
    totalEthTransferred: formatEther(totalEthTransferred),
    avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
    maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
    p50Latency: percentile(latencies, 50),
    p95Latency: percentile(latencies, 95),
    confirmedTPS: successTx.length / (duration / 1000),
    accountsCompleted,
    successRate: results.length > 0 ? (successTx.length / results.length) * 100 : 0,
  };
}

// ===================== REPORT =====================
function generateReport(result: BenchmarkResult, accounts: AccountState[]): void {
  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log("\n" + "=".repeat(80));
  console.log("📊 BALANCE-BASED BENCHMARK RESULTS");
  console.log("=".repeat(80));

  console.log(`\n📈 ${result.name}`);
  console.log("-".repeat(60));
  console.log(`   Duration:           ${formatDuration(result.duration)}`);
  console.log(`   Accounts Completed: ${result.accountsCompleted}/${accounts.length}`);
  console.log(`   Total TX:           ${result.totalTx}`);
  console.log(`   ✅ Confirmed:        ${result.successTx} (${result.successRate.toFixed(1)}%)`);
  console.log(`   ❌ Failed:           ${result.failedTx}`);
  console.log(`   💰 ETH Transferred:  ${result.totalEthTransferred} ETH`);
  console.log(`   🚀 Confirmed TPS:    ${result.confirmedTPS.toFixed(2)} TPS`);
  console.log(`   ⏱️  Avg Latency:      ${formatDuration(result.avgLatency)}`);
  console.log(`   ⏱️  P50 Latency:      ${formatDuration(result.p50Latency)}`);
  console.log(`   ⏱️  P95 Latency:      ${formatDuration(result.p95Latency)}`);
  console.log(`   ⏱️  Min/Max:          ${formatDuration(result.minLatency)} / ${formatDuration(result.maxLatency)}`);

  // Per-account summary
  console.log("\n📋 Account Summary:");
  console.log("-".repeat(60));
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i];
    const status = a.isComplete ? "✅" : "⏳";
    console.log(`   ${status} Account ${i + 1}: ${a.txCount} tx | ${formatEther(a.totalSent)} ETH sent`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`🏆 CONFIRMED TPS: ${result.confirmedTPS.toFixed(2)} TPS`);
  console.log("=".repeat(80));

  // Save JSON
  const jsonPath = `${CONFIG.outputDir}/benchmark4-${timestamp}.json`;
  const configForJson = {
    ...CONFIG,
    gasLimit: CONFIG.gasLimit.toString(),
    gasPrice: CONFIG.gasPrice.toString(),
    initialFunding: CONFIG.initialFunding.toString(),
    targetSpend: CONFIG.targetSpend.toString(),
    txAmount: CONFIG.txAmount.toString(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify({
    config: configForJson,
    result,
    accounts: accounts.map(a => ({
      address: a.address,
      txCount: a.txCount,
      totalSent: a.totalSent.toString(),
      isComplete: a.isComplete,
    }))
  }, null, 2));
  console.log(`\n📄 JSON Report: ${jsonPath}`);

  // Save HTML
  const htmlPath = `${CONFIG.outputDir}/benchmark4-${timestamp}.html`;
  const html = generateHTMLReport(result, accounts);
  fs.writeFileSync(htmlPath, html);
  console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(result: BenchmarkResult, accounts: AccountState[]): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Besu Balance-Based Benchmark</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      min-height: 100vh; color: #fff; padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      text-align: center; margin-bottom: 0.5rem; font-size: 2.5rem;
      background: linear-gradient(90deg, #ffd700, #ff8c00);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .subtitle { text-align: center; color: #aaa; margin-bottom: 2rem; }
    .strategy { 
      background: rgba(255,215,0,0.1); border-left: 4px solid #ffd700; 
      padding: 1rem; margin-bottom: 2rem; border-radius: 0 8px 8px 0;
    }
    .strategy strong { color: #ffd700; }
    .peak {
      background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,140,0,0.2));
      border: 2px solid #ffd700; border-radius: 20px; padding: 2rem;
      margin-bottom: 2rem; text-align: center;
    }
    .peak h2 { color: #ffd700; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; color: #ffd700; }
    .peak .label { color: #aaa; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card {
      background: rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem;
      text-align: center;
    }
    .stat-card .value { font-size: 2rem; font-weight: 700; color: #ffd700; }
    .stat-card .label { color: #aaa; font-size: 0.85rem; }
    .accounts {
      background: rgba(255,255,255,0.05); border-radius: 12px; padding: 1.5rem;
    }
    .accounts h3 { color: #ffd700; margin-bottom: 1rem; }
    .account-row { display: flex; justify-content: space-between; padding: 0.5rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.1); }
    .account-row:last-child { border-bottom: none; }
    .complete { color: #4ade80; }
    .incomplete { color: #fbbf24; }
  </style>
</head>
<body>
  <div class="container">
    <h1>💰 Balance-Based Benchmark</h1>
    <p class="subtitle">Each account sends until 10 ETH transferred | ${new Date().toLocaleString()}</p>
    
    <div class="strategy">
      <strong>📊 Strategy:</strong> Each of ${accounts.length} accounts sends ${formatEther(CONFIG.txAmount)} ETH 
      transactions until they've transferred ${formatEther(CONFIG.targetSpend)} ETH total. 
      This measures sustained throughput over time.
    </div>
    
    <div class="peak">
      <h2>🚀 Confirmed TPS</h2>
      <div class="tps">${result.confirmedTPS.toFixed(1)}</div>
      <div class="label">transactions per second</div>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="value">${result.successTx}</div>
        <div class="label">Confirmed TX</div>
      </div>
      <div class="stat-card">
        <div class="value">${result.totalEthTransferred}</div>
        <div class="label">ETH Transferred</div>
      </div>
      <div class="stat-card">
        <div class="value">${formatDuration(result.duration)}</div>
        <div class="label">Duration</div>
      </div>
      <div class="stat-card">
        <div class="value">${formatDuration(result.p50Latency)}</div>
        <div class="label">P50 Latency</div>
      </div>
      <div class="stat-card">
        <div class="value">${result.accountsCompleted}/${accounts.length}</div>
        <div class="label">Accounts Done</div>
      </div>
      <div class="stat-card">
        <div class="value">${result.successRate.toFixed(1)}%</div>
        <div class="label">Success Rate</div>
      </div>
    </div>
    
    <div class="accounts">
      <h3>📋 Account Details</h3>
      ${accounts.map((a, i) => `
        <div class="account-row">
          <span class="${a.isComplete ? 'complete' : 'incomplete'}">${a.isComplete ? '✅' : '⏳'} Account ${i + 1}</span>
          <span>${a.txCount} tx</span>
          <span>${formatEther(a.totalSent)} ETH</span>
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
  console.log("💰 BESU BALANCE-BASED BENCHMARK");
  console.log("=".repeat(80));
  console.log("\n📝 Strategy: Each account sends transactions until 10 ETH transferred");
  console.log("   This tests sustained throughput over a longer period.\n");

  if (!CONFIG.privateKey) {
    throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
  }

  console.log(`Accounts: ${CONFIG.numAccounts}`);
  console.log(`Initial Funding: ${formatEther(CONFIG.initialFunding)} ETH per account`);
  console.log(`Target Spend: ${formatEther(CONFIG.targetSpend)} ETH per account`);
  console.log(`TX Amount: ${formatEther(CONFIG.txAmount)} ETH`);
  console.log(`Timeout: ${CONFIG.timeoutMs / 1000}s`);
  console.log(`RPC URL: ${CONFIG.rpcUrl}`);

  // Create provider with longer timeout (2 minutes per request)
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, undefined, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  // Set polling interval to reduce load
  provider.pollingInterval = 1000;
  const mainWallet = new Wallet(CONFIG.privateKey, provider);

  const network = await provider.getNetwork();
  console.log(`\nNetwork chainId: ${network.chainId}`);

  // Handle --clear flag: clear pending transactions and exit
  if (CLEAR_PENDING) {
    await clearPendingTransactions(provider);
    console.log("✅ Clear operation complete. Run benchmark without --clear to start.");
    return;
  }

  const accounts = await loadOrCreateAccounts(provider, mainWallet, CONFIG.numAccounts);

  if (accounts.length === 0) {
    console.log("❌ No accounts created. Check network and try again.");
    return;
  }

  let result: BenchmarkResult | null = null;

  try {
    result = await runBenchmark(accounts, provider);
  } catch (error: any) {
    console.log(`\n   ❌ Benchmark error: ${error.message}`);
    console.log("   Generating partial report...");

    // Generate a partial result
    const successTx = accounts.reduce((sum, a) => sum + a.txCount, 0);
    const totalEthTransferred = accounts.reduce((sum, a) => sum + a.totalSent, 0n);
    const accountsCompleted = accounts.filter(a => a.isComplete).length;

    result = {
      name: "Balance-Based Benchmark (Partial)",
      duration: Date.now() - Date.now(), // Will be 0
      totalTx: successTx,
      successTx,
      failedTx: 0,
      totalEthTransferred: formatEther(totalEthTransferred),
      avgLatency: 0,
      minLatency: 0,
      maxLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      confirmedTPS: 0,
      accountsCompleted,
      successRate: 100,
    };
  }

  if (result) {
    generateReport(result, accounts);
  }
  console.log("✅ Balance-based benchmark complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
