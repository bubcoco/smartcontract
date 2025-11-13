// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./utils/ERC721r.sol";
import "@openzeppelin/contracts-v48/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v48/security/Pausable.sol";
import "@openzeppelin/contracts-v48/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v48/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v48/utils/Counters.sol";
import "@openzeppelin/contracts-v48/access/AccessControl.sol";
import "@openzeppelin/contracts-v48/access/Ownable.sol";
import "@openzeppelin/contracts-v48/token/common/ERC2981.sol";

contract NFT is 
    ERC721r,
    ReentrancyGuard,
    Pausable,
    AccessControl,
    Ownable,
    ERC2981
{
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;
    using Strings for uint256;
    //uint256 public maxMintAmount = 5;
    Counters.Counter currentSupply;
    uint256 subId;
    string private baseTokenURI;
    IERC20 public currency;
    uint256 public _maxSupplies = 10000;
    string private baseURI1;
    string private baseURI2;
    string private baseURI3;

    Counters.Counter private tokenIds;

    bytes32 public constant WORKER_ROLE = keccak256("WORKER_ROLE");

    event Mint(address to, uint256 quantity, uint256 totalpay, uint256[] mintIds);

    constructor (
        address _currency,
        // string memory _baseURI1,
        // string memory _baseURI2,
        // string memory _baseURI3,
        string memory _baseTokenURI,
        uint96 _royaltyFeesInBips,
        uint256 _subId
    ) ERC721r("NFT", "NFT", 10000, _subId) {
        currency = IERC20(_currency);
        baseTokenURI = _baseTokenURI;
        // baseURI1 = _baseURI1;
        // baseURI2 = _baseURI2;
        // baseURI3 = _baseURI3;
        setRoyaltyInfo(owner(), _royaltyFeesInBips);
        subId = _subId;
        
        // for (uint256 i; i < _maxSupplies; i++) {
        //     TokenInfo storage token = tokenInfos[i + 1];
        //     token.maxSupply = _maxSupplies;
        //     token.price = _prices;
        // }
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
    }

    function mint(address to,uint256 quantity, uint256 totalpay) public nonReentrant whenNotPaused onlyRole(WORKER_ROLE) returns(uint256[] memory){
        // TokenInfo storage token = tokenInfos[quantity];

        uint256 supply = currentSupply.current();
        uint256[] memory mintIds = new uint256[](quantity);
        assert(mintIds.length == quantity);
        
        require(quantity > 0);
        require(supply <= _maxSupplies, "NFT.sol: Max limit.");

        // uint256 id = tokenIds.current();

        currency.safeTransferFrom(to, address(this), totalpay);
        mintIds = _mintRandom(to, quantity );

        emit Mint(to, quantity, totalpay, mintIds);
        return mintIds;
    }
    

    function reserve() external onlyRole(WORKER_ROLE) {
        for (uint i = 5; i > 0; i--) {
            _mintAtIndex(msg.sender, i - 1);
        }
    }

    function setRoyaltyInfo(address _receiver, uint96 _royaltyFeesInBips) public onlyOwner {
        _setDefaultRoyalty(_receiver, _royaltyFeesInBips);
    }


    function setBaseURI(string memory _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    // function _baseURI() internal view virtual override returns (string memory) {
    //     return baseTokenURI;
    // }

    function setSubId(uint256 _subId) external onlyOwner {
        subId = _subId;
    }

    function _SubId() public view returns (uint256) {
        return subId;
    }

    // function setBaseURIs(string memory _baseURI1, string memory _baseURI2, string memory _baseURI3) external onlyOwner {
    //     baseURI1 = _baseURI1;
    //     baseURI2 = _baseURI2;
    //     baseURI3 = _baseURI3;
    // }



    // function _baseURIs() internal view virtual returns (string memory) {
    //     return (baseURI1, baseURI2, baseURI3);
    // }

    // function _baseURI1() internal view virtual override returns (string memory) {
    //     return baseURI1;
    // }
    // function _baseURI2() internal view virtual override returns (string memory) {
    //     return baseURI2;
    // }
    // function _baseURI3() internal view virtual override returns (string memory) {
    //     return baseURI3;
    // }

    // function _BaseURIs() public view returns (uint256) {
    //     return BaseURIs;
    // }

    function burn(uint256 tokenId) public virtual {
        //solhint-disable-next-line max-line-length
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: caller is not token owner or approved");
        _burn(tokenId);
    }

    // function _burn(uint256 _tokenId)
    //     internal
    //     virtual
    //     override(ERC721r)
    // {
    //     super._burn(_tokenId);
    // }

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC721r, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(_interfaceId);
    }

    function multiGrandRole(bytes32 _role,address [] memory _workerAddress) external {
        uint256 _length = _workerAddress.length;
           for (uint256 i = 0; i < _length; i++){
                grantRole(_role, _workerAddress[i]);
           }
    }

    function withdraw() external onlyOwner {
        uint256 balance = currency.balanceOf(address(this));

        require(balance > 0);
        currency.safeTransfer(owner(), balance);
    }

    function setCoordinator(address _vrfCoordinator) external onlyOwner {
        _setCoordinator(_vrfCoordinator);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {
        revert();
    }

    fallback() external payable {
        revert();
    }

}