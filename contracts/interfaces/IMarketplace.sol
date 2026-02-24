// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./ITHB.sol";
import "./ICoupon.sol";
import "./IVault.sol";

interface IMarketplace {
    // Custom errors
    error NotWhitelisted();
    error CouponNotFound();
    error NotCouponOwner();
    error CouponNotApproved();
    error InsufficientPayment();
    error CouponNotForSale();
    error CannotBuyOwnCoupon();
    error ZeroAddress();
    error ZeroPrice();
    error InvalidTokenContract();
    error CouponNotExpired();
    error RefundNotAvailable();

    // Structs
    struct Listing {
        address seller; // Address of the seller
        uint256 typeId; // Coupon type ID
        uint256 amount; // Amount of coupons listed
        uint256 pricePerUnit; // Price per coupon in specified token
        address paymentToken; // Address of the ERC-20 token for payment (address(0) for ETH)
        bool active; // Whether listing is active
        uint256 listedAt; // Timestamp when listed
    }

    // Events
    event AddressWhitelisted(address indexed account);
    event AddressRemovedFromWhitelist(address indexed account);
    event CouponListed(
        uint256 indexed listingId,
        uint256 indexed typeId,
        address indexed seller,
        uint256 amount,
        uint256 pricePerUnit,
        address paymentToken
    );
    event CouponSold(
        uint256 indexed listingId,
        uint256 indexed typeId,
        address indexed seller,
        address buyer,
        uint256 amount,
        uint256 totalPrice,
        address paymentToken
    );
    event CouponDelisted(uint256 indexed listingId, address indexed seller);
    event CouponRedeemed(
        uint256 indexed typeId,
        address indexed redeemer,
        uint256 amount
    );
    event CouponRefunded(
        uint256 indexed typeId,
        address indexed holder,
        uint256 amount,
        uint256 refundAmount
    );

    // Whitelist management functions
    function addToWhitelist(address account) external;

    function removeFromWhitelist(address account) external;

    function batchAddToWhitelist(address[] calldata accounts) external;

    function isWhitelisted(address account) external view returns (bool);

    // Marketplace core functions
    function listCoupon(
        uint256 typeId,
        uint256 amount,
        uint256 pricePerUnit,
        address paymentToken
    ) external returns (uint256);

    function buyCoupon(uint256 listingId, uint256 amount) external;

    function delistCoupon(uint256 listingId) external;

    function refundExpiredCoupon(uint256 typeId, uint256 amount) external;

    // Callback function for coupon redemption
    function onCouponRedeemed(uint256 typeId, uint256 amount) external;

    function updatePrice(uint256 listingId, uint256 newPricePerUnit) external;

    // View functions
    function getListing(
        uint256 listingId
    )
        external
        view
        returns (
            address seller,
            uint256 typeId,
            uint256 amount,
            uint256 pricePerUnit,
            address paymentToken,
            bool active,
            uint256 listedAt
        );

    function getActiveListings() external view returns (uint256[] memory);

    function getActiveListingsCount() external view returns (uint256);

    // Emergency functions
    function emergencyRecoverCoupon(
        uint256 typeId,
        uint256 amount,
        address recipient
    ) external;

    // Contract addresses (immutable getters)
    function thbToken() external view returns (ITHB);

    function couponContract() external view returns (ICoupon);

    function vault() external view returns (IVault);
}
