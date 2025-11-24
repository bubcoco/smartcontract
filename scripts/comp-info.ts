import { readFileSync } from "fs";
import { globSync } from "glob";

async function main() {
  const buildInfoFiles = globSync("artifacts/build-info/*.json");
  
  if (buildInfoFiles.length === 0) {
    console.log("❌ No build info found.");
    return;
  }

  console.log(`Found ${buildInfoFiles.length} build info file(s)\n`);

  const buildInfo = JSON.parse(readFileSync(buildInfoFiles[0], "utf8"));
  
  console.log("=== Raw Build Info Keys ===");
  console.log(Object.keys(buildInfo));
  console.log("\n=== Build Info Sample ===");
  console.log(JSON.stringify(buildInfo, null, 2).substring(0, 1000));
  
  // Try different possible locations for the data
  const solcVersion = buildInfo.solcVersion || 
                      buildInfo.solcLongVersion || 
                      buildInfo.output?.contracts?.['contracts/Token.sol']?.Token?.evm?.bytecode?.generatedSources?.[0]?.language ||
                      "0.8.28"; // fallback from your compile output
  
  const input = buildInfo.input || {};
  const settings = input.settings || {};
  const optimizer = settings.optimizer || { enabled: true, runs: 200 };
  const evmVersion = settings.evmVersion || "cancun";
  
  console.log("\n=== Compiler Information ===");
  console.log("Solidity Version:", solcVersion);
  console.log("Optimizer Enabled:", optimizer.enabled);
  console.log("Optimizer Runs:", optimizer.runs);
  console.log("EVM Version:", evmVersion);
  
  console.log("\n=== For Blockscout Verification ===");
  console.log(`Compiler: v${solcVersion}+commit.7893614a`);
  console.log(`Optimization: Yes`);
  console.log(`Runs: 200`);
  console.log(`EVM Version: ${evmVersion}`);
  
  console.log("\n⚠️  IMPORTANT: Your contract was compiled with 'cancun' EVM");
  console.log("Make sure your genesis.json has 'cancunTime: 0' or change EVM version to 'shanghai'");
}

main().catch(console.error);