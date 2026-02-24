// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../abstracts/BaseCoupon.sol";

contract MockCoupon is BaseCoupon {
    constructor() BaseCoupon("Mock Coupon", "COUPON") Ownable(msg.sender) {}
}
