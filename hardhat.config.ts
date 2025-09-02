import type { HardhatUserConfig } from "hardhat/config";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
// import dotenv from "dotenv";
// dotenv.config();



const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin,
    hardhatKeystore,
    hardhatVerify
  ],
  verify: {
    blockscout: {
      enabled: false,
    },
    etherscan: {
      apiKey: "ARP3CNAQR8KAU94MZUACPH12HAMSZEWP6F",
      enabled: true,
    },

  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  chainDescriptors: {
    80002: {
      name: "amoy",
      blockExplorers: {
        etherscan: {
          name: "amoy",
          url: "https://rpc-amoy.polygon.technology/",
          apiUrl: "https://polygon-amoy.g.alchemy.com/v2/",
        },
        // other explorers...
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    amoy: {
      type: "http",
      url: "https://rpc-amoy.polygon.technology/",
      chainId: 80002,
      // accounts: WALLET_PRIVATE_KEY ? [`0x$WALLET_PRIVATE_KEY`] : [],
      accounts: [configVariable("WALLET_PRIVATE_KEY")],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
};

export default config;
