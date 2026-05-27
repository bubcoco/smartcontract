import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Deploy NativeMinterPrecompiled contract to loaffinity network
 */

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║       Deploying NativeMinterPrecompiled Contract               ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // Setup provider and wallet
    const rpcUrl = "http://localhost:8545";
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🔗 Connected to: ${rpcUrl}`);
    console.log(`👤 Deployer address: ${wallet.address}`);

    // Get initial balance and network info
    const balance = await provider.getBalance(wallet.address);
    const network = await provider.getNetwork();
    console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})\n`);

    // Load contract artifact
    const artifactPath = path.join(
        process.cwd(),
        "artifacts/contracts/NativeMinterPrecompile.sol/NativeMinterPrecompiled.json"
    );

    if (!fs.existsSync(artifactPath)) {
        console.error("❌ Contract artifact not found. Please run 'npx hardhat compile' first.");
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abi = artifact.abi;
    const bytecode = artifact.bytecode;

    console.log("📄 Contract artifact loaded successfully");

    // Transaction options
    const txOptions = {
        gasLimit: 2000000n,
        gasPrice: 10000000000000n // 10000 Gwei
    };

    // Deploy contract
    console.log("\n⏳ Deploying NativeMinterPrecompiled contract...");

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(txOptions);

    console.log(`📤 Deployment transaction sent: ${contract.deploymentTransaction()?.hash}`);
    console.log("⏳ Waiting for confirmation...");

    await contract.waitForDeployment();

    const deployedAddress = await contract.getAddress();
    console.log(`\n✅ NativeMinterPrecompiled deployed successfully!`);
    console.log(`📍 Contract address: ${deployedAddress}`);

    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("Deployment Summary");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(`Contract: NativeMinterPrecompiled`);
    console.log(`Address: ${deployedAddress}`);
    console.log(`Network: loaffinity (chainId: ${network.chainId})`);
    console.log(`Deployer: ${wallet.address}`);
    console.log(`\n✨ Deployment complete!`);

    // Output for verification
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("To verify the contract on Blockscout, run:");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(`npx hardhat verify --network loaffinity ${deployedAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
