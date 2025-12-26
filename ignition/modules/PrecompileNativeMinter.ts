import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileNativeMinterModule = buildModule("PrecompileNativeMinterModule", (m) => {
    const precompileNativeMinter = m.contract("PrecompileNativeMinter");

    return { precompileNativeMinter };
});

export default PrecompileNativeMinterModule;
