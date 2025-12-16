// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Ownable
 * @author Blockchain Department @ Advanced Info Services PCL
 */

import {IAdmin} from "../interfaces/IAdmin.sol";
import {IOwnable} from "../interfaces/IOwnable.sol";

abstract contract AbstractOwnable is IAdmin {
    /** variables */
    IOwnable private _precompiled;
    address private _admin;
    bool private _init;
    uint256 private _totalsupply;

    /** errors */
    error OwnableInitialized();
    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidAdmin(address admin);
    error OwnableInvalidOwner(address owner);

    /** events */
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /** constructor */
    constructor(address precompiled, address initialAdmin) {
        _precompiled = IOwnable(precompiled);
        _transferAdmin(initialAdmin);
    }

    /** modifiers */
    modifier onlyAdmin() {
        if (msg.sender != _admin) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        _;
    }

    /**
     * @notice Initializes the precompiled contract's owner and total supply.
     * @dev Can only be called if the precompiled contract is uninitialized. Emits `OwnershipTransferred`.
     * @param initialOwner The address to set as the initial owner.
     * @param initialSupply The initial total supply to set.
     */
    function _initialPrecompileOwnerAndSupply(
        address initialOwner,
        uint256 initialSupply
    ) internal {
        if (_precompiled.initialized()) {
            revert OwnableInitialized();
        }
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        require(
            _precompiled.initializeOwnerAndSupply(initialOwner, initialSupply)
        );

        emit OwnershipTransferred(address(0), initialOwner);
    }

    function initializeOwnerAndSupply(
        address initialOwner,
        uint256 initialSupply
    ) external returns (bool) {
        if (_init) {
            revert OwnableInitialized();
        }
        _init = true;
        _admin = initialOwner;
        _totalsupply = initialSupply;
        return true;
    }

    /**
     * @notice Transfers ownership of the precompiled contract to a new owner.
     * @dev Calls the precompiled contract's `transferOwnership` function.
     * @param newOwner The address of the new owner.
     */
    function _transferOwnership(address newOwner) internal {
        address oldOwner = _precompiled.owner();
        require(_precompiled.transferOwnership(newOwner));

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /** @dev See {IOwnable-owner} */
    function owner() public view returns (address) {
        return _precompiled.owner();
    }

    /** @dev See {IOwnable-initialized} */
    function initialized() public view returns (bool) {
        return _precompiled.initialized();
    }

    /** @dev See {IOwnable-transferOwnership} */
    function transferOwnership(address newOwner) public onlyAdmin {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @notice Retrieves the address of the precompiled contract.
     * @dev Provides access to the precompiled contract's address.
     * @return The address of the precompiled contract.
     */
    function precompiledAt() public view returns (address) {
        return address(_precompiled);
    }

    /**
     * @notice Internal function to transfer the admin role to a new address.
     * @dev Updates the admin and emits `OwnershipTransferred` for admin changes.
     * @param newAdmin The address of the new admin.
     */
    function _transferAdmin(address newAdmin) internal {
        address oldAdmin = _admin;
        _admin = newAdmin;

        emit OwnershipTransferred(oldAdmin, newAdmin);
    }

    /** @dev See {IAdmin-admin} */
    function admin() public view override returns (address) {
        return _admin;
    }

    /** @dev See {IAdmin-transferAdmin} */
    function transferAdmin(
        address newAdmin
    ) public override onlyAdmin returns (bool) {
        if (newAdmin == address(0)) {
            revert OwnableInvalidAdmin(address(0));
        }
        _transferAdmin(newAdmin);

        return true;
    }
}
