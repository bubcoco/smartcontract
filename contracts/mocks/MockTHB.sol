// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockTHB is ERC20, Ownable {
    constructor() ERC20("Thai Baht Digital", "THB") Ownable(msg.sender) {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // Add forceTransfer to match ITHB if needed, or just standard ERC20
    function forceTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlyOwner {
        _transfer(from, to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
