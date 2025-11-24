import { network } from "hardhat";

// 1. Connect to the specific chain (e.g., Optimism simulation)
const { ethers } = await network.connect({
  network: "loaffinity",
  chainType: "l1",
});

console.log("Connected to network with chainType: L1");

// 2. Setup Sender
const [sender] = await ethers.getSigners();
console.log("Transferring from:", sender.address);

// --- CONFIGURATION ---
const TOKEN_ADDRESS = "0xA12cE7fbF3070e3597a993aE306eD43E3D5d38Cd"; // Replace with actual token address
const RECIPIENT = "0x54e7ef5795d350ae257af47fedf211bc8b0c5621";     // Replace with recipient
const AMOUNT_STR = "14.0";                       // Amount to send
// ---------------------

// 3. Define Minimal ERC20 ABI (No artifact needed)
const abi = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)"
];

// 4. Create Contract Instance
// We use the `ethers` object returned from network.connect to ensure compatibility
const tokenContract = new ethers.Contract(TOKEN_ADDRESS, abi, sender);

// 5. Fetch Token Details & Balance
const symbol = await tokenContract.symbol();
const decimals = await tokenContract.decimals();
const balance = await tokenContract.balanceOf(sender.address);

console.log(`Token: ${symbol} (Decimals: ${decimals})`);
console.log(`Current Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);

// 6. Prepare Transfer
const amountToSend = ethers.parseUnits(AMOUNT_STR, decimals);

if (balance < amountToSend) {
  console.error("❌ Error: Insufficient balance");
  process.exit(1);
}

// 7. Execute Transfer
console.log(`\nSending ${AMOUNT_STR} ${symbol} to ${RECIPIENT}...`);

const tx = await tokenContract.transfer(RECIPIENT, amountToSend, {
  gasLimit: 210000
});
console.log("Transaction sent. Hash:", tx.hash);

await tx.wait();

console.log("✅ Transaction confirmed successfully");