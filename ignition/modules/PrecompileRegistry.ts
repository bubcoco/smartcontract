import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileRegistryModule = buildModule("PrecompileRegistryModule", (m) => {
    const precompileRegistry = m.contract("PrecompileRegistry");

    return { precompileRegistry };
});

export default PrecompileRegistryModule;
