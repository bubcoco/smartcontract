// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Gas Price Precompile Contract
 * @author Kiwari Labs
 */

interface IGasPrice {
    /**
     * @notice Enables the gas price control mechanism.
     * @return success True if the operation was successful, otherwise false.
     */
    function enable() external returns (bool success);

    /**
     * @notice Disables the gas price control mechanism.
     * @return success True if the operation was successful, otherwise false.
     */
    function disable() external returns (bool success);

    /**
     * @notice Sets the gas price to a new value.
     * @param newGasPrice The new gas price value to set.
     * @return success True if the operation was successful, otherwise false.
     */
    function setGasPrice(uint256 newGasPrice) external returns (bool success);

    /**
     * @notice Returns the SCR (System Configuration Registry) value.
     * @return The current SCR value.
     */
    function getSCR() external view returns (uint256);

    /**
     * @notice Returns the operation fees configuration.
     * @return The current operation fees.
     */
    function getOperationFees() external view returns (uint256);

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
