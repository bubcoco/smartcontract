// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITHB is IERC20 {
    event ForceTransfer(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    function forceTransfer(address from, address to, uint256 amount) external;

    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;
}
