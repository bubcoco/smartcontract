/**
 * Comprehensive Precompile Test Script
 *
 * Tests all 5 custom precompiles:
 *   0x1001 — NativeMinter      (mint native ETH)
 *   0x1002 — AddressRegistry   (whitelist addresses)
 *   0x1003 — GasPrice          (set min gas price)
 *   0x1004 — RevenueRatio      (set fee revenue split)
 *   0x1005 — TreasuryRegistry  (set treasury address)
 *
 * For each precompile, tests:
 *   1. Owner initialization
 *   2. Read functions
 *   3. Admin write functions (from owner)
 *   4. Access control (fresh address cannot call admin functions)
 *   5. State verification (values actually persisted)
 */

import { ethers, Wallet, Contract } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

const TX_OVERRIDES = { gasLimit: 100_000, gasPrice: ethers.parseUnits("2000", "gwei") };

let passCount = 0;
let failCount = 0;

function pass(name: string, detail?: string) {
    passCount++;
    console.log(`   ✅ PASS: ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
    failCount++;
    console.log(`   ❌ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

// ─────────────── ADDRESSES ───────────────
const ADDRESSES = {
    NativeMinter: "0x0000000000000000000000000000000000001001",
    AddressRegistry: "0x0000000000000000000000000000000000001002",
    GasPrice: "0x0000000000000000000000000000000000001003",
    RevenueRatio: "0x0000000000000000000000000000000000001004",
    TreasuryRegistry: "0x0000000000000000000000000000000000001005",
};

// ─────────────── ABIs ───────────────
const OWNABLE_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (uint256)",
    "function initializeOwner(address) returns (bool)",
    "function transferOwnership(address) returns (bool)",
];

const NATIVE_MINTER_ABI = [
    ...OWNABLE_ABI,
    "function mint(address to, uint256 amount) returns (bool)",
];

const ADDRESS_REGISTRY_ABI = [
    ...OWNABLE_ABI,
    "function addToRegistry(address addr, address initiator) returns (bool)",
    "function removeFromRegistry(address addr) returns (bool)",
    "function contains(address addr) view returns (bool)",
    "function discovery(address addr) view returns (address)",
];

const GAS_PRICE_ABI = [
    ...OWNABLE_ABI,
    "function setGasPrice(uint256 price) returns (bool)",
    "function gasPrice() view returns (uint256)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function status() view returns (uint256)",
];

const REVENUE_RATIO_ABI = [
    ...OWNABLE_ABI,
    "function setRevenueRatio(uint8 contractRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)",
    "function contractRatio() view returns (uint256)",
    "function coinbaseRatio() view returns (uint256)",
    "function providerRatio() view returns (uint256)",
    "function treasuryRatio() view returns (uint256)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function status() view returns (uint256)",
];

const TREASURY_REGISTRY_ABI = [
    ...OWNABLE_ABI,
    "function setTreasury(address treasury) returns (bool)",
    "function treasuryAt() view returns (address)",
];

// ─────────────── HELPERS ───────────────

async function fundWallet(admin: Wallet, to: string, amount: string) {
    const tx = await admin.sendTransaction({
        to,
        value: ethers.parseEther(amount),
        ...TX_OVERRIDES,
    });
    await tx.wait(1);
}

/** Send tx and return receipt without throwing on revert */
async function safeSend(contract: Contract, method: string, args: any[]): Promise<any> {
    const tx = await contract[method](...args, TX_OVERRIDES);
    const receipt = await tx.wait(1).catch(() => tx.wait());
    return receipt;
}

async function initPrecompile(admin: Wallet, address: string, abi: string[]) {
    const contract = new Contract(address, abi, admin);
    try {
        const isInit = await contract.initialized();
        if (isInit === 0n) {
            const tx = await contract.initializeOwner(admin.address, TX_OVERRIDES);
            try { await tx.wait(1); } catch { /* status 0 is ok for init race */ }
            console.log(`   🔧 Initialized ${address}`);
        }
    } catch (e: any) {
        console.log(`   ⚠️  Init check failed for ${address}: ${e.message?.substring(0, 60)}`);
    }
    return contract;
}

// ═══════════════ TEST: NATIVE MINTER (0x1001) ═══════════════

async function testNativeMinter(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  NativeMinter (0x1001)                       ║");
    console.log("╚══════════════════════════════════════════════╝");
    try {
        const minter = await initPrecompile(admin, ADDRESSES.NativeMinter, NATIVE_MINTER_ABI);

        // Test 1: Owner correct
        const owner = await minter.owner();
        if (owner.toLowerCase().includes(admin.address.toLowerCase().slice(2))) {
            pass("Owner is admin");
        } else {
            fail("Owner mismatch", `Expected ${admin.address}, got ${owner}`);
        }

        // Test 2: Mint — admin can mint native ETH
        const recipient = Wallet.createRandom().address;
        const balBefore = await provider.getBalance(recipient);
        const mintAmount = ethers.parseEther("5");
        const tx = await minter.mint(recipient, mintAmount, TX_OVERRIDES);
        try { await tx.wait(1); } catch { }
        const balAfter = await provider.getBalance(recipient);
        if (balAfter - balBefore === mintAmount) {
            pass("Admin minted 5 ETH", `Balance: ${ethers.formatEther(balAfter)} ETH`);
        } else {
            fail("Mint amount mismatch", `Expected +5 ETH, got +${ethers.formatEther(balAfter - balBefore)}`);
        }

        // Test 3: Fresh address cannot mint
        const attacker = Wallet.createRandom().connect(provider);
        await fundWallet(admin, attacker.address, "100");
        const attackerMinter = new Contract(ADDRESSES.NativeMinter, NATIVE_MINTER_ABI, attacker);
        const attackerBalBefore = await provider.getBalance(attacker.address);
        const tx2 = await attackerMinter.mint(attacker.address, ethers.parseEther("1000"), TX_OVERRIDES);
        try { await tx2.wait(1); } catch { }
        const attackerBalAfter = await provider.getBalance(attacker.address);
        // If mint succeeded, balance would increase by ~1000 ETH. If failed, it only decreases (gas).
        const balDelta = attackerBalAfter - attackerBalBefore;
        if (balDelta <= 0n) {
            pass("Non-owner cannot mint");
        } else {
            fail("CRITICAL: Non-owner minted ETH!", `Balance delta: +${ethers.formatEther(balDelta)} ETH`);
        }

        // Test 4: Fresh address cannot transferOwnership
        const ownerBefore = await minter.owner();
        const tx3 = await attackerMinter.transferOwnership(attacker.address, TX_OVERRIDES);
        try { await tx3.wait(1); } catch { }
        const ownerAfter = await minter.owner();
        if (ownerAfter === ownerBefore) {
            pass("Non-owner cannot transfer ownership");
        } else {
            fail("CRITICAL: Ownership stolen!");
        }
    } catch (e: any) {
        fail("NativeMinter test crashed", e.message?.substring(0, 80));
    }
}

// ═══════════════ TEST: ADDRESS REGISTRY (0x1002) ═══════════════

async function testAddressRegistry(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  AddressRegistry (0x1002)                    ║");
    console.log("╚══════════════════════════════════════════════╝");
    try {
        const registry = await initPrecompile(admin, ADDRESSES.AddressRegistry, ADDRESS_REGISTRY_ABI);

        // Test 1: Add address to registry
        const testAddr = Wallet.createRandom().address;
        const initiator = admin.address;
        const tx = await registry.addToRegistry(testAddr, initiator, TX_OVERRIDES);
        try { await tx.wait(1); } catch { }

        const isContained = await registry.contains(testAddr);
        if (isContained) {
            pass("Added address to registry");
        } else {
            fail("Address not found in registry after add");
        }

        // Test 2: Discovery returns initiator
        const discovered = await registry.discovery(testAddr);
        if (discovered.toLowerCase().includes(initiator.toLowerCase().slice(2))) {
            pass("Discovery returns correct initiator", discovered);
        } else {
            fail("Discovery mismatch", `Expected ${initiator}, got ${discovered}`);
        }

        // Test 3: Remove from registry
        const tx2 = await registry.removeFromRegistry(testAddr, TX_OVERRIDES);
        try { await tx2.wait(1); } catch { }
        const isContainedAfter = await registry.contains(testAddr);
        if (!isContainedAfter) {
            pass("Removed address from registry");
        } else {
            fail("Address still in registry after remove");
        }

        // Test 4: Fresh address cannot add
        const attacker = Wallet.createRandom().connect(provider);
        await fundWallet(admin, attacker.address, "100");
        const attackerRegistry = new Contract(ADDRESSES.AddressRegistry, ADDRESS_REGISTRY_ABI, attacker);
        const sneakAddr = Wallet.createRandom().address;
        const tx3 = await attackerRegistry.addToRegistry(sneakAddr, attacker.address, TX_OVERRIDES);
        try { await tx3.wait(1); } catch { }
        const sneakContained = await registry.contains(sneakAddr);
        if (!sneakContained) {
            pass("Non-owner cannot add to registry");
        } else {
            fail("CRITICAL: Non-owner added address to registry!");
        }

        // Test 5: Fresh address cannot remove
        const guardedAddr = Wallet.createRandom().address;
        try { await (await registry.addToRegistry(guardedAddr, admin.address, TX_OVERRIDES)).wait(1); } catch { }
        const tx4 = await attackerRegistry.removeFromRegistry(guardedAddr, TX_OVERRIDES);
        try { await tx4.wait(1); } catch { }
        const stillThere = await registry.contains(guardedAddr);
        if (stillThere) {
            pass("Non-owner cannot remove from registry");
        } else {
            fail("CRITICAL: Non-owner removed address from registry!");
        }
    } catch (e: any) {
        fail("AddressRegistry test crashed", e.message?.substring(0, 80));
    }
}

// ═══════════════ TEST: GAS PRICE (0x1003) ═══════════════

async function testGasPrice(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  GasPrice (0x1003)                           ║");
    console.log("╚══════════════════════════════════════════════╝");
    try {
        const gp = await initPrecompile(admin, ADDRESSES.GasPrice, GAS_PRICE_ABI);

        // Test 1: Read current gas price
        const currentPrice = await gp.gasPrice();
        console.log(`   📋 Current gas price: ${currentPrice} wei`);
        pass("Read gasPrice()", `${currentPrice} wei`);

        // Test 2: Read status
        const currentStatus = await gp.status();
        console.log(`   📋 Status: ${currentStatus}`);
        pass("Read status()", `${currentStatus}`);

        // Test 3: Set gas price (admin)
        const newPrice = ethers.parseUnits("1000", "gwei");
        const tx = await gp.setGasPrice(newPrice, TX_OVERRIDES);
        try { await tx.wait(1); } catch { }
        const updatedPrice = await gp.gasPrice();
        if (updatedPrice === newPrice) {
            pass("Admin set gas price", `${ethers.formatUnits(updatedPrice, "gwei")} gwei`);
        } else {
            fail("Gas price not updated", `Expected ${newPrice}, got ${updatedPrice}`);
        }

        // Test 4: Enable/Disable (admin)
        const tx2 = await gp.enable(TX_OVERRIDES);
        try { await tx2.wait(1); } catch { }
        const statusAfterEnable = await gp.status();
        if (statusAfterEnable === 1n) {
            pass("Admin enabled gas price");
        } else {
            fail("Enable failed", `Status: ${statusAfterEnable}`);
        }

        const tx3 = await gp.disable(TX_OVERRIDES);
        try { await tx3.wait(1); } catch { }
        const statusAfterDisable = await gp.status();
        if (statusAfterDisable === 0n) {
            pass("Admin disabled gas price");
        } else {
            fail("Disable failed", `Status: ${statusAfterDisable}`);
        }

        // Test 5: Fresh address cannot setGasPrice
        const attacker = Wallet.createRandom().connect(provider);
        await fundWallet(admin, attacker.address, "100");
        const attackerGp = new Contract(ADDRESSES.GasPrice, GAS_PRICE_ABI, attacker);
        const priceBefore = await gp.gasPrice();
        const tx4 = await attackerGp.setGasPrice(ethers.parseUnits("999999", "gwei"), TX_OVERRIDES);
        try { await tx4.wait(1); } catch { }
        const priceAfter = await gp.gasPrice();
        if (priceAfter === priceBefore) {
            pass("Non-owner cannot setGasPrice");
        } else {
            fail("CRITICAL: Non-owner set gas price!", `${priceBefore} -> ${priceAfter}`);
        }

        // Test 6: Fresh address cannot enable/disable
        const tx5 = await attackerGp.enable(TX_OVERRIDES);
        try { await tx5.wait(1); } catch { }
        const statusAfterAttack = await gp.status();
        if (statusAfterAttack === 0n) {
            pass("Non-owner cannot enable");
        } else {
            fail("CRITICAL: Non-owner enabled gas price!");
        }
    } catch (e: any) {
        fail("GasPrice test crashed", e.message?.substring(0, 80));
    }
}

// ═══════════════ TEST: REVENUE RATIO (0x1004) ═══════════════

async function testRevenueRatio(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  RevenueRatio (0x1004)                       ║");
    console.log("╚══════════════════════════════════════════════╝");
    try {
        const rr = await initPrecompile(admin, ADDRESSES.RevenueRatio, REVENUE_RATIO_ABI);

        // Test 1: Set ratio (must sum to 100)
        const tx = await rr.setRevenueRatio(25, 25, 25, 25, TX_OVERRIDES);
        try { await tx.wait(1); } catch { }
        const cr = await rr.contractRatio();
        const cbr = await rr.coinbaseRatio();
        const pr = await rr.providerRatio();
        const tr = await rr.treasuryRatio();
        if (cr === 25n && cbr === 25n && pr === 25n && tr === 25n) {
            pass("Admin set revenue ratio (25/25/25/25)");
        } else {
            fail("Ratio mismatch", `${cr}/${cbr}/${pr}/${tr}`);
        }

        // Test 2: Ratio must sum to 100 — invalid should fail
        const tx2 = await rr.setRevenueRatio(30, 30, 30, 30, TX_OVERRIDES); // = 120
        try { await tx2.wait(1); } catch { }
        const cr2 = await rr.contractRatio();
        if (cr2 === 25n) { // unchanged
            pass("Rejected ratio that doesn't sum to 100 (120)");
        } else {
            fail("Accepted invalid ratio sum!", `contract ratio = ${cr2}`);
        }

        // Test 3: Enable / Disable
        const tx3 = await rr.enable(TX_OVERRIDES);
        try { await tx3.wait(1); } catch { }
        const st1 = await rr.status();
        if (st1 === 1n) {
            pass("Admin enabled revenue ratio");
        } else {
            fail("Enable failed");
        }

        const tx4 = await rr.disable(TX_OVERRIDES);
        try { await tx4.wait(1); } catch { }
        const st2 = await rr.status();
        if (st2 === 0n) {
            pass("Admin disabled revenue ratio");
        } else {
            fail("Disable failed");
        }

        // Test 4: Fresh address cannot set ratio
        const attacker = Wallet.createRandom().connect(provider);
        await fundWallet(admin, attacker.address, "100");
        const attackerRr = new Contract(ADDRESSES.RevenueRatio, REVENUE_RATIO_ABI, attacker);
        const tx5 = await attackerRr.setRevenueRatio(0, 0, 0, 100, TX_OVERRIDES);
        try { await tx5.wait(1); } catch { }
        const crAfter = await rr.contractRatio();
        if (crAfter === 25n) { // unchanged
            pass("Non-owner cannot set revenue ratio");
        } else {
            fail("CRITICAL: Non-owner changed revenue ratio!", `contract = ${crAfter}`);
        }

        // Test 5: Fresh address cannot enable
        const tx6 = await attackerRr.enable(TX_OVERRIDES);
        try { await tx6.wait(1); } catch { }
        const stAfter = await rr.status();
        if (stAfter === 0n) {
            pass("Non-owner cannot enable revenue ratio");
        } else {
            fail("CRITICAL: Non-owner enabled revenue ratio!");
        }
    } catch (e: any) {
        fail("RevenueRatio test crashed", e.message?.substring(0, 80));
    }
}

// ═══════════════ TEST: TREASURY REGISTRY (0x1005) ═══════════════

async function testTreasuryRegistry(provider: ethers.JsonRpcProvider, admin: Wallet) {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  TreasuryRegistry (0x1005)                   ║");
    console.log("╚══════════════════════════════════════════════╝");
    try {
        const tr = await initPrecompile(admin, ADDRESSES.TreasuryRegistry, TREASURY_REGISTRY_ABI);

        // Test 1: Set treasury address
        const treasuryAddr = Wallet.createRandom().address;
        const tx = await tr.setTreasury(treasuryAddr, TX_OVERRIDES);
        try { await tx.wait(1); } catch { }
        const stored = await tr.treasuryAt();
        if (stored.toLowerCase().includes(treasuryAddr.toLowerCase().slice(2))) {
            pass("Admin set treasury address", treasuryAddr);
        } else {
            fail("Treasury address mismatch", `Expected ${treasuryAddr}, got ${stored}`);
        }

        // Test 2: Fresh address cannot set treasury
        const attacker = Wallet.createRandom().connect(provider);
        await fundWallet(admin, attacker.address, "100");
        const attackerTr = new Contract(ADDRESSES.TreasuryRegistry, TREASURY_REGISTRY_ABI, attacker);
        const maliciousAddr = attacker.address;
        const tx2 = await attackerTr.setTreasury(maliciousAddr, TX_OVERRIDES);
        try { await tx2.wait(1); } catch { }
        const storedAfter = await tr.treasuryAt();
        if (storedAfter.toLowerCase().includes(treasuryAddr.toLowerCase().slice(2))) {
            pass("Non-owner cannot set treasury");
        } else {
            fail("CRITICAL: Non-owner changed treasury!", `${storedAfter}`);
        }

        // Test 3: Fresh address cannot transfer ownership
        const ownerBefore = await tr.owner();
        const tx3 = await attackerTr.transferOwnership(attacker.address, TX_OVERRIDES);
        try { await tx3.wait(1); } catch { }
        const ownerAfter = await tr.owner();
        if (ownerAfter === ownerBefore) {
            pass("Non-owner cannot transfer ownership");
        } else {
            fail("CRITICAL: Ownership stolen!");
        }

        // Test 4: Cannot re-initialize
        const tx4 = await attackerTr.initializeOwner(attacker.address, TX_OVERRIDES);
        try { await tx4.wait(1); } catch { }
        const ownerFinal = await tr.owner();
        if (ownerFinal === ownerBefore) {
            pass("Cannot re-initialize after init");
        } else {
            fail("CRITICAL: Re-initialization succeeded!");
        }
    } catch (e: any) {
        fail("TreasuryRegistry test crashed", e.message?.substring(0, 80));
    }
}

// ═══════════════ MAIN ═══════════════

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║        Custom Precompile Comprehensive Test Suite                 ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminKey = process.env.ADMIN || process.env.PRIV_KEY;
    if (!adminKey) throw new Error("ADMIN or PRIV_KEY not set in .env");
    const admin = new Wallet(adminKey, provider);

    console.log(`🔑 Admin: ${admin.address}`);
    console.log(`🌐 RPC:   ${RPC_URL}`);

    await testNativeMinter(provider, admin);
    await testAddressRegistry(provider, admin);
    await testGasPrice(provider, admin);
    await testRevenueRatio(provider, admin);
    await testTreasuryRegistry(provider, admin);

    console.log("\n════════════════════════════════════════════════════════════════════");
    console.log(`📊 Results: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("════════════════════════════════════════════════════════════════════\n");

    if (failCount > 0) {
        console.log("⚠️  Some tests failed. Review output above.\n");
        process.exit(1);
    } else {
        console.log("✅ All precompile tests passed!\n");
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
