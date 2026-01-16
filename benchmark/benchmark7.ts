/**
 * Besu Production Readiness Test (benchmark7.ts)
 * 
 * GOAL: Validate production readiness by testing various transaction types
 * and ensuring no nonce gaps occur under load.
 * 
 * Test Categories:
 * 1. Native ETH transfers (batch)
 * 2. Smart contract calls (Counter.inc())
 * 3. ERC20 token transfers
 * 4. ERC721 minting via ContractFactory
 * 
 * Key Features:
 * - Strict nonce tracking to detect gaps
 * - Sequential nonce verification after each test
 * - Detailed error reporting for production debugging
 * 
 * Usage:
 *   npx tsx benchmark/benchmark7.ts
 *   npx tsx benchmark/benchmark7.ts --accounts=10
 *   npx tsx benchmark/benchmark7.ts --txPerTest=50
 */

import { ethers, Wallet, Contract, formatEther, parseEther, parseUnits } from "ethers";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { loadDeployedAddresses } from "./deployed-addresses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// Load deployed contract addresses
const deployedAddresses = loadDeployedAddresses();

// Parse CLI arguments
function parseArg(name: string, defaultVal: number): number {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? parseInt(arg.split('=')[1]) : defaultVal;
}

// ===================== CONFIGURATION =====================
const CONFIG = {
    // Network RPC
    rpcUrl: process.env.RPC_URL || "http://localhost:8545",

    // Private key from .env
    privateKey: process.env.PRIV_KEY || process.env.ADMIN,

    // ========== TEST SETTINGS ==========
    numAccounts: parseArg('accounts', 5),
    txPerTest: parseArg('txPerTest', 30),

    // Initial funding per account
    initialFunding: parseEther("20"),

    // Gas settings
    gasLimit: 300000n,
    gasPrice: parseUnits("1000", "gwei"),

    // Report output
    outputDir: "./benchmark/reports",

    // Contract Factory address from deployed contracts
    contractFactoryAddress: deployedAddresses.contractFactory2 || "",
};

// ===================== CONTRACT ABIs =====================
const COUNTER_ABI = [
    "function inc() external",
    "function x() external view returns (uint256)",
];

const COUNTER_BYTECODE = "0x6080604052348015600e575f5ffd5b506101838061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80630c55699c14610043578063371303c01461005d57806370119d0614610067575b5f5ffd5b61004b5f5481565b60405190815260200160405180910390f35b61006561007a565b005b610065610075366004610111565b6100c6565b60015f5f82825461008b9190610128565b9091555050604051600181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a1565b805f5f8282546100d69190610128565b90915550506040518181527f51af157c2eee40f68107a47a49c32fbbeb0a3c9e5cd37aa56e88e6be92368a819060200160405180910390a150565b5f60208284031215610121575f5ffd5b5035919050565b8082018082111561014757634e487b7160e01b5f52601160045260245ffd5b9291505056fea264697066735822122092ffef3ac73901885453b4eb2430caafac83608a8d165ccf18ff9c81b7e865c664736f6c634300081c0033";

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
    "function approve(address spender, uint256 amount) returns (bool)",
];

const CONTRACT_FACTORY_ABI = [
    "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to) returns (address)",
    "function createERC721(string name, string symbol, address to) returns (address)",
    "event ERC20Created(address indexed tokenAddress, string name, string symbol, uint256 initialSupply, address indexed owner)",
    "event ERC721Created(address indexed tokenAddress, string name, string symbol, address indexed owner)",
];

const ERC721_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function balanceOf(address account) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function safeMint(address to, string uri)",
    "function tokenURI(uint256 tokenId) view returns (string)",
];

// ===================== INTERFACES =====================
interface AccountState {
    wallet: Wallet;
    address: string;
    expectedNonce: number;
    actualNonce: number;
    hasNonceGap: boolean;
}

interface TestResult {
    name: string;
    totalTx: number;
    successTx: number;
    failedTx: number;
    duration: number;
    tps: number;
    avgLatency: number;
    nonceGapsDetected: number;
    errors: string[];
}

interface TxRecord {
    hash: string;
    sendTime: number;
    confirmTime?: number;
    success: boolean;
    error?: string;
    nonce: number;
    accountIndex: number;
}

// ===================== HELPER FUNCTIONS =====================
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

// ===================== ACCOUNT SETUP =====================
async function setupAccounts(
    provider: ethers.JsonRpcProvider,
    mainWallet: Wallet
): Promise<AccountState[]> {
    console.log(`\n📝 Setting up ${CONFIG.numAccounts} test accounts...`);

    const mainBalance = await provider.getBalance(mainWallet.address);
    console.log(`   Main account: ${mainWallet.address}`);
    console.log(`   Balance: ${formatEther(mainBalance)} ETH`);

    const accounts: AccountState[] = [];

    // Create and fund accounts
    let mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");

    for (let i = 0; i < CONFIG.numAccounts; i++) {
        const wallet = Wallet.createRandom().connect(provider);

        try {
            const tx = await mainWallet.sendTransaction({
                to: wallet.address,
                value: CONFIG.initialFunding,
                gasLimit: 21000n,
                gasPrice: CONFIG.gasPrice,
                nonce: mainNonce,
            });
            mainNonce++;
            await tx.wait();

            const nonce = await provider.getTransactionCount(wallet.address, "pending");
            accounts.push({
                wallet,
                address: wallet.address,
                expectedNonce: nonce,
                actualNonce: nonce,
                hasNonceGap: false,
            });

            process.stdout.write(`\r   Funded: ${i + 1}/${CONFIG.numAccounts}`);
        } catch (error: any) {
            console.log(`\n   ⚠️ Error funding account ${i + 1}: ${error.message.substring(0, 50)}...`);
            mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");
            i--;
            await sleep(1000);
        }
    }

    console.log(`\n   ✅ ${accounts.length} accounts ready\n`);
    return accounts;
}

// ===================== NONCE VERIFICATION =====================
async function verifyNonces(
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider
): Promise<{ gaps: number; details: string[] }> {
    const details: string[] = [];
    let gaps = 0;

    for (const account of accounts) {
        const actualNonce = await provider.getTransactionCount(account.address, "latest");
        const pendingNonce = await provider.getTransactionCount(account.address, "pending");

        if (pendingNonce !== actualNonce) {
            gaps++;
            account.hasNonceGap = true;
            details.push(`Account ${account.address.substring(0, 10)}...: expected=${account.expectedNonce}, actual=${actualNonce}, pending=${pendingNonce}`);
        }

        account.actualNonce = actualNonce;
    }

    return { gaps, details };
}

// ===================== TEST 1: NATIVE TRANSFER BATCH =====================
async function testNativeTransferBatch(
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider
): Promise<TestResult> {
    console.log("\n" + "=".repeat(60));
    console.log("📦 TEST 1: Native ETH Transfers (Batch)");
    console.log("=".repeat(60));

    const recipient = Wallet.createRandom().address;
    const txRecords: TxRecord[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    let txCount = 0;
    const txPerAccount = Math.ceil(CONFIG.txPerTest / accounts.length);

    for (const account of accounts) {
        for (let i = 0; i < txPerAccount && txCount < CONFIG.txPerTest; i++) {
            const sendTime = Date.now();
            const nonce = account.expectedNonce;

            try {
                const tx = await account.wallet.sendTransaction({
                    to: recipient,
                    value: parseEther("0.001"),
                    gasLimit: 21000n,
                    gasPrice: CONFIG.gasPrice,
                    nonce: nonce,
                });

                account.expectedNonce++;
                const receipt = await tx.wait();

                txRecords.push({
                    hash: tx.hash,
                    sendTime,
                    confirmTime: Date.now(),
                    success: receipt?.status === 1,
                    nonce,
                    accountIndex: accounts.indexOf(account),
                });

                txCount++;
                process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.txPerTest}`);

            } catch (error: any) {
                errors.push(`Native TX failed: ${error.message.substring(0, 100)}`);
                txRecords.push({
                    hash: "",
                    sendTime,
                    success: false,
                    error: error.message,
                    nonce,
                    accountIndex: accounts.indexOf(account),
                });

                // Refresh nonce to prevent gaps
                account.expectedNonce = await provider.getTransactionCount(account.address, "pending");
                txCount++;
            }
        }
    }

    console.log("");

    // Verify no nonce gaps
    const { gaps, details } = await verifyNonces(accounts, provider);
    if (gaps > 0) {
        console.log(`   ⚠️ Nonce gaps detected: ${gaps}`);
        details.forEach(d => console.log(`      ${d}`));
    } else {
        console.log(`   ✅ No nonce gaps detected`);
    }

    const duration = Date.now() - startTime;
    const successTx = txRecords.filter(r => r.success).length;
    const latencies = txRecords.filter(r => r.confirmTime).map(r => r.confirmTime! - r.sendTime);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
        name: "Native ETH Transfers",
        totalTx: txRecords.length,
        successTx,
        failedTx: txRecords.filter(r => !r.success).length,
        duration,
        tps: successTx / (duration / 1000),
        avgLatency,
        nonceGapsDetected: gaps,
        errors: errors.slice(0, 5), // First 5 errors
    };
}

// ===================== TEST 2: CONTRACT CALLS =====================
async function testContractCalls(
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider,
    mainWallet: Wallet
): Promise<TestResult> {
    console.log("\n" + "=".repeat(60));
    console.log("📦 TEST 2: Smart Contract Calls (Counter.inc())");
    console.log("=".repeat(60));

    // Deploy Counter
    console.log("   Deploying Counter contract...");
    const factory = new ethers.ContractFactory(COUNTER_ABI, COUNTER_BYTECODE, mainWallet);
    const counter = await factory.deploy({ gasPrice: CONFIG.gasPrice });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`   Counter deployed at: ${counterAddress}`);

    // Refresh nonces
    for (const acc of accounts) {
        acc.expectedNonce = await provider.getTransactionCount(acc.address, "pending");
    }

    const counterInterface = new ethers.Interface(COUNTER_ABI);
    const incCalldata = counterInterface.encodeFunctionData("inc", []);

    const txRecords: TxRecord[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    let txCount = 0;
    const txPerAccount = Math.ceil(CONFIG.txPerTest / accounts.length);

    for (const account of accounts) {
        for (let i = 0; i < txPerAccount && txCount < CONFIG.txPerTest; i++) {
            const sendTime = Date.now();
            const nonce = account.expectedNonce;

            try {
                const tx = await account.wallet.sendTransaction({
                    to: counterAddress,
                    data: incCalldata,
                    gasLimit: CONFIG.gasLimit,
                    gasPrice: CONFIG.gasPrice,
                    nonce: nonce,
                });

                account.expectedNonce++;
                const receipt = await tx.wait();

                txRecords.push({
                    hash: tx.hash,
                    sendTime,
                    confirmTime: Date.now(),
                    success: receipt?.status === 1,
                    nonce,
                    accountIndex: accounts.indexOf(account),
                });

                txCount++;
                process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.txPerTest}`);

            } catch (error: any) {
                errors.push(`Contract call failed: ${error.message.substring(0, 100)}`);
                txRecords.push({
                    hash: "",
                    sendTime,
                    success: false,
                    error: error.message,
                    nonce,
                    accountIndex: accounts.indexOf(account),
                });

                account.expectedNonce = await provider.getTransactionCount(account.address, "pending");
                txCount++;
            }
        }
    }

    console.log("");

    // Verify counter value
    const counterContract = new Contract(counterAddress, COUNTER_ABI, provider);
    const finalValue = await counterContract.x();
    console.log(`   Counter value: ${finalValue}`);

    // Verify no nonce gaps
    const { gaps, details } = await verifyNonces(accounts, provider);
    if (gaps > 0) {
        console.log(`   ⚠️ Nonce gaps detected: ${gaps}`);
    } else {
        console.log(`   ✅ No nonce gaps detected`);
    }

    const duration = Date.now() - startTime;
    const successTx = txRecords.filter(r => r.success).length;
    const latencies = txRecords.filter(r => r.confirmTime).map(r => r.confirmTime! - r.sendTime);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
        name: "Contract Calls (Counter.inc)",
        totalTx: txRecords.length,
        successTx,
        failedTx: txRecords.filter(r => !r.success).length,
        duration,
        tps: successTx / (duration / 1000),
        avgLatency,
        nonceGapsDetected: gaps,
        errors: errors.slice(0, 5),
    };
}

// ===================== TEST 3: ERC20 TRANSFERS =====================
async function testERC20Transfers(
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider,
    mainWallet: Wallet
): Promise<TestResult> {
    console.log("\n" + "=".repeat(60));
    console.log("📦 TEST 3: ERC20 Token Transfers");
    console.log("=".repeat(60));

    let tokenAddress: string;

    // Use deployed Token or create via Factory
    if (deployedAddresses.token) {
        tokenAddress = deployedAddresses.token;
        console.log(`   Using deployed Token: ${tokenAddress}`);
    } else if (CONFIG.contractFactoryAddress) {
        console.log("   Creating ERC20 via ContractFactory...");
        const factory = new Contract(CONFIG.contractFactoryAddress, CONTRACT_FACTORY_ABI, mainWallet);
        const tx = await factory.createERC20(
            "TestToken",
            "TEST",
            18,
            parseEther("1000000000"),
            mainWallet.address,
            { gasPrice: CONFIG.gasPrice, gasLimit: 3000000n }
        );
        const receipt = await tx.wait();

        // Get token address from event
        const iface = new ethers.Interface(CONTRACT_FACTORY_ABI);
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed?.name === "ERC20Created") {
                    tokenAddress = parsed.args.tokenAddress;
                    break;
                }
            } catch (e) { }
        }
        console.log(`   Token created at: ${tokenAddress!}`);
    } else {
        console.log("   ⚠️ No token available, skipping ERC20 test");
        return {
            name: "ERC20 Transfers",
            totalTx: 0,
            successTx: 0,
            failedTx: 0,
            duration: 0,
            tps: 0,
            avgLatency: 0,
            nonceGapsDetected: 0,
            errors: ["No token available"],
        };
    }

    // Distribute tokens to test accounts
    console.log("   Distributing tokens to accounts...");
    const token = new Contract(tokenAddress!, ERC20_ABI, mainWallet);

    for (const account of accounts) {
        try {
            const tx = await token.transfer(account.address, parseEther("10000"), {
                gasPrice: CONFIG.gasPrice,
                gasLimit: 100000n,
            });
            await tx.wait();
        } catch (e: any) {
            console.log(`   ⚠️ Failed to distribute to ${account.address.substring(0, 10)}...`);
        }
    }

    // Refresh nonces
    for (const acc of accounts) {
        acc.expectedNonce = await provider.getTransactionCount(acc.address, "pending");
    }

    const recipient = Wallet.createRandom().address;
    const tokenInterface = new ethers.Interface(ERC20_ABI);
    const transferCalldata = tokenInterface.encodeFunctionData("transfer", [recipient, parseEther("1")]);

    const txRecords: TxRecord[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    let txCount = 0;
    const txPerAccount = Math.ceil(CONFIG.txPerTest / accounts.length);

    for (const account of accounts) {
        for (let i = 0; i < txPerAccount && txCount < CONFIG.txPerTest; i++) {
            const sendTime = Date.now();
            const nonce = account.expectedNonce;

            try {
                const tx = await account.wallet.sendTransaction({
                    to: tokenAddress!,
                    data: transferCalldata,
                    gasLimit: CONFIG.gasLimit,
                    gasPrice: CONFIG.gasPrice,
                    nonce: nonce,
                });

                account.expectedNonce++;
                const receipt = await tx.wait();

                txRecords.push({
                    hash: tx.hash,
                    sendTime,
                    confirmTime: Date.now(),
                    success: receipt?.status === 1,
                    nonce,
                    accountIndex: accounts.indexOf(account),
                });

                txCount++;
                process.stdout.write(`\r   Sent: ${txCount}/${CONFIG.txPerTest}`);

            } catch (error: any) {
                errors.push(`ERC20 transfer failed: ${error.message.substring(0, 100)}`);
                txRecords.push({
                    hash: "",
                    sendTime,
                    success: false,
                    error: error.message,
                    nonce,
                    accountIndex: accounts.indexOf(account),
                });

                account.expectedNonce = await provider.getTransactionCount(account.address, "pending");
                txCount++;
            }
        }
    }

    console.log("");

    // Verify no nonce gaps
    const { gaps } = await verifyNonces(accounts, provider);
    if (gaps > 0) {
        console.log(`   ⚠️ Nonce gaps detected: ${gaps}`);
    } else {
        console.log(`   ✅ No nonce gaps detected`);
    }

    const duration = Date.now() - startTime;
    const successTx = txRecords.filter(r => r.success).length;
    const latencies = txRecords.filter(r => r.confirmTime).map(r => r.confirmTime! - r.sendTime);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
        name: "ERC20 Transfers",
        totalTx: txRecords.length,
        successTx,
        failedTx: txRecords.filter(r => !r.success).length,
        duration,
        tps: successTx / (duration / 1000),
        avgLatency,
        nonceGapsDetected: gaps,
        errors: errors.slice(0, 5),
    };
}

// ===================== TEST 4: ERC721 MINTING VIA FACTORY =====================
async function testERC721Minting(
    accounts: AccountState[],
    provider: ethers.JsonRpcProvider,
    mainWallet: Wallet
): Promise<TestResult> {
    console.log("\n" + "=".repeat(60));
    console.log("📦 TEST 4: ERC721 Minting via ContractFactory");
    console.log("=".repeat(60));

    if (!CONFIG.contractFactoryAddress) {
        console.log("   ⚠️ ContractFactory not deployed, skipping ERC721 test");
        return {
            name: "ERC721 Minting",
            totalTx: 0,
            successTx: 0,
            failedTx: 0,
            duration: 0,
            tps: 0,
            avgLatency: 0,
            nonceGapsDetected: 0,
            errors: ["ContractFactory not deployed"],
        };
    }

    // Create ERC721 collection
    console.log("   Creating ERC721 collection via ContractFactory...");
    const factory = new Contract(CONFIG.contractFactoryAddress, CONTRACT_FACTORY_ABI, mainWallet);

    let nft721Address: string;
    try {
        const createTx = await factory.createERC721(
            "TestNFT",
            "TNFT",
            mainWallet.address,
            { gasPrice: CONFIG.gasPrice, gasLimit: 3000000n }
        );
        const receipt = await createTx.wait();

        // Get NFT address from event
        const iface = new ethers.Interface(CONTRACT_FACTORY_ABI);
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed?.name === "ERC721Created") {
                    nft721Address = parsed.args.tokenAddress;
                    break;
                }
            } catch (e) { }
        }
        console.log(`   NFT collection created at: ${nft721Address!}`);
    } catch (error: any) {
        console.log(`   ⚠️ Failed to create ERC721: ${error.message.substring(0, 50)}`);
        return {
            name: "ERC721 Minting",
            totalTx: 0,
            successTx: 0,
            failedTx: 0,
            duration: 0,
            tps: 0,
            avgLatency: 0,
            nonceGapsDetected: 0,
            errors: [error.message],
        };
    }

    // Refresh main wallet nonce
    let mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");

    const nft = new Contract(nft721Address!, ERC721_ABI, mainWallet);
    const nftInterface = new ethers.Interface(ERC721_ABI);

    const txRecords: TxRecord[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    // Mint NFTs using main wallet (since it owns the collection)
    const reducedTxCount = Math.min(CONFIG.txPerTest, 20); // Limit for expensive minting

    for (let i = 0; i < reducedTxCount; i++) {
        const sendTime = Date.now();
        const recipient = accounts[i % accounts.length].address;

        try {
            const mintCalldata = nftInterface.encodeFunctionData("safeMint", [
                recipient,
                `ipfs://QmTestNFT/${i}`
            ]);

            const tx = await mainWallet.sendTransaction({
                to: nft721Address!,
                data: mintCalldata,
                gasLimit: 500000n,
                gasPrice: CONFIG.gasPrice,
                nonce: mainNonce,
            });

            mainNonce++;
            const receipt = await tx.wait();

            txRecords.push({
                hash: tx.hash,
                sendTime,
                confirmTime: Date.now(),
                success: receipt?.status === 1,
                nonce: mainNonce - 1,
                accountIndex: 0,
            });

            process.stdout.write(`\r   Minted: ${i + 1}/${reducedTxCount}`);

        } catch (error: any) {
            errors.push(`ERC721 mint failed: ${error.message.substring(0, 100)}`);
            txRecords.push({
                hash: "",
                sendTime,
                success: false,
                error: error.message,
                nonce: mainNonce,
                accountIndex: 0,
            });

            mainNonce = await provider.getTransactionCount(mainWallet.address, "pending");
        }
    }

    console.log("");

    // Verify main wallet nonce
    const finalNonce = await provider.getTransactionCount(mainWallet.address, "pending");
    const expectedNonce = await provider.getTransactionCount(mainWallet.address, "latest");
    const gaps = finalNonce !== expectedNonce ? 1 : 0;

    if (gaps > 0) {
        console.log(`   ⚠️ Nonce gap detected in main wallet`);
    } else {
        console.log(`   ✅ No nonce gaps detected`);
    }

    const duration = Date.now() - startTime;
    const successTx = txRecords.filter(r => r.success).length;
    const latencies = txRecords.filter(r => r.confirmTime).map(r => r.confirmTime! - r.sendTime);
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
        name: "ERC721 Minting",
        totalTx: txRecords.length,
        successTx,
        failedTx: txRecords.filter(r => !r.success).length,
        duration,
        tps: successTx / (duration / 1000),
        avgLatency,
        nonceGapsDetected: gaps,
        errors: errors.slice(0, 5),
    };
}

// ===================== REPORT =====================
function generateReport(results: TestResult[]): void {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    console.log("\n" + "=".repeat(80));
    console.log("📊 PRODUCTION READINESS TEST RESULTS");
    console.log("=".repeat(80));

    let totalNonceGaps = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const r of results) {
        const status = r.nonceGapsDetected === 0 && r.failedTx === 0 ? "✅ PASS" : "⚠️ ISSUES";

        console.log(`\n${status} ${r.name}`);
        console.log("-".repeat(50));
        console.log(`   Total TX:        ${r.totalTx}`);
        console.log(`   Successful:      ${r.successTx} (${((r.successTx / r.totalTx) * 100).toFixed(1)}%)`);
        console.log(`   Failed:          ${r.failedTx}`);
        console.log(`   Duration:        ${formatDuration(r.duration)}`);
        console.log(`   TPS:             ${r.tps.toFixed(2)}`);
        console.log(`   Avg Latency:     ${formatDuration(r.avgLatency)}`);
        console.log(`   Nonce Gaps:      ${r.nonceGapsDetected}`);

        if (r.errors.length > 0) {
            console.log(`   Errors:`);
            r.errors.forEach(e => console.log(`      - ${e.substring(0, 80)}...`));
        }

        totalNonceGaps += r.nonceGapsDetected;
        totalSuccess += r.successTx;
        totalFailed += r.failedTx;
    }

    console.log("\n" + "=".repeat(80));
    console.log("📋 SUMMARY");
    console.log("=".repeat(80));
    console.log(`   Total Transactions:  ${totalSuccess + totalFailed}`);
    console.log(`   Successful:          ${totalSuccess}`);
    console.log(`   Failed:              ${totalFailed}`);
    console.log(`   Total Nonce Gaps:    ${totalNonceGaps}`);
    console.log("");

    if (totalNonceGaps === 0 && totalFailed === 0) {
        console.log("🎉 ALL TESTS PASSED - Network is production ready!");
    } else if (totalNonceGaps === 0) {
        console.log("⚠️ No nonce gaps detected, but some transactions failed.");
        console.log("   Review error messages for production readiness.");
    } else {
        console.log("❌ NONCE GAPS DETECTED - Not recommended for production!");
        console.log("   Fix nonce handling before deploying to production.");
    }

    console.log("=".repeat(80));

    // Save JSON
    const jsonPath = `${CONFIG.outputDir}/benchmark7-${timestamp}.json`;
    const report = {
        config: {
            numAccounts: CONFIG.numAccounts,
            txPerTest: CONFIG.txPerTest,
            gasPrice: CONFIG.gasPrice.toString(),
            rpcUrl: CONFIG.rpcUrl,
        },
        results,
        summary: {
            totalTransactions: totalSuccess + totalFailed,
            totalSuccess,
            totalFailed,
            totalNonceGaps,
            productionReady: totalNonceGaps === 0,
        },
        timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 JSON Report: ${jsonPath}`);

    // Save HTML
    const htmlPath = `${CONFIG.outputDir}/benchmark7-${timestamp}.html`;
    const html = generateHTMLReport(report);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}\n`);
}

function generateHTMLReport(report: any): string {
    const allPassed = report.summary.totalNonceGaps === 0 && report.summary.totalFailed === 0;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Production Readiness Test Results</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', system-ui, sans-serif; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh; color: #fff; padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      text-align: center; margin-bottom: 0.5rem; font-size: 2.5rem;
      color: ${allPassed ? '#2ed573' : '#ff6b6b'};
    }
    .subtitle { text-align: center; color: #888; margin-bottom: 2rem; }
    .status-banner {
      background: ${allPassed ? 'rgba(46,213,115,0.2)' : 'rgba(255,107,107,0.2)'};
      border: 2px solid ${allPassed ? '#2ed573' : '#ff6b6b'};
      border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;
    }
    .status-banner h2 { color: ${allPassed ? '#2ed573' : '#ff6b6b'}; font-size: 2rem; }
    .status-banner p { color: #888; margin-top: 0.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card {
      background: rgba(255,255,255,0.05); border-radius: 12px; padding: 1.5rem;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .card h3 { color: #48dbfb; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .card .pass { color: #2ed573; }
    .card .fail { color: #ff6b6b; }
    .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; 
      border-bottom: 1px solid rgba(255,255,255,0.05); }
    .stat-label { color: #888; }
    .stat-value { font-weight: 600; }
    .success { color: #2ed573; }
    .error { color: #ff6b6b; }
    .summary { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 1rem; margin-top: 2rem; }
    .summary-item { text-align: center; }
    .summary-item .value { font-size: 2rem; font-weight: 700; color: #48dbfb; }
    .summary-item .label { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${allPassed ? '✅' : '❌'} Production Readiness Test</h1>
    <p class="subtitle">${report.timestamp}</p>
    
    <div class="status-banner">
      <h2>${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️ ISSUES DETECTED'}</h2>
      <p>${allPassed ? 'Network is ready for production deployment' : 'Review failed tests before production deployment'}</p>
    </div>
    
    <div class="grid">
      ${report.results.map((r: TestResult) => `
        <div class="card">
          <h3>
            <span class="${r.nonceGapsDetected === 0 && r.failedTx === 0 ? 'pass' : 'fail'}">
              ${r.nonceGapsDetected === 0 && r.failedTx === 0 ? '✅' : '⚠️'}
            </span>
            ${r.name}
          </h3>
          <div class="stat"><span class="stat-label">Total TX</span><span class="stat-value">${r.totalTx}</span></div>
          <div class="stat"><span class="stat-label">Successful</span><span class="stat-value success">${r.successTx}</span></div>
          <div class="stat"><span class="stat-label">Failed</span><span class="stat-value ${r.failedTx > 0 ? 'error' : ''}">${r.failedTx}</span></div>
          <div class="stat"><span class="stat-label">TPS</span><span class="stat-value">${r.tps.toFixed(2)}</span></div>
          <div class="stat"><span class="stat-label">Avg Latency</span><span class="stat-value">${formatDuration(r.avgLatency)}</span></div>
          <div class="stat"><span class="stat-label">Nonce Gaps</span><span class="stat-value ${r.nonceGapsDetected > 0 ? 'error' : 'success'}">${r.nonceGapsDetected}</span></div>
        </div>
      `).join('')}
    </div>
    
    <div class="summary">
      <div class="summary-item">
        <div class="value">${report.summary.totalTransactions}</div>
        <div class="label">Total Transactions</div>
      </div>
      <div class="summary-item">
        <div class="value success">${report.summary.totalSuccess}</div>
        <div class="label">Successful</div>
      </div>
      <div class="summary-item">
        <div class="value error">${report.summary.totalFailed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-item">
        <div class="value ${report.summary.totalNonceGaps > 0 ? 'error' : 'success'}">${report.summary.totalNonceGaps}</div>
        <div class="label">Nonce Gaps</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ===================== MAIN =====================
async function main() {
    console.log("\n" + "=".repeat(80));
    console.log("🔍 BESU PRODUCTION READINESS TEST (benchmark7)");
    console.log("=".repeat(80));
    console.log("\n📝 Purpose: Validate network is production-ready");
    console.log("   - Test various transaction types");
    console.log("   - Verify no nonce gaps occur");
    console.log("   - Ensure transaction reliability\n");

    if (!CONFIG.privateKey) {
        throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
    }

    console.log(`Configuration:`);
    console.log(`   Accounts:        ${CONFIG.numAccounts}`);
    console.log(`   TX per test:     ${CONFIG.txPerTest}`);
    console.log(`   Gas Price:       ${formatEther(CONFIG.gasPrice)} ETH`);
    console.log(`   RPC URL:         ${CONFIG.rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, undefined, {
        staticNetwork: true,
    });

    const mainWallet = new Wallet(CONFIG.privateKey, provider);

    const network = await provider.getNetwork();
    console.log(`   Chain ID:        ${network.chainId}\n`);

    // Setup accounts
    const accounts = await setupAccounts(provider, mainWallet);
    const results: TestResult[] = [];

    // Run tests
    console.log("\n🚀 Starting Production Readiness Tests...\n");

    // Test 1: Native transfers
    results.push(await testNativeTransferBatch(accounts, provider));
    await sleep(3000);

    // Test 2: Contract calls
    results.push(await testContractCalls(accounts, provider, mainWallet));
    await sleep(3000);

    // Test 3: ERC20 transfers
    results.push(await testERC20Transfers(accounts, provider, mainWallet));
    await sleep(3000);

    // Test 4: ERC721 minting
    results.push(await testERC721Minting(accounts, provider, mainWallet));

    // Generate report
    generateReport(results);

    console.log("✅ Production readiness test complete!\n");
}

main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
