import hre from "hardhat";
import { ethers } from "ethers";
async function main() {
    console.log("Deploying PointFactory...");

    const PointFactory = await hre.ethers.getContractFactory("PointFactory");
    const pointFactory = await PointFactory.deploy();

    await pointFactory.waitForDeployment();

    console.log("PointFactory deployed to:", await pointFactory.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
