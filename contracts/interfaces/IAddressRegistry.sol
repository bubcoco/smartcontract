// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Address Registry Precompiled Contract
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface IAddressRegistry {
    /**
     * @notice Checks if an address exists in the registry.
     * @dev Performs a lookup to determine if the specified account is registered.
     * @param account The address to check in the registry.
     * @return True if the address exists in the registry, otherwise false.
     */
    function contains(address account) external view returns (bool);

    /**
     * @notice Retrieves the associated discovery address for a given account.
     * @dev This function available only in abstract contract, returns the address linked to the provided account.
     * @param account The address to discover in the registry.
     * @return The associated discovery address, or the zero address if none exists.
     */
    function discovery(address account) external view returns (address);

    /**
     * @notice Adds an account to the registry with the specified initiator.
     * @dev Records the provided account and its initiator into the registry.
     * @param account The address to add to the registry.
     * @param initiator The address of the initiator adding the account.
     * @return True if the addition was successful, otherwise false.
     */
    function addToRegistry(address account, address initiator) external returns (bool);

    /**
     * @notice Removes an account from the registry with the specified initiator.
     * @dev Deletes the provided account from the registry.
     * @param account The address to remove from the registry.
     * @return True if the removal was successful, otherwise false.
     */
    function removeFromRegistry(address account) external returns (bool);
}
