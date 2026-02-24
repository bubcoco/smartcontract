// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IMarketplace.sol";
import "../interfaces/ITHB.sol";
import "../interfaces/ICoupon.sol";
import "../interfaces/IVault.sol";

/**
 * @title BaseMarketplace
 * @dev Abstract contract providing core marketplace functionality for ERC1155 coupons
 * Concrete implementations should extend this contract and can override
 * specific functions to customize behavior
 */
abstract contract BaseMarketplace is
    IMarketplace,
    Ownable,
    ReentrancyGuard,
    ERC1155Holder
{
    // Additional errors for ERC1155
    error ZeroAmount();
    error InsufficientCouponBalance();
    error ListingNotFound();

    // State variables
    ITHB public immutable thbToken;
    ICoupon public immutable couponContract;
    IVault public immutable vault;

    mapping(address => bool) public whitelist;
    mapping(uint256 => Listing) public listings;

    uint256 private _nextListingId = 1;
    uint256 private _nextEscrowId = 1;
    uint256[] public activeListings;
    mapping(uint256 => uint256) private _activeListingIndex;

    // Track escrow IDs for each user's purchases: user => typeId => escrowId[]
    mapping(address => mapping(uint256 => uint256[])) public purchaseEscrowIds;

    // Track all active escrow IDs for each coupon type: typeId => escrowId[]
    mapping(uint256 => uint256[]) public typeEscrowIds;

    // Track coupon purchases for refund purposes
    // user => typeId => amount of coupons purchased through marketplace
    mapping(address => mapping(uint256 => uint256)) public purchasedCoupons;
    // user => typeId => total amount paid for coupons (for refund calculation)
    mapping(address => mapping(uint256 => uint256)) public totalPaidForCoupons;
    // user => typeId => array of listing IDs where they made purchases (for vault refunds)
    mapping(address => mapping(uint256 => uint256[])) public purchaseListingIds;
    // user => typeId => listingId => amount purchased in that specific listing
    mapping(address => mapping(uint256 => mapping(uint256 => uint256)))
        public purchaseAmounts;

    /**
     * @dev Constructor initializes the marketplace with required contracts
     * @param thbToken_ Address of the THB token contract
     * @param couponContract_ Address of the coupon NFT contract
     * @param vault_ Address of the vault contract for escrowing payments
     */
    constructor(
        address thbToken_,
        address couponContract_,
        address vault_
    ) Ownable(msg.sender) {
        if (thbToken_ == address(0)) revert ZeroAddress();
        if (couponContract_ == address(0)) revert ZeroAddress();
        if (vault_ == address(0)) revert ZeroAddress();

        thbToken = ITHB(thbToken_);
        couponContract = ICoupon(couponContract_);
        vault = IVault(vault_);
    }

    // ============ View Functions - Whitelist ============

    /**
     * @notice Check if an address is whitelisted
     * @param account Address to check
     * @return True if address is whitelisted
     */
    function isWhitelisted(
        address account
    ) external view virtual returns (bool) {
        return whitelist[account];
    }

    // ============ Core Marketplace Functions ============

    // Core marketplace functions are implemented in concrete Marketplace contract

    // ============ View Functions ============

    /**
     * @notice Get listing details
     * @param listingId ID of the listing
     * @return seller Address of the seller
     * @return typeId Voucher type ID
     * @return amount Amount of vouchers available
     * @return pricePerUnit Price per voucher in specified token
     * @return paymentToken Address of the payment token
     * @return active Whether listing is active
     * @return listedAt Timestamp when listed
     */
    function getListing(
        uint256 listingId
    )
        external
        view
        virtual
        returns (
            address seller,
            uint256 typeId,
            uint256 amount,
            uint256 pricePerUnit,
            address paymentToken,
            bool active,
            uint256 listedAt
        )
    {
        Listing memory listing = listings[listingId];
        return (
            listing.seller,
            listing.typeId,
            listing.amount,
            listing.pricePerUnit,
            listing.paymentToken,
            listing.active,
            listing.listedAt
        );
    }

    /**
     * @notice Get array of all active listing IDs
     * @return Array of listing IDs that are currently active
     */
    function getActiveListings()
        external
        view
        virtual
        returns (uint256[] memory)
    {
        return activeListings;
    }

    /**
     * @notice Get count of active listings
     * @return Number of active listings
     */
    function getActiveListingsCount() external view virtual returns (uint256) {
        return activeListings.length;
    }

    /**
     * @notice Get all active listings with full details
     * @return Array of listing structs containing all active listings
     */
    function getAllActiveListings()
        external
        view
        virtual
        returns (Listing[] memory)
    {
        uint256 count = activeListings.length;
        Listing[] memory activeListingData = new Listing[](count);

        for (uint256 i = 0; i < count; i++) {
            activeListingData[i] = listings[activeListings[i]];
        }

        return activeListingData;
    }

    /**
     * @notice Get all listings for a specific coupon type
     * @param typeId The coupon type ID to filter by
     * @return Array of listing IDs for the specified coupon type
     */
    function getListingsByType(
        uint256 typeId
    ) external view virtual returns (uint256[] memory) {
        // Count matching listings first
        uint256 count = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            if (listings[activeListings[i]].typeId == typeId) {
                count++;
            }
        }

        // Create result array
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            uint256 listingId = activeListings[i];
            if (listings[listingId].typeId == typeId) {
                result[index] = listingId;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all listings by a specific seller
     * @param seller The seller address to filter by
     * @return Array of listing IDs for the specified seller
     */
    function getListingsBySeller(
        address seller
    ) external view virtual returns (uint256[] memory) {
        // Count matching listings first
        uint256 count = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            if (listings[activeListings[i]].seller == seller) {
                count++;
            }
        }

        // Create result array
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            uint256 listingId = activeListings[i];
            if (listings[listingId].seller == seller) {
                result[index] = listingId;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get all listings by payment token
     * @param paymentToken The payment token address to filter by
     * @return Array of listing IDs for the specified payment token
     */
    function getListingsByPaymentToken(
        address paymentToken
    ) external view virtual returns (uint256[] memory) {
        // Count matching listings first
        uint256 count = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            if (listings[activeListings[i]].paymentToken == paymentToken) {
                count++;
            }
        }

        // Create result array
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            uint256 listingId = activeListings[i];
            if (listings[listingId].paymentToken == paymentToken) {
                result[index] = listingId;
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get listings by payment token with full details
     * @param paymentToken The payment token address to filter by
     * @return Array of listing structs for the specified payment token
     */
    function getListingDetailsByPaymentToken(
        address paymentToken
    ) external view virtual returns (Listing[] memory) {
        // Count matching listings first
        uint256 count = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            if (listings[activeListings[i]].paymentToken == paymentToken) {
                count++;
            }
        }

        // Create result array with full details
        Listing[] memory result = new Listing[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < activeListings.length; i++) {
            uint256 listingId = activeListings[i];
            if (listings[listingId].paymentToken == paymentToken) {
                result[index] = listings[listingId];
                index++;
            }
        }

        return result;
    }

    // ============ Emergency Functions ============

    /**
     * @notice Emergency recovery of vouchers (owner only)
     * @param typeId ID of the voucher type to recover
     * @param amount Amount of vouchers to recover
     * @param recipient Address to send the vouchers to
     */
    function emergencyRecoverCoupon(
        uint256 typeId,
        uint256 amount,
        address recipient
    ) external virtual onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        couponContract.safeTransferFrom(
            address(this),
            recipient,
            typeId,
            amount,
            ""
        );
    }

    // ============ Internal Validation Functions ============

    /**
     * @dev Validate voucher listing parameters
     * @param seller Address of the seller
     * @param typeId ID of voucher type
     * @param amount Amount to list
     * @param pricePerUnit Proposed price per unit
     * @param paymentToken Address of the ERC-20 payment token
     */
    function _validateListing(
        address seller,
        uint256 typeId,
        uint256 amount,
        uint256 pricePerUnit,
        address paymentToken
    ) internal view virtual {
        if (!whitelist[seller]) revert NotWhitelisted();
        if (amount == 0) revert ZeroAmount();
        if (pricePerUnit == 0) revert ZeroPrice();
        if (paymentToken == address(0)) revert ZeroAddress();

        if (couponContract.balanceOf(seller, typeId) < amount) {
            revert InsufficientCouponBalance();
        }

        if (!couponContract.isApprovedForAll(seller, address(this))) {
            revert CouponNotApproved();
        }
    }

    /**
     * @dev Validate purchase parameters and permissions
     * @param buyer Address attempting to buy
     * @param listingId ID of listing to buy from
     * @param amount Amount to buy
     */
    function _validatePurchase(
        address buyer,
        uint256 listingId,
        uint256 amount
    ) internal view virtual {
        if (!whitelist[buyer]) revert NotWhitelisted();
        if (amount == 0) revert ZeroAmount();

        Listing storage listing = listings[listingId];
        if (!listing.active) revert CouponNotForSale();
        if (listing.seller == buyer) revert CannotBuyOwnCoupon();
        if (listing.amount < amount) revert InsufficientCouponBalance();

        uint256 totalPrice = listing.pricePerUnit * amount;

        // Check buyer has sufficient token balance and correct allowances
        IERC20 paymentToken = IERC20(listing.paymentToken);

        require(
            paymentToken.balanceOf(buyer) >= totalPrice,
            "Insufficient token balance"
        );

        if (listing.paymentToken == address(thbToken)) {
            // For THB, check vault allowance (vault escrow)
            require(
                paymentToken.allowance(buyer, address(vault)) >= totalPrice,
                "Insufficient token allowance for vault"
            );
        } else {
            // For other tokens, check marketplace allowance (direct payment)
            require(
                paymentToken.allowance(buyer, address(this)) >= totalPrice,
                "Insufficient token allowance for marketplace"
            );
        }
    }

    /**
     * @dev Validate delisting parameters and permissions
     * @param seller Address attempting to delist
     * @param listingId ID of listing to delist
     */
    function _validateDelisting(
        address seller,
        uint256 listingId
    ) internal view virtual {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert CouponNotForSale();
        if (listing.seller != seller) revert NotCouponOwner();
    }

    /**
     * @dev Validate refund request
     * @param user Address requesting refund
     * @param typeId ID of the coupon type
     * @param amount Amount of coupons to refund
     */
    function _validateRefund(
        address user,
        uint256 typeId,
        uint256 amount
    ) internal view virtual {
        if (amount == 0) revert ZeroAmount();

        // Check if user has enough coupons purchased through marketplace
        if (purchasedCoupons[user][typeId] < amount) {
            revert RefundNotAvailable();
        }

        // Check if user has enough coupon balance
        if (couponContract.balanceOf(user, typeId) < amount) {
            revert InsufficientCouponBalance();
        }

        // Check if coupon is expired
        if (couponContract.isCouponActive(typeId)) {
            revert CouponNotExpired();
        }

        // Check approval
        if (!couponContract.isApprovedForAll(user, address(this))) {
            revert CouponNotApproved();
        }
    }

    /**
     * @dev Validate price update parameters and permissions
     * @param seller Address attempting to update price
     * @param listingId ID of listing
     * @param newPricePerUnit New price to set
     */
    function _validatePriceUpdate(
        address seller,
        uint256 listingId,
        uint256 newPricePerUnit
    ) internal view virtual {
        if (newPricePerUnit == 0) revert ZeroPrice();

        Listing storage listing = listings[listingId];
        if (!listing.active) revert CouponNotForSale();
        if (listing.seller != seller) revert NotCouponOwner();
    }

    // ============ Internal Execution Functions ============

    /**
     * @dev Execute voucher listing
     * @param seller Address of the seller
     * @param typeId ID of voucher type to list
     * @param amount Amount to list
     * @param pricePerUnit Price per voucher in specified token
     * @param paymentToken Address of the ERC-20 payment token
     * @return listingId The ID of the created listing
     */
    function _executeListCoupon(
        address seller,
        uint256 typeId,
        uint256 amount,
        uint256 pricePerUnit,
        address paymentToken
    ) internal virtual returns (uint256) {
        // Transfer coupons to marketplace for escrow
        couponContract.safeTransferFrom(
            seller,
            address(this),
            typeId,
            amount,
            ""
        );

        uint256 listingId = _nextListingId++;

        // Create listing
        listings[listingId] = Listing({
            seller: seller,
            typeId: typeId,
            amount: amount,
            pricePerUnit: pricePerUnit,
            paymentToken: paymentToken,
            active: true,
            listedAt: block.timestamp
        });

        // Add to active listings array
        _activeListingIndex[listingId] = activeListings.length;
        activeListings.push(listingId);

        emit CouponListed(
            listingId,
            typeId,
            seller,
            amount,
            pricePerUnit,
            paymentToken
        );
        return listingId;
    }

    /**
     * @dev Execute voucher purchase
     * @param buyer Address of the buyer
     * @param listingId ID of listing to buy from
     * @param amount Amount to buy
     */
    function _executeBuyCoupon(
        address buyer,
        uint256 listingId,
        uint256 amount
    ) internal virtual {
        Listing storage listing = listings[listingId];
        uint256 totalPrice = listing.pricePerUnit * amount;

        // Update listing amount
        listing.amount -= amount;
        if (listing.amount == 0) {
            // Mark as sold and remove from active listings
            listing.active = false;
            _removeFromActiveListings(listingId);
        }

        // Handle payment based on token type
        if (listing.paymentToken == address(thbToken)) {
            // Generate unique escrow ID for this buyer
            uint256 escrowId = _nextEscrowId++;

            // Use vault escrow for THB payments
            vault.lockFunds(
                escrowId,
                listing.seller,
                buyer,
                totalPrice,
                amount
            );

            // Track escrow ID for this purchase
            purchaseEscrowIds[buyer][listing.typeId].push(escrowId);

            // Track escrow ID for this coupon type (for seller payments on redemption)
            typeEscrowIds[listing.typeId].push(escrowId);
        } else {
            // Direct payment for other ERC-20 tokens
            IERC20 paymentToken = IERC20(listing.paymentToken);
            require(
                paymentToken.transferFrom(buyer, listing.seller, totalPrice),
                "Payment transfer failed"
            );
        }

        // Track purchase for refund purposes
        purchasedCoupons[buyer][listing.typeId] += amount;
        totalPaidForCoupons[buyer][listing.typeId] += totalPrice;

        // Note: Escrow ID tracking for THB payments is handled above in the THB payment block

        // Transfer vouchers from marketplace to buyer
        couponContract.safeTransferFrom(
            address(this),
            buyer,
            listing.typeId,
            amount,
            ""
        );

        emit CouponSold(
            listingId,
            listing.typeId,
            listing.seller,
            buyer,
            amount,
            totalPrice,
            listing.paymentToken
        );
    }

    /**
     * @dev Execute voucher delisting
     * @param seller Address of the seller
     * @param listingId ID of listing to delist
     */
    function _executeDelistCoupon(
        address seller,
        uint256 listingId
    ) internal virtual {
        Listing storage listing = listings[listingId];

        // Mark as inactive
        listing.active = false;
        _removeFromActiveListings(listingId);

        // If there's an active escrow (some vouchers were sold), return funds to buyers
        if (vault.hasActiveEscrow(listingId)) {
            vault.returnFunds(listingId);
        }

        // Return remaining coupons to seller
        if (listing.amount > 0) {
            couponContract.safeTransferFrom(
                address(this),
                seller,
                listing.typeId,
                listing.amount,
                ""
            );
        }

        emit CouponDelisted(listingId, seller);
    }

    /**
     * @dev Release escrow funds to sellers when coupons are redeemed
     * @param typeId Coupon type being redeemed
     * @param amount Amount of coupons being redeemed
     */
    function _releaseEscrowForSellers(uint256 typeId, uint256 amount) internal {
        uint256[] storage escrowIds = typeEscrowIds[typeId];
        uint256 remainingToRelease = amount;

        // Process escrows FIFO (oldest first) to release funds to sellers
        uint256 i = 0;
        while (remainingToRelease > 0 && i < escrowIds.length) {
            uint256 escrowId = escrowIds[i];

            // Check if this escrow has remaining funds
            (
                ,
                ,
                ,
                ,
                uint256 couponsLocked,
                uint256 couponsRedeemed,
                bool active,

            ) = vault.getEscrow(escrowId);
            uint256 availableCoupons = couponsLocked - couponsRedeemed;

            if (availableCoupons > 0 && active) {
                uint256 toReleaseFromThis = remainingToRelease <
                    availableCoupons
                    ? remainingToRelease
                    : availableCoupons;

                // Release funds from vault for this specific amount
                vault.releaseFundsPartial(escrowId, toReleaseFromThis);

                remainingToRelease -= toReleaseFromThis;

                // Check if this escrow is fully redeemed
                (, , , uint256 newRemainingAmount, , , , ) = vault.getEscrow(
                    escrowId
                );
                if (newRemainingAmount == 0) {
                    // Remove this escrow ID by swapping with last element
                    escrowIds[i] = escrowIds[escrowIds.length - 1];
                    escrowIds.pop();
                    // Don't increment i since we moved a new element to this position
                } else {
                    i++;
                }
            } else {
                i++;
            }
        }
    }

    /**
     * @dev Release escrow funds proportionally when coupons are redeemed (legacy function)
     * @param redeemer Address redeeming coupons
     * @param typeId Coupon type being redeemed
     * @param amount Amount of coupons being redeemed
     */
    function _releaseEscrowForRedemption(
        address redeemer,
        uint256 typeId,
        uint256 amount
    ) internal {
        // Get the user's escrow IDs for this coupon type
        uint256[] storage escrowIds = purchaseEscrowIds[redeemer][typeId];

        uint256 remainingToRelease = amount;

        // Process from most recent purchases first (LIFO)
        for (
            uint256 i = escrowIds.length;
            i > 0 && remainingToRelease > 0;
            i--
        ) {
            uint256 escrowId = escrowIds[i - 1];

            // Check if this escrow has remaining funds
            (
                ,
                ,
                ,
                ,
                uint256 couponsLocked,
                uint256 couponsRedeemed,
                bool active,

            ) = vault.getEscrow(escrowId);
            uint256 availableCoupons = couponsLocked - couponsRedeemed;

            if (availableCoupons > 0 && active) {
                uint256 toReleaseFromThis = remainingToRelease <
                    availableCoupons
                    ? remainingToRelease
                    : availableCoupons;

                // Release funds from vault for this specific amount
                vault.releaseFundsPartial(escrowId, toReleaseFromThis);

                remainingToRelease -= toReleaseFromThis;

                // Check if this escrow is fully redeemed
                (, , , uint256 newRemainingAmount, , , , ) = vault.getEscrow(
                    escrowId
                );
                if (newRemainingAmount == 0) {
                    // Remove this escrow ID by swapping with last element
                    escrowIds[i - 1] = escrowIds[escrowIds.length - 1];
                    escrowIds.pop();

                    // Also remove from type escrow tracking
                    _removeEscrowFromType(typeId, escrowId);
                }
            }
        }
    }

    /**
     * @dev Execute refund for expired coupons
     * @param user Address requesting refund
     * @param typeId ID of the coupon type
     * @param amount Amount of coupons to refund
     */
    function _executeRefundCoupon(
        address user,
        uint256 typeId,
        uint256 amount
    ) internal virtual {
        // Calculate refund amount based on original purchase price
        uint256 avgPricePerCoupon = totalPaidForCoupons[user][typeId] /
            purchasedCoupons[user][typeId];
        uint256 refundAmount = avgPricePerCoupon * amount;

        // Update tracking data
        purchasedCoupons[user][typeId] -= amount;
        totalPaidForCoupons[user][typeId] -= refundAmount;

        // Transfer expired coupons to marketplace (effectively removing them from circulation)
        couponContract.safeTransferFrom(
            user,
            address(this),
            typeId,
            amount,
            ""
        );

        // Process refunds based on payment method used
        _processRefunds(user, typeId, amount, refundAmount);

        emit CouponRefunded(typeId, user, amount, refundAmount);
    }

    /**
     * @dev Process refunds for expired coupons (handles both THB vault and direct token refunds)
     * @param user The user requesting refund
     * @param typeId The coupon type ID
     * @param amount Amount of coupons to refund
     * @param refundAmount Total refund amount in appropriate token
     */
    function _processRefunds(
        address user,
        uint256 typeId,
        uint256 amount,
        uint256 refundAmount
    ) internal {
        // For THB purchases, use vault refunds
        uint256[] storage escrowIds = purchaseEscrowIds[user][typeId];

        if (escrowIds.length > 0) {
            // Process THB refunds from vault
            _processVaultRefunds(user, typeId, amount);
        } else {
            // For non-THB tokens, refund directly from marketplace balance
            // Note: This requires the marketplace to hold tokens for refunds
            // In production, consider implementing a more sophisticated escrow system
            require(
                thbToken.balanceOf(address(this)) >= refundAmount,
                "Insufficient marketplace funds for refund"
            );
            require(
                thbToken.transfer(user, refundAmount),
                "Refund transfer failed"
            );
        }
    }

    /**
     * @dev Processes vault refunds for expired coupons (THB only)
     * @param user The user requesting refund
     * @param typeId The coupon type ID
     * @param amount Amount of coupons to refund
     */
    function _processVaultRefunds(
        address user,
        uint256 typeId,
        uint256 amount
    ) internal {
        uint256[] storage escrowIds = purchaseEscrowIds[user][typeId];

        uint256 remainingToRefund = amount;
        uint256 i = escrowIds.length;

        // Process refunds from most recent purchases first (LIFO)
        while (remainingToRefund > 0 && i > 0) {
            i--;
            uint256 escrowId = escrowIds[i];

            // Get escrow details to check available coupons
            (
                ,
                ,
                ,
                ,
                uint256 couponsLocked,
                uint256 couponsRedeemed,
                bool active,

            ) = vault.getEscrow(escrowId);
            uint256 availableCoupons = couponsLocked - couponsRedeemed;

            if (availableCoupons > 0 && active) {
                uint256 refundFromThis = remainingToRefund < availableCoupons
                    ? remainingToRefund
                    : availableCoupons;

                // Return funds from vault for this escrow
                vault.returnFunds(escrowId);

                remainingToRefund -= refundFromThis;

                // Remove this escrow from user's array since it's fully refunded
                if (i != escrowIds.length - 1) {
                    escrowIds[i] = escrowIds[escrowIds.length - 1];
                }
                escrowIds.pop();

                // Also remove from type escrow tracking
                _removeEscrowFromType(typeId, escrowId);
            }
        }

        require(
            remainingToRefund == 0,
            "Insufficient purchase history for refund"
        );
    }

    /**
     * @dev Execute price update
     * @param listingId ID of listing
     * @param newPricePerUnit New price to set
     */
    function _executeUpdatePrice(
        uint256 listingId,
        uint256 newPricePerUnit
    ) internal virtual {
        Listing storage listing = listings[listingId];
        listing.pricePerUnit = newPricePerUnit;

        emit CouponListed(
            listingId,
            listing.typeId,
            listing.seller,
            listing.amount,
            newPricePerUnit,
            listing.paymentToken
        );
    }

    // ============ Internal Utility Functions ============

    /**
     * @dev Remove a listing from the active listings array
     * @param listingId ID of listing to remove
     */
    function _removeFromActiveListings(uint256 listingId) internal {
        uint256 index = _activeListingIndex[listingId];
        uint256 lastIndex = activeListings.length - 1;

        if (index != lastIndex) {
            uint256 lastListingId = activeListings[lastIndex];
            activeListings[index] = lastListingId;
            _activeListingIndex[lastListingId] = index;
        }

        activeListings.pop();
        delete _activeListingIndex[listingId];
    }

    /**
     * @dev Remove an escrow ID from the type escrow tracking
     * @param typeId The coupon type ID
     * @param escrowId The escrow ID to remove
     */
    function _removeEscrowFromType(uint256 typeId, uint256 escrowId) internal {
        uint256[] storage escrowIds = typeEscrowIds[typeId];

        for (uint256 i = 0; i < escrowIds.length; i++) {
            if (escrowIds[i] == escrowId) {
                // Remove by swapping with last element and popping
                escrowIds[i] = escrowIds[escrowIds.length - 1];
                escrowIds.pop();
                break;
            }
        }
    }
}
