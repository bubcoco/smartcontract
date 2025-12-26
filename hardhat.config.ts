import type { HardhatUserConfig } from "hardhat/config";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@nomicfoundation/hardhat-ethers";
import { configVariable } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { network } from "hardhat";
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
      apiKey: "SCAN_API_KEY",
      chainDescriptors: {
        235: {
          name: "loaffinity",
          blockExplorers: {
            etherscan: {
              name: "Loaffinity Explorer",
              url: "http://localhost",
              apiUrl: "http://localhost:4000/api",
            },
            blockscout: {
              name: "Loaffinity Explorer",
              url: "http://localhost",
              apiUrl: "http://localhost:4000/api",
            },
          },
        },
        80002: {
          name: "amoy",
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
    },
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
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
    235: {
      name: "loaffinity",
      blockExplorers: {
        // etherscan: {
        //   name: "Loaffinity Explorer",
        //   url: "http://localhost",
        //   apiUrl: "http://localhost:4000/api",
        // },
        blockscout: {
          name: "Loaffinity Explorer",
          url: "http://localhost",
          apiUrl: "http://localhost:4000/api",
          // gas: 4000000,
        },
      },
    },
    116687680: {
      name: "dlt",
      blockExplorers: {
        blockscout: {
          name: "DLT Explorer",
          url: "https://loafscoutevm-dev.adldigitalservice.com/",
          apiUrl: "https://loafscoutevm-dev.adldigitalservice.com/api",
        },
      },
    },

    80002: {
      name: "amoy",
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
    hardhat: {
      type: "edr-simulated",
      blockGasLimit: 30000000,
      allowUnlimitedContractSize: true,
    },
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      blockGasLimit: 30000000,
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
      blockGasLimit: 30000000,
    },
    dlt: {
      type: "http",
      url: "https://dlp-rpc2-testnet.adldigitalservice.com",
      accounts: [configVariable("DLT_KEY")],
      chainId: 116687680,
      gasPrice: 0,
    },
    amoy: {
      type: "http",
      url: "https://rpc-amoy.polygon.technology/",
      chainId: 80002,
      // accounts: WALLET_PRIVATE_KEY ? [$WALLET_PRIVATE_KEY] : [],
      accounts: [configVariable("PRIV_KEY")],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIV_KEY")],
    },
    loaffinity: {
      type: "http",
      chainId: 235,
      chainType: "l1",
      accounts: [configVariable("PRIV_KEY")],
      // accounts: [configVariable("Validator2")],
      // accounts: [configVariable("Validator2")],
      url: 'http://localhost:8545',
      // gasPrice: 100000000000000,
    },
  },
};

export default config;