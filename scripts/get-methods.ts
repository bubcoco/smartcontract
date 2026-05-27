import { ethers } from "hardhat";

// Blockscout API endpoint for the DLT network
const BLOCKSCOUT_API = "https://loafscoutevm-dev.adldigitalservice.com/api";

const TARGET_CONTRACTS = [
  "0x6A98B96A8425E57fcA5fC2587C6F015F92E91d53",
  "0xcA70e13402340193805723Ee4a3eCBf587D30Fd7"
];

async function main() {
  for (const address of TARGET_CONTRACTS) {
    console.log(`\n======================================================`);
    console.log(`Fetching ABI and methods for Contract: ${address}`);
    console.log(`======================================================`);

    try {
      // Fetch ABI from Blockscout
      const url = `${BLOCKSCOUT_API}?module=contract&action=getabi&address=${address}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== "1") {
        console.error(`FAILED to fetch ABI for ${address}: ${data.result}`);
        continue;
      }

      const abi = JSON.parse(data.result);
      
      // Parse ABI to an Interface using ethers
      const iface = new ethers.Interface(abi);

      let methodCount = 0;
      // Interface.fragments contains all defined items (functions, events, errors)
      iface.fragments.forEach((fragment) => {
        // We only want to list functions (methods)
        if (fragment.type === "function") {
          methodCount++;
          // fragment.format("minimal") or ("full") provides a comprehensive signature string
          const fullSignature = fragment.format("full");
          // E.g., 'function transfer(address to, uint256 amount) returns (bool)'
          console.log(`- ${fullSignature}`);
        }
      });

      console.log(`\nTotal methods found for ${address}: ${methodCount}`);
    } catch (err: any) {
      console.error(`Error processing contract ${address}:`, err.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
