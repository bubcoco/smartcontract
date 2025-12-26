import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileControllerModule = buildModule("PrecompileControllerModule", (m) => {
    const precompileController = m.contract("PrecompileController");

    return { precompileController };
});

export default PrecompileControllerModule;
