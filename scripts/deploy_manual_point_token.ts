import { ethers } from "ethers";
import { artifacts } from "hardhat";

async function main() {
    const rpcUrl = "https://dlp-rpc2-testnet.adldigitalservice.com";
    const privateKey = "9f3d5b4c29b8a7d63a8b7a63dfb0c6c1b8e9a7d63a8b7a63dfb0c6c1b8e9a7d6";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deploying contracts with the account:", wallet.address);

    const latestBlock = await provider.getBlock("latest");
    if (!latestBlock) throw new Error("Could not fetch latest block");
    console.log("Latest block number:", latestBlock.number);
    console.log("Block gas limit:", latestBlock.gasLimit.toString());

    // Get contract artifact
    const artifact = await artifacts.readArtifact("PointToken");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    // Parameters
    const name = "Point Token";
    const symbol = "POINT";
    const initBlockNumber = latestBlock.number;
    const duration = 10;
    const size = 10;
    const safe = false;
    const owner = wallet.address;

    console.log("Deploying PointToken with initBlockNumber:", initBlockNumber);
    // Explicitly set gasPrice to 0 and high gasLimit
    const pointToken = await factory.deploy(
        name,
        symbol,
        initBlockNumber,
        duration,
        size,
        safe,
        owner,
        { gasPrice: 0, gasLimit: 30000000 }
    );

    console.log("Tx hash:", pointToken.deploymentTransaction()?.hash);

    await pointToken.waitForDeployment();

    console.log("PointToken deployed to:", await pointToken.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

