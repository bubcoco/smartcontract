import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileTreasuryModule = buildModule("PrecompileTreasuryModule", (m) => {
    const precompileTreasury = m.contract("PrecompileTreasury");

    return { precompileTreasury };
});

export default PrecompileTreasuryModule;
