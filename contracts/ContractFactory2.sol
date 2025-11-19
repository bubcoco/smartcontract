// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleERC20
 * @dev Basic ERC20 token with minting capability
 */
contract SimpleERC20 is ERC20, Ownable {
    uint8 private _decimals;
    
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply,
        address owner
    ) ERC20(name, symbol) Ownable(owner) {
        _decimals = decimals_;
        _mint(owner, initialSupply);
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

/**
 * @title SimpleERC721
 * @dev Basic ERC721 token with minting capability
 */
contract SimpleERC721 is ERC721, Ownable {
    uint256 private _tokenIdCounter;
    string private _baseTokenURI;
    
    constructor(
        string memory name,
        string memory symbol,
        string memory baseTokenURI,
        address owner,
        uint256 initialMintAmount
    ) ERC721(name, symbol) Ownable(owner) {
        _baseTokenURI = baseTokenURI;
        
        // Mint initial tokens to owner
        for (uint256 i = 0; i < initialMintAmount; i++) {
            _safeMint(owner, _tokenIdCounter);
            _tokenIdCounter++;
        }
    }
    
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }
    
    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        _safeMint(to, tokenId);
        return tokenId;
    }
    
    function mintBatch(address to, uint256 amount) external onlyOwner returns (uint256[] memory) {
        uint256[] memory tokenIds = new uint256[](amount);
        
        for (uint256 i = 0; i < amount; i++) {
            tokenIds[i] = _tokenIdCounter;
            _safeMint(to, _tokenIdCounter);
            _tokenIdCounter++;
        }
        
        return tokenIds;
    }
    
    function setBaseURI(string memory baseTokenURI) external onlyOwner {
        _baseTokenURI = baseTokenURI;
    }
    
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }
}

/**
 * @title SimpleERC1155
 * @dev Basic ERC1155 token with minting capability
 */
contract SimpleERC1155 is ERC1155, Ownable {
    string public name;
    uint256 private _currentTokenId;
    
    // Mapping to track total supply of each token ID
    mapping(uint256 => uint256) private _totalSupply;
    
    constructor(
        string memory uri,
        string memory name_,
        address owner,
        uint256[] memory initialTokenIds,
        uint256[] memory initialAmounts
    ) ERC1155(uri) Ownable(owner) {
        name = name_;
        
        // Mint initial tokens to owner
        require(initialTokenIds.length == initialAmounts.length, "Arrays length mismatch");
        
        if (initialTokenIds.length > 0) {
            _mintBatch(owner, initialTokenIds, initialAmounts, "");
            
            for (uint256 i = 0; i < initialTokenIds.length; i++) {
                _totalSupply[initialTokenIds[i]] += initialAmounts[i];
                // Update current token ID tracker
                if (initialTokenIds[i] >= _currentTokenId) {
                    _currentTokenId = initialTokenIds[i] + 1;
                }
            }
        }
    }
    
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external onlyOwner {
        _mint(to, id, amount, data);
        _totalSupply[id] += amount;
        
        if (id >= _currentTokenId) {
            _currentTokenId = id + 1;
        }
    }
    
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyOwner {
        _mintBatch(to, ids, amounts, data);
        
        for (uint256 i = 0; i < ids.length; i++) {
            _totalSupply[ids[i]] += amounts[i];
            if (ids[i] >= _currentTokenId) {
                _currentTokenId = ids[i] + 1;
            }
        }
    }
    
    function mintNew(
        address to,
        uint256 amount,
        bytes memory data
    ) external onlyOwner returns (uint256) {
        uint256 newTokenId = _currentTokenId;
        _currentTokenId++;
        
        _mint(to, newTokenId, amount, data);
        _totalSupply[newTokenId] = amount;
        
        return newTokenId;
    }
    
    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }
    
    function totalSupply(uint256 id) external view returns (uint256) {
        return _totalSupply[id];
    }
    
    function exists(uint256 id) external view returns (bool) {
        return _totalSupply[id] > 0;
    }
    
    function currentTokenId() external view returns (uint256) {
        return _currentTokenId;
    }
}

/**
 * @title ContractFactory2
 * @dev Factory contract to deploy ERC20, ERC721, and ERC1155 tokens
 */
contract ContractFactory2 is Ownable {
    
    // Events
    event ERC20Created(address indexed tokenAddress, address indexed owner, string name, string symbol, uint256 initialSupply);
    event ERC721Created(address indexed tokenAddress, address indexed owner, string name, string symbol, uint256 initialMintAmount);
    event ERC1155Created(address indexed tokenAddress, address indexed owner, string name, uint256 initialTokensCount);
    
    // Arrays to track deployed contracts
    address[] public erc20Tokens;
    address[] public erc721Tokens;
    address[] public erc1155Tokens;
    
    // Mappings to track contracts by creator
    mapping(address => address[]) public creatorToERC20;
    mapping(address => address[]) public creatorToERC721;
    mapping(address => address[]) public creatorToERC1155;
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Create a new ERC20 token
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @param initialSupply Initial supply to mint to owner
     * @return address The address of the newly created token
     */
    function createERC20(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 initialSupply
    ) external returns (address) {
        SimpleERC20 token = new SimpleERC20(
            name,
            symbol,
            decimals,
            initialSupply,
            msg.sender
        );
        
        address tokenAddress = address(token);
        erc20Tokens.push(tokenAddress);
        creatorToERC20[msg.sender].push(tokenAddress);
        
        emit ERC20Created(tokenAddress, msg.sender, name, symbol, initialSupply);
        return tokenAddress;
    }
    
    /**
     * @dev Create a new ERC721 token with initial mint
     * @param name Token name
     * @param symbol Token symbol
     * @param baseTokenURI Base URI for token metadata
     * @param initialMintAmount Number of tokens to mint initially (0 for no initial mint)
     * @return address The address of the newly created token
     */
    function createERC721(
        string memory name,
        string memory symbol,
        string memory baseTokenURI,
        uint256 initialMintAmount
    ) external returns (address) {
        SimpleERC721 token = new SimpleERC721(
            name,
            symbol,
            baseTokenURI,
            msg.sender,
            initialMintAmount
        );
        
        address tokenAddress = address(token);
        erc721Tokens.push(tokenAddress);
        creatorToERC721[msg.sender].push(tokenAddress);
        
        emit ERC721Created(tokenAddress, msg.sender, name, symbol, initialMintAmount);
        return tokenAddress;
    }
    
    /**
     * @dev Create a new ERC1155 token with initial tokens
     * @param uri URI for token metadata
     * @param name Token name
     * @param initialTokenIds Array of token IDs to mint initially (empty for no initial mint)
     * @param initialAmounts Array of amounts for each token ID
     * @return address The address of the newly created token
     */
    function createERC1155(
        string memory uri,
        string memory name,
        uint256[] memory initialTokenIds,
        uint256[] memory initialAmounts
    ) external returns (address) {
        require(initialTokenIds.length == initialAmounts.length, "Arrays length mismatch");
        
        SimpleERC1155 token = new SimpleERC1155(
            uri,
            name,
            msg.sender,
            initialTokenIds,
            initialAmounts
        );
        
        address tokenAddress = address(token);
        erc1155Tokens.push(tokenAddress);
        creatorToERC1155[msg.sender].push(tokenAddress);
        
        emit ERC1155Created(tokenAddress, msg.sender, name, initialTokenIds.length);
        return tokenAddress;
    }
    
    /**
     * @dev Create a new ERC1155 token with simple initial mint (single token type)
     * @param uri URI for token metadata
     * @param name Token name
     * @param initialTokenId Initial token ID to mint
     * @param initialAmount Amount to mint for initial token
     * @return address The address of the newly created token
     */
    function createERC1155Simple(
        string memory uri,
        string memory name,
        uint256 initialTokenId,
        uint256 initialAmount
    ) external returns (address) {
        uint256[] memory tokenIds = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        
        tokenIds[0] = initialTokenId;
        amounts[0] = initialAmount;
        
        return this.createERC1155(uri, name, tokenIds, amounts);
    }
    
    // View functions
    function getERC20Count() external view returns (uint256) {
        return erc20Tokens.length;
    }
    
    function getERC721Count() external view returns (uint256) {
        return erc721Tokens.length;
    }
    
    function getERC1155Count() external view returns (uint256) {
        return erc1155Tokens.length;
    }
    
    function getCreatorERC20Tokens(address creator) external view returns (address[] memory) {
        return creatorToERC20[creator];
    }
    
    function getCreatorERC721Tokens(address creator) external view returns (address[] memory) {
        return creatorToERC721[creator];
    }
    
    function getCreatorERC1155Tokens(address creator) external view returns (address[] memory) {
        return creatorToERC1155[creator];
    }
}