import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test NativeMinter Precompile
 * - Initialize if needed (using initializeOwnerAndSupply)
 * - Mint native tokens to a test address
 * - Prove balance increased
 */

const NATIVE_MINTER_PRECOMPILE = "0x0000000000000000000000000000000000001001";

// Test recipient - will receive minted tokens
// const TEST_RECIPIENT = "0x54e7Ef5795d350Ae257Af47FEdF211bC8b0C5621";
const TEST_RECIPIENT = "0xf17f52151EbEF6C7334FAD080c5704D77216b732";
const MINT_AMOUNT = ethers.parseEther("10000"); // 1000 ETH
const INITIAL_SUPPLY = ethers.parseEther("10000"); // Initial supply when initializing (0 = no initial mint)

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║          Test NativeMinter Precompile                              ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    const adminKey = process.env.ADMIN;
    if (!adminKey) throw new Error("ADMIN private key not set in .env");

    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const wallet = new ethers.Wallet(adminKey, provider);

    console.log(`👤 Admin Wallet: ${wallet.address}`);
    console.log(`📄 NativeMinter: ${NATIVE_MINTER_PRECOMPILE}`);
    console.log(`🎯 Recipient: ${TEST_RECIPIENT}`);
    console.log(`💰 Mint Amount: ${ethers.formatEther(MINT_AMOUNT)} ETH\n`);

    // Correct ABI based on INativeMinter.sol interface
    const abi = [
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function initializeOwnerAndSupply(address initialOwner, uint256 initialSupply) returns (bool success, string message)",
        "function mint(address to, uint256 value) returns (bool success, string message)",
        "function totalSupply() view returns (uint256)",
        "function transferOwnership(address newOwner) returns (bool success)",
    ];

    const precompile = new ethers.Contract(NATIVE_MINTER_PRECOMPILE, abi, wallet);
    const txOptions = { gasLimit: 500000n, gasPrice: 100000000000n };

    // ═══════════════════════════════════════════════════════════════════
    // 1. Check Initialization Status
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("1. Check Precompile Status");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    let isInitialized = await precompile.initialized();
    let owner = await precompile.owner();

    console.log(`   Initialized: ${isInitialized}`);
    console.log(`   Owner: ${owner}`);

    // ═══════════════════════════════════════════════════════════════════
    // 2. Initialize if Needed
    // ═══════════════════════════════════════════════════════════════════
    if (!isInitialized) {
        console.log("\n═══════════════════════════════════════════════════════════════════");
        console.log("2. Initialize Precompile");
        console.log("═══════════════════════════════════════════════════════════════════\n");

        console.log(`   ⏳ Initializing with initializeOwnerAndSupply...`);
        console.log(`      Owner: ${wallet.address}`);
        console.log(`      Initial Supply: ${ethers.formatEther(INITIAL_SUPPLY)} ETH`);

        try {
            const initTx = await precompile.initializeOwnerAndSupply(
                wallet.address,
                INITIAL_SUPPLY,
                txOptions
            );
            console.log(`\n   📤 TX: ${initTx.hash}`);

            const receipt = await initTx.wait(1);
            console.log(`   ✅ Confirmed in block ${receipt?.blockNumber}`);
            console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);

            // Re-check status
            isInitialized = await precompile.initialized();
            owner = await precompile.owner();
            console.log(`\n   📊 New Status:`);
            console.log(`      Initialized: ${isInitialized}`);
            console.log(`      Owner: ${owner}`);
        } catch (e: any) {
            console.log(`\n   ❌ Init failed: ${e.shortMessage || e.message}`);
            if (e.info?.error?.message) {
                console.log(`      Details: ${e.info.error.message}`);
            }
            // Check if it's now initialized (maybe another init happened)
            isInitialized = await precompile.initialized();
            owner = await precompile.owner();
            if (!isInitialized) {
                console.log(`\n   ❌ Precompile still not initialized. Cannot proceed.`);
                return;
            }
        }
    } else {
        console.log("\n   ✅ Already initialized");
    }

    // Verify we're the owner
    owner = await precompile.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`\n   ⚠️  Warning: You are not the owner!`);
        console.log(`      Owner: ${owner}`);
        console.log(`      Your wallet: ${wallet.address}`);
        console.log(`      Cannot proceed with minting.`);
        return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Get Balance Before
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("3. Check Balance Before Minting");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const balanceBefore = await provider.getBalance(TEST_RECIPIENT);
    console.log(`   Recipient: ${TEST_RECIPIENT}`);
    console.log(`   Balance Before: ${ethers.formatEther(balanceBefore)} ETH`);

    // ═══════════════════════════════════════════════════════════════════
    // 4. Mint Native Tokens
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("4. Mint Native Tokens");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    console.log(`   ⏳ Minting ${ethers.formatEther(MINT_AMOUNT)} ETH to ${TEST_RECIPIENT}...`);

    try {
        const mintTx = await precompile.mint(TEST_RECIPIENT, MINT_AMOUNT, txOptions);
        console.log(`   📤 TX: ${mintTx.hash}`);

        const receipt = await mintTx.wait(1);
        console.log(`   ✅ Confirmed in block ${receipt?.blockNumber}`);
        console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);

    } catch (e: any) {
        console.log(`   ❌ Mint failed: ${e.shortMessage || e.message}`);
        if (e.info?.error?.message) {
            console.log(`      Details: ${e.info.error.message}`);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. Verify Balance After
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("5. Verify Balance After Minting");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    const balanceAfter = await provider.getBalance(TEST_RECIPIENT);
    const balanceChange = balanceAfter - balanceBefore;

    console.log(`   Balance Before: ${ethers.formatEther(balanceBefore)} ETH`);
    console.log(`   Balance After:  ${ethers.formatEther(balanceAfter)} ETH`);
    console.log(`   Change:         +${ethers.formatEther(balanceChange)} ETH`);

    // ═══════════════════════════════════════════════════════════════════
    // 6. Results
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("6. Results");
    console.log("═══════════════════════════════════════════════════════════════════\n");

    if (balanceChange === MINT_AMOUNT) {
        console.log(`   ✅ SUCCESS! Balance increased by exactly ${ethers.formatEther(MINT_AMOUNT)} ETH`);
        console.log(`   ✅ NativeMinter precompile is working correctly!`);
    } else if (balanceChange > 0n) {
        console.log(`   ⚠️  Balance increased by ${ethers.formatEther(balanceChange)} ETH`);
        console.log(`      Expected: ${ethers.formatEther(MINT_AMOUNT)} ETH`);
        console.log(`      This might indicate partial success or other transfers`);
    } else {
        console.log(`   ❌ Balance did not increase!`);
        console.log(`      The mint transaction may have failed silently.`);
    }

    // Check total supply
    try {
        const totalSupply = await precompile.totalSupply();
        console.log(`\n   📊 Total Supply: ${ethers.formatEther(totalSupply)} ETH`);
    } catch (e) {
        // Ignore
    }

    console.log("\n✨ Test complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.shortMessage || error.message);
        process.exit(1);
    });
