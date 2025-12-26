import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition module to deploy ALL precompile wrapper contracts at once
 * This deploys:
 * - PrecompileNativeMinter (0x1001)
 * - PrecompileRegistry (0x1002)
 * - PrecompileGasPrice (0x1003)
 * - PrecompileRevenueRatio (0x1004)
 * - PrecompileTreasury (0x1005)
 * - PrecompileGasFeeGrant (0x1006)
 * - PrecompileController (unified access to all)
 */
const PrecompileAllModule = buildModule("PrecompileAllModule", (m) => {
    // Deploy individual precompile wrappers
    const precompileNativeMinter = m.contract("PrecompileNativeMinter");
    const precompileRegistry = m.contract("PrecompileRegistry");
    const precompileGasPrice = m.contract("PrecompileGasPrice");
    const precompileRevenueRatio = m.contract("PrecompileRevenueRatio");
    const precompileTreasury = m.contract("PrecompileTreasury");
    const precompileGasFeeGrant = m.contract("PrecompileGasFeeGrant");

    // Deploy unified controller
    const precompileController = m.contract("PrecompileController");

    return {
        precompileNativeMinter,
        precompileRegistry,
        precompileGasPrice,
        precompileRevenueRatio,
        precompileTreasury,
        precompileGasFeeGrant,
        precompileController
    };
});

export default PrecompileAllModule;
