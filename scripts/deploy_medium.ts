import { ethers } from "ethers";
import { artifacts } from "hardhat";

async function main() {
    const rpcUrl = "https://dlp-rpc2-testnet.adldigitalservice.com";
    const privateKey = "9f3d5b4c29b8a7d63a8b7a63dfb0c6c1b8e9a7d63a8b7a63dfb0c6c1b8e9a7d6";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deploying MediumToken with account:", wallet.address);

    const artifact = await artifacts.readArtifact("MediumToken");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const token = await factory.deploy("Medium Token", "MED", wallet.address, { gasPrice: 0, gasLimit: 30000000 });

    console.log("Tx hash:", token.deploymentTransaction()?.hash);

    await token.waitForDeployment();

    console.log("MediumToken deployed to:", await token.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
