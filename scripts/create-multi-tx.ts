import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config as dotenvConfig } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: path.resolve(__dirname, "../.env") });

const ADDRESSES_PATH = path.resolve(__dirname, "../deployed-addresses.json");
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║         Test Multi-Transaction Fee Grant (PRIV_KEY)                ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN || process.env.PRIV_KEY;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const adminWallet = new ethers.Wallet(adminKey, provider);

    // Create FRESH Ephemeral Wallet to avoid nonce issues
    const wallet = ethers.Wallet.createRandom().connect(provider);

    // Wait for addresses file if verification script is running
    if (!fs.existsSync(ADDRESSES_PATH)) {
        console.log("Waiting for deployed-addresses.json...");
        // Simple wait logic or throw
        throw new Error(`Addresses file not found at ${ADDRESSES_PATH}. Run deployment script first.`);
    }
    const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
    const CONTRACT_FACTORY_ADDRESS = addresses.ContractFactory2;

    console.log(`👤 Wallet (Grantee): ${wallet.address} (FRESH)`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_ADDRESS}`);
    console.log(`🏭 Target Program: ${CONTRACT_FACTORY_ADDRESS}\n`);

    // 2. Define ABIs
    const precompileAbi = [
        "function isGrantedForProgram(address grantee, address program) view returns (bool)",
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function revokeFeeGrant(address grantee, address program) returns (bool)"
    ];

    const factoryAbi = [
        "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to) external returns (address)"
    ];

    const precompile = new ethers.Contract(GAS_FEE_GRANT_ADDRESS, precompileAbi, adminWallet); // Connect as ADMIN directly
    const factory = new ethers.Contract(CONTRACT_FACTORY_ADDRESS, factoryAbi, wallet);

    // 3. Fund Account
    console.log("💰 Funding fresh account...");
    const fundTx = await adminWallet.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther("1.0")
    });
    await fundTx.wait(1);
    console.log("   ✅ Account funded with 1.0 ETH");

    // 4. Grant Fees
    console.log("🎁 Granting fees...");
    const spendLimit = ethers.parseEther("1000");
    const period = 3600;
    const periodLimit = ethers.parseEther("1000");
    const endTime = Math.floor(Date.now() / 1000) + 86400;

    try {
        const tx = await precompile.setFeeGrant(
            adminWallet.address,
            wallet.address,
            CONTRACT_FACTORY_ADDRESS,
            spendLimit,
            period,
            periodLimit,
            endTime
        );
        await tx.wait(1);
        console.log("   ✅ Grant created successfully.");
    } catch (e: any) {
        console.error("   ❌ Failed to grant fees:", e.message);
        return;
    }

    // 4. Check Initial Balance
    const initialBalance = await provider.getBalance(wallet.address);
    // console.log(`\n💰 Initial Balance: ${ethers.formatEther(initialBalance)} ETH`);

    // 5. Execute Multiple Transactions
    const TX_COUNT = 5;
    console.log(`\n🚀 Executing ${TX_COUNT} transactions...`);

    // Use system gas price (1000 Gwei)
    const systemGasPrice = ethers.parseUnits("1000", "gwei");
    console.log(`   Gas Price Strategy: ${ethers.formatUnits(systemGasPrice, "gwei")} Gwei`);

    for (let i = 0; i < TX_COUNT; i++) {
        process.stdout.write(`   Tx ${i + 1}/${TX_COUNT}: `);
        try {
            // Using auto-estimation for EIP-1559, or fallback to legacy if needed.
            // Since we have fee grant, we just need to satisfy the network minimum.
            const tx = await factory.createERC20(
                `MultiTxToken${i}`,
                `MTK${i}`,
                18,
                1000,
                wallet.address,
                {
                    // Remove gasPrice to let ethers/network decide, OR set maxFee if needed
                    // gasPrice: systemGasPrice, 
                    gasLimit: 5000000
                }
            );
            process.stdout.write(`Sent ${tx.hash.substring(0, 10)}... `);
            const receipt = await tx.wait(1);
            if (receipt.status === 1) {
                process.stdout.write(`✅ Mined (Block ${receipt.blockNumber})\n`);
            } else {
                process.stdout.write(`❌ Failed (Reverted)\n`);
            }
        } catch (e: any) {
            process.stdout.write(`❌ Failed: ${e.message}\n`);
        }
    }

    // 6. Check Final Balance & Diff
    const finalBalance = await provider.getBalance(wallet.address);
    const diff = initialBalance - finalBalance;

    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("📊 Results");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(`   Initial Balance: ${ethers.formatEther(initialBalance)} ETH`);
    console.log(`   Final Balance:   ${ethers.formatEther(finalBalance)} ETH`);

    if (diff === 0n) {
        console.log(`   ✅ DIFF: 0 ETH (Gas covered by Grant)`);
    } else {
        console.log(`   ⚠️  DIFF: -${ethers.formatEther(diff)} ETH (Gas PAID by User)`);
    }

    // 7. Cleanup (Revoke Grant)
    console.log("\n🧹 Cleaning up...");
    try {
        const tx = await precompile.revokeFeeGrant(wallet.address, CONTRACT_FACTORY_ADDRESS);
        await tx.wait(1);
        console.log("   ✅ Grant revoked.");
    } catch (e: any) {
        console.log("   ❌ Failed to revoke grant (or already revoked).");
    }
}

main().catch(console.error);
