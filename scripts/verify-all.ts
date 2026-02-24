import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CHAIN_ID = 235;
const NETWORK = 'loaffinity';
const DEPLOYMENT_PATH = path.resolve(__dirname, `../ignition/deployments/chain-${CHAIN_ID}/deployed_addresses.json`);
const TARGET_ADDRESSES_PATH = path.resolve(__dirname, '../deployed-addresses.json');

async function main() {
    console.log("🚀 Starting Verification Suite...");

    // 1. Deploy DevEnvironment
    console.log("\n📡 Deploying DevEnvironment module...");
    try {
        // Use --reset to ensure fresh deployment for verification
        execSync(`yes | npx hardhat ignition deploy ignition/modules/DevEnvironment.ts --network ${NETWORK} --reset`, { stdio: 'inherit' });
    } catch (e) {
        console.error("❌ Deployment failed!");
        process.exit(1);
    }

    // 2. Update deployed-addresses.json
    console.log("\n📝 Updating deployed-addresses.json...");
    if (!fs.existsSync(DEPLOYMENT_PATH)) {
        console.error(`❌ Deployment file not found at ${DEPLOYMENT_PATH}`);
        process.exit(1);
    }

    const ignitionAddresses = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));
    const mappedAddresses = {
        MockTHB: ignitionAddresses["DevEnvironmentModule#MockTHB"],
        MockCoupon: ignitionAddresses["DevEnvironmentModule#MockCoupon"],
        MockVault: ignitionAddresses["DevEnvironmentModule#MockVault"],
        Marketplace: ignitionAddresses["DevEnvironmentModule#Marketplace"],
        ContractFactory2: ignitionAddresses["DevEnvironmentModule#ContractFactory2"]
    };

    fs.writeFileSync(TARGET_ADDRESSES_PATH, JSON.stringify(mappedAddresses, null, 2));
    console.log("✅ Addresses updated:", mappedAddresses);

    // 3. Run Verification Scripts
    console.log("\n🧪 Running Verification Scripts...");

    const scripts = [
        { name: "Native Minter", cmd: "npx ts-node scripts/test-native-minter1.ts" },
        { name: "Fee Grant (Zero-Fee Tx)", cmd: "npx ts-node scripts/test-gas-fee-grant-factory.ts" },
        { name: "Marketplace Lifestyle (End-to-End)", cmd: "node scripts/test-lifecycle-manual.cjs" }
    ];

    for (const script of scripts) {
        console.log(`\n▶️  Running ${script.name}...`);
        try {
            execSync(script.cmd, { stdio: 'inherit' });
            console.log(`✅ ${script.name} Passed`);
        } catch (e) {
            console.error(`❌ ${script.name} Failed`);
            // Continue or exit? Let's continue to see full results
        }
    }

    console.log("\n✨ Verification Suite Complete!");
}

main().catch(console.error);
