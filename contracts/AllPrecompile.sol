// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/INativeMinter.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IGasPrice.sol";
import "./interfaces/IRevenueRatio.sol";
import "./interfaces/ITreasuryRegistry.sol";
import "./interfaces/IGasFeeGrant.sol";

/**
 * @title All Precompile Contracts
 * @author Kiwari Labs
 * @notice This contract provides a centralized access point to all precompiled contracts.
 */

library AllPrecompile {
    // Precompile addresses
    address constant NATIVE_MINTER = 0x0000000000000000000000000000000000001001;
    address constant ADDRESS_REGISTRY =
        0x0000000000000000000000000000000000001002;
    address constant GAS_PRICE = 0x0000000000000000000000000000000000001003;
    address constant REVENUE_RATIO = 0x0000000000000000000000000000000000001004;
    address constant TREASURY_REGISTRY =
        0x0000000000000000000000000000000000001005;
    address constant GAS_FEE_GRANT = 0x0000000000000000000000000000000000001006;

    /**
     * @notice Returns the NativeMinter precompile interface.
     * @return The INativeMinter interface at the precompile address.
     */
    function nativeMinter() internal pure returns (INativeMinter) {
        return INativeMinter(NATIVE_MINTER);
    }

    /**
     * @notice Returns the AddressRegistry precompile interface.
     * @return The IAddressRegistry interface at the precompile address.
     */
    function addressRegistry() internal pure returns (IAddressRegistry) {
        return IAddressRegistry(ADDRESS_REGISTRY);
    }

    /**
     * @notice Returns the GasPrice precompile interface.
     * @return The IGasPrice interface at the precompile address.
     */
    function gasPrice() internal pure returns (IGasPrice) {
        return IGasPrice(GAS_PRICE);
    }

    /**
     * @notice Returns the RevenueRatio precompile interface.
     * @return The IRevenueRatio interface at the precompile address.
     */
    function revenueRatio() internal pure returns (IRevenueRatio) {
        return IRevenueRatio(REVENUE_RATIO);
    }

    /**
     * @notice Returns the TreasuryRegistry precompile interface.
     * @return The ITreasuryRegistry interface at the precompile address.
     */
    function treasuryRegistry() internal pure returns (ITreasuryRegistry) {
        return ITreasuryRegistry(TREASURY_REGISTRY);
    }

    /**
     * @notice Returns the GasFeeGrant precompile interface.
     * @return The IGasFeeGrant interface at the precompile address.
     */
    function gasFeeGrant() internal pure returns (IGasFeeGrant) {
        return IGasFeeGrant(GAS_FEE_GRANT);
    }
}
