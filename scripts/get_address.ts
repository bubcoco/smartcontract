import { ethers } from "ethers";

async function main() {
    const privateKey = "9f3d5b4c29b8a7d63a8b7a63dfb0c6c1b8e9a7d63a8b7a63dfb0c6c1b8e9a7d6";
    const wallet = new ethers.Wallet(privateKey);
    console.log("Address:", wallet.address);
}

main();
