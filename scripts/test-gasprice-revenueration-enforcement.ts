import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * End-to-end RPC test: GasPrice floor enforcement + Revenue distribution
 *
 * What this tests:
 *   PART 1 — GasPrice precompile (0x1003)
 *     1.1  Set floor to 1000 gwei and enable
 *     1.2  Send tx at exactly 1000 gwei → accepted
 *     1.3  Attempt tx at 1 gwei → rejected with TRANSACTION_PRICE_TOO_LOW
 *     1.4  Disable → tx at 1 gwei now accepted
 *
 *   PART 2 — Revenue distribution (0x1004 + 0x1005)
 *     2.1  Register treasury and provider addresses
 *     2.2  Set ratios: sender=30, coinbase=40, provider=20, treasury=10
 *     2.3  Enable revenue ratio
 *     2.4  Send tx and capture pre/post balances for all 4 recipients
 *     2.5  Assert each recipient received the correct share (within gas tolerance)
 *
 *   PART 3 — Interaction: both active
 *     3.1  Floor enforced AND split applied simultaneously
 *
 * Usage:
 *   npx tsx scripts/test-gasprice-revenueration-enforcement.ts
 *
 * Requires in .env:
 *   ADMIN   — private key with sufficient balance and precompile ownership
 *   ADMIN2  — optional second key; if absent a random wallet is used
 */

// ── Precompile addresses ────────────────────────────────────────────────────
const GAS_PRICE_ADDR      = "0x0000000000000000000000000000000000001003";
const REVENUE_RATIO_ADDR  = "0x0000000000000000000000000000000000001004";
const TREASURY_REG_ADDR   = "0x0000000000000000000000000000000000001005";

// ── ABIs ────────────────────────────────────────────────────────────────────
const GAS_PRICE_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
    "function status() view returns (bool)",
    "function gasPrice() view returns (uint256)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function setGasPrice(uint256 price) returns (bool)",
];

const REVENUE_RATIO_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
    "function status() view returns (bool)",
    "function senderRatio() view returns (uint256)",
    "function coinbaseRatio() view returns (uint256)",
    "function providerRatio() view returns (uint256)",
    "function treasuryRatio() view returns (uint256)",
    "function enable() returns (bool)",
    "function disable() returns (bool)",
    "function setRevenueRatio(uint8 senderRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) returns (bool)",
];

const TREASURY_REG_ABI = [
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function initializeOwner(address) returns (bool)",
    "function treasuryAt() view returns (address)",
    "function setTreasury(address) returns (bool)",
    "function providerAt() view returns (address)",
    "function setProvider(address) returns (bool)",
];

// ── Test state ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`      ✅ PASS: ${label}`);
        passed++;
    } else {
        console.log(`      ❌ FAIL: ${label}`);
        failed++;
        failures.push(label);
    }
}

function section(title: string) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${"─".repeat(70)}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Ensure a precompile is initialized and owned by `owner`. Returns false if we are not the owner. */
async function ensureInit(contract: ethers.Contract, ownerAddr: string, txOpts: object): Promise<boolean> {
    const isInit: boolean = await contract.initialized();
    if (!isInit) {
        const tx = await contract.initializeOwner(ownerAddr, txOpts);
        await tx.wait(1);
    }
    const storedOwner: string = await contract.owner();
    return storedOwner.toLowerCase() === ownerAddr.toLowerCase();
}

/** Send a bare ETH transfer using raw gasPrice (legacy tx type 0) and return the receipt. */
async function sendLegacyTx(
    provider: ethers.JsonRpcProvider,
    wallet: ethers.Wallet,
    to: string,
    gasPriceWei: bigint,
    gasLimit = 21_000n,
): Promise<ethers.TransactionReceipt | null> {
    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    const network = await provider.getNetwork();
    const tx = await wallet.sendTransaction({
        to,
        value: 0n,
        gasLimit,
        gasPrice: gasPriceWei,
        nonce,
        type: 0,
        chainId: network.chainId,
    });
    return tx.wait(1);
}

/** Attempt a tx that is expected to be excluded from block production (floor enforcement).
 *
 *  Two-phase check:
 *   Phase 1 — if sendTransaction throws immediately → mempool-level rejection → PASS (ideal)
 *   Phase 2 — if tx hash returned, poll until `minExclusionBlocks` are produced and receipt
 *              is still null → block-level enforcement confirmed → PASS (current behaviour)
 *
 *  IMPORTANT: use a dedicated wallet that is NOT shared with other tests. Stuck txs leave
 *  a pending nonce that would block subsequent txs from the same wallet.
 */
async function expectNotMined(
    provider: ethers.JsonRpcProvider,
    wallet: ethers.Wallet,
    to: string,
    gasPriceWei: bigint,
    label: string,
    minExclusionBlocks = 3,
    timeoutMs = 60_000,
): Promise<void> {
    let txHash: string | undefined;

    try {
        const nonce = await provider.getTransactionCount(wallet.address, "pending");
        const network = await provider.getNetwork();
        const response = await wallet.sendTransaction({
            to, value: 0n, gasLimit: 21_000n,
            gasPrice: gasPriceWei, nonce, type: 0,
            chainId: network.chainId,
        });
        txHash = response.hash;
    } catch (e: any) {
        // Mempool-level rejection — ideal early enforcement
        const msg: string = (e?.message ?? "") + (e?.info?.error?.message ?? "");
        const isGasPriceError = msg.toLowerCase().includes("too low")
            || msg.toLowerCase().includes("price")
            || msg.toLowerCase().includes("underpriced")
            || msg.toLowerCase().includes("below");
        assert(isGasPriceError,
            `${label} — rejected at mempool (got: "${msg.slice(0, 120)}")`);
        return;
    }

    // Tx entered mempool — confirm it stays unincluded for `minExclusionBlocks`
    const startBlock = await provider.getBlockNumber();
    const deadline   = Date.now() + timeoutMs;
    let blocksObserved = 0;

    while (Date.now() < deadline) {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt !== null) {
            assert(false, `${label} — tx was included in block ${receipt.blockNumber} despite underpricing`);
            return;
        }
        const currentBlock = await provider.getBlockNumber();
        blocksObserved = currentBlock - startBlock;
        if (blocksObserved >= minExclusionBlocks) {
            assert(true,
                `${label} — excluded from ${blocksObserved} consecutive blocks (floor enforced at block-build time)`);
            return;
        }
        await new Promise(r => setTimeout(r, 2_000));
    }
    assert(false, `${label} — timed out waiting for ${minExclusionBlocks} blocks to confirm exclusion (only saw ${blocksObserved})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║   E2E Test: GasPrice Enforcement + Revenue Distribution (besu-core)  ║");
    console.log("╚══════════════════════════════════════════════════════════════════════╝");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const admin = new ethers.Wallet(adminKey, provider);

    // sender — used for revenue split and positive-case txs (clean nonce sequence)
    const senderKey = process.env.ADMIN2 ?? ethers.Wallet.createRandom().privateKey;
    const sender = new ethers.Wallet(senderKey, provider);

    // rejectionSender — dedicated wallet for underpriced txs that may get stuck in mempool.
    // Kept separate so stuck nonces never poison the sender wallet's nonce sequence.
    const rejectionSender = ethers.Wallet.createRandom().connect(provider);

    // Fixed addresses for treasury and provider so we can track balances
    const TREASURY = ethers.Wallet.createRandom().connect(provider);
    const PROVIDER_WALLET = ethers.Wallet.createRandom().connect(provider);

    console.log(`\n👤 Admin:            ${admin.address}`);
    console.log(`👤 Sender:           ${sender.address}`);
    console.log(`👤 RejectionSender:  ${rejectionSender.address}`);
    console.log(`🏦 Treasury:         ${TREASURY.address}`);
    console.log(`🔌 Provider:         ${PROVIDER_WALLET.address}`);

    // Safe gas price for precompile management txs (always use 1000 gwei as admin)
    const ADMIN_GAS = ethers.parseUnits("1000", "gwei");
    const adminTxOpts = { gasLimit: 500_000n, gasPrice: ADMIN_GAS };

    // Fund sender and rejectionSender if needed
    {
        const needsFunding = async (addr: string, threshold: bigint) =>
            (await provider.getBalance(addr)) < threshold;

        const toFund: { addr: string; label: string }[] = [];
        if (await needsFunding(sender.address, ethers.parseEther("0.5")))
            toFund.push({ addr: sender.address, label: "sender" });
        if (await needsFunding(rejectionSender.address, ethers.parseEther("0.01")))
            toFund.push({ addr: rejectionSender.address, label: "rejectionSender" });

        if (toFund.length > 0) {
            section("Funding test wallets");
            for (const { addr, label } of toFund) {
                const amount = label === "sender" ? ethers.parseEther("1") : ethers.parseEther("0.1");
                const tx = await admin.sendTransaction({
                    to: addr, value: amount,
                    gasLimit: 21_000n, gasPrice: ADMIN_GAS,
                });
                await tx.wait(1);
                console.log(`  ✅ Funded ${label} (${addr}) with ${ethers.formatEther(amount)} ETH`);
            }
        }
    }

    // Instantiate all three precompiles
    const gpContract  = new ethers.Contract(GAS_PRICE_ADDR,     GAS_PRICE_ABI,     admin);
    const rrContract  = new ethers.Contract(REVENUE_RATIO_ADDR, REVENUE_RATIO_ABI, admin);
    const trContract  = new ethers.Contract(TREASURY_REG_ADDR,  TREASURY_REG_ABI,  admin);

    // ───────────────────────────────────────────────────────────────────────
    // SETUP — ensure all precompiles are init'd and owned by admin
    // ───────────────────────────────────────────────────────────────────────
    section("Setup: initialise precompiles");

    {
        const gpOk = await ensureInit(gpContract, admin.address, adminTxOpts);
        assert(gpOk, "GasPrice (0x1003) owned by admin");

        const rrOk = await ensureInit(rrContract, admin.address, adminTxOpts);
        assert(rrOk, "RevenueRatio (0x1004) owned by admin");

        const trOk = await ensureInit(trContract, admin.address, adminTxOpts);
        assert(trOk, "TreasuryRegistry (0x1005) owned by admin");
    }

    // ───────────────────────────────────────────────────────────────────────
    // PART 1 — GasPrice floor enforcement
    // ───────────────────────────────────────────────────────────────────────
    section("PART 1 — GasPrice floor enforcement (0x1003)");

    const FLOOR_GWEI = 1_000n; // 1000 gwei
    const FLOOR_WEI  = ethers.parseUnits(FLOOR_GWEI.toString(), "gwei");

    // 1.1 — Disable revenue ratio so Part 1 is isolated
    {
        const rrStatus: boolean = await rrContract.status();
        if (rrStatus) {
            const tx = await rrContract.disable(adminTxOpts);
            await tx.wait(1);
        }
    }

    // 1.2 — Set floor and enable
    console.log(`\n  [1.1] Setting gas price floor to ${FLOOR_GWEI} gwei and enabling...`);
    {
        const txPrice = await gpContract.setGasPrice(FLOOR_WEI, adminTxOpts);
        await txPrice.wait(1);
        const txEnable = await gpContract.enable(adminTxOpts);
        await txEnable.wait(1);

        const storedPrice: bigint = await gpContract.gasPrice();
        const enabled: boolean    = await gpContract.status();
        assert(storedPrice === FLOOR_WEI, `Stored floor = ${FLOOR_GWEI} gwei`);
        assert(enabled, "GasPrice precompile enabled");
    }

    // 1.3 — Tx at exactly floor → must succeed
    console.log(`\n  [1.2] Sending tx at exactly ${FLOOR_GWEI} gwei (should succeed)...`);
    {
        try {
            const receipt = await sendLegacyTx(provider, sender, admin.address, FLOOR_WEI);
            assert(receipt?.status === 1, `Tx at floor (${FLOOR_GWEI} gwei) accepted`);
        } catch (e: any) {
            assert(false, `Tx at floor rejected unexpectedly: ${e.message?.slice(0, 120)}`);
        }
    }

    // 1.4 — Tx at 1 gwei → must be excluded from blocks
    console.log(`\n  [1.3] Sending tx at 1 gwei — floor is ${FLOOR_GWEI} gwei (should be excluded from blocks)...`);
    await expectNotMined(provider, rejectionSender, admin.address, ethers.parseUnits("1", "gwei"),
        "Tx at 1 gwei excluded when floor = 1000 gwei", 1, 90_000);

    // 1.5 — Disable and verify the same 1 gwei tx now passes
    console.log(`\n  [1.4] Disabling GasPrice precompile, re-sending tx at 1 gwei...`);
    {
        const txDisable = await gpContract.disable(adminTxOpts);
        await txDisable.wait(1);
        assert(!(await gpContract.status()), "GasPrice precompile disabled");

        try {
            const receipt = await sendLegacyTx(provider, sender, admin.address, ethers.parseUnits("1", "gwei"));
            assert(receipt?.status === 1, "Tx at 1 gwei accepted after disabling floor");
        } catch (e: any) {
            assert(false, `Tx at 1 gwei still rejected after disable: ${e.message?.slice(0, 120)}`);
        }
    }

    // Re-enable at floor for Part 3
    {
        const txEnable = await gpContract.enable(adminTxOpts);
        await txEnable.wait(1);
    }

    // ───────────────────────────────────────────────────────────────────────
    // PART 2 — Revenue distribution
    // ───────────────────────────────────────────────────────────────────────
    section("PART 2 — Revenue distribution (0x1004 + 0x1005)");

    // Ratios: sender=30, coinbase=40, provider=20, treasury=10
    const SENDER_RATIO   = 30n;
    const COINBASE_RATIO = 40n;
    const PROVIDER_RATIO = 20n;
    const TREASURY_RATIO = 10n;

    // 2.1 — Register treasury and provider
    console.log(`\n  [2.1] Registering treasury (${TREASURY.address}) and provider (${PROVIDER_WALLET.address})...`);
    {
        const txT = await trContract.setTreasury(TREASURY.address, adminTxOpts);
        await txT.wait(1);
        const txP = await trContract.setProvider(PROVIDER_WALLET.address, adminTxOpts);
        await txP.wait(1);

        const storedTreasury: string = await trContract.treasuryAt();
        const storedProvider: string = await trContract.providerAt();
        assert(storedTreasury.toLowerCase() === TREASURY.address.toLowerCase(),
            "Treasury address stored correctly");
        assert(storedProvider.toLowerCase() === PROVIDER_WALLET.address.toLowerCase(),
            "Provider address stored correctly");
    }

    // 2.2 — Set ratios
    console.log(`\n  [2.2] Setting ratios: sender=${SENDER_RATIO} coinbase=${COINBASE_RATIO} provider=${PROVIDER_RATIO} treasury=${TREASURY_RATIO}...`);
    {
        const txRatio = await rrContract.setRevenueRatio(
            SENDER_RATIO, COINBASE_RATIO, PROVIDER_RATIO, TREASURY_RATIO,
            adminTxOpts,
        );
        await txRatio.wait(1);

        const sr: bigint = await rrContract.senderRatio();
        const cr: bigint = await rrContract.coinbaseRatio();
        const pr: bigint = await rrContract.providerRatio();
        const tr: bigint = await rrContract.treasuryRatio();
        assert(sr === SENDER_RATIO && cr === COINBASE_RATIO && pr === PROVIDER_RATIO && tr === TREASURY_RATIO,
            `Ratios stored: sender=${sr} coinbase=${cr} provider=${pr} treasury=${tr}`);
    }

    // 2.3 — Enable revenue ratio
    console.log(`\n  [2.3] Enabling RevenueRatio precompile...`);
    {
        const txEn = await rrContract.enable(adminTxOpts);
        await txEn.wait(1);
        assert(await rrContract.status(), "RevenueRatio enabled");
    }

    // 2.4 — Send a tx and capture balance deltas
    console.log(`\n  [2.4] Sending test tx and measuring balance splits...`);
    {
        const TX_GAS_LIMIT = 21_000n;
        const TX_GAS_PRICE = FLOOR_WEI;

        const receipt = await sendLegacyTx(provider, sender, admin.address, TX_GAS_PRICE, TX_GAS_LIMIT);
        assert(receipt?.status === 1, "Revenue-split tx executed successfully");

        // Use the receipt's block for the ACTUAL coinbase and baseFee.
        // QBFT rotates proposers per block — capture coinbase from the mined block.
        const txBlock        = await provider.getBlock(receipt!.blockNumber);
        const actualCoinbase = txBlock!.miner;
        const baseFee        = txBlock!.baseFeePerGas ?? 0n;

        // Distributed fee = coinbaseWeiDelta inside distributeRevenue
        // For legacy txs: (gasPrice - baseFee) * gasUsed
        const actualDistributedFee = (TX_GAS_PRICE - baseFee) * receipt!.gasUsed;

        // Block-level balance deltas: query at (N-1) and (N) for single-block accuracy
        const prev = receipt!.blockNumber - 1;
        const curr = receipt!.blockNumber;

        const balBefore = {
            coinbase: await provider.getBalance(actualCoinbase, prev),
            treasury: await provider.getBalance(TREASURY.address, prev),
            provider: await provider.getBalance(PROVIDER_WALLET.address, prev),
            sender:   await provider.getBalance(sender.address, prev),
        };
        const balAfter = {
            coinbase: await provider.getBalance(actualCoinbase, curr),
            treasury: await provider.getBalance(TREASURY.address, curr),
            provider: await provider.getBalance(PROVIDER_WALLET.address, curr),
            sender:   await provider.getBalance(sender.address, curr),
        };

        // Expected shares (integer division — matches distributeRevenue in Java)
        const senderShare   = actualDistributedFee * SENDER_RATIO   / 100n;
        const coinbaseShare = actualDistributedFee * COINBASE_RATIO / 100n;
        const providerShare = actualDistributedFee * PROVIDER_RATIO / 100n;
        const treasuryShare = actualDistributedFee * TREASURY_RATIO / 100n;
        const remainder     = actualDistributedFee - senderShare - coinbaseShare - providerShare - treasuryShare;

        console.log(`      Coinbase: ${actualCoinbase}`);
        console.log(`      Base fee: ${ethers.formatUnits(baseFee, "gwei")} gwei`);
        console.log(`      Gas used: ${receipt!.gasUsed}`);
        console.log(`      Distributed fee: ${ethers.formatUnits(actualDistributedFee, "gwei")} gwei`);
        console.log(`      Expected splits:`);
        console.log(`        sender  (${SENDER_RATIO}%): ${ethers.formatUnits(senderShare, "gwei")} gwei`);
        console.log(`        coinbase(${COINBASE_RATIO}%): ${ethers.formatUnits(coinbaseShare + remainder, "gwei")} gwei (inc. dust=${remainder})`);
        console.log(`        provider(${PROVIDER_RATIO}%): ${ethers.formatUnits(providerShare, "gwei")} gwei`);
        console.log(`        treasury(${TREASURY_RATIO}%): ${ethers.formatUnits(treasuryShare, "gwei")} gwei`);

        // Coinbase gets coinbaseShare + integer-division remainder (dust)
        const coinbaseDelta = balAfter.coinbase - balBefore.coinbase;
        assert(coinbaseDelta === coinbaseShare + remainder,
            `Coinbase received ${ethers.formatUnits(coinbaseDelta, "gwei")} gwei (expected ${ethers.formatUnits(coinbaseShare + remainder, "gwei")})`);

        const treasuryDelta = balAfter.treasury - balBefore.treasury;
        assert(treasuryDelta === treasuryShare,
            `Treasury received ${ethers.formatUnits(treasuryDelta, "gwei")} gwei (expected ${ethers.formatUnits(treasuryShare, "gwei")})`);

        const providerDelta = balAfter.provider - balBefore.provider;
        assert(providerDelta === providerShare,
            `Provider received ${ethers.formatUnits(providerDelta, "gwei")} gwei (expected ${ethers.formatUnits(providerShare, "gwei")})`);

        // Sender net cost = full gas paid upfront − cashback received
        const totalGasCost    = TX_GAS_PRICE * receipt!.gasUsed;
        const expectedNetCost = totalGasCost - senderShare;
        const senderNetCost   = balBefore.sender - balAfter.sender;
        assert(senderNetCost === expectedNetCost,
            `Sender net cost ${ethers.formatUnits(senderNetCost, "gwei")} gwei (expected ${ethers.formatUnits(expectedNetCost, "gwei")})`);
    }

    // ───────────────────────────────────────────────────────────────────────
    // PART 3 — Both active simultaneously
    // ───────────────────────────────────────────────────────────────────────
    section("PART 3 — GasPrice floor + Revenue split active simultaneously");

    // At this point: floor = 1000 gwei (enabled), revenue ratio enabled
    // 3.1 — Tx below floor must still be excluded even when revenue ratio is on
    console.log(`\n  [3.1] Tx at 1 gwei with both enforcement and revenue split active (should be excluded)...`);
    await expectNotMined(provider, rejectionSender, admin.address, ethers.parseUnits("1", "gwei"),
        "Tx at 1 gwei excluded even with revenue split active", 1, 90_000);

    // 3.2 — Tx at floor passes and split is applied
    console.log(`\n  [3.2] Tx at ${FLOOR_GWEI} gwei with both active (should succeed with split)...`);
    {
        const receipt = await sendLegacyTx(provider, sender, admin.address, FLOOR_WEI);
        assert(receipt?.status === 1, "Tx at floor succeeds with both features active");

        const txBlock        = await provider.getBlock(receipt!.blockNumber);
        const actualCoinbase = txBlock!.miner;
        const baseFee        = txBlock!.baseFeePerGas ?? 0n;
        const distributedFee = (FLOOR_WEI - baseFee) * receipt!.gasUsed;

        const prev = receipt!.blockNumber - 1;
        const curr = receipt!.blockNumber;

        const treasuryBefore = await provider.getBalance(TREASURY.address, prev);
        const treasuryAfter  = await provider.getBalance(TREASURY.address, curr);
        const providerBefore = await provider.getBalance(PROVIDER_WALLET.address, prev);
        const providerAfter  = await provider.getBalance(PROVIDER_WALLET.address, curr);

        const expectedTreasury = distributedFee * TREASURY_RATIO / 100n;
        const expectedProvider = distributedFee * PROVIDER_RATIO / 100n;

        assert(treasuryAfter - treasuryBefore === expectedTreasury,
            `Treasury split correct (${ethers.formatUnits(treasuryAfter - treasuryBefore, "gwei")} gwei)`);
        assert(providerAfter - providerBefore === expectedProvider,
            `Provider split correct (${ethers.formatUnits(providerAfter - providerBefore, "gwei")} gwei)`);
    }

    // ───────────────────────────────────────────────────────────────────────
    // CLEANUP — leave GasPrice enabled at floor, disable revenue ratio
    // (so other tests/scripts are not affected)
    // ───────────────────────────────────────────────────────────────────────
    {
        const txClean = await rrContract.disable(adminTxOpts);
        await txClean.wait(1);
    }

    // ───────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ───────────────────────────────────────────────────────────────────────
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log(`\n  Failed assertions:`);
        failures.forEach(f => console.log(`    ✗ ${f}`));
    }
    console.log(`${"═".repeat(70)}\n`);

    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
