// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Native Minter
 * @author Blockchain Department @ Advanced Info Services PCL
 */

import {INativeMinter} from "../interfaces/INativeMinter.sol";
import {AbstractOwnable} from "./AbstractOwnable.sol";

abstract contract AbstractNativeMinter is AbstractOwnable {
    /** variables */
    INativeMinter private _precompiled;

    /** errors */
    error NativeMinterInvalidAddress(address account);
    error NativeMinterInvalidValue(uint256 value);

    /** events */
    event Minted(address indexed to, uint256 value);

    /** constructor */
    constructor(
        address precompiled,
        address initialAdmin
    ) AbstractOwnable(precompiled, initialAdmin) {
        _precompiled = INativeMinter(precompiled);
    }

    /** @dev See {INativeMinter-mint} */
    function _mint(address to, uint256 value) internal {
        if (to == address(0)) {
            revert NativeMinterInvalidAddress(address(0));
        }
        if (value == 0) {
            revert NativeMinterInvalidValue(0);
        }
        (bool success, ) = _precompiled.mint(to, value);
        require(success);

        emit Minted(to, value);
    }
}
