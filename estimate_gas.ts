import hre from "hardhat";
import { network } from "hardhat";

async function main() {
    const artifact = await hre.artifacts.readArtifact("ContractFactory2");
    const bytecode = artifact.bytecode;
    const { ethers } = await network.connect();

    console.log("Estimating gas for deployment...");
    try {
        const gasEstimate = await ethers.provider.send("eth_estimateGas", [{
            data: bytecode
        }]);

        console.log("Estimated Gas:", parseInt(gasEstimate, 16).toString());
    } catch (error) {
        console.error("Gas estimation failed:", error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
