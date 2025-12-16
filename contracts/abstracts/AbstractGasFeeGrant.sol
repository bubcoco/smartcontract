// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Abstract Gas Fee Grant
 * @author Blockchain Department @ Advanced Info Services PCL
 * @dev See {ADR-029: Fee Grant Module}
 */

import {AbstractOwnable} from "./AbstractOwnable.sol";
import {IGasFeeGrant} from "../interfaces/IGasFeeGrant.sol";

abstract contract AbstractGasFeeGrant is AbstractOwnable {
    /** variables */
    IGasFeeGrant private _precompiled;

    /** errors */
    error GasFeeGrantInvalidGrantee(address);
    error GasFeeGrantInvalidGranter(address);
    error GasFeeGrantInvalidSpendLimit(uint256);
    error GasFeeGrantInvalidPeriodLimit(uint256, uint256);
    error GasFeeGrantInvalidExpiration(uint256, uint256);

    /** events */
    event GasFeeGranted(
        address indexed granter,
        address indexed grantee,
        address indexed program
    );
    event RevokedGasFeeGrant(address indexed grantee, address indexed program);

    /** constructor */
    constructor(address precompiled, address initialAdmin) AbstractOwnable(precompiled, initialAdmin) {
        _precompiled = IGasFeeGrant(precompiled);
    }

    /** @dev See {IGasFeeGrant-setFeeGrant} */
    function _setFeeGrant(
        address granter,
        address grantee,
        address program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 expiration
    ) internal {
        if (granter == address(0)) revert GasFeeGrantInvalidGranter(address(0));
        if (grantee == address(0)) revert GasFeeGrantInvalidGrantee(address(0));
        if (spendLimit == 0) revert GasFeeGrantInvalidSpendLimit(0);
        if (period != 0 && periodLimit != 0) {
            if (spendLimit > periodLimit) {
                revert GasFeeGrantInvalidPeriodLimit(spendLimit, periodLimit);
            }
            uint256 firstPeriodReset = block.number + period;
            if (expiration != 0 && expiration < firstPeriodReset) {
                revert GasFeeGrantInvalidExpiration(expiration, firstPeriodReset);
            }
        }
       
        require(_precompiled.setFeeGrant(granter, grantee, program, spendLimit, period, periodLimit, expiration));

        emit GasFeeGranted(granter, grantee, program);
    }

    /** @dev See {IGasFeeGrant-revokeFeeGrant} */
    function _revokeFeeGrant(address grantee, address program) internal {
        require(_precompiled.revokeFeeGrant(grantee, program));

        emit RevokedGasFeeGrant(grantee, program);
    }

    /** @dev See {IGasFeeGrant-periodCanSpend} */
    function periodCanSpend(address grantee, address program) external view returns (uint256) {
        return _precompiled.periodCanSpend(grantee, program);
    }

    /** @dev See {IGasFeeGrant-periodReset} */
    function periodReset(address grantee, address program) external view returns (uint256) {
        return _precompiled.periodReset(grantee, program);
    }

    /** @dev See {IGasFeeGrant-isExpired} */
    function isExpired(address grantee, address program) public view returns (bool) {
        return _precompiled.isExpired(grantee, program);
    }

    /** @dev See {IGasFeeGrant-isGrantedForProgram} */
    function isGrantedForProgram(address grantee, address program) public view returns (bool) {
        return _precompiled.isGrantedForProgram(grantee, program);
    }

    /** @dev See {IGasFeeGrant-isGrantedForAllProgram} */
    function isGrantedForAllProgram(address grantee) public view returns (bool) {
        return _precompiled.isGrantedForAllProgram(grantee);
    }

    /** @dev See {IGasFeeGrant-grant} */
    function grant(
        address grantee,
        address program
    ) external view returns (IGasFeeGrant.Grant memory) {
        return _precompiled.grant(grantee, program);
    }
}
