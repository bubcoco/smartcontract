// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Ownable for Precompiled Contract
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface IOwnable {
    /**
     * @notice Retrieves the address of the current owner.
     * @dev Returns the address that currently has ownership of the contract.
     * @return The address of the current owner.
     */
    function owner() external view returns (address);

    /**
     * @notice Transfers ownership of the contract to a new owner.
     * @dev Assigns the `newOwner` as the owner, replacing the current owner.
     * @param newOwner The address of the new owner.
     * @return True if the ownership transfer was successful, otherwise false.
     */
    function transferOwnership(address newOwner) external returns (bool);

    /**
     * @notice Checks if the contract's ownership has been initialized.
     * @dev Returns true if the ownership has already been initialized, otherwise false.
     * @return A boolean indicating whether ownership is initialized.
     */
    function initialized() external view returns (bool);

    /**
     * @notice Initializes the contract's ownership to a specific owner.
     * @dev Sets the provided `owner` as the initial owner of the contract.
     * Can only be called once, typically during contract deployment.
     * @param owner The address to set as the initial owner.
     * @return True if ownership was successfully initialized, otherwise false.
     */
    function initializeOwner(address owner) external returns (bool);

    /**
     * @notice Initializes the contract's ownership and total supply to specific values.
     * @dev Sets the provided `owner` as the initial owner of the contract and `totalSupply` as the initial total supply.
     * Can only be called once, typically during contract deployment.
     * @param owner The address to set as the initial owner.
     * @param totalSupply The initial total supply to set.
     * @return True if ownership and total supply were successfully initialized, otherwise false.
     */
    function initializeOwnerAndSupply(address owner, uint256 totalSupply) external returns (bool);
}
