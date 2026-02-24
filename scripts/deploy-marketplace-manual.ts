import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");

async function main() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("PRIV_KEY not found in .env");
    }
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log("Deploying contracts with the account:", wallet.address);

    const loadArtifact = (contractPath: string, name: string) => {
        const artifactPath = path.join(ARTIFACTS_DIR, contractPath, `${name}.json`);
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        return { abi: artifact.abi, bytecode: artifact.bytecode };
    };

    const overrides = {
        gasPrice: 100000000000n // 100 Gwei
    };

    // 1. Deploy MockTHB
    console.log("Deploying MockTHB...");
    const mockTHB = loadArtifact("mocks/MockTHB.sol", "MockTHB");
    const THBFactory = new ethers.ContractFactory(mockTHB.abi, mockTHB.bytecode, wallet);
    const thb = await THBFactory.deploy(overrides);
    await thb.waitForDeployment();
    const thbAddress = await thb.getAddress();
    console.log("MockTHB deployed to:", thbAddress);

    // 2. Deploy MockCoupon
    console.log("Deploying MockCoupon...");
    const mockCoupon = loadArtifact("mocks/MockCoupon.sol", "MockCoupon");
    const CouponFactory = new ethers.ContractFactory(mockCoupon.abi, mockCoupon.bytecode, wallet);
    const coupon = await CouponFactory.deploy(overrides);
    await coupon.waitForDeployment();
    const couponAddress = await coupon.getAddress();
    console.log("MockCoupon deployed to:", couponAddress);

    // 3. Deploy MockVault
    console.log("Deploying MockVault...");
    const mockVault = loadArtifact("mocks/MockVault.sol", "MockVault");
    const VaultFactory = new ethers.ContractFactory(mockVault.abi, mockVault.bytecode, wallet);
    const vault = await VaultFactory.deploy(thbAddress, overrides);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("MockVault deployed to:", vaultAddress);

    // 4. Deploy Marketplace
    console.log("Deploying Marketplace...");
    const marketplaceArtifact = loadArtifact("Marketplace.sol", "Marketplace");
    const MarketplaceFactory = new ethers.ContractFactory(marketplaceArtifact.abi, marketplaceArtifact.bytecode, wallet);
    // Constructor args: thbToken_, couponContract_, vault_
    const marketplace = await MarketplaceFactory.deploy(thbAddress, couponAddress, vaultAddress, overrides);
    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();
    console.log("Marketplace deployed to:", marketplaceAddress);

    const deployedAddresses = {
        MockTHB: thbAddress,
        MockCoupon: couponAddress,
        MockVault: vaultAddress,
        Marketplace: marketplaceAddress,
    };

    console.log("Deployment Complete!");
    console.table(deployedAddresses);

    const addressesPath = path.resolve(__dirname, "../deployed-addresses.json");
    fs.writeFileSync(addressesPath, JSON.stringify(deployedAddresses, null, 2));
    console.log(`Deployed addresses saved to ${addressesPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
