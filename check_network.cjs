
const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");

    try {
        const blockNumber = await provider.getBlockNumber();
        console.log("Current Block Number:", blockNumber);

        const feeData = await provider.getFeeData();
        console.log("Gas Price:", feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, "gwei") : "null", "gwei");

        const network = await provider.getNetwork();
        console.log("Chain ID:", network.chainId);

        const pendingCount = await provider.getTransactionCount("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "pending"); // Default hardhat account 0
        const latestCount = await provider.getTransactionCount("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "latest");
        console.log("Pending Nonce:", pendingCount);
        console.log("Latest Nonce:", latestCount);
        console.log("Pending Txs:", pendingCount - latestCount);

    } catch (error) {
        console.error("Error connecting to network:", error);
    }
}

main();
