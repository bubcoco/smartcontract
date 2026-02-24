/**
 * PancakeSwap V3 DeFi Stress Test (benchmark9.ts)
 * 
 * Aggressive DeFi load testing using deployed PancakeSwap V3 contracts.
 * Performs high-frequency token swaps to stress test the network.
 * 
 * Usage:
 *   npx tsx benchmark/benchmark9.ts                    # Default (60s test)
 *   npx tsx benchmark/benchmark9.ts --duration=120     # 120 second test
 *   npx tsx benchmark/benchmark9.ts --accounts=50      # More accounts
 *   npx tsx benchmark/benchmark9.ts --turbo            # Maximum aggression
 * 
 * Prerequisites:
 *   - PancakeSwap V3 contracts deployed on loaffinity network
 *   - Existing liquidity pool with tokens
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

// ===================== DEPLOYED ADDRESSES =====================
const DEPLOYED = {
    // From loaffinity deployments
    factory: "0x1883bfd1a26497721D330cE6b3E7224ec3A465A5",
    swapRouter: "0x90CEFBA97CB6bfc910C8dc84f3551BF9aDE026A3",
    positionManager: "0x0d7cc082214D4Aaf1367Ba7421CfF51C7ee0e818",
    quoterV2: "0x67227d69544db01C8a29DBae2F5e011597103C81",

    // Pool and tokens from test-pool-config
    pool: "0x3C75c38f71373bCAeBd253A2Fd1d4ED1ffF8C08c",
    token0: "0x66F3d567C67614B782b75f3481a00e882283eEb5",
    token1: "0xC28a5F1Ae7Dd661192c6171335E5c71EC94d908C",
    poolFee: 3000, // 0.3%
};

// ===================== CONFIGURATION =====================
const CONFIG = {
    rpcUrl: process.env.RPC_URL || "http://localhost:8545",
    privateKey: process.env.PRIV_KEY || process.env.ADMIN,

    // Test settings - AGGRESSIVE for DeFi stress testing
    testDuration: parseArg('duration', 60),
    numAccounts: parseArg('accounts', TURBO_MODE ? 50 : 30),
    maxPendingPerAccount: parseArg('pending', TURBO_MODE ? 20 : 10),

    // Swap settings
    swapAmount: parseEther("1"), // Amount to swap each tx

    // Funding - enough for many swaps
    fundAmount: parseEther("1000"),

    // Gas
    gasLimit: 300000n, // Swaps need more gas
    gasPrice: parseUnits("1000", "gwei"),

    // Report
    outputDir: "./benchmark/reports",

    // Nonce recovery
    nonceRefreshThreshold: 5,

    // Delays (ms)
    loopDelay: TURBO_MODE ? 1 : 5,
    cooldownMs: 2000,
};

// ===================== ABIs =====================
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
];

const SWAP_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)",
];

const POOL_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function fee() external view returns (uint24)",
];

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
    swapDirection: boolean; // true = token0->token1, false = token1->token0
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
    console.log(`\n📝 Setting up ${CONFIG.numAccounts} accounts for DeFi stress test...`);

    const mainBalance = await provider.getBalance(mainWallet.address);
    console.log(`   Main: ${mainWallet.address}`);
    console.log(`   ETH Balance: ${formatEther(mainBalance)} ETH`);

    // Check token balances
    const token0 = new Contract(DEPLOYED.token0, ERC20_ABI, mainWallet);
    const token1 = new Contract(DEPLOYED.token1, ERC20_ABI, mainWallet);

    const token0Balance = await token0.balanceOf(mainWallet.address);
    const token1Balance = await token1.balanceOf(mainWallet.address);
    const token0Symbol = await token0.symbol().catch(() => "Token0");
    const token1Symbol = await token1.symbol().catch(() => "Token1");

    console.log(`   ${token0Symbol} Balance: ${formatEther(token0Balance)}`);
    console.log(`   ${token1Symbol} Balance: ${formatEther(token1Balance)}`);

    const accounts: AccountState[] = [];

    // Create accounts
    console.log(`\n   Creating ${CONFIG.numAccounts} accounts...`);
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
            swapDirection: i % 2 === 0,
        });
    }

    // ========== PARALLEL BATCH FUNDING ==========
    let mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");
    const BATCH_SIZE = 10;
    const ethFund = parseEther("10");
    const tokenAmount = parseEther("500");

    // Fund ETH in parallel batches
    console.log(`   Funding ETH (batch size: ${BATCH_SIZE})...`);
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const txPromises = batch.map((acc, j) => {
            return mainWallet.sendTransaction({
                to: acc.address,
                value: ethFund,
                gasLimit: 21000n,
                gasPrice: CONFIG.gasPrice,
                nonce: mainNonce + j,
            });
        });
        mainNonce += batch.length;

        const txs = await Promise.all(txPromises);
        await Promise.all(txs.map(tx => tx.wait()));
        process.stdout.write(`\r   ETH: ${Math.min(i + BATCH_SIZE, accounts.length)}/${accounts.length}`);
    }
    console.log(" ✅");

    // Distribute token0 in parallel batches
    console.log(`   Distributing ${token0Symbol} (batch size: ${BATCH_SIZE})...`);
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const txPromises = batch.map((acc, j) => {
            return token0.transfer(acc.address, tokenAmount, {
                gasLimit: 100000n,
                nonce: mainNonce + j,
            });
        });
        mainNonce += batch.length;

        const txs = await Promise.all(txPromises);
        await Promise.all(txs.map(tx => tx.wait()));
        process.stdout.write(`\r   ${token0Symbol}: ${Math.min(i + BATCH_SIZE, accounts.length)}/${accounts.length}`);
    }
    console.log(" ✅");

    // Distribute token1 in parallel batches
    console.log(`   Distributing ${token1Symbol} (batch size: ${BATCH_SIZE})...`);
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        const txPromises = batch.map((acc, j) => {
            return token1.transfer(acc.address, tokenAmount, {
                gasLimit: 100000n,
                nonce: mainNonce + j,
            });
        });
        mainNonce += batch.length;

        const txs = await Promise.all(txPromises);
        await Promise.all(txs.map(tx => tx.wait()));
        process.stdout.write(`\r   ${token1Symbol}: ${Math.min(i + BATCH_SIZE, accounts.length)}/${accounts.length}`);
    }
    console.log(" ✅");

    // ========== PARALLEL APPROVALS ==========
    // Each account approves from its own wallet (independent nonces)
    console.log(`   Approving SwapRouter (parallel)...`);
    const maxApproval = ethers.MaxUint256;

    // Process in batches to avoid overwhelming RPC
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);

        const approvalPromises = batch.map(async (acc) => {
            const t0 = new Contract(DEPLOYED.token0, ERC20_ABI, acc.wallet);
            const t1 = new Contract(DEPLOYED.token1, ERC20_ABI, acc.wallet);

            // Each account has nonce 0 for first tx, 1 for second
            const tx1 = await t0.approve(DEPLOYED.swapRouter, maxApproval, {
                gasLimit: 100000n,
                gasPrice: CONFIG.gasPrice,
                nonce: 0,
            });
            const tx2 = await t1.approve(DEPLOYED.swapRouter, maxApproval, {
                gasLimit: 100000n,
                gasPrice: CONFIG.gasPrice,
                nonce: 1,
            });
            await Promise.all([tx1.wait(), tx2.wait()]);
        });

        await Promise.all(approvalPromises);
        process.stdout.write(`\r   Approved: ${Math.min(i + BATCH_SIZE, accounts.length)}/${accounts.length}`);
    }
    console.log(" ✅");

    // Get final nonces (should be 2 after approvals)
    for (const acc of accounts) {
        acc.nonce = await provider.getTransactionCount(acc.address, "pending");
    }

    console.log(`\n   ✅ ${accounts.length} accounts ready for swapping\n`);
    return accounts;
}

// ===================== SWAP BENCHMARK =====================
async function runSwapBenchmark(
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider
): Promise<BenchmarkResult> {
    console.log(`\n🔄 PancakeSwap V3 Swap Stress Test`);
    console.log(`   Duration: ${CONFIG.testDuration}s`);
    console.log(`   Accounts: ${accounts.length}`);
    console.log(`   Accounts: ${accounts.length}`);
    console.log(`   Swap amount: ${formatEther(CONFIG.swapAmount)} per tx`);
    console.log(`   Mode: CONFIRMATION-BASED (wait for each swap)`);
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

    // Confirmation-based: each account runs its own swap loop
    const accountSwapLoop = async (account: AccountState) => {
        const router = new Contract(DEPLOYED.swapRouter, SWAP_ROUTER_ABI, account.wallet);

        while (Date.now() < endTime) {
            const sendTime = Date.now();

            // Alternate swap direction
            const tokenIn = account.swapDirection ? DEPLOYED.token0 : DEPLOYED.token1;
            const tokenOut = account.swapDirection ? DEPLOYED.token1 : DEPLOYED.token0;

            const swapParams = {
                tokenIn,
                tokenOut,
                fee: DEPLOYED.poolFee,
                recipient: account.address,
                deadline: Math.floor(Date.now() / 1000) + 600, // 10 minutes
                amountIn: CONFIG.swapAmount,
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
            };

            try {
                const tx = await router.exactInputSingle(swapParams, {
                    gasLimit: CONFIG.gasLimit,
                    gasPrice: CONFIG.gasPrice,
                    nonce: account.nonce,
                });

                account.nonce++;
                account.txSent++;
                totalSent++;

                const result: TxResult = {
                    hash: tx.hash,
                    sendTime,
                    success: false,
                };
                results.push(result);

                // Wait for confirmation
                try {
                    const receipt = await tx.wait();
                    result.confirmTime = Date.now();
                    result.latency = result.confirmTime - sendTime;
                    result.success = receipt?.status === 1;

                    if (result.success) {
                        account.txConfirmed++;
                        totalConfirmed++;
                        account.consecutiveErrors = 0;
                        // Toggle direction on success
                        account.swapDirection = !account.swapDirection;
                    } else {
                        account.txFailed++;
                        totalFailed++;
                        // Log first failure for debugging
                        if (totalFailed === 1) {
                            console.log(`\n   ⚠️ First failure: ${tx.hash}`);
                        }
                    }
                } catch (waitError: any) {
                    result.success = false;
                    account.txFailed++;
                    totalFailed++;
                    account.consecutiveErrors++;

                    // Log first error for debugging
                    if (account.consecutiveErrors === 1 && totalFailed <= 3) {
                        console.log(`\n   ⚠️ Swap reverted: ${waitError.message?.slice(0, 100)}`);
                    }

                    // Refresh nonce on errors
                    if (account.consecutiveErrors >= CONFIG.nonceRefreshThreshold) {
                        account.nonce = await provider.getTransactionCount(account.address, "pending");
                        account.consecutiveErrors = 0;
                    }
                }

            } catch (sendError: any) {
                account.consecutiveErrors++;

                // Log first send error for debugging
                if (account.consecutiveErrors === 1 && totalFailed <= 3) {
                    console.log(`\n   ⚠️ Send error: ${sendError.message?.slice(0, 100)}`);
                }

                if (account.consecutiveErrors >= CONFIG.nonceRefreshThreshold) {
                    account.nonce = await provider.getTransactionCount(account.address, "pending");
                    account.consecutiveErrors = 0;
                }
            }

            // Small delay between swaps
            await sleep(CONFIG.loopDelay);
        }
    };

    // Progress reporter
    const progressReporter = async () => {
        while (Date.now() < endTime) {
            const now = Date.now();
            if (now - lastProgressTime >= 1000) {
                const elapsed = (now - startTime) / 1000;
                const remaining = Math.max(0, (endTime - now) / 1000);
                const tps = elapsed > 0 ? totalConfirmed / elapsed : 0;

                process.stdout.write(
                    `\r🔄 Sent: ${totalSent} | ✅ Confirmed: ${totalConfirmed} (${tps.toFixed(1)} TPS) | ` +
                    `❌ Failed: ${totalFailed} | Time: ${elapsed.toFixed(0)}s (${remaining.toFixed(0)}s left)   `
                );
                lastProgressTime = now;
            }
            await sleep(500);
        }
    };

    // Run all accounts in parallel + progress reporter
    console.log(`   Starting ${accounts.length} parallel swap loops...`);
    await Promise.all([
        progressReporter(),
        ...accounts.map(acc => accountSwapLoop(acc))
    ]);

    const duration = Date.now() - startTime;

    // Calculate latencies
    const confirmedResults = results.filter(r => r.success && r.latency);
    const latencies = confirmedResults.map(r => r.latency!);

    const result: BenchmarkResult = {
        name: "PancakeSwap V3 Swaps",
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

    console.log(`\n\n   ✅ Complete: ${result.totalConfirmed} swaps confirmed, ${result.confirmedTPS.toFixed(2)} TPS\n`);
    return result;
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 PANCAKESWAP V3 DEFI STRESS TEST RESULTS");
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
    const jsonPath = `${CONFIG.outputDir}/benchmark9-${timestamp}.json`;
    fs.writeFileSync(jsonPath, JSON.stringify({
        config: {
            testDuration: CONFIG.testDuration,
            numAccounts: CONFIG.numAccounts,
            maxPendingPerAccount: CONFIG.maxPendingPerAccount,
            swapAmount: CONFIG.swapAmount.toString(),
            pool: DEPLOYED.pool,
            token0: DEPLOYED.token0,
            token1: DEPLOYED.token1,
        },
        results,
        timestamp: new Date().toISOString(),
    }, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    // Save HTML
    const htmlPath = `${CONFIG.outputDir}/benchmark9-${timestamp}.html`;
    const html = generateHTML(results, maxTPS, bestName);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTML(results: BenchmarkResult[], maxTPS: number, bestName: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PancakeSwap V3 DeFi Stress Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1a1a2e, #16213e); min-height: 100vh; color: #fff; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 2rem; font-size: 2rem; color: #00ff87; }
    .peak { background: rgba(0,255,135,0.1); border: 2px solid #00ff87; border-radius: 20px; padding: 2rem; text-align: center; margin-bottom: 2rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; color: #00ff87; }
    .contracts { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 1rem; margin-bottom: 2rem; font-size: 0.85rem; }
    .contracts code { color: #60efff; }
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
    <h1>🥞 PancakeSwap V3 DeFi Stress Test</h1>
    <div class="peak">
      <div>🏆 Peak Confirmed TPS</div>
      <div class="tps">${maxTPS.toFixed(1)}</div>
      <div>${bestName}</div>
    </div>
    <div class="contracts">
      <strong>Contracts:</strong>
      Pool: <code>${DEPLOYED.pool}</code> |
      Router: <code>${DEPLOYED.swapRouter}</code>
    </div>
    <div class="grid">
      ${results.map(r => `
        <div class="card">
          <h2>${r.name}</h2>
          <div class="stat"><span class="stat-label">Duration</span><span>${formatDuration(r.duration)}</span></div>
          <div class="stat"><span class="stat-label">Swaps Sent</span><span>${r.totalSent}</span></div>
          <div class="stat"><span class="stat-label">Confirmed</span><span class="highlight">${r.totalConfirmed}</span></div>
          <div class="stat"><span class="stat-label">Confirmed TPS</span><span class="highlight">${r.confirmedTPS.toFixed(2)}</span></div>
          <div class="stat"><span class="stat-label">Success Rate</span><span>${r.successRate.toFixed(1)}%</span></div>
          <div class="stat"><span class="stat-label">P50 Latency</span><span>${formatDuration(r.p50Latency)}</span></div>
          <div class="stat"><span class="stat-label">P95 Latency</span><span>${formatDuration(r.p95Latency)}</span></div>
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
    console.log("🥞 PANCAKESWAP V3 DEFI STRESS TEST (benchmark9)");
    console.log("=".repeat(80));
    console.log("\n📝 High-frequency swap stress testing using deployed PancakeSwap V3.\n");
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
    console.log(`Pool:               ${DEPLOYED.pool}`);
    console.log(`SwapRouter:         ${DEPLOYED.swapRouter}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, undefined, { staticNetwork: true });
    const mainWallet = new Wallet(CONFIG.privateKey, provider);

    const network = await provider.getNetwork();
    console.log(`Chain ID:           ${network.chainId}`);

    // Check pool exists
    const pool = new Contract(DEPLOYED.pool, POOL_ABI, provider);
    try {
        const slot0 = await pool.slot0();
        console.log(`Pool Tick:          ${slot0.tick}`);
    } catch (e) {
        console.error("❌ Pool not found or not initialized!");
        process.exit(1);
    }

    const accounts = await setupAccounts(provider, mainWallet);
    const results: BenchmarkResult[] = [];

    // Run swap benchmark
    results.push(await runSwapBenchmark(accounts, provider));

    generateReport(results);
    console.log("✅ DeFi benchmark complete!\n");
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
