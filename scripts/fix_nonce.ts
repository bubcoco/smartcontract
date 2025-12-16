import { configDotenv } from "dotenv";
import { ethers } from "ethers";
configDotenv();

async function main() {
    const rpcUrl = "http://localhost:8545"; // Make sure this matches hardhat config
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // List of private keys to check and fix
    const privateKeys = [
        process.env.ADMIN1, // Account 1
        process.env.ADMIN2,  // Account 2
    ];

    for (const pk of privateKeys) {
        const wallet = new ethers.Wallet(pk, provider);
        console.log(`\nProcessing account: ${wallet.address}`);

        try {
            const minedNonce = await provider.getTransactionCount(wallet.address, "latest");
            const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");

            console.log(`- Mined Nonce: ${minedNonce}`);
            console.log(`- Pending Nonce: ${pendingNonce}`);

            if (pendingNonce > minedNonce) {
                const diff = pendingNonce - minedNonce;
                console.log(`- Found ${diff} pending/stuck transactions.`);
                console.log(`- Attempting to clear by replacing with high-gas No-Op transactions...`);

                for (let i = 0; i < diff; i++) {
                    const targetNonce = minedNonce + i;
                    console.log(`  > Clearing nonce ${targetNonce}...`);

                    let success = false;
                    let currentGas = 2000000000000n; // Start at 2000 Gwei
                    let attempts = 0;

                    while (!success && attempts < 5) {
                        try {
                            const txParams = {
                                to: wallet.address,
                                value: 0,
                                nonce: targetNonce,
                                maxFeePerGas: currentGas,
                                maxPriorityFeePerGas: currentGas,
                                data: ethers.hexlify(ethers.randomBytes(32)) // New data each attempt
                            };

                            // console.log(`    Attempt ${attempts+1} with gas ${currentGas}`);
                            const tx = await wallet.sendTransaction(txParams);

                            // Check for confirmation
                            const receipt = await tx.wait(1, 15000); // 15s wait
                            if (receipt) {
                                console.log(`    ✅ Cleared nonce ${targetNonce} in block ${receipt.blockNumber}`);
                                success = true;
                            }
                        } catch (err: any) {
                            if (err?.code === "REPLACEMENT_UNDERPRICED") {
                                console.log(`    ⚠️  Underpriced. Bumping gas...`);
                                currentGas = (currentGas * 15n) / 10n; // Increase by 50%
                            } else if (err?.code === "TIMEOUT") {
                                console.log(`    ⚠️  Timeout waiting for mine. Retrying...`);
                                // Do not bump gas necessarily, but might be needed.
                                currentGas = (currentGas * 12n) / 10n; // Increase by 20%
                            } else if (err?.info?.error?.message === "Known transaction") {
                                console.log(`    ⚠️  Known transaction (pool has it). Waiting...`);
                                await new Promise(r => setTimeout(r, 2000));
                                // Try to fetch receipt manually just in case
                                // If likely mined, we might just break, but better to overwrite to be sure.
                                currentGas = (currentGas * 12n) / 10n;
                            } else {
                                console.log(`    ❌ Error: ${err.message}. Retrying...`);
                                currentGas = (currentGas * 12n) / 10n;
                            }
                        }
                        attempts++;
                    }
                    if (!success) {
                        console.log(`    ❌ Failed to clear nonce ${targetNonce} after 5 attempts.`);
                    }
                }
            } else {
                console.log(`- No stuck transactions found (Pending == Mined).`);
            }
        } catch (error: any) {
            console.error(`Error processing account ${wallet.address}:`, error.message);
        }
    }
    console.log("\nDone.");
}

main().catch(console.error);
