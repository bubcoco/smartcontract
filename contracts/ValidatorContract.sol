// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IValidatorContract.sol";

/**
 * @title ValidatorContract
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice QBFT Validator Management Contract with committee support.
 * @dev Pre-deployed at 0x0000000000000000000000000000000000001007 in genesis.
 *
 *      Besu calls getValidators() at each QBFT epoch to fetch the active
 *      validator set. This contract manages that set with two tiers:
 *
 *      - Owner:     full control — can manage validators, committee, transfer ownership
 *      - Committee: can add/remove validators, but cannot manage committee or transfer ownership
 *
 *      Storage layout (must match genesis pre-allocation):
 *        slot 0: _init (bool)
 *        slot 1: _owner (address)
 *        slot 2: validators[] (dynamic array — length at slot 2, elements at keccak256(2)+i)
 *        slot 3: _isValidator mapping (address => bool)
 *        slot 4: committee[] (dynamic array)
 *        slot 5: _isCommittee mapping (address => bool)
 */
contract ValidatorContract is IValidatorContract {
    // ═══════════════════════════════════════════════════════════════
    // Storage (order matters — must match genesis layout)
    // ═══════════════════════════════════════════════════════════════

    bool private _init;
    address private _owner;
    address[] private validators;
    mapping(address => bool) private _isValidator;
    address[] private committee;
    mapping(address => bool) private _isCommittee;

    // ═══════════════════════════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        if (msg.sender != _owner) revert OnlyOwner();
        _;
    }

    modifier onlyOwnerOrCommittee() {
        if (msg.sender != _owner && !_isCommittee[msg.sender])
            revert OnlyOwnerOrCommittee();
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // Ownership (IOwnable-compatible)
    // ═══════════════════════════════════════════════════════════════

    function initialized() external view returns (bool) {
        return _init;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    /// @notice One-time initialization — sets the contract owner.
    /// @dev Called once after genesis deployment. Reverts if already initialized.
    function initializeOwner(address newOwner) external returns (bool) {
        if (_init) revert AlreadyInitialized();
        if (newOwner == address(0)) revert ZeroAddress();
        _init = true;
        _owner = newOwner;
        emit OwnershipTransferred(address(0), newOwner);
        return true;
    }

    /// @notice Transfers ownership to a new address.
    function transferOwnership(address newOwner) external onlyOwner returns (bool) {
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // Validator Management (owner OR committee)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Adds a validator. Callable by owner or committee members.
    function addValidator(address validator) external onlyOwnerOrCommittee {
        if (validator == address(0)) revert ZeroAddress();
        if (_isValidator[validator]) revert ValidatorAlreadyExists();

        validators.push(validator);
        _isValidator[validator] = true;

        emit ValidatorAdded(validator, msg.sender);
    }

    /// @notice Removes a validator. Callable by owner or committee members.
    function removeValidator(address validator) external onlyOwnerOrCommittee {
        if (validator == address(0)) revert ZeroAddress();
        if (!_isValidator[validator]) revert ValidatorNotFound();

        _isValidator[validator] = false;

        // Swap-and-pop removal
        uint256 len = validators.length;
        for (uint256 i = 0; i < len; i++) {
            if (validators[i] == validator) {
                validators[i] = validators[len - 1];
                validators.pop();
                break;
            }
        }

        emit ValidatorRemoved(validator, msg.sender);
    }

    /// @notice Returns the full active validator set (called by Besu at each epoch).
    function getValidators() external view returns (address[] memory) {
        return validators;
    }

    function isValidator(address addr) external view returns (bool) {
        return _isValidator[addr];
    }

    function validatorCount() external view returns (uint256) {
        return validators.length;
    }

    // ═══════════════════════════════════════════════════════════════
    // Committee Management (owner only)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Adds a committee member who can manage validators.
    function addCommitteeMember(address member) external onlyOwner {
        if (member == address(0)) revert ZeroAddress();
        if (_isCommittee[member]) revert CommitteeMemberAlreadyExists();

        committee.push(member);
        _isCommittee[member] = true;

        emit CommitteeMemberAdded(member, msg.sender);
    }

    /// @notice Removes a committee member.
    function removeCommitteeMember(address member) external onlyOwner {
        if (member == address(0)) revert ZeroAddress();
        if (!_isCommittee[member]) revert CommitteeMemberNotFound();

        _isCommittee[member] = false;

        uint256 len = committee.length;
        for (uint256 i = 0; i < len; i++) {
            if (committee[i] == member) {
                committee[i] = committee[len - 1];
                committee.pop();
                break;
            }
        }

        emit CommitteeMemberRemoved(member, msg.sender);
    }

    function getCommitteeMembers() external view returns (address[] memory) {
        return committee;
    }

    function isCommitteeMember(address addr) external view returns (bool) {
        return _isCommittee[addr];
    }

    function committeeCount() external view returns (uint256) {
        return committee.length;
    }
}
