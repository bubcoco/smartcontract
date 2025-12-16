import { ethers } from "ethers";

async function main() {
    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    // Account 0xf17f... (ae6ae...)
    const privateKey = "A2";
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Checking for stuck transactions...");

    const minedNonce = await provider.getTransactionCount(wallet.address); // committed
    const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");

    console.log(`Mined Nonce: ${minedNonce}`);
    console.log(`Pending Nonce: ${pendingNonce}`);

    if (pendingNonce > minedNonce) {
        console.log(`Found ${pendingNonce - minedNonce} pending transactions.`);
        console.log("Attempting to clear stuck transactions by replacing them...");

        const highFee = 300000000000n; // 300 Gwei

        for (let n = minedNonce; n < pendingNonce; n++) {
            try {
                console.log(`Replacing nonce ${n}...`);
                const tx = await wallet.sendTransaction({
                    to: wallet.address,
                    value: 0,
                    nonce: n,
                    maxFeePerGas: highFee,
                    maxPriorityFeePerGas: highFee
                });
                const receipt = await tx.wait(1);
                console.log(`Cleared nonce ${n} in block ${receipt.blockNumber}`);
            } catch (e) {
                console.log(`Failed to replace nonce ${n}:`, e.message);
            }
        }
    } else {
        console.log("No pending gap found. Sending new transactions to mine blocks...");
        // Send 5 new transactions to increment block height
        let currentNonce = minedNonce;
        const highFee = 200000000000n;
        for (let i = 0; i < 5; i++) {
            try {
                const tx = await wallet.sendTransaction({
                    to: wallet.address,
                    value: 0,
                    nonce: currentNonce + i,
                    maxFeePerGas: highFee,
                    maxPriorityFeePerGas: highFee
                });
                await tx.wait(1);
                console.log(`Mined block (new tx) ${(await tx.wait()).blockNumber}`);
            } catch (e) { console.log(e.message); }
        }
    }
}

main().catch(console.error);
