/**
 * Fund User Wallet
 * Transfers native ETH from ADMIN wallet to PRIV_KEY wallet.
 * Usage: npx tsx scripts/fund-user.ts [amount]
 *   Default amount: 10000 ETH
 */

import { ethers, Wallet } from "ethers";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

async function main() {
    const adminKey = process.env.ADMIN;
    const userKey = process.env.PRIV_KEY;
    if (!adminKey) throw new Error("ADMIN not set in .env");
    if (!userKey) throw new Error("PRIV_KEY not set in .env");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const admin = new Wallet(adminKey, provider);
    const user = new Wallet(userKey, provider);

    const amount = process.argv[2] || "10000";
    const value = ethers.parseEther(amount);

    console.log(`💸 Funding User Wallet`);
    console.log(`   From:   ${admin.address} (ADMIN)`);
    console.log(`   To:     ${user.address} (PRIV_KEY)`);
    console.log(`   Amount: ${amount} ETH`);

    const balBefore = await provider.getBalance(user.address);
    console.log(`   Balance before: ${ethers.formatEther(balBefore)} ETH`);

    const tx = await admin.sendTransaction({
        to: user.address,
        value,
        gasLimit: 21000,
        gasPrice: ethers.parseUnits("2000", "gwei"),
    });
    console.log(`   ⏳ Tx: ${tx.hash}`);
    await tx.wait(1);

    const balAfter = await provider.getBalance(user.address);
    console.log(`   ✅ Balance after: ${ethers.formatEther(balAfter)} ETH`);
}

main().catch(err => {
    console.error("❌", err.message);
    process.exit(1);
});
