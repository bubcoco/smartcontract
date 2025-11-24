async function testPrecompiles() {
  const RPC_URL = "http://localhost:8545";

  // Test SHA256 (0x02)
  console.log("Testing SHA256 precompile at 0x02...");
  const sha256Data = Buffer.from("Hello, World!").toString('hex');
  
  const sha256Response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{
        to: "0x0000000000000000000000000000000000000002",
        data: "0x" + sha256Data
      }, "latest"],
      id: 1
    })
  });
  
  const sha256Result = await sha256Response.json();
  console.log("SHA256 Result:", sha256Result.result);

  // Test Identity (0x04)
  console.log("\nTesting Identity precompile at 0x04...");
  const identityData = Buffer.from("Copy me").toString('hex');
  
  const identityResponse = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{
        to: "0x0000000000000000000000000000000000000004",
        data: "0x" + identityData
      }, "latest"],
      id: 2
    })
  });
  
  const identityResult = await identityResponse.json();
  console.log("Identity Result:", identityResult.result);
  console.log("Original Data: 0x" + identityData);
  console.log("Match:", identityResult.result === "0x" + identityData);

  // Test RIPEMD160 (0x03)
  console.log("\nTesting RIPEMD160 precompile at 0x03...");
  const ripemdData = Buffer.from("test").toString('hex');
  
  const ripemdResponse = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{
        to: "0x0000000000000000000000000000000000000003",
        data: "0x" + ripemdData
      }, "latest"],
      id: 3
    })
  });
  
  const ripemdResult = await ripemdResponse.json();
  console.log("RIPEMD160 Result:", ripemdResult.result);
}

testPrecompiles().catch(console.error);