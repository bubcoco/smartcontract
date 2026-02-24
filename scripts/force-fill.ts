/**
 * Force Fill Nonce Gap (force-fill.ts)
 * 
 * Purpose:
 * - Identify gap between latest (mined) and pending nonce.
 * - Fill the gap with high-gas transfers to self.
 * - Bypass estimateGas (hardcoded limits).
 * - Resolve "Nonce too distant" errors.
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
    console.log("🛠️  FORCE FILL NONCE GAP");

    if (!PRIVATE_KEY) throw new Error("❌ PRIV_KEY not set");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    console.log(`👤 Wallet: ${wallet.address}`);

    // Get Nonces
    const minedNonce = await provider.getTransactionCount(wallet.address, "latest");
    const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
    console.log(`🔢 Nonce State: Mined=${minedNonce}, Pending=${pendingNonce}`);

    if (minedNonce === pendingNonce) {
        console.log("✅ No gap found. Nonces are synced.");
        return;
    }

    const gap = pendingNonce - minedNonce;
    console.log(`⚠️  GAP DETECTED: ${gap} missed transactions.`);
    console.log(`🚀 Sending ${gap} filler transactions (5000 Gwei)...`);

    // Loop through gap
    for (let i = 0; i < gap; i++) {
        const nonce = minedNonce + i;
        process.stdout.write(`   Sending Nonce ${nonce}... `);

        const txRequest = {
            to: wallet.address,
            value: 0n,
            gasLimit: 21000, // Hardcoded
            gasPrice: parseUnits("5000", "gwei"), // Dominate
            nonce: nonce,
            type: 0
        };

        try {
            const tx = await wallet.sendTransaction(txRequest);
            process.stdout.write(`✅ Hash: ${tx.hash.substring(0, 10)}...\n`);
            // Don't wait for each confirmation (async fill)
        } catch (e: any) {
            process.stdout.write(`❌ Error: ${e.message.substring(0, 50)}\n`);
        }
    }

    console.log("\n⏳ Waiting for mining (1 block)...");
    await new Promise(r => setTimeout(r, 5000));

    const newMined = await provider.getTransactionCount(wallet.address, "latest");
    console.log(`🎉 New Mined Nonce: ${newMined}`);
}

main().catch(console.error);
