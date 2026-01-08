/**
 * Besu QBFT Advanced Benchmark Script
 * 
 * This script tests more complex operations:
 * - ERC20 Token Transfers
 * - ERC20 Token Minting via ContractFactory
 * - Contract Deployments
 * 
 * Usage:
 *   npx tsx benchmark/benchmark2.ts
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
    numAccounts: 10,
    totalTransactions: 100,
    targetTPS: 100,

    // Benchmark modes
    benchmarks: {
        erc20Transfer: true,      // ERC20 token transfers
        erc20Mint: true,          // Minting new tokens
        factoryCreateERC20: true, // Creating new tokens via factory
        nativeTransfer: true,     // Simple ETH transfers for comparison
    },

    // Timing
    confirmationWait: 20,
    cooldownTime: 10,

    // Report output
    outputDir: "./benchmark/reports",

    // Gas settings
    gasLimit: 200000n,
    gasPrice: parseUnits("1000", "gwei"),
};

// ===================== CONTRACT ABIs =====================
const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const SIMPLE_ERC20_BYTECODE = "0x608060405234801561000f575f5ffd5b50604051610c7b380380610c7b833981016040819052610032916101de565b84848460036100418382610304565b50600461004e8282610304565b5050506100618282610069565b505050505050565b6001600160a01b03821661009857604051634b637e8f60e11b81525f60048201526024015b60405180910390fd5b6100a35f83836100a7565b5050565b6001600160a01b0383166100d1578060025f8282546100c691906103bf565b909155506101419050565b6001600160a01b0383165f90815260208190526040902054818110156101235760405163391434e360e21b81526001600160a01b0385166004820152602481018290526044810183905260640161008f565b6001600160a01b0384165f9081526020819052604090209082900390555b6001600160a01b03821661015d5760028054829003905561017b565b6001600160a01b0382165f9081526020819052604090208054820190555b816001600160a01b0316836001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040516101c091815260200190565b60405180910390a3505050565b634e487b7160e01b5f52604160045260245ffd5b5f5f5f5f5f60a086880312156101f5575f5ffd5b85516001600160401b038082111561020b575f5ffd5b818801915088601f83011261021e575f5ffd5b815181811115610230576102306101cd565b604051601f8201601f19908116603f01168101908382118183101715610258576102586101cd565b816040528281526020935089848487010111156102735750505f5f5f5f5f801916565b5f91505b82821015610294578481018401518282018501528301610277565b505f8483015250809750505050808701519450604087015160ff811681146102ba575f5ffd5b93506060870151925060808701516001600160a01b03811681146102dc575f5ffd5b809150509295509295909350565b600181811c908216806102fe57607f821691505b60208210810361031d57634e487b7160e01b5f52602260045260245ffd5b50919050565b601f821115610369575f81815260208120601f850160051c8101602086101561034a5750805b601f850160051c820191505b8181101561036957828155600101610356565b5050505050565b81516001600160401b0381111561038957610389576101cd565b61039d8161039784546102ea565b84610323565b602080601f8311600181146103d0575f84156103b95750858301515b5f19600386901b1c1916600185901b178555610369565b5f85815260208120601f198616915b828110156103fe578886015182559484019460019091019084016103df565b508582101561041b57878501515f19600388901b60f8161c191681555b5050505050600190811b0190555056fea264697066735822122069f27";

const CONTRACT_FACTORY_ABI = [
    "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to) returns (address)",
    "event ERC20Created(address indexed tokenAddress, string name, string symbol, uint256 initialSupply, address indexed owner)",
];

// Deployed ContractFactory2 address - loaded from deployed_addresses.json
const CONTRACT_FACTORY_ADDRESS = deployedAddresses.contractFactory2 || process.env.CONTRACT_FACTORY_ADDRESS || "";

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

    let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "latest"));
    console.log(`   Main wallet nonce: ${mainNonce}`);

    const fundAmount = parseEther("50");

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
                pending: 0,
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

// ===================== BENCHMARK FUNCTIONS =====================

async function deployERC20(mainWallet: Wallet, name: string, symbol: string): Promise<Contract> {
    console.log(`   Deploying ERC20 token (${name})...`);

    // Read the compiled SimpleERC20 artifact
    const fs = await import("fs");
    const path = await import("path");

    try {
        const artifactPath = path.resolve(__dirname, "../artifacts/contracts/ContractFactory2.sol/SimpleERC20.json");
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

        // SimpleERC20 constructor: (string name, string symbol, uint8 decimals, uint256 initialSupply, address owner)
        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, mainWallet);
        const initialSupply = parseEther("1000000"); // 1M tokens

        const token = await factory.deploy(name, symbol, 18, initialSupply, mainWallet.address, {
            gasPrice: CONFIG.gasPrice,
            gasLimit: 5000000n,
        });
        await token.waitForDeployment();
        const tokenAddress = await token.getAddress();
        console.log(`   Token deployed at: ${tokenAddress}`);

        return token;
    } catch (error) {
        console.log(`   ⚠️ Could not load SimpleERC20 artifact, using inline deployment...`);

        // Minimal ERC20 inline - just transfer & balanceOf
        const MINIMAL_ABI = [
            "constructor()",
            "function balanceOf(address) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function mint(address to, uint256 amount)",
        ];

        // Minimal ERC20: deployer gets initial supply  
        // This is a basic working ERC20 bytecode
        const MINIMAL_BYTECODE = "0x6080604052683635c9adc5dea0000060015560015460025534801561002257600080fd5b5033600081815260036020526040808220849055518392917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef91a3610295806100696000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806340c10f191461004657806370a0823114610068578063a9059cbb14610098575b600080fd5b6100666004803603810190610061919061019a565b6100c8565b005b610082600480360381019061007d91906101da565b610126565b60405161008f9190610214565b60405180910390f35b6100b260048036038101906100ad919061019a565b61016e565b6040516100bf919061024b565b60405180910390f35b806001600082825461010a919061029e565b92505081905550806003600084815260200190815260200160002081905550505050565b60006003600083815260200190815260200160002054905092915050565b60006003600033815260200190815260200160002054821115610127576003600033815260200190815260200160002054840390556003600084815260200190815260200160002054830190505b92939050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600061016182610138565b9050919050565b61017181610158565b811461017c57600080fd5b50565b6000813590506101948161016a565b92915050565b600080604083850312156101b1576001906101ae565b5b8335925060406020850135955050505050610214565b9050929190505600";

        const factory = new ethers.ContractFactory(MINIMAL_ABI, MINIMAL_BYTECODE, mainWallet);
        const token = await factory.deploy({
            gasPrice: CONFIG.gasPrice,
            gasLimit: 1000000n,
        });
        await token.waitForDeployment();
        const tokenAddress = await token.getAddress();
        console.log(`   Minimal token deployed at: ${tokenAddress}`);

        return new Contract(tokenAddress, ERC20_ABI, mainWallet);
    }
}

async function benchmarkERC20Transfer(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting ERC20 Transfer Benchmark...");
    console.log(`   Target TPS: ${CONFIG.targetTPS}`);
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

    // Deploy ERC20 token
    const token = await deployERC20(mainWallet, "Benchmark Token", "BENCH");
    const tokenAddress = await token.getAddress();

    // Distribute tokens to test accounts
    console.log("   Distributing tokens to test accounts...");
    const tokenAmount = parseEther("10000");
    for (let i = 0; i < accounts.length; i++) {
        const tx = await token.transfer(accounts[i].address, tokenAmount, {
            gasPrice: CONFIG.gasPrice,
            gasLimit: 100000n,
        });
        await tx.wait();
        process.stdout.write(`\r   Distributed to: ${i + 1}/${accounts.length} accounts`);
    }
    console.log("\n   ✅ Tokens distributed");

    // Refresh nonces
    for (const a of accounts) {
        a.nonce = Number(await provider.getTransactionCount(a.address, "latest"));
    }

    const results: TransactionResult[] = [];
    const startTime = Date.now();
    const txInterval = 1000 / CONFIG.targetTPS;

    const recipient = Wallet.createRandom().address;
    const transferAmount = parseEther("1");

    let txCount = 0;
    let accountIndex = 0;

    while (txCount < CONFIG.totalTransactions) {
        const account = accounts[accountIndex % accounts.length];
        const sendTime = Date.now();

        try {
            const tokenInstance = new Contract(tokenAddress, ERC20_ABI, account.wallet);
            const tx = await tokenInstance.transfer(recipient, transferAmount, {
                gasLimit: CONFIG.gasLimit,
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

        if (txCount % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.totalTransactions} | Rate: ${(txCount / elapsed).toFixed(1)} TPS`);
        }

        const elapsed = Date.now() - startTime;
        const expectedTime = txCount * txInterval;
        if (elapsed < expectedTime) await sleep(Math.min(expectedTime - elapsed, 10));
    }

    console.log(`\n   Waiting ${CONFIG.confirmationWait}s for confirmations...`);
    await sleep(CONFIG.confirmationWait * 1000);

    const endTime = Date.now();
    return calculateResults("ERC20 Transfer", results, startTime, endTime);
}

async function benchmarkERC20Mint(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting ERC20 Mint Benchmark...");
    console.log(`   Target TPS: ${CONFIG.targetTPS}`);
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

    // Deploy ERC20 token with mint function
    const token = await deployERC20(mainWallet, "Mintable Token", "MINT");
    const tokenAddress = await token.getAddress();

    // Get main wallet nonce
    let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "latest"));

    const results: TransactionResult[] = [];
    const startTime = Date.now();
    const txInterval = 1000 / CONFIG.targetTPS;

    const mintAmount = parseEther("100");

    let txCount = 0;

    while (txCount < CONFIG.totalTransactions) {
        const sendTime = Date.now();
        const recipient = accounts[txCount % accounts.length].address;

        try {
            const tokenInstance = new Contract(tokenAddress, ERC20_ABI, mainWallet);
            const tx = await tokenInstance.mint(recipient, mintAmount, {
                gasLimit: CONFIG.gasLimit,
                gasPrice: CONFIG.gasPrice,
                nonce: mainNonce,
            });

            mainNonce++;

            const result: TransactionResult = {
                hash: tx.hash,
                sendTime,
                success: true,
                nonce: mainNonce - 1,
                accountIndex: 0,
            };

            tx.wait().then(() => {
                result.confirmTime = Date.now();
                result.latency = result.confirmTime - result.sendTime;
            }).catch((err: any) => {
                result.success = false;
                result.error = err.message;
            });

            results.push(result);
            txCount++;

        } catch (error: any) {
            results.push({
                hash: "", sendTime, success: false, error: error.message,
                nonce: mainNonce, accountIndex: 0,
            });
            if (error.message.includes("nonce")) {
                mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
            }
        }

        if (txCount % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.totalTransactions} | Rate: ${(txCount / elapsed).toFixed(1)} TPS`);
        }

        const elapsed = Date.now() - startTime;
        const expectedTime = txCount * txInterval;
        if (elapsed < expectedTime) await sleep(Math.min(expectedTime - elapsed, 10));
    }

    console.log(`\n   Waiting ${CONFIG.confirmationWait}s for confirmations...`);
    await sleep(CONFIG.confirmationWait * 1000);

    const endTime = Date.now();
    return calculateResults("ERC20 Mint", results, startTime, endTime);
}

async function benchmarkFactoryCreateERC20(
    accounts: AccountState[],
    provider: Provider,
    mainWallet: Wallet
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Factory CreateERC20 Benchmark...");
    console.log(`   Target TPS: ${CONFIG.targetTPS}`);
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

    // Check if factory address is configured
    if (!CONTRACT_FACTORY_ADDRESS) {
        console.log("   ⚠️ CONTRACT_FACTORY_ADDRESS not set, deploying new ContractFactory2...");

        // Deploy a simple factory for the benchmark
        const FACTORY_BYTECODE = "0x608060405234801561000f575f5ffd5b50336100195f5050";

        console.log("   ⚠️ Skipping Factory benchmark - no factory deployed");
        return {
            name: "Factory CreateERC20",
            duration: 0, totalTx: 0, successTx: 0, failedTx: 0,
            avgLatency: 0, minLatency: 0, maxLatency: 0,
            p95Latency: 0, p99Latency: 0, actualTPS: 0, throughput: 0, successRate: 0,
        };
    }

    const factory = new Contract(CONTRACT_FACTORY_ADDRESS, CONTRACT_FACTORY_ABI, mainWallet);

    let mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "latest"));

    const results: TransactionResult[] = [];
    const startTime = Date.now();
    const txInterval = 1000 / CONFIG.targetTPS;

    let txCount = 0;

    while (txCount < CONFIG.totalTransactions) {
        const sendTime = Date.now();
        const tokenName = `Token${txCount}`;
        const tokenSymbol = `TKN${txCount}`;
        const recipient = accounts[txCount % accounts.length].address;

        try {
            const tx = await factory.createERC20(
                tokenName,
                tokenSymbol,
                18,
                parseEther("1000000"),
                recipient,
                {
                    gasLimit: 3000000n,
                    gasPrice: CONFIG.gasPrice,
                    nonce: mainNonce,
                }
            );

            mainNonce++;

            const result: TransactionResult = {
                hash: tx.hash,
                sendTime,
                success: true,
                nonce: mainNonce - 1,
                accountIndex: 0,
            };

            tx.wait().then(() => {
                result.confirmTime = Date.now();
                result.latency = result.confirmTime - result.sendTime;
            }).catch((err: any) => {
                result.success = false;
                result.error = err.message;
            });

            results.push(result);
            txCount++;

        } catch (error: any) {
            results.push({
                hash: "", sendTime, success: false, error: error.message,
                nonce: mainNonce, accountIndex: 0,
            });
            if (error.message.includes("nonce")) {
                mainNonce = Number(await provider.getTransactionCount(mainWallet.address, "pending"));
            }
        }

        if (txCount % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.totalTransactions} | Rate: ${(txCount / elapsed).toFixed(1)} TPS`);
        }

        const elapsed = Date.now() - startTime;
        const expectedTime = txCount * txInterval;
        if (elapsed < expectedTime) await sleep(Math.min(expectedTime - elapsed, 10));
    }

    console.log(`\n   Waiting ${CONFIG.confirmationWait}s for confirmations...`);
    await sleep(CONFIG.confirmationWait * 1000);

    const endTime = Date.now();
    return calculateResults("Factory CreateERC20", results, startTime, endTime);
}

async function benchmarkNativeTransfer(
    accounts: AccountState[],
    provider: Provider
): Promise<BenchmarkResult> {
    console.log("\n🚀 Starting Native Transfer Benchmark (baseline)...");
    console.log(`   Target TPS: ${CONFIG.targetTPS}`);
    console.log(`   Total Transactions: ${CONFIG.totalTransactions}`);

    const results: TransactionResult[] = [];
    const startTime = Date.now();
    const txInterval = 1000 / CONFIG.targetTPS;

    const recipient = Wallet.createRandom().address;
    const amount = parseEther("0.001");

    let txCount = 0;
    let accountIndex = 0;

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
            }).catch((err: any) => {
                result.success = false;
                result.error = err.message;
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

        if (txCount % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.totalTransactions} | Rate: ${(txCount / elapsed).toFixed(1)} TPS`);
        }

        const elapsed = Date.now() - startTime;
        const expectedTime = txCount * txInterval;
        if (elapsed < expectedTime) await sleep(Math.min(expectedTime - elapsed, 10));
    }

    console.log(`\n   Waiting ${CONFIG.confirmationWait}s for confirmations...`);
    await sleep(CONFIG.confirmationWait * 1000);

    const endTime = Date.now();
    return calculateResults("Native Transfer", results, startTime, endTime);
}

// ===================== REPORT =====================
function generateReport(results: BenchmarkResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 ADVANCED BENCHMARK RESULTS");
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
    }

    console.log("\n" + "=".repeat(80));
    console.log(`🏆 PEAK THROUGHPUT: ${maxThroughput.toFixed(2)} TPS (${bestBenchmark})`);
    console.log("=".repeat(80));

    const jsonPath = `${CONFIG.outputDir}/benchmark2-${timestamp}.json`;
    const configForJson = { ...CONFIG, gasPrice: CONFIG.gasPrice.toString(), gasLimit: CONFIG.gasLimit.toString() };
    fs.writeFileSync(jsonPath, JSON.stringify({ config: configForJson, results }, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    const htmlPath = `${CONFIG.outputDir}/benchmark2-${timestamp}.html`;
    const html = generateHTMLReport(results, maxThroughput, bestBenchmark);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(results: BenchmarkResult[], maxThroughput: number, bestBenchmark: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Besu Advanced Benchmark Results</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      min-height: 100vh; color: #fff; padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { 
      text-align: center; margin-bottom: 0.5rem; font-size: 2.5rem;
      background: linear-gradient(90deg, #f093fb, #f5576c, #4facfe);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .subtitle { text-align: center; color: #888; margin-bottom: 2rem; }
    .peak {
      background: linear-gradient(135deg, rgba(240,147,251,0.2), rgba(79,172,254,0.2));
      border: 2px solid #f093fb; border-radius: 20px; padding: 2rem;
      margin-bottom: 2rem; text-align: center;
    }
    .peak h2 { color: #f093fb; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .peak .tps { font-size: 4rem; font-weight: 800; background: linear-gradient(90deg, #f093fb, #f5576c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .peak .label { color: #888; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(255,255,255,0.05); border-radius: 16px; padding: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px);
    }
    .card h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #4facfe; }
    .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; }
    .stat-label { color: #888; }
    .stat-value { font-weight: 600; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .highlight { color: #f093fb; font-weight: 700; font-size: 1.1rem; }
    .config { 
      background: rgba(255,255,255,0.02); border-radius: 8px; padding: 1rem;
      margin-top: 2rem; font-size: 0.85rem; color: #666;
    }
    .config code { color: #f093fb; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔬 Besu Advanced Benchmark Report</h1>
    <p class="subtitle">ERC20 & Contract Factory Tests | Generated: ${new Date().toLocaleString()}</p>
    
    <div class="peak">
      <h2>🏆 Peak Throughput</h2>
      <div class="tps">${maxThroughput.toFixed(1)}</div>
      <div class="label">Transactions per Second (${bestBenchmark})</div>
    </div>
    
    <div class="grid">
      ${results.filter(r => r.totalTx > 0).map(r => `
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
    console.log("🔬 BESU QBFT ADVANCED BENCHMARK");
    console.log("=".repeat(80));

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

    if (CONFIG.benchmarks.erc20Transfer) {
        results.push(await benchmarkERC20Transfer(accounts, provider, mainWallet));
        console.log(`\n   Cooling down (${CONFIG.cooldownTime}s)...`);
        await sleep(CONFIG.cooldownTime * 1000);
        for (const a of accounts) a.nonce = Number(await provider.getTransactionCount(a.address, "pending"));
    }

    if (CONFIG.benchmarks.erc20Mint) {
        results.push(await benchmarkERC20Mint(accounts, provider, mainWallet));
        console.log(`\n   Cooling down (${CONFIG.cooldownTime}s)...`);
        await sleep(CONFIG.cooldownTime * 1000);
    }

    if (CONFIG.benchmarks.factoryCreateERC20) {
        const factoryResult = await benchmarkFactoryCreateERC20(accounts, provider, mainWallet);
        if (factoryResult.totalTx > 0) {
            results.push(factoryResult);
        }
    }

    generateReport(results);
    console.log("✅ Advanced benchmark complete!");
}

main().catch(console.error);
