import { ethers } from "ethers";

async function main() {
    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const block = await provider.getBlock("latest");
    console.log("Block Gas Limit:", block?.gasLimit.toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
