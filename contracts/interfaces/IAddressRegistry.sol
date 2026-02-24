// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Address Registry Precompile Contract
 * @author Kiwari Labs
 */

interface IAddressRegistry {
    /**
     * @notice Adds an address to the registry.
     * @param account The address to add to the registry.
     * @return success True if the operation was successful, otherwise false.
     */
    function addToRegistry(address account) external returns (bool success);

    /**
     * @notice Removes an address from the registry.
     * @param account The address to remove from the registry.
     * @return success True if the operation was successful, otherwise false.
     */
    function removeFromRegistry(
        address account
    ) external returns (bool success);

    /**
     * @notice Checks if an address is in the registry.
     * @param account The address to check.
     * @return True if the address is in the registry, otherwise false.
     */
    function contains(address account) external view returns (bool);

    /**
     * @notice Discovers and returns information about registered addresses.
     * @return The list of registered addresses or discovery information.
     */
    function discovery() external view returns (address[] memory);

    /**
     * @notice Returns the address of the current owner.
     * @return The address of the owner.
     */
    function owner() external view returns (address);

    /**
     * @notice Returns the address of the current admin.
     * @return The address of the admin.
     */
    function admin() external view returns (address);

    /**
     * @notice Transfers admin rights to a new address.
     * @param newAdmin The address of the new admin.
     * @return success True if the admin transfer was successful, otherwise false.
     */
    function transferAdmin(address newAdmin) external returns (bool success);
}
