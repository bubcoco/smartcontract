import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MarketplaceOatModule = buildModule("MarketplaceOatModule", (m) => {
    // All three addresses must be provided - no sensible defaults
    const thbToken = m.getParameter("thbToken");
    const couponContract = m.getParameter("couponContract");
    const vault = m.getParameter("vault");

    // Use fully qualified name: both Marketplace.sol and MarketplaceOat.sol define "Marketplace"
    const marketplaceOat = m.contract("contracts/MarketplaceOat.sol:Marketplace", [thbToken, couponContract, vault]);

    return { marketplaceOat };
});

export default MarketplaceOatModule;
