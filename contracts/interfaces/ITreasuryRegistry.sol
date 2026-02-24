// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Treasury Registry Precompile Contract
 * @author Kiwari Labs
 */

interface ITreasuryRegistry {
    /**
     * @notice Sets the treasury address at a specific index.
     * @param index The index position for the treasury address.
     * @param treasury The treasury address to set.
     * @return success True if the operation was successful, otherwise false.
     */
    function setTreasury(
        uint256 index,
        address treasury
    ) external returns (bool success);

    /**
     * @notice Returns the treasury address at a specific index.
     * @param index The index position to query.
     * @return The treasury address at the specified index.
     */
    function treasuryAt(uint256 index) external view returns (address);

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
