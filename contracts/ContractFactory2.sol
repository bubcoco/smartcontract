// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Custom Errors (Saves gas compared to require strings)
error ArrayLengthMismatch();
error InvalidAmount();

/**
 * @title SimpleERC20
 * @dev Basic ERC20 token with minting capability
 */
contract SimpleERC20 is ERC20, Ownable {
    // Optimization: immutable variables are embedded in bytecode, avoiding storage reads
    uint8 private immutable _decimals;
    
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply,
        address owner
    ) ERC20(name, symbol) Ownable(owner) {
        _decimals = decimals_;
        if (initialSupply > 0) {
            _mint(owner, initialSupply);
        }
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
        
        if (initialMintAmount > 0) {
            // Optimization: Cache storage variable to stack
            uint256 currentId = _tokenIdCounter;
            
            for (uint256 i = 0; i < initialMintAmount;) {
                _safeMint(owner, currentId);
                unchecked { 
                    ++currentId; 
                    ++i; 
                }
            }
            // Update storage once
            _tokenIdCounter = currentId;
        }
    }
    
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }
    
    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        // Optimization: Unchecked increment
        unchecked {
            _tokenIdCounter++;
        }
        _safeMint(to, tokenId);
        return tokenId;
    }
    
    function mintBatch(address to, uint256 amount) external onlyOwner returns (uint256[] memory) {
        uint256[] memory tokenIds = new uint256[](amount);
        // Optimization: Cache storage variable
        uint256 currentId = _tokenIdCounter;
        
        for (uint256 i = 0; i < amount;) {
            tokenIds[i] = currentId;
            _safeMint(to, currentId);
            unchecked {
                ++currentId;
                ++i;
            }
        }
        
        // Update storage once at the end
        _tokenIdCounter = currentId;
        
        return tokenIds;
    }
    
    // Optimization: Use calldata for string arguments in external functions
    function setBaseURI(string calldata baseTokenURI) external onlyOwner {
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
    
    mapping(uint256 => uint256) private _totalSupply;
    
    constructor(
        string memory uri,
        string memory name_,
        address owner,
        uint256[] memory initialTokenIds,
        uint256[] memory initialAmounts
    ) ERC1155(uri) Ownable(owner) {
        name = name_;
        
        if (initialTokenIds.length != initialAmounts.length) revert ArrayLengthMismatch();
        
        uint256 len = initialTokenIds.length;
        if (len > 0) {
            _mintBatch(owner, initialTokenIds, initialAmounts, "");
            
            // Optimization: Cache storage variable
            uint256 maxId = _currentTokenId;

            for (uint256 i = 0; i < len;) {
                uint256 id = initialTokenIds[i];
                _totalSupply[id] += initialAmounts[i];
                
                if (id >= maxId) {
                    maxId = id + 1;
                }
                unchecked { ++i; }
            }
            _currentTokenId = maxId;
        }
    }
    
    // Optimization: Use calldata for data bytes
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external onlyOwner {
        _mint(to, id, amount, data);
        _totalSupply[id] += amount;
        
        if (id >= _currentTokenId) {
            _currentTokenId = id + 1;
        }
    }
    
    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external onlyOwner {
        _mintBatch(to, ids, amounts, data);
        
        uint256 maxId = _currentTokenId;
        uint256 len = ids.length;

        for (uint256 i = 0; i < len;) {
            uint256 id = ids[i];
            _totalSupply[id] += amounts[i];
            if (id >= maxId) {
                maxId = id + 1;
            }
            unchecked { ++i; }
        }
        _currentTokenId = maxId;
    }
    
    function mintNew(
        address to,
        uint256 amount,
        bytes calldata data
    ) external onlyOwner returns (uint256) {
        uint256 newTokenId = _currentTokenId;
        unchecked {
            _currentTokenId++;
        }
        
        _mint(to, newTokenId, amount, data);
        _totalSupply[newTokenId] = amount;
        
        return newTokenId;
    }
    
    function setURI(string calldata newuri) external onlyOwner {
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
    
    // Events are the cheapest way to track deployments (Off-chain indexing)
    event ERC20Created(address indexed tokenAddress, string name, string symbol, uint256 initialSupply, address indexed owner);
    event ERC721Created(address indexed tokenAddress, string name, string symbol, string baseTokenURI, address indexed owner, uint256 initialMintAmount);
    event ERC1155Created(address indexed tokenAddress, address indexed owner, string name, uint256 initialTokensCount);
    
    // Optimization: Removed global arrays (erc20Tokens, etc.). 
    // Storing all tokens ever created is extremely expensive and scales poorly.
    // If specific tracking is needed, rely on Subgraphs/Indexers listening to Events.
    
    // Mappings to track contracts by creator are kept but usage should be minimal
    mapping(address => address[]) public creatorToERC20;
    mapping(address => address[]) public creatorToERC721;
    mapping(address => address[]) public creatorToERC1155;
    
    constructor() Ownable(msg.sender) {}
    
    function createERC20(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 initialSupply,
        address to
    ) external returns (address) {
        SimpleERC20 token = new SimpleERC20(
            name,
            symbol,
            decimals,
            initialSupply,
            to
        );
        
        address tokenAddress = address(token);
        creatorToERC20[to].push(tokenAddress);
        
        emit ERC20Created(tokenAddress, name, symbol, initialSupply, to);
        return tokenAddress;
    }
    
    function createERC721(
        string memory name,
        string memory symbol,
        string memory baseTokenURI,
        address to,
        uint256 initialMintAmount
    ) external returns (address) {
        SimpleERC721 token = new SimpleERC721(
            name,
            symbol,
            baseTokenURI,
            to,
            initialMintAmount
        );
        
        address tokenAddress = address(token);
        creatorToERC721[to].push(tokenAddress);
        
        emit ERC721Created(tokenAddress, name, symbol, baseTokenURI, to, initialMintAmount);
        return tokenAddress;
    }
    
    // Optimization: Use calldata for arrays
    function createERC1155(
        string memory uri,
        string memory name,
        uint256[] calldata initialTokenIds,
        uint256[] calldata initialAmounts,
        address to
    ) external returns (address) {
        if (initialTokenIds.length != initialAmounts.length) revert ArrayLengthMismatch();
        
        // Convert calldata to memory for the constructor
        // (Constructor still needs memory, but we save gas on the factory call itself)
        SimpleERC1155 token = new SimpleERC1155(
            uri,
            name,
            to,
            initialTokenIds,
            initialAmounts
        );
        
        address tokenAddress = address(token);
        creatorToERC1155[to].push(tokenAddress);
        
        emit ERC1155Created(tokenAddress, to, name, initialTokenIds.length);
        return tokenAddress;
    }
    
    function createERC1155Simple(
        string memory uri,
        string memory name,
        uint256 initialTokenId,
        uint256 initialAmount,
        address to
    ) external returns (address) {
        // Create arrays in memory to pass to constructor
        uint256[] memory tokenIds = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        
        tokenIds[0] = initialTokenId;
        amounts[0] = initialAmount;
        
        SimpleERC1155 token = new SimpleERC1155(
            uri,
            name,
            to,
            tokenIds,
            amounts
        );
        
        address tokenAddress = address(token);
        creatorToERC1155[to].push(tokenAddress);

        emit ERC1155Created(tokenAddress, to, name, 1);
        return tokenAddress;
    }
    
    // View functions
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