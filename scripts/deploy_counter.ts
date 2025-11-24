import { ethers } from "ethers";
import { artifacts } from "hardhat";

async function main() {
    const rpcUrl = "http://localhost:8545";
    const privateKey = "0f7583c81b2ddcdda03f56ff0d522551926e1a882e66b74b72b8e4bb3b0ed69c";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deploying Counter with account:", wallet.address);

    const artifact = await artifacts.readArtifact("Counter");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const counter = await factory.deploy({ gasLimit: 4000000 });

    console.log("Tx hash:", counter.deploymentTransaction()?.hash);

    await counter.waitForDeployment();

    console.log("Counter deployed to:", await counter.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
