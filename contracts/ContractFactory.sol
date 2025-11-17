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
        address owner
    ) ERC721(name, symbol) Ownable(owner) {
        _baseTokenURI = baseTokenURI;
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
    
    function setBaseURI(string memory baseTokenURI) external onlyOwner {
        _baseTokenURI = baseTokenURI;
    }
}

/**
 * @title SimpleERC1155
 * @dev Basic ERC1155 token with minting capability
 */
contract SimpleERC1155 is ERC1155, Ownable {
    string public name;
    
    constructor(
        string memory uri,
        string memory name_,
        address owner
    ) ERC1155(uri) Ownable(owner) {
        name = name_;
    }
    
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external onlyOwner {
        _mint(to, id, amount, data);
    }
    
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }
    
    function setURI(string memory newuri) external onlyOwner {
        _setURI(newuri);
    }
}

/**
 * @title ContractFactory
 * @dev Factory contract to deploy ERC20, ERC721, and ERC1155 tokens
 */
contract ContractFactory is Ownable {
    
    // Events
    event ERC20Created(address indexed tokenAddress, address indexed owner, string name, string symbol);
    event ERC721Created(address indexed tokenAddress, address indexed owner, string name, string symbol);
    event ERC1155Created(address indexed tokenAddress, address indexed owner, string name);
    
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
        
        emit ERC20Created(tokenAddress, msg.sender, name, symbol);
        return tokenAddress;
    }
    
    /**
     * @dev Create a new ERC721 token
     * @param name Token name
     * @param symbol Token symbol
     * @param baseTokenURI Base URI for token metadata
     * @return address The address of the newly created token
     */
    function createERC721(
        string memory name,
        string memory symbol,
        string memory baseTokenURI
    ) external returns (address) {
        SimpleERC721 token = new SimpleERC721(
            name,
            symbol,
            baseTokenURI,
            msg.sender
        );
        
        address tokenAddress = address(token);
        erc721Tokens.push(tokenAddress);
        creatorToERC721[msg.sender].push(tokenAddress);
        
        emit ERC721Created(tokenAddress, msg.sender, name, symbol);
        return tokenAddress;
    }
    
    /**
     * @dev Create a new ERC1155 token
     * @param uri URI for token metadata
     * @param name Token name
     * @return address The address of the newly created token
     */
    function createERC1155(
        string memory uri,
        string memory name
    ) external returns (address) {
        SimpleERC1155 token = new SimpleERC1155(
            uri,
            name,
            msg.sender
        );
        
        address tokenAddress = address(token);
        erc1155Tokens.push(tokenAddress);
        creatorToERC1155[msg.sender].push(tokenAddress);
        
        emit ERC1155Created(tokenAddress, msg.sender, name);
        return tokenAddress;
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