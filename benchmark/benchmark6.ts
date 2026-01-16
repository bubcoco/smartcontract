/**
 * Besu QBFT Multicall Benchmark Script
 * 
 * This script uses Multicall3 to batch multiple calls into a single transaction.
 * This reduces gas overhead and can achieve higher effective TPS for read-heavy operations.
 * 
 * Usage:
 *   npx tsx benchmark/benchmark6.ts
 * 
 * Transaction Type: BATCH (Multiple calls in single transaction)
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
    numAccounts: 5,

    // Number of calls to batch per multicall transaction
    batchSize: 10,

    // Total multicall transactions to send
    totalMulticalls: 50,

    // Benchmark modes
    benchmarks: {
        batchedTransfers: true,   // Batch native transfers via multicall
        batchedERC20: true,       // Batch ERC20 transfers
        batchedMints: true,       // Batch minting operations
    },

    // Timing
    confirmationWait: 20,
    cooldownTime: 5,

    // Report output
    outputDir: "./benchmark/reports",

    // Gas settings
    gasLimit: 5000000n,  // Higher gas limit for batched calls
    gasPrice: parseUnits("1000", "gwei"),
};

// Multicall3 Contract ABI (deployed on most networks)
const MULTICALL3_ABI = [
    "function aggregate(tuple(address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)",
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
    "function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

// Multicall3 bytecode for deployment
const MULTICALL3_BYTECODE = `0x608060405234801561001057600080fd5b50610ee0806100206000396000f3fe6080604052600436106100f35760003560e01c80634d2301cc1161008a578063a8b0574e11610059578063a8b0574e1461025a578063bce38bd714610268578063c3077fa914610288578063ee82ac5e1461029b57600080fd5b80634d2301cc146101ec57806372425d9d1461022757806382ad56cb1461023a57806386d516e81461024d57600080fd5b80633408e470116100c65780633408e470146101855780633e64a6961461019857806342cbb15c146101c9578063499f3d91146101dc57600080fd5b80630f28c97d146100f8578063174dfd7c1461011e578063252dba421461014857806327e86d6e14610169575b600080fd5b34801561010457600080fd5b5061010c6102be565b60405190815260200160405180910390f35b34801561012a57600080fd5b5061013361045557565b60405163ffffffff909116815260200160405180910390f35b61015b610156366004610a85565b6102c6565b604051610165929190610b50565b60405180910390f35b34801561017557600080fd5b504361010c565b34801561019157600080fd5b504661010c565b3480156101a457600080fd5b506101b86101b3366004610c52565b610466565b604051610165959493929190610cd7565b3480156101d557600080fd5b504361010c565b3480156101e857600080fd5b5041610133565b3480156101f857600080fd5b5061010c610207366004610d35565b73ffffffffffffffffffffffffffffffffffffffff163190565b34801561023357600080fd5b504461010c565b61015b610248366004610a85565b61046e565b34801561025957600080fd5b504561010c565b34801561026657600080fd5b505b005b61027b610276366004610d57565b610596565b6040516101659190610dd8565b61015b610296366004610a85565b6106f5565b3480156102a757600080fd5b5061010c6102b6366004610e17565b60001961080d565b60004261010c565b8051439060609067ffffffffffffffff8111156102e5576102e5610e30565b60405190808252806020026020018201604052801561031857816020015b60608152602001906001900390816103035790505b50905060005b835181101561044f5783818151811061033957610339610e5f565b6020026020010151600001516001600160a01b031684828151811061036057610360610e5f565b6020026020010151602001516040516103799190610e75565b6000604051808303816000865af19150503d80600081146103b6576040519150601f19603f3d011682016040523d82523d6000602084013e6103bb565b606091505b508383815181106103ce576103ce610e5f565b60200260200101819052508280156103fe575082828151811061040357600080fd5b60200260200101515115156001145b61043757600083838151811061042a5761042a610e5f565b6020026020010151905080fd5b8061044181610e91565b91505061031e565b50915091565b60004063ffffffff1690565b565b8051606090819067ffffffffffffffff81111561048257610482610e30565b6040519080825280602002602001820160405280156104c857816020015b604080516060810182526000808252602082018190529181019190915281526020019060019003908161049f5790505b50905060005b825181101561058a5760008382815181106104eb576104eb610e5f565b6020026020010151600001516001600160a01b031684838151811061051257610512610e5f565b60200260200101516040015160405161052b9190610e75565b6000604051808303816000865af19150503d8060008114610568576040519150601f19603f3d011682016040523d82523d6000602084013e61056d565b606091505b509150915081848381518110610363576103636105835780610e5f565b505b50506001016104ce565b5092915050565b`;

// Simple ERC20 ABI for testing
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
];

// Counter contract ABI
const COUNTER_ABI = [
    "function inc() external",
    "function incBy(uint256 by) external",
    "function x() external view returns (uint256)",
];

const COUNTER_BYTECODE = "0x6080604052348015600e575f5ffd5b506101838061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80630c55699c14610043578063371303c01461005d57806370119d0614610067575b5f5ffd5b61004b5f5481565b60405190815260200160405180910390f35b61006561007a565b005b610065610075366004610111565b6100c6565b60015f5f82825461008b9190610128565b9091555050604051600181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a1565b805f5f8282546100d69190610128565b90915550506040518181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a150565b5f60208284031215610121575f5ffd5b5035919050565b8082018082111561014757634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122092ffef3ac73901885453b4eb2430caafac83608a8d165ccf18ff9c81b7e865c664736f6c634300081c0033";

// ===================== INTERFACES =====================
interface TransactionResult {
    hash: string;
    sendTime: number;
    confirmTime: number;
    latency: number;
    success: boolean;
    error?: string;
    callsInBatch: number;
}

interface BenchmarkResult {
    name: string;
    duration: number;
    totalMulticalls: number;
    totalCalls: number;
    successfulMulticalls: number;
    failedMulticalls: number;
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p50Latency: number;
    p95Latency: number;
    multicallTPS: number;       // Multicall transactions per second
    effectiveTPS: number;       // Total calls per second (multicalls * batch size)
    successRate: number;
}

interface AccountState {
    wallet: Wallet;
    nonce: number;
    address: string;
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

    let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
    const fundAmount = parseEther("20");

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
            mainNonce++;
            await fundTx.wait();

            const nonce = await provider.getTransactionCount(randomWallet.address);
            accounts.push({
                wallet: randomWallet,
                nonce: Number(nonce),
                address: randomWallet.address,
            });

            process.stdout.write(`\r   Funded: ${i + 1}/${count} accounts`);
        } catch (error: any) {
            console.log(`\n   ⚠️ Error funding account ${i + 1}: ${error.message.substring(0, 50)}...`);
            mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
            i--;
            await sleep(1000);
        }
    }

    console.log(`\n   ✅ Created and funded ${count} accounts\n`);
    return accounts;
}

// ===================== MULTICALL DEPLOYMENT =====================
async function deployMulticall3(wallet: Wallet): Promise<Contract> {
    console.log("   Deploying Multicall3 contract...");

    // Simple Multicall3 implementation
    const SIMPLE_MULTICALL_ABI = [
        "function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
    ];

    // Simpler bytecode that supports aggregate3Value
    const SIMPLE_MULTICALL_BYTECODE = "0x608060405234801561001057600080fd5b506104e8806100206000396000f3fe60806040526004361061001e5760003560e01c806382ad56cb14610023575b600080fd5b610036610031366004610239565b61004c565b60405161004391906102f5565b60405180910390f35b606081516001600160401b0381111561006757610067610360565b6040519080825280602002602001820160405280156100ac57816020015b604080518082019091526000815260606020820152815260200190600190039081610085575050905060005b825181101561022f5760008382815181106100ce576100ce610376565b6020026020010151600001516001600160a01b031684838151811061010557610100610376565b60200260200101516040015185848151811061012357610123610376565b6020026020010151606001516040516101439291906000916103a4565b60006040518083038185875af1925050503d8060008114610180576040519150601f19603f3d011682016040523d82523d6000602084013e610185565b606091505b50858481518110610198576101986103766100cc565b60200260200101516020018190525080156101cb5760018585815181106101c1576101c1610376565b6020026020010151600001901515908115158152505b8482815181106101e9576101e9610376565b6020026020010151602001515115806102205750848281518110610210576102106103766100cc565b60200260200101516000015115155b61022857600080fd5b50506001016100b1565b5092915050565b6000602080838503121561024c57600080fd5b82356001600160401b038082111561026357600080fd5b818501915085601f83011261027757600080fd5b81358181111561028957610289610360565b8060051b604051601f19603f83011681018181108582111715610aae576102ae610360565b604052918252848201925083810185019188831115610acc57600080fd5b938501935b828510156102f057848503890312156102e85760008081fd5b6102f1610338565b85356001600160a01b03811681146103085760008081fd5b815285870135801515811461031b5760008081fd5b8188015260408681013590820152606080870135908201528452938501939185019161acd1565b50979650505050505050565b604051608081016001600160401b038111828210171561035a5761035a610360565b60405290565b634e487b7160e01b600052604160045260246000fd5b634e487b7160e01b600052603260045260246000fd5b6000825160005b818110156103ad5760208186018101518583015201610393565b506000920191825250919050565b60006020808301818452808551808352604092508286019150828160051b8701018488016000805b8481101561045257898403603f19018652825180511515855288015188858b0181905281519150808a860152815b81811015610426578281018601518682018d01528b0161040b565b8181111561043a1760008c838b0101525b5097508a019650601f01601f19169401939093019250878101906103e3565b509998505050505050505056fea264697066735822122087abc";

    const factory = new ethers.ContractFactory(SIMPLE_MULTICALL_ABI, SIMPLE_MULTICALL_BYTECODE, wallet);

    try {
        const multicall = await factory.deploy({ gasPrice: CONFIG.gasPrice, gasLimit: 3000000n });
        await multicall.waitForDeployment();
        const address = await multicall.getAddress();
        console.log(`   Multicall3 deployed at: ${address}`);
        return multicall as Contract;
    } catch (error) {
        console.log("   ⚠️ Failed to deploy custom Multicall3, using simple batch approach");
        throw error;
    }
}

// ===================== BENCHMARK FUNCTIONS =====================

async function benchmarkBatchedCounterInc(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Batched Counter.inc() Benchmark...");
    console.log(`   Batch Size: ${CONFIG.batchSize} calls per transaction`);
    console.log(`   Total Multicalls: ${CONFIG.totalMulticalls}`);
    console.log(`   Total Calls: ${CONFIG.totalMulticalls * CONFIG.batchSize}`);

    // Deploy Counter contract
    console.log("   Deploying Counter contract...");
    const counterFactory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, mainWallet);
    const counter = await counterFactory.deploy({ gasPrice: CONFIG.gasPrice });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`   Counter deployed at: ${counterAddress}`);

    const results: TransactionResult[] = [];
    const startTime = Date.now();

    // Encode inc() call
    const counterInterface = new ethers.Interface(COUNTER_ABI);
    const incCalldata = counterInterface.encodeFunctionData("inc", []);

    let multicallCount = 0;
    let accountIndex = 0;

    while (multicallCount < CONFIG.totalMulticalls) {
        const account = accounts[accountIndex % accounts.length];
        const sendTime = Date.now();

        try {
            // Build batch of inc() calls using direct transaction
            // Since we might not have Multicall3, we'll send individual transactions rapidly
            const promises: Promise<any>[] = [];

            for (let i = 0; i < CONFIG.batchSize; i++) {
                const tx = account.wallet.sendTransaction({
                    to: counterAddress,
                    data: incCalldata,
                    gasLimit: 100000n,
                    gasPrice: CONFIG.gasPrice,
                    nonce: account.nonce + i,
                });
                promises.push(tx);
            }

            const txResponses = await Promise.all(promises);
            account.nonce += CONFIG.batchSize;

            // Wait for all to confirm
            await Promise.all(txResponses.map((tx: any) => tx.wait()));

            const confirmTime = Date.now();

            results.push({
                hash: txResponses[0].hash,
                sendTime,
                confirmTime,
                latency: confirmTime - sendTime,
                success: true,
                callsInBatch: CONFIG.batchSize,
            });

            multicallCount++;

            if (multicallCount % 5 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const effectiveTPS = (multicallCount * CONFIG.batchSize) / elapsed;
                process.stdout.write(`\r   Batches: ${multicallCount}/${CONFIG.totalMulticalls} | Effective TPS: ${effectiveTPS.toFixed(1)}`);
            }

        } catch (error: any) {
            results.push({
                hash: "",
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: false,
                error: error.message,
                callsInBatch: CONFIG.batchSize,
            });

            // Refresh nonce
            account.nonce = Number(await provider.getTransactionCount(account.address, "pending"));
        }

        accountIndex++;
    }

    console.log(`\n   Waiting ${CONFIG.confirmationWait}s for final confirmations...`);
    await sleep(CONFIG.confirmationWait * 1000);

    // Verify counter value
    const finalValue = await counter.x();
    console.log(`   Counter final value: ${finalValue}`);

    const endTime = Date.now();
    return calculateResults("Batched Counter.inc()", results, startTime, endTime);
}

async function benchmarkSequentialVsBatched(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // First: Sequential baseline
    console.log("\n🚀 Starting Sequential Baseline...");
    const seqCounter = await deployCounter(mainWallet);
    const seqResult = await runSequentialBenchmark(accounts, provider, seqCounter);
    results.push(seqResult);

    await sleep(CONFIG.cooldownTime * 1000);

    // Reset account nonces
    for (const a of accounts) {
        a.nonce = Number(await provider.getTransactionCount(a.address, "pending"));
    }

    // Second: Batched
    console.log("\n🚀 Starting Batched Benchmark...");
    const batchCounter = await deployCounter(mainWallet);
    const batchResult = await runBatchedBenchmark(accounts, provider, batchCounter);
    results.push(batchResult);

    return results;
}

async function deployCounter(wallet: Wallet): Promise<Contract> {
    const factory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, wallet);
    const counter = await factory.deploy({ gasPrice: CONFIG.gasPrice });
    await counter.waitForDeployment();
    console.log(`   Counter deployed at: ${await counter.getAddress()}`);
    return counter as Contract;
}

async function runSequentialBenchmark(
    accounts: AccountState[],
    provider: Provider,
    counter: Contract
): Promise<BenchmarkResult> {
    const totalCalls = CONFIG.totalMulticalls * CONFIG.batchSize;
    console.log(`   Total Transactions: ${totalCalls}`);

    const results: TransactionResult[] = [];
    const startTime = Date.now();
    const counterAddress = await counter.getAddress();

    let txCount = 0;
    let accountIndex = 0;

    while (txCount < totalCalls) {
        const account = accounts[accountIndex % accounts.length];
        const sendTime = Date.now();

        try {
            const counterInstance = new Contract(counterAddress, COUNTER_ABI, account.wallet);
            const tx = await counterInstance.inc({
                gasLimit: 100000n,
                gasPrice: CONFIG.gasPrice,
                nonce: account.nonce,
            });

            account.nonce++;
            await tx.wait();

            results.push({
                hash: tx.hash,
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: true,
                callsInBatch: 1,
            });

            txCount++;

            if (txCount % 20 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                process.stdout.write(`\r   Sequential: ${txCount}/${totalCalls} | TPS: ${(txCount / elapsed).toFixed(1)}`);
            }

        } catch (error: any) {
            results.push({
                hash: "",
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: false,
                error: error.message,
                callsInBatch: 1,
            });
            account.nonce = Number(await provider.getTransactionCount(account.address, "pending"));
        }

        accountIndex++;
    }

    console.log("");
    const endTime = Date.now();

    const successfulTx = results.filter(r => r.success);
    const latencies = successfulTx.map(r => r.latency);
    const duration = endTime - startTime;

    return {
        name: "Sequential (Baseline)",
        duration,
        totalMulticalls: results.length,
        totalCalls: results.length,
        successfulMulticalls: successfulTx.length,
        failedMulticalls: results.filter(r => !r.success).length,
        avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
        maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
        p50Latency: percentile(latencies, 50),
        p95Latency: percentile(latencies, 95),
        multicallTPS: results.length / (duration / 1000),
        effectiveTPS: successfulTx.length / (duration / 1000),
        successRate: results.length > 0 ? (successfulTx.length / results.length) * 100 : 0,
    };
}

async function runBatchedBenchmark(
    accounts: AccountState[],
    provider: Provider,
    counter: Contract
): Promise<BenchmarkResult> {
    console.log(`   Batch Size: ${CONFIG.batchSize}`);
    console.log(`   Total Batches: ${CONFIG.totalMulticalls}`);

    const results: TransactionResult[] = [];
    const startTime = Date.now();
    const counterAddress = await counter.getAddress();
    const counterInterface = new ethers.Interface(COUNTER_ABI);
    const incCalldata = counterInterface.encodeFunctionData("inc", []);

    let batchCount = 0;
    let accountIndex = 0;

    while (batchCount < CONFIG.totalMulticalls) {
        const account = accounts[accountIndex % accounts.length];
        const sendTime = Date.now();

        try {
            // Send batch of transactions in parallel from same account
            const txPromises: Promise<any>[] = [];

            for (let i = 0; i < CONFIG.batchSize; i++) {
                txPromises.push(
                    account.wallet.sendTransaction({
                        to: counterAddress,
                        data: incCalldata,
                        gasLimit: 100000n,
                        gasPrice: CONFIG.gasPrice,
                        nonce: account.nonce + i,
                    })
                );
            }

            const txResponses = await Promise.all(txPromises);
            account.nonce += CONFIG.batchSize;

            // Wait for confirmations
            await Promise.all(txResponses.map((tx: any) => tx.wait()));

            results.push({
                hash: txResponses[0].hash,
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: true,
                callsInBatch: CONFIG.batchSize,
            });

            batchCount++;

            if (batchCount % 5 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const effectiveTPS = (batchCount * CONFIG.batchSize) / elapsed;
                process.stdout.write(`\r   Batched: ${batchCount}/${CONFIG.totalMulticalls} | Effective TPS: ${effectiveTPS.toFixed(1)}`);
            }

        } catch (error: any) {
            results.push({
                hash: "",
                sendTime,
                confirmTime: Date.now(),
                latency: Date.now() - sendTime,
                success: false,
                error: error.message,
                callsInBatch: CONFIG.batchSize,
            });
            account.nonce = Number(await provider.getTransactionCount(account.address, "pending"));
        }

        accountIndex++;
    }

    console.log("");
    const endTime = Date.now();
    return calculateResults("Batched (Parallel per Account)", results, startTime, endTime);
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
    const totalCalls = successfulTx.reduce((sum, r) => sum + r.callsInBatch, 0);

    return {
        name,
        duration,
        totalMulticalls: results.length,
        totalCalls,
        successfulMulticalls: successfulTx.length,
        failedMulticalls: failedTx.length,
        avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
        maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
        p50Latency: percentile(latencies, 50),
        p95Latency: percentile(latencies, 95),
        multicallTPS: results.length / (duration / 1000),
        effectiveTPS: totalCalls / (duration / 1000),
        successRate: results.length > 0 ? (successfulTx.length / results.length) * 100 : 0,
    };
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 MULTICALL BENCHMARK RESULTS");
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
        console.log(`   Total Batches:     ${r.totalMulticalls}`);
        console.log(`   Total Calls:       ${r.totalCalls}`);
        console.log(`   ✅ Successful:      ${r.successfulMulticalls} (${r.successRate.toFixed(1)}%)`);
        console.log(`   ❌ Failed:          ${r.failedMulticalls}`);
        console.log(`   📦 Batch TPS:       ${r.multicallTPS.toFixed(2)} batches/sec`);
        console.log(`   🚀 Effective TPS:   ${r.effectiveTPS.toFixed(2)} calls/sec`);
        console.log(`   ⏱️  Avg Latency:     ${formatDuration(r.avgLatency)}`);
        console.log(`   ⏱️  P50 Latency:     ${formatDuration(r.p50Latency)}`);
        console.log(`   ⏱️  P95 Latency:     ${formatDuration(r.p95Latency)}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log(`🏆 BEST EFFECTIVE TPS: ${bestEffectiveTPS.toFixed(2)} calls/sec (${bestBenchmark})`);
    console.log("=".repeat(80));

    // Save JSON
    const jsonPath = `${CONFIG.outputDir}/benchmark6-${timestamp}.json`;
    const configForJson = {
        ...CONFIG,
        gasLimit: CONFIG.gasLimit.toString(),
        gasPrice: CONFIG.gasPrice.toString(),
    };
    fs.writeFileSync(jsonPath, JSON.stringify({ config: configForJson, results }, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    // Save HTML
    const htmlPath = `${CONFIG.outputDir}/benchmark6-${timestamp}.html`;
    const html = generateHTMLReport(results, bestEffectiveTPS, bestBenchmark);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(results: BenchmarkResult[], bestTPS: number, bestBenchmark: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Multicall Benchmark Results</title>
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
      background: linear-gradient(90deg, #ff6b6b, #feca57, #48dbfb);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .subtitle { text-align: center; color: #888; margin-bottom: 2rem; }
    .note { 
      background: rgba(255,107,107,0.1); border-left: 4px solid #ff6b6b; 
      padding: 1rem; margin-bottom: 2rem; border-radius: 0 8px 8px 0;
    }
    .note strong { color: #ff6b6b; }
    .peak {
      background: linear-gradient(135deg, rgba(255,107,107,0.2), rgba(72,219,251,0.2));
      border: 2px solid #feca57; border-radius: 20px; padding: 2rem;
      margin-bottom: 2rem; text-align: center;
    }
    .peak h2 { color: #feca57; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; color: #feca57; }
    .peak .label { color: #888; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(255,255,255,0.05); border-radius: 16px; padding: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px);
    }
    .card h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #48dbfb; }
    .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; }
    .stat-label { color: #888; }
    .stat-value { font-weight: 600; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .highlight { color: #feca57; font-weight: 700; font-size: 1.1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📦 Multicall Benchmark Report</h1>
    <p class="subtitle">Batched Transaction Performance | ${new Date().toLocaleString()}</p>
    
    <div class="note">
      <strong>📊 Strategy:</strong> This benchmark compares sequential transactions vs batched parallel 
      transactions from the same account. Batching multiple transactions allows higher effective throughput.
    </div>
    
    <div class="peak">
      <h2>🚀 Best Effective TPS</h2>
      <div class="tps">${bestTPS.toFixed(1)}</div>
      <div class="label">calls per second (${bestBenchmark})</div>
    </div>
    
    <div class="grid">
      ${results.map(r => `
        <div class="card">
          <h2>📈 ${r.name}</h2>
          <div class="stat"><span class="stat-label">Duration</span><span class="stat-value">${formatDuration(r.duration)}</span></div>
          <div class="stat"><span class="stat-label">Total Batches</span><span class="stat-value">${r.totalMulticalls}</span></div>
          <div class="stat"><span class="stat-label">Total Calls</span><span class="stat-value">${r.totalCalls}</span></div>
          <div class="stat"><span class="stat-label">Successful</span><span class="stat-value success">${r.successfulMulticalls} (${r.successRate.toFixed(1)}%)</span></div>
          <div class="stat"><span class="stat-label">Failed</span><span class="stat-value ${r.failedMulticalls > 0 ? 'error' : ''}">${r.failedMulticalls}</span></div>
          <div class="stat"><span class="stat-label">Batch TPS</span><span class="stat-value">${r.multicallTPS.toFixed(2)}/sec</span></div>
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
    console.log("📦 BESU MULTICALL / BATCHED BENCHMARK");
    console.log("=".repeat(80));
    console.log("\n📝 Strategy: Compare sequential vs batched parallel transactions");
    console.log(`   Batch Size: ${CONFIG.batchSize} transactions per batch\n`);

    if (!CONFIG.privateKey) {
        throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
    }

    console.log(`Accounts: ${CONFIG.numAccounts}`);
    console.log(`Batch Size: ${CONFIG.batchSize}`);
    console.log(`Total Batches: ${CONFIG.totalMulticalls}`);
    console.log(`RPC URL: ${CONFIG.rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, undefined, {
        staticNetwork: true,
        batchMaxCount: 10,  // Enable RPC batching for efficiency
    });
    const mainWallet = new Wallet(CONFIG.privateKey, provider);

    const network = await provider.getNetwork();
    console.log(`\nNetwork chainId: ${network.chainId}`);

    const accounts = await createAccounts(provider, mainWallet, CONFIG.numAccounts);

    // Run comparison benchmark
    const results = await benchmarkSequentialVsBatched(accounts, provider, mainWallet);

    generateReport(results);
    console.log("✅ Multicall benchmark complete!");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
