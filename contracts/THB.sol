// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./abstracts/BaseControlledToken.sol";

contract THB is BaseControlledToken {
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function forceTransfer(
        address from,
        address to,
        uint256 amount
    ) external override onlyOwner nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 fromBalance = balanceOf(from);
        if (fromBalance < amount) {
            revert InsufficientBalance(fromBalance, amount);
        }

        // Perform the transfer
        _transfer(from, to, amount);

        // Emit custom event for force transfer tracking
        emit ForceTransfer(msg.sender, from, to, amount);
    }

    function mint(
        address to,
        uint256 amount
    ) external override onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        _mint(to, amount);
    }

    function burn(
        address from,
        uint256 amount
    ) external override onlyOwner nonReentrant {
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 currentBalance = balanceOf(from);
        if (currentBalance < amount) {
            revert InsufficientBalance(currentBalance, amount);
        }

        _burn(from, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner nonReentrant {
        require(
            recipients.length == amounts.length,
            "THB: arrays length mismatch"
        );
        require(recipients.length > 0, "THB: empty arrays");

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) continue; // Skip zero amounts

            _transfer(msg.sender, recipients[i], amounts[i]);
        }
    }
}