// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface GasPrice Precompiled Contract
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface IGasPrice {
    /**
     * @notice Retrieves the current gas price.
     * @dev This function returns the gas price configured in the system.
     * @return The current gas price as a uint256 value.
     */
    function gasPrice() external view returns (uint256);

    /**
     * @notice Checks whether the gas price system is currently enabled.
     * @dev Returns a boolean indicating if the gas price system is active.
     * @return True if the system is enabled, otherwise false.
     */
    function status() external view returns (bool);

    /**
     * @notice Enables the gas price system.
     * @dev Activates the system, allowing it to manage gas prices.
     * @return True if the system was successfully enabled, otherwise false.
     */
    function enable() external returns (bool);

    /**
     * @notice Disables the gas price system.
     * @dev Deactivates the system, preventing it from managing gas prices.
     * @return True if the system was successfully disabled, otherwise false.
     */
    function disable() external returns (bool);

    /**
     * @notice Sets a new gas price.
     * @dev Updates the gas price to the specified value.
     * @param price The new gas price to set, specified as a uint256 value.
     * @return True if the gas price was successfully updated, otherwise false.
     */
    function setGasPrice(uint256 price) external returns (bool);
}
