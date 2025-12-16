// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Treasury Registry
 * @author Blockchain Department @ Advanced Info Services PCL
 */

import {ITreasuryRegistry} from "../interfaces/ITreasuryRegistry.sol";
import {AbstractOwnable} from "./AbstractOwnable.sol";

abstract contract AbstractTreasuryRegistry is AbstractOwnable {
    /** variables */
    ITreasuryRegistry private _precompiled;

    /** errors */
    error TreasuryInvalidAddress(address treasury);

    /** events */
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    /** constructor */
    constructor(address precompiled, address admin) AbstractOwnable(precompiled, admin) {
        _precompiled = ITreasuryRegistry(precompiled);
    }

    /** @dev See {ITreasuryRegistry-treasuryAt} */
    function treasuryAt() public view returns (address) {
        return _precompiled.treasuryAt();
    }

    /** @dev See {ITreasuryRegistry-setTreasury} */
    function _setTreasury(address newTreasury) internal {
        address oldTreasury = _precompiled.treasuryAt();
        if (newTreasury == address(0)) {
            revert TreasuryInvalidAddress(address(0));
        }
        require(_precompiled.setTreasury(newTreasury));

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
}
