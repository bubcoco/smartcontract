// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title IValidatorContract
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice Interface for QBFT Validator Management Contract (0x...1007)
 * @dev Used by Besu's QBFT consensus with validatorselectionmode=contract.
 *      Besu calls getValidators() at each epoch to determine the active set.
 */
interface IValidatorContract {
    // ═══════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════

    event ValidatorAdded(address indexed validator, address indexed addedBy);
    event ValidatorRemoved(address indexed validator, address indexed removedBy);
    event CommitteeMemberAdded(address indexed member, address indexed addedBy);
    event CommitteeMemberRemoved(address indexed member, address indexed removedBy);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ═══════════════════════════════════════════════════════════════
    // Errors
    // ═══════════════════════════════════════════════════════════════

    error OnlyOwnerOrCommittee();
    error OnlyOwner();
    error ZeroAddress();
    error ValidatorAlreadyExists();
    error ValidatorNotFound();
    error CommitteeMemberAlreadyExists();
    error CommitteeMemberNotFound();
    error AlreadyInitialized();
    error CannotRemoveSelf();

    // ═══════════════════════════════════════════════════════════════
    // Ownership (compatible with existing precompile pattern)
    // ═══════════════════════════════════════════════════════════════

    function initialized() external view returns (bool);
    function owner() external view returns (address);
    function initializeOwner(address newOwner) external returns (bool);
    function transferOwnership(address newOwner) external returns (bool);

    // ═══════════════════════════════════════════════════════════════
    // Validator Management
    // ═══════════════════════════════════════════════════════════════

    function addValidator(address validator) external;
    function removeValidator(address validator) external;
    function getValidators() external view returns (address[] memory);
    function isValidator(address addr) external view returns (bool);
    function validatorCount() external view returns (uint256);

    // ═══════════════════════════════════════════════════════════════
    // Committee Management
    // ═══════════════════════════════════════════════════════════════

    function addCommitteeMember(address member) external;
    function removeCommitteeMember(address member) external;
    function getCommitteeMembers() external view returns (address[] memory);
    function isCommitteeMember(address addr) external view returns (bool);
    function committeeCount() external view returns (uint256);
}
