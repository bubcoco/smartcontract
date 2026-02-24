import { ethers, Wallet, Contract } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../.env") });

// Configuration
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const ADMIN_KEY = process.env.ADMIN || process.env.PRIV_KEY;
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

const ABI = [
    "function revokeFeeGrant(address grantee, address program) external returns (bool)",
    "function isGrantedForProgram(address grantee, address program) view returns (bool)",
    "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
];

// Simple argument parser
function parseArgs() {
    const args: any = {};
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg.startsWith('--')) {
            const key = arg.substring(2);
            // Check if next arg is a value or another flag
            const nextArg = process.argv[i + 1];
            if (nextArg && !nextArg.startsWith('--')) {
                args[key] = nextArg;
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

    // Support --recipient, --address, and --grantee for convenience
    const recipient = args.grantee || args.recipient || args.address;
    const program = args.program || ethers.ZeroAddress;

    if (!recipient) {
        console.error("Usage: npx tsx scripts/revoke-grant-fee.ts --grantee <ADDRESS> [--program <ADDRESS>]");
        process.exit(1);
    }

    if (!ADMIN_KEY) {
        console.error("Error: ADMIN or PRIV_KEY not set in .env");
        process.exit(1);
    }

    console.log(`🔌 Connecting to ${RPC_URL}`);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(ADMIN_KEY, provider);
    console.log(`🔑 Admin: ${wallet.address}`);

    const contract = new Contract(GAS_FEE_GRANT_ADDRESS, ABI, wallet);

    // Check if grant exists
    const exists = await contract.isGrantedForProgram(recipient, program);
    if (!exists) {
        console.log(`\n⚠️  No grant found for ${recipient} (program: ${program === ethers.ZeroAddress ? "ALL (0x0)" : program})`);
        console.log(`   Nothing to revoke.`);
        return;
    }

    // Show existing grant details
    try {
        const grantData = await contract.grant(recipient, program);
        console.log(`\n📋 Current Grant:`);
        console.log(`   SpendLimit:     ${ethers.formatEther(grantData.spendLimit)} ETH`);
        console.log(`   PeriodCanSpend: ${ethers.formatEther(grantData.periodCanSpend)} ETH`);
        console.log(`   PeriodLimit:    ${ethers.formatEther(grantData.periodLimit)} ETH`);
        console.log(`   EndTime:        block ${grantData.endTime}`);
    } catch { }

    console.log(`\n🚫 Revoking grant for: ${recipient}`);
    console.log(`   Program: ${program === ethers.ZeroAddress ? "ALL (0x0)" : program}`);

    try {
        const tx = await contract.revokeFeeGrant(recipient, program);
        console.log(`   ⏳ Tx Sent: ${tx.hash}`);
        await tx.wait();
        console.log(`   ✅ Revoked!`);

        // Verify
        const stillExists = await contract.isGrantedForProgram(recipient, program);
        if (!stillExists) {
            console.log(`   ✅ Verified: grant no longer exists`);
        } else {
            console.log(`   ⚠️  Warning: grant still shows as active after revocation`);
        }
    } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
