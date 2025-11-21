import { ethers } from "ethers";
import { artifacts } from "hardhat";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

async function main() {
    const rpcUrl = "http://localhost:8545";
    // Use the key that has funds
    const privateKey = "0f7583c81b2ddcdda03f56ff0d522551926e1a882e66b74b72b8e4bb3b0ed69c";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deploying ContractFactory2 with account:", wallet.address);

    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance));

    const artifact = await artifacts.readArtifact("ContractFactory2");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    // Try with max block gas limit
    const contract = await factory.deploy({ gasLimit: 4700000 });

    console.log("Tx hash:", contract.deploymentTransaction()?.hash);

    await contract.waitForDeployment();

    console.log("ContractFactory2 deployed to:", await contract.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
