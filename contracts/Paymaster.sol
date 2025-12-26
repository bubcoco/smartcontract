// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IGasFeeGrant.sol";
import "./interfaces/IOwnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Paymaster
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A Paymaster contract that manages gas fee subsidies for users through the GasFeeGrant precompile.
 * @dev This contract acts as an intermediary between users and the GasFeeGrant precompile,
 *      providing a convenient way to manage gas fee grants for multiple users and programs.
 *
 * Key Features:
 * - Deposit and withdraw native tokens for gas subsidies
 * - Set up gas fee grants for individual users or batch users
 * - Support for both basic and periodic allowances
 * - Universal grants (apply to all programs) or program-specific grants
 * - Whitelist management for approved programs
 * - Operator roles for delegated grant management
 *
 * Usage Flow:
 * 1. Deploy Paymaster contract
 * 2. Deposit native tokens to cover gas costs
 * 3. Initialize the GasFeeGrant precompile (if not already done)
 * 4. Set up grants for grantees using setGrant() or batchSetGrants()
 * 5. Grantees can now execute transactions with subsidized gas fees
 */
contract Paymaster is Ownable, ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice The GasFeeGrant precompile address
    address public constant GAS_FEE_GRANT_PRECOMPILE =
        0x0000000000000000000000000000000000001006;

    // ═══════════════════════════════════════════════════════════════════════
    // State Variables
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Default spend limit per transaction (in wei)
    uint256 public defaultSpendLimit;

    /// @notice Default period for periodic allowances (in blocks)
    uint32 public defaultPeriod;

    /// @notice Default period limit for periodic allowances (in wei)
    uint256 public defaultPeriodLimit;

    /// @notice Whether to use periodic allowances by default
    bool public usePeriodicAllowance;

    /// @notice Mapping of operators who can manage grants
    mapping(address => bool) public operators;

    /// @notice Mapping of whitelisted programs
    mapping(address => bool) public whitelistedPrograms;

    /// @notice Mapping of grantee => program => grant exists
    mapping(address => mapping(address => bool)) public activeGrants;

    /// @notice Total number of active grants
    uint256 public totalActiveGrants;

    /// @notice Track total subsidized amount per grantee
    mapping(address => uint256) public granteeSubsidizedTotal;

    // ═══════════════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════════════

    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event ProgramWhitelisted(address indexed program);
    event ProgramRemovedFromWhitelist(address indexed program);
    event GrantCreated(
        address indexed grantee,
        address indexed program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    );
    event GrantRevoked(address indexed grantee, address indexed program);
    event DefaultsUpdated(
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        bool usePeriodicAllowance
    );
    event PrecompileInitialized(address indexed owner);

    // ═══════════════════════════════════════════════════════════════════════
    // Errors
    // ═══════════════════════════════════════════════════════════════════════

    error NotOperator();
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientBalance();
    error GrantAlreadyExists();
    error GrantDoesNotExist();
    error PrecompileNotInitialized();
    error PrecompileAlreadyInitialized();
    error SetGrantFailed();
    error RevokeGrantFailed();
    error ProgramNotWhitelisted();
    error TransferFailed();

    // ═══════════════════════════════════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Restricts access to owner or operators
    modifier onlyOperatorOrOwner() {
        if (msg.sender != owner() && !operators[msg.sender]) {
            revert NotOperator();
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Creates a new Paymaster contract
     * @param _defaultSpendLimit Default spend limit per transaction (in wei)
     * @param _defaultPeriod Default period for periodic allowances (in blocks)
     * @param _defaultPeriodLimit Default period limit (in wei)
     * @param _usePeriodicAllowance Whether to use periodic allowances by default
     */
    constructor(
        uint256 _defaultSpendLimit,
        uint32 _defaultPeriod,
        uint256 _defaultPeriodLimit,
        bool _usePeriodicAllowance
    ) Ownable(msg.sender) {
        defaultSpendLimit = _defaultSpendLimit;
        defaultPeriod = _defaultPeriod;
        defaultPeriodLimit = _defaultPeriodLimit;
        usePeriodicAllowance = _usePeriodicAllowance;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Receive Function
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Allows the contract to receive native tokens
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Deposit/Withdraw Functions
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deposits native tokens into the Paymaster
     * @dev Emits a Deposited event
     */
    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraws native tokens from the Paymaster
     * @dev Only owner can withdraw
     * @param amount Amount to withdraw in wei
     */
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount > address(this).balance) revert InsufficientBalance();

        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(owner(), amount);
    }

    /**
     * @notice Withdraws all native tokens from the Paymaster
     * @dev Only owner can withdraw
     */
    function withdrawAll() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert InsufficientBalance();

        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(owner(), balance);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Precompile Management
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the GasFeeGrant precompile with this contract as owner
     * @dev Can only be called once when precompile is not initialized
     */
    function initializePrecompile() external onlyOwner {
        if (IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized()) {
            revert PrecompileAlreadyInitialized();
        }

        bool success = IOwnable(GAS_FEE_GRANT_PRECOMPILE).initializeOwner(
            address(this)
        );
        if (!success) revert SetGrantFailed();

        emit PrecompileInitialized(address(this));
    }

    /**
     * @notice Checks if this contract is the owner of the precompile
     * @return True if this contract is the precompile owner
     */
    function isPrecompileOwner() external view returns (bool) {
        return IOwnable(GAS_FEE_GRANT_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Gets the current owner of the precompile
     * @return The precompile owner address
     */
    function getPrecompileOwner() external view returns (address) {
        return IOwnable(GAS_FEE_GRANT_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the precompile is initialized
     * @return True if initialized
     */
    function isPrecompileInitialized() external view returns (bool) {
        return IOwnable(GAS_FEE_GRANT_PRECOMPILE).initialized();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Operator Management
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Adds an operator who can manage grants
     * @param operator Address to add as operator
     */
    function addOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert InvalidAddress();
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    /**
     * @notice Removes an operator
     * @param operator Address to remove from operators
     */
    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Program Whitelist Management
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Adds a program to the whitelist
     * @param program Program address to whitelist
     */
    function whitelistProgram(address program) external onlyOwner {
        whitelistedPrograms[program] = true;
        emit ProgramWhitelisted(program);
    }

    /**
     * @notice Removes a program from the whitelist
     * @param program Program address to remove
     */
    function removeFromWhitelist(address program) external onlyOwner {
        whitelistedPrograms[program] = false;
        emit ProgramRemovedFromWhitelist(program);
    }

    /**
     * @notice Batch whitelist multiple programs
     * @param programs Array of program addresses to whitelist
     */
    function batchWhitelistPrograms(
        address[] calldata programs
    ) external onlyOwner {
        for (uint256 i = 0; i < programs.length; i++) {
            whitelistedPrograms[programs[i]] = true;
            emit ProgramWhitelisted(programs[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Grant Management
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Sets a gas fee grant for a grantee
     * @dev Uses default parameters, program must be whitelisted (or use address(0) for all programs)
     * @param grantee Address to receive the grant
     * @param program Program address (use address(0) for all programs)
     */
    function setGrant(
        address grantee,
        address program
    ) external onlyOperatorOrOwner {
        _setGrant(
            grantee,
            program,
            defaultSpendLimit,
            usePeriodicAllowance ? defaultPeriod : 0,
            usePeriodicAllowance ? defaultPeriodLimit : 0,
            0 // No expiration
        );
    }

    /**
     * @notice Sets a gas fee grant with custom parameters
     * @param grantee Address to receive the grant
     * @param program Program address (use address(0) for all programs)
     * @param spendLimit Maximum spend per transaction
     * @param period Period duration in blocks (0 for basic allowance)
     * @param periodLimit Maximum spend per period (must be >= spendLimit if period > 0)
     * @param endTime Block number when grant expires (0 for never)
     */
    function setGrantWithParams(
        address grantee,
        address program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    ) external onlyOperatorOrOwner {
        _setGrant(grantee, program, spendLimit, period, periodLimit, endTime);
    }

    /**
     * @notice Sets a universal grant (applies to all programs)
     * @param grantee Address to receive the grant
     */
    function setUniversalGrant(address grantee) external onlyOperatorOrOwner {
        _setGrant(
            grantee,
            address(0), // Universal - all programs
            defaultSpendLimit,
            usePeriodicAllowance ? defaultPeriod : 0,
            usePeriodicAllowance ? defaultPeriodLimit : 0,
            0
        );
    }

    /**
     * @notice Batch set grants for multiple grantees
     * @param grantees Array of grantee addresses
     * @param program Program address (use address(0) for all programs)
     */
    function batchSetGrants(
        address[] calldata grantees,
        address program
    ) external onlyOperatorOrOwner {
        for (uint256 i = 0; i < grantees.length; i++) {
            _setGrant(
                grantees[i],
                program,
                defaultSpendLimit,
                usePeriodicAllowance ? defaultPeriod : 0,
                usePeriodicAllowance ? defaultPeriodLimit : 0,
                0
            );
        }
    }

    /**
     * @notice Revokes a grant for a grantee
     * @param grantee Address whose grant to revoke
     * @param program Program address
     */
    function revokeGrant(
        address grantee,
        address program
    ) external onlyOperatorOrOwner {
        if (!activeGrants[grantee][program]) revert GrantDoesNotExist();

        bool success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).revokeFeeGrant(
            grantee,
            program
        );
        if (!success) revert RevokeGrantFailed();

        activeGrants[grantee][program] = false;
        totalActiveGrants--;

        emit GrantRevoked(grantee, program);
    }

    /**
     * @notice Batch revoke grants for multiple grantees
     * @param grantees Array of grantee addresses
     * @param program Program address
     */
    function batchRevokeGrants(
        address[] calldata grantees,
        address program
    ) external onlyOperatorOrOwner {
        for (uint256 i = 0; i < grantees.length; i++) {
            if (activeGrants[grantees[i]][program]) {
                bool success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE)
                    .revokeFeeGrant(grantees[i], program);
                if (success) {
                    activeGrants[grantees[i]][program] = false;
                    totalActiveGrants--;
                    emit GrantRevoked(grantees[i], program);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Configuration
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Updates the default grant parameters
     * @param _spendLimit New default spend limit
     * @param _period New default period
     * @param _periodLimit New default period limit
     * @param _usePeriodicAllowance Whether to use periodic allowances
     */
    function updateDefaults(
        uint256 _spendLimit,
        uint32 _period,
        uint256 _periodLimit,
        bool _usePeriodicAllowance
    ) external onlyOwner {
        defaultSpendLimit = _spendLimit;
        defaultPeriod = _period;
        defaultPeriodLimit = _periodLimit;
        usePeriodicAllowance = _usePeriodicAllowance;

        emit DefaultsUpdated(
            _spendLimit,
            _period,
            _periodLimit,
            _usePeriodicAllowance
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Gets the balance of this Paymaster
     * @return The contract's native token balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Checks if a grant is active for a grantee and program
     * @param grantee Grantee address
     * @param program Program address
     * @return True if grant is active
     */
    function isGrantActive(
        address grantee,
        address program
    ) external view returns (bool) {
        return activeGrants[grantee][program];
    }

    /**
     * @notice Gets the grant details from the precompile
     * @param grantee Grantee address
     * @param program Program address
     * @return The grant details
     */
    function getGrantDetails(
        address grantee,
        address program
    ) external view returns (IGasFeeGrant.Grant memory) {
        return IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).grant(grantee, program);
    }

    /**
     * @notice Gets the remaining allowance for a grantee
     * @param grantee Grantee address
     * @param program Program address
     * @return The remaining allowance in wei
     */
    function getRemainingAllowance(
        address grantee,
        address program
    ) external view returns (uint256) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).periodCanSpend(
                grantee,
                program
            );
    }

    /**
     * @notice Checks if a grant is expired
     * @param grantee Grantee address
     * @param program Program address
     * @return True if expired
     */
    function isGrantExpired(
        address grantee,
        address program
    ) external view returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).isExpired(grantee, program);
    }

    /**
     * @notice Gets the block number when the period resets
     * @param grantee Grantee address
     * @param program Program address
     * @return The block number
     */
    function getPeriodReset(
        address grantee,
        address program
    ) external view returns (uint256) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).periodReset(
                grantee,
                program
            );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Internal Functions
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Internal function to set a grant
     */
    function _setGrant(
        address grantee,
        address program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    ) internal {
        if (grantee == address(0)) revert InvalidAddress();
        if (spendLimit == 0) revert InvalidAmount();

        // Check program whitelist (address(0) means universal grant, always allowed)
        if (program != address(0) && !whitelistedPrograms[program]) {
            revert ProgramNotWhitelisted();
        }

        // Validate period settings (periodLimit must be >= spendLimit for periodic allowances)
        if (period > 0 && periodLimit > 0) {
            if (spendLimit > periodLimit) {
                revert InvalidAmount();
            }
        }

        // Check if grant already exists, skip if it does
        if (activeGrants[grantee][program]) {
            // Grant already exists, could update or skip
            // For now, we'll revoke and recreate
            bool revokeSuccess = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE)
                .revokeFeeGrant(grantee, program);
            if (revokeSuccess) {
                totalActiveGrants--;
            }
        }

        // Set the grant via precompile
        bool success = IGasFeeGrant(GAS_FEE_GRANT_PRECOMPILE).setFeeGrant(
            address(this), // granter is this Paymaster
            grantee,
            program,
            spendLimit,
            period,
            periodLimit,
            endTime
        );

        if (!success) revert SetGrantFailed();

        activeGrants[grantee][program] = true;
        totalActiveGrants++;

        emit GrantCreated(
            grantee,
            program,
            spendLimit,
            period,
            periodLimit,
            endTime
        );
    }
}
