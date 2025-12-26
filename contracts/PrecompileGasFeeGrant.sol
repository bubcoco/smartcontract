// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IGasFeeGrant.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileGasFeeGrant
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A contract that interacts with the GasFeeGrant precompile to manage gas fee grants
 * @dev This contract wraps the GasFeeGrant precompile at 0x0000000000000000000000000000000000001006
 *      and provides a convenient interface for managing gas fee grants from smart contracts.
 *
 *      The precompile must be initialized with an owner before grant management can occur.
 *      Only the owner of the precompile can set and revoke grants.
 */
contract PrecompileGasFeeGrant {
    /// @notice The address of the GasFeeGrant precompile
    address public constant GAS_FEE_GRANT_PRECOMPILE =
        0x0000000000000000000000000000000000001006;

    /// @notice Emitted when a fee grant is set
    event FeeGrantSet(
        address indexed granter,
        address indexed grantee,
        address indexed program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    );

    /// @notice Emitted when a fee grant is revoked
    event FeeGrantRevoked(address indexed grantee, address indexed program);

    /// @notice Emitted when the precompile owner is initialized
    event OwnerInitialized(address indexed owner);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev Custom errors for better gas efficiency
    error SetFeeGrantFailed(address grantee, address program);
    error RevokeFeeGrantFailed(address grantee, address program);
    error InitializationFailed(address owner);
    error OwnershipTransferFailed(address newOwner);
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidGrantee();
    error InvalidProgram();
    error InvalidSpendLimit();

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current owner of the GasFeeGrant precompile
     * @return The address of the current owner
     */
    function owner() external view returns (address) {
        return IOwnable(GAS_FEE_GRANT_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the GasFeeGrant precompile has been initialized
     * @return True if initialized, false otherwise
     */
    function initialized() external view returns (bool) {
        return IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized();
    }

    /**
     * @notice Retrieves the details of a gas fee grant
     * @param _grantee The address receiving the gas fee grant
     * @param _program The contract address where the grant is applicable
     * @return The Grant struct containing all relevant grant data
     */
    function grant(
        address _grantee,
        address _program
    ) external view returns (IGasFeeGrant.Grant memory) {
        return IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).grant(_grantee, _program);
    }

    /**
     * @notice Returns the remaining gas fee allowance before the current period resets
     * @param _grantee The address receiving the gas fee grant
     * @param _program The contract address where the grant is applicable
     * @return The amount of gas fees left to be spent before the period resets
     */
    function periodCanSpend(
        address _grantee,
        address _program
    ) external view returns (uint256) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).periodCanSpend(
                _grantee,
                _program
            );
    }

    /**
     * @notice Retrieves the block number when the current spending period will reset
     * @param _grantee The address receiving the gas fee grant
     * @param _program The contract address where the grant is applicable
     * @return The block number when the next spending period will reset
     */
    function periodReset(
        address _grantee,
        address _program
    ) external view returns (uint256) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).periodReset(
                _grantee,
                _program
            );
    }

    /**
     * @notice Checks whether a fee grant has expired
     * @param _grantee The address receiving the gas fee grant
     * @param _program The contract address where the grant is applicable
     * @return True if the grant has expired, otherwise false
     */
    function isExpired(
        address _grantee,
        address _program
    ) external view returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).isExpired(
                _grantee,
                _program
            );
    }

    /**
     * @notice Checks whether a gas fee grant exists for a given grantee and program
     * @param _grantee The address that may have received a gas fee grant
     * @param _program The contract address for which the grant is being checked
     * @return True if the grantee has an active gas fee grant for the specified contract
     */
    function isGrantedForProgram(
        address _grantee,
        address _program
    ) external view returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).isGrantedForProgram(
                _grantee,
                _program
            );
    }

    /**
     * @notice Checks whether a gas fee grant exists for a given grantee across all programs
     * @param _grantee The address that may have received a gas fee grant
     * @return True if the grantee has an active gas fee grant across all contracts
     */
    function isGrantedForAllProgram(
        address _grantee
    ) external view returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).isGrantedForAllProgram(
                _grantee
            );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the owner of the GasFeeGrant precompile
     * @dev Can only be called once when the precompile is not initialized
     * @param _owner The address to set as the initial owner
     * @return success True if initialization was successful
     */
    function initializeOwner(address _owner) external returns (bool success) {
        if (IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert AlreadyInitialized();
        }

        success = IOwnable(GAS_FEE_GRANT_PRECOMPILE).initializeOwner(_owner);

        if (!success) {
            revert InitializationFailed(_owner);
        }

        emit OwnerInitialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ownership Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Transfers ownership of the GasFeeGrant precompile to a new owner
     * @dev Only the current owner can call this function
     * @param _newOwner The address of the new owner
     * @return success True if ownership transfer was successful
     */
    function transferOwnership(
        address _newOwner
    ) external returns (bool success) {
        address previousOwner = IOwnable(GAS_FEE_GRANT_PRECOMPILE).owner();

        success = IOwnable(GAS_FEE_GRANT_PRECOMPILE).transferOwnership(
            _newOwner
        );

        if (!success) {
            revert OwnershipTransferFailed(_newOwner);
        }

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Grant Management Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Sets a gas fee grant for a grantee and program
     * @dev Only the owner of the precompile can set grants
     * @param _granter The address that is granting the fee allowance
     * @param _grantee The address receiving the gas fee allowance
     * @param _program The contract address where the granted allowance can be used
     * @param _spendLimit The total amount of gas fees that can be spent per transaction
     * @param _period The duration (in blocks) defining the reset period for periodic allowances
     * @param _periodLimit The maximum spendable amount per period for periodic allowances
     * @param _endTime The block number when the grant will expire
     * @return success True if the grant is successfully set
     */
    function setFeeGrant(
        address _granter,
        address _grantee,
        address _program,
        uint256 _spendLimit,
        uint32 _period,
        uint256 _periodLimit,
        uint256 _endTime
    ) external returns (bool success) {
        if (!IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_grantee == address(0)) {
            revert InvalidGrantee();
        }

        if (_spendLimit == 0) {
            revert InvalidSpendLimit();
        }

        success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).setFeeGrant(
            _granter,
            _grantee,
            _program,
            _spendLimit,
            _period,
            _periodLimit,
            _endTime
        );

        if (!success) {
            revert SetFeeGrantFailed(_grantee, _program);
        }

        emit FeeGrantSet(
            _granter,
            _grantee,
            _program,
            _spendLimit,
            _period,
            _periodLimit,
            _endTime
        );
    }

    /**
     * @notice Sets a basic (non-periodic) gas fee grant
     * @dev Convenience function for setting a basic allowance without periodic limits
     * @param _granter The address that is granting the fee allowance
     * @param _grantee The address receiving the gas fee allowance
     * @param _program The contract address where the granted allowance can be used
     * @param _spendLimit The total amount of gas fees that can be spent per transaction
     * @param _endTime The block number when the grant will expire (0 for no expiry)
     * @return success True if the grant is successfully set
     */
    function setBasicFeeGrant(
        address _granter,
        address _grantee,
        address _program,
        uint256 _spendLimit,
        uint256 _endTime
    ) external returns (bool success) {
        if (!IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_grantee == address(0)) {
            revert InvalidGrantee();
        }

        if (_spendLimit == 0) {
            revert InvalidSpendLimit();
        }

        // Set period and periodLimit to 0 for basic allowance
        success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).setFeeGrant(
            _granter,
            _grantee,
            _program,
            _spendLimit,
            0, // no period
            0, // no period limit
            _endTime
        );

        if (!success) {
            revert SetFeeGrantFailed(_grantee, _program);
        }

        emit FeeGrantSet(
            _granter,
            _grantee,
            _program,
            _spendLimit,
            0,
            0,
            _endTime
        );
    }

    /**
     * @notice Sets a gas fee grant for all programs (universal grant)
     * @dev Sets the program to address(0) to allow usage on any contract
     * @param _granter The address that is granting the fee allowance
     * @param _grantee The address receiving the gas fee allowance
     * @param _spendLimit The total amount of gas fees that can be spent per transaction
     * @param _period The duration (in blocks) defining the reset period
     * @param _periodLimit The maximum spendable amount per period
     * @param _endTime The block number when the grant will expire
     * @return success True if the grant is successfully set
     */
    function setUniversalFeeGrant(
        address _granter,
        address _grantee,
        uint256 _spendLimit,
        uint32 _period,
        uint256 _periodLimit,
        uint256 _endTime
    ) external returns (bool success) {
        if (!IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_grantee == address(0)) {
            revert InvalidGrantee();
        }

        if (_spendLimit == 0) {
            revert InvalidSpendLimit();
        }

        success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).setFeeGrant(
            _granter,
            _grantee,
            address(0), // universal - applies to all programs
            _spendLimit,
            _period,
            _periodLimit,
            _endTime
        );

        if (!success) {
            revert SetFeeGrantFailed(_grantee, address(0));
        }

        emit FeeGrantSet(
            _granter,
            _grantee,
            address(0),
            _spendLimit,
            _period,
            _periodLimit,
            _endTime
        );
    }

    /**
     * @notice Revokes an existing gas fee grant
     * @dev Only the owner of the precompile can revoke grants
     * @param _grantee The address whose fee grant is being revoked
     * @param _program The contract address associated with the grant
     * @return success True if the grant is successfully revoked
     */
    function revokeFeeGrant(
        address _grantee,
        address _program
    ) external returns (bool success) {
        if (!IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).revokeFeeGrant(
            _grantee,
            _program
        );

        if (!success) {
            revert RevokeFeeGrantFailed(_grantee, _program);
        }

        emit FeeGrantRevoked(_grantee, _program);
    }

    /**
     * @notice Batch sets fee grants for multiple grantees
     * @dev Only the owner of the precompile can set grants
     * @param _granter The address that is granting the fee allowances
     * @param _grantees Array of addresses receiving the gas fee allowances
     * @param _program The contract address where the granted allowances can be used
     * @param _spendLimit The total amount of gas fees that can be spent per transaction
     * @param _period The duration (in blocks) defining the reset period
     * @param _periodLimit The maximum spendable amount per period
     * @param _endTime The block number when the grants will expire
     * @return success True if all grants are successfully set
     */
    function batchSetFeeGrant(
        address _granter,
        address[] calldata _grantees,
        address _program,
        uint256 _spendLimit,
        uint32 _period,
        uint256 _periodLimit,
        uint256 _endTime
    ) external returns (bool success) {
        require(_grantees.length > 0, "Empty grantees array");

        if (!IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        for (uint256 i = 0; i < _grantees.length; i++) {
            if (_grantees[i] == address(0)) {
                revert InvalidGrantee();
            }

            bool grantSuccess = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE)
                .setFeeGrant(
                    _granter,
                    _grantees[i],
                    _program,
                    _spendLimit,
                    _period,
                    _periodLimit,
                    _endTime
                );

            if (!grantSuccess) {
                revert SetFeeGrantFailed(_grantees[i], _program);
            }

            emit FeeGrantSet(
                _granter,
                _grantees[i],
                _program,
                _spendLimit,
                _period,
                _periodLimit,
                _endTime
            );
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Checks if this contract's address is the owner of the precompile
     * @return True if this contract is the owner
     */
    function isContractOwner() external view returns (bool) {
        return IOwnable(GAS_FEE_GRANT_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Returns the precompile address for reference
     * @return The address of the GasFeeGrant precompile
     */
    function getPrecompileAddress() external pure returns (address) {
        return GAS_FEE_GRANT_PRECOMPILE;
    }
}
