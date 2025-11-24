import hre from "hardhat";

async function main() {
    console.log("HRE keys:", Object.keys(hre));
    const { ethers, run, network } = hre;
    const networkName = network.name;

    console.log(`Deploying to network: ${networkName}`);

    if (!ethers) {
        throw new Error("hre.ethers is missing. Make sure hardhat-ethers is installed and imported in hardhat.config.ts");
    }

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Deploy Token (Gems)
    const initialSupply = ethers.parseEther("1000000"); // 1 million tokens
    console.log("\nDeploying Token (Gems)...");
    const Token = await ethers.getContractFactory("Gems");
    const token = await Token.deploy(initialSupply);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log("Token deployed to:", tokenAddress);

    // 2. Deploy ExpireNFT
    const nftName = "LoaffinityNFT";
    const nftSymbol = "LNFT";
    console.log("\nDeploying ExpireNFT...");
    const ExpireNFT = await ethers.getContractFactory("ExpireNFT");
    const expireNFT = await ExpireNFT.deploy(nftName, nftSymbol);
    await expireNFT.waitForDeployment();
    const expireNFTAddress = await expireNFT.getAddress();
    console.log("ExpireNFT deployed to:", expireNFTAddress);

    // 3. Deploy Marketplace
    const feeRecipient = deployer.address;
    const platformFee = 250; // 2.5%
    console.log("\nDeploying Marketplace...");
    const Marketplace = await ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy(feeRecipient, platformFee);
    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();
    console.log("Marketplace deployed to:", marketplaceAddress);

    // 4. Deploy MemberCard
    console.log("\nDeploying MemberCard...");
    const MemberCard = await ethers.getContractFactory("MemberCard");
    const memberCard = await MemberCard.deploy();
    await memberCard.waitForDeployment();
    const memberCardAddress = await memberCard.getAddress();
    console.log("MemberCard deployed to:", memberCardAddress);

    console.log("\nWaiting for block confirmations before verification...");
    // Wait for 5 confirmations to ensure propagation
    if (networkName !== "hardhat" && networkName !== "localhost") {
        // Helper to wait
        const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        console.log("Waiting 10 seconds...");
        await wait(10000);
    }

    // Verify Contracts
    console.log("\nVerifying contracts...");

    try {
        await run("verify:verify", {
            address: tokenAddress,
            constructorArguments: [initialSupply],
        });
        console.log("Token verified successfully");
    } catch (error: any) {
        console.log("Token verification failed:", error.message);
    }

    try {
        await run("verify:verify", {
            address: expireNFTAddress,
            constructorArguments: [nftName, nftSymbol],
        });
        console.log("ExpireNFT verified successfully");
    } catch (error: any) {
        console.log("ExpireNFT verification failed:", error.message);
    }

    try {
        await run("verify:verify", {
            address: marketplaceAddress,
            constructorArguments: [feeRecipient, platformFee],
        });
        console.log("Marketplace verified successfully");
    } catch (error: any) {
        console.log("Marketplace verification failed:", error.message);
    }

    try {
        await run("verify:verify", {
            address: memberCardAddress,
            constructorArguments: [],
        });
        console.log("MemberCard verified successfully");
    } catch (error: any) {
        console.log("MemberCard verification failed:", error.message);
    }

    console.log("\nDeployment and verification complete!");
    console.log("----------------------------------------------------");
    console.log(`Token:       ${tokenAddress}`);
    console.log(`ExpireNFT:   ${expireNFTAddress}`);
    console.log(`Marketplace: ${marketplaceAddress}`);
    console.log(`MemberCard:  ${memberCardAddress}`);
    console.log("----------------------------------------------------");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
