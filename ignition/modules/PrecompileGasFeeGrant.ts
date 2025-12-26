import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileGasFeeGrantModule = buildModule("PrecompileGasFeeGrantModule", (m) => {
    const precompileGasFeeGrant = m.contract("PrecompileGasFeeGrant");

    return { precompileGasFeeGrant };
});

export default PrecompileGasFeeGrantModule;
