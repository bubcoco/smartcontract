/**
 * Benchmark 10: Counter.inc() Stress Test
 * 
 * Flow:
 * 1. Deploy a fresh Counter contract.
 * 2. Check Fee Grant status for User -> Counter (no granting/revoking).
 *    Reports: GRANTED / NOT GRANTED / EXPIRED / GRANTED BUT LOW LIMIT
 * 3. Spam `inc()` calls from User to test Fee Grant throughput.
 */

import { ethers, Wallet, parseUnits, ContractFactory } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// Configuration
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const ADMIN_KEY = process.env.ADMIN || process.env.PRIV_KEY;
const USER_KEY = process.env.PRIV_KEY;
const FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

// Precompile ABI (view functions only — no write)
const PRECOMPILE_ABI = [
    "function isGrantedForProgram(address grantee, address program) view returns (bool)",
    "function isGrantedForAllProgram(address grantee) view returns (bool)",
    "function isExpired(address grantee, address program) view returns (bool)",
    "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
];

// Load Artifacts
const COUNTER_ARTIFACT_PATH = resolve(__dirname, "../artifacts/contracts/Counter.sol/Counter.json");

// ───────────────────────── GRANT STATUS CHECK ─────────────────────────

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function checkGrantStatus(
    provider: ethers.JsonRpcProvider,
    userAddress: string,
    programAddress: string,
    gasPrice: bigint
): Promise<{ status: string; grantProgram: string | null }> {
    const precompile = new ethers.Contract(FEE_GRANT_ADDRESS, PRECOMPILE_ABI, provider);

    // 1. Determine which grant applies: specific program or wildcard (address(0))
    let grantProgram: string | null = null;

    const isGranted = await precompile.isGrantedForProgram(userAddress, programAddress);
    if (isGranted) {
        grantProgram = programAddress;
    } else {
        const isGrantedAll = await precompile.isGrantedForAllProgram(userAddress);
        if (isGrantedAll) {
            grantProgram = ZERO_ADDRESS;
            console.log(`   ℹ️  No specific grant for this contract — using wildcard grant`);
        } else {
            return { status: "NOT_GRANTED", grantProgram: null };
        }
    }

    // 2. Check if expired — use the SAME program address that matched
    const expired = await precompile.isExpired(userAddress, grantProgram);
    if (expired) {
        return { status: "EXPIRED", grantProgram };
    }

    // 3. Get grant details using the matched program
    try {
        const grantData = await precompile.grant(userAddress, grantProgram);
        const spendLimit = grantData.spendLimit;
        const periodCanSpend = grantData.periodCanSpend;
        const allowanceType = grantData.allowance;

        // Upfront gas cost = gasLimit * gasPrice (what the node actually reserves)
        const gasLimit = 100000n; // must match benchmark's gasLimit
        const upfrontCost = gasLimit * gasPrice;

        // Check the effective limit (for periodic grants, it's the lower of spendLimit and periodCanSpend)
        const effectiveLimit = allowanceType === 2n
            ? (spendLimit < periodCanSpend ? spendLimit : periodCanSpend)
            : spendLimit;

        if (effectiveLimit < upfrontCost) {
            const label = allowanceType === 2n && periodCanSpend < spendLimit
                ? `periodCanSpend=${ethers.formatEther(periodCanSpend)}`
                : `spendLimit=${ethers.formatEther(spendLimit)}`;
            return { status: `DEPLETED:${label} ETH < upfrontCost=${ethers.formatEther(upfrontCost)} ETH (can't cover even 1 tx)`, grantProgram };
        }

        // Get granter address and balance
        const granterHex = grantData.granter;
        const granterAddress = "0x" + granterHex.toString().slice(-40);
        const granterBalance = await provider.getBalance(granterAddress);

        if (granterBalance < upfrontCost) {
            return { status: `LOW_LIMIT:granterBalance=${ethers.formatEther(granterBalance)} ETH,granter=${granterAddress}`, grantProgram };
        }

        const typeLabel = allowanceType === 2n ? "PERIODIC" : "BASIC";
        const grantType = grantProgram === ZERO_ADDRESS ? ",scope=WILDCARD" : ",scope=SPECIFIC";
        const estTxs = Number(effectiveLimit / upfrontCost);
        return { status: `GRANTED:type=${typeLabel}${grantType},remaining=${ethers.formatEther(effectiveLimit)} ETH (~${estTxs} txs),granter=${granterAddress}`, grantProgram };
    } catch (e: any) {
        return { status: `GRANTED:details_unavailable (${e.message?.substring(0, 50)})`, grantProgram };
    }
}

// ───────────────────────── MAIN ─────────────────────────

async function main() {
    console.log("🔥 BENCHMARK 10: Counter.inc() Stress Test");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const admin = new Wallet(ADMIN_KEY!, provider);
    const user = new Wallet(USER_KEY!, provider);
    const gasPrice = parseUnits("5000", "gwei");

    console.log(`👮 Admin: ${admin.address}`);
    console.log(`👤 User:  ${user.address}`);

    if (!fs.existsSync(COUNTER_ARTIFACT_PATH)) {
        throw new Error("❌ Counter artifact not found. Please compile contracts first.");
    }
    const counterArtifact = JSON.parse(fs.readFileSync(COUNTER_ARTIFACT_PATH, "utf-8"));

    // 1. Deploy Counter (Admin pays)
    console.log("\n📦 Deploying Counter...");
    const factory = new ContractFactory(counterArtifact.abi, counterArtifact.bytecode, admin);
    const counter = await factory.deploy({ gasPrice: parseUnits("2000", "gwei") });
    await counter.waitForDeployment();
    const counterAddress = await counter.getAddress();
    console.log(`✅ Counter Deployed at: ${counterAddress}`);

    // 2. Check Grant Status (NO granting or revoking)
    console.log("\n🔍 Checking Fee Grant Status...");
    const { status, grantProgram } = await checkGrantStatus(provider, user.address, counterAddress, gasPrice);

    const statusParts = status.split(":");
    const statusType = statusParts[0];
    const statusDetail = statusParts.slice(1).join(":") || "";

    // Capture grant details BEFORE benchmark
    const precompile = new ethers.Contract(FEE_GRANT_ADDRESS, PRECOMPILE_ABI, provider);
    let grantBefore: any = null;
    if (grantProgram && (statusType === "GRANTED" || statusType === "LOW_LIMIT" || statusType === "DEPLETED")) {
        try {
            grantBefore = await precompile.grant(user.address, grantProgram);
        } catch { }
    }

    switch (statusType) {
        case "GRANTED":
            console.log(`   ✅ GRANTED — ${statusDetail}`);
            break;
        case "NOT_GRANTED":
            console.log(`   ⚠️  NOT GRANTED — User will pay gas from own balance`);
            break;
        case "EXPIRED":
            console.log(`   ❌ EXPIRED — Grant exists but is expired.`);
            break;
        case "DEPLETED":
            console.log(`   ❌ DEPLETED — ${statusDetail}. User will pay gas.`);
            break;
        case "LOW_LIMIT":
            console.log(`   ⚠️  LOW LIMIT — ${statusDetail}. Tx may be REJECTED.`);
            break;
        default:
            console.log(`   ❔ UNKNOWN — ${status}`);
    }

    // Check user balance for context
    const userBalance = await provider.getBalance(user.address);
    console.log(`   💰 User Balance: ${ethers.formatEther(userBalance)} ETH`);

    // Extract granter address for balance tracking
    let granterAddress: string | null = null;
    if (statusType === "GRANTED" || statusType === "LOW_LIMIT") {
        const granterMatch = status.match(/granter=(0x[0-9a-fA-F]+)/);
        if (granterMatch) granterAddress = granterMatch[1];
    }

    // Capture balances BEFORE
    const userBalBefore = await provider.getBalance(user.address);
    const granterBalBefore = granterAddress ? await provider.getBalance(granterAddress) : 0n;

    // 3. Stress Test Loop
    console.log("\n🚀 Starting Massive inc() Loop...");
    const userCounter = new ethers.Contract(counterAddress, counterArtifact.abi, user);

    let nonce = await provider.getTransactionCount(user.address, "latest");
    console.log(`Starting Nonce: ${nonce}`);

    const startTime = Date.now();
    const duration = parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || "60") * 1000;
    const endTime = startTime + duration;

    let sent = 0;
    let errors = 0;

    while (Date.now() < endTime) {
        process.stdout.write(`\rSending Nonce ${nonce} (Sent: ${sent}, Errors: ${errors})... `);

        try {
            await userCounter.inc({
                nonce: nonce,
                gasLimit: 100000,
                gasPrice: gasPrice
            });
            sent++;
            nonce++;
            process.stdout.write("✅");
        } catch (e: any) {
            const msg = e.message || "Unknown";
            process.stdout.write(`❌ ${msg.substring(0, 40)}`);
            if (msg.includes("nonce") || msg.includes("replacement")) {
                const newNonce = await provider.getTransactionCount(user.address, "latest");
                if (newNonce > nonce) nonce = newNonce;
            }
            errors++;
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Capture balances AFTER
    const userBalAfter = await provider.getBalance(user.address);
    const granterBalAfter = granterAddress ? await provider.getBalance(granterAddress) : 0n;

    const userDiff = userBalBefore - userBalAfter;
    const granterDiff = granterBalBefore - granterBalAfter;

    console.log("\n\n🏁 Benchmark Complete");
    console.log(`⏱  Duration: ${elapsed}s`);
    console.log(`📤 Sent: ${sent}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Rate: ${(sent / parseFloat(elapsed)).toFixed(1)} tx/s`);
    console.log(`🔑 Grant Status: ${statusType}`);
    console.log(`\n💰 Balance Changes:`);
    console.log(`   User:    ${ethers.formatEther(userBalBefore)} → ${ethers.formatEther(userBalAfter)} (${userDiff >= 0n ? "-" : "+"}${ethers.formatEther(userDiff >= 0n ? userDiff : -userDiff)} ETH)`);
    if (granterAddress) {
        console.log(`   Granter: ${ethers.formatEther(granterBalBefore)} → ${ethers.formatEther(granterBalAfter)} (${granterDiff >= 0n ? "-" : "+"}${ethers.formatEther(granterDiff >= 0n ? granterDiff : -granterDiff)} ETH)`);
    }

    // Fee Grant Remaining
    if (grantProgram && grantBefore) {
        console.log(`\n🎫 Fee Grant Remaining:`);
        try {
            const grantAfter = await precompile.grant(user.address, grantProgram);
            const spendBefore = grantBefore.spendLimit;
            const spendAfter = grantAfter.spendLimit;
            const periodBefore = grantBefore.periodCanSpend;
            const periodAfter = grantAfter.periodCanSpend;
            const allowanceType = grantAfter.allowance;

            console.log(`   SpendLimit:      ${ethers.formatEther(spendBefore)} → ${ethers.formatEther(spendAfter)} ETH`);
            if (allowanceType === 2n) {
                console.log(`   PeriodCanSpend:  ${ethers.formatEther(periodBefore)} → ${ethers.formatEther(periodAfter)} ETH`);
                console.log(`   PeriodLimit:     ${ethers.formatEther(grantAfter.periodLimit)} ETH`);
            }
            console.log(`   EndTime:         block ${grantAfter.endTime}`);
            console.log(`   LatestTx:        block ${grantAfter.latestTransaction}`);
        } catch (e: any) {
            console.log(`   ⚠️  Could not read grant details: ${e.message?.substring(0, 60)}`);
        }
    }
}

main().catch(console.error);
