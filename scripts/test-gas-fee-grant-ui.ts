import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test script for verifying Gas Fee Subsidies and Gas Grant Remaining
 * in Blockscout frontend and backend on transaction page.
 * 
 * This script:
 * 1. Calls createERC721 on ContractFactory2 at 0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0
 * 2. Uses the granted address 0xAe76b11CEcE311717934938510327203a373E826
 * 3. Verifies the transaction was successful
 * 4. Provides the transaction hash to check in Blockscout UI
 */

const CONTRACT_FACTORY_ADDRESS = "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0";
const GRANTED_ADDRESS = "0xAe76b11CEcE311717934938510327203a373E826";

// ABI for ContractFactory2 - only the createERC721 function we need
const CONTRACT_FACTORY_ABI = [
    "function createERC721(string memory name, string memory symbol, string memory baseTokenURI, address to, uint256 initialMintAmount) external returns (address)",
    "function getCreatorERC721Tokens(address creator) external view returns (address[] memory)",
    "event ERC721Created(address indexed tokenAddress, string name, string symbol, string baseTokenURI, address indexed owner, uint256 initialMintAmount)"
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════════╗");
    console.log("║     Gas Fee Subsidies / Gas Grant Remaining Test Script           ║");
    console.log("╚════════════════════════════════════════════════════════════════════╝\n");

    // Get private key from environment
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("PRIV_KEY environment variable not set. Please export PRIV_KEY with your private key.");
    }

    // Setup provider and wallet
    const rpcUrl = "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🔗 Connected to: ${rpcUrl}`);
    console.log(`👤 Granted Address (Signer): ${wallet.address}`);
    console.log(`📄 Contract Factory Address: ${CONTRACT_FACTORY_ADDRESS}\n`);

    // Verify the wallet address matches the granted address
    if (wallet.address.toLowerCase() !== GRANTED_ADDRESS.toLowerCase()) {
        console.log(`⚠️  WARNING: Wallet address (${wallet.address}) does not match expected granted address (${GRANTED_ADDRESS})`);
        console.log(`   The gas fee grant might not apply to this address.\n`);
    } else {
        console.log(`✅ Wallet address matches the granted address!\n`);
    }

    // Get initial balance and network info
    const balance = await provider.getBalance(wallet.address);
    const network = await provider.getNetwork();
    console.log(`💰 Signer balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`🌐 Network: ${network.name} (chainId: ${network.chainId})\n`);

    // Create contract instance
    const contractFactory = new ethers.Contract(CONTRACT_FACTORY_ADDRESS, CONTRACT_FACTORY_ABI, wallet);

    // Transaction options - matching loaffinity network settings
    const txOptions = {
        gasLimit: 5000000n,
        gasPrice: 10000000000000n // 10000 Gwei (matching hardhat.config.ts)
    };

    // Generate unique token details
    const timestamp = Date.now();
    const tokenName = `TestNFT_${timestamp}`;
    const tokenSymbol = `TNFT${timestamp % 10000}`;
    const baseTokenURI = `https://example.com/metadata/${timestamp}/`;
    const initialMintAmount = 1n;

    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("Creating ERC721 Token via ContractFactory2");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log(`📌 Token Name: ${tokenName}`);
    console.log(`📌 Token Symbol: ${tokenSymbol}`);
    console.log(`📌 Base Token URI: ${baseTokenURI}`);
    console.log(`📌 Initial Mint Amount: ${initialMintAmount}`);
    console.log(`📌 Token Owner: ${wallet.address}\n`);

    try {
        console.log("⏳ Sending createERC721 transaction...");
        const tx = await contractFactory.createERC721(
            tokenName,
            tokenSymbol,
            baseTokenURI,
            wallet.address,  // to address - where tokens will be minted
            initialMintAmount,
            txOptions
        );

        console.log(`📤 Transaction Hash: ${tx.hash}`);
        console.log(`⏳ Waiting for confirmation...\n`);

        const receipt = await tx.wait(1, 60000);

        if (receipt) {
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log("Transaction Confirmed!");
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log(`✅ Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
            console.log(`📦 Block Number: ${receipt.blockNumber}`);
            console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);

            // Calculate actual gas cost
            const actualGasCost = receipt.gasUsed * tx.gasPrice;
            console.log(`💸 Actual Gas Cost: ${ethers.formatEther(actualGasCost)} ETH`);

            // Parse the event to get the deployed token address
            const events = receipt.logs;
            for (const log of events) {
                try {
                    const parsed = contractFactory.interface.parseLog({
                        topics: log.topics as string[],
                        data: log.data
                    });
                    if (parsed && parsed.name === 'ERC721Created') {
                        console.log(`🎉 New ERC721 Token Address: ${parsed.args[0]}`);
                    }
                } catch (e) {
                    // Skip logs that don't match our ABI
                }
            }

            console.log("\n═══════════════════════════════════════════════════════════════════");
            console.log("Verification Steps for Blockscout UI");
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log(`\n📋 To verify Gas Fee Subsidies and Gas Grant Remaining:\n`);
            console.log(`1. Open Blockscout in your browser: http://localhost`);
            console.log(`   (or your configured Blockscout URL)\n`);
            console.log(`2. Navigate to transaction details:`);
            console.log(`   http://localhost/tx/${tx.hash}\n`);
            console.log(`3. Look for these fields in the transaction details:\n`);
            console.log(`   📊 "Gas Fee Subsidies" - Should show:`);
            console.log(`      • Amount (in ETH)`);
            console.log(`      • Granter address\n`);
            console.log(`   📊 "Gas Grant Remaining" - Should show:`);
            console.log(`      • Remaining allowance amount\n`);

            // Get final balance
            const finalBalance = await provider.getBalance(wallet.address);
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log("Balance Summary");
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log(`💰 Initial Balance: ${ethers.formatEther(balance)} ETH`);
            console.log(`💰 Final Balance: ${ethers.formatEther(finalBalance)} ETH`);
            const balanceChange = finalBalance - balance;
            console.log(`📈 Balance Change: ${ethers.formatEther(balanceChange)} ETH`);

            // Use BigInt arithmetic for balance comparison
            const gasSubsidy = actualGasCost + balanceChange;
            if (gasSubsidy > 0n) {
                console.log(`\n✅ Gas fee subsidy appears to be working!`);
                console.log(`   Expected cost: -${ethers.formatEther(actualGasCost)} ETH`);
                console.log(`   Actual change: ${ethers.formatEther(balanceChange)} ETH`);
                console.log(`   Savings from subsidy: ~${ethers.formatEther(gasSubsidy)} ETH`);
            }

            console.log("\n═══════════════════════════════════════════════════════════════════");
            console.log("API Verification");
            console.log("═══════════════════════════════════════════════════════════════════");
            console.log(`\n🔍 You can also verify via API:\n`);
            console.log(`   curl http://localhost:4000/api/v2/transactions/${tx.hash}\n`);
            console.log(`   Look for "gas_fee_grant_info" in the response.\n`);

        } else {
            console.log("❌ Transaction receipt not received");
        }

    } catch (error: any) {
        console.log(`\n❌ Transaction failed: ${error.message}`);
        if (error.data) {
            console.log(`   Error data: ${error.data}`);
        }
        if (error.reason) {
            console.log(`   Reason: ${error.reason}`);
        }
        process.exit(1);
    }

    console.log("\n✨ Test script completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
