// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Gas Price
 * @author Blockchain Department @ Advanced Info Services PCL
 */

import {IGasPrice} from "../interfaces/IGasPrice.sol";
import {AbstractOwnable} from "./AbstractOwnable.sol";

abstract contract AbstractGasPrice is AbstractOwnable {
    /** variables */
    IGasPrice private _precompiled;

    /** errors */
    error GasPriceStatusDisable();
    error GasPriceStatusEnable();

    /** events */
    event GasPriceEnabled();
    event GasPriceDisabled();
    event GasPriceUpdated(uint256 oldGasPrice, uint256 newGasPrice);

    /** constructor */
    constructor(address precompiled, address initialAdmin) AbstractOwnable(precompiled, initialAdmin) {
        _precompiled = IGasPrice(precompiled);
    }

    /** modifiers */
    modifier whenEnabled() {
        if (!_precompiled.status()) {
            revert GasPriceStatusDisable();
        }
        _;
    }

    modifier whenDisable() {
        if (_precompiled.status()) {
            revert GasPriceStatusEnable();
        }
        _;
    }

    /** @dev See {IGasPrice-setGasPrice} */
    function _setGasPrice(uint256 newGasPrice) internal {
        uint256 oldGasPrice = _precompiled.gasPrice();
        _precompiled.setGasPrice(newGasPrice);

        emit GasPriceUpdated(oldGasPrice, newGasPrice);
    }

   /** @dev See {IGasPrice-setStatus} */
    function _setStatus(bool auth) internal {
        if (auth) {
            require(_precompiled.enable());

            emit GasPriceEnabled();
        } else {
            require(_precompiled.disable());

            emit GasPriceDisabled();
        }
    }

    /** @dev See {IGasPrice-gasPrice} */
    function gasPrice() public view returns (uint256) {
        return _precompiled.gasPrice();
    }

    /** @dev See {IGasPrice-status} */
    function status() public view returns (bool) {
        return _precompiled.status();
    }
}
