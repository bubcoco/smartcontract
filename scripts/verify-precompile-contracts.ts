import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

/**
 * Script to verify all precompile wrapper contracts on the block explorer
 * 
 * Usage:
 *   npx tsx scripts/verify-precompile-contracts.ts
 * 
 * Prerequisites:
 *   - Contracts must be deployed first using Ignition
 *   - Deployment artifacts must exist in ignition/deployments/<network>/
 */

interface DeployedAddresses {
    [key: string]: string;
}

// Contract names to verify
const PRECOMPILE_CONTRACTS = [
    "PrecompileNativeMinter",
    "PrecompileRegistry",
    "PrecompileGasPrice",
    "PrecompileRevenueRatio",
    "PrecompileTreasury",
    "PrecompileGasFeeGrant",
    "PrecompileController"
];

async function getDeployedAddresses(networkName: string): Promise<DeployedAddresses> {
    const deploymentPath = path.join(
        process.cwd(),
        "ignition",
        "deployments",
        `chain-${networkName === 'loaffinity' ? '235' : networkName}`,
        "deployed_addresses.json"
    );

    // Try alternative path format
    const altDeploymentPath = path.join(
        process.cwd(),
        "ignition",
        "deployments",
        networkName,
        "deployed_addresses.json"
    );

    let addresses: DeployedAddresses = {};

    if (fs.existsSync(deploymentPath)) {
        const data = fs.readFileSync(deploymentPath, "utf-8");
        addresses = JSON.parse(data);
    } else if (fs.existsSync(altDeploymentPath)) {
        const data = fs.readFileSync(altDeploymentPath, "utf-8");
        addresses = JSON.parse(data);
    } else {
        console.log("No deployment file found. Checking for PrecompileAllModule...");

        // Try to find any deployment folder
        const deploymentsDir = path.join(process.cwd(), "ignition", "deployments");
        if (fs.existsSync(deploymentsDir)) {
            const folders = fs.readdirSync(deploymentsDir);
            console.log("Available deployment folders:", folders);

            for (const folder of folders) {
                const checkPath = path.join(deploymentsDir, folder, "deployed_addresses.json");
                if (fs.existsSync(checkPath)) {
                    const data = fs.readFileSync(checkPath, "utf-8");
                    const deployedAddrs = JSON.parse(data);
                    // Merge addresses
                    addresses = { ...addresses, ...deployedAddrs };
                }
            }
        }
    }

    return addresses;
}

function findContractAddress(addresses: DeployedAddresses, contractName: string): string | null {
    // Look for the contract in various module formats
    const patterns = [
        `PrecompileAllModule#${contractName}`,
        `${contractName}Module#${contractName.charAt(0).toLowerCase() + contractName.slice(1)}`,
        `${contractName}Module#${contractName}`,
        contractName
    ];

    for (const pattern of patterns) {
        for (const [key, value] of Object.entries(addresses)) {
            if (key.includes(contractName) || key === pattern) {
                return value;
            }
        }
    }

    return null;
}

async function verifyContract(contractName: string, contractAddress: string, networkName: string): Promise<boolean> {
    console.log(`\n📝 Verifying ${contractName} at ${contractAddress}...`);

    try {
        const command = `npx hardhat verify --network ${networkName} ${contractAddress}`;
        console.log(`   Running: ${command}`);

        const { stdout, stderr } = await execAsync(command, {
            cwd: process.cwd(),
            timeout: 60000 // 60 second timeout
        });

        if (stdout) console.log(stdout);

        if (stdout.includes("verified successfully") || stdout.includes("Already Verified") || stdout.includes("already verified")) {
            console.log(`✅ ${contractName} verified successfully!`);
            return true;
        }

        if (stderr && !stderr.includes("WARNING")) {
            console.error(stderr);
        }

        return true;
    } catch (error: any) {
        const output = error.stdout || error.message || "";
        if (output.includes("Already Verified") || output.includes("already verified") || output.includes("verified successfully")) {
            console.log(`✅ ${contractName} is already verified.`);
            return true;
        }
        console.error(`❌ Failed to verify ${contractName}: ${error.message}`);
        if (error.stdout) console.log(error.stdout);
        if (error.stderr) console.error(error.stderr);
        return false;
    }
}

async function main() {
    console.log("🔍 Starting verification of precompile wrapper contracts...\n");

    const networkName = process.argv[2] || "loaffinity";
    console.log(`Network: ${networkName}`);

    // Get deployed addresses
    const addresses = await getDeployedAddresses(networkName);

    if (Object.keys(addresses).length === 0) {
        console.log("\n⚠️  No deployed contracts found.");
        console.log("Please deploy contracts first using:");
        console.log("  npx hardhat ignition deploy ignition/modules/PrecompileAll.ts --network loaffinity");
        return;
    }

    console.log("\n📋 Found deployed addresses:");
    for (const [key, value] of Object.entries(addresses)) {
        console.log(`   ${key}: ${value}`);
    }

    // Verify each contract
    const results: { contract: string; status: string; address: string | null }[] = [];

    for (const contractName of PRECOMPILE_CONTRACTS) {
        const address = findContractAddress(addresses, contractName);

        if (address) {
            const success = await verifyContract(contractName, address, networkName);
            results.push({
                contract: contractName,
                status: success ? "✅ Verified" : "❌ Failed",
                address
            });
        } else {
            console.log(`\n⚠️  ${contractName} not found in deployments, skipping...`);
            results.push({
                contract: contractName,
                status: "⏭️  Skipped (not deployed)",
                address: null
            });
        }
    }

    // Print summary
    console.log("\n" + "═".repeat(70));
    console.log("📊 VERIFICATION SUMMARY");
    console.log("═".repeat(70));

    for (const result of results) {
        const addressStr = result.address ? ` (${result.address})` : "";
        console.log(`${result.status} ${result.contract}${addressStr}`);
    }

    const verified = results.filter(r => r.status.includes("Verified")).length;
    const failed = results.filter(r => r.status.includes("Failed")).length;
    const skipped = results.filter(r => r.status.includes("Skipped")).length;

    console.log("\n" + "─".repeat(70));
    console.log(`Total: ${verified} verified, ${failed} failed, ${skipped} skipped`);
    console.log("═".repeat(70));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
