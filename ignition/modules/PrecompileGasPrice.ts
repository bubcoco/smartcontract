import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrecompileGasPriceModule = buildModule("PrecompileGasPriceModule", (m) => {
    const precompileGasPrice = m.contract("PrecompileGasPrice");

    return { precompileGasPrice };
});

export default PrecompileGasPriceModule;
