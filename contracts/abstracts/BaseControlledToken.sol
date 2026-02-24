// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITHB.sol";

abstract contract BaseControlledToken is ITHB, ERC20, Ownable, ReentrancyGuard {
    error ZeroAddress();
    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidAmount();

    function mint(
        address to,
        uint256 amount
    ) external virtual override onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        _mint(to, amount);
    }

    function burn(
        address from,
        uint256 amount
    ) external virtual override onlyOwner nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 currentBalance = balanceOf(from);
        if (currentBalance < amount) {
            revert InsufficientBalance(currentBalance, amount);
        }

        _burn(from, amount);
    }
}
