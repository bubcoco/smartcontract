import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileTestModule = buildModule("PrecompileTestModule", (m) => {
    const precompileTest = m.contract("PrecompileTest");

    return { precompileTest };
});

export default PrecompileTestModule;
