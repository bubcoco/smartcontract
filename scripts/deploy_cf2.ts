import hre from "hardhat";
const { ethers } = hre;

async function main() {
    console.log("Deploying ContractFactory2...");

    const ContractFactory2 = await ethers.getContractFactory("ContractFactory2");

    // Check bytecode size
    const bytecode = ContractFactory2.bytecode;
    console.log(`Bytecode length: ${bytecode.length}`);
    console.log(`Bytecode size (bytes): ${bytecode.length / 2 - 1}`);

    // Estimate gas
    try {
        const deployTransaction = await ContractFactory2.getDeployTransaction();
        const estimatedGas = await ethers.provider.estimateGas(deployTransaction);
        console.log(`Estimated gas: ${estimatedGas.toString()}`);

        // Deploy with override
        const contract = await ContractFactory2.deploy({
            gasLimit: 15000000 // Try a very high limit
        });
        await contract.waitForDeployment();

        console.log("ContractFactory2 deployed to:", await contract.getAddress());
    } catch (error) {
        console.error("Deployment failed:", error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
