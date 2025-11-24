import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = process.argv[2];

if (!CONTRACT_ADDRESS) {
  console.error("Usage: node verify-simple.js CONTRACT_ADDRESS");
  process.exit(1);
}

console.log("Verifying contract:", CONTRACT_ADDRESS);

// Flatten
console.log("Flattening...");
execSync("npx hardhat flatten contracts/Token.sol > Token-flattened.sol");

// Read and clean
let source = readFileSync("Token-flattened.sol", "utf8");
const lines = source.split('\n');
let spdxFound = false;
source = lines.filter(line => {
  if (line.includes('SPDX-License-Identifier')) {
    if (spdxFound) return false;
    spdxFound = true;
  }
  return true;
}).join('\n');

writeFileSync("Token-flattened-clean.sol", source);

// Encode constructor
const constructorArgs = ethers.AbiCoder.defaultAbiCoder()
  .encode(["uint256"], [5000000])
  .slice(2);

console.log("Constructor:", constructorArgs);

// Verify
const data = {
  addressHash: CONTRACT_ADDRESS,
  name: "Token",
  compilerVersion: "v0.8.28+commit.7893614a",
  optimization: true,
  optimizationRuns: 200,
  contractSourceCode: source,
  constructorArguments: constructorArgs,
  evmVersion: "cancun",
  autodetectConstructorArguments: false,
};

console.log("Submitting to Blockscout...");

fetch("http://localhost:4000/api/v1/smart-contracts/verification/via/flattened-code", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
})
.then(res => res.json())
.then(result => {
  console.log("Response:", JSON.stringify(result, null, 2));
  console.log(`\nView at: http://localhost/address/${CONTRACT_ADDRESS}`);
})
.catch(err => console.error("Error:", err));