// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import "../contracts/NFT.sol";
import "@openzeppelin/contracts-v48/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract NFTTest is Test {
    NFT public nft;
    MockERC20 public currency;
    
    address public owner;
    address public worker;
    address public user;
    
    uint96 public constant ROYALTY_FEES = 500; // 5%
    uint256 public constant SUB_ID = 1;
    string public constant BASE_URI = "ipfs://test/";
    
    event Mint(address to, uint256 quantity, uint256 totalpay, uint256[] mintIds);
    
    function setUp() public {
        owner = address(this);
        worker = makeAddr("worker");
        user = makeAddr("user");
        
        // Deploy mock currency
        currency = new MockERC20();
        
        // Deploy NFT contract
        nft = new NFT(
            address(currency),
            BASE_URI,
            ROYALTY_FEES,
            SUB_ID
        );
        
        // Grant worker role
        nft.grantRole(nft.WORKER_ROLE(), worker);
        
        // Mint tokens to user
        currency.mint(user, 100000 * 10**18);
    }
    
    function testConstructor() public {
        assertEq(address(nft.currency()), address(currency));
        assertEq(nft._SubId(), SUB_ID);
        assertEq(nft.owner(), owner);
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), owner));
    }
    
    function testMint() public {
        uint256 quantity = 3;
        uint256 totalPay = 1000 * 10**18;
        
        // Approve currency
        vm.startPrank(user);
        currency.approve(address(nft), totalPay);
        vm.stopPrank();
        
        // Mint as worker
        vm.startPrank(worker);
        uint256[] memory mintIds = nft.mint(user, quantity, totalPay);
        vm.stopPrank();
        
        // Check minted tokens
        assertEq(mintIds.length, quantity);
        for (uint256 i = 0; i < quantity; i++) {
            assertEq(nft.ownerOf(mintIds[i]), user);
        }
    }
    
    function testMintEmitsEvent() public {
        uint256 quantity = 2;
        uint256 totalPay = 500 * 10**18;
        
        vm.startPrank(user);
        currency.approve(address(nft), totalPay);
        vm.stopPrank();
        
        vm.startPrank(worker);
        vm.expectEmit(true, false, false, false);
        emit Mint(user, quantity, totalPay, new uint256[](0));
        nft.mint(user, quantity, totalPay);
        vm.stopPrank();
    }
    
    function testMintRevertsWhenPaused() public {
        nft.pause();
        
        vm.startPrank(worker);
        vm.expectRevert("Pausable: paused");
        nft.mint(user, 1, 100 * 10**18);
        vm.stopPrank();
    }
    
    function testMintRevertsWithoutWorkerRole() public {
        vm.startPrank(user);
        vm.expectRevert();
        nft.mint(user, 1, 100 * 10**18);
        vm.stopPrank();
    }
    
    function testMintRevertsWithZeroQuantity() public {
        vm.startPrank(worker);
        vm.expectRevert();
        nft.mint(user, 0, 0);
        vm.stopPrank();
    }
    
    function testReserve() public {
        vm.startPrank(worker);
        nft.reserve();
        vm.stopPrank();
        
        // Worker should own 5 tokens (indices 0-4)
        for (uint256 i = 0; i < 5; i++) {
            assertEq(nft.ownerOf(i), worker);
        }
    }
    
    function testReserveRevertsWithoutWorkerRole() public {
        vm.startPrank(user);
        vm.expectRevert();
        nft.reserve();
        vm.stopPrank();
    }
    
    function testSetRoyaltyInfo() public {
        address newReceiver = makeAddr("royaltyReceiver");
        uint96 newFees = 1000; // 10%
        
        nft.setRoyaltyInfo(newReceiver, newFees);
        
        (address receiver, uint256 royaltyAmount) = nft.royaltyInfo(1, 10000);
        assertEq(receiver, newReceiver);
        assertEq(royaltyAmount, 1000); // 10% of 10000
    }
    
    function testSetRoyaltyInfoRevertsNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        nft.setRoyaltyInfo(user, 1000);
        vm.stopPrank();
    }
    
    function testSetBaseURI() public {
        string memory newURI = "ipfs://newuri/";
        nft.setBaseURI(newURI);
        // Note: Would need to check tokenURI after minting to verify
    }
    
    function testSetBaseURIRevertsNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        nft.setBaseURI("ipfs://test/");
        vm.stopPrank();
    }
    
    function testSetSubId() public {
        uint256 newSubId = 999;
        nft.setSubId(newSubId);
        assertEq(nft._SubId(), newSubId);
    }
    
    function testSetSubIdRevertsNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        nft.setSubId(999);
        vm.stopPrank();
    }
    
    function testBurn() public {
        // Mint a token first
        vm.startPrank(user);
        currency.approve(address(nft), 1000 * 10**18);
        vm.stopPrank();
        
        vm.startPrank(worker);
        uint256[] memory mintIds = nft.mint(user, 1, 1000 * 10**18);
        vm.stopPrank();
        
        uint256 tokenId = mintIds[0];
        
        // Burn the token
        vm.startPrank(user);
        nft.burn(tokenId);
        vm.stopPrank();
        
        // Check token no longer exists
        vm.expectRevert("ERC721: invalid token ID");
        nft.ownerOf(tokenId);
    }
    
    function testBurnRevertsNonOwner() public {
        vm.startPrank(user);
        currency.approve(address(nft), 1000 * 10**18);
        vm.stopPrank();
        
        vm.startPrank(worker);
        uint256[] memory mintIds = nft.mint(user, 1, 1000 * 10**18);
        vm.stopPrank();
        
        uint256 tokenId = mintIds[0];
        
        vm.startPrank(makeAddr("attacker"));
        vm.expectRevert("ERC721: caller is not token owner or approved");
        nft.burn(tokenId);
        vm.stopPrank();
    }
    
    function testMultiGrandRole() public {
        address[] memory workers = new address[](3);
        workers[0] = makeAddr("worker1");
        workers[1] = makeAddr("worker2");
        workers[2] = makeAddr("worker3");
        
        nft.multiGrandRole(nft.WORKER_ROLE(), workers);
        
        for (uint256 i = 0; i < workers.length; i++) {
            assertTrue(nft.hasRole(nft.WORKER_ROLE(), workers[i]));
        }
    }
    
    function testWithdraw() public {
        uint256 amount = 1000 * 10**18;
        
        // Send tokens to contract
        vm.startPrank(user);
        currency.approve(address(nft), amount);
        vm.stopPrank();
        
        vm.startPrank(worker);
        nft.mint(user, 1, amount);
        vm.stopPrank();
        
        uint256 contractBalance = currency.balanceOf(address(nft));
        uint256 ownerBalanceBefore = currency.balanceOf(owner);
        
        // Withdraw
        nft.withdraw();
        
        assertEq(currency.balanceOf(address(nft)), 0);
        assertEq(currency.balanceOf(owner), ownerBalanceBefore + contractBalance);
    }
    
    function testWithdrawRevertsNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        nft.withdraw();
        vm.stopPrank();
    }
    
    function testPauseAndUnpause() public {
        nft.pause();
        assertTrue(nft.paused());
        
        nft.unpause();
        assertFalse(nft.paused());
    }
    
    function testPauseRevertsNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        nft.pause();
        vm.stopPrank();
    }
    
    function testUnpauseRevertsNonOwner() public {
        nft.pause();
        
        vm.startPrank(user);
        vm.expectRevert("Ownable: caller is not the owner");
        nft.unpause();
        vm.stopPrank();
    }
    
    function testReceiveRevertsEther() public {
        vm.expectRevert();
        (bool success,) = address(nft).call{value: 1 ether}("");
        assertFalse(success);
    }
    
    function testFallbackRevertsEther() public {
        vm.expectRevert();
        (bool success,) = address(nft).call{value: 1 ether}("0x1234");
        assertFalse(success);
    }
    
    function testSupportsInterface() public {
        // ERC721
        assertTrue(nft.supportsInterface(0x80ac58cd));
        // ERC2981 (Royalty)
        assertTrue(nft.supportsInterface(0x2a55205a));
        // AccessControl
        assertTrue(nft.supportsInterface(0x7965db0b));
    }
}