// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileRegistry
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A contract that interacts with the AddressRegistry precompile to manage address registrations
 * @dev This contract wraps the AddressRegistry precompile at 0x0000000000000000000000000000000000001002
 *      and provides a convenient interface for managing address registrations from smart contracts.
 *
 *      The precompile must be initialized with an owner before registry management can occur.
 *      Only the owner of the precompile can add or remove addresses from the registry.
 */
contract PrecompileRegistry {
    /// @notice The address of the AddressRegistry precompile
    address public constant ADDRESS_REGISTRY_PRECOMPILE =
        0x0000000000000000000000000000000000001002;

    /// @notice Emitted when an address is added to the registry
    event AddressRegistered(address indexed account, address indexed initiator);

    /// @notice Emitted when an address is removed from the registry
    event AddressRemoved(address indexed account);

    /// @notice Emitted when the precompile owner is initialized
    event OwnerInitialized(address indexed owner);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev Custom errors for better gas efficiency
    error AddToRegistryFailed(address account);
    error RemoveFromRegistryFailed(address account);
    error InitializationFailed(address owner);
    error OwnershipTransferFailed(address newOwner);
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidAddress();
    error AddressAlreadyRegistered(address account);
    error AddressNotRegistered(address account);

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current owner of the AddressRegistry precompile
     * @return The address of the current owner
     */
    function owner() external view returns (address) {
        return IOwnable(ADDRESS_REGISTRY_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the AddressRegistry precompile has been initialized
     * @return True if initialized, false otherwise
     */
    function initialized() external view returns (bool) {
        return IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized();
    }

    /**
     * @notice Checks if an address exists in the registry
     * @param _account The address to check in the registry
     * @return True if the address exists in the registry, otherwise false
     */
    function contains(address _account) external view returns (bool) {
        return IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE).contains(_account);
    }

    /**
     * @notice Retrieves the associated discovery address for a given account
     * @param _account The address to discover in the registry
     * @return The associated discovery address, or the zero address if none exists
     */
    function discovery(address _account) external view returns (address) {
        return
            IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE).discovery(_account);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the owner of the AddressRegistry precompile
     * @dev Can only be called once when the precompile is not initialized
     * @param _owner The address to set as the initial owner
     * @return success True if initialization was successful
     */
    function initializeOwner(address _owner) external returns (bool success) {
        if (IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized()) {
            revert AlreadyInitialized();
        }

        success = IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initializeOwner(_owner);

        if (!success) {
            revert InitializationFailed(_owner);
        }

        emit OwnerInitialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ownership Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Transfers ownership of the AddressRegistry precompile to a new owner
     * @dev Only the current owner can call this function
     * @param _newOwner The address of the new owner
     * @return success True if ownership transfer was successful
     */
    function transferOwnership(
        address _newOwner
    ) external returns (bool success) {
        address previousOwner = IOwnable(ADDRESS_REGISTRY_PRECOMPILE).owner();

        success = IOwnable(ADDRESS_REGISTRY_PRECOMPILE).transferOwnership(
            _newOwner
        );

        if (!success) {
            revert OwnershipTransferFailed(_newOwner);
        }

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Registry Management Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Adds an account to the registry with the specified initiator
     * @dev Only the owner of the precompile can add addresses
     * @param _account The address to add to the registry
     * @param _initiator The address of the initiator adding the account
     * @return success True if the addition was successful
     */
    function addToRegistry(
        address _account,
        address _initiator
    ) external returns (bool success) {
        if (!IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_account == address(0) || _initiator == address(0)) {
            revert InvalidAddress();
        }

        success = IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE).addToRegistry(
            _account,
            _initiator
        );

        if (!success) {
            revert AddToRegistryFailed(_account);
        }

        emit AddressRegistered(_account, _initiator);
    }

    /**
     * @notice Adds an account to the registry using msg.sender as the initiator
     * @dev Convenience function that uses msg.sender as the initiator
     * @param _account The address to add to the registry
     * @return success True if the addition was successful
     */
    function register(address _account) external returns (bool success) {
        if (!IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_account == address(0)) {
            revert InvalidAddress();
        }

        success = IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE).addToRegistry(
            _account,
            msg.sender
        );

        if (!success) {
            revert AddToRegistryFailed(_account);
        }

        emit AddressRegistered(_account, msg.sender);
    }

    /**
     * @notice Removes an account from the registry
     * @dev Only the owner of the precompile can remove addresses
     * @param _account The address to remove from the registry
     * @return success True if the removal was successful
     */
    function removeFromRegistry(
        address _account
    ) external returns (bool success) {
        if (!IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_account == address(0)) {
            revert InvalidAddress();
        }

        success = IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE)
            .removeFromRegistry(_account);

        if (!success) {
            revert RemoveFromRegistryFailed(_account);
        }

        emit AddressRemoved(_account);
    }

    /**
     * @notice Batch adds multiple accounts to the registry
     * @dev Only the owner of the precompile can add addresses
     * @param _accounts Array of addresses to add to the registry
     * @param _initiator The address of the initiator adding the accounts
     * @return success True if all additions were successful
     */
    function batchAddToRegistry(
        address[] calldata _accounts,
        address _initiator
    ) external returns (bool success) {
        require(_accounts.length > 0, "Empty accounts array");

        if (!IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_initiator == address(0)) {
            revert InvalidAddress();
        }

        for (uint256 i = 0; i < _accounts.length; i++) {
            if (_accounts[i] == address(0)) {
                revert InvalidAddress();
            }

            bool addSuccess = IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE)
                .addToRegistry(_accounts[i], _initiator);

            if (!addSuccess) {
                revert AddToRegistryFailed(_accounts[i]);
            }

            emit AddressRegistered(_accounts[i], _initiator);
        }

        return true;
    }

    /**
     * @notice Batch removes multiple accounts from the registry
     * @dev Only the owner of the precompile can remove addresses
     * @param _accounts Array of addresses to remove from the registry
     * @return success True if all removals were successful
     */
    function batchRemoveFromRegistry(
        address[] calldata _accounts
    ) external returns (bool success) {
        require(_accounts.length > 0, "Empty accounts array");

        if (!IOwnable(ADDRESS_REGISTRY_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        for (uint256 i = 0; i < _accounts.length; i++) {
            if (_accounts[i] == address(0)) {
                revert InvalidAddress();
            }

            bool removeSuccess = IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE)
                .removeFromRegistry(_accounts[i]);

            if (!removeSuccess) {
                revert RemoveFromRegistryFailed(_accounts[i]);
            }

            emit AddressRemoved(_accounts[i]);
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Checks if this contract's address is the owner of the precompile
     * @return True if this contract is the owner
     */
    function isContractOwner() external view returns (bool) {
        return IOwnable(ADDRESS_REGISTRY_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Returns the precompile address for reference
     * @return The address of the AddressRegistry precompile
     */
    function getPrecompileAddress() external pure returns (address) {
        return ADDRESS_REGISTRY_PRECOMPILE;
    }

    /**
     * @notice Checks if multiple accounts are registered
     * @param _accounts Array of addresses to check
     * @return results Array of booleans indicating registration status
     */
    function batchContains(
        address[] calldata _accounts
    ) external view returns (bool[] memory results) {
        results = new bool[](_accounts.length);
        for (uint256 i = 0; i < _accounts.length; i++) {
            results[i] = IAddressRegistry(ADDRESS_REGISTRY_PRECOMPILE).contains(
                _accounts[i]
            );
        }
    }
}
