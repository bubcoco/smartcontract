import hre from "hardhat";

async function main() {
  console.log("=== Testing Precompiled Contracts ===\n");

  const [signer] = await hre.network.provider.request({
    method: "eth_accounts",
    params: []
  });

  // Deploy test contract
  console.log("Deploying PrecompileTest contract...");
  const PrecompileTest = await hre.ethers.getContractFactory("PrecompileTest");
  const test = await PrecompileTest.deploy();
  await test.waitForDeployment();
  const address = await test.getAddress();
  console.log("Deployed at:", address, "\n");

  // Test SHA256
  console.log("1. Testing SHA256 (0x02)...");
  const sha256Result = await test.testSHA256(
    hre.ethers.toUtf8Bytes("Hello, World!")
  );
  console.log("Input: 'Hello, World!'");
  console.log("Result:", sha256Result);
  console.log("Expected:", hre.ethers.sha256(hre.ethers.toUtf8Bytes("Hello, World!")));
  console.log("Match:", sha256Result === hre.ethers.sha256(hre.ethers.toUtf8Bytes("Hello, World!")));

  // Test RIPEMD160
  console.log("\n2. Testing RIPEMD160 (0x03)...");
  const ripemdResult = await test.testRIPEMD160(
    hre.ethers.toUtf8Bytes("test")
  );
  console.log("Input: 'test'");
  console.log("Result:", ripemdResult);

  // Test Identity
  console.log("\n3. Testing Identity (0x04)...");
  const testData = hre.ethers.toUtf8Bytes("Copy this data");
  const identityResult = await test.testIdentity(testData);
  console.log("Input:", hre.ethers.toUtf8String(testData));
  console.log("Output:", hre.ethers.toUtf8String(identityResult));
  console.log("Match:", hre.ethers.hexlify(testData) === hre.ethers.hexlify(identityResult));

  // Test ModExp
  console.log("\n4. Testing ModExp (0x05)...");
  const base = 3n;
  const exponent = 4n;
  const modulus = 5n;
  const modExpResult = await test.testModExp(base, exponent, modulus);
  console.log(`${base}^${exponent} mod ${modulus} = ${modExpResult}`);
  console.log("Expected:", (base ** exponent) % modulus);
  console.log("Match:", modExpResult === (base ** exponent) % modulus);

  // Test ecRecover
  console.log("\n5. Testing ecRecover (0x01)...");
  const message = "Hello Ethereum";
  const messageHash = hre.ethers.solidityPackedKeccak256(["string"], [message]);
  
  // Create a signature (you'll need a real signature here)
  console.log("Message:", message);
  console.log("Hash:", messageHash);
  console.log("(Note: Need real signature to test recovery)");

  console.log("\n✅ Precompile tests completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });