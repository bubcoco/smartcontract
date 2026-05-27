import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: path.resolve(__dirname, "../.env") });

const RPC_URL = "http://localhost:8545";
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

const PRECOMPILE_ABI = [
    "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
    "function revokeFeeGrant(address grantee, address program) returns (bool)",
    "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)"
];

const TX_OVERRIDES = { type: 0, gasPrice: ethers.parseUnits("1000", "gwei") };

async function main() {
    console.log("Starting Investigation...");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminKey = process.env.ADMIN || process.env.PRIV_KEY;
    const admin = new ethers.Wallet(adminKey!, provider);
    const precompile = new ethers.Contract(GAS_FEE_GRANT_ADDRESS, PRECOMPILE_ABI, admin);

    const factoryAddress = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0"; // Generic mock target

    // Helper to fund manually
    const fund = async (wallet: ethers.Wallet, amount: string) => {
        const tx = await admin.sendTransaction({ to: wallet.address, value: ethers.parseEther(amount), ...TX_OVERRIDES });
        await tx.wait(1);
    };

    // 1. Zero-balance sender with active grant
    console.log("\n--- Investigation 1: Zero-Balance Sender with Active Grant ---");
    const zSender = ethers.Wallet.createRandom().connect(provider);
    console.log(`Sender: ${zSender.address}`);
    let spendLimit = ethers.parseEther("1.0");
    await (await precompile.setFeeGrant(admin.address, zSender.address, factoryAddress, spendLimit, 86400, spendLimit, Math.floor(Date.now()/1000) + 86400, TX_OVERRIDES)).wait(1);
    
    try {
        const tx = await zSender.sendTransaction({ to: factoryAddress, data: "0x1234", gasLimit: 100000, ...TX_OVERRIDES });
        await tx.wait(1);
        console.log("✅ Success! Zero-balance sender CAN send transaction with active grant.");
        // Check remaining spend Limit
        const grantData = await precompile.grant(zSender.address, factoryAddress);
        console.log(`Spend limit remaining: ${ethers.formatEther(grantData.spendLimit)} ETH`);
    } catch (e: any) {
        console.log("❌ Failed! Zero-balance sender could not transact. Error:", e.message);
    }

    // 2. Zero-balance sender with EXPIRED grant
    console.log("\n--- Investigation 2: Zero-Balance Sender with Expired Grant ---");
    const zSender2 = ethers.Wallet.createRandom().connect(provider);
    await (await precompile.setFeeGrant(admin.address, zSender2.address, factoryAddress, spendLimit, 86400, spendLimit, 1, TX_OVERRIDES)).wait(1);
    try {
        const tx = await zSender2.sendTransaction({ to: factoryAddress, data: "0x1234", gasLimit: 100000, ...TX_OVERRIDES });
        await tx.wait(1);
        console.log("❌ Success! Should have failed.");
    } catch (e: any) {
        console.log("✅ Failed as expected! Error:", e.shortMessage || e.message);
    }

    // 3. Granter balance threshold test (0.5 ETH)
    console.log("\n--- Investigation 3: Granter with 0.5 ETH Balance ---");
    const poorGranter = ethers.Wallet.createRandom().connect(provider);
    await fund(poorGranter, "0.5");
    const zSender3 = ethers.Wallet.createRandom().connect(provider);

    await (await precompile.setFeeGrant(poorGranter.address, zSender3.address, factoryAddress, spendLimit, 86400, spendLimit, Math.floor(Date.now()/1000) + 86400, TX_OVERRIDES)).wait(1);
    
    try {
        const tx = await zSender3.sendTransaction({ to: factoryAddress, data: "0x1234", gasLimit: 100000, ...TX_OVERRIDES });
        await tx.wait(1);
        console.log("❌ Success! The grant worked even though the granter only has 0.5 ETH.");
    } catch (e: any) {
        console.log("✅ Failed! Granter 0.5 ETH is insufficient. Error:", e.shortMessage || e.message);
    }

}

main().catch(console.error);
