import { readFileSync } from "fs";
import { execSync } from "child_process";

const CONTRACT_ADDRESS = "0xf9c1bBf0F185F795E0A5305bAFB08E8D40941361";

// Flatten
execSync("npx hardhat flatten contracts/Token.sol > Token-temp.sol");

let source = readFileSync("Token-temp.sol", "utf8");
const lines = source.split('\n');
let spdxFound = false;
source = lines.filter(line => {
  if (line.includes('SPDX-License-Identifier')) {
    if (spdxFound) return false;
    spdxFound = true;
  }
  return true;
}).join('\n');

const constructorArgs = "00000000000000000000000000000000000000000000000000000000004c4b40";

// Try different combinations
const combinations = [
  { evm: "cancun", opt: true, runs: 200 },
  { evm: "shanghai", opt: true, runs: 200 },
  { evm: "paris", opt: true, runs: 200 },
  { evm: "london", opt: true, runs: 200 },
  { evm: "cancun", opt: false, runs: 200 },
  { evm: "shanghai", opt: false, runs: 200 },
];

console.log("Trying different compiler combinations...\n");

async function tryVerification(config) {
  const data = {
    addressHash: CONTRACT_ADDRESS,
    name: "Token",
    compilerVersion: "v0.8.28+commit.7893614a",
    optimization: config.opt,
    optimizationRuns: config.runs,
    contractSourceCode: source,
    constructorArguments: constructorArgs,
    evmVersion: config.evm,
    autodetectConstructorArguments: false,
  };

  console.log(`Trying: EVM=${config.evm}, Optimization=${config.opt}, Runs=${config.runs}`);

  try {
    const response = await fetch(
      "http://localhost:4000/api/v2/smart-contracts/verification/via/flattened-code",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    const result = await response.json();
    
    if (response.ok && !result.message?.includes("fail")) {
      console.log("✅ SUCCESS!", JSON.stringify(result, null, 2));
      return true;
    } else {
      console.log("❌ Failed:", result.message || "Unknown error");
    }
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
  
  return false;
}

(async () => {
  for (const config of combinations) {
    const success = await tryVerification(config);
    if (success) {
      console.log(`\n🎉 Contract verified with: EVM=${config.evm}, Opt=${config.opt}`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between attempts
  }
  
  console.log(`\nView at: http://localhost/address/${CONTRACT_ADDRESS}`);
})();