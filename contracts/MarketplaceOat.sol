// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./abstracts/BaseMarketplace.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Marketplace
 * @dev Concrete implementation of BaseMarketplace
 * This contract contains the main marketplace functions that users interact with
 */
contract Marketplace is BaseMarketplace {
    constructor(
        address thbToken_,
        address couponContract_,
        address vault_
    ) BaseMarketplace(thbToken_, couponContract_, vault_) {
        // All initialization is handled by BaseMarketplace
    }

    // ============ Core Marketplace Functions ============

    /**
     * @notice List coupons for sale
     * @param typeId ID of the coupon type to list
     * @param amount Amount of coupons to list
     * @param pricePerUnit Price per coupon in specified token
     * @param paymentToken Address of the ERC-20 token for payment
     * @return listingId The unique ID of the created listing
     */
    function listCoupon(
        uint256 typeId,
        uint256 amount,
        uint256 pricePerUnit,
        address paymentToken
    ) external override nonReentrant returns (uint256) {
        _validateListing(
            msg.sender,
            typeId,
            amount,
            pricePerUnit,
            paymentToken
        );
        return
            _executeListCoupon(
                msg.sender,
                typeId,
                amount,
                pricePerUnit,
                paymentToken
            );
    }

    /**
     * @notice Purchase coupons from a listing
     * @param listingId ID of the listing to buy from
     * @param amount Amount of coupons to buy
     */
    function buyCoupon(
        uint256 listingId,
        uint256 amount
    ) external override nonReentrant {
        _validatePurchase(msg.sender, listingId, amount);
        _executeBuyCoupon(msg.sender, listingId, amount);
    }

    /**
     * @notice Remove a listing from sale
     * @param listingId ID of the listing to delist
     */
    function delistCoupon(uint256 listingId) external override nonReentrant {
        _validateDelisting(msg.sender, listingId);
        _executeDelistCoupon(msg.sender, listingId);
    }

    /**
     * @notice Refund expired coupons for users who purchased them through marketplace
     * @param typeId ID of the coupon type to refund
     * @param amount Amount of coupons to refund
     */
    function refundExpiredCoupon(
        uint256 typeId,
        uint256 amount
    ) external override nonReentrant {
        _validateRefund(msg.sender, typeId, amount);
        _executeRefundCoupon(msg.sender, typeId, amount);
    }

    /**
     * @notice Update the price of a listing
     * @param listingId ID of the listing
     * @param newPricePerUnit New price per coupon in THB tokens
     */
    function updatePrice(
        uint256 listingId,
        uint256 newPricePerUnit
    ) external override {
        _validatePriceUpdate(msg.sender, listingId, newPricePerUnit);
        _executeUpdatePrice(listingId, newPricePerUnit);
    }

    // ============ Whitelist Management Functions ============

    /**
     * @notice Add an address to the whitelist
     * @param account Address to whitelist
     */
    function addToWhitelist(address account) external override onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        whitelist[account] = true;
        emit AddressWhitelisted(account);
    }

    /**
     * @notice Remove an address from the whitelist
     * @param account Address to remove from whitelist
     */
    function removeFromWhitelist(address account) external override onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        whitelist[account] = false;
        emit AddressRemovedFromWhitelist(account);
    }

    /**
     * @notice Add multiple addresses to whitelist in batch
     * @param accounts Array of addresses to whitelist
     */
    function batchAddToWhitelist(
        address[] calldata accounts
    ) external override onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            whitelist[accounts[i]] = true;
            emit AddressWhitelisted(accounts[i]);
        }
    }

    // ============ Callback Functions ============

    /**
     * @notice Callback function called by coupon contract when coupons are redeemed
     * @dev This function can only be called by the coupon contract
     * @param typeId ID of coupon type that was redeemed
     * @param amount Amount of coupons that were redeemed
     */
    function onCouponRedeemed(
        uint256 typeId,
        uint256 amount
    ) external override {
        // Ensure only the coupon contract can call this function
        require(
            msg.sender == address(couponContract),
            "Only coupon contract can call"
        );

        // Release escrow funds to sellers based on coupon redemption
        _releaseEscrowForSellers(typeId, amount);

        emit CouponRedeemed(typeId, msg.sender, amount);
    }
}