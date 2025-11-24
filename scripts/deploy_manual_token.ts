import { ethers } from "ethers";
import hre from "hardhat";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.error("Error loading .env:", result.error);
} else {
    console.log(".env loaded successfully from", envPath);
    console.log("PRIV_KEY exists:", !!process.env.PRIV_KEY);
}

async function main() {
    const url = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(url);
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("PRIV_KEY not found in env");
    }
    const signer = new ethers.Wallet(privateKey, provider);

    console.log("Deploying contracts with the account:", await signer.getAddress());

    const initialSupply = "500000000000000000000000000000000";

    // We need the artifact to get the ABI and Bytecode
    const artifact = await hre.artifacts.readArtifact("Gems");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);

    const token = await factory.deploy(initialSupply);

    console.log("Token deployment transaction sent:", token.deploymentTransaction()?.hash);

    await token.waitForDeployment();

    console.log("Token deployed to:", await token.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
