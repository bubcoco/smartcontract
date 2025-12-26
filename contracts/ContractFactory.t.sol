// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import "forge-std/Test.sol";
// import "../contracts/ContractFactory.sol";

// contract ContractFactoryTest is Test {
//     ContractFactory public factory;
//     address public owner;
//     address public user1;
//     address public user2;

//     event ERC20Created(address indexed tokenAddress, address indexed owner, string name, string symbol);
//     event ERC721Created(address indexed tokenAddress, address indexed owner, string name, string symbol);
//     event ERC1155Created(address indexed tokenAddress, address indexed owner, string name);

//     function setUp() public {
//         owner = address(this);
//         user1 = makeAddr("user1");
//         user2 = makeAddr("user2");
        
//         factory = new ContractFactory();
//     }

//     // ============ ERC20 Tests ============

//     function testCreateERC20() public {
//         vm.prank(user1);
//         address tokenAddress = factory.createERC20(
//             "Test Token",
//             "TEST",
//             18,
//             1000000 * 10**18
//         );

//         assertTrue(tokenAddress != address(0), "Token address should not be zero");
        
//         SimpleERC20 token = SimpleERC20(tokenAddress);
//         assertEq(token.name(), "Test Token");
//         assertEq(token.symbol(), "TEST");
//         assertEq(token.decimals(), 18);
//         assertEq(token.balanceOf(user1), 1000000 * 10**18);
//         assertEq(token.owner(), user1);
//     }

//     function testCreateERC20EmitsEvent() public {
//         vm.expectEmit(false, true, false, true);
//         emit ERC20Created(address(0), user1, "Test Token", "TEST");
        
//         vm.prank(user1);
//         factory.createERC20("Test Token", "TEST", 18, 1000000 * 10**18);
//     }

//     function testERC20Minting() public {
//         vm.startPrank(user1);
//         address tokenAddress = factory.createERC20("Test Token", "TEST", 18, 1000 * 10**18);
//         SimpleERC20 token = SimpleERC20(tokenAddress);
        
//         token.mint(user2, 500 * 10**18);
//         assertEq(token.balanceOf(user2), 500 * 10**18);
//         vm.stopPrank();
//     }

//     function testERC20MintingOnlyOwner() public {
//         vm.prank(user1);
//         address tokenAddress = factory.createERC20("Test Token", "TEST", 18, 1000 * 10**18);
//         SimpleERC20 token = SimpleERC20(tokenAddress);
        
//         vm.prank(user2);
//         vm.expectRevert();
//         token.mint(user2, 500 * 10**18);
//     }

//     function testMultipleERC20Creation() public {
//         vm.startPrank(user1);
//         factory.createERC20("Token1", "TK1", 18, 1000 * 10**18);
//         factory.createERC20("Token2", "TK2", 6, 2000 * 10**6);
//         vm.stopPrank();

//         assertEq(factory.getERC20Count(), 2);
        
//         address[] memory user1Tokens = factory.getCreatorERC20Tokens(user1);
//         assertEq(user1Tokens.length, 2);
//     }

//     // ============ ERC721 Tests ============

//     function testCreateERC721() public {
//         vm.prank(user1);
//         address tokenAddress = factory.createERC721(
//             "Test NFT",
//             "TNFT",
//             "https://api.example.com/metadata/"
//         );

//         assertTrue(tokenAddress != address(0), "Token address should not be zero");
        
//         SimpleERC721 token = SimpleERC721(tokenAddress);
//         assertEq(token.name(), "Test NFT");
//         assertEq(token.symbol(), "TNFT");
//         assertEq(token.owner(), user1);
//     }

//     function testCreateERC721EmitsEvent() public {
//         vm.expectEmit(false, true, false, true);
//         emit ERC721Created(address(0), user1, "Test NFT", "TNFT");
        
//         vm.prank(user1);
//         factory.createERC721("Test NFT", "TNFT", "https://api.example.com/");
//     }

//     function testERC721Minting() public {
//         vm.startPrank(user1);
//         address tokenAddress = factory.createERC721("Test NFT", "TNFT", "https://api.example.com/");
//         SimpleERC721 token = SimpleERC721(tokenAddress);
        
//         uint256 tokenId1 = token.mint(user1);
//         assertEq(tokenId1, 0);
//         assertEq(token.ownerOf(tokenId1), user1);
        
//         uint256 tokenId2 = token.mint(user2);
//         assertEq(tokenId2, 1);
//         assertEq(token.ownerOf(tokenId2), user2);
//         vm.stopPrank();
//     }

//     function testERC721MintingOnlyOwner() public {
//         vm.prank(user1);
//         address tokenAddress = factory.createERC721("Test NFT", "TNFT", "https://api.example.com/");
//         SimpleERC721 token = SimpleERC721(tokenAddress);
        
//         vm.prank(user2);
//         vm.expectRevert();
//         token.mint(user2);
//     }

//     function testERC721SetBaseURI() public {
//         vm.startPrank(user1);
//         address tokenAddress = factory.createERC721("Test NFT", "TNFT", "https://api.example.com/");
//         SimpleERC721 token = SimpleERC721(tokenAddress);
        
//         token.mint(user1);
//         token.setBaseURI("https://newapi.example.com/");
//         vm.stopPrank();
        
//         // Base URI change should affect token URI
//         string memory uri = token.tokenURI(0);
//         assertTrue(bytes(uri).length > 0);
//     }

//     function testMultipleERC721Creation() public {
//         vm.startPrank(user1);
//         factory.createERC721("NFT1", "N1", "https://api1.example.com/");
//         factory.createERC721("NFT2", "N2", "https://api2.example.com/");
//         vm.stopPrank();

//         assertEq(factory.getERC721Count(), 2);
        
//         address[] memory user1Tokens = factory.getCreatorERC721Tokens(user1);
//         assertEq(user1Tokens.length, 2);
//     }

//     // ============ ERC1155 Tests ============

//     function testCreateERC1155() public {
//         vm.prank(user1);
//         address tokenAddress = factory.createERC1155(
//             "https://api.example.com/{id}.json",
//             "Test Collection"
//         );

//         assertTrue(tokenAddress != address(0), "Token address should not be zero");
        
//         SimpleERC1155 token = SimpleERC1155(tokenAddress);
//         assertEq(token.name(), "Test Collection");
//         assertEq(token.owner(), user1);
//     }

//     function testCreateERC1155EmitsEvent() public {
//         vm.expectEmit(false, true, false, true);
//         emit ERC1155Created(address(0), user1, "Test Collection");
        
//         vm.prank(user1);
//         factory.createERC1155("https://api.example.com/{id}.json", "Test Collection");
//     }

//     function testERC1155Minting() public {
//         vm.startPrank(user1);
//         address tokenAddress = factory.createERC1155("https://api.example.com/{id}.json", "Test Collection");
//         SimpleERC1155 token = SimpleERC1155(tokenAddress);
        
//         token.mint(user2, 1, 100, "");
//         assertEq(token.balanceOf(user2, 1), 100);
        
//         token.mint(user2, 2, 50, "");
//         assertEq(token.balanceOf(user2, 2), 50);
//         vm.stopPrank();
//     }

//     function testERC1155BatchMinting() public {
//         vm.startPrank(user1);
//         address tokenAddress = factory.createERC1155("https://api.example.com/{id}.json", "Test Collection");
//         SimpleERC1155 token = SimpleERC1155(tokenAddress);
        
//         uint256[] memory ids = new uint256[](3);
//         ids[0] = 1;
//         ids[1] = 2;
//         ids[2] = 3;
        
//         uint256[] memory amounts = new uint256[](3);
//         amounts[0] = 100;
//         amounts[1] = 200;
//         amounts[2] = 300;
        
//         token.mintBatch(user2, ids, amounts, "");
        
//         assertEq(token.balanceOf(user2, 1), 100);
//         assertEq(token.balanceOf(user2, 2), 200);
//         assertEq(token.balanceOf(user2, 3), 300);
//         vm.stopPrank();
//     }

//     function testERC1155MintingOnlyOwner() public {
//         vm.prank(user1);
//         address tokenAddress = factory.createERC1155("https://api.example.com/{id}.json", "Test Collection");
//         SimpleERC1155 token = SimpleERC1155(tokenAddress);
        
//         vm.prank(user2);
//         vm.expectRevert();
//         token.mint(user2, 1, 100, "");
//     }

//     function testERC1155SetURI() public {
//         vm.startPrank(user1);
//         address tokenAddress = factory.createERC1155("https://api.example.com/{id}.json", "Test Collection");
//         SimpleERC1155 token = SimpleERC1155(tokenAddress);
        
//         token.setURI("https://newapi.example.com/{id}.json");
//         vm.stopPrank();
        
//         string memory uri = token.uri(1);
//         assertEq(uri, "https://newapi.example.com/{id}.json");
//     }

//     function testMultipleERC1155Creation() public {
//         vm.startPrank(user1);
//         factory.createERC1155("https://api1.example.com/{id}.json", "Collection1");
//         factory.createERC1155("https://api2.example.com/{id}.json", "Collection2");
//         vm.stopPrank();

//         assertEq(factory.getERC1155Count(), 2);
        
//         address[] memory user1Tokens = factory.getCreatorERC1155Tokens(user1);
//         assertEq(user1Tokens.length, 2);
//     }

//     // ============ Factory General Tests ============

//     function testFactoryOwnership() public {
//         assertEq(factory.owner(), owner);
//     }

//     function testMultipleUsersCreation() public {
//         vm.prank(user1);
//         factory.createERC20("User1 Token", "U1T", 18, 1000 * 10**18);
        
//         vm.prank(user2);
//         factory.createERC20("User2 Token", "U2T", 18, 2000 * 10**18);

//         address[] memory user1Tokens = factory.getCreatorERC20Tokens(user1);
//         address[] memory user2Tokens = factory.getCreatorERC20Tokens(user2);
        
//         assertEq(user1Tokens.length, 1);
//         assertEq(user2Tokens.length, 1);
//         assertEq(factory.getERC20Count(), 2);
//     }

//     function testMixedTokenCreation() public {
//         vm.startPrank(user1);
//         factory.createERC20("Token", "TK", 18, 1000 * 10**18);
//         factory.createERC721("NFT", "NFT", "https://api.example.com/");
//         factory.createERC1155("https://api.example.com/{id}.json", "Collection");
//         vm.stopPrank();

//         assertEq(factory.getERC20Count(), 1);
//         assertEq(factory.getERC721Count(), 1);
//         assertEq(factory.getERC1155Count(), 1);
        
//         assertEq(factory.getCreatorERC20Tokens(user1).length, 1);
//         assertEq(factory.getCreatorERC721Tokens(user1).length, 1);
//         assertEq(factory.getCreatorERC1155Tokens(user1).length, 1);
//     }

//     function testFuzzCreateERC20(
//         string memory name,
//         string memory symbol,
//         uint8 decimals,
//         uint256 initialSupply
//     ) public {
//         vm.assume(decimals <= 77); // Reasonable decimal limit
//         vm.assume(initialSupply <= type(uint256).max / 2); // Avoid overflow
//         vm.assume(bytes(name).length > 0 && bytes(name).length < 100);
//         vm.assume(bytes(symbol).length > 0 && bytes(symbol).length < 20);
        
//         vm.prank(user1);
//         address tokenAddress = factory.createERC20(name, symbol, decimals, initialSupply);
        
//         assertTrue(tokenAddress != address(0));
//         SimpleERC20 token = SimpleERC20(tokenAddress);
//         assertEq(token.balanceOf(user1), initialSupply);
//     }
// }