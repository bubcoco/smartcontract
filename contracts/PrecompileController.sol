// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IGasPrice.sol";
import "./interfaces/IGasFeeGrant.sol";
import "./interfaces/INativeMinter.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IRevenueRatio.sol";
import "./interfaces/ITreasuryRegistry.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileController
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A unified contract that interacts with all custom precompiled contracts
 * @dev This contract provides a single interface to interact with:
 *      - GasPrice (0x1003): Gas price management
 *      - GasFeeGrant (0x1006): Gas fee grant management
 *      - NativeMinter (0x1001): Native token minting
 *      - AddressRegistry (0x1002): Address registry management
 *      - RevenueRatio (0x1004): Revenue ratio management
 *      - TreasuryRegistry (0x1005): Treasury address management
 */
contract PrecompileController {
    // ═══════════════════════════════════════════════════════════════════
    // Precompile Addresses
    // ═══════════════════════════════════════════════════════════════════

    /// @notice NativeMinter precompile address
    address public constant NATIVE_MINTER =
        0x0000000000000000000000000000000000001001;

    /// @notice AddressRegistry precompile address
    address public constant ADDRESS_REGISTRY =
        0x0000000000000000000000000000000000001002;

    /// @notice GasPrice precompile address
    address public constant GAS_PRICE =
        0x0000000000000000000000000000000000001003;

    /// @notice RevenueRatio precompile address
    address public constant REVENUE_RATIO =
        0x0000000000000000000000000000000000001004;

    /// @notice TreasuryRegistry precompile address
    address public constant TREASURY_REGISTRY =
        0x0000000000000000000000000000000000001005;

    /// @notice GasFeeGrant precompile address
    address public constant GAS_FEE_GRANT =
        0x0000000000000000000000000000000000001006;

    // ═══════════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════════

    // GasPrice Events
    event GasPriceUpdated(uint256 indexed newPrice);
    event GasPriceEnabled();
    event GasPriceDisabled();

    // GasFeeGrant Events
    event FeeGrantSet(
        address indexed granter,
        address indexed grantee,
        address indexed program
    );
    event FeeGrantRevoked(address indexed grantee, address indexed program);

    // NativeMinter Events
    event NativeMinted(address indexed to, uint256 amount);

    // AddressRegistry Events
    event AddressRegistered(address indexed account, address indexed initiator);
    event AddressRemoved(address indexed account);

    // RevenueRatio Events
    event RevenueRatioUpdated(
        uint8 contractRatio,
        uint8 coinbaseRatio,
        uint8 providerRatio,
        uint8 treasuryRatio
    );
    event RevenueRatioEnabled();
    event RevenueRatioDisabled();

    // TreasuryRegistry Events
    event TreasuryUpdated(address indexed newTreasury);

    // Ownership Events
    event OwnerInitialized(address indexed precompile, address indexed owner);
    event OwnershipTransferred(
        address indexed precompile,
        address indexed previousOwner,
        address indexed newOwner
    );

    // ═══════════════════════════════════════════════════════════════════
    // Custom Errors
    // ═══════════════════════════════════════════════════════════════════

    error OperationFailed(address precompile, string reason);
    error AlreadyInitialized(address precompile);
    error NotInitialized(address precompile);
    error InvalidAddress();
    error InvalidRatioSum(uint256 sum);

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions (Common for all precompiles)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initialize owner for a specific precompile
     * @param _precompile The precompile address to initialize
     * @param _owner The address to set as owner
     */
    function initializeOwner(
        address _precompile,
        address _owner
    ) external returns (bool) {
        if (IOwnable(_precompile).initialized()) {
            revert AlreadyInitialized(_precompile);
        }
        bool success = IOwnable(_precompile).initializeOwner(_owner);
        if (!success) {
            revert OperationFailed(_precompile, "initializeOwner");
        }
        emit OwnerInitialized(_precompile, _owner);
        return true;
    }

    /**
     * @notice Initialize owners for all precompiles at once
     * @param _owner The address to set as owner for all precompiles
     */
    function initializeAllOwners(address _owner) external returns (bool) {
        address[6] memory precompiles = [
            NATIVE_MINTER,
            ADDRESS_REGISTRY,
            GAS_PRICE,
            REVENUE_RATIO,
            TREASURY_REGISTRY,
            GAS_FEE_GRANT
        ];

        for (uint256 i = 0; i < precompiles.length; i++) {
            if (!IOwnable(precompiles[i]).initialized()) {
                bool success = IOwnable(precompiles[i]).initializeOwner(_owner);
                if (success) {
                    emit OwnerInitialized(precompiles[i], _owner);
                }
            }
        }
        return true;
    }

    /**
     * @notice Transfer ownership of a specific precompile
     * @param _precompile The precompile address
     * @param _newOwner The new owner address
     */
    function transferOwnership(
        address _precompile,
        address _newOwner
    ) external returns (bool) {
        address previousOwner = IOwnable(_precompile).owner();
        bool success = IOwnable(_precompile).transferOwnership(_newOwner);
        if (!success) {
            revert OperationFailed(_precompile, "transferOwnership");
        }
        emit OwnershipTransferred(_precompile, previousOwner, _newOwner);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // View Functions - Ownership
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get owner of a specific precompile
     */
    function getOwner(address _precompile) external view returns (address) {
        return IOwnable(_precompile).owner();
    }

    /**
     * @notice Check if a precompile is initialized
     */
    function isInitialized(address _precompile) external view returns (bool) {
        return IOwnable(_precompile).initialized();
    }

    /**
     * @notice Get initialization status of all precompiles
     */
    function getAllInitializationStatus()
        external
        view
        returns (
            bool nativeMinter,
            bool addressRegistry,
            bool gasPrice,
            bool revenueRatio,
            bool treasuryRegistry,
            bool gasFeeGrant
        )
    {
        nativeMinter = IOwnable(NATIVE_MINTER).initialized();
        addressRegistry = IOwnable(ADDRESS_REGISTRY).initialized();
        gasPrice = IOwnable(GAS_PRICE).initialized();
        revenueRatio = IOwnable(REVENUE_RATIO).initialized();
        treasuryRegistry = IOwnable(TREASURY_REGISTRY).initialized();
        gasFeeGrant = IOwnable(GAS_FEE_GRANT).initialized();
    }

    // ═══════════════════════════════════════════════════════════════════
    // GasPrice Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get current gas price
     */
    function getGasPrice() external view returns (uint256) {
        return IGasPrice(GAS_PRICE).gasPrice();
    }

    /**
     * @notice Get gas price system status
     */
    function getGasPriceStatus() external view returns (bool) {
        return IGasPrice(GAS_PRICE).status();
    }

    /**
     * @notice Set new gas price
     */
    function setGasPrice(uint256 _price) external returns (bool) {
        bool success = IGasPrice(GAS_PRICE).setGasPrice(_price);
        if (!success) {
            revert OperationFailed(GAS_PRICE, "setGasPrice");
        }
        emit GasPriceUpdated(_price);
        return true;
    }

    /**
     * @notice Enable gas price system
     */
    function enableGasPrice() external returns (bool) {
        bool success = IGasPrice(GAS_PRICE).enable();
        if (!success) {
            revert OperationFailed(GAS_PRICE, "enable");
        }
        emit GasPriceEnabled();
        return true;
    }

    /**
     * @notice Disable gas price system
     */
    function disableGasPrice() external returns (bool) {
        bool success = IGasPrice(GAS_PRICE).disable();
        if (!success) {
            revert OperationFailed(GAS_PRICE, "disable");
        }
        emit GasPriceDisabled();
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // GasFeeGrant Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get grant details for a grantee and program
     */
    function getGrant(
        address _grantee,
        address _program
    ) external view returns (IGasFeeGrant.Grant memory) {
        return IGasFeeGrant(GAS_FEE_GRANT).grant(_grantee, _program);
    }

    /**
     * @notice Check if a grant exists for a program
     */
    function isGrantedForProgram(
        address _grantee,
        address _program
    ) external view returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT).isGrantedForProgram(_grantee, _program);
    }

    /**
     * @notice Check if a universal grant exists
     */
    function isGrantedForAllProgram(
        address _grantee
    ) external view returns (bool) {
        return IGasFeeGrant(GAS_FEE_GRANT).isGrantedForAllProgram(_grantee);
    }

    /**
     * @notice Check if a grant has expired
     */
    function isGrantExpired(
        address _grantee,
        address _program
    ) external view returns (bool) {
        return IGasFeeGrant(GAS_FEE_GRANT).isExpired(_grantee, _program);
    }

    /**
     * @notice Get period can spend amount
     */
    function getGrantPeriodCanSpend(
        address _grantee,
        address _program
    ) external view returns (uint256) {
        return IGasFeeGrant(GAS_FEE_GRANT).periodCanSpend(_grantee, _program);
    }

    /**
     * @notice Set a fee grant
     */
    function setFeeGrant(
        address _granter,
        address _grantee,
        address _program,
        uint256 _spendLimit,
        uint32 _period,
        uint256 _periodLimit,
        uint256 _endTime
    ) external returns (bool) {
        if (_grantee == address(0)) revert InvalidAddress();
        bool success = IGasFeeGrant(GAS_FEE_GRANT).setFeeGrant(
            _granter,
            _grantee,
            _program,
            _spendLimit,
            _period,
            _periodLimit,
            _endTime
        );
        if (!success) {
            revert OperationFailed(GAS_FEE_GRANT, "setFeeGrant");
        }
        emit FeeGrantSet(_granter, _grantee, _program);
        return true;
    }

    /**
     * @notice Revoke a fee grant
     */
    function revokeFeeGrant(
        address _grantee,
        address _program
    ) external returns (bool) {
        bool success = IGasFeeGrant(GAS_FEE_GRANT).revokeFeeGrant(
            _grantee,
            _program
        );
        if (!success) {
            revert OperationFailed(GAS_FEE_GRANT, "revokeFeeGrant");
        }
        emit FeeGrantRevoked(_grantee, _program);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // NativeMinter Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Mint native tokens to an address
     */
    function mint(address _to, uint256 _amount) external returns (bool) {
        if (_to == address(0)) revert InvalidAddress();
        bool success = INativeMinter(NATIVE_MINTER).mint(_to, _amount);
        if (!success) {
            revert OperationFailed(NATIVE_MINTER, "mint");
        }
        emit NativeMinted(_to, _amount);
        return true;
    }

    /**
     * @notice Batch mint native tokens to multiple addresses
     */
    function batchMint(
        address[] calldata _recipients,
        uint256[] calldata _amounts
    ) external returns (bool) {
        require(
            _recipients.length == _amounts.length,
            "Arrays length mismatch"
        );
        for (uint256 i = 0; i < _recipients.length; i++) {
            if (_recipients[i] == address(0)) revert InvalidAddress();
            bool success = INativeMinter(NATIVE_MINTER).mint(
                _recipients[i],
                _amounts[i]
            );
            if (!success) {
                revert OperationFailed(NATIVE_MINTER, "mint");
            }
            emit NativeMinted(_recipients[i], _amounts[i]);
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // AddressRegistry Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Check if address is in registry
     */
    function registryContains(address _account) external view returns (bool) {
        return IAddressRegistry(ADDRESS_REGISTRY).contains(_account);
    }

    /**
     * @notice Discover initiator for an address
     */
    function registryDiscovery(
        address _account
    ) external view returns (address) {
        return IAddressRegistry(ADDRESS_REGISTRY).discovery(_account);
    }

    /**
     * @notice Add address to registry
     */
    function addToRegistry(
        address _account,
        address _initiator
    ) external returns (bool) {
        if (_account == address(0) || _initiator == address(0))
            revert InvalidAddress();
        bool success = IAddressRegistry(ADDRESS_REGISTRY).addToRegistry(
            _account,
            _initiator
        );
        if (!success) {
            revert OperationFailed(ADDRESS_REGISTRY, "addToRegistry");
        }
        emit AddressRegistered(_account, _initiator);
        return true;
    }

    /**
     * @notice Remove address from registry
     */
    function removeFromRegistry(address _account) external returns (bool) {
        if (_account == address(0)) revert InvalidAddress();
        bool success = IAddressRegistry(ADDRESS_REGISTRY).removeFromRegistry(
            _account
        );
        if (!success) {
            revert OperationFailed(ADDRESS_REGISTRY, "removeFromRegistry");
        }
        emit AddressRemoved(_account);
        return true;
    }

    /**
     * @notice Batch add addresses to registry
     */
    function batchAddToRegistry(
        address[] calldata _accounts,
        address _initiator
    ) external returns (bool) {
        if (_initiator == address(0)) revert InvalidAddress();
        for (uint256 i = 0; i < _accounts.length; i++) {
            if (_accounts[i] == address(0)) revert InvalidAddress();
            bool success = IAddressRegistry(ADDRESS_REGISTRY).addToRegistry(
                _accounts[i],
                _initiator
            );
            if (!success) {
                revert OperationFailed(ADDRESS_REGISTRY, "addToRegistry");
            }
            emit AddressRegistered(_accounts[i], _initiator);
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RevenueRatio Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get revenue ratio status
     */
    function getRevenueRatioStatus() external view returns (bool) {
        return IRevenueRatio(REVENUE_RATIO).status();
    }

    /**
     * @notice Get all revenue ratios
     */
    function getAllRevenueRatios()
        external
        view
        returns (
            uint256 contractRatio,
            uint256 coinbaseRatio,
            uint256 providerRatio,
            uint256 treasuryRatio
        )
    {
        contractRatio = IRevenueRatio(REVENUE_RATIO).contractRatio();
        coinbaseRatio = IRevenueRatio(REVENUE_RATIO).coinbaseRatio();
        providerRatio = IRevenueRatio(REVENUE_RATIO).providerRatio();
        treasuryRatio = IRevenueRatio(REVENUE_RATIO).treasuryRatio();
    }

    /**
     * @notice Set revenue ratios (must sum to 100)
     */
    function setRevenueRatio(
        uint8 _contractRatio,
        uint8 _coinbaseRatio,
        uint8 _providerRatio,
        uint8 _treasuryRatio
    ) external returns (bool) {
        uint256 sum = uint256(_contractRatio) +
            uint256(_coinbaseRatio) +
            uint256(_providerRatio) +
            uint256(_treasuryRatio);
        if (sum != 100) revert InvalidRatioSum(sum);

        bool success = IRevenueRatio(REVENUE_RATIO).setRevenueRatio(
            _contractRatio,
            _coinbaseRatio,
            _providerRatio,
            _treasuryRatio
        );
        if (!success) {
            revert OperationFailed(REVENUE_RATIO, "setRevenueRatio");
        }
        emit RevenueRatioUpdated(
            _contractRatio,
            _coinbaseRatio,
            _providerRatio,
            _treasuryRatio
        );
        return true;
    }

    /**
     * @notice Enable revenue ratio system
     */
    function enableRevenueRatio() external returns (bool) {
        bool success = IRevenueRatio(REVENUE_RATIO).enable();
        if (!success) {
            revert OperationFailed(REVENUE_RATIO, "enable");
        }
        emit RevenueRatioEnabled();
        return true;
    }

    /**
     * @notice Disable revenue ratio system
     */
    function disableRevenueRatio() external returns (bool) {
        bool success = IRevenueRatio(REVENUE_RATIO).disable();
        if (!success) {
            revert OperationFailed(REVENUE_RATIO, "disable");
        }
        emit RevenueRatioDisabled();
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // TreasuryRegistry Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get current treasury address
     */
    function getTreasury() external view returns (address) {
        return ITreasuryRegistry(TREASURY_REGISTRY).treasuryAt();
    }

    /**
     * @notice Set new treasury address
     */
    function setTreasury(address _newTreasury) external returns (bool) {
        if (_newTreasury == address(0)) revert InvalidAddress();
        bool success = ITreasuryRegistry(TREASURY_REGISTRY).setTreasury(
            _newTreasury
        );
        if (!success) {
            revert OperationFailed(TREASURY_REGISTRY, "setTreasury");
        }
        emit TreasuryUpdated(_newTreasury);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Get all precompile addresses
     */
    function getAllPrecompileAddresses()
        external
        pure
        returns (
            address nativeMinter,
            address addressRegistry,
            address gasPrice,
            address revenueRatio,
            address treasuryRegistry,
            address gasFeeGrant
        )
    {
        return (
            NATIVE_MINTER,
            ADDRESS_REGISTRY,
            GAS_PRICE,
            REVENUE_RATIO,
            TREASURY_REGISTRY,
            GAS_FEE_GRANT
        );
    }
}
