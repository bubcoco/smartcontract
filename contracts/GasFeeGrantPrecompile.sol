// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/IGasFeeGrant.sol";

contract GasFeeGrantPrecompile is IGasFeeGrant {
    bool private _init;
    address private _owner;

    struct GrantStorage {
        address granter;
        FEE_ALLOWANCE_TYPE allowance;
        uint256 spendLimit;
        uint256 periodLimit;
        uint256 amountRemaining;
        uint256 startTime;
        uint256 endTime;
        uint256 latestTransaction;
        uint32 period;
    }

    // grantee => program => GrantStorage
    mapping(address => mapping(address => GrantStorage)) private _grants;
    mapping(address => uint256) private _grantsCounter;

    /** Ownable Logic */
    function owner() external view returns (address) {
        return _owner;
    }

    function initialized() external view returns (bool) {
        return _init;
    }

    function initializeOwner(address initialOwner) external returns (bool) {
        if (_init) {
            return false;
        }
        if (initialOwner == address(0)) {
            return false;
        }
        _owner = initialOwner;
        _init = true;
        return true;
    }

    function transferOwnership(address newOwner) external returns (bool) {
        if (msg.sender != _owner) {
            return false;
        }
        if (newOwner == address(0)) {
            return false;
        }
        _owner = newOwner;
        return true;
    }

    /** Helpers */
    function _periodReset(
        address grantee,
        address program
    ) internal view returns (uint256) {
        GrantStorage storage g = _grants[grantee][program];
        // Based on Java periodReset
        uint256 resetBlock = g.startTime;
        uint256 _period = uint256(g.period);

        if (_period == 0) {
            return resetBlock;
        }

        if (block.number > resetBlock) {
            uint256 cycles = (block.number - resetBlock) / _period;
            if (cycles != 0) {
                resetBlock = resetBlock + (cycles * _period);
            }
        }

        return resetBlock;
    }

    function _periodCanSpend(
        address grantee,
        address program
    ) internal view returns (uint256) {
        GrantStorage storage g = _grants[grantee][program];

        // Java: if (latestTransaction + period < periodReset) return periodLimit else return amountRemaining
        // Note: Java uses rootSlot.add(3L) which is periodLimit for the "reset" return value.

        uint256 pReset = _periodReset(grantee, program);
        if ((g.latestTransaction + uint256(g.period)) < pReset) {
            return g.periodLimit;
        } else {
            return g.amountRemaining;
        }
    }

    function _isGrantedForProgram(
        address grantee,
        address program
    ) internal view returns (bool) {
        return
            _grants[grantee][program].allowance !=
            FEE_ALLOWANCE_TYPE.NON_ALLOWANCE;
    }

    /** IGasFeeGrant Implementation */

    function setFeeGrant(
        address granter,
        address grantee,
        address program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    ) external override returns (bool) {
        if (msg.sender != _owner) {
            return false;
        }

        // Java: if (isGrantedForProgram(..., calldata.slice(32)).isZero()) { ... } else { return FALSE; }
        // slice(32) implies checking the specific program grant
        if (_isGrantedForProgram(grantee, program)) {
            return false;
        }

        if (granter == address(0) || grantee == address(0)) {
            return false;
        }

        // Java: if (spendLimit.isZero() || granter == 0 || grantee == 0) return FALSE;
        if (spendLimit == 0) {
            return false;
        }

        FEE_ALLOWANCE_TYPE allowance = FEE_ALLOWANCE_TYPE.BASIC_ALLOWANCE; // 1

        // Java: if (!period.isZero() && !periodLimit.isZero())
        if (period != 0 && periodLimit != 0) {
            if (spendLimit > periodLimit) {
                return false;
            }
            allowance = FEE_ALLOWANCE_TYPE.PERIODIC_ALLOWANCE; // 2
        }

        GrantStorage storage g = _grants[grantee][program];
        g.granter = granter;
        g.allowance = allowance;
        g.spendLimit = spendLimit;
        g.periodLimit = periodLimit;
        g.amountRemaining = periodLimit; // Initial amount for period
        g.startTime = block.number;
        g.endTime = endTime;
        g.latestTransaction = block.number;
        g.period = period;

        _grantsCounter[grantee] += 1;

        return true;
    }

    function revokeFeeGrant(
        address grantee,
        address program
    ) external override returns (bool) {
        if (msg.sender != _owner) {
            return false;
        }
        if (grantee == address(0)) {
            return false;
        }

        if (!_isGrantedForProgram(grantee, program)) {
            // Java implementation effectively does nothing but returns true if it wasn't there?
            // Actually it just clears slots.
            return true;
        }

        delete _grants[grantee][program];

        if (_grantsCounter[grantee] > 0) {
            _grantsCounter[grantee] -= 1;
        }

        return true;
    }

    function periodCanSpend(
        address grantee,
        address program
    ) external view override returns (uint256) {
        // Java 'periodCanSpend' function:
        // if (allowance == 2) -> calculate
        // else return FALSE (which is 0 bytes)
        GrantStorage storage g = _grants[grantee][program];
        if (g.allowance == FEE_ALLOWANCE_TYPE.PERIODIC_ALLOWANCE) {
            return _periodCanSpend(grantee, program);
        } else {
            return 0;
        }
    }

    function periodReset(
        address grantee,
        address program
    ) external view override returns (uint256) {
        GrantStorage storage g = _grants[grantee][program];
        if (g.allowance == FEE_ALLOWANCE_TYPE.PERIODIC_ALLOWANCE) {
            return _periodReset(grantee, program);
        }
        return 0;
    }

    function isExpired(
        address grantee,
        address program
    ) external view override returns (bool) {
        if (!_isGrantedForProgram(grantee, program)) {
            return true;
        }

        GrantStorage storage g = _grants[grantee][program];
        if (g.endTime == 0) {
            return false;
        }
        return block.number >= g.endTime;
    }

    function isGrantedForProgram(
        address grantee,
        address program
    ) external view override returns (bool) {
        return _isGrantedForProgram(grantee, program);
    }

    function isGrantedForAllProgram(
        address grantee
    ) external view override returns (bool) {
        return _isGrantedForProgram(grantee, address(0));
    }

    function grant(
        address grantee,
        address program
    ) external view override returns (Grant memory) {
        GrantStorage storage g = _grants[grantee][program];

        uint256 pCanSpend = 0;
        if (g.allowance == FEE_ALLOWANCE_TYPE.PERIODIC_ALLOWANCE) {
            pCanSpend = _periodCanSpend(grantee, program);
        }

        return
            Grant({
                granter: g.granter,
                allowance: g.allowance,
                spendLimit: g.spendLimit,
                periodLimit: g.periodLimit,
                periodCanSpend: pCanSpend,
                startTime: g.startTime,
                endTime: g.endTime,
                latestTransaction: g.latestTransaction,
                period: g.period
            });
    }
}
