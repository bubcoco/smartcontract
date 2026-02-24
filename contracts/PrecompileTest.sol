// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./AllPrecompile.sol";

/**
 * @title Precompile Test Contract
 * @author Kiwari Labs
 * @notice A wrapper contract for manual testing of all precompiled contracts.
 */
contract PrecompileTest {
    // ============================================
    // NativeMinter Functions (0x...1001)
    // ============================================

    function nativeMinter_initializeOwnerAndSupply(
        address initialOwner,
        uint256 initialSupply
    ) external returns (bool success, string memory message) {
        return
            AllPrecompile.nativeMinter().initializeOwnerAndSupply(
                initialOwner,
                initialSupply
            );
    }

    function nativeMinter_owner() external view returns (address) {
        return AllPrecompile.nativeMinter().owner();
    }

    function nativeMinter_mint(
        address to,
        uint256 value
    ) external returns (bool success, string memory message) {
        return AllPrecompile.nativeMinter().mint(to, value);
    }

    function nativeMinter_totalSupply() external view returns (uint256) {
        return AllPrecompile.nativeMinter().totalSupply();
    }

    function nativeMinter_transferOwnership(
        address newOwner
    ) external returns (bool success) {
        return AllPrecompile.nativeMinter().transferOwnership(newOwner);
    }

    // ============================================
    // AddressRegistry Functions (0x...1002)
    // ============================================

    function addressRegistry_addToRegistry(
        address account
    ) external returns (bool success) {
        return AllPrecompile.addressRegistry().addToRegistry(account);
    }

    function addressRegistry_removeFromRegistry(
        address account
    ) external returns (bool success) {
        return AllPrecompile.addressRegistry().removeFromRegistry(account);
    }

    function addressRegistry_contains(
        address account
    ) external view returns (bool) {
        return AllPrecompile.addressRegistry().contains(account);
    }

    function addressRegistry_discovery()
        external
        view
        returns (address[] memory)
    {
        return AllPrecompile.addressRegistry().discovery();
    }

    function addressRegistry_owner() external view returns (address) {
        return AllPrecompile.addressRegistry().owner();
    }

    function addressRegistry_admin() external view returns (address) {
        return AllPrecompile.addressRegistry().admin();
    }

    function addressRegistry_transferAdmin(
        address newAdmin
    ) external returns (bool success) {
        return AllPrecompile.addressRegistry().transferAdmin(newAdmin);
    }

    // ============================================
    // GasPrice Functions (0x...1003)
    // ============================================

    function gasPrice_enable() external returns (bool success) {
        return AllPrecompile.gasPrice().enable();
    }

    function gasPrice_disable() external returns (bool success) {
        return AllPrecompile.gasPrice().disable();
    }

    function gasPrice_setGasPrice(
        uint256 newGasPrice
    ) external returns (bool success) {
        return AllPrecompile.gasPrice().setGasPrice(newGasPrice);
    }

    function gasPrice_getSCR() external view returns (uint256) {
        return AllPrecompile.gasPrice().getSCR();
    }

    function gasPrice_getOperationFees() external view returns (uint256) {
        return AllPrecompile.gasPrice().getOperationFees();
    }

    function gasPrice_owner() external view returns (address) {
        return AllPrecompile.gasPrice().owner();
    }

    function gasPrice_admin() external view returns (address) {
        return AllPrecompile.gasPrice().admin();
    }

    function gasPrice_transferAdmin(
        address newAdmin
    ) external returns (bool success) {
        return AllPrecompile.gasPrice().transferAdmin(newAdmin);
    }

    // ============================================
    // RevenueRatio Functions (0x...1004)
    // ============================================

    function revenueRatio_enable() external returns (bool success) {
        return AllPrecompile.revenueRatio().enable();
    }

    function revenueRatio_disable() external returns (bool success) {
        return AllPrecompile.revenueRatio().disable();
    }

    function revenueRatio_setRevenueRatio(
        uint256 sender,
        uint256 coinbase,
        uint256 provider,
        uint256 treasury
    ) external returns (bool success) {
        return
            AllPrecompile.revenueRatio().setRevenueRatio(
                sender,
                coinbase,
                provider,
                treasury
            );
    }

    function revenueRatio_senderRatio() external view returns (uint256) {
        return AllPrecompile.revenueRatio().senderRatio();
    }

    function revenueRatio_coinbaseRatio() external view returns (uint256) {
        return AllPrecompile.revenueRatio().coinbaseRatio();
    }

    function revenueRatio_providerRatio() external view returns (uint256) {
        return AllPrecompile.revenueRatio().providerRatio();
    }

    function revenueRatio_treasuryRatio() external view returns (uint256) {
        return AllPrecompile.revenueRatio().treasuryRatio();
    }

    function revenueRatio_owner() external view returns (address) {
        return AllPrecompile.revenueRatio().owner();
    }

    function revenueRatio_admin() external view returns (address) {
        return AllPrecompile.revenueRatio().admin();
    }

    function revenueRatio_transferAdmin(
        address newAdmin
    ) external returns (bool success) {
        return AllPrecompile.revenueRatio().transferAdmin(newAdmin);
    }

    // ============================================
    // TreasuryRegistry Functions (0x...1005)
    // ============================================

    function treasuryRegistry_setTreasury(
        uint256 index,
        address treasury
    ) external returns (bool success) {
        return AllPrecompile.treasuryRegistry().setTreasury(index, treasury);
    }

    function treasuryRegistry_treasuryAt(
        uint256 index
    ) external view returns (address) {
        return AllPrecompile.treasuryRegistry().treasuryAt(index);
    }

    function treasuryRegistry_owner() external view returns (address) {
        return AllPrecompile.treasuryRegistry().owner();
    }

    function treasuryRegistry_admin() external view returns (address) {
        return AllPrecompile.treasuryRegistry().admin();
    }

    function treasuryRegistry_transferAdmin(
        address newAdmin
    ) external returns (bool success) {
        return AllPrecompile.treasuryRegistry().transferAdmin(newAdmin);
    }

    // ============================================
    // GasFeeGrant Functions (0x...1006)
    // ============================================

    function gasFeeGrant_addGrantUser(
        address user
    ) external returns (bool success) {
        return AllPrecompile.gasFeeGrant().addGrantUser(user);
    }

    function gasFeeGrant_removeGrantUser(
        address user
    ) external returns (bool success) {
        return AllPrecompile.gasFeeGrant().removeGrantUser(user);
    }

    function gasFeeGrant_addGrantContract(
        address contractAddress
    ) external returns (bool success) {
        return AllPrecompile.gasFeeGrant().addGrantContract(contractAddress);
    }

    function gasFeeGrant_removeGrantContract(
        address contractAddress
    ) external returns (bool success) {
        return AllPrecompile.gasFeeGrant().removeGrantContract(contractAddress);
    }

    function gasFeeGrant_isGranted(
        address account
    ) external view returns (bool) {
        return AllPrecompile.gasFeeGrant().isGranted(account);
    }

    function gasFeeGrant_getGranter(
        address from,
        address to
    ) external returns (address) {
        return AllPrecompile.gasFeeGrant().getGranter(from, to);
    }
}
