// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/ITreasuryRegistry.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileTreasury
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A contract that interacts with the TreasuryRegistry precompile to manage the treasury address
 * @dev This contract wraps the TreasuryRegistry precompile at 0x0000000000000000000000000000000000001005
 *      and provides a convenient interface for managing the treasury address from smart contracts.
 *
 *      The precompile must be initialized with an owner before treasury management can occur.
 *      Only the owner of the precompile can update the treasury address.
 */
contract PrecompileTreasury {
    /// @notice The address of the TreasuryRegistry precompile
    address public constant TREASURY_REGISTRY_PRECOMPILE =
        0x0000000000000000000000000000000000001005;

    /// @notice Emitted when the treasury address is updated
    event TreasuryUpdated(
        address indexed previousTreasury,
        address indexed newTreasury
    );

    /// @notice Emitted when the precompile owner is initialized
    event OwnerInitialized(address indexed owner);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev Custom errors for better gas efficiency
    error SetTreasuryFailed(address newTreasury);
    error InitializationFailed(address owner);
    error OwnershipTransferFailed(address newOwner);
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidTreasuryAddress();

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current owner of the TreasuryRegistry precompile
     * @return The address of the current owner
     */
    function owner() external view returns (address) {
        return IOwnable(TREASURY_REGISTRY_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the TreasuryRegistry precompile has been initialized
     * @return True if initialized, false otherwise
     */
    function initialized() external view returns (bool) {
        return IOwnable(TREASURY_REGISTRY_PRECOMPILE).initialized();
    }

    /**
     * @notice Retrieves the current treasury address
     * @return The address of the current treasury
     */
    function treasuryAt() external view returns (address) {
        return ITreasuryRegistry(TREASURY_REGISTRY_PRECOMPILE).treasuryAt();
    }

    /**
     * @notice Alias for treasuryAt() - returns the current treasury address
     * @return The address of the current treasury
     */
    function getTreasury() external view returns (address) {
        return ITreasuryRegistry(TREASURY_REGISTRY_PRECOMPILE).treasuryAt();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the owner of the TreasuryRegistry precompile
     * @dev Can only be called once when the precompile is not initialized
     * @param _owner The address to set as the initial owner
     * @return success True if initialization was successful
     */
    function initializeOwner(address _owner) external returns (bool success) {
        if (IOwnable(TREASURY_REGISTRY_PRECOMPILE).initialized()) {
            revert AlreadyInitialized();
        }

        success = IOwnable(TREASURY_REGISTRY_PRECOMPILE).initializeOwner(
            _owner
        );

        if (!success) {
            revert InitializationFailed(_owner);
        }

        emit OwnerInitialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ownership Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Transfers ownership of the TreasuryRegistry precompile to a new owner
     * @dev Only the current owner can call this function
     * @param _newOwner The address of the new owner
     * @return success True if ownership transfer was successful
     */
    function transferOwnership(
        address _newOwner
    ) external returns (bool success) {
        address previousOwner = IOwnable(TREASURY_REGISTRY_PRECOMPILE).owner();

        success = IOwnable(TREASURY_REGISTRY_PRECOMPILE).transferOwnership(
            _newOwner
        );

        if (!success) {
            revert OwnershipTransferFailed(_newOwner);
        }

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Treasury Management Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Updates the treasury address
     * @dev Only the owner of the precompile can update the treasury
     * @param _newTreasury The new address to set as the treasury
     * @return success True if the treasury address is successfully updated
     */
    function setTreasury(address _newTreasury) external returns (bool success) {
        if (!IOwnable(TREASURY_REGISTRY_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_newTreasury == address(0)) {
            revert InvalidTreasuryAddress();
        }

        address previousTreasury = ITreasuryRegistry(
            TREASURY_REGISTRY_PRECOMPILE
        ).treasuryAt();

        success = ITreasuryRegistry(TREASURY_REGISTRY_PRECOMPILE).setTreasury(
            _newTreasury
        );

        if (!success) {
            revert SetTreasuryFailed(_newTreasury);
        }

        emit TreasuryUpdated(previousTreasury, _newTreasury);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Checks if this contract's address is the owner of the precompile
     * @return True if this contract is the owner
     */
    function isContractOwner() external view returns (bool) {
        return IOwnable(TREASURY_REGISTRY_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Returns the precompile address for reference
     * @return The address of the TreasuryRegistry precompile
     */
    function getPrecompileAddress() external pure returns (address) {
        return TREASURY_REGISTRY_PRECOMPILE;
    }

    /**
     * @notice Checks if the treasury is currently set (not zero address)
     * @return True if a treasury address is set
     */
    function hasTreasury() external view returns (bool) {
        return
            ITreasuryRegistry(TREASURY_REGISTRY_PRECOMPILE).treasuryAt() !=
            address(0);
    }

    /**
     * @notice Checks if a given address is the current treasury
     * @param _address The address to check
     * @return True if the address matches the current treasury
     */
    function isTreasury(address _address) external view returns (bool) {
        return
            ITreasuryRegistry(TREASURY_REGISTRY_PRECOMPILE).treasuryAt() ==
            _address;
    }
}
