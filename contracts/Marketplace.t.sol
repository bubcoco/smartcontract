// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import "forge-std/Test.sol";
// import "../contracts/Marketplace.sol";
// import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
// import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// // Mock Tokens for Testing
// contract MockERC20 is ERC20 {
//     constructor(string memory name, string memory symbol) ERC20(name, symbol) {
//         _mint(msg.sender, 1000000 * 10**18);
//     }
    
//     function mint(address to, uint256 amount) external {
//         _mint(to, amount);
//     }
// }

// contract MockERC721 is ERC721 {
//     uint256 private _tokenIdCounter;
    
//     constructor() ERC721("Mock NFT", "MNFT") {}
    
//     function mint(address to) external returns (uint256) {
//         uint256 tokenId = _tokenIdCounter++;
//         _mint(to, tokenId);
//         return tokenId;
//     }
// }

// contract MockERC1155 is ERC1155 {
//     constructor() ERC1155("https://token.uri/{id}") {}
    
//     function mint(address to, uint256 id, uint256 amount) external {
//         _mint(to, id, amount, "");
//     }
// }

// contract MarketplaceTest is Test {
//     Marketplace public marketplace;
//     MockERC20 public usdt;
//     MockERC20 public wmatic;
//     MockERC20 public dai;
//     MockERC721 public nft721;
//     MockERC1155 public nft1155;
    
//     address public owner;
//     address public feeRecipient;
//     address public seller;
//     address public buyer;
//     address public buyer2;
    
//     uint256 public constant PLATFORM_FEE = 250; // 2.5%
//     uint256 public constant BASIS_POINTS = 10000;
    
//     event ItemListed(
//         uint256 indexed listingId,
//         address indexed seller,
//         address indexed nftContract,
//         uint256 tokenId,
//         uint256 amount,
//         uint256 pricePerToken,
//         bool isERC721
//     );
    
//     event ItemSold(
//         uint256 indexed listingId,
//         address indexed buyer,
//         address indexed seller,
//         uint256 amount,
//         uint256 totalPrice
//     );
    
//     function setUp() public {
//         owner = address(this);
//         feeRecipient = makeAddr("feeRecipient");
//         seller = makeAddr("seller");
//         buyer = makeAddr("buyer");
//         buyer2 = makeAddr("buyer2");
        
//         // Deploy marketplace
//         marketplace = new Marketplace(feeRecipient, PLATFORM_FEE);
        
//         // Deploy mock tokens
//         usdt = new MockERC20("USDT", "USDT");
//         wmatic = new MockERC20("Wrapped MATIC", "WMATIC");
//         dai = new MockERC20("DAI", "DAI");
        
//         // Deploy mock NFTs
//         nft721 = new MockERC721();
//         nft1155 = new MockERC1155();
        
//         // Setup payment tokens
//         marketplace.addPaymentToken(address(usdt), "USDT", 1e6);
//         marketplace.addPaymentToken(address(wmatic), "WMATIC", 1e18);
//         marketplace.addPaymentToken(address(dai), "DAI", 1e18);
        
//         // Distribute tokens to buyer
//         usdt.mint(buyer, 100000 * 10**6);
//         wmatic.mint(buyer, 1000 * 10**18);
//         dai.mint(buyer, 100000 * 10**18);
        
//         usdt.mint(buyer2, 100000 * 10**6);
//         wmatic.mint(buyer2, 1000 * 10**18);
        
//         // Mint NFTs to seller
//         vm.startPrank(seller);
//         nft721.mint(seller);
//         nft721.mint(seller);
//         nft1155.mint(seller, 1, 100);
//         nft1155.mint(seller, 2, 50);
//         vm.stopPrank();
//     }
    
//     // ============ Payment Token Tests ============
    
//     function testAddPaymentToken() public {
//         MockERC20 newToken = new MockERC20("New Token", "NEW");
        
//         marketplace.addPaymentToken(address(newToken), "NEW", 1e18);
        
//         (bool isEnabled, uint256 minAmount, string memory symbol) = 
//             marketplace.paymentTokens(address(newToken));
        
//         assertTrue(isEnabled);
//         assertEq(minAmount, 1e18);
//         assertEq(symbol, "NEW");
//     }
    
//     function testCannotAddDuplicatePaymentToken() public {
//         vm.expectRevert("Token already added");
//         marketplace.addPaymentToken(address(usdt), "USDT", 1e6);
//     }
    
//     function testRemovePaymentToken() public {
//         marketplace.removePaymentToken(address(usdt));
        
//         (bool isEnabled,,) = marketplace.paymentTokens(address(usdt));
//         assertFalse(isEnabled);
//     }
    
//     function testGetEnabledPaymentTokens() public {
//         address[] memory tokens = marketplace.getEnabledPaymentTokens();
//         assertEq(tokens.length, 3);
//     }
    
//     // ============ ERC721 Listing Tests ============
    
//     function testListERC721() public {
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
        
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
        
//         (
//             address listingSeller,
//             address nftContract,
//             uint256 tokenId,
//             uint256 amount,
//             uint256 pricePerToken,
//             bool isERC721,
//             bool isActive,
//         ) = marketplace.listings(listingId);
        
//         assertEq(listingSeller, seller);
//         assertEq(nftContract, address(nft721));
//         assertEq(tokenId, 0);
//         assertEq(amount, 1);
//         assertEq(pricePerToken, 1 ether);
//         assertTrue(isERC721);
//         assertTrue(isActive);
        
//         vm.stopPrank();
//     }
    
//     function testCannotListWithoutApproval() public {
//         vm.startPrank(seller);
        
//         vm.expectRevert("Marketplace not approved");
//         marketplace.listERC721(address(nft721), 0, 1 ether);
        
//         vm.stopPrank();
//     }
    
//     function testDelistERC721() public {
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
        
//         marketplace.delist(listingId);
        
//         (,,,,, bool isActive,) = marketplace.listings(listingId);
//         assertFalse(isActive);
        
//         vm.stopPrank();
//     }
    
//     // ============ ERC1155 Listing Tests ============
    
//     function testListERC1155() public {
//         vm.startPrank(seller);
//         nft1155.setApprovalForAll(address(marketplace), true);
        
//         uint256 listingId = marketplace.listERC1155(
//             address(nft1155),
//             1,
//             10,
//             0.1 ether
//         );
        
//         (
//             address listingSeller,
//             address nftContract,
//             uint256 tokenId,
//             uint256 amount,
//             uint256 pricePerToken,
//             bool isERC721,
//             bool isActive,
//         ) = marketplace.listings(listingId);
        
//         assertEq(listingSeller, seller);
//         assertEq(nftContract, address(nft1155));
//         assertEq(tokenId, 1);
//         assertEq(amount, 10);
//         assertEq(pricePerToken, 0.1 ether);
//         assertFalse(isERC721);
//         assertTrue(isActive);
        
//         vm.stopPrank();
//     }
    
//     // ============ Single Token Purchase Tests ============
    
//     function testBuyERC721WithSingleToken() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Buyer purchases with WMATIC
//         vm.startPrank(buyer);
//         wmatic.approve(address(marketplace), 1 ether);
//         marketplace.buyWithSingleToken(listingId, address(wmatic), 1);
//         vm.stopPrank();
        
//         // Verify NFT transferred
//         assertEq(nft721.ownerOf(0), buyer);
        
//         // Verify payments
//         uint256 fee = (1 ether * PLATFORM_FEE) / BASIS_POINTS;
//         uint256 sellerAmount = 1 ether - fee;
        
//         assertEq(wmatic.balanceOf(feeRecipient), fee);
//         assertEq(wmatic.balanceOf(seller), sellerAmount);
//     }
    
//     function testBuyERC1155WithSingleToken() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft1155.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC1155(
//             address(nft1155),
//             1,
//             10,
//             0.1 ether
//         );
//         vm.stopPrank();
        
//         // Buyer purchases 5 tokens with USDT
//         uint256 totalPrice = 5 * 0.1 ether;
        
//         vm.startPrank(buyer);
//         usdt.approve(address(marketplace), totalPrice);
//         marketplace.buyWithSingleToken(listingId, address(usdt), 5);
//         vm.stopPrank();
        
//         // Verify NFT transferred
//         assertEq(nft1155.balanceOf(buyer, 1), 5);
        
//         // Verify listing updated
//         (,,,uint256 remainingAmount,,,) = marketplace.listings(listingId);
//         assertEq(remainingAmount, 5);
//     }
    
//     // ============ Mixed Payment Tests ============
    
//     function testBuyWithMixedPayment() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Buyer purchases with 30% USDT and 70% WMATIC
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](2);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(usdt),
//             percentage: 3000 // 30%
//         });
//         splits[1] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 7000 // 70%
//         });
        
//         uint256 usdtAmount = (1 ether * 3000) / BASIS_POINTS;
//         uint256 wmaticAmount = (1 ether * 7000) / BASIS_POINTS;
        
//         vm.startPrank(buyer);
//         usdt.approve(address(marketplace), usdtAmount);
//         wmatic.approve(address(marketplace), wmaticAmount);
//         marketplace.buyWithMixedPayment(listingId, 1, splits);
//         vm.stopPrank();
        
//         // Verify NFT transferred
//         assertEq(nft721.ownerOf(0), buyer);
        
//         // Verify mixed payments
//         uint256 totalFee = (1 ether * PLATFORM_FEE) / BASIS_POINTS;
//         uint256 usdtFee = (totalFee * 3000) / BASIS_POINTS;
//         uint256 wmaticFee = (totalFee * 7000) / BASIS_POINTS;
        
//         assertEq(usdt.balanceOf(feeRecipient), usdtFee);
//         assertEq(wmatic.balanceOf(feeRecipient), wmaticFee);
//     }
    
//     function testBuyWithThreeTokens() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 1, 10 ether);
//         vm.stopPrank();
        
//         // Buyer purchases with 25% USDT, 50% WMATIC, 25% DAI
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](3);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(usdt),
//             percentage: 2500
//         });
//         splits[1] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 5000
//         });
//         splits[2] = Marketplace.PaymentSplit({
//             token: address(dai),
//             percentage: 2500
//         });
        
//         uint256 usdtAmount = (10 ether * 2500) / BASIS_POINTS;
//         uint256 wmaticAmount = (10 ether * 5000) / BASIS_POINTS;
//         uint256 daiAmount = (10 ether * 2500) / BASIS_POINTS;
        
//         vm.startPrank(buyer);
//         usdt.approve(address(marketplace), usdtAmount);
//         wmatic.approve(address(marketplace), wmaticAmount);
//         dai.approve(address(marketplace), daiAmount);
//         marketplace.buyWithMixedPayment(listingId, 1, splits);
//         vm.stopPrank();
        
//         assertEq(nft721.ownerOf(1), buyer);
//     }
    
//     function testCannotBuyWithInvalidPercentage() public {
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Invalid: percentages don't add up to 100%
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](2);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(usdt),
//             percentage: 3000
//         });
//         splits[1] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 6000 // Total = 90%
//         });
        
//         vm.startPrank(buyer);
//         vm.expectRevert(Marketplace.InvalidPercentage.selector);
//         marketplace.buyWithMixedPayment(listingId, 1, splits);
//         vm.stopPrank();
//     }
    
//     function testCannotBuyWithDisabledToken() public {
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Disable USDT
//         marketplace.removePaymentToken(address(usdt));
        
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](1);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(usdt),
//             percentage: 10000
//         });
        
//         vm.startPrank(buyer);
//         vm.expectRevert(Marketplace.InvalidPaymentToken.selector);
//         marketplace.buyWithMixedPayment(listingId, 1, splits);
//         vm.stopPrank();
//     }
    
//     // ============ Offer System Tests ============
    
//     function testCreateOffer() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Buyer creates offer
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](2);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(usdt),
//             percentage: 4000
//         });
//         splits[1] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 6000
//         });
        
//         uint256 usdtAmount = (1 ether * 4000) / BASIS_POINTS;
//         uint256 wmaticAmount = (1 ether * 6000) / BASIS_POINTS;
        
//         vm.startPrank(buyer);
//         usdt.approve(address(marketplace), usdtAmount);
//         wmatic.approve(address(marketplace), wmaticAmount);
        
//         uint256 offerId = marketplace.createOffer(
//             listingId,
//             1,
//             splits,
//             7 days
//         );
        
//         (
//             address offerBuyer,
//             uint256 offerListingId,
//             ,
//             uint256 totalAmount,
//             uint256 expiresAt,
//             bool isActive
//         ) = marketplace.offers(offerId);
        
//         assertEq(offerBuyer, buyer);
//         assertEq(offerListingId, listingId);
//         assertEq(totalAmount, 1 ether);
//         assertEq(expiresAt, block.timestamp + 7 days);
//         assertTrue(isActive);
        
//         vm.stopPrank();
//     }
    
//     function testAcceptOffer() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Buyer creates offer
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](1);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 10000
//         });
        
//         vm.startPrank(buyer);
//         wmatic.approve(address(marketplace), 1 ether);
//         uint256 offerId = marketplace.createOffer(listingId, 1, splits, 7 days);
//         vm.stopPrank();
        
//         // Seller accepts offer
//         vm.prank(seller);
//         marketplace.acceptOffer(offerId);
        
//         // Verify NFT transferred
//         assertEq(nft721.ownerOf(0), buyer);
        
//         // Verify payment distributed
//         uint256 fee = (1 ether * PLATFORM_FEE) / BASIS_POINTS;
//         uint256 sellerAmount = 1 ether - fee;
        
//         assertEq(wmatic.balanceOf(seller), sellerAmount);
//         assertEq(wmatic.balanceOf(feeRecipient), fee);
//     }
    
//     function testCancelOffer() public {
//         // Seller lists NFT
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         // Buyer creates offer
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](1);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 10000
//         });
        
//         vm.startPrank(buyer);
//         wmatic.approve(address(marketplace), 1 ether);
//         uint256 offerId = marketplace.createOffer(listingId, 1, splits, 7 days);
        
//         uint256 balanceBefore = wmatic.balanceOf(buyer);
        
//         // Cancel offer
//         marketplace.cancelOffer(offerId);
        
//         // Verify tokens returned
//         assertEq(wmatic.balanceOf(buyer), balanceBefore + 1 ether);
        
//         (,,,,, bool isActive) = marketplace.offers(offerId);
//         assertFalse(isActive);
        
//         vm.stopPrank();
//     }
    
//     // ============ Admin Tests ============
    
//     function testSetPlatformFee() public {
//         marketplace.setPlatformFee(500); // 5%
//         assertEq(marketplace.platformFee(), 500);
//     }
    
//     function testCannotSetFeeTooHigh() public {
//         vm.expectRevert("Fee too high");
//         marketplace.setPlatformFee(1001); // > 10%
//     }
    
//     function testSetFeeRecipient() public {
//         address newRecipient = makeAddr("newRecipient");
//         marketplace.setFeeRecipient(newRecipient);
//         assertEq(marketplace.feeRecipient(), newRecipient);
//     }
    
//     function testPauseUnpause() public {
//         marketplace.pause();
        
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         vm.expectRevert();
//         marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         marketplace.unpause();
        
//         vm.startPrank(seller);
//         marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
//     }
    
//     // ============ View Function Tests ============
    
//     function testGetListingsBySeller() public {
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
        
//         marketplace.listERC721(address(nft721), 0, 1 ether);
//         marketplace.listERC721(address(nft721), 1, 2 ether);
        
//         uint256[] memory listings = marketplace.getListingsByseller(
//             seller,
//             address(nft721)
//         );
        
//         assertEq(listings.length, 2);
//         vm.stopPrank();
//     }
    
//     function testGetOffersByBuyer() public {
//         vm.startPrank(seller);
//         nft721.setApprovalForAll(address(marketplace), true);
//         uint256 listingId = marketplace.listERC721(address(nft721), 0, 1 ether);
//         vm.stopPrank();
        
//         Marketplace.PaymentSplit[] memory splits = new Marketplace.PaymentSplit[](1);
//         splits[0] = Marketplace.PaymentSplit({
//             token: address(wmatic),
//             percentage: 10000
//         });
        
//         vm.startPrank(buyer);
//         wmatic.approve(address(marketplace), 1 ether);
//         marketplace.createOffer(listingId, 1, splits, 7 days);
        
//         uint256[] memory offers = marketplace.getOffersByBuyer(buyer);
//         assertEq(offers.length, 1);
//         vm.stopPrank();
//     }
// }