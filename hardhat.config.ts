import type { HardhatUserConfig } from "hardhat/config";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin,
    hardhatKeystore,
    hardhatVerify
  ],
  verify: {
    blockscout: {
      enabled: true,
    },
    etherscan: {
      apiKey: configVariable("SCAN_API_KEY"),
      // apiKey: process.env.SCAN_API_KEY,
      customChains: [
    {
      network: "amoy",
      chainId: 80002,
      urls: {
        apiURL: "https://api.etherscan.io/v2/api",
        browserURL: "https://amoy.polygonscan.com/"
      }
    },
  ]
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
      chainId: 80002,
      blockExplorers: {
        etherscan: {
          name: "amoy",
          url: "https://amoy.polygonscan.com",
          apiUrl: "https://polygon-amoy.g.alchemy.com/v2/",
        },
        blockscout: {
          name: "amoy",
          url: "https://amoy.polygonscan.com/",
          apiUrl: "https://api.etherscan.io/v2/api",
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
      // accounts: WALLET_PRIVATE_KEY ? [$WALLET_PRIVATE_KEY] : [],
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
