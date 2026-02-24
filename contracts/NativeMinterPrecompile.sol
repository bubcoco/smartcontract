// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {INativeMinter} from "./interfaces/INativeMinter.sol";

contract NativeMinterPrecompiled is INativeMinter {
    bool private _init;
    address private _owner;
    uint256 private _totalsupply;

    /** Ownable */
    function _checkOwner() internal view returns (bool) {
        return msg.sender == _owner;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function initialized() external view returns (bool) {
        return _init;
    }

    function totalSupply() external view returns (uint256) {
        return _totalsupply;
    }

    function initializeOwnerAndSupply(
        address initialOwner,
        uint256 initialSupply
    ) external returns (bool success, string memory message) {
        if (_init) return (false, "already initialized");
        _init = true;
        _owner = initialOwner;
        _totalsupply = initialSupply;
        return (true, "initialized successfully");
    }

    function transferOwnership(
        address newOwner
    ) external returns (bool success) {
        if (newOwner == address(0)) return false;
        _owner = newOwner;
        return true;
    }

    /** Mint **/
    function mint(
        address to,
        uint256 value
    ) external override returns (bool success, string memory message) {
        if (_checkOwner()) {
            if (to == address(0) || value == 0)
                return (false, "invalid params");
            _totalsupply += value;
            return (
                true,
                string(abi.encodePacked("mint success ", toString(value)))
            );
        } else {
            return (false, "not owner");
        }
    }

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
