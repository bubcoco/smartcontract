import { ethers } from "hardhat";

async function main() {
    console.log("Deploying ContractFactory2...");

    const ContractFactory2 = await ethers.getContractFactory("ContractFactory2");
    const contract = await ContractFactory2.deploy();

    console.log("Deployment transaction sent:", contract.deploymentTransaction()?.hash);

    await contract.waitForDeployment();

    console.log("ContractFactory2 deployed to:", await contract.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
