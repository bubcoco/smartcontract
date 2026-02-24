/**
 * Verify Transaction (verify-tx.ts)
 * 
 * Purpose:
 * - Validate basic transaction capability (send ETH to self).
 * - Bypass estimateGas (hardcoded limit) to isolate failures.
 * - Diagnose CALL_EXCEPTION.
 */

import { ethers, Wallet, parseUnits } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PRIVATE_KEY = process.env.PRIV_KEY;

async function main() {
    console.log("🔍 Verifying Basic Transactions...");

    if (!PRIVATE_KEY) throw new Error("❌ PRIV_KEY not set");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    console.log(`👤 Wallet: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

    // Fetch Nonce
    const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
    const minedNonce = await provider.getTransactionCount(wallet.address, "latest");
    console.log(`🔢 Nonce: Mined=${minedNonce}, Pending=${pendingNonce}`);

    // Create TX
    const txRequest = {
        to: wallet.address,
        value: parseUnits("0.0001", "ether"),
        gasLimit: 21000, // Hardcoded standard transfer
        gasPrice: parseUnits("2000", "gwei"), // High price to verify replace/insert
        nonce: minedNonce, // Start from safe ground (mined)
        type: 0 // Legacy
    };

    console.log(`🚀 Sending TX (Nonce: ${txRequest.nonce}, Price: 2000 Gwei)...`);

    try {
        const tx = await wallet.sendTransaction(txRequest);
        console.log(`✅ Sent Hash: ${tx.hash}`);
        console.log("⏳ Waiting for confirmation...");
        const receipt = await tx.wait(1);
        console.log(`✅ Confirmed in block ${receipt?.blockNumber}`);
    } catch (e: any) {
        console.error(`❌ Failed: ${e.message}`);
        if (e.data) console.error(`   Data: ${e.data}`);
        if (e.transaction) console.error(`   Tx: ${JSON.stringify(e.transaction)}`);
    }
}

main().catch(console.error);
