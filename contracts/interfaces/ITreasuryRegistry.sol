// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Treasury Registry Precompiled Contract
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface ITreasuryRegistry {
    /**
     * @notice Retrieves the current treasury address.
     * @dev This function is expected to return the address of the current treasury.
     * @return The address of the current treasury.
     */
    function treasuryAt() external view returns (address);

    /**
     * @notice Updates the treasury address.
     * @dev This function sets a new address as the treasury. Returns `true` if the operation succeeds.
     * @param newTreasury The new address to be set as the treasury.
     * @return `true` if the treasury address is successfully updated, otherwise `false`.
     */
    function setTreasury(address newTreasury) external returns (bool);
}
