import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Marketplace...");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  // Configuration
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const platformFee = 250; // 2.5%

  console.log(`Fee Recipient: ${feeRecipient}`);
  console.log(`Platform Fee: ${platformFee / 100}%`);

  // Deploy Marketplace
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(feeRecipient, platformFee);
  await marketplace.waitForDeployment();

  const marketplaceAddress = await marketplace.getAddress();
  console.log(`\n✅ Marketplace deployed to: ${marketplaceAddress}`);

  // Add common payment tokens (example for Polygon)
  console.log("\nAdding payment tokens...");

  // USDT
  const usdtAddress = process.env.USDT_ADDRESS || "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // Polygon USDT
  await marketplace.addPaymentToken(
    usdtAddress,
    "USDT",
    ethers.parseUnits("1", 6)
  );
  console.log("✅ Added USDT");

  // WMATIC
  const wmaticAddress = process.env.WMATIC_ADDRESS || "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; // Polygon WMATIC
  await marketplace.addPaymentToken(
    wmaticAddress,
    "WMATIC",
    ethers.parseEther("1")
  );
  console.log("✅ Added WMATIC");

  // USDC
  const usdcAddress = process.env.USDC_ADDRESS || "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // Polygon USDC
  await marketplace.addPaymentToken(
    usdcAddress,
    "USDC",
    ethers.parseUnits("1", 6)
  );
  console.log("✅ Added USDC");

  console.log("\n📋 Deployment Summary:");
  console.log("====================");
  console.log(`Marketplace: ${marketplaceAddress}`);
  console.log(`Owner: ${await marketplace.owner()}`);
  console.log(`Fee Recipient: ${await marketplace.feeRecipient()}`);
  console.log(`Platform Fee: ${await marketplace.platformFee()} basis points`);

  console.log("\n🔍 To verify on block explorer:");
  console.log(`npx hardhat verify --network <network> ${marketplaceAddress} ${feeRecipient} ${platformFee}`);

  // Save deployment info
  const deploymentInfo = {
    marketplace: marketplaceAddress,
    feeRecipient,
    platformFee,
    paymentTokens: {
      usdt: usdtAddress,
      wmatic: wmaticAddress,
      usdc: usdcAddress
    },
    network: (await ethers.provider.getNetwork()).name,
    timestamp: new Date().toISOString()
  };

  console.log("\n📝 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });