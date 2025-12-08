// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Admin
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface IAdmin {
    /**
     * @notice Retrieves the address of the current admin.
     * @dev This function returns the address that currently holds administrative rights.
     * @return The address of the admin.
     */
    function admin() external view returns (address);

    /**
     * @notice Transfers administrative rights to a new address.
     * @dev Sets a new address as the admin, replacing the current admin.
     * @param newOwner The address of the new admin.
     * @return True if the admin transfer was successful, otherwise false.
     */
    function transferAdmin(address newOwner) external returns (bool);
}
