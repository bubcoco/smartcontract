const hre = require("hardhat");

async function main() {
    console.log("HRE keys:", Object.keys(hre));
    console.log("Has ethers?", !!hre.ethers);

    if (hre.network) {
        console.log("Network name:", hre.network.name);
    } else {
        console.log("Network is undefined");
    }
}

main().catch(console.error);
