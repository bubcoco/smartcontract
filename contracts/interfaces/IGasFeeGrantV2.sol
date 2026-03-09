// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title IGasFeeGrantV2
 * @notice Interface for the GasFeeGrant precompile (besutest/dev version)
 * @dev Precompile address: 0x0000000000000000000000000000000000001006
 *
 * This precompile uses a dual-layer ACL model:
 *   1. Contract Grant: allows a granter to pay gas for calls to a specific contract+function
 *   2. User Grant: allows a granter to pay gas for a specific user (sender)
 *
 * Both a contract grant AND a user grant must exist for the gas fee grant to activate.
 */
interface IGasFeeGrantV2 {
    // ═══════════════════════════════════════════════════════════════
    // Ownership
    // ═══════════════════════════════════════════════════════════════

    /// @notice Returns the current owner of the precompile
    function owner() external view returns (address);

    /// @notice Returns whether the precompile has been initialized
    function initialized() external view returns (bool);

    /// @notice Initializes the owner (can only be called once)
    /// @param _owner The address to set as owner
    function initializeOwner(address _owner) external returns (bool);

    /// @notice Transfers ownership to a new address (owner only)
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external returns (bool);

    // ═══════════════════════════════════════════════════════════════
    // Contract Grants
    // ═══════════════════════════════════════════════════════════════

    /// @notice Adds a contract-level grant (owner only)
    /// @param toContract The target contract address
    /// @param funcSig The 4-byte function selector to grant
    /// @param granter The address that will pay gas fees
    function addGrantContract(
        address toContract,
        bytes4 funcSig,
        address granter
    ) external returns (bool);

    /// @notice Removes a contract-level grant (owner only)
    /// @param toContract The target contract address
    /// @param funcSig The 4-byte function selector
    /// @param granter The granter address to remove
    function removeGrantContract(
        address toContract,
        bytes4 funcSig,
        address granter
    ) external returns (bool);

    /// @notice Checks if a contract-level grant exists
    /// @param toContract The target contract address
    /// @param funcSig The 4-byte function selector
    /// @param granter The granter address to check
    function isGrantContract(
        address toContract,
        bytes4 funcSig,
        address granter
    ) external view returns (bool);

    // ═══════════════════════════════════════════════════════════════
    // User Grants
    // ═══════════════════════════════════════════════════════════════

    /// @notice Adds a user-level grant (owner only)
    /// @param user The user address (tx sender) to grant
    /// @param granter The address that will pay gas fees
    function addGrantUser(
        address user,
        address granter
    ) external returns (bool);

    /// @notice Removes a user-level grant (owner only)
    /// @param user The user address to remove
    /// @param granter The granter address
    function removeGrantUser(
        address user,
        address granter
    ) external returns (bool);

    /// @notice Checks if a user-level grant exists
    /// @param user The user address to check
    /// @param granter The granter address to check
    function isGrantUser(
        address user,
        address granter
    ) external view returns (bool);
}
