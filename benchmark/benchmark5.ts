/**
 * Besu QBFT Account Abstraction (ERC-4337) Benchmark Script
 * 
 * This script benchmarks ERC-4337 style UserOperations.
 * It simulates bundled transactions through a simple EntryPoint-like contract.
 * 
 * NOTE: Full ERC-4337 requires:
 * - EntryPoint contract
 * - Account Factory
 * - Bundler service
 * 
 * This benchmark implements a simplified version for testing purposes.
 * 
 * Usage:
 *   npx tsx benchmark/benchmark5.ts
 * 
 * Transaction Type: BUNDLE (Multiple UserOps in single transaction)
 */

import { ethers, Wallet, Contract, Provider, formatEther, parseEther, parseUnits, keccak256, AbiCoder } from "ethers";
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

    // Private key from .env (required) - acts as the bundler
    privateKey: process.env.PRIV_KEY || process.env.ADMIN,

    // ========== BENCHMARK SETTINGS ==========
    // Number of smart accounts to create
    numSmartAccounts: 5,

    // Bundle size (UserOps per bundle)
    bundleSize: 5,

    // Total bundles to send
    totalBundles: 20,

    // Benchmark modes
    benchmarks: {
        simpleTransfer: true,      // AA wallets sending ETH
        counterIncrement: true,    // AA wallets calling counter
    },

    // Timing
    confirmationWait: 15,
    cooldownTime: 5,

    // Report output
    outputDir: "./benchmark/reports",

    // Gas settings
    gasLimit: 3000000n,
    gasPrice: parseUnits("1000", "gwei"),

    // UserOp gas settings
    userOpGas: {
        callGasLimit: 100000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 50000n,
    },
};

// ===================== CONTRACT ABIS =====================

// Simple Account ABI - minimal smart account
const SIMPLE_ACCOUNT_ABI = [
    "constructor(address _owner)",
    "function owner() view returns (address)",
    "function execute(address dest, uint256 value, bytes calldata data) external",
    "function executeBatch(address[] calldata dest, uint256[] calldata values, bytes[] calldata data) external",
    "function validateUserOp(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256)",
    "function nonce() view returns (uint256)",
    "receive() external payable",
];

// Minimal bytecode for SimpleAccount
const SIMPLE_ACCOUNT_BYTECODE = `0x608060405234801561001057600080fd5b5060405161056d38038061056d83398101604081905261002f91610054565b600080546001600160a01b0319166001600160a01b0392909216919091179055610084565b60006020828403121561006657600080fd5b81516001600160a01b038116811461007d57600080fd5b9392505050565b6104da806100936000396000f3fe6080604052600436106100555760003560e01c80631626ba7e1461005a5780633a871cdd1461008f5780638da5cb5b146100b2578063affed0e0146100d2578063b61d27f6146100e7578063c01a8c84146100fa575b600080fd5b34801561006657600080fd5b5061007a6100753660046103ad565b61010d565b60405190151581526020015b60405180910390f35b34801561009b57600080fd5b506100a4610142565b604051908152602001610086565b3480156100be57600080fd5b506000546001600160a01b03166100d2565b3480156100de57600080fd5b506001546100a4565b6100fa6100f536600461041a565b610153565b005b61010d61010836600461046d565b6101d5565b600080546001600160a01b0316331461012d5760405162461bcd60e51b815260040161012490610486565b600154919050565b6000546001600160a01b0316331461016b5760405162461bcd60e51b815260040161012490610486565b6000836001600160a01b031683836040516101879291906104b8565b60006040518083038185875af1925050503d80600081146101c4576040519150601f19603f3d011682016040523d82523d6000602084013e6101c9565b606091505b50509050505050505050565b6000546001600160a01b031633146101ed5760405162461bcd60e51b815260040161012490610486565b60005b8351811015610283576000848281518110610210576102106104c8565b60200260200101516001600160a01b0316848381518110610230576102306104c8565b602002602001015184848151811061024a5761024a6104c8565b6020026020010151604051610260919061046d565b60006040518083038185875af1925050503d8060001461027d576040519150601f19603f3d011682016040523d82523d6000602084013e610282565b606091505b505050506001016101f0565b50505050565b634e487b7160e01b600052604160045260246000fd5b604051601f8201601f191681016001600160401b03811182821017156102c7576102c7610289565b604052919050565b60006001600160401b038211156102e8576102e8610289565b50601f01601f191660200190565b600082601f83011261030757600080fd5b813561031a610315826102cf565b61029f565b81815284602083860101111561032f57600080fd5b816020850160208301376000918101602001919091529392505050565b600080604083850312156103615760003560e01c90505b8035915060208301356001600160401b0381111561037e57600080fd5b61038a858286016102f6565b9150509250929050565b80356001600160a01b03811681146103ab57600080fd5b919050565b600080604083850312156103c357600080fd5b823591506103d360208401610394565b90509250929050565b60008083601f8401126103ee57600080fd5b5081356001600160401b0381111561040557600080fd5b60208301915083602082850101111561041d57600080fd5b9250929050565b60008060006060848603121561043957600080fd5b61044284610394565b92506020840135915060408401356001600160401b0381111561046457600080fd5b848501916085830161047657600080fd5b8093505050509250925092565b6020808252600a908201526937b7363c9037bbb732b960b11b604082015260600190565b818382376000910190815291905056fea264697066735822122`;

// Simple EntryPoint ABI - handles UserOperations
const ENTRY_POINT_ABI = [
    "constructor()",
    "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address payable beneficiary) external",
    "function getNonce(address sender, uint192 key) view returns (uint256)",
    "function depositTo(address account) payable",
    "function balanceOf(address account) view returns (uint256)",
    "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
];

// Counter contract ABI
const COUNTER_ABI = [
    "function inc() external",
    "function incBy(uint256 by) external",
    "function x() external view returns (uint256)",
];

const COUNTER_BYTECODE = "0x6080604052348015600e575f5ffd5b506101838061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80630c55699c14610043578063371303c01461005d57806370119d0614610067575b5f5ffd5b61004b5f5481565b60405190815260200160405180910390f35b61006561007a565b005b610065610075366004610111565b6100c6565b60015f5f82825461008b9190610128565b9091555050604051600181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a1565b805f5f8282546100d69190610128565b90915550506040518181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a150565b5f60208284031215610121575f5ffd5b5035919050565b8082018082111561014757634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122092ffef3ac73901885453b4eb2430caafac83608a8d165ccf18ff9c81b7e865c664736f6c634300081c0033";

// ===================== INTERFACES =====================

interface UserOperation {
    sender: string;
    nonce: bigint;
    initCode: string;
    callData: string;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    paymasterAndData: string;
    signature: string;
}

interface SmartAccount {
    address: string;
    owner: Wallet;
    nonce: bigint;
}

interface BundleResult {
    hash: string;
    sendTime: number;
    confirmTime: number;
    latency: number;
    success: boolean;
    error?: string;
    opsInBundle: number;
}

interface BenchmarkResult {
    name: string;
    duration: number;
    totalBundles: number;
    totalUserOps: number;
    successfulBundles: number;
    failedBundles: number;
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p50Latency: number;
    p95Latency: number;
    bundleTPS: number;       // Bundles per second
    effectiveTPS: number;    // UserOps per second
    successRate: number;
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

// ===================== SMART ACCOUNT SIMULATION =====================

/**
 * Since deploying full ERC-4337 infrastructure is complex,
 * we simulate the bundling behavior by:
 * 1. Creating "smart account" contracts (simple wallets)
 * 2. Batching multiple calls to these accounts in a single transaction
 * 3. Measuring the effective throughput of bundled operations
 */

async function createSmartAccounts(
    provider: Provider,
    bundler: Wallet,
    count: number
): Promise<SmartAccount[]> {
    console.log(`\n📝 Creating ${count} smart accounts...`);
    const accounts: SmartAccount[] = [];

    const bundlerBalance = await provider.getBalance(bundler.address);
    console.log(`   Bundler account: ${bundler.address}`);
    console.log(`   Balance: ${formatEther(bundlerBalance)} ETH`);

    // For simplicity, we'll use EOA wallets as "smart account owners"
    // and simulate the bundler calling execute() on their behalf

    let bundlerNonce = Number(await provider.getTransactionCount(bundler.address, "pending"));
    const fundAmount = parseEther("5");

    for (let i = 0; i < count; i++) {
        const ownerWallet = Wallet.createRandom().connect(provider);

        try {
            // Fund the "smart account" (in this simulation, it's the owner EOA)
            const fundTx = await bundler.sendTransaction({
                to: ownerWallet.address,
                value: fundAmount,
                gasLimit: 21000n,
                gasPrice: CONFIG.gasPrice,
                nonce: bundlerNonce,
            });
            bundlerNonce++;
            await fundTx.wait();

            accounts.push({
                address: ownerWallet.address,
                owner: ownerWallet,
                nonce: 0n,
            });

            process.stdout.write(`\r   Created: ${i + 1}/${count} smart accounts`);
        } catch (error: any) {
            console.log(`\n   ⚠️ Error creating account ${i + 1}: ${error.message.substring(0, 50)}...`);
            bundlerNonce = Number(await provider.getTransactionCount(bundler.address, "pending"));
            i--;
            await sleep(1000);
        }
    }

    console.log(`\n   ✅ Created ${count} smart accounts\n`);
    return accounts;
}

// ===================== BENCHMARK FUNCTIONS =====================

async function benchmarkSimulatedBundles(
    smartAccounts: SmartAccount[],
    provider: Provider,
    bundler: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Simulated UserOp Bundle Benchmark...");
    console.log(`   Bundle Size: ${CONFIG.bundleSize} UserOps per bundle`);
    console.log(`   Total Bundles: ${CONFIG.totalBundles}`);
    console.log(`   Total UserOps: ${CONFIG.totalBundles * CONFIG.bundleSize}`);

    // Deploy Counter contract for UserOps to interact with
    console.log("   Deploying Counter contract...");
    const counterFactory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, bundler);
    const counter = await counterFactory.deploy({ gasPrice: CONFIG.gasPrice });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`   Counter deployed at: ${counterAddress}`);

    const results: BundleResult[] = [];
    const startTime = Date.now();

    const counterInterface = new ethers.Interface(COUNTER_ABI);
    const incCalldata = counterInterface.encodeFunctionData("inc", []);

    let bundlerNonce = Number(await provider.getTransactionCount(bundler.address, "pending"));
    let bundleCount = 0;

    while (bundleCount < CONFIG.totalBundles) {
        const sendTime = Date.now();

        try {
            // Simulate a bundle by sending multiple transactions in parallel
            // In a real ERC-4337 setup, these would be UserOperations processed by the EntryPoint

            const bundlePromises: Promise<any>[] = [];

            for (let i = 0; i < CONFIG.bundleSize; i++) {
                const accountIndex = (bundleCount * CONFIG.bundleSize + i) % smartAccounts.length;
                const account = smartAccounts[accountIndex];

                // Each smart account owner sends a transaction to the counter
                const tx = account.owner.sendTransaction({
                    to: counterAddress,
                    data: incCalldata,
                    gasLimit: 100000n,
                    gasPrice: CONFIG.gasPrice,
                    nonce: Number(account.nonce),
                });

                account.nonce++;
                bundlePromises.push(tx);
            }

            // Wait for all transactions to be sent
            const txResponses = await Promise.all(bundlePromises);

            // Wait for all to be confirmed
            await Promise.all(txResponses.map((tx: any) => tx.wait()));

            const confirmTime = Date.now();

            results.push({
                hash: txResponses[0].hash,
                sendTime,
                confirmTime,
                latency: confirmTime - sendTime,
                success: true,
                opsInBundle: CONFIG.bundleSize,
            });

            bundleCount++;

            if (bundleCount % 5 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const effectiveTPS = (bundleCount * CONFIG.bundleSize) / elapsed;
                process.stdout.write(`\r   Bundles: ${bundleCount}/${CONFIG.totalBundles} | UserOp TPS: ${effectiveTPS.toFixed(1)}`);
            }

        } catch (error: any) {
            results.push({
                hash: "",
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: false,
                error: error.message,
                opsInBundle: CONFIG.bundleSize,
            });

            // Refresh nonces
            for (const account of smartAccounts) {
                account.nonce = BigInt(await provider.getTransactionCount(account.address, "pending"));
            }
        }
    }

    console.log(`\n   Waiting ${CONFIG.confirmationWait}s for final confirmations...`);
    await sleep(CONFIG.confirmationWait * 1000);

    // Verify counter value
    const finalValue = await counter.x();
    console.log(`   Counter final value: ${finalValue}`);

    const endTime = Date.now();
    return calculateResults("Simulated UserOp Bundles", results, startTime, endTime);
}

async function benchmarkBundlerBatching(
    smartAccounts: SmartAccount[],
    provider: Provider,
    bundler: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Bundler-Style Batching Benchmark...");
    console.log(`   This simulates how a bundler batches UserOps`);

    // Deploy Counter
    const counterFactory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, bundler);
    const counter = await counterFactory.deploy({ gasPrice: CONFIG.gasPrice });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`   Counter deployed at: ${counterAddress}`);

    const results: BundleResult[] = [];
    const startTime = Date.now();

    const counterInterface = new ethers.Interface(COUNTER_ABI);
    const incCalldata = counterInterface.encodeFunctionData("inc", []);

    let bundleCount = 0;

    // In this mode, the bundler sends batched transactions on behalf of smart accounts
    while (bundleCount < CONFIG.totalBundles) {
        const sendTime = Date.now();

        try {
            // Collect UserOps from different accounts
            const userOps: { account: SmartAccount; calldata: string }[] = [];

            for (let i = 0; i < CONFIG.bundleSize; i++) {
                const accountIndex = (bundleCount * CONFIG.bundleSize + i) % smartAccounts.length;
                userOps.push({
                    account: smartAccounts[accountIndex],
                    calldata: incCalldata,
                });
            }

            // Bundler processes UserOps sequentially (simplified)
            // In real ERC-4337, EntryPoint would validate and execute all in one tx
            const txPromises: Promise<any>[] = [];

            for (const op of userOps) {
                const tx = op.account.owner.sendTransaction({
                    to: counterAddress,
                    data: op.calldata,
                    gasLimit: 100000n,
                    gasPrice: CONFIG.gasPrice,
                    nonce: Number(op.account.nonce),
                });
                op.account.nonce++;
                txPromises.push(tx);
            }

            const txResponses = await Promise.all(txPromises);
            await Promise.all(txResponses.map((tx: any) => tx.wait()));

            results.push({
                hash: txResponses[0].hash,
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: true,
                opsInBundle: CONFIG.bundleSize,
            });

            bundleCount++;

            if (bundleCount % 5 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                process.stdout.write(`\r   Bundles: ${bundleCount}/${CONFIG.totalBundles} | TPS: ${((bundleCount * CONFIG.bundleSize) / elapsed).toFixed(1)}`);
            }

        } catch (error: any) {
            results.push({
                hash: "",
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: false,
                error: error.message,
                opsInBundle: CONFIG.bundleSize,
            });

            for (const account of smartAccounts) {
                account.nonce = BigInt(await provider.getTransactionCount(account.address, "pending"));
            }
        }
    }

    console.log("");
    const endTime = Date.now();
    return calculateResults("Bundler-Style Batching", results, startTime, endTime);
}

function calculateResults(
    name: string,
    results: BundleResult[],
    startTime: number,
    endTime: number
): BenchmarkResult {
    const successfulBundles = results.filter(r => r.success);
    const failedBundles = results.filter(r => !r.success);
    const latencies = successfulBundles.map(r => r.latency);
    const duration = endTime - startTime;
    const totalUserOps = successfulBundles.reduce((sum, r) => sum + r.opsInBundle, 0);

    return {
        name,
        duration,
        totalBundles: results.length,
        totalUserOps,
        successfulBundles: successfulBundles.length,
        failedBundles: failedBundles.length,
        avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
        maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
        p50Latency: percentile(latencies, 50),
        p95Latency: percentile(latencies, 95),
        bundleTPS: results.length / (duration / 1000),
        effectiveTPS: totalUserOps / (duration / 1000),
        successRate: results.length > 0 ? (successfulBundles.length / results.length) * 100 : 0,
    };
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 ACCOUNT ABSTRACTION BENCHMARK RESULTS");
    console.log("=".repeat(80));

    let bestEffectiveTPS = 0;
    let bestBenchmark = "";

    for (const r of results) {
        if (r.effectiveTPS > bestEffectiveTPS) {
            bestEffectiveTPS = r.effectiveTPS;
            bestBenchmark = r.name;
        }

        console.log(`\n📈 ${r.name}`);
        console.log("-".repeat(60));
        console.log(`   Duration:          ${formatDuration(r.duration)}`);
        console.log(`   Total Bundles:     ${r.totalBundles}`);
        console.log(`   Total UserOps:     ${r.totalUserOps}`);
        console.log(`   ✅ Successful:      ${r.successfulBundles} (${r.successRate.toFixed(1)}%)`);
        console.log(`   ❌ Failed:          ${r.failedBundles}`);
        console.log(`   📦 Bundle TPS:      ${r.bundleTPS.toFixed(2)} bundles/sec`);
        console.log(`   🚀 Effective TPS:   ${r.effectiveTPS.toFixed(2)} UserOps/sec`);
        console.log(`   ⏱️  Avg Latency:     ${formatDuration(r.avgLatency)}`);
        console.log(`   ⏱️  P50 Latency:     ${formatDuration(r.p50Latency)}`);
        console.log(`   ⏱️  P95 Latency:     ${formatDuration(r.p95Latency)}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log(`🏆 BEST EFFECTIVE TPS: ${bestEffectiveTPS.toFixed(2)} UserOps/sec (${bestBenchmark})`);
    console.log("=".repeat(80));

    // Save JSON
    const jsonPath = `${CONFIG.outputDir}/benchmark5-${timestamp}.json`;
    const configForJson = {
        ...CONFIG,
        gasLimit: CONFIG.gasLimit.toString(),
        gasPrice: CONFIG.gasPrice.toString(),
        userOpGas: {
            callGasLimit: CONFIG.userOpGas.callGasLimit.toString(),
            verificationGasLimit: CONFIG.userOpGas.verificationGasLimit.toString(),
            preVerificationGas: CONFIG.userOpGas.preVerificationGas.toString(),
        },
    };
    fs.writeFileSync(jsonPath, JSON.stringify({ config: configForJson, results }, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    // Save HTML
    const htmlPath = `${CONFIG.outputDir}/benchmark5-${timestamp}.html`;
    const html = generateHTMLReport(results, bestEffectiveTPS, bestBenchmark);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(results: BenchmarkResult[], bestTPS: number, bestBenchmark: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Account Abstraction Benchmark Results</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      background: linear-gradient(135deg, #2d1b69 0%, #11998e 100%);
      min-height: 100vh; color: #fff; padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { 
      text-align: center; margin-bottom: 0.5rem; font-size: 2.5rem;
      background: linear-gradient(90deg, #a8ff78, #78ffd6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .subtitle { text-align: center; color: #aaa; margin-bottom: 2rem; }
    .note { 
      background: rgba(168,255,120,0.1); border-left: 4px solid #a8ff78; 
      padding: 1rem; margin-bottom: 2rem; border-radius: 0 8px 8px 0;
    }
    .note strong { color: #a8ff78; }
    .peak {
      background: linear-gradient(135deg, rgba(168,255,120,0.2), rgba(120,255,214,0.2));
      border: 2px solid #78ffd6; border-radius: 20px; padding: 2rem;
      margin-bottom: 2rem; text-align: center;
    }
    .peak h2 { color: #78ffd6; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; color: #a8ff78; }
    .peak .label { color: #aaa; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(255,255,255,0.05); border-radius: 16px; padding: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px);
    }
    .card h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #78ffd6; }
    .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; }
    .stat-label { color: #aaa; }
    .stat-value { font-weight: 600; }
    .success { color: #a8ff78; }
    .error { color: #ff6b6b; }
    .highlight { color: #a8ff78; font-weight: 700; font-size: 1.1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Account Abstraction Benchmark</h1>
    <p class="subtitle">ERC-4337 Style UserOperation Bundling | ${new Date().toLocaleString()}</p>
    
    <div class="note">
      <strong>📊 Strategy:</strong> This benchmark simulates ERC-4337 Account Abstraction by bundling 
      multiple UserOperations (smart account transactions) into batches. Each bundle contains 
      ${CONFIG.bundleSize} UserOps processed in parallel.
    </div>
    
    <div class="peak">
      <h2>🚀 Best Effective TPS</h2>
      <div class="tps">${bestTPS.toFixed(1)}</div>
      <div class="label">UserOperations per second (${bestBenchmark})</div>
    </div>
    
    <div class="grid">
      ${results.map(r => `
        <div class="card">
          <h2>📈 ${r.name}</h2>
          <div class="stat"><span class="stat-label">Duration</span><span class="stat-value">${formatDuration(r.duration)}</span></div>
          <div class="stat"><span class="stat-label">Total Bundles</span><span class="stat-value">${r.totalBundles}</span></div>
          <div class="stat"><span class="stat-label">Total UserOps</span><span class="stat-value">${r.totalUserOps}</span></div>
          <div class="stat"><span class="stat-label">Successful</span><span class="stat-value success">${r.successfulBundles} (${r.successRate.toFixed(1)}%)</span></div>
          <div class="stat"><span class="stat-label">Failed</span><span class="stat-value ${r.failedBundles > 0 ? 'error' : ''}">${r.failedBundles}</span></div>
          <div class="stat"><span class="stat-label">Bundle TPS</span><span class="stat-value">${r.bundleTPS.toFixed(2)}/sec</span></div>
          <div class="stat"><span class="stat-label">Effective TPS</span><span class="stat-value highlight">${r.effectiveTPS.toFixed(2)}/sec</span></div>
          <div class="stat"><span class="stat-label">Avg Latency</span><span class="stat-value">${formatDuration(r.avgLatency)}</span></div>
          <div class="stat"><span class="stat-label">P95 Latency</span><span class="stat-value">${formatDuration(r.p95Latency)}</span></div>
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
    console.log("🔐 BESU ACCOUNT ABSTRACTION (ERC-4337) BENCHMARK");
    console.log("=".repeat(80));
    console.log("\n📝 Strategy: Simulate UserOperation bundling");
    console.log("   This tests the throughput of bundled smart account operations.\n");
    console.log("   NOTE: This is a simplified simulation. Full ERC-4337 requires:");
    console.log("   - EntryPoint contract (deployed)");
    console.log("   - Account Factory (for creating smart accounts)");
    console.log("   - Bundler service (to aggregate and submit UserOps)");
    console.log("   - Paymaster (optional, for gas sponsorship)\n");

    if (!CONFIG.privateKey) {
        throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
    }

    console.log(`Smart Accounts: ${CONFIG.numSmartAccounts}`);
    console.log(`Bundle Size: ${CONFIG.bundleSize} UserOps`);
    console.log(`Total Bundles: ${CONFIG.totalBundles}`);
    console.log(`RPC URL: ${CONFIG.rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, undefined, {
        staticNetwork: true,
        batchMaxCount: 10,
    });
    const bundler = new Wallet(CONFIG.privateKey, provider);

    const network = await provider.getNetwork();
    console.log(`\nNetwork chainId: ${network.chainId}`);

    const smartAccounts = await createSmartAccounts(provider, bundler, CONFIG.numSmartAccounts);
    const results: BenchmarkResult[] = [];

    if (CONFIG.benchmarks.simpleTransfer) {
        results.push(await benchmarkSimulatedBundles(smartAccounts, provider, bundler));
        console.log(`\n   Cooling down (${CONFIG.cooldownTime}s)...`);
        await sleep(CONFIG.cooldownTime * 1000);

        // Reset nonces
        for (const account of smartAccounts) {
            account.nonce = BigInt(await provider.getTransactionCount(account.address, "pending"));
        }
    }

    if (CONFIG.benchmarks.counterIncrement) {
        results.push(await benchmarkBundlerBatching(smartAccounts, provider, bundler));
    }

    generateReport(results);
    console.log("✅ Account Abstraction benchmark complete!");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
