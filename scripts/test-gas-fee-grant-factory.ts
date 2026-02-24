import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test GasFeeGrant Precompile with ContractFactory2
 * Precompile Address: 0x0000000000000000000000000000000000001006
 * Target Contract: 0x1211d530a993A1a8B7C379A5363122c8091fA193 (ContractFactory2)
 */

const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";
import fs from "fs";

const ADDRESSES_PATH = resolve(__dirname, "../deployed-addresses.json");
if (!fs.existsSync(ADDRESSES_PATH)) {
    throw new Error(`Addresses file not found at ${ADDRESSES_PATH}. Run deployment script first.`);
}
const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
const CONTRACT_FACTORY_ADDRESS = addresses.ContractFactory2;

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║         Test GasFeeGrant Precompile (ContractFactory2)             ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // 1. Setup Provider & Wallet
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Admin Wallet: ${wallet.address}`);
    console.log(`📄 Precompile: ${GAS_FEE_GRANT_ADDRESS}`);
    console.log(`🏭 Target Program: ${CONTRACT_FACTORY_ADDRESS}\n`);

    // 2. Define ABIs
    const precompileAbi = [
        "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
        "function revokeFeeGrant(address grantee, address program) returns (bool)",
        "function isGrantedForProgram(address grantee, address program) view returns (bool)"
    ];

    const factoryAbi = [
        "function createERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, address to) external returns (address)"
    ];

    const precompile = new ethers.Contract(GAS_FEE_GRANT_ADDRESS, precompileAbi, wallet);

    // 3. Create a Grantee (Fresh Wallet with 0 ETH)
    console.log("🎁 Preparing Grantee...");
    const granteeWallet = ethers.Wallet.createRandom().connect(provider);
    const grantee = granteeWallet.address;
    console.log(`   Fresh Grantee: ${grantee}`);

    const balance = await provider.getBalance(grantee);
    console.log(`   Grantee Balance: ${ethers.formatEther(balance)} ETH (Must be 0)`);
    if (balance > 0n) {
        console.log("   ❌ Grantee has funds. Test requires 0 balance.");
        return;
    }

    // 4. Create Grant
    console.log("\n🚀 Creating Grant...");
    const granter = wallet.address;
    const spendLimit = ethers.parseEther("1000");
    const period = 3600;
    const periodLimit = ethers.parseEther("1000");
    const endTime = Math.floor(Date.now() / 1000) + 86400;

    try {
        const tx = await precompile.setFeeGrant(
            granter,
            grantee,
            CONTRACT_FACTORY_ADDRESS,
            spendLimit,
            period,
            periodLimit,
            endTime
        );
        console.log(`   ⏳ Sending setFeeGrant tx...`);
        await tx.wait(1);
        console.log(`   ✅ Grant created!`);
    } catch (e: any) {
        console.log(`   ❌ Error creating grant: ${e.message}`);
        return;
    }

    // 5. Verify Grant
    const isGranted = await precompile.isGrantedForProgram(grantee, CONTRACT_FACTORY_ADDRESS);
    console.log(`   isGrantedForProgram: ${isGranted}`);
    if (!isGranted) {
        console.log("   ❌ Grant verification failed.");
        return;
    }

    // 6. Execute Zero-Fee Transaction
    console.log("\n💸 Executing Zero-Fee Transaction (createERC20)...");
    const factoryAsGrantee = new ethers.Contract(CONTRACT_FACTORY_ADDRESS, factoryAbi, granteeWallet);
    const granterBalanceBefore = await provider.getBalance(granter);
    console.log(`   Initial Granter Balance: ${ethers.formatEther(granterBalanceBefore)} ETH`);

    try {
        const minGasPrice = ethers.parseUnits("100000", "gwei");
        console.log(`   Gas Price: ${ethers.formatUnits(minGasPrice, "gwei")} Gwei`);

        const tx = await factoryAsGrantee.createERC20(
            "GrantToken",
            "GTK",
            18,
            1000,
            grantee,
            {
                gasPrice: minGasPrice,
                gasLimit: 5000000 // Higher limit for factory call
            }
        );
        console.log(`   ⏳ Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait(1);
        console.log(`   ✅ Transaction mined in block ${receipt.blockNumber}`);

        const balanceAfter = await provider.getBalance(grantee);
        console.log(`   Grantee Balance After: ${ethers.formatEther(balanceAfter)} ETH`);

        const granterBalanceAfter = await provider.getBalance(granter);
        console.log(`   Final Granter Balance: ${ethers.formatEther(granterBalanceAfter)} ETH`);
        const diff = granterBalanceBefore - granterBalanceAfter;
        console.log(`   Granter Balance Diff: ${ethers.formatEther(diff)} ETH`);

        if (balanceAfter === 0n) {
            console.log("   ✅ SUCCESS: Zero fee execution verified!");
        } else {
            console.log("   ⚠️  WARNING: Balance changed!");
        }

    } catch (e: any) {
        console.log(`   ❌ Transaction failed: ${e.message}`);
    }

    // 7. Cleanup (Revoke)
    console.log("\n🧹 Cleaning up...");
    try {
        const tx = await precompile.revokeFeeGrant(grantee, CONTRACT_FACTORY_ADDRESS);
        await tx.wait(1);
        console.log("   ✅ Grant revoked.");
    } catch (e: any) {
        console.log(`   ❌ cleanup failed: ${e.message}`);
    }
}

main().catch(console.error);
