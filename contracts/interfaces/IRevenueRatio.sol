// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Revenue Ratio Precompile Contract
 * @author Kiwari Labs
 */

interface IRevenueRatio {
    /**
     * @notice Enables the revenue ratio distribution mechanism.
     * @return success True if the operation was successful, otherwise false.
     */
    function enable() external returns (bool success);

    /**
     * @notice Disables the revenue ratio distribution mechanism.
     * @return success True if the operation was successful, otherwise false.
     */
    function disable() external returns (bool success);

    /**
     * @notice Sets the revenue ratio configuration.
     * @param sender The ratio allocated to the sender.
     * @param coinbase The ratio allocated to the coinbase (block producer).
     * @param provider The ratio allocated to the provider.
     * @param treasury The ratio allocated to the treasury.
     * @return success True if the operation was successful, otherwise false.
     */
    function setRevenueRatio(
        uint256 sender,
        uint256 coinbase,
        uint256 provider,
        uint256 treasury
    ) external returns (bool success);

    /**
     * @notice Returns the current sender ratio.
     * @return The sender ratio value.
     */
    function senderRatio() external view returns (uint256);

    /**
     * @notice Returns the current coinbase (block producer) ratio.
     * @return The coinbase ratio value.
     */
    function coinbaseRatio() external view returns (uint256);

    /**
     * @notice Returns the current provider ratio.
     * @return The provider ratio value.
     */
    function providerRatio() external view returns (uint256);

    /**
     * @notice Returns the current treasury ratio.
     * @return The treasury ratio value.
     */
    function treasuryRatio() external view returns (uint256);

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
