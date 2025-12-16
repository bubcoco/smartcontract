import { ethers } from "ethers";

/**
 * Test script for NativeMinter Precompile at address 0x0000000000000000000000000000000000001001
 * Tests all INativeMinter and IOwnable interface functions on the loaffinity network
 */

const NATIVE_MINTER_ADDRESS = "0x0000000000000000000000000000000000001006";

// ABI for INativeMinter (extends IOwnable)
const NATIVE_MINTER_ABI = [
    // IOwnable functions
    "function owner() external view returns (address)",
    "function transferOwnership(address newOwner) external returns (bool)",
    "function initialized() external view returns (bool)",
    "function initializeOwnerAndSupply(address owner, uint256 totalSupply) external returns (bool)",
    "function initializeOwner(address owner) external returns (bool)",
    // INativeMinter functions
    "function mint(address to, uint256 value) external returns (bool, string memory)"
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║       NativeMinter Precompile Test Suite                       ║");
    console.log("║       Address: 0x0000000000000000000000000000000000001001       ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // Setup provider and wallet
    const rpcUrl = "http://localhost:8545";
    const privateKey = "3677cd5ea640d9b487dad7c37a5d79b4cb7bd2a56001593419a3a776b5eaa2ad";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🔗 Connected to: ${rpcUrl}`);
    console.log(`👤 Signer address: ${wallet.address}`);

    // Get initial balance and network info
    const balance = await provider.getBalance(wallet.address);
    const network = await provider.getNetwork();
    console.log(`💰 Signer balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})\n`);

    // Create contract instance
    const nativeMinter = new ethers.Contract(NATIVE_MINTER_ADDRESS, NATIVE_MINTER_ABI, wallet);

    // Check if code exists at the precompile address
    const code = await provider.getCode(NATIVE_MINTER_ADDRESS);
    console.log(`📄 Code at precompile address: ${code === "0x" ? "No bytecode (expected for precompile)" : "Has bytecode"}\n`);

    // Transaction options
    const txOptions = {
        gasLimit: 100000n,
        gasPrice: 10000000000000n // 10000 Gwei (matching hardhat.config.ts)
    };

    const results: { test: string; status: string; details: string }[] = [];

    // ═══════════════════════════════════════════════════════════════════
    // TEST 1: Check if initialized
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 1: Check initialized() status");
    console.log("═══════════════════════════════════════════════════════════════════");
    try {
        const isInitialized = await nativeMinter.initialized();
        console.log(`✅ initialized(): ${isInitialized}`);
        results.push({ test: "initialized()", status: "✅ PASSED", details: `Value: ${isInitialized}` });
    } catch (error: any) {
        console.log(`❌ initialized() failed: ${error.message}`);
        results.push({ test: "initialized()", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 2: Get current owner
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 2: Get owner() address");
    console.log("═══════════════════════════════════════════════════════════════════");
    let currentOwner: string | null = null;
    try {
        currentOwner = await nativeMinter.owner();
        console.log(`✅ owner(): ${currentOwner}`);
        results.push({ test: "owner()", status: "✅ PASSED", details: `Owner: ${currentOwner}` });
    } catch (error: any) {
        console.log(`❌ owner() failed: ${error.message}`);
        results.push({ test: "owner()", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 3: Initialize Owner (if not initialized)
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 3: initializeOwner() - Set initial owner");
    console.log("═══════════════════════════════════════════════════════════════════");
    try {
        const isInitialized = await nativeMinter.initialized();
        if (!isInitialized) {
            console.log("⏳ Precompile not initialized, calling initializeOwner()...");
            const tx = await nativeMinter.initializeOwner(wallet.address, txOptions);
            console.log(`📤 Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait(1, 30000);
            console.log(`✅ initializeOwner() success in block ${receipt?.blockNumber}`);
            results.push({ test: "initializeOwner()", status: "✅ PASSED", details: `Initialized with owner: ${wallet.address}` });
        } else {
            console.log("ℹ️  Already initialized, skipping initializeOwner()");
            results.push({ test: "initializeOwner()", status: "⏭️ SKIPPED", details: "Already initialized" });
        }
    } catch (error: any) {
        console.log(`❌ initializeOwner() failed: ${error.message}`);
        results.push({ test: "initializeOwner()", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 4: Initialize Owner and Supply (if not initialized)
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 4: initializeOwnerAndSupply() - Set owner and total supply");
    console.log("═══════════════════════════════════════════════════════════════════");
    try {
        const isInitialized = await nativeMinter.initialized();
        if (!isInitialized) {
            const totalSupply = ethers.parseEther("1000000"); // 1 million total supply
            console.log("⏳ Precompile not initialized, calling initializeOwnerAndSupply()...");
            const tx = await nativeMinter.initializeOwnerAndSupply(wallet.address, totalSupply, txOptions);
            console.log(`📤 Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait(1, 30000);
            console.log(`✅ initializeOwnerAndSupply() success in block ${receipt?.blockNumber}`);
            results.push({ test: "initializeOwnerAndSupply()", status: "✅ PASSED", details: `Owner: ${wallet.address}, Supply: ${ethers.formatEther(totalSupply)}` });
        } else {
            console.log("ℹ️  Already initialized, skipping initializeOwnerAndSupply()");
            results.push({ test: "initializeOwnerAndSupply()", status: "⏭️ SKIPPED", details: "Already initialized" });
        }
    } catch (error: any) {
        console.log(`❌ initializeOwnerAndSupply() failed: ${error.message}`);
        results.push({ test: "initializeOwnerAndSupply()", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 5: Mint native tokens
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 5: mint() - Mint native tokens to an address");
    console.log("═══════════════════════════════════════════════════════════════════");
    const mintRecipient = "0xf17f52151EbEF6C7334FAD080c5704D77216b732";
    const mintAmount = ethers.parseEther("10"); // 10 native tokens
    try {
        // Get balance before minting
        const balanceBefore = await provider.getBalance(mintRecipient);
        console.log(`📊 Recipient balance before: ${ethers.formatEther(balanceBefore)} ETH`);

        console.log(`⏳ Minting ${ethers.formatEther(mintAmount)} tokens to ${mintRecipient}...`);
        const tx = await nativeMinter.mint(mintRecipient, mintAmount, txOptions);
        console.log(`📤 Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait(1, 30000);
        console.log(`✅ mint() transaction confirmed in block ${receipt?.blockNumber}`);

        // Get balance after minting
        const balanceAfter = await provider.getBalance(mintRecipient);
        console.log(`📊 Recipient balance after: ${ethers.formatEther(balanceAfter)} ETH`);

        const difference = balanceAfter - balanceBefore;
        console.log(`📈 Balance increased by: ${ethers.formatEther(difference)} ETH`);

        if (difference === mintAmount) {
            console.log("✅ Mint amount verified correctly!");
            results.push({ test: "mint()", status: "✅ PASSED", details: `Minted ${ethers.formatEther(mintAmount)} to ${mintRecipient}` });
        } else {
            console.log(`⚠️  Difference doesn't match expected amount`);
            results.push({ test: "mint()", status: "⚠️ PARTIAL", details: `Minted but balance diff: ${ethers.formatEther(difference)}` });
        }
    } catch (error: any) {
        console.log(`❌ mint() failed: ${error.message}`);
        results.push({ test: "mint()", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 6: Mint to self
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 6: mint() - Mint native tokens to self");
    console.log("═══════════════════════════════════════════════════════════════════");
    const selfMintAmount = ethers.parseEther("5");
    try {
        const balanceBefore = await provider.getBalance(wallet.address);
        console.log(`📊 Own balance before: ${ethers.formatEther(balanceBefore)} ETH`);

        console.log(`⏳ Minting ${ethers.formatEther(selfMintAmount)} tokens to self...`);
        const tx = await nativeMinter.mint(wallet.address, selfMintAmount, txOptions);
        console.log(`📤 Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait(1, 30000);
        console.log(`✅ Self mint transaction confirmed in block ${receipt?.blockNumber}`);

        const balanceAfter = await provider.getBalance(wallet.address);
        console.log(`📊 Own balance after: ${ethers.formatEther(balanceAfter)} ETH`);

        // Note: Balance change will be mintAmount minus gas spent
        results.push({ test: "mint() to self", status: "✅ PASSED", details: `After balance: ${ethers.formatEther(balanceAfter)}` });
    } catch (error: any) {
        console.log(`❌ mint() to self failed: ${error.message}`);
        results.push({ test: "mint() to self", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 7: Transfer Ownership (optional - be careful with this!)
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 7: transferOwnership() - Test ownership transfer");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("⚠️  SKIPPING: This would transfer ownership which could be dangerous.");
    console.log("ℹ️  Uncomment the code below to test if needed.");
    results.push({ test: "transferOwnership()", status: "⏭️ SKIPPED", details: "Safety skip - uncomment to test" });

    /*
    // CAUTION: Uncomment only if you want to test ownership transfer
    const newOwner = "0xAe76b11CEcE311717934938510327203a373E826";
    try {
        console.log(`⏳ Transferring ownership to ${newOwner}...`);
        const tx = await nativeMinter.transferOwnership(newOwner, txOptions);
        console.log(`📤 Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait(1, 30000);
        console.log(`✅ transferOwnership() success in block ${receipt?.blockNumber}`);
        
        // Verify new owner
        const updatedOwner = await nativeMinter.owner();
        console.log(`📊 New owner: ${updatedOwner}`);
        results.push({ test: "transferOwnership()", status: "✅ PASSED", details: `New owner: ${updatedOwner}` });
    } catch (error: any) {
        console.log(`❌ transferOwnership() failed: ${error.message}`);
        results.push({ test: "transferOwnership()", status: "❌ FAILED", details: error.message });
    }
    */
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // TEST 8: Mint with zero value (edge case)
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("TEST 8: mint() - Mint zero tokens (edge case)");
    console.log("═══════════════════════════════════════════════════════════════════");
    try {
        console.log(`⏳ Minting 0 tokens to ${mintRecipient}...`);
        const tx = await nativeMinter.mint(mintRecipient, 0n, txOptions);
        console.log(`📤 Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait(1, 30000);
        console.log(`✅ Zero mint transaction confirmed in block ${receipt?.blockNumber}`);
        results.push({ test: "mint() zero", status: "✅ PASSED", details: "Zero mint allowed" });
    } catch (error: any) {
        console.log(`❌ mint() zero failed: ${error.message}`);
        results.push({ test: "mint() zero", status: "❌ FAILED", details: error.message });
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║                      TEST SUMMARY                              ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    console.log("┌────────────────────────────────┬─────────────┬──────────────────────────────────────────────┐");
    console.log("│ Test                           │ Status      │ Details                                      │");
    console.log("├────────────────────────────────┼─────────────┼──────────────────────────────────────────────┤");

    for (const result of results) {
        const testCol = result.test.padEnd(30);
        const statusCol = result.status.padEnd(11);
        const detailsCol = result.details.substring(0, 42).padEnd(42);
        console.log(`│ ${testCol} │ ${statusCol} │ ${detailsCol} │`);
    }

    console.log("└────────────────────────────────┴─────────────┴──────────────────────────────────────────────┘");

    const passed = results.filter(r => r.status.includes("PASSED")).length;
    const failed = results.filter(r => r.status.includes("FAILED")).length;
    const skipped = results.filter(r => r.status.includes("SKIPPED")).length;

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped out of ${results.length} tests`);
    console.log("\n✨ NativeMinter Precompile testing complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
