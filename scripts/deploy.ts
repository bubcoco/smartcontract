import { ethers } from "hardhat";

async function main() {
  console.log("Deploying MemberCard contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const MemberCard = await ethers.getContractFactory("MemberCard");
  const memberCard = await MemberCard.deploy();
  
  await memberCard.waitForDeployment();
  const address = await memberCard.getAddress();

  console.log("MemberCard deployed to:", address);
  console.log("Owner:", await memberCard.owner());
  console.log("Max stamps:", await memberCard.MAX_STAMPS());

  // Verify on Etherscan (if not local network)
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 31337n && network.chainId !== 1337n) {
    console.log("\nWaiting for block confirmations...");
    await memberCard.deploymentTransaction()?.wait(6);
    
    console.log("\nVerifying contract on Etherscan...");
    console.log("Run: npx hardhat verify --network", network.name, address);
  }

  return address;
}

main()
  .then((address) => {
    console.log("\n✅ Deployment successful!");
    console.log("Contract address:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });