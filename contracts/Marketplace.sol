// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title Marketplace
 * @dev NFT Marketplace supporting ERC721 and ERC1155 with mixed payment options
 */
contract Marketplace is Ownable, ReentrancyGuard, Pausable, ERC721Holder, ERC1155Holder {
    
    // Structs
    struct PaymentToken {
        bool isEnabled;
        uint256 minAmount;
        string symbol;
    }
    
    struct PaymentSplit {
        address token;
        uint256 percentage; // Basis points (10000 = 100%)
    }
    
    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 amount; // For ERC1155, 1 for ERC721
        uint256 pricePerToken;
        bool isERC721;
        bool isActive;
        uint256 listedAt;
    }
    
    struct Offer {
        address buyer;
        uint256 listingId;
        PaymentSplit[] paymentSplits;
        uint256 totalAmount;
        uint256 expiresAt;
        bool isActive;
    }
    
    // State variables
    mapping(address => PaymentToken) public paymentTokens;
    address[] public paymentTokenList;
    
    mapping(uint256 => Listing) public listings;
    uint256 public listingCounter;
    
    mapping(uint256 => Offer) public offers;
    uint256 public offerCounter;
    
    mapping(address => mapping(address => uint256[])) public sellerListings; // seller => nftContract => listingIds
    mapping(address => uint256[]) public buyerOffers;
    
    uint256 public platformFee; // Basis points (10000 = 100%)
    address public feeRecipient;
    
    uint256 public constant MAX_PAYMENT_SPLITS = 5;
    uint256 public constant BASIS_POINTS = 10000;
    
    // Events
    event PaymentTokenAdded(address indexed token, string symbol);
    event PaymentTokenRemoved(address indexed token);
    event PaymentTokenUpdated(address indexed token, bool isEnabled, uint256 minAmount);
    
    event ItemListed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerToken,
        bool isERC721
    );
    
    event ItemDelisted(uint256 indexed listingId);
    
    event ItemSold(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 totalPrice
    );
    
    event OfferCreated(
        uint256 indexed offerId,
        uint256 indexed listingId,
        address indexed buyer,
        uint256 totalAmount
    );
    
    event OfferAccepted(uint256 indexed offerId, uint256 indexed listingId);
    event OfferCancelled(uint256 indexed offerId);
    
    event PlatformFeeUpdated(uint256 newFee);
    event FeeRecipientUpdated(address newRecipient);
    
    // Errors
    error InvalidPaymentToken();
    error InvalidPaymentSplits();
    error InsufficientAmount();
    error ListingNotActive();
    error NotSeller();
    error NotBuyer();
    error OfferExpired();
    error OfferNotActive();
    error InvalidPercentage();
    error TransferFailed();
    
    constructor(address _feeRecipient, uint256 _platformFee) Ownable(msg.sender) {
        require(_platformFee <= 1000, "Fee too high"); // Max 10%
        feeRecipient = _feeRecipient;
        platformFee = _platformFee;
    }
    
    // ============ Payment Token Management ============
    
    /**
     * @dev Add a new payment token
     */
    function addPaymentToken(
        address token,
        string memory symbol,
        uint256 minAmount
    ) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(!paymentTokens[token].isEnabled, "Token already added");
        
        paymentTokens[token] = PaymentToken({
            isEnabled: true,
            minAmount: minAmount,
            symbol: symbol
        });
        
        paymentTokenList.push(token);
        
        emit PaymentTokenAdded(token, symbol);
    }
    
    /**
     * @dev Remove a payment token
     */
    function removePaymentToken(address token) external onlyOwner {
        require(paymentTokens[token].isEnabled, "Token not enabled");
        
        paymentTokens[token].isEnabled = false;
        
        // Remove from array
        for (uint256 i = 0; i < paymentTokenList.length; i++) {
            if (paymentTokenList[i] == token) {
                paymentTokenList[i] = paymentTokenList[paymentTokenList.length - 1];
                paymentTokenList.pop();
                break;
            }
        }
        
        emit PaymentTokenRemoved(token);
    }
    
    /**
     * @dev Update payment token settings
     */
    function updatePaymentToken(
        address token,
        bool isEnabled,
        uint256 minAmount
    ) external onlyOwner {
        require(paymentTokens[token].isEnabled || isEnabled, "Token not added");
        
        paymentTokens[token].isEnabled = isEnabled;
        paymentTokens[token].minAmount = minAmount;
        
        emit PaymentTokenUpdated(token, isEnabled, minAmount);
    }
    
    /**
     * @dev Get all enabled payment tokens
     */
    function getEnabledPaymentTokens() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < paymentTokenList.length; i++) {
            if (paymentTokens[paymentTokenList[i]].isEnabled) {
                count++;
            }
        }
        
        address[] memory enabled = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < paymentTokenList.length; i++) {
            if (paymentTokens[paymentTokenList[i]].isEnabled) {
                enabled[index] = paymentTokenList[i];
                index++;
            }
        }
        
        return enabled;
    }
    
    // ============ Listing Management ============
    
    /**
     * @dev List an ERC721 NFT for sale
     */
    function listERC721(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external whenNotPaused returns (uint256) {
        require(price > 0, "Price must be greater than 0");
        
        IERC721 nft = IERC721(nftContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Not token owner");
        require(
            nft.isApprovedForAll(msg.sender, address(this)) ||
            nft.getApproved(tokenId) == address(this),
            "Marketplace not approved"
        );
        
        uint256 listingId = listingCounter++;
        
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            amount: 1,
            pricePerToken: price,
            isERC721: true,
            isActive: true,
            listedAt: block.timestamp
        });
        
        sellerListings[msg.sender][nftContract].push(listingId);
        
        emit ItemListed(listingId, msg.sender, nftContract, tokenId, 1, price, true);
        
        return listingId;
    }
    
    /**
     * @dev List an ERC1155 NFT for sale
     */
    function listERC1155(
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerToken
    ) external whenNotPaused returns (uint256) {
        require(amount > 0, "Amount must be greater than 0");
        require(pricePerToken > 0, "Price must be greater than 0");
        
        IERC1155 nft = IERC1155(nftContract);
        require(nft.balanceOf(msg.sender, tokenId) >= amount, "Insufficient balance");
        require(nft.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");
        
        uint256 listingId = listingCounter++;
        
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            amount: amount,
            pricePerToken: pricePerToken,
            isERC721: false,
            isActive: true,
            listedAt: block.timestamp
        });
        
        sellerListings[msg.sender][nftContract].push(listingId);
        
        emit ItemListed(listingId, msg.sender, nftContract, tokenId, amount, pricePerToken, false);
        
        return listingId;
    }
    
    /**
     * @dev Delist an item
     */
    function delist(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (!listing.isActive) revert ListingNotActive();
        
        listing.isActive = false;
        
        emit ItemDelisted(listingId);
    }
    
    // ============ Purchase Functions ============
    
    /**
     * @dev Buy with a single payment token
     */
    function buyWithSingleToken(
        uint256 listingId,
        address paymentToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        PaymentSplit[] memory splits = new PaymentSplit[](1);
        splits[0] = PaymentSplit({
            token: paymentToken,
            percentage: BASIS_POINTS // 100%
        });
        
        _executePurchase(listingId, amount, splits);
    }
    
    /**
     * @dev Buy with mixed payment tokens
     * @param listingId The listing to purchase
     * @param amount Amount to buy (for ERC1155)
     * @param paymentSplits Array of payment splits (token address and percentage)
     */
    function buyWithMixedPayment(
        uint256 listingId,
        uint256 amount,
        PaymentSplit[] memory paymentSplits
    ) external nonReentrant whenNotPaused {
        _executePurchase(listingId, amount, paymentSplits);
    }
    
    /**
     * @dev Internal function to execute purchase
     */
    function _executePurchase(
        uint256 listingId,
        uint256 amount,
        PaymentSplit[] memory paymentSplits
    ) internal {
        Listing storage listing = listings[listingId];
        
        if (!listing.isActive) revert ListingNotActive();
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= listing.amount, "Insufficient listing amount");
        
        // Validate payment splits
        _validatePaymentSplits(paymentSplits);
        
        uint256 totalPrice = listing.pricePerToken * amount;
        uint256 platformFeeAmount = (totalPrice * platformFee) / BASIS_POINTS;
        uint256 sellerAmount = totalPrice - platformFeeAmount;
        
        // Process payments
        _processPayments(paymentSplits, totalPrice, listing.seller, platformFeeAmount, sellerAmount);
        
        // Transfer NFT
        if (listing.isERC721) {
            IERC721(listing.nftContract).safeTransferFrom(
                listing.seller,
                msg.sender,
                listing.tokenId
            );
            listing.isActive = false;
        } else {
            IERC1155(listing.nftContract).safeTransferFrom(
                listing.seller,
                msg.sender,
                listing.tokenId,
                amount,
                ""
            );
            listing.amount -= amount;
            if (listing.amount == 0) {
                listing.isActive = false;
            }
        }
        
        emit ItemSold(listingId, msg.sender, listing.seller, amount, totalPrice);
    }
    
    /**
     * @dev Validate payment splits
     */
    function _validatePaymentSplits(PaymentSplit[] memory splits) internal view {
        if (splits.length == 0 || splits.length > MAX_PAYMENT_SPLITS) 
            revert InvalidPaymentSplits();
        
        uint256 totalPercentage = 0;
        
        for (uint256 i = 0; i < splits.length; i++) {
            if (!paymentTokens[splits[i].token].isEnabled) 
                revert InvalidPaymentToken();
            
            totalPercentage += splits[i].percentage;
            
            // Check for duplicates
            for (uint256 j = i + 1; j < splits.length; j++) {
                require(splits[i].token != splits[j].token, "Duplicate payment token");
            }
        }
        
        if (totalPercentage != BASIS_POINTS) revert InvalidPercentage();
    }
    
    /**
     * @dev Process mixed payments
     */
    function _processPayments(
        PaymentSplit[] memory splits,
        uint256 totalPrice,
        address seller,
        uint256 platformFeeAmount,
        uint256 sellerAmount
    ) internal {
        for (uint256 i = 0; i < splits.length; i++) {
            address token = splits[i].token;
            uint256 percentage = splits[i].percentage;
            
            uint256 tokenAmount = (totalPrice * percentage) / BASIS_POINTS;
            uint256 tokenFee = (platformFeeAmount * percentage) / BASIS_POINTS;
            uint256 tokenSeller = (sellerAmount * percentage) / BASIS_POINTS;
            
            IERC20 paymentToken = IERC20(token);
            
            // Transfer platform fee
            if (tokenFee > 0) {
                bool feeSuccess = paymentToken.transferFrom(msg.sender, feeRecipient, tokenFee);
                if (!feeSuccess) revert TransferFailed();
            }
            
            // Transfer to seller
            bool sellerSuccess = paymentToken.transferFrom(msg.sender, seller, tokenSeller);
            if (!sellerSuccess) revert TransferFailed();
        }
    }
    
    // ============ Offer System ============
    
    /**
     * @dev Create an offer for a listing
     */
    function createOffer(
        uint256 listingId,
        uint256 amount,
        PaymentSplit[] memory paymentSplits,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256) {
        Listing storage listing = listings[listingId];
        if (!listing.isActive) revert ListingNotActive();
        require(amount > 0 && amount <= listing.amount, "Invalid amount");
        
        // Validate payment splits
        _validatePaymentSplits(paymentSplits);
        
        uint256 totalAmount = listing.pricePerToken * amount;
        
        // Lock tokens for the offer
        for (uint256 i = 0; i < paymentSplits.length; i++) {
            uint256 tokenAmount = (totalAmount * paymentSplits[i].percentage) / BASIS_POINTS;
            IERC20 token = IERC20(paymentSplits[i].token);
            bool success = token.transferFrom(msg.sender, address(this), tokenAmount);
            if (!success) revert TransferFailed();
        }
        
        uint256 offerId = offerCounter++;
        
        // Store payment splits
        Offer storage offer = offers[offerId];
        offer.buyer = msg.sender;
        offer.listingId = listingId;
        offer.totalAmount = totalAmount;
        offer.expiresAt = block.timestamp + duration;
        offer.isActive = true;
        
        for (uint256 i = 0; i < paymentSplits.length; i++) {
            offer.paymentSplits.push(paymentSplits[i]);
        }
        
        buyerOffers[msg.sender].push(offerId);
        
        emit OfferCreated(offerId, listingId, msg.sender, totalAmount);
        
        return offerId;
    }
    
    /**
     * @dev Accept an offer (seller only)
     */
    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        Listing storage listing = listings[offer.listingId];
        
        if (listing.seller != msg.sender) revert NotSeller();
        if (!offer.isActive) revert OfferNotActive();
        if (block.timestamp > offer.expiresAt) revert OfferExpired();
        
        offer.isActive = false;
        
        uint256 platformFeeAmount = (offer.totalAmount * platformFee) / BASIS_POINTS;
        uint256 sellerAmount = offer.totalAmount - platformFeeAmount;
        
        // Distribute locked tokens
        for (uint256 i = 0; i < offer.paymentSplits.length; i++) {
            address token = offer.paymentSplits[i].token;
            uint256 percentage = offer.paymentSplits[i].percentage;
            
            uint256 tokenFee = (platformFeeAmount * percentage) / BASIS_POINTS;
            uint256 tokenSeller = (sellerAmount * percentage) / BASIS_POINTS;
            
            IERC20 paymentToken = IERC20(token);
            
            if (tokenFee > 0) {
                bool feeSuccess = paymentToken.transfer(feeRecipient, tokenFee);
                if (!feeSuccess) revert TransferFailed();
            }
            
            bool sellerSuccess = paymentToken.transfer(listing.seller, tokenSeller);
            if (!sellerSuccess) revert TransferFailed();
        }
        
        // Transfer NFT
        uint256 amount = offer.totalAmount / listing.pricePerToken;
        
        if (listing.isERC721) {
            IERC721(listing.nftContract).safeTransferFrom(
                listing.seller,
                offer.buyer,
                listing.tokenId
            );
            listing.isActive = false;
        } else {
            IERC1155(listing.nftContract).safeTransferFrom(
                listing.seller,
                offer.buyer,
                listing.tokenId,
                amount,
                ""
            );
            listing.amount -= amount;
            if (listing.amount == 0) {
                listing.isActive = false;
            }
        }
        
        emit OfferAccepted(offerId, offer.listingId);
    }
    
    /**
     * @dev Cancel an offer and return locked tokens
     */
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        
        if (offer.buyer != msg.sender) revert NotBuyer();
        if (!offer.isActive) revert OfferNotActive();
        
        offer.isActive = false;
        
        // Return locked tokens
        for (uint256 i = 0; i < offer.paymentSplits.length; i++) {
            address token = offer.paymentSplits[i].token;
            uint256 percentage = offer.paymentSplits[i].percentage;
            uint256 tokenAmount = (offer.totalAmount * percentage) / BASIS_POINTS;
            
            IERC20 paymentToken = IERC20(token);
            bool success = paymentToken.transfer(msg.sender, tokenAmount);
            if (!success) revert TransferFailed();
        }
        
        emit OfferCancelled(offerId);
    }
    
    // ============ Admin Functions ============
    
    function setPlatformFee(uint256 _platformFee) external onlyOwner {
        require(_platformFee <= 1000, "Fee too high"); // Max 10%
        platformFee = _platformFee;
        emit PlatformFeeUpdated(_platformFee);
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid address");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    function getListingsByseller(address seller, address nftContract) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return sellerListings[seller][nftContract];
    }
    
    function getOffersByBuyer(address buyer) external view returns (uint256[] memory) {
        return buyerOffers[buyer];
    }
    
    function getOfferPaymentSplits(uint256 offerId) 
        external 
        view 
        returns (PaymentSplit[] memory) 
    {
        return offers[offerId].paymentSplits;
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}