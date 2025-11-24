// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./token/ERC7818/ERC7818.sol";

/// @title PointTokenExpirey
/// @notice ERC20 loyalty token with ERC-7818 expiration
contract PointToken is ERC7818, Ownable {
    /// @notice Initializes PointTokenExpirey
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param initBlockNumber_ Start block number
    /// @param duration_ Duration of each epoch in blocks
    /// @param size_ Number of epochs in the sliding window
    /// @param safe_ Enable safe mode (extra validations)
    /// @param owner_ Address of the contract owner
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initBlockNumber_,
        uint40 duration_,
        uint8 size_,
        bool safe_,
        address owner_
    )
        ERC7818(name_, symbol_, initBlockNumber_, duration_, size_, safe_)
        Ownable(owner_)
    {
        if (owner_ == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
    }

    /// @notice Mint new tokens to an address (only owner)
    /// @param to Address to mint tokens to
    /// @param amount Amount of tokens to mint
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn tokens from caller's balance
    /// @param amount Amount of tokens to burn
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice Burn tokens from a specific address (only owner)
    /// @param from Address to burn tokens from
    /// @param amount Amount of tokens to burn
    function burnFrom(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /// @notice Returns the current pointer (block number)
    function _pointerProvider() internal view override returns (uint256) {
        return block.number;
    }
}
