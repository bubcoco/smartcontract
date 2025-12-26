import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

/**
 * Test script for PrecompileNativeMinter deployed contract
 * Tests minting through the contract wrapper
 */

const PRECOMPILE_NATIVE_MINTER_ADDRESS = "0x1858cCeC051049Fa1269E958da2d33bCA27c6Db8";
const NATIVE_MINTER_PRECOMPILE = "0x0000000000000000000000000000000000001001";

const PRECOMPILE_NATIVE_MINTER_ABI = [
    "function owner() external view returns (address)",
    "function initialized() external view returns (bool)",
    "function isContractOwner() external view returns (bool)",
    "function getPrecompileAddress() external pure returns (address)",
    "function initializeOwner(address _owner) external returns (bool)",
    "function initializeOwnerAndSupply(address _owner, uint256 _totalSupply) external returns (bool)",
    "function transferOwnership(address _newOwner) external returns (bool)",
    "function mint(address _to, uint256 _amount) external returns (bool)",
    "function batchMint(address[] calldata _recipients, uint256[] calldata _amounts) external returns (bool)",
    "function batchMintUniform(address[] calldata _recipients, uint256 _amount) external returns (bool)",
    "event NativeMinted(address indexed to, uint256 amount, bool success)",
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
];

const NATIVE_MINTER_ABI = [
    "function owner() external view returns (address)",
    "function transferOwnership(address newOwner) external returns (bool)",
    "function initialized() external view returns (bool)",
    "function initializeOwner(address owner) external returns (bool)",
    "function initializeOwnerAndSupply(address owner, uint256 totalSupply) external returns (bool)",
    "function mint(address to, uint256 value) external returns (bool)"
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║   Test PrecompileNativeMinter Contract + Ownership Transfer    ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    // Setup provider and wallet
    const rpcUrl = "http://localhost:8545";
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🔗 Connected to: ${rpcUrl}`);
    console.log(`👤 Signer address: ${wallet.address}\n`);

    const txOptions = {
        gasLimit: 500000n,
        gasPrice: 10000000000000n
    };

    // Create contract instances
    const precompileNativeMinter = new ethers.Contract(
        PRECOMPILE_NATIVE_MINTER_ADDRESS,
        PRECOMPILE_NATIVE_MINTER_ABI,
        wallet
    );

    const nativeMinterPrecompile = new ethers.Contract(
        NATIVE_MINTER_PRECOMPILE,
        NATIVE_MINTER_ABI,
        wallet
    );

    // ═══════════════════════════════════════════════════════════════════
    // Check current state
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("STEP 1: Check current ownership state");
    console.log("═══════════════════════════════════════════════════════════════════");

    const currentOwner = await precompileNativeMinter.owner();
    const isContractOwner = await precompileNativeMinter.isContractOwner();

    console.log(`📍 Deployed Contract: ${PRECOMPILE_NATIVE_MINTER_ADDRESS}`);
    console.log(`👤 Current Precompile Owner: ${currentOwner}`);
    console.log(`📋 Is Contract the Owner?: ${isContractOwner}`);
    console.log(`👛 Your Wallet: ${wallet.address}`);
    console.log(`🔑 Are you the owner?: ${currentOwner.toLowerCase() === wallet.address.toLowerCase()}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Try minting through contract (will fail if contract is not owner)
    // ═══════════════════════════════════════════════════════════════════
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("STEP 2: Try minting through the contract wrapper");
    console.log("═══════════════════════════════════════════════════════════════════");

    const mintRecipient = "0xAe76b11CEcE311717934938510327203a373E826";
    const mintAmount = ethers.parseEther("100");

    console.log(`📊 Recipient: ${mintRecipient}`);
    console.log(`💰 Amount: ${ethers.formatEther(mintAmount)} ETH\n`);

    if (!isContractOwner) {
        console.log("⚠️  The contract is NOT the owner of the precompile.");
        console.log("⚠️  Minting through the contract will FAIL.\n");

        console.log("OPTIONS:");
        console.log("  1. Transfer precompile ownership TO the contract address");
        console.log("  2. Mint directly from the precompile using your wallet\n");

        // Ask user which option
        console.log("═══════════════════════════════════════════════════════════════════");
        console.log("STEP 3: Transfer ownership to the contract (if you're the owner)");
        console.log("═══════════════════════════════════════════════════════════════════");

        if (currentOwner.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ You ARE the current owner! Transferring ownership to contract...\n");

            try {
                // Transfer ownership from EOA to contract
                console.log(`⏳ Transferring ownership to ${PRECOMPILE_NATIVE_MINTER_ADDRESS}...`);
                const tx = await nativeMinterPrecompile.transferOwnership(
                    PRECOMPILE_NATIVE_MINTER_ADDRESS,
                    txOptions
                );
                console.log(`📤 Transaction sent: ${tx.hash}`);
                const receipt = await tx.wait(1, 30000);
                console.log(`✅ Ownership transferred in block ${receipt?.blockNumber}\n`);

                // Verify new ownership
                const newOwner = await precompileNativeMinter.owner();
                const nowContractOwner = await precompileNativeMinter.isContractOwner();
                console.log(`📋 New Owner: ${newOwner}`);
                console.log(`📋 Is Contract Owner Now?: ${nowContractOwner}\n`);

                if (nowContractOwner) {
                    // Now try minting through the contract
                    console.log("═══════════════════════════════════════════════════════════════════");
                    console.log("STEP 4: Mint through the contract (now that it's the owner)");
                    console.log("═══════════════════════════════════════════════════════════════════");

                    const balanceBefore = await provider.getBalance(mintRecipient);
                    console.log(`📊 Recipient balance before: ${ethers.formatEther(balanceBefore)} ETH`);

                    console.log(`⏳ Minting ${ethers.formatEther(mintAmount)} to ${mintRecipient}...`);
                    const mintTx = await precompileNativeMinter.mint(
                        mintRecipient,
                        mintAmount,
                        txOptions
                    );
                    console.log(`📤 Transaction sent: ${mintTx.hash}`);
                    const mintReceipt = await mintTx.wait(1, 30000);
                    console.log(`✅ Mint successful in block ${mintReceipt?.blockNumber}`);

                    const balanceAfter = await provider.getBalance(mintRecipient);
                    console.log(`📊 Recipient balance after: ${ethers.formatEther(balanceAfter)} ETH`);
                    console.log(`📈 Increase: ${ethers.formatEther(balanceAfter - balanceBefore)} ETH\n`);
                }
            } catch (error: any) {
                console.log(`❌ Error: ${error.message}\n`);
            }
        } else {
            console.log("❌ You are NOT the current owner.");
            console.log(`   Current owner is: ${currentOwner}`);
            console.log("   Only the current owner can transfer ownership.\n");
        }
    } else {
        // Contract is already the owner, try minting
        console.log("✅ Contract IS the owner! Attempting to mint...\n");

        try {
            const balanceBefore = await provider.getBalance(mintRecipient);
            console.log(`📊 Recipient balance before: ${ethers.formatEther(balanceBefore)} ETH`);

            console.log(`⏳ Minting ${ethers.formatEther(mintAmount)} to ${mintRecipient}...`);
            const mintTx = await precompileNativeMinter.mint(mintRecipient, mintAmount, txOptions);
            console.log(`📤 Transaction sent: ${mintTx.hash}`);
            const mintReceipt = await mintTx.wait(1, 30000);
            console.log(`✅ Mint successful in block ${mintReceipt?.blockNumber}`);

            const balanceAfter = await provider.getBalance(mintRecipient);
            console.log(`📊 Recipient balance after: ${ethers.formatEther(balanceAfter)} ETH`);
            console.log(`📈 Increase: ${ethers.formatEther(balanceAfter - balanceBefore)} ETH\n`);
        } catch (error: any) {
            console.log(`❌ Mint failed: ${error.message}\n`);
        }
    }

    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("✨ Test complete!");
    console.log("═══════════════════════════════════════════════════════════════════");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
