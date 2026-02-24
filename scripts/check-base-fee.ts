import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const block = await provider.getBlock("latest");
    if (!block) {
        console.log("Could not get block");
        return;
    }
    console.log(`Block Number: ${block.number}`);
    console.log(`Base Fee: ${block.baseFeePerGas ? ethers.formatUnits(block.baseFeePerGas, "gwei") : "undefined"} Gwei`);
}

main();
