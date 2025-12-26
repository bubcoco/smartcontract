// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IGasPrice.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileGasPrice
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A contract that interacts with the GasPrice precompile to manage gas prices
 * @dev This contract wraps the GasPrice precompile at 0x0000000000000000000000000000000000001003
 *      and provides a convenient interface for managing gas prices from smart contracts.
 *
 *      The precompile must be initialized with an owner before gas price management can occur.
 *      Only the owner of the precompile can modify gas prices and enable/disable the system.
 */
contract PrecompileGasPrice {
    /// @notice The address of the GasPrice precompile
    address public constant GAS_PRICE_PRECOMPILE =
        0x0000000000000000000000000000000000001003;

    /// @notice Emitted when the gas price is updated
    event GasPriceUpdated(uint256 indexed newPrice, bool success);

    /// @notice Emitted when the gas price system is enabled
    event GasPriceEnabled(address indexed enabledBy);

    /// @notice Emitted when the gas price system is disabled
    event GasPriceDisabled(address indexed disabledBy);

    /// @notice Emitted when the precompile owner is initialized
    event OwnerInitialized(address indexed owner);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev Custom errors for better gas efficiency
    error SetGasPriceFailed(uint256 price);
    error EnableFailed();
    error DisableFailed();
    error InitializationFailed(address owner);
    error OwnershipTransferFailed(address newOwner);
    error AlreadyInitialized();
    error NotInitialized();

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current owner of the GasPrice precompile
     * @return The address of the current owner
     */
    function owner() external view returns (address) {
        return IOwnable(GAS_PRICE_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the GasPrice precompile has been initialized
     * @return True if initialized, false otherwise
     */
    function initialized() external view returns (bool) {
        return IOwnable(GAS_PRICE_PRECOMPILE).initialized();
    }

    /**
     * @notice Returns the current gas price
     * @return The current gas price as a uint256 value
     */
    function gasPrice() external view returns (uint256) {
        return IGasPrice(GAS_PRICE_PRECOMPILE).gasPrice();
    }

    /**
     * @notice Checks whether the gas price system is currently enabled
     * @return True if the system is enabled, otherwise false
     */
    function status() external view returns (bool) {
        return IGasPrice(GAS_PRICE_PRECOMPILE).status();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the owner of the GasPrice precompile
     * @dev Can only be called once when the precompile is not initialized
     * @param _owner The address to set as the initial owner
     * @return success True if initialization was successful
     */
    function initializeOwner(address _owner) external returns (bool success) {
        if (IOwnable(GAS_PRICE_PRECOMPILE).initialized()) {
            revert AlreadyInitialized();
        }

        success = IOwnable(GAS_PRICE_PRECOMPILE).initializeOwner(_owner);

        if (!success) {
            revert InitializationFailed(_owner);
        }

        emit OwnerInitialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ownership Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Transfers ownership of the GasPrice precompile to a new owner
     * @dev Only the current owner can call this function
     * @param _newOwner The address of the new owner
     * @return success True if ownership transfer was successful
     */
    function transferOwnership(
        address _newOwner
    ) external returns (bool success) {
        address previousOwner = IOwnable(GAS_PRICE_PRECOMPILE).owner();

        success = IOwnable(GAS_PRICE_PRECOMPILE).transferOwnership(_newOwner);

        if (!success) {
            revert OwnershipTransferFailed(_newOwner);
        }

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Gas Price Management Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Sets a new gas price
     * @dev Only the owner of the precompile can set the gas price
     * @param _price The new gas price to set
     * @return success True if the gas price was successfully updated
     */
    function setGasPrice(uint256 _price) external returns (bool success) {
        if (!IOwnable(GAS_PRICE_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        success = IGasPrice(GAS_PRICE_PRECOMPILE).setGasPrice(_price);

        if (!success) {
            revert SetGasPriceFailed(_price);
        }

        emit GasPriceUpdated(_price, success);
    }

    /**
     * @notice Enables the gas price system
     * @dev Only the owner of the precompile can enable the system
     * @return success True if the system was successfully enabled
     */
    function enable() external returns (bool success) {
        if (!IOwnable(GAS_PRICE_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        success = IGasPrice(GAS_PRICE_PRECOMPILE).enable();

        if (!success) {
            revert EnableFailed();
        }

        emit GasPriceEnabled(msg.sender);
    }

    /**
     * @notice Disables the gas price system
     * @dev Only the owner of the precompile can disable the system
     * @return success True if the system was successfully disabled
     */
    function disable() external returns (bool success) {
        if (!IOwnable(GAS_PRICE_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        success = IGasPrice(GAS_PRICE_PRECOMPILE).disable();

        if (!success) {
            revert DisableFailed();
        }

        emit GasPriceDisabled(msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Checks if this contract's address is the owner of the precompile
     * @return True if this contract is the owner
     */
    function isContractOwner() external view returns (bool) {
        return IOwnable(GAS_PRICE_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Returns the precompile address for reference
     * @return The address of the GasPrice precompile
     */
    function getPrecompileAddress() external pure returns (address) {
        return GAS_PRICE_PRECOMPILE;
    }
}
