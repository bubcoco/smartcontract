import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition module for deploying the ExpireNFT contract
 * 
 * Basic Usage:
 * npx hardhat ignition deploy ignition/modules/ExpireNFT.ts --network <network-name>
 * 
 * With custom parameters:
 * npx hardhat ignition deploy ignition/modules/ExpireNFT.ts --network sepolia --parameters ignition/parameters.json
 * 
 * Example parameters.json:
 * {
 *   "ExpireNFTModule": {
 *     "name": "My Expire NFT",
 *     "symbol": "MYNFT",
 *     "mintPrice": "10000000000000000",
 *     "baseURI": "ipfs://QmX.../",
 *     "expireDate": "1735689600",
 *     "activityStart": "1704067200",
 *     "activityEnd": "1735689600"
 *   }
 * }
 */
const ExpireNFTModule = buildModule("ExpireNFTModule", (m) => {
  // Parameters that can be overridden during deployment
  const name = m.getParameter("name", "ExpireNFT");
  const symbol = m.getParameter("symbol", "ENFT");
  
  // Deploy the contract
  const expireNFT = m.contract("ExpireNFT", [name, symbol]);

  // Optional: Set configuration after deployment
  // Uncomment and modify these if you want to set initial configuration
  
  // Set mint price (0.01 ETH example)
  // const mintPrice = m.getParameter("mintPrice", "10000000000000000"); // 0.01 ETH in wei
  // m.call(expireNFT, "setMintPrice", [mintPrice]);

  // Set base URI for metadata
  // const baseURI = m.getParameter("baseURI", "ipfs://YOUR_CID/");
  // m.call(expireNFT, "setBaseURI", [baseURI]);

  // Set expiration date (Unix timestamp)
  // Example: Set to 30 days from now
  // const currentTime = Math.floor(Date.now() / 1000);
  // const expireDate = m.getParameter("expireDate", (currentTime + 30 * 24 * 60 * 60).toString());
  // m.call(expireNFT, "setExpireDate", [expireDate]);

  // Set activity period
  // const activityStart = m.getParameter("activityStart", currentTime.toString());
  // const activityEnd = m.getParameter("activityEnd", (currentTime + 60 * 24 * 60 * 60).toString()); // 60 days
  // m.call(expireNFT, "setActivityPeriod", [activityStart, activityEnd]);

  return { expireNFT };
});

export default ExpireNFTModule;

/**
 * Advanced deployment module with initial configuration
 */
export const ExpireNFTWithConfigModule = buildModule("ExpireNFTWithConfigModule", (m) => {
  // Deploy parameters
  const name = m.getParameter("name", "ExpireNFT");
  const symbol = m.getParameter("symbol", "ENFT");
  
  // Configuration parameters
  const mintPrice = m.getParameter("mintPrice", "0"); // Free mint by default
  const baseURI = m.getParameter("baseURI", "");
  
  // Time parameters (defaults to no restrictions)
  const expireDate = m.getParameter("expireDate", "115792089237316195423570985008687907853269984665640564039457584007913129639935"); // max uint256
  const activityStart = m.getParameter("activityStart", Math.floor(Date.now() / 1000).toString());
  const activityEnd = m.getParameter("activityEnd", "115792089237316195423570984665640564039457584007913129639935"); // max uint256
  
  // Deploy the contract
  const expireNFT = m.contract("ExpireNFT", [name, symbol]);

  // Set mint price if not zero
  if (mintPrice !== "0") {
    m.call(expireNFT, "setMintPrice", [mintPrice], {
      id: "setMintPrice"
    });
  }

  // Set base URI if provided
  if (baseURI !== "") {
    m.call(expireNFT, "setBaseURI", [baseURI], {
      id: "setBaseURI"
    });
  }

  // Set expiration date if not max
  if (expireDate !== "115792089237316195423570985008687907853269984665640564039457584007913129639935") {
    m.call(expireNFT, "setExpireDate", [expireDate], {
      id: "setExpireDate"
    });
  }

  // Set activity period if customized
  const currentTime = Math.floor(Date.now() / 1000);
  if (activityStart !== currentTime.toString() || activityEnd !== "115792089237316195423570984665640564039457584007913129639935") {
    m.call(expireNFT, "setActivityPeriod", [activityStart, activityEnd], {
      id: "setActivityPeriod"
    });
  }

  return { expireNFT };
});