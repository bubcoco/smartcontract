import hre from "hardhat";

async function main() {
    console.log("Network:", hre.network.name);

    try {
        // Get latest block
        const block: any = await hre.network.provider.send("eth_getBlockByNumber", ["latest", false]);
        console.log("Block Gas Limit:", parseInt(block.gasLimit, 16).toString());

        // Get gas price
        const gasPrice: any = await hre.network.provider.send("eth_gasPrice", []);
        console.log("Gas Price:", parseInt(gasPrice, 16).toString());
    } catch (error) {
        console.error("Error fetching network data:", error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
