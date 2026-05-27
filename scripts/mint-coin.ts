import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Script to Mint Native Tokens
 * Usage: npx tsx scripts/mint-coin.ts --amount <eth> --to <address>
 * Minter: Admin (from .env)
 * Precompile Address: 0x0000000000000000000000000000000000001001
 */

const NATIVE_MINTER_PRECOMPILE = "0x0000000000000000000000000000000000001001";

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

    if (!args.amount || !args.to) {
        console.error("Usage: npx tsx scripts/mint-coin.ts --amount <eth> --to <address>");
        process.exit(1);
    }

    const amountEth = args.amount;
    const recipient = args.to;
    const mintAmountWei = ethers.parseEther(amountEth.toString());

    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║                 Mint Native Tokens                                 ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Admin Wallet:  ${wallet.address}`);
    console.log(`🎯 Recipient:     ${recipient}`);
    console.log(`💰 Mint Amount:   ${amountEth} ETH\n`);

    // 2. Prepare Contract
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwner(address initialOwner) returns (bool success, string message)",
        "function mint(address to, uint256 value) returns (bool success, string message)",
        "function totalSupply() view returns (uint256)",
    ];
    const precompile = new ethers.Contract(NATIVE_MINTER_PRECOMPILE, abi, wallet);
    const txOptions = { gasLimit: 500000n, gasPrice: ethers.parseUnits("1000", "gwei") };

    // 3. Check Initialization Status
    let isInitialized = await precompile.initialized();
    if (!isInitialized) {
        console.log(`⏳ Precompile not initialized. Initializing with owner...`);
        try {
            const initTx = await precompile.initializeOwner(wallet.address, txOptions);
            await initTx.wait(1);
            console.log(`✅ Initialized successfully.\n`);
        } catch (e: any) {
            console.log(`❌ Init failed: ${e.shortMessage || e.message}`);
            return;
        }
    }

    const owner = await precompile.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`⚠️  Warning: You are not the owner! Cannot proceed with minting.`);
        console.log(`   Owner: ${owner}`);
        console.log(`   Your wallet: ${wallet.address}`);
        return;
    }

    // 4. Get Balance Before
    const balanceBefore = await provider.getBalance(recipient);
    console.log(`📊 Balance Before: ${ethers.formatEther(balanceBefore)} ETH`);

    // 5. Mint Native Tokens
    console.log(`\n⏳ Minting ${amountEth} ETH to ${recipient}...`);
    try {
        const mintTx = await precompile.mint(recipient, mintAmountWei, txOptions);
        console.log(`📤 TX: ${mintTx.hash}`);

        const receipt = await mintTx.wait(1);
        console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);
    } catch (e: any) {
        console.log(`❌ Mint failed: ${e.shortMessage || e.message}`);
        if (e.info?.error?.message) {
            console.log(`   Details: ${e.info.error.message}`);
        }
        return;
    }

    // 6. Verify Balance After
    const balanceAfter = await provider.getBalance(recipient);
    const balanceChange = balanceAfter - balanceBefore;

    console.log(`\n📊 Balance After:  ${ethers.formatEther(balanceAfter)} ETH`);

    // Note: if the admin mints to themselves, the balance change will be (mintAmount - gasCost)
    if (wallet.address.toLowerCase() === recipient.toLowerCase()) {
        console.log(`   Change:         +${ethers.formatEther(balanceChange)} ETH (includes gas fees deducted)`);
    } else {
        console.log(`   Change:         +${ethers.formatEther(balanceChange)} ETH`);
    }

    if (balanceChange > 0n) {
        console.log(`\n🎉 Successfully minted tokens!`);
    } else {
        console.log(`\n❌ Balance did not increase! Transaction may have failed silently.`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
