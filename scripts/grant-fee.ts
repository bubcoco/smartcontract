
import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Script to Grant Gas Fees
 * Usage: npx tsx scripts/grant-fee.ts --grantee <address> --amount <eth> [--program <address>] [--period <seconds>]
 * Granter: Admin (from .env)
 * Precompile Address: 0x0000000000000000000000000000000000001006
 */

const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

// Simple argument parser
function parseArgs() {
    const args: any = {};
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i].startsWith('--')) {
            const key = process.argv[i].substring(2);
            const value = process.argv[i + 1];
            if (value && !value.startsWith('--')) {
                args[key] = value;
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}

async function main() {
    const args = parseArgs();

    if (!args.grantee || !args.amount) {
        console.error("Usage: npx tsx scripts/grant-fee.ts --grantee <address> --amount <eth> [--program <address>] [--period <seconds>]");
        process.exit(1);
    }

    const grantee = args.grantee;
    const amountEth = args.amount;
    const program = args.program || ethers.ZeroAddress;
    const periodSeconds = args.period ? parseInt(args.period) : 3600 * 24 * 365; // Default 1 year period (effectively unlimited spend/period)

    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║                 Create Gas Fee Grant                               ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Granter (Admin): ${wallet.address}`);
    console.log(`🎁 Grantee:         ${grantee}`);
    console.log(`🏭 Program:         ${program}`);
    console.log(`💰 Amount (Limit):  ${amountEth} ETH`);
    console.log(`⏳ Period:          ${periodSeconds} seconds\n`);

    // 2. Prepare Contract
    const abi = [
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function revokeFeeGrant(address grantee, address program) returns (bool)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
    ];
    const precompile = new ethers.Contract(GAS_FEE_GRANT_ADDRESS, abi, wallet);

    // 3. Check for existing grant — auto-revoke if found
    const existingGrant = await precompile.isGrantedForProgram(grantee, program);
    if (existingGrant) {
        console.log(`   ⚠️  Existing grant found for this grantee+program. Revoking first...`);
        try {
            const grantData = await precompile.grant(grantee, program);
            console.log(`   📋 Old grant: spendLimit=${ethers.formatEther(grantData.spendLimit)} ETH, endTime=block ${grantData.endTime}`);
        } catch { }
        const revokeTx = await precompile.revokeFeeGrant(grantee, program);
        const revokeReceipt = await revokeTx.wait(1);
        console.log(`   🗑️  Revoked in block ${revokeReceipt.blockNumber}\n`);
    }

    // 4. Define Parameters
    const granter = wallet.address;
    const spendLimit = ethers.parseEther(amountEth);
    const period = periodSeconds;
    // Critical: SpendLimit MUST be <= PeriodLimit. Setting PeriodLimit = SpendLimit ensures this.
    const periodLimit = spendLimit;
    const endTime = Math.floor(Date.now() / 1000) + (3600 * 24 * 365 * 10); // 10 years from now (long expiry)

    console.log(`   Detailed Params:`);
    console.log(`     SpendLimit:  ${spendLimit.toString()} wei`);
    console.log(`     PeriodLimit: ${periodLimit.toString()} wei`);
    console.log(`     EndTime:     ${endTime}`);

    // 5. Send Transaction
    try {
        // First, dry-run with staticCall to check return value
        const willSucceed = await precompile.setFeeGrant.staticCall(
            granter, grantee, program, spendLimit, period, periodLimit, endTime
        );
        if (!willSucceed) {
            console.error(`\n❌ setFeeGrant would return FALSE. Possible reasons:`);
            console.error(`   - Grant still exists (revoke may have failed)`);
            console.error(`   - Invalid parameters (spendLimit=0, granter/grantee=0x0)`);
            console.error(`   - spendLimit > periodLimit`);
            process.exit(1);
        }

        console.log(`\n⏳ Sending setFeeGrant transaction...`);
        const tx = await precompile.setFeeGrant(
            granter,
            grantee,
            program,
            spendLimit,
            period,
            periodLimit,
            endTime
        );
        console.log(`   Tx Hash: ${tx.hash}`);
        const receipt = await tx.wait(1);
        console.log(`   ✅ Grant created in block ${receipt.blockNumber}`);

        // 6. Verify
        const isGranted = await precompile.isGrantedForProgram(grantee, program);
        console.log(`   Verification (isGrantedForProgram): ${isGranted}`);

        if (isGranted) {
            const grantData = await precompile.grant(grantee, program);
            console.log(`   📋 New grant: spendLimit=${ethers.formatEther(grantData.spendLimit)} ETH, periodLimit=${ethers.formatEther(grantData.periodLimit)} ETH`);
        }

    } catch (e: any) {
        console.error(`\n❌ Error creating grant: ${e.message}`);
        if (e.data) {
            console.error(`   Revert Data: ${e.data}`);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
