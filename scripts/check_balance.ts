import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://dlp-rpc2-testnet.adldigitalservice.com");
    const address = "0x0901De08c53a7DD5Fb4A0Da93C3dC4e31761FD36";
    const balance = await provider.getBalance(address);
    console.log("Balance:", ethers.formatEther(balance));
}

main();
