import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "ethers";

const MarketplaceModule = buildModule("MarketplaceModule", (m) => {
  // Parameters
  const feeRecipient = m.getParameter("feeRecipient", "0xae76b11cece311717934938510327203a373e826");
  const platformFee = m.getParameter("platformFee", 250); // 2.5%

  // Deploy Marketplace
  const marketplace = m.contract("Marketplace", [feeRecipient, platformFee]);

  // Deploy mock tokens for testing (optional)
  const MockERC20 = m.contractAt("Token", "0x2c475903Ef9ff74280707cbEB5e0fA64Ab9119d0"); // Replace with actual contract
  
  return { marketplace };
});

export default MarketplaceModule;