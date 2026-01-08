/**
 * Deployed Addresses Loader
 * 
 * Loads contract addresses from Hardhat Ignition deployed_addresses.json
 */

import * as fs from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to deployed addresses file
const DEPLOYED_ADDRESSES_PATH = resolve(__dirname, "../ignition/deployments/chain-235/deployed_addresses.json");

// Contract address keys in the deployed_addresses.json
export interface DeployedAddresses {
    memberCard: string | null;
    contractFactory2: string | null;
    token: string | null;
}

/**
 * Load deployed contract addresses from ignition deployments
 * @returns Object with contract addresses, or null values if not found
 */
export function loadDeployedAddresses(): DeployedAddresses {
    const result: DeployedAddresses = {
        memberCard: null,
        contractFactory2: null,
        token: null,
    };

    try {
        if (!fs.existsSync(DEPLOYED_ADDRESSES_PATH)) {
            console.log("⚠️ deployed_addresses.json not found at:", DEPLOYED_ADDRESSES_PATH);
            console.log("   Run deploy-all.sh first to deploy contracts.");
            return result;
        }

        const data = fs.readFileSync(DEPLOYED_ADDRESSES_PATH, "utf-8");
        const addresses = JSON.parse(data);

        // Map the keys from deployed_addresses.json to our interface
        result.memberCard = addresses["MemberCardModule#MemberCard"] || null;
        result.contractFactory2 = addresses["ContractFactory2Module#ContractFactory2"] || null;
        result.token = addresses["Token#Gems"] || null;

        console.log("📄 Loaded deployed addresses:");
        if (result.memberCard) console.log(`   MemberCard: ${result.memberCard}`);
        if (result.contractFactory2) console.log(`   ContractFactory2: ${result.contractFactory2}`);
        if (result.token) console.log(`   Token (Gems): ${result.token}`);

        return result;
    } catch (error: any) {
        console.log("⚠️ Error loading deployed addresses:", error.message);
        return result;
    }
}

/**
 * Get a specific contract address
 * @param contractName - Name of the contract to get address for
 * @returns Contract address or null if not found
 */
export function getDeployedAddress(contractName: "memberCard" | "contractFactory2" | "token"): string | null {
    const addresses = loadDeployedAddresses();
    return addresses[contractName];
}
