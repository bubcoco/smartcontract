import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Comprehensive Precompile Test Script
 * Tests all custom precompile contracts on loaffinity network
 */

// Precompile Addresses
const PRECOMPILES = {
    NATIVE_MINTER: "0x0000000000000000000000000000000000001001",
    ADDRESS_REGISTRY: "0x0000000000000000000000000000000000001002",
    GAS_PRICE: "0x0000000000000000000000000000000000001003",
    REVENUE_RATIO: "0x0000000000000000000000000000000000001004",
    TREASURY_REGISTRY: "0x0000000000000000000000000000000000001005",
    GAS_FEE_GRANT: "0x0000000000000000000000000000000000001006",
};

// ABIs for each precompile
const ABIS = {
    NATIVE_MINTER: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function totalSupply() view returns (uint256)",
        "function mint(address to, uint256 value) returns (bool, string)",
    ],
    ADDRESS_REGISTRY: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function contains(address account) view returns (bool)",
        "function addToRegistry(address account) returns (bool)",
        "function removeFromRegistry(address account) returns (bool)",
    ],
    GAS_PRICE: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function gasPrice() view returns (uint256)",
        "function status() view returns (bool)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setGasPrice(uint256 price) returns (bool)",
    ],
    REVENUE_RATIO: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function status() view returns (bool)",
        "function contractRatio() view returns (uint256)",
        "function coinbaseRatio() view returns (uint256)",
        "function providerRatio() view returns (uint256)",
        "function treasuryRatio() view returns (uint256)",
        "function enable() returns (bool)",
        "function disable() returns (bool)",
        "function setRevenueRatio(uint8 contractRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)",
    ],
    TREASURY_REGISTRY: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function treasuryAt() view returns (address)",
        "function setTreasury(address treasury) returns (bool)",
    ],
    GAS_FEE_GRANT: [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address owner) returns (bool)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        "function grant(address grantee, address program) view returns (address granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function revokeFeeGrant(address grantee, address program) returns (bool)",
        "function periodCanSpend(address grantee, address program) view returns (uint256)",
    ],
};

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    details?: any;
}

async function testPrecompile(
    name: string,
    testFn: () => Promise<TestResult[]>
): Promise<{ name: string; results: TestResult[] }> {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  Testing: ${name}`);
    console.log(`${"═".repeat(70)}`);

    try {
        const results = await testFn();
        return { name, results };
    } catch (e: any) {
        return {
            name,
            results: [{ name: "Connection", passed: false, message: e.shortMessage || e.message }],
        };
    }
}

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║          Comprehensive Precompile Test Suite                       ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const adminKey = process.env.ADMIN;
    if (!adminKey) {
        throw new Error("ADMIN private key not set in .env");
    }

    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Test Wallet: ${wallet.address}`);
    console.log(`🌐 Network: loaffinity (http://localhost:8545)`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

    const blockNumber = await provider.getBlockNumber();
    console.log(`📦 Current Block: ${blockNumber}\n`);

    const txOptions = { gasLimit: 500000n, gasPrice: 100000000000n };
    const allResults: { name: string; results: TestResult[] }[] = [];

    // ═══════════════════════════════════════════════════════════════════
    // 1. Test Native Minter Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("NativeMinter (0x1001)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.NATIVE_MINTER, ABIS.NATIVE_MINTER, wallet);

            // Test initialized
            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}`, details: initialized });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            // Test owner
            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner, details: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            // Test totalSupply (if available)
            try {
                const supply = await contract.totalSupply();
                results.push({ name: "totalSupply()", passed: true, message: `${ethers.formatEther(supply)} ETH`, details: supply });
            } catch (e: any) {
                results.push({ name: "totalSupply()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 2. Test Address Registry Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("AddressRegistry (0x1002)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.ADDRESS_REGISTRY, ABIS.ADDRESS_REGISTRY, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            // Test contains
            try {
                const contains = await contract.contains(wallet.address);
                results.push({ name: "contains(wallet)", passed: true, message: `${contains}` });
            } catch (e: any) {
                results.push({ name: "contains(wallet)", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 3. Test Gas Price Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("GasPrice (0x1003)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.GAS_PRICE, ABIS.GAS_PRICE, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const status = await contract.status();
                results.push({ name: "status()", passed: true, message: `${status}` });
            } catch (e: any) {
                results.push({ name: "status()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const gasPrice = await contract.gasPrice();
                results.push({ name: "gasPrice()", passed: true, message: `${ethers.formatUnits(gasPrice, "gwei")} gwei` });
            } catch (e: any) {
                results.push({ name: "gasPrice()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 4. Test Revenue Ratio Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("RevenueRatio (0x1004)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.REVENUE_RATIO, ABIS.REVENUE_RATIO, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const status = await contract.status();
                results.push({ name: "status()", passed: true, message: `${status}` });
            } catch (e: any) {
                results.push({ name: "status()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const contractR = await contract.contractRatio();
                const coinbaseR = await contract.coinbaseRatio();
                const providerR = await contract.providerRatio();
                const treasuryR = await contract.treasuryRatio();
                results.push({
                    name: "ratios()",
                    passed: true,
                    message: `contract=${contractR}%, coinbase=${coinbaseR}%, provider=${providerR}%, treasury=${treasuryR}%`,
                });
            } catch (e: any) {
                results.push({ name: "ratios()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 5. Test Treasury Registry Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("TreasuryRegistry (0x1005)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.TREASURY_REGISTRY, ABIS.TREASURY_REGISTRY, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const treasury = await contract.treasuryAt();
                results.push({ name: "treasuryAt()", passed: true, message: treasury });
            } catch (e: any) {
                results.push({ name: "treasuryAt()", passed: false, message: e.shortMessage || e.message });
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // 6. Test Gas Fee Grant Precompile
    // ═══════════════════════════════════════════════════════════════════
    allResults.push(
        await testPrecompile("GasFeeGrant (0x1006)", async () => {
            const results: TestResult[] = [];
            const contract = new ethers.Contract(PRECOMPILES.GAS_FEE_GRANT, ABIS.GAS_FEE_GRANT, wallet);

            try {
                const initialized = await contract.initialized();
                results.push({ name: "initialized()", passed: true, message: `${initialized}` });
            } catch (e: any) {
                results.push({ name: "initialized()", passed: false, message: e.shortMessage || e.message });
            }

            try {
                const owner = await contract.owner();
                results.push({ name: "owner()", passed: true, message: owner });
            } catch (e: any) {
                results.push({ name: "owner()", passed: false, message: e.shortMessage || e.message });
            }

            // Test isGrantedForProgram with a known address
            const testGrantee = "0xAe76b11CEcE311717934938510327203a373E826";
            try {
                const isGranted = await contract.isGrantedForProgram(testGrantee, ethers.ZeroAddress);
                results.push({ name: `isGrantedForProgram(${testGrantee.slice(0, 10)}...)`, passed: true, message: `${isGranted}` });
            } catch (e: any) {
                results.push({ name: `isGrantedForProgram()`, passed: false, message: e.shortMessage || e.message });
            }

            // If granted, try to get grant details
            try {
                const grant = await contract.grant(testGrantee, ethers.ZeroAddress);
                if (grant.granter !== ethers.ZeroAddress) {
                    results.push({
                        name: "grant() details",
                        passed: true,
                        message: `granter=${grant.granter.slice(0, 10)}..., spendLimit=${ethers.formatEther(grant.spendLimit)} ETH`,
                    });
                }
            } catch (e: any) {
                // Ignore if not granted
            }

            return results;
        })
    );

    // ═══════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(70));
    console.log("  TEST SUMMARY");
    console.log("═".repeat(70) + "\n");

    let totalPassed = 0;
    let totalFailed = 0;

    for (const precompileResult of allResults) {
        console.log(`\n📦 ${precompileResult.name}`);
        for (const result of precompileResult.results) {
            const icon = result.passed ? "✅" : "❌";
            console.log(`   ${icon} ${result.name}: ${result.message}`);
            if (result.passed) totalPassed++;
            else totalFailed++;
        }
    }

    console.log("\n" + "═".repeat(70));
    console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log("═".repeat(70));

    if (totalFailed > 0) {
        console.log("\n⚠️  Some tests failed. This may indicate:");
        console.log("   - Precompile not initialized");
        console.log("   - Different function signatures in deployed precompile");
        console.log("   - Network connectivity issues");
    }

    console.log("\n✨ Test suite completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Fatal error:", error);
        process.exit(1);
    });
