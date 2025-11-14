// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ExpireNFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public totalMinted;
    
    // Track which token IDs have been minted
    mapping(uint256 => bool) private _exists;
    // Track token IDs owned by each address
    mapping(address => uint256[]) private _ownedTokens;
    // Track index of token in owner's array
    mapping(uint256 => uint256) private _ownedTokensIndex;
    
    // OPTIMIZATION: Track available token IDs for efficient random minting
    uint256[] private _availableTokens;
    mapping(uint256 => uint256) private _availableTokensIndex;
    
    // Base URI for metadata
    string private _baseTokenURI;
    
    // Price for minting
    uint256 public mintPrice = 0 ether;

    // Expiration and activity period
    uint256 public expireDate;      // Token expiration date
    uint256 public activityStart;   // When transfers are allowed
    uint256 public activityEnd;     // When transfers freeze (can only burn after)
    
    event MintedAtIndex(address indexed to, uint256 indexed tokenId);
    event MintedRandom(address indexed to, uint256 indexed tokenId);
    event MintedReserve(address indexed to, uint256 indexed tokenId);
    event ExpireDateSet(uint256 expireDate);
    event ActivityPeriodSet(uint256 startTime, uint256 endTime);
    event TokenBurned(address indexed owner, uint256 indexed tokenId);

    constructor(string memory name, string memory symbol) 
        ERC721(name, symbol) 
        Ownable(msg.sender)
    {
        // Default: no expiration
        expireDate = type(uint256).max;
        // Default: transfers enabled immediately
        activityStart = block.timestamp;
        // Default: no end date (transfers always allowed)
        activityEnd = type(uint256).max;
        
        // OPTIMIZATION: Initialize available tokens array
        _initializeAvailableTokens();
    }
    
    /**
     * @dev Initialize the available tokens array with all token IDs
     */
    function _initializeAvailableTokens() private {
        for (uint256 i = 0; i < MAX_SUPPLY; i++) {
            _availableTokens.push(i);
            _availableTokensIndex[i] = i;
        }
    }

    /**
     * @dev Mint a specific token ID at a given index
     * @param tokenId The specific token ID to mint
     */
    function mintAtIndex(uint256 tokenId) external payable {
        require(block.timestamp < expireDate, "Minting has expired");
        require(msg.value >= mintPrice, "Insufficient payment");
        require(tokenId < MAX_SUPPLY, "Token ID exceeds max supply");
        require(!_exists[tokenId], "Token already minted");
        require(totalMinted < MAX_SUPPLY, "Max supply reached");

        _exists[tokenId] = true;
        totalMinted++;
        _safeMint(msg.sender, tokenId);

        emit MintedAtIndex(msg.sender, tokenId);
    }

    /**
     * @dev Mint a random available token ID
     * Uses pseudo-random generation - not suitable for high-value applications
     */
    function mintRandom() external payable returns (uint256) {
        require(block.timestamp < expireDate, "Minting has expired");
        require(msg.value >= mintPrice, "Insufficient payment");
        require(totalMinted < MAX_SUPPLY, "Max supply reached");

        uint256 availableCount = checkAvailableNumber();
        require(availableCount > 0, "No tokens available");

        // Generate pseudo-random number
        uint256 randomIndex = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender,
                    totalMinted
                )
            )
        ) % availableCount;

        // Find the nth available token
        uint256 tokenId = _findAvailableTokenAtIndex(randomIndex);

        _exists[tokenId] = true;
        totalMinted++;
        _safeMint(msg.sender, tokenId);

        emit MintedRandom(msg.sender, tokenId);
        
        return tokenId;
    }

    /**
     * @dev Check how many tokens are still available to mint
     */
    function checkAvailableNumber() public view returns (uint256) {
        return MAX_SUPPLY - totalMinted;
    }

    /**
     * @dev Reserve and mint a specific token ID (only owner)
     * @param to Address to mint to
     * @param tokenId The specific token ID to reserve and mint
     */
    function mintReserve(address to, uint256 tokenId) external onlyOwner {
        require(tokenId < MAX_SUPPLY, "Token ID exceeds max supply");
        require(!_exists[tokenId], "Token already minted");
        require(totalMinted < MAX_SUPPLY, "Max supply reached");

        _exists[tokenId] = true;
        totalMinted++;
        _safeMint(to, tokenId);

        emit MintedReserve(to, tokenId);
    }

    /**
     * @dev Batch reserve mint multiple specific token IDs
     * @param to Address to mint to
     * @param tokenIds Array of token IDs to reserve and mint
     */
    function mintReserveBatch(address to, uint256[] calldata tokenIds) external onlyOwner {
        uint256 count = tokenIds.length;
        require(totalMinted + count <= MAX_SUPPLY, "Would exceed max supply");

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = tokenIds[i];
            require(tokenId < MAX_SUPPLY, "Token ID exceeds max supply");
            require(!_exists[tokenId], "Token already minted");

            _exists[tokenId] = true;
            totalMinted++;
            _safeMint(to, tokenId);

            emit MintedReserve(to, tokenId);
        }
    }

    /**
     * @dev Internal function to find the nth available token
     */
    function _findAvailableTokenAtIndex(uint256 index) private view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < MAX_SUPPLY; i++) {
            if (!_exists[i]) {
                if (count == index) {
                    return i;
                }
                count++;
            }
        }
        revert("No available token found");
    }

    /**
     * @dev Check if a specific token ID exists
     */
    function tokenExists(uint256 tokenId) external view returns (bool) {
        return _exists[tokenId];
    }

    /**
     * @dev Get all token IDs owned by a specific address (using mapping for O(1) lookup)
     * @param owner Address to check
     * @return Array of token IDs owned by the address
     */
    function ownedIds(address owner) public view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }

    /**
     * @dev Get array of available token IDs (limited to first 100 for gas efficiency)
     */
    function getAvailableTokens(uint256 limit) external view returns (uint256[] memory) {
        require(limit <= 100, "Limit too high");
        
        uint256[] memory available = new uint256[](limit);
        uint256 count = 0;
        
        for (uint256 i = 0; i < MAX_SUPPLY && count < limit; i++) {
            if (!_exists[i]) {
                available[count] = i;
                count++;
            }
        }
        
        // Resize array if fewer tokens found
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = available[i];
        }
        
        return result;
    }

    /**
     * @dev Set base URI for token metadata
     */
    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    /**
     * @dev Set mint price
     */
    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
    }

    /**
     * @dev Set expiration date for minting
     * @param timestamp Unix timestamp when minting expires
     */
    function setExpireDate(uint256 timestamp) external onlyOwner {
        require(timestamp > block.timestamp, "Expiration must be in future");
        expireDate = timestamp;
        emit ExpireDateSet(timestamp);
    }

    /**
     * @dev Set activity period (when transfers are allowed)
     * @param startTime Unix timestamp when transfers start
     * @param endTime Unix timestamp when transfers freeze
     */
    function setActivityPeriod(uint256 startTime, uint256 endTime) external onlyOwner {
        require(endTime > startTime, "End must be after start");
        activityStart = startTime;
        activityEnd = endTime;
        emit ActivityPeriodSet(startTime, endTime);
    }

    /**
     * @dev Check if transfers are currently allowed
     */
    function isTransferActive() public view returns (bool) {
        return block.timestamp >= activityStart && block.timestamp < activityEnd;
    }

    /**
     * @dev Check if activity period has ended (only burning allowed)
     */
    function isActivityEnded() public view returns (bool) {
        return block.timestamp >= activityEnd;
    }

    /**
     * @dev Burn a token (allowed anytime by owner, after activity end by anyone)
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) external {
        require(_exists[tokenId], "Token does not exist");
        require(
            ownerOf(tokenId) == msg.sender || isActivityEnded(),
            "Not authorized to burn"
        );
        
        _exists[tokenId] = false;
        _burn(tokenId);
        
        emit TokenBurned(msg.sender, tokenId);
    }

    /**
     * @dev Add token to owner's tracking array
     */
    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) private {
        _ownedTokensIndex[tokenId] = _ownedTokens[to].length;
        _ownedTokens[to].push(tokenId);
    }

    /**
     * @dev Remove token from owner's tracking array
     */
    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId) private {
        uint256 lastTokenIndex = _ownedTokens[from].length - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _ownedTokens[from][lastTokenIndex];

            _ownedTokens[from][tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }

        _ownedTokens[from].pop();
        delete _ownedTokensIndex[tokenId];
    }

    /**
     * @dev Override transfer function to enforce activity period and maintain ownership tracking
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        // Allow burning (to == address(0))
        // Block transfers outside activity period
        if (from != address(0) && to != address(0)) {
            require(isTransferActive(), "Transfers not active or frozen");
        }

        // Remove from previous owner's tracking
        if (from != address(0)) {
            _removeTokenFromOwnerEnumeration(from, tokenId);
        }

        // Add to new owner's tracking
        if (to != address(0)) {
            _addTokenToOwnerEnumeration(to, tokenId);
        }
        
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Withdraw contract balance to owner
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        payable(owner()).transfer(balance);
    }

    /**
     * @dev Override base URI
     */
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Override tokenURI to provide metadata
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists[tokenId], "Token does not exist");
        
        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 
            ? string(abi.encodePacked(baseURI, tokenId.toString(), ".json"))
            : "";
    }
}