// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Address Registry
 * @author Blockchain Department @ Advanced Info Services PCL
 */

import {IAddressRegistry} from "../interfaces/IAddressRegistry.sol";
import {AbstractOwnable} from "./AbstractOwnable.sol";

abstract contract AbstractAddressRegistry is AbstractOwnable {
    /** variables */
    IAddressRegistry private _precompiled;

    /** events */
    event AddedToRegistry(address indexed account, address indexed initiator);
    event RemovedFromRegistry(address indexed account, address indexed initiator);

    /** errors */
    error AddressRegistryInvalidAddress(address account);
    error AddressRegistryAddressExists(address account);
    error AddressRegistryAddressNotExists(address account);
    error AddressRegistryInvalidInitiator(address _initiator, address initiator);

    /** constructor */
    constructor(address precompiled, address initialAdmin) AbstractOwnable(precompiled, initialAdmin) {
        _precompiled = IAddressRegistry(precompiled);
    }

    /** @dev See {IAddressRegistry-addToRegistry} */
    function _addToRegistry(address account, address initiator) internal {
        if (contains(account)) {
            revert AddressRegistryAddressExists(account);
        }
        if (account == address(0)) {
            revert AddressRegistryInvalidAddress(address(0));
        }
        require(_precompiled.addToRegistry(account, initiator));

        emit AddedToRegistry(account, initiator);
    }

    /** @dev See {IAddressRegistry-removeFromRegistry} */
    function _removeFromRegistry(address account, address initiator) internal {
        if (!contains(account)) {
            revert AddressRegistryAddressNotExists(account);
        }
        address _initiator = _precompiled.discovery(account);
        if (_initiator != initiator) {
            revert AddressRegistryInvalidInitiator(_initiator, initiator);
        }
        require(_precompiled.removeFromRegistry(account));

        emit RemovedFromRegistry(account, initiator);
    }

    /** @dev See {IAddressRegistry-contains} */
    function contains(address account) public view returns (bool) {
        return _precompiled.contains(account);
    }

    /** @dev See {IAddressRegistry-discovery} */
    function discovery(address account) public view returns (address) {
        return _precompiled.discovery(account);
    }
}
