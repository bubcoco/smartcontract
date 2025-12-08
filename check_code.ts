import { JsonRpcProvider } from "ethers";

async function main() {
    const provider = new JsonRpcProvider("http://localhost:8545");
    const address = "0xcA7164A34AB9B3564cADf7d7d811d1012f05055a";
    const code = await provider.getCode(address);
    console.log(`Code at ${address}: ${code.slice(0, 50)}...`);
    if (code === "0x") {
        console.log("No code found at address.");
    } else {
        console.log("Code found at address.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
