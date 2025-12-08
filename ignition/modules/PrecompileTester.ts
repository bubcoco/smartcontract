import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileTesterModule = buildModule("PrecompileTesterModule", (m) => {
    const precompileTester = m.contract("PrecompileTester");

    return { precompileTester };
});

export default PrecompileTesterModule;
