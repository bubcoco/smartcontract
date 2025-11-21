import { ethers } from "ethers";
import hre from "hardhat";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
const result = dotenv.config({ path: envPath });

async function main() {
    const url = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(url);
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("PRIV_KEY not found in env");
    }
    const signer = new ethers.Wallet(privateKey, provider);

    console.log("Deploying ContractFactory2 with the account:", await signer.getAddress());

    const artifact = await hre.artifacts.readArtifact("ContractFactory2");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);

    const contract = await factory.deploy();

    console.log("ContractFactory2 deployment transaction sent:", contract.deploymentTransaction()?.hash);

    await contract.waitForDeployment();

    console.log("ContractFactory2 deployed to:", await contract.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
