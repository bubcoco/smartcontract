import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "ethers";

const MarketplaceModule = buildModule("MarketplaceModule", (m) => {
  // Parameters
  const feeRecipient = m.getParameter("feeRecipient", "0x97236A4A5A3Fba78AA248C4b6130e0946Fd8421d");
  const platformFee = m.getParameter("platformFee", 250); // 2.5%

  // Deploy Marketplace
  const marketplace = m.contract("Marketplace", [feeRecipient, platformFee]);

  // Deploy mock tokens for testing (optional)
  const MockERC20 = m.contractAt("GameToken", "0xE9764543bF2E5a266dD6b36E23f9875B3cF6e3c5"); // Replace with actual contract
  
  return { marketplace };
});

export default MarketplaceModule;