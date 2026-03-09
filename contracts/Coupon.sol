// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./abstracts/BaseCoupon.sol";

contract Coupon is BaseCoupon {
    constructor(
        string memory _tokenName,
        string memory _tokenSymbol
    ) BaseCoupon(_tokenName, _tokenSymbol) Ownable(msg.sender) {}
}