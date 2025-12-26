// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IRevenueRatio.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileRevenueRatio
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A contract that interacts with the RevenueRatio precompile to manage revenue distribution ratios
 * @dev This contract wraps the RevenueRatio precompile at 0x0000000000000000000000000000000000001004
 *      and provides a convenient interface for managing revenue ratios from smart contracts.
 *
 *      The precompile must be initialized with an owner before revenue ratio management can occur.
 *      Only the owner of the precompile can modify ratios and enable/disable the system.
 *      All ratios must sum to exactly 100%.
 */
contract PrecompileRevenueRatio {
    /// @notice The address of the RevenueRatio precompile
    address public constant REVENUE_RATIO_PRECOMPILE =
        0x0000000000000000000000000000000000001004;

    /// @notice Emitted when revenue ratios are updated
    event RevenueRatioUpdated(
        uint8 contractRatio,
        uint8 coinbaseRatio,
        uint8 providerRatio,
        uint8 treasuryRatio
    );

    /// @notice Emitted when the revenue ratio system is enabled
    event RevenueRatioEnabled(address indexed enabledBy);

    /// @notice Emitted when the revenue ratio system is disabled
    event RevenueRatioDisabled(address indexed disabledBy);

    /// @notice Emitted when the precompile owner is initialized
    event OwnerInitialized(address indexed owner);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev Custom errors for better gas efficiency
    error SetRevenueRatioFailed();
    error EnableFailed();
    error DisableFailed();
    error InitializationFailed(address owner);
    error OwnershipTransferFailed(address newOwner);
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidRatioSum(uint256 sum);

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current owner of the RevenueRatio precompile
     * @return The address of the current owner
     */
    function owner() external view returns (address) {
        return IOwnable(REVENUE_RATIO_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the RevenueRatio precompile has been initialized
     * @return True if initialized, false otherwise
     */
    function initialized() external view returns (bool) {
        return IOwnable(REVENUE_RATIO_PRECOMPILE).initialized();
    }

    /**
     * @notice Checks whether the revenue ratio system is currently enabled
     * @return True if the system is enabled, otherwise false
     */
    function status() external view returns (bool) {
        return IRevenueRatio(REVENUE_RATIO_PRECOMPILE).status();
    }

    /**
     * @notice Retrieves the contract-specific revenue ratio
     * @return The revenue ratio allocated to the smart contract as a percentage
     */
    function contractRatio() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_PRECOMPILE).contractRatio();
    }

    /**
     * @notice Retrieves the coinbase-specific revenue ratio
     * @return The revenue ratio allocated to the block producer as a percentage
     */
    function coinbaseRatio() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_PRECOMPILE).coinbaseRatio();
    }

    /**
     * @notice Retrieves the provider-specific revenue ratio
     * @return The revenue ratio allocated to the service provider as a percentage
     */
    function providerRatio() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_PRECOMPILE).providerRatio();
    }

    /**
     * @notice Retrieves the treasury revenue ratio
     * @return The revenue ratio allocated to the treasury as a percentage
     */
    function treasuryRatio() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_PRECOMPILE).treasuryRatio();
    }

    /**
     * @notice Retrieves all revenue ratios at once
     * @return _contractRatio The contract ratio
     * @return _coinbaseRatio The coinbase ratio
     * @return _providerRatio The provider ratio
     * @return _treasuryRatio The treasury ratio
     */
    function getAllRatios()
        external
        view
        returns (
            uint256 _contractRatio,
            uint256 _coinbaseRatio,
            uint256 _providerRatio,
            uint256 _treasuryRatio
        )
    {
        _contractRatio = IRevenueRatio(REVENUE_RATIO_PRECOMPILE)
            .contractRatio();
        _coinbaseRatio = IRevenueRatio(REVENUE_RATIO_PRECOMPILE)
            .coinbaseRatio();
        _providerRatio = IRevenueRatio(REVENUE_RATIO_PRECOMPILE)
            .providerRatio();
        _treasuryRatio = IRevenueRatio(REVENUE_RATIO_PRECOMPILE)
            .treasuryRatio();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the owner of the RevenueRatio precompile
     * @dev Can only be called once when the precompile is not initialized
     * @param _owner The address to set as the initial owner
     * @return success True if initialization was successful
     */
    function initializeOwner(address _owner) external returns (bool success) {
        if (IOwnable(REVENUE_RATIO_PRECOMPILE).initialized()) {
            revert AlreadyInitialized();
        }

        success = IOwnable(REVENUE_RATIO_PRECOMPILE).initializeOwner(_owner);

        if (!success) {
            revert InitializationFailed(_owner);
        }

        emit OwnerInitialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ownership Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Transfers ownership of the RevenueRatio precompile to a new owner
     * @dev Only the current owner can call this function
     * @param _newOwner The address of the new owner
     * @return success True if ownership transfer was successful
     */
    function transferOwnership(
        address _newOwner
    ) external returns (bool success) {
        address previousOwner = IOwnable(REVENUE_RATIO_PRECOMPILE).owner();

        success = IOwnable(REVENUE_RATIO_PRECOMPILE).transferOwnership(
            _newOwner
        );

        if (!success) {
            revert OwnershipTransferFailed(_newOwner);
        }

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Revenue Ratio Management Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Sets new revenue ratios for all recipients
     * @dev Only the owner of the precompile can set ratios. All ratios must sum to exactly 100.
     * @param _contractRatio The revenue ratio allocated to the contract (0-100)
     * @param _coinbaseRatio The revenue ratio allocated to the block producer (0-100)
     * @param _providerRatio The revenue ratio allocated to the service provider (0-100)
     * @param _treasuryRatio The revenue ratio allocated to the treasury (0-100)
     * @return success True if the ratios were successfully updated
     */
    function setRevenueRatio(
        uint8 _contractRatio,
        uint8 _coinbaseRatio,
        uint8 _providerRatio,
        uint8 _treasuryRatio
    ) external returns (bool success) {
        if (!IOwnable(REVENUE_RATIO_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        // Validate that ratios sum to 100
        uint256 sum = uint256(_contractRatio) +
            uint256(_coinbaseRatio) +
            uint256(_providerRatio) +
            uint256(_treasuryRatio);
        if (sum != 100) {
            revert InvalidRatioSum(sum);
        }

        success = IRevenueRatio(REVENUE_RATIO_PRECOMPILE).setRevenueRatio(
            _contractRatio,
            _coinbaseRatio,
            _providerRatio,
            _treasuryRatio
        );

        if (!success) {
            revert SetRevenueRatioFailed();
        }

        emit RevenueRatioUpdated(
            _contractRatio,
            _coinbaseRatio,
            _providerRatio,
            _treasuryRatio
        );
    }

    /**
     * @notice Enables the revenue ratio system
     * @dev Only the owner of the precompile can enable the system
     * @return success True if the system was successfully enabled
     */
    function enable() external returns (bool success) {
        if (!IOwnable(REVENUE_RATIO_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        success = IRevenueRatio(REVENUE_RATIO_PRECOMPILE).enable();

        if (!success) {
            revert EnableFailed();
        }

        emit RevenueRatioEnabled(msg.sender);
    }

    /**
     * @notice Disables the revenue ratio system
     * @dev Only the owner of the precompile can disable the system
     * @return success True if the system was successfully disabled
     */
    function disable() external returns (bool success) {
        if (!IOwnable(REVENUE_RATIO_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        success = IRevenueRatio(REVENUE_RATIO_PRECOMPILE).disable();

        if (!success) {
            revert DisableFailed();
        }

        emit RevenueRatioDisabled(msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Checks if this contract's address is the owner of the precompile
     * @return True if this contract is the owner
     */
    function isContractOwner() external view returns (bool) {
        return IOwnable(REVENUE_RATIO_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Returns the precompile address for reference
     * @return The address of the RevenueRatio precompile
     */
    function getPrecompileAddress() external pure returns (address) {
        return REVENUE_RATIO_PRECOMPILE;
    }

    /**
     * @notice Validates that the given ratios sum to 100
     * @param _contractRatio The contract ratio
     * @param _coinbaseRatio The coinbase ratio
     * @param _providerRatio The provider ratio
     * @param _treasuryRatio The treasury ratio
     * @return valid True if the ratios sum to exactly 100
     */
    function validateRatios(
        uint8 _contractRatio,
        uint8 _coinbaseRatio,
        uint8 _providerRatio,
        uint8 _treasuryRatio
    ) external pure returns (bool valid) {
        uint256 sum = uint256(_contractRatio) +
            uint256(_coinbaseRatio) +
            uint256(_providerRatio) +
            uint256(_treasuryRatio);
        return sum == 100;
    }
}
