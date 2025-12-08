require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-ignition-ethers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config({ path: __dirname + "/.env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        loaffinity: {
            type: "http",
            url: "http://localhost:8545",
            accounts: process.env.PRIV_KEY ? [process.env.PRIV_KEY] : [],
            chainId: 235,
        },
    },
    etherscan: {
        apiKey: {
            loaffinity: "abc",
        },
        customChains: [
            {
                network: "loaffinity",
                chainId: 235,
                urls: {
                    apiURL: "http://localhost:4000/api",
                    browserURL: "http://localhost:4000",
                },
            },
        ],
    },
};
