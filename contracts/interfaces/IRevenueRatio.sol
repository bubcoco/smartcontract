// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Revenue Ratio Precompiled Contract
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface IRevenueRatio {
    /**
     * @notice Checks whether the revenue ratio is currently enabled.
     * @dev Returns a boolean indicating if the revenue ratio is active.
     * @return True if the system is enabled, otherwise false.
     */
    function status() external view returns (bool);

    /**
     * @notice Enables the revenue ratio.
     * @dev Activates the system, allowing it to manage revenue ratio.
     * @return True if the system was successfully enabled, otherwise false.
     */
    function enable() external returns (bool);

    /**
     * @notice Disables the revenue ratio.
     * @dev Deactivates the system, preventing it from managing revenue ratio.
     * @return True if the system was successfully disabled, otherwise false.
     */
    function disable() external returns (bool);

    /**
     * @notice Retrieves the contract-specific revenue ratio.
     * @dev Calls the precompiled contract to get the ratio for the smart contract.
     * @return The revenue ratio as a uint256 value.
     */
    function contractRatio() external view returns (uint256);

    /**
     * @notice Retrieves the coinbase-specific revenue ratio.
     * @dev Calls the precompiled contract to get the ratio for the block's coinbase (block producer).
     * @return The coinbase revenue ratio as a uint256 value.
     */
    function coinbaseRatio() external view returns (uint256);

    /**
     * @notice Retrieves the provider-specific revenue ratio.
     * @dev Calls the precompiled contract to get the ratio for the service provider.
     * @return The provider revenue ratio as a uint256 value.
     */
    function providerRatio() external view returns (uint256);

    /**
     * @notice Retrieves the treasury revenue ratio.
     * @dev Calls the precompiled contract to get the ratio for the treasury.
     * @return The provider revenue ratio as a uint256 value.
     */
    function treasuryRatio() external view returns (uint256);

    /**
     * @notice Sets new revenue ratios for the contract, coinbase, and provider.
     * @dev Updates the revenue ratios to the specified values. Each ratio is provided as a percentage (0-100).
     * The sum of all three ratios should not exceed 100% to ensure proper allocation.
     * @param contractRatio The revenue ratio allocated to the contract, specified as a uint8 percentage (0-100).
     * @param coinbaseRatio The revenue ratio allocated to the block producer (coinbase), specified as a uint8 percentage (0-100).
     * @param providerRatio The revenue ratio allocated to the service provider, specified as a uint8 percentage (0-100).
     * @param treasuryRatio The revenue ratio allocated to the treasury, specified as a uint8 percentage (0-100).
     * @return True if the revenue ratios were successfully updated, otherwise false.
     */
    function setRevenueRatio(uint8 contractRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio) external returns (bool);
}
