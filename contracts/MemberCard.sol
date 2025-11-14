// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MemberCard is ERC721, Ownable {
    uint256 private _tokenIdCounter;
    uint256 public constant MAX_STAMPS = 10;
    
    struct CardData {
        uint256 stampCount;
        bool redeemed;
        uint256[] stampTimestamps;
    }
    
    // Mapping from token ID to card data
    mapping(uint256 => CardData) public cardData;
    
    event CardMinted(address indexed to, uint256 indexed tokenId);
    event Stamped(uint256 indexed tokenId, uint256 stampCount, uint256 timestamp);
    event Redeemed(uint256 indexed tokenId, address indexed owner);
    
    constructor() ERC721("MemberCard", "MCARD") Ownable(msg.sender) {}
    
    /**
     * @dev Mint a new member card to an address
     */
    function mintCard(address to) public onlyOwner returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        
        // Initialize card data
        cardData[tokenId].stampCount = 0;
        cardData[tokenId].redeemed = false;
        
        emit CardMinted(to, tokenId);
        return tokenId;
    }
    
    /**
     * @dev Add a stamp to a member card
     */
    function addStamp(uint256 tokenId) public onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Card does not exist");
        require(!cardData[tokenId].redeemed, "Card already redeemed");
        require(cardData[tokenId].stampCount < MAX_STAMPS, "Card is full");
        
        cardData[tokenId].stampCount++;
        cardData[tokenId].stampTimestamps.push(block.timestamp);
        
        emit Stamped(tokenId, cardData[tokenId].stampCount, block.timestamp);
    }
    
    /**
     * @dev Redeem reward when card has 10 stamps
     */
    function redeemReward(uint256 tokenId) public {
        require(_ownerOf(tokenId) == msg.sender, "Not the card owner");
        require(cardData[tokenId].stampCount == MAX_STAMPS, "Need 10 stamps to redeem");
        require(!cardData[tokenId].redeemed, "Already redeemed");
        
        cardData[tokenId].redeemed = true;
        
        emit Redeemed(tokenId, msg.sender);
        
        // Add your reward logic here
        // For example: transfer tokens, mint NFT, etc.
    }
    
    /**
     * @dev Get card information
     */
    function getCardInfo(uint256 tokenId) public view returns (
        uint256 stampCount,
        bool redeemed,
        uint256[] memory stampTimestamps,
        bool canRedeem
    ) {
        require(_ownerOf(tokenId) != address(0), "Card does not exist");
        
        CardData memory card = cardData[tokenId];
        return (
            card.stampCount,
            card.redeemed,
            card.stampTimestamps,
            card.stampCount == MAX_STAMPS && !card.redeemed
        );
    }
    
    /**
     * @dev Get all stamps for a card
     */
    function getStamps(uint256 tokenId) public view returns (uint256[] memory) {
        require(_ownerOf(tokenId) != address(0), "Card does not exist");
        return cardData[tokenId].stampTimestamps;
    }
    
    /**
     * @dev Check if card is redeemed
     */
    function isRedeemed(uint256 tokenId) public view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Card does not exist");
        return cardData[tokenId].redeemed;
    }
    
    /**
     * @dev Get stamp count
     */
    function getStampCount(uint256 tokenId) public view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Card does not exist");
        return cardData[tokenId].stampCount;
    }
    
    /**
     * @dev Reset card after redemption (optional - for reusable cards)
     */
    function resetCard(uint256 tokenId) public onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Card does not exist");
        require(cardData[tokenId].redeemed, "Card not yet redeemed");
        
        cardData[tokenId].stampCount = 0;
        cardData[tokenId].redeemed = false;
        delete cardData[tokenId].stampTimestamps;
    }
}