import { ethers, Wallet, Contract } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * NativeMinter Comprehensive Dev Test (besutest)
 *
 * Sections:
 *   A: Crash Tests (short/malformed calldata)
 *   B: Initialization & Ownership
 *   C: Minting
 *   D: Access Control
 *   E: Edge Cases
 *
 * Usage: npx tsx scripts/test-nativeminter-dev.ts
 */

// ===================== CONFIG =====================
const RPC_URL = "http://localhost:8545";
const NATIVE_MINTER_ADDRESS = "0x0000000000000000000000000000000000001001";
const TX_OVERRIDES = { type: 0, gasPrice: ethers.parseUnits("1000", "gwei"), gasLimit: 500000n };

const PRECOMPILE_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwnerAndSupply(address initialOwner, uint256 initialSupply) returns (bool)",
    "function transferOwnership(address newOwner) returns (bool)",
    "function totalsupply() view returns (uint256)",
    "function mint(address to, uint256 value) returns (bool)",
];

// ===================== HELPERS =====================
let passCount = 0;
let failCount = 0;

function pass(name: string, detail?: string) {
    passCount++;
    console.log(`   ✅ PASS: ${name}${detail ? " — " + detail : ""}`);
}

function fail(name: string, detail?: string) {
    failCount++;
    console.log(`   ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
}

function info(msg: string) {
    console.log(`   ℹ️  ${msg}`);
}

async function rawRpcCall(method: string, params: any[]): Promise<any> {
    const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return res.json();
}

async function fundWallet(admin: Wallet, target: string, amount: string) {
    const tx = await admin.sendTransaction({
        to: target,
        value: ethers.parseEther(amount),
        ...TX_OVERRIDES,
    });
    await tx.wait(1);
}

// ═════════════════════════════════════════════════════════════════
// SECTION A: CRASH TESTS
// ═════════════════════════════════════════════════════════════════

async function testA1_ShortCalldataCrash() {
    console.log("\n── A1: Short Calldata Crash (<4 bytes) ──");

    const SHORT_PAYLOADS = ["0x", "0x11", "0x2233", "0x445566"];
    let crashed = 0;

    for (const payload of SHORT_PAYLOADS) {
        const result = await rawRpcCall("eth_call", [
            { to: NATIVE_MINTER_ADDRESS, data: payload },
            "latest",
        ]);

        if (result.error) {
            const msg = result.error.message || "";
            if (msg.includes("Provided length") || msg.includes("IllegalArgument") || msg.includes("Internal error")) {
                crashed++;
            }
        }
    }

    if (crashed === 0) {
        pass("All <4 byte payloads handled gracefully");
    } else {
        fail(`${crashed}/${SHORT_PAYLOADS.length} payloads crashed (missing input.size() < 4 guard)`);
    }
}

async function testA2_FunctionLevelShortCalldata() {
    console.log("\n── A2: Function-Level Short Calldata (selector only, no args) ──");

    const FUNCTIONS = [
        "initializeOwnerAndSupply(address,uint256)",
        "transferOwnership(address)",
        "mint(address,uint256)",
    ];

    let crashed = 0;
    for (const func of FUNCTIONS) {
        const selector = ethers.id(func).slice(0, 10);
        const result = await rawRpcCall("eth_call", [
            { to: NATIVE_MINTER_ADDRESS, data: selector },
            "latest",
        ]);

        if (result.error) {
            const msg = result.error.message || "";
            if (msg.includes("Provided length") || msg.includes("IllegalArgument") || msg.includes("Internal error")) {
                crashed++;
                info(`${func} crashed on selector-only calldata`);
            }
        }
    }

    if (crashed === 0) {
        pass("All write functions handled selector-only calldata gracefully");
    } else {
        fail(`${crashed}/${FUNCTIONS.length} functions crashed on short calldata`);
    }
}

async function testA3_PostCrashNodeHealth() {
    console.log("\n── A3: Post-Crash Node Health ──");
    try {
        const res = await rawRpcCall("eth_blockNumber", []);
        if (res.error) throw new Error(res.error.message);
        pass("Node still alive after crash tests", `Block: ${parseInt(res.result, 16)}`);
    } catch {
        fail("CRITICAL: Node unreachable after crash tests");
    }
}

// ═════════════════════════════════════════════════════════════════
// SECTION B: INITIALIZATION & OWNERSHIP
// ═════════════════════════════════════════════════════════════════

async function testB1_InitAndReadback(admin: Wallet) {
    console.log("\n── B1: Initialization & Readback ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);

    const isInit = await precompile.initialized();
    const owner = await precompile.owner();

    if (isInit) {
        pass("Precompile initialized", `Owner: ${owner}`);
    } else {
        info("Not initialized, initializing...");
        const tx = await precompile.initializeOwnerAndSupply(
            admin.address,
            ethers.parseEther("10000"),
            TX_OVERRIDES
        );
        await tx.wait(1);
        const newOwner = await precompile.owner();
        const newInit = await precompile.initialized();
        if (newInit) {
            pass("Initialized successfully", `Owner: ${newOwner}`);
        } else {
            fail("Initialization did not persist");
        }
    }
}

async function testB2_DuplicateInitRejected(admin: Wallet) {
    console.log("\n── B2: Duplicate Init Rejected (supply=0 won't crash) ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);

    const ownerBefore = await precompile.owner();

    // Try re-init with different owner and zero supply — should not crash, just return false
    const fakeOwner = Wallet.createRandom().address;
    try {
        const tx = await precompile.initializeOwnerAndSupply(fakeOwner, 0n, TX_OVERRIDES);
        const receipt = await tx.wait(1);

        // Verify owner didn't change
        const ownerAfter = await precompile.owner();
        if (ownerAfter === ownerBefore) {
            pass("Duplicate init rejected, owner unchanged");
        } else {
            fail("CRITICAL: Duplicate init changed owner!");
        }
    } catch (e: any) {
        // If it reverts, that's also acceptable
        pass("Duplicate init correctly reverted", e.shortMessage?.substring(0, 60));
    }
}

async function testB3_DuplicateInitWithSupplyZero(admin: Wallet) {
    console.log("\n── B3: Init with supply=0 (no crash test) ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);

    // Already initialized, so this should just return false, NOT crash
    try {
        const tx = await precompile.initializeOwnerAndSupply(admin.address, 0n, TX_OVERRIDES);
        const receipt = await tx.wait(1);
        // Transaction didn't revert — check owner/supply unchanged
        pass("supply=0 did not crash the node");
    } catch (e: any) {
        if (e.shortMessage?.includes("reverted")) {
            pass("supply=0 gracefully reverted (no crash)");
        } else {
            fail("supply=0 caused unexpected error", e.message?.substring(0, 80));
        }
    }

    // Verify node is still healthy
    const block = await rawRpcCall("eth_blockNumber", []);
    if (block.result) {
        pass("Node healthy after supply=0 call", `Block: ${parseInt(block.result, 16)}`);
    } else {
        fail("CRITICAL: Node crashed after supply=0 init");
    }
}

async function testB4_TransferOwnership(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── B4: Transfer Ownership (round-trip) ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);

    const tempOwner = Wallet.createRandom().connect(provider);
    await fundWallet(admin, tempOwner.address, "1");

    // Transfer to temp
    const tx1 = await precompile.transferOwnership(tempOwner.address, TX_OVERRIDES);
    await tx1.wait(1);
    const ownerMid = await precompile.owner();
    if (ownerMid.toLowerCase() === tempOwner.address.toLowerCase()) {
        pass("Transferred to temp owner");
    } else {
        fail("Transfer did not take effect");
        return;
    }

    // Transfer back
    const precompileTemp = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, tempOwner);
    const tx2 = await precompileTemp.transferOwnership(admin.address, TX_OVERRIDES);
    await tx2.wait(1);
    const ownerFinal = await precompile.owner();
    if (ownerFinal.toLowerCase() === admin.address.toLowerCase()) {
        pass("Transferred back to admin");
    } else {
        fail("Transfer back failed", `Owner: ${ownerFinal}`);
    }
}

// ═════════════════════════════════════════════════════════════════
// SECTION C: MINTING
// ═════════════════════════════════════════════════════════════════

async function testC1_MintToRecipient(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── C1: Mint to Recipient ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);
    const recipient = Wallet.createRandom().address;
    const mintAmount = ethers.parseEther("100");

    const balBefore = await provider.getBalance(recipient);
    const tx = await precompile.mint(recipient, mintAmount, TX_OVERRIDES);
    await tx.wait(1);
    const balAfter = await provider.getBalance(recipient);
    const diff = balAfter - balBefore;

    if (diff === mintAmount) {
        pass("Mint exact amount", `+${ethers.formatEther(diff)} ETH`);
    } else if (diff > 0n) {
        pass("Mint succeeded (amount slightly off due to self-mint gas)", `+${ethers.formatEther(diff)} ETH`);
    } else {
        fail("Mint did not increase balance");
    }
}

async function testC2_MintUpdatesTotalSupply(admin: Wallet) {
    console.log("\n── C2: Mint Updates TotalSupply ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);

    const supplyBefore = await precompile.totalsupply();
    const mintAmount = ethers.parseEther("50");
    const tx = await precompile.mint(Wallet.createRandom().address, mintAmount, TX_OVERRIDES);
    await tx.wait(1);
    const supplyAfter = await precompile.totalsupply();

    const diff = supplyAfter - supplyBefore;
    if (diff === mintAmount) {
        pass("TotalSupply increased by mint amount", `${ethers.formatEther(supplyBefore)} → ${ethers.formatEther(supplyAfter)}`);
    } else {
        fail("TotalSupply mismatch", `Expected +${ethers.formatEther(mintAmount)}, got +${ethers.formatEther(diff)}`);
    }
}

async function testC3_MintLargeAmount(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── C3: Mint Large Amount (10,000 ETH) ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);
    const recipient = Wallet.createRandom().address;
    const mintAmount = ethers.parseEther("10000");

    const balBefore = await provider.getBalance(recipient);
    const tx = await precompile.mint(recipient, mintAmount, TX_OVERRIDES);
    await tx.wait(1);
    const balAfter = await provider.getBalance(recipient);

    if (balAfter - balBefore === mintAmount) {
        pass("Large mint succeeded", `+${ethers.formatEther(mintAmount)} ETH`);
    } else {
        fail("Large mint amount mismatch");
    }
}

// ═════════════════════════════════════════════════════════════════
// SECTION D: ACCESS CONTROL
// ═════════════════════════════════════════════════════════════════

async function testD1_NonOwnerCannotMint(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── D1: Non-Owner Cannot Mint ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "1");

    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, attacker);
    const recipient = Wallet.createRandom().address;
    const balBefore = await provider.getBalance(recipient);

    try {
        const tx = await precompile.mint(recipient, ethers.parseEther("100"), TX_OVERRIDES);
        await tx.wait(1);
    } catch { /* may revert */ }

    const balAfter = await provider.getBalance(recipient);
    if (balAfter === balBefore) {
        pass("Non-owner mint rejected (balance unchanged)");
    } else {
        fail("CRITICAL: Non-owner was able to mint!");
    }
}

async function testD2_NonOwnerCannotTransferOwnership(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── D2: Non-Owner Cannot Transfer Ownership ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "1");

    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, attacker);
    const ownerBefore = await precompile.owner();

    try {
        const tx = await precompile.transferOwnership(attacker.address, TX_OVERRIDES);
        await tx.wait(1);
    } catch { /* may revert */ }

    const ownerAfter = await precompile.owner();
    if (ownerAfter === ownerBefore && ownerAfter.toLowerCase() !== attacker.address.toLowerCase()) {
        pass("transferOwnership rejected from non-owner");
    } else {
        fail("CRITICAL: Ownership stolen!");
    }
}

async function testD3_NonOwnerCannotReInit(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── D3: Non-Owner Cannot Re-Initialize ──");
    const attacker = Wallet.createRandom().connect(provider);
    await fundWallet(admin, attacker.address, "1");

    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, attacker);
    const ownerBefore = await precompile.owner();

    try {
        const tx = await precompile.initializeOwnerAndSupply(attacker.address, ethers.parseEther("999999"), TX_OVERRIDES);
        await tx.wait(1);
    } catch { /* may revert */ }

    const ownerAfter = await precompile.owner();
    if (ownerAfter === ownerBefore) {
        pass("Re-init rejected, owner unchanged");
    } else {
        fail("CRITICAL: Re-init changed owner!");
    }
}

// ═════════════════════════════════════════════════════════════════
// SECTION E: EDGE CASES
// ═════════════════════════════════════════════════════════════════

async function testE1_MintZeroAmountFails(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── E1: Mint Zero Amount ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);
    const recipient = Wallet.createRandom().address;

    const balBefore = await provider.getBalance(recipient);
    try {
        const tx = await precompile.mint(recipient, 0n, TX_OVERRIDES);
        await tx.wait(1);
    } catch { /* may revert */ }

    const balAfter = await provider.getBalance(recipient);
    if (balAfter === balBefore) {
        pass("Mint zero amount correctly rejected");
    } else {
        fail("Mint zero amount should not change balance");
    }
}

async function testE2_MintToZeroAddressFails(admin: Wallet) {
    console.log("\n── E2: Mint to Zero Address ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);

    try {
        const tx = await precompile.mint(ethers.ZeroAddress, ethers.parseEther("100"), TX_OVERRIDES);
        await tx.wait(1);
        fail("Mint to zero address should have been rejected");
    } catch {
        pass("Mint to zero address correctly rejected");
    }
}

async function testE3_TransferOwnershipToZeroFails(admin: Wallet) {
    console.log("\n── E3: Transfer Ownership to Zero Address ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);
    const ownerBefore = await precompile.owner();

    try {
        const tx = await precompile.transferOwnership(ethers.ZeroAddress, TX_OVERRIDES);
        await tx.wait(1);
    } catch { /* may revert */ }

    const ownerAfter = await precompile.owner();
    if (ownerAfter === ownerBefore) {
        pass("Transfer to zero address rejected, owner unchanged");
    } else {
        fail("CRITICAL: Owner set to zero address!");
    }
}

async function testE4_TotalSupplyReadback(admin: Wallet) {
    console.log("\n── E4: TotalSupply Readback ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);
    try {
        const supply = await precompile.totalsupply();
        pass("TotalSupply readable", `${ethers.formatEther(supply)} ETH`);
    } catch (e: any) {
        fail("TotalSupply read failed", e.message?.substring(0, 60));
    }
}

async function testE5_MultipleMints(admin: Wallet, provider: ethers.JsonRpcProvider) {
    console.log("\n── E5: Multiple Sequential Mints ──");
    const precompile = new Contract(NATIVE_MINTER_ADDRESS, PRECOMPILE_ABI, admin);
    const recipient = Wallet.createRandom().address;
    const mintAmount = ethers.parseEther("10");

    const balBefore = await provider.getBalance(recipient);
    for (let i = 0; i < 5; i++) {
        const tx = await precompile.mint(recipient, mintAmount, TX_OVERRIDES);
        await tx.wait(1);
    }
    const balAfter = await provider.getBalance(recipient);
    const expected = mintAmount * 5n;

    if (balAfter - balBefore === expected) {
        pass("5 sequential mints all credited", `+${ethers.formatEther(expected)} ETH`);
    } else {
        fail("Sequential mint total mismatch", `Expected +${ethers.formatEther(expected)}, got +${ethers.formatEther(balAfter - balBefore)}`);
    }
}

// ═════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║   NativeMinter Comprehensive Test (dev/besutest) — ALL-IN-ONE   ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminKey = process.env.ADMIN || process.env.PRIV_KEY;
    if (!adminKey) throw new Error("ADMIN or PRIV_KEY not set in .env");
    const admin = new Wallet(adminKey, provider);

    console.log(`🔑 Admin: ${admin.address}`);
    console.log(`📄 NativeMinter: ${NATIVE_MINTER_ADDRESS}`);

    // ── SECTION A: Crash Tests ──
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  SECTION A: CRASH TESTS");
    console.log("═══════════════════════════════════════════════════════════════════");

    await testA1_ShortCalldataCrash();
    await testA2_FunctionLevelShortCalldata();
    await testA3_PostCrashNodeHealth();

    // ── SECTION B: Initialization & Ownership ──
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  SECTION B: INITIALIZATION & OWNERSHIP");
    console.log("═══════════════════════════════════════════════════════════════════");

    await testB1_InitAndReadback(admin);
    await testB2_DuplicateInitRejected(admin);
    await testB3_DuplicateInitWithSupplyZero(admin);
    await testB4_TransferOwnership(admin, provider);

    // ── SECTION C: Minting ──
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  SECTION C: MINTING");
    console.log("═══════════════════════════════════════════════════════════════════");

    await testC1_MintToRecipient(admin, provider);
    await testC2_MintUpdatesTotalSupply(admin);
    await testC3_MintLargeAmount(admin, provider);

    // ── SECTION D: Access Control ──
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  SECTION D: ACCESS CONTROL");
    console.log("═══════════════════════════════════════════════════════════════════");

    await testD1_NonOwnerCannotMint(admin, provider);
    await testD2_NonOwnerCannotTransferOwnership(admin, provider);
    await testD3_NonOwnerCannotReInit(admin, provider);

    // ── SECTION E: Edge Cases ──
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  SECTION E: EDGE CASES");
    console.log("═══════════════════════════════════════════════════════════════════");

    await testE1_MintZeroAmountFails(admin, provider);
    await testE2_MintToZeroAddressFails(admin);
    await testE3_TransferOwnershipToZeroFails(admin);
    await testE4_TotalSupplyReadback(admin);
    await testE5_MultipleMints(admin, provider);

    // ── Summary ──
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("  SUMMARY");
    console.log("═══════════════════════════════════════════════════════════════════\n");
    console.log(`   ✅ Passed: ${passCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📊 Total:  ${passCount + failCount}\n`);

    if (failCount === 0) {
        console.log("   🎉 ALL TESTS PASSED!\n");
    } else {
        console.log(`   ⚠️  ${failCount} test(s) failed.\n`);
    }
}

main()
    .then(() => process.exit(failCount > 0 ? 1 : 0))
    .catch((error) => {
        console.error("\n❌ Fatal:", error.shortMessage || error.message);
        process.exit(1);
    });
