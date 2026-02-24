const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MOCK_COUPON_ADDRESS = "0x18D80Bf7B2a970544081633c3561b2852182a8c1";

async function main() {
    console.log("Connecting to provider...");
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");

    console.log("Checking block number...");
    const block = await provider.getBlockNumber();
    console.log("Block Number:", block);

    console.log(`Checking code at ${MOCK_COUPON_ADDRESS}...`);
    const code = await provider.getCode(MOCK_COUPON_ADDRESS);
    console.log("Code length:", code.length);

    if (code === "0x") {
        console.error("Contract not found!");
        return;
    }

    const privateKey = process.env.PRIV_KEY;
    if (!privateKey) throw new Error("PRIV_KEY not found");
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log("Wallet address:", wallet.address);

    // Try owner() call
    // BaseCoupon extends Ownable
    const abi = ["function owner() view returns (address)"];
    const contract = new ethers.Contract(MOCK_COUPON_ADDRESS, abi, provider);

    console.log("Calling owner()...");
    const owner = await contract.owner();
    console.log("Owner:", owner);
}

main().catch(console.error);
