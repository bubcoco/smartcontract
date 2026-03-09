import { ethers, Wallet, Contract } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { config as dotenvConfig } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: path.resolve(__dirname, "../.env") });

/**
 * GasFeeGrant V2 — Multicall Permission Test
 *
 * 1. Generates a fresh wallet (0 balance)
 * 2. Admin grants gas via addGrantUser + addGrantContract (per function)
 * 3. Multicalls every known deployed function on loaffinity
 * 4. Reports which contract+function succeeded / failed
 *
 * Usage: npx tsx scripts/test-feegrant-multicall.ts
 */

// ===================== CONFIG =====================
const RPC_URL = "http://localhost:8545";
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";
const ADDRESSES_PATH = path.resolve(__dirname, "../deployed-addresses.json");
const IGNITION_ADDRESSES_PATH = path.resolve(__dirname, "../ignition/deployments/chain-235/deployed_addresses.json");

const TX_OVERRIDES = { type: 0, gasPrice: ethers.parseUnits("100", "gwei") };
const CALL_OVERRIDES = { ...TX_OVERRIDES, gasLimit: 5_000_000 };

const PRECOMPILE_ABI = [
    "function initializeOwner(address) external returns (bool)",
    "function initialized() external view returns (uint256)",
    "function owner() external view returns (address)",
    "function addGrantContract(address toContract, bytes4 funcSig, address granter) returns (bool)",
    "function removeGrantContract(address toContract, bytes4 funcSig, address granter) returns (bool)",
    "function isGrantContract(address toContract, bytes4 funcSig, address granter) view returns (bool)",
    "function addGrantUser(address user, address granter) returns (bool)",
    "function removeGrantUser(address user, address granter) returns (bool)",
    "function isGrantUser(address user, address granter) view returns (bool)",
];

// ===================== HELPERS =====================

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`TIMEOUT: ${label} (${ms / 1000}s)`)), ms)
        ),
    ]);
}

// ===================== TEST CASES =====================

interface TestCase {
    contractName: string;
    contractAddress: string;
    functionName: string;
    functionSig: string;         // e.g. "transfer(address,uint256)"
    buildCalldata: (newAddr: string, adminAddr: string) => string;  // full ABI-encoded calldata
}

function buildTestCases(addresses: Record<string, string>, adminAddr: string, newAddr: string): TestCase[] {
    const iface = {
        erc20: new ethers.Interface([
            "function transfer(address to, uint256 amount)",
            "function approve(address spender, uint256 amount)",
            "function balanceOf(address account)",
        ]),
        marketplace: new ethers.Interface([
            "function buyCoupon(uint256 couponId, uint256 amount)",
            "function delistCoupon(uint256 couponId)",
        ]),
        factory: new ethers.Interface([
            "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to)",
        ]),
        memberCard: new ethers.Interface([
            "function redeemReward(uint256 rewardId)",
        ]),
    };

    const cases: TestCase[] = [];

    // MockTHB (ERC20)
    if (addresses.MockTHB) {
        cases.push({
            contractName: "MockTHB",
            contractAddress: addresses.MockTHB,
            functionName: "transfer",
            functionSig: "transfer(address,uint256)",
            buildCalldata: () => iface.erc20.encodeFunctionData("transfer", [adminAddr, 0]),
        });
        cases.push({
            contractName: "MockTHB",
            contractAddress: addresses.MockTHB,
            functionName: "approve",
            functionSig: "approve(address,uint256)",
            buildCalldata: () => iface.erc20.encodeFunctionData("approve", [adminAddr, 1000]),
        });
    }

    // MockCoupon (ERC20)
    if (addresses.MockCoupon) {
        cases.push({
            contractName: "MockCoupon",
            contractAddress: addresses.MockCoupon,
            functionName: "transfer",
            functionSig: "transfer(address,uint256)",
            buildCalldata: () => iface.erc20.encodeFunctionData("transfer", [adminAddr, 0]),
        });
        cases.push({
            contractName: "MockCoupon",
            contractAddress: addresses.MockCoupon,
            functionName: "approve",
            functionSig: "approve(address,uint256)",
            buildCalldata: () => iface.erc20.encodeFunctionData("approve", [adminAddr, 1000]),
        });
    }

    // Marketplace
    if (addresses.Marketplace) {
        cases.push({
            contractName: "Marketplace",
            contractAddress: addresses.Marketplace,
            functionName: "buyCoupon",
            functionSig: "buyCoupon(uint256,uint256)",
            buildCalldata: () => iface.marketplace.encodeFunctionData("buyCoupon", [1, 1]),
        });
        cases.push({
            contractName: "Marketplace",
            contractAddress: addresses.Marketplace,
            functionName: "delistCoupon",
            functionSig: "delistCoupon(uint256)",
            buildCalldata: () => iface.marketplace.encodeFunctionData("delistCoupon", [1]),
        });
    }

    // ContractFactory2
    if (addresses.ContractFactory2) {
        cases.push({
            contractName: "ContractFactory2",
            contractAddress: addresses.ContractFactory2,
            functionName: "createERC20",
            functionSig: "createERC20(string,string,uint8,uint256,address)",
            buildCalldata: () => iface.factory.encodeFunctionData("createERC20", ["Test", "TST", 18, 1000, newAddr]),
        });
    }

    // MemberCard (from ignition)
    const memberCardAddr = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0";
    cases.push({
        contractName: "MemberCard",
        contractAddress: memberCardAddr,
        functionName: "redeemReward",
        functionSig: "redeemReward(uint256)",
        buildCalldata: () => iface.memberCard.encodeFunctionData("redeemReward", [1]),
    });

    // Gems (ERC20, from ignition)
    const gemsAddr = "0xC9e2712a8FF38B5e8dae58a002A0254750282365";
    cases.push({
        contractName: "Gems",
        contractAddress: gemsAddr,
        functionName: "transfer",
        functionSig: "transfer(address,uint256)",
        buildCalldata: () => iface.erc20.encodeFunctionData("transfer", [adminAddr, 0]),
    });
    cases.push({
        contractName: "Gems",
        contractAddress: gemsAddr,
        functionName: "approve",
        functionSig: "approve(address,uint256)",
        buildCalldata: () => iface.erc20.encodeFunctionData("approve", [adminAddr, 1000]),
    });

    return cases;
}

// ===================== MAIN =====================

interface Result {
    status: "PASS" | "REVERT" | "FAIL" | "GRANT_FAIL" | "TIMEOUT";
    contractName: string;
    functionName: string;
    detail?: string;
}

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║      GasFeeGrant V2 — Multicall Permission Test (TS)             ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // ── Setup ──
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const admin = new Wallet(adminKey, provider);

    console.log(`🔑 Admin: ${admin.address}`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_ADDRESS}`);
    console.log(`🌐 RPC: ${RPC_URL}\n`);

    // ── Step 1: Generate fresh wallet ──
    console.log("━━━ Step 1: Generate fresh wallet ━━━");
    const newWallet = Wallet.createRandom().connect(provider);
    const newAddr = newWallet.address;
    console.log(`🆕 New wallet: ${newAddr}`);
    const balance = await provider.getBalance(newAddr);
    console.log(`💰 Balance: ${balance} wei (should be 0)\n`);

    // ── Step 2: Check precompile initialization ──
    console.log("━━━ Step 2: Check precompile initialization ━━━");
    const precompile = new Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    const isInit = await precompile.initialized();
    console.log(`   initialized: ${isInit !== 0n}`);

    if (isInit === 0n) {
        console.log("   ⚙️  Initializing owner...");
        const tx = await precompile.initializeOwner(admin.address, TX_OVERRIDES);
        await tx.wait(1);
        console.log("   ✅ Initialized");
    }

    const owner = await precompile.owner();
    console.log(`   owner: ${owner}\n`);

    // ── Step 3: Grant user ──
    console.log("━━━ Step 3: Grant user (addGrantUser) ━━━");
    console.log(`   Granting user ${newAddr} with granter ${admin.address} ...`);

    try {
        const tx = await precompile.addGrantUser(newAddr, admin.address, TX_OVERRIDES);
        const receipt = await withTimeout(tx.wait(1), 30_000, "addGrantUser");
        console.log(`   ✅ addGrantUser tx mined in block ${receipt.blockNumber}`);
    } catch (e: any) {
        console.log(`   ❌ addGrantUser failed: ${e.message?.substring(0, 120)}`);
        console.log("   ⚠️  Cannot proceed without user grant. Is the chain producing blocks?");
        process.exit(1);
    }

    // Verify
    const isUser = await precompile.isGrantUser(newAddr, admin.address);
    console.log(`   isGrantUser: ${isUser}\n`);

    // ── Step 4: Load deployed addresses ──
    let addresses: Record<string, string> = {};
    if (fs.existsSync(ADDRESSES_PATH)) {
        addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
    }

    const testCases = buildTestCases(addresses, admin.address, newAddr);
    console.log(`━━━ Step 4: Grant contracts & multicall test (${testCases.length} cases) ━━━\n`);

    const results: Result[] = [];

    for (const tc of testCases) {
        const selector = ethers.id(tc.functionSig).slice(0, 10) as `0x${string}`;

        console.log(`┌─────────────────────────────────────────────────`);
        console.log(`│ 📦 ${tc.contractName} @ ${tc.contractAddress.slice(0, 10)}...  │  ${tc.functionName}`);
        console.log(`│ selector: ${selector}`);

        // 4a: addGrantContract
        let grantOk = false;
        try {
            const grantTx = await precompile.addGrantContract(
                tc.contractAddress, selector, admin.address, TX_OVERRIDES
            );
            await withTimeout(grantTx.wait(1), 30_000, "addGrantContract");
            grantOk = true;
        } catch (e: any) {
            console.log(`│ Grant: ❌ addGrantContract failed — ${e.message?.substring(0, 80)}`);
            results.push({ status: "GRANT_FAIL", contractName: tc.contractName, functionName: tc.functionName, detail: e.message?.substring(0, 80) });
            console.log(`└─────────────────────────────────────────────────\n`);
            continue;
        }

        // Verify
        const isGrant = await precompile.isGrantContract(tc.contractAddress, selector, admin.address);
        console.log(`│ Grant: ✅  isGrantContract: ${isGrant}`);

        // 4b: Send tx from new wallet (zero balance)
        const fullCalldata = tc.buildCalldata(newAddr, admin.address);

        try {
            const callTx = await newWallet.sendTransaction({
                to: tc.contractAddress,
                data: fullCalldata,
                value: 0,
                ...CALL_OVERRIDES,
            });

            const receipt = await withTimeout(callTx.wait(1), 30_000, `call ${tc.functionName}`);

            if (receipt && receipt.status === 1) {
                console.log(`│ Call:  ✅ SUCCESS (block: ${receipt.blockNumber})`);
                results.push({ status: "PASS", contractName: tc.contractName, functionName: tc.functionName });
            } else {
                console.log(`│ Call:  ⚠️  REVERTED (status: ${receipt?.status})`);
                results.push({ status: "REVERT", contractName: tc.contractName, functionName: tc.functionName });
            }
        } catch (e: any) {
            const msg = e.message?.substring(0, 120) || "unknown";
            if (msg.includes("TIMEOUT")) {
                console.log(`│ Call:  ⏱️  TIMEOUT — tx not mined in 30s`);
                results.push({ status: "TIMEOUT", contractName: tc.contractName, functionName: tc.functionName, detail: msg });
            } else {
                console.log(`│ Call:  ❌ FAILED — ${msg}`);
                results.push({ status: "FAIL", contractName: tc.contractName, functionName: tc.functionName, detail: msg });
            }
        }

        // 4c: Cleanup — remove the contract grant
        try {
            const rmTx = await precompile.removeGrantContract(
                tc.contractAddress, selector, admin.address, TX_OVERRIDES
            );
            await withTimeout(rmTx.wait(1), 15_000, "removeGrantContract");
        } catch { /* best effort */ }

        console.log(`└─────────────────────────────────────────────────\n`);
    }

    // ── Step 5: Cleanup user grant ──
    console.log("━━━ Step 5: Cleanup ━━━");
    try {
        const rmUserTx = await precompile.removeGrantUser(newAddr, admin.address, TX_OVERRIDES);
        await withTimeout(rmUserTx.wait(1), 15_000, "removeGrantUser");
        console.log("   ✅ Removed user grant");
    } catch {
        console.log("   ⚠️  Could not remove user grant (best effort)");
    }

    // ── Report ──
    console.log("\n╔════════════════════════════════════════════════════════════════════╗");
    console.log("║                        RESULTS REPORT                            ║");
    console.log("╠════════════════════════════════════════════════════════════════════╣");
    console.log(`║ ${"STATUS".padEnd(12)} │ ${"CONTRACT".padEnd(18)} │ ${"FUNCTION".padEnd(30)} ║`);
    console.log("╠════════════════════════════════════════════════════════════════════╣");

    let passCount = 0, failCount = 0, grantFailCount = 0, timeoutCount = 0;

    for (const r of results) {
        let icon: string;
        switch (r.status) {
            case "PASS": icon = "✅ PASS"; passCount++; break;
            case "REVERT": icon = "⚠️  REVERT"; failCount++; break;
            case "FAIL": icon = "❌ FAIL"; failCount++; break;
            case "GRANT_FAIL": icon = "🚫 GRANT"; grantFailCount++; break;
            case "TIMEOUT": icon = "⏱️  TIMEOUT"; timeoutCount++; break;
            default: icon = "❓ ???"; break;
        }
        console.log(`║ ${icon.padEnd(12)} │ ${r.contractName.padEnd(18)} │ ${r.functionName.padEnd(30)} ║`);
    }

    console.log("╠════════════════════════════════════════════════════════════════════╣");
    console.log(`║ Total: ${results.length}  |  ✅ ${passCount}  |  ❌ ${failCount}  |  🚫 ${grantFailCount}  |  ⏱️  ${timeoutCount}`);
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    console.log(`🆕 Wallet used: ${newAddr}`);
    const finalBal = await provider.getBalance(newAddr);
    console.log(`💰 Final balance: ${finalBal} wei (should still be 0)`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
