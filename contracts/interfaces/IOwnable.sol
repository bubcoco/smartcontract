// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Ownable for Precompiled Contracts
 * @author Blockchain Department @ Advanced Info Services PCL
 * @dev Common ownership interface used by all custom precompiled contracts.
 *      All precompiles support: owner(), initialized(), initializeOwner(address), transferOwnership(address)
 */

interface IOwnable {
    /**
     * @notice Retrieves the address of the current owner.
     * @dev Returns the address that currently has ownership of the precompile.
     * @return The address of the current owner.
     */
    function owner() external view returns (address);

    /**
     * @notice Transfers ownership of the precompile to a new owner.
     * @dev Assigns the `newOwner` as the owner, replacing the current owner.
     *      Only the current owner can call this function.
     * @param newOwner The address of the new owner.
     * @return True if the ownership transfer was successful, otherwise false.
     */
    function transferOwnership(address newOwner) external returns (bool);

    /**
     * @notice Checks if the precompile's ownership has been initialized.
     * @dev Returns true if the ownership has already been initialized, otherwise false.
     * @return A boolean indicating whether ownership is initialized.
     */
    function initialized() external view returns (bool);

    /**
     * @notice Initializes the precompile's ownership to a specific owner.
     * @dev Sets the provided `owner` as the initial owner of the precompile.
     *      Can only be called once when the precompile is not yet initialized.
     * @param owner The address to set as the initial owner.
     * @return True if ownership was successfully initialized, otherwise false.
     */
    function initializeOwner(address owner) external returns (bool);
}
