import type { HardhatUserConfig } from "hardhat/config";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// Recreate __dirname for ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// dotenvConfig({ path: resolve(__dirname, "./.env") });

// const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";
// const SCAN_API_KEY = process.env.SCAN_API_KEY || "";

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
        blockscout: {
          name: "amoy",
          url: "https://amoy.polygonscan.com/",
          apiUrl: "https://api-amoy.polygonscan.com/api",
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
