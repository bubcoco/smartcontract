// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Native Minter Precompile Contract
 * @author Kiwari Labs
 */

interface INativeMinter {
    /**
     * @notice Initializes the contract with an owner and initial token supply.
     * @dev This function should only be called once during contract deployment.
     * @param initialOwner The address that will be set as the owner.
     * @param initialSupply The initial amount of native tokens to mint to the owner.
     * @return success True if the initialization was successful, otherwise false.
     * @return message A message describing the result of the operation.
     */
    function initializeOwnerAndSupply(
        address initialOwner,
        uint256 initialSupply
    ) external returns (bool success, string memory message);

    /**
     * @notice Returns the address of the current owner.
     * @return The address of the owner.
     */
    function owner() external view returns (address);

    /**
     * @notice Mints a specified amount of native tokens to a given address.
     * @dev This function creates native tokens and transfers them to the `to` address.
     * @param to The address that will receive the minted tokens.
     * @param value The amount of native tokens to mint.
     * @return success True if the minting operation was successful, otherwise false.
     * @return message A message describing the result of the operation.
     */
    function mint(
        address to,
        uint256 value
    ) external returns (bool success, string memory message);

    /**
     * @notice Returns the total supply of native tokens.
     * @return The total amount of native tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @notice Transfers ownership of the contract to a new address.
     * @param newOwner The address of the new owner.
     * @return success True if the ownership transfer was successful, otherwise false.
     */
    function transferOwnership(
        address newOwner
    ) external returns (bool success);
}
