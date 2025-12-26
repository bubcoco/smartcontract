import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileRevenueRatioModule = buildModule("PrecompileRevenueRatioModule", (m) => {
    const precompileRevenueRatio = m.contract("PrecompileRevenueRatio");

    return { precompileRevenueRatio };
});

export default PrecompileRevenueRatioModule;
