// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Revenue Ratio
 * @author Blockchain Department @ Advanced Info Services PCL
 */

import {IRevenueRatio} from "../interfaces/IRevenueRatio.sol";
import {AbstractOwnable} from "./AbstractOwnable.sol";

abstract contract AbstractRevenueRatio is AbstractOwnable {
    /** variables */
    IRevenueRatio private _precompiled;
    address private _admin;

    /** errors */
    error RevenueRatioStatusEnable();
    error RevenueRatioStatusDisable();
    error RevenueRatioInvalid(uint8 ratio, uint limit);

    /** events */
    event RevenueRatioEnabled();
    event RevenueRatioDisabled();
    event RevenueRatioUpdated(uint8 contractRatio, uint8 coinbaseRatio, uint8 providerRatio, uint8 treasuryRatio);

    /** constructor */
    constructor(address precompiled, address admin) AbstractOwnable(precompiled, admin) {
        _precompiled = IRevenueRatio(precompiled);
    }

    /** modifiers */
    modifier whenEnabled() {
        if (!_precompiled.status()) {
            revert RevenueRatioStatusDisable();
        }
        _;
    }

    modifier whenDisable() {
        if (_precompiled.status()) {
            revert RevenueRatioStatusEnable();
        }
        _;
    }

    /** @dev See {IRevenueRatio-setRevenueRatio} */
    function _setRevenueRatio(uint8 newContractRatio, uint8 newCoinbaseRatio, uint8 newProviderRatio, uint8 newTreasuryRatio) internal {
        uint8 totalRatio = newContractRatio + newCoinbaseRatio + newProviderRatio + newTreasuryRatio;
        if (totalRatio < 100 || totalRatio > 100) {
            revert RevenueRatioInvalid(totalRatio, 100);
        }
        require(_precompiled.setRevenueRatio(newContractRatio, newCoinbaseRatio, newProviderRatio, newTreasuryRatio));

        emit RevenueRatioUpdated(newContractRatio, newCoinbaseRatio, newProviderRatio, newTreasuryRatio);
    }

    /** @dev See {IRevenueRatio-setStatus} */
    function _setStatus(bool auth) internal {
        if (auth) {
            require(_precompiled.enable());

            emit RevenueRatioEnabled();
        } else {
            require(_precompiled.disable());

            emit RevenueRatioDisabled();
        }
    }

    /** @dev See {IRevenueRatio-status} */
    function status() public view returns (bool) {
        return _precompiled.status();
    }

    /** @dev See {IRevenueRatio-contractRatio} */
    function contractRatio() public view returns (uint256) {
        return _precompiled.contractRatio();
    }

    /** @dev See {IRevenueRatio-coinbaseRatio} */
    function coinbaseRatio() public view returns (uint256) {
        return _precompiled.coinbaseRatio();
    }

    /** @dev See {IRevenueRatio-providerRatio} */
    function providerRatio() public view returns (uint256) {
        return _precompiled.providerRatio();
    }

    /** @dev See {IRevenueRatio-treasuryRatio} */
    function treasuryRatio() public view returns (uint256) {
        return _precompiled.treasuryRatio();
    }
}
