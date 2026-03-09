// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ITHB.sol";

contract Vault is Ownable, ReentrancyGuard {
    // Custom errors
    error UnauthorizedAccess();
    error NoEscrowFound();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();

    struct EscrowData {
        address seller; // Address that will receive funds on redeem
        address buyer; // Address that paid the funds
        uint256 totalAmount; // Total amount of THB escrowed
        uint256 remainingAmount; // Remaining amount available for release
        uint256 couponsLocked; // Number of coupons this escrow covers
        uint256 couponsRedeemed; // Number of coupons already redeemed
        bool active; // Whether escrow is active
        uint256 lockedAt; // Timestamp when funds were locked
    }

    // State variables
    ITHB public immutable thbToken;
    address public marketplace;

    // Mapping from unique escrow ID to escrow data
    mapping(uint256 => EscrowData) public escrows;

    // Events
    event FundsLocked(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 amount
    );
    event FundsReleased(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 amount
    );
    event FundsReturned(
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 amount
    );
    event MarketplaceUpdated(address indexed newMarketplace);

    modifier onlyMarketplace() {
        if (msg.sender != marketplace) revert UnauthorizedAccess();
        _;
    }

    constructor(address thbToken_) Ownable(msg.sender) {
        if (thbToken_ == address(0)) revert ZeroAddress();
        thbToken = ITHB(thbToken_);
    }

    /**
     * @notice Set the marketplace contract address (only owner)
     * @param marketplace_ The marketplace contract address
     */
    function setMarketplace(address marketplace_) external onlyOwner {
        if (marketplace_ == address(0)) revert ZeroAddress();
        marketplace = marketplace_;
        emit MarketplaceUpdated(marketplace_);
    }

    /**
     * @notice Lock THB funds in escrow for a coupon sale
     * @param tokenId The listing ID
     * @param seller The seller address (who will receive funds on redeem)
     * @param buyer The buyer address (who is paying)
     * @param amount The amount of THB to lock
     * @param couponsLocked The number of coupons this escrow covers
     */
    function lockFunds(
        uint256 tokenId,
        address seller,
        address buyer,
        uint256 amount,
        uint256 couponsLocked
    ) external onlyMarketplace nonReentrant {
        if (seller == address(0) || buyer == address(0)) revert ZeroAddress();
        if (amount == 0 || couponsLocked == 0) revert ZeroAmount();

        // Check that buyer has sufficient THB and allowance
        if (thbToken.balanceOf(buyer) < amount) revert InsufficientBalance();
        if (thbToken.allowance(buyer, address(this)) < amount)
            revert InsufficientBalance();

        // Transfer THB from buyer to vault
        thbToken.transferFrom(buyer, address(this), amount);

        // Store escrow data (tokenId should be unique per buyer-listing combination)
        escrows[tokenId] = EscrowData({
            seller: seller,
            buyer: buyer,
            totalAmount: amount,
            remainingAmount: amount,
            couponsLocked: couponsLocked,
            couponsRedeemed: 0,
            active: true,
            lockedAt: block.timestamp
        });

        emit FundsLocked(tokenId, seller, buyer, amount);
    }

    /**
     * @notice Release all remaining escrowed funds to seller
     * @param tokenId The listing ID
     */
    function releaseFunds(
        uint256 tokenId
    ) external onlyMarketplace nonReentrant {
        EscrowData storage escrow = escrows[tokenId];
        if (!escrow.active) revert NoEscrowFound();

        address seller = escrow.seller;
        address buyer = escrow.buyer;
        uint256 amount = escrow.remainingAmount;

        // Mark as inactive
        escrow.active = false;
        escrow.remainingAmount = 0;

        // Transfer remaining THB from vault to seller
        thbToken.transfer(seller, amount);

        emit FundsReleased(tokenId, seller, buyer, amount);
    }

    /**
     * @notice Release funds partially when specific number of coupons are redeemed
     * @param tokenId The listing ID
     * @param couponsToRedeem Number of coupons being redeemed
     */
    function releaseFundsPartial(
        uint256 tokenId,
        uint256 couponsToRedeem
    ) external onlyMarketplace nonReentrant {
        EscrowData storage escrow = escrows[tokenId];
        if (!escrow.active) revert NoEscrowFound();
        if (couponsToRedeem == 0) revert ZeroAmount();

        // Check if we have enough coupons left to redeem
        uint256 availableCoupons = escrow.couponsLocked -
            escrow.couponsRedeemed;
        if (couponsToRedeem > availableCoupons) {
            revert InsufficientBalance();
        }

        // Calculate proportional amount to release
        uint256 amountToRelease = (escrow.totalAmount * couponsToRedeem) /
            escrow.couponsLocked;

        // Update escrow state
        escrow.couponsRedeemed += couponsToRedeem;
        escrow.remainingAmount -= amountToRelease;

        // If all coupons redeemed, mark as inactive
        if (escrow.couponsRedeemed == escrow.couponsLocked) {
            escrow.active = false;
        }

        // Transfer proportional THB from vault to seller
        thbToken.transfer(escrow.seller, amountToRelease);

        emit FundsReleased(
            tokenId,
            escrow.seller,
            escrow.buyer,
            amountToRelease
        );
    }

    /**
     * @notice Return escrowed funds to buyer (e.g., when listing is delisted or refunded)
     * @param tokenId The listing ID
     */
    function returnFunds(
        uint256 tokenId
    ) external onlyMarketplace nonReentrant {
        EscrowData storage escrow = escrows[tokenId];
        if (!escrow.active) revert NoEscrowFound();

        address buyer = escrow.buyer;
        uint256 amount = escrow.remainingAmount;

        // Mark as inactive
        escrow.active = false;
        escrow.remainingAmount = 0;

        // Transfer remaining THB from vault to buyer
        thbToken.transfer(buyer, amount);

        emit FundsReturned(tokenId, buyer, amount);
    }

    /**
     * @notice Get escrow details for a listing
     * @param tokenId The listing ID
     * @return seller The seller address
     * @return buyer The buyer address
     * @return totalAmount The total escrowed amount
     * @return remainingAmount The remaining amount available
     * @return couponsLocked Total coupons locked in escrow
     * @return couponsRedeemed Number of coupons already redeemed
     * @return active Whether escrow is active
     * @return lockedAt Timestamp when funds were locked
     */
    function getEscrow(
        uint256 tokenId
    )
        external
        view
        returns (
            address seller,
            address buyer,
            uint256 totalAmount,
            uint256 remainingAmount,
            uint256 couponsLocked,
            uint256 couponsRedeemed,
            bool active,
            uint256 lockedAt
        )
    {
        EscrowData memory escrow = escrows[tokenId];
        return (
            escrow.seller,
            escrow.buyer,
            escrow.totalAmount,
            escrow.remainingAmount,
            escrow.couponsLocked,
            escrow.couponsRedeemed,
            escrow.active,
            escrow.lockedAt
        );
    }

    /**
     * @notice Check if escrow exists and is active for a voucher
     * @param tokenId The voucher token ID
     * @return True if active escrow exists
     */
    function hasActiveEscrow(uint256 tokenId) external view returns (bool) {
        return escrows[tokenId].active;
    }

    /**
     * @notice Emergency function to recover stuck tokens (only owner)
     * @param tokenId The listing ID
     * @param recipient The address to send funds to
     */
    function emergencyRecoverFunds(
        uint256 tokenId,
        address recipient
    ) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();

        EscrowData storage escrow = escrows[tokenId];
        if (!escrow.active) revert NoEscrowFound();

        uint256 amount = escrow.remainingAmount;
        escrow.active = false;
        escrow.remainingAmount = 0;

        thbToken.transfer(recipient, amount);
    }
}