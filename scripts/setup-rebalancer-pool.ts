/**
 * Deploy Test Tokens and PancakeSwap V3 Pool for Rebalancer Bot Testing
 * ======================================================================
 * 
 * This script:
 *   1. Deploys two test ERC20 tokens (TokenA and TokenB)
 *   2. Creates a PancakeSwap V3 pool for TokenA/TokenB
 *   3. Mints an initial LP position
 *   4. Outputs configuration for the rebalancer bot
 *
 * Prerequisites:
 *   - PancakeSwap V3 contracts deployed (run ./deploy-loaffinity.sh in pancake-v3-contracts)
 *   - Loaffinity RPC running at http://localhost:8545
 *
 * Usage:
 *   npx tsx scripts/setup-rebalancer-pool.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// PancakeSwap V3 deployed addresses on loaffinity
const PANCAKE_V3_ADDRESSES = {
    Factory: "0x1883bfd1a26497721D330cE6b3E7224ec3A465A5",
    PoolDeployer: "0x3971BaFcf440fC014690D9cf4649612eBd473486",
    NonfungiblePositionManager: "0x0d7cc082214D4Aaf1367Ba7421CfF51C7ee0e818",
    SwapRouter: "0x90CEFBA97CB6bfc910C8dc84f3551BF9aDE026A3",
};

// Minimal ABIs
const FACTORY_ABI = [
    "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)",
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
    "function enableFeeAmount(uint24 fee, int24 tickSpacing) external",
    "function feeAmountTickSpacing(uint24 fee) external view returns (int24)",
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
];

const POOL_ABI = [
    "function initialize(uint160 sqrtPriceX96) external",
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function fee() external view returns (uint24)",
    "function tickSpacing() external view returns (int24)",
];

const POSITION_MANAGER_ABI = [
    "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
    "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
];

async function main() {
    console.log("=".repeat(60));
    console.log("Rebalancer Test Pool Setup");
    console.log("=".repeat(60));
    console.log("");

    // Setup provider and wallet
    const rpcUrl = "http://localhost:8545";
    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) {
        throw new Error("PRIV_KEY environment variable not set. Please add it to .env file.");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Connected to: ${rpcUrl}`);
    console.log(`Deployer: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    console.log("");

    // Load Gems contract artifact
    const artifactPath = path.join(
        process.cwd(),
        "artifacts/contracts/Token.sol/Gems.json"
    );

    if (!fs.existsSync(artifactPath)) {
        console.error("❌ Gems contract artifact not found. Please run 'npx hardhat compile' first.");
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const tokenAbi = artifact.abi;
    const tokenBytecode = artifact.bytecode;

    // =========================================================================
    // Step 1: Deploy Test Tokens
    // =========================================================================
    console.log("=== Step 1: Deploy Test Tokens ===");

    const initialSupply = ethers.parseEther("1000000"); // 1M tokens

    // Deploy TokenA
    console.log("Deploying TokenA (GEM)...");
    const tokenFactoryA = new ethers.ContractFactory(tokenAbi, tokenBytecode, wallet);
    const tokenA = await tokenFactoryA.deploy(initialSupply);
    await tokenA.waitForDeployment();
    const tokenAAddress = await tokenA.getAddress();
    console.log("TokenA deployed:", tokenAAddress);

    // Deploy TokenB
    console.log("Deploying TokenB (GEM)...");
    const tokenFactoryB = new ethers.ContractFactory(tokenAbi, tokenBytecode, wallet);
    const tokenB = await tokenFactoryB.deploy(initialSupply);
    await tokenB.waitForDeployment();
    const tokenBAddress = await tokenB.getAddress();
    console.log("TokenB deployed:", tokenBAddress);

    // Sort tokens (V3 requires token0 < token1 by address)
    let token0Address: string, token1Address: string;
    let token0: ethers.Contract, token1: ethers.Contract;

    if (tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase()) {
        token0Address = tokenAAddress;
        token1Address = tokenBAddress;
        token0 = new ethers.Contract(tokenAAddress, ERC20_ABI, wallet);
        token1 = new ethers.Contract(tokenBAddress, ERC20_ABI, wallet);
    } else {
        token0Address = tokenBAddress;
        token1Address = tokenAAddress;
        token0 = new ethers.Contract(tokenBAddress, ERC20_ABI, wallet);
        token1 = new ethers.Contract(tokenAAddress, ERC20_ABI, wallet);
    }

    console.log("Token0 (sorted):", token0Address);
    console.log("Token1 (sorted):", token1Address);
    console.log("");

    // =========================================================================
    // Step 2: Create Pool
    // =========================================================================
    console.log("=== Step 2: Create Pool ===");

    const factory = new ethers.Contract(
        PANCAKE_V3_ADDRESSES.Factory,
        FACTORY_ABI,
        wallet
    );

    // Fee tier: 3000 = 0.3%
    const fee = 3000;
    const tickSpacing = 60; // For 0.3% fee tier

    // Enable the fee tier if not already enabled
    console.log("Checking if 0.3% fee tier is enabled...");
    const existingTickSpacing = await factory.feeAmountTickSpacing(fee);
    if (existingTickSpacing === 0n) {
        console.log("Enabling 0.3% fee tier (fee=3000, tickSpacing=60)...");
        const enableTx = await factory.enableFeeAmount(fee, tickSpacing);
        await enableTx.wait();
        console.log("Fee tier enabled!");
    } else {
        console.log("Fee tier already enabled with tickSpacing:", existingTickSpacing.toString());
    }

    console.log("Creating pool with 0.3% fee...");
    const createPoolTx = await factory.createPool(token0Address, token1Address, fee);
    const createPoolReceipt = await createPoolTx.wait();

    // Get pool address from event logs
    let poolAddress: string | null = null;
    const poolCreatedTopic = ethers.id("PoolCreated(address,address,uint24,int24,address)");

    for (const log of createPoolReceipt?.logs || []) {
        if (log.topics[0] === poolCreatedTopic) {
            // Pool address is the 5th parameter (non-indexed), decode from data
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                ["int24", "address"],
                log.data
            );
            poolAddress = decoded[1];
            break;
        }
    }

    if (!poolAddress) {
        // Fallback: query the factory
        poolAddress = await factory.getPool(token0Address, token1Address, fee);
    }

    console.log("Pool created:", poolAddress);

    // Initialize pool with 1:1 price
    // sqrtPriceX96 for 1:1 price = sqrt(1) * 2^96 = 79228162514264337593543950336
    const sqrtPriceX96 = "79228162514264337593543950336";

    const pool = new ethers.Contract(poolAddress!, POOL_ABI, wallet);
    console.log("Initializing pool at 1:1 price...");
    const initTx = await pool.initialize(sqrtPriceX96);
    await initTx.wait();

    const slot0 = await pool.slot0();
    const currentTick = Number(slot0[1]); // tick is index 1
    console.log("Pool initialized! Current tick:", currentTick);
    console.log("");

    // =========================================================================
    // Step 3: Mint Initial LP Position
    // =========================================================================
    console.log("=== Step 3: Mint Initial LP Position ===");

    const positionManager = new ethers.Contract(
        PANCAKE_V3_ADDRESSES.NonfungiblePositionManager,
        POSITION_MANAGER_ABI,
        wallet
    );

    // Approve tokens for position manager
    const approveAmount = ethers.parseEther("100000");
    console.log("Approving tokens for Position Manager...");
    await (await token0.approve(PANCAKE_V3_ADDRESSES.NonfungiblePositionManager, approveAmount)).wait();
    await (await token1.approve(PANCAKE_V3_ADDRESSES.NonfungiblePositionManager, approveAmount)).wait();
    console.log("Tokens approved");

    // Calculate tick range (±10% around current price = ~1000 ticks)
    const tickRange = 1000;

    // Round to valid tick spacing
    const tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

    console.log("Tick range:", tickLower, "to", tickUpper);

    // Mint position
    const amount0Desired = ethers.parseEther("10000");
    const amount1Desired = ethers.parseEther("10000");
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

    console.log("Minting LP position...");
    const mintParams = {
        token0: token0Address,
        token1: token1Address,
        fee: fee,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: amount0Desired,
        amount1Desired: amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: wallet.address,
        deadline: deadline,
    };

    const mintTx = await positionManager.mint(mintParams);
    const mintReceipt = await mintTx.wait();

    // Get tokenId from Transfer event
    let tokenId: string = "1"; // Default
    const transferTopic = ethers.id("Transfer(address,address,uint256)");

    for (const log of mintReceipt?.logs || []) {
        if (
            log.topics[0] === transferTopic &&
            log.address.toLowerCase() === PANCAKE_V3_ADDRESSES.NonfungiblePositionManager.toLowerCase()
        ) {
            // tokenId is the 4th topic (index 3)
            tokenId = BigInt(log.topics[3]).toString();
            break;
        }
    }

    console.log("Position minted! Token ID:", tokenId);

    // Get position info
    const positionInfo = await positionManager.positions(tokenId);
    console.log("Position details:");
    console.log("  Liquidity:", positionInfo[7].toString()); // liquidity is index 7
    console.log("  Tick Lower:", positionInfo[5].toString()); // tickLower is index 5
    console.log("  Tick Upper:", positionInfo[6].toString()); // tickUpper is index 6
    console.log("");

    // =========================================================================
    // Output Configuration
    // =========================================================================
    console.log("=".repeat(60));
    console.log("REBALANCER BOT CONFIGURATION");
    console.log("=".repeat(60));
    console.log("");
    console.log("Add these to rebalancer/.env:");
    console.log("-".repeat(40));
    console.log(`POOL_ADDRESS=${poolAddress}`);
    console.log(`POSITION_TOKEN_ID=${tokenId}`);
    console.log("-".repeat(40));
    console.log("");
    console.log("Update bot.py contract addresses:");
    console.log("-".repeat(40));
    console.log(`NONFUNGIBLE_POSITION_MANAGER = "${PANCAKE_V3_ADDRESSES.NonfungiblePositionManager}"`);
    console.log(`SWAP_ROUTER = "${PANCAKE_V3_ADDRESSES.SwapRouter}"`);
    console.log("-".repeat(40));
    console.log("");

    // Save configuration
    const config = {
        network: "loaffinity",
        chainId: 235,
        tokens: {
            token0: token0Address,
            token1: token1Address,
        },
        pool: {
            address: poolAddress,
            fee: fee,
            tickSpacing: tickSpacing,
            currentTick: currentTick,
        },
        position: {
            tokenId: tokenId,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: positionInfo[7].toString(),
        },
        contracts: {
            factory: PANCAKE_V3_ADDRESSES.Factory,
            positionManager: PANCAKE_V3_ADDRESSES.NonfungiblePositionManager,
            swapRouter: PANCAKE_V3_ADDRESSES.SwapRouter,
        },
        rebalancerEnv: {
            RPC_URL: "http://localhost:8545",
            POOL_ADDRESS: poolAddress,
            POSITION_TOKEN_ID: tokenId,
            RANGE_WIDTH: "10",
        },
    };

    const localOutputPath = path.join(__dirname, "../rebalancer-test-config.json");
    fs.writeFileSync(localOutputPath, JSON.stringify(config, null, 2));
    console.log(`Configuration saved to: ${localOutputPath}`);

    // Also save to rebalancer directory if it exists
    const rebalancerPath = "/Users/entronica/Desktop/Coding/rebalancer/test-pool-config.json";
    try {
        fs.writeFileSync(rebalancerPath, JSON.stringify(config, null, 2));
        console.log(`Configuration also saved to: ${rebalancerPath}`);
    } catch (e) {
        console.log("Note: Could not save to rebalancer directory");
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("SETUP COMPLETE!");
    console.log("=".repeat(60));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error:", error);
        process.exit(1);
    });
