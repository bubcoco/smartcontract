// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IGasFeeGrantV2.sol";

/**
 * @title FeeGrantManager
 * @notice Multi-merchant gas fee grant manager for loyalty point systems
 * @dev Wraps the GasFeeGrant precompile (0x1006) to provide:
 *   - Per-merchant spend limits and expiry (not in precompile)
 *   - Batch user onboarding
 *   - Merchant self-service (merchants manage their own grants)
 *   - Event logging for off-chain indexing
 *
 * Architecture:
 *   ┌──────────────────────┐
 *   │  FeeGrantManager     │  ← spend limits, expiry, batch ops
 *   │  (this contract)     │  ← merchant self-service
 *   └──────────┬───────────┘
 *              │ calls
 *   ┌──────────▼───────────┐
 *   │  Precompile 0x1006   │  ← simple ACL storage
 *   └──────────────────────┘
 */
contract FeeGrantManager {
    // ═══════════════════════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════════════════════

    IGasFeeGrantV2 public constant PRECOMPILE =
        IGasFeeGrantV2(0x0000000000000000000000000000000000001006);

    // ═══════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════

    address public admin;

    struct MerchantConfig {
        bool active;
        uint256 spendLimitPerUser; // max wei a merchant will pay per user (0 = unlimited)
        uint256 expiry; // timestamp when merchant grants expire (0 = never)
        uint256 userCount; // number of users granted
    }

    /// @notice merchant address => config
    mapping(address => MerchantConfig) public merchants;

    /// @notice merchant => user => total gas spent by granter for this user
    mapping(address => mapping(address => uint256)) public userSpent;

    /// @notice merchant => user => whether granted via this manager
    mapping(address => mapping(address => bool)) public userGranted;

    /// @notice merchant => contract => funcSig => whether granted via this manager
    mapping(address => mapping(address => mapping(bytes4 => bool)))
        public contractGranted;

    // ═══════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════

    event MerchantRegistered(
        address indexed merchant,
        uint256 spendLimitPerUser,
        uint256 expiry
    );
    event MerchantDeactivated(address indexed merchant);
    event ContractGrantAdded(
        address indexed merchant,
        address indexed toContract,
        bytes4 funcSig
    );
    event ContractGrantRemoved(
        address indexed merchant,
        address indexed toContract,
        bytes4 funcSig
    );
    event UserGrantAdded(address indexed merchant, address indexed user);
    event UserGrantRemoved(address indexed merchant, address indexed user);
    event UsersBatchGranted(address indexed merchant, uint256 count);

    // ═══════════════════════════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════════════════════════

    modifier onlyAdmin() {
        require(msg.sender == admin, "FGM: not admin");
        _;
    }

    modifier onlyMerchantOrAdmin(address merchant) {
        require(
            msg.sender == merchant || msg.sender == admin,
            "FGM: not merchant or admin"
        );
        _;
    }

    modifier merchantActive(address merchant) {
        require(merchants[merchant].active, "FGM: merchant not active");
        if (merchants[merchant].expiry > 0) {
            require(
                block.timestamp < merchants[merchant].expiry,
                "FGM: merchant expired"
            );
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════════════════════════

    constructor() {
        admin = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════
    // Admin Functions
    // ═══════════════════════════════════════════════════════════════

    /// @notice Register a new merchant (admin only)
    /// @param merchant The merchant/granter address
    /// @param spendLimitPerUser Max gas the merchant pays per user (0 = unlimited)
    /// @param expiry Timestamp when grants expire (0 = never)
    function registerMerchant(
        address merchant,
        uint256 spendLimitPerUser,
        uint256 expiry
    ) external onlyAdmin {
        require(merchant != address(0), "FGM: zero address");
        merchants[merchant] = MerchantConfig({
            active: true,
            spendLimitPerUser: spendLimitPerUser,
            expiry: expiry,
            userCount: 0
        });
        emit MerchantRegistered(merchant, spendLimitPerUser, expiry);
    }

    /// @notice Deactivate a merchant (admin only)
    function deactivateMerchant(address merchant) external onlyAdmin {
        merchants[merchant].active = false;
        emit MerchantDeactivated(merchant);
    }

    /// @notice Transfer admin role
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "FGM: zero address");
        admin = newAdmin;
    }

    // ═══════════════════════════════════════════════════════════════
    // Contract Grant Management (merchant or admin)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Add a contract+function grant for a merchant
    /// @param merchant The granter address
    /// @param toContract The target contract
    /// @param funcSig The 4-byte function selector
    function addContractGrant(
        address merchant,
        address toContract,
        bytes4 funcSig
    ) external onlyMerchantOrAdmin(merchant) merchantActive(merchant) {
        require(
            !contractGranted[merchant][toContract][funcSig],
            "FGM: already granted"
        );

        bool ok = PRECOMPILE.addGrantContract(toContract, funcSig, merchant);
        require(ok, "FGM: precompile addGrantContract failed");

        contractGranted[merchant][toContract][funcSig] = true;
        emit ContractGrantAdded(merchant, toContract, funcSig);
    }

    /// @notice Remove a contract+function grant
    function removeContractGrant(
        address merchant,
        address toContract,
        bytes4 funcSig
    ) external onlyMerchantOrAdmin(merchant) {
        require(
            contractGranted[merchant][toContract][funcSig],
            "FGM: not granted"
        );

        bool ok = PRECOMPILE.removeGrantContract(toContract, funcSig, merchant);
        require(ok, "FGM: precompile removeGrantContract failed");

        contractGranted[merchant][toContract][funcSig] = false;
        emit ContractGrantRemoved(merchant, toContract, funcSig);
    }

    // ═══════════════════════════════════════════════════════════════
    // User Grant Management (merchant or admin)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Add a user grant for a merchant
    /// @param merchant The granter address
    /// @param user The user to grant
    function addUserGrant(
        address merchant,
        address user
    ) external onlyMerchantOrAdmin(merchant) merchantActive(merchant) {
        require(!userGranted[merchant][user], "FGM: already granted");

        bool ok = PRECOMPILE.addGrantUser(user, merchant);
        require(ok, "FGM: precompile addGrantUser failed");

        userGranted[merchant][user] = true;
        merchants[merchant].userCount++;
        emit UserGrantAdded(merchant, user);
    }

    /// @notice Remove a user grant
    function removeUserGrant(
        address merchant,
        address user
    ) external onlyMerchantOrAdmin(merchant) {
        require(userGranted[merchant][user], "FGM: not granted");

        bool ok = PRECOMPILE.removeGrantUser(user, merchant);
        require(ok, "FGM: precompile removeGrantUser failed");

        userGranted[merchant][user] = false;
        if (merchants[merchant].userCount > 0) {
            merchants[merchant].userCount--;
        }
        emit UserGrantRemoved(merchant, user);
    }

    /// @notice Batch add user grants (merchant or admin)
    /// @param merchant The granter address
    /// @param users Array of user addresses to grant
    function batchAddUserGrants(
        address merchant,
        address[] calldata users
    ) external onlyMerchantOrAdmin(merchant) merchantActive(merchant) {
        uint256 added = 0;
        for (uint256 i = 0; i < users.length; i++) {
            if (userGranted[merchant][users[i]]) continue; // skip duplicates

            bool ok = PRECOMPILE.addGrantUser(users[i], merchant);
            if (ok) {
                userGranted[merchant][users[i]] = true;
                added++;
            }
        }
        merchants[merchant].userCount += added;
        emit UsersBatchGranted(merchant, added);
    }

    /// @notice Batch remove user grants
    function batchRemoveUserGrants(
        address merchant,
        address[] calldata users
    ) external onlyMerchantOrAdmin(merchant) {
        uint256 removed = 0;
        for (uint256 i = 0; i < users.length; i++) {
            if (!userGranted[merchant][users[i]]) continue;

            bool ok = PRECOMPILE.removeGrantUser(users[i], merchant);
            if (ok) {
                userGranted[merchant][users[i]] = false;
                removed++;
            }
        }
        if (merchants[merchant].userCount >= removed) {
            merchants[merchant].userCount -= removed;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════

    /// @notice Check if a user is granted by a merchant (both precompile + manager)
    function isUserGranted(
        address merchant,
        address user
    ) external view returns (bool) {
        return
            userGranted[merchant][user] &&
            merchants[merchant].active &&
            (merchants[merchant].expiry == 0 ||
                block.timestamp < merchants[merchant].expiry);
    }

    /// @notice Check if a contract+function is granted by a merchant
    function isContractGranted(
        address merchant,
        address toContract,
        bytes4 funcSig
    ) external view returns (bool) {
        return
            contractGranted[merchant][toContract][funcSig] &&
            merchants[merchant].active;
    }

    /// @notice Get merchant info
    function getMerchant(
        address merchant
    )
        external
        view
        returns (
            bool active,
            uint256 spendLimitPerUser,
            uint256 expiry,
            uint256 userCount
        )
    {
        MerchantConfig storage m = merchants[merchant];
        return (m.active, m.spendLimitPerUser, m.expiry, m.userCount);
    }

    /// @notice Check how much gas budget remains for a user under a merchant
    function remainingBudget(
        address merchant,
        address user
    ) external view returns (uint256) {
        uint256 limit = merchants[merchant].spendLimitPerUser;
        if (limit == 0) return type(uint256).max; // unlimited
        uint256 spent = userSpent[merchant][user];
        if (spent >= limit) return 0;
        return limit - spent;
    }
}
