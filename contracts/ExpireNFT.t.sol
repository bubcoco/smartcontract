// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ExpireNFT.sol";

contract ExpireNFTTest is Test {
    ExpireNFT public nft;
    
    address public owner = address(this);
    address public user1 = address(0x1);
    address public user2 = address(0x2);
    
    uint256 constant MINT_PRICE = 0.01 ether;
    
    event MintedAtIndex(address indexed to, uint256 indexed tokenId);
    event MintedRandom(address indexed to, uint256 indexed tokenId);
    event MintedReserve(address indexed to, uint256 indexed tokenId);
    event ExpireDateSet(uint256 expireDate);
    event ActivityPeriodSet(uint256 startTime, uint256 endTime);
    event TokenBurned(address indexed owner, uint256 indexed tokenId);
    
    function setUp() public {
        nft = new ExpireNFT("ExpireNFT", "ENFT");
        
        // Fund test accounts
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
    }
    
    // ============ Deployment Tests ============
    
    function test_Deployment() public {
        assertEq(nft.name(), "ExpireNFT");
        assertEq(nft.symbol(), "ENFT");
        assertEq(nft.owner(), owner);
        assertEq(nft.totalMinted(), 0);
        assertEq(nft.MAX_SUPPLY(), 10000);
        assertEq(nft.mintPrice(), 0);
    }
    
    function test_InitialAvailableTokens() public {
        assertEq(nft.checkAvailableNumber(), 10000);
    }
    
    // ============ Mint Price Tests ============
    
    function test_SetMintPrice() public {
        nft.setMintPrice(MINT_PRICE);
        assertEq(nft.mintPrice(), MINT_PRICE);
    }
    
    function test_RevertWhen_NonOwnerSetsMintPrice() public {
        vm.prank(user1);
        vm.expectRevert();
        nft.setMintPrice(MINT_PRICE);
    }
    
    // ============ Base URI Tests ============
    
    function test_SetBaseURI() public {
        nft.setBaseURI("ipfs://test/");
        nft.mintAtIndex(1);
        assertEq(nft.tokenURI(1), "ipfs://test/1.json");
    }
    
    function test_RevertWhen_NonOwnerSetsBaseURI() public {
        vm.prank(user1);
        vm.expectRevert();
        nft.setBaseURI("ipfs://test/");
    }
    
    // ============ mintAtIndex Tests ============
    
    function test_MintAtIndex() public {
        nft.mintAtIndex(5);
        assertEq(nft.ownerOf(5), owner);
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.checkAvailableNumber(), 9999);
    }
    
    function test_MintAtIndex_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit MintedAtIndex(owner, 10);
        nft.mintAtIndex(10);
    }
    
    function test_MintAtIndex_WithPayment() public {
        nft.setMintPrice(MINT_PRICE);
        nft.mintAtIndex{value: MINT_PRICE}(1);
        assertEq(nft.ownerOf(1), owner);
    }
    
    function test_RevertWhen_MintAtIndexInsufficientPayment() public {
        nft.setMintPrice(MINT_PRICE);
        vm.expectRevert("Insufficient payment");
        nft.mintAtIndex(1);
    }
    
    function test_RevertWhen_MintAtIndexAlreadyMinted() public {
        nft.mintAtIndex(1);
        vm.expectRevert("Token already minted");
        nft.mintAtIndex(1);
    }
    
    function test_RevertWhen_MintAtIndexExceedsMaxSupply() public {
        vm.expectRevert("Token ID exceeds max supply");
        nft.mintAtIndex(10000);
    }
    
    function test_MintAtIndex_UpdatesOwnedIds() public {
        vm.startPrank(user1);
        nft.mintAtIndex(1);
        nft.mintAtIndex(2);
        nft.mintAtIndex(3);
        vm.stopPrank();
        
        uint256[] memory owned = nft.ownedIds(user1);
        assertEq(owned.length, 3);
        assertTrue(_contains(owned, 1));
        assertTrue(_contains(owned, 2));
        assertTrue(_contains(owned, 3));
    }
    
    // ============ mintRandom Tests ============
    
    function test_MintRandom() public {
        nft.mintRandom();
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.balanceOf(owner), 1);
    }
    
    function test_MintRandom_EmitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit MintedRandom(owner, 0); // tokenId will vary
        nft.mintRandom();
    }
    
    function test_MintRandom_DifferentTokens() public {
        uint256 token1 = nft.mintRandom();
        uint256 token2 = nft.mintRandom();
        assertTrue(token1 != token2);
    }
    
    function test_MintRandom_WithPayment() public {
        nft.setMintPrice(MINT_PRICE);
        nft.mintRandom{value: MINT_PRICE}();
        assertEq(nft.totalMinted(), 1);
    }
    
    function test_RevertWhen_MintRandomInsufficientPayment() public {
        nft.setMintPrice(MINT_PRICE);
        vm.expectRevert("Insufficient payment");
        nft.mintRandom();
    }
    
    function test_MintRandom_ConsistentGas() public {
        // Measure gas for first mint
        uint256 gasBefore = gasleft();
        nft.mintRandom();
        uint256 gas1 = gasBefore - gasleft();
        
        // Mint 50 more
        for (uint256 i = 0; i < 50; i++) {
            vm.prank(user1);
            nft.mintRandom();
        }
        
        // Measure gas again
        gasBefore = gasleft();
        nft.mintRandom();
        uint256 gas2 = gasBefore - gasleft();
        
        // Gas should be within 25% (accounting for storage changes)
        uint256 gasDiff = gas1 > gas2 ? gas1 - gas2 : gas2 - gas1;
        uint256 gasPercent = (gasDiff * 100) / gas1;
        assertLt(gasPercent, 25);
    }
    
    function test_MintRandom_UpdatesAvailableCount() public {
        uint256 availableBefore = nft.checkAvailableNumber();
        nft.mintRandom();
        uint256 availableAfter = nft.checkAvailableNumber();
        assertEq(availableAfter, availableBefore - 1);
    }
    
    // ============ mintReserve Tests ============
    
    function test_MintReserve() public {
        nft.mintReserve(user1, 100);
        assertEq(nft.ownerOf(100), user1);
    }
    
    function test_MintReserve_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit MintedReserve(user1, 50);
        nft.mintReserve(user1, 50);
    }
    
    function test_RevertWhen_NonOwnerReserveMints() public {
        vm.prank(user1);
        vm.expectRevert();
        nft.mintReserve(user1, 100);
    }
    
    function test_MintReserve_NoPaymentRequired() public {
        nft.setMintPrice(MINT_PRICE);
        nft.mintReserve(user1, 100);
        assertEq(nft.ownerOf(100), user1);
    }
    
    // ============ mintReserveBatch Tests ============
    
    function test_MintReserveBatch() public {
        uint256[] memory tokenIds = new uint256[](5);
        tokenIds[0] = 1;
        tokenIds[1] = 5;
        tokenIds[2] = 10;
        tokenIds[3] = 25;
        tokenIds[4] = 100;
        
        nft.mintReserveBatch(user1, tokenIds);
        
        for (uint256 i = 0; i < tokenIds.length; i++) {
            assertEq(nft.ownerOf(tokenIds[i]), user1);
        }
        assertEq(nft.totalMinted(), 5);
    }
    
    function test_RevertWhen_NonOwnerBatchMints() public {
        uint256[] memory tokenIds = new uint256[](3);
        tokenIds[0] = 1;
        tokenIds[1] = 2;
        tokenIds[2] = 3;
        
        vm.prank(user1);
        vm.expectRevert();
        nft.mintReserveBatch(user1, tokenIds);
    }
    
    // ============ Expiration Tests ============
    
    function test_SetExpireDate() public {
        uint256 futureTime = block.timestamp + 3600;
        nft.setExpireDate(futureTime);
        assertEq(nft.expireDate(), futureTime);
    }
    
    function test_SetExpireDate_EmitsEvent() public {
        uint256 futureTime = block.timestamp + 3600;
        vm.expectEmit(false, false, false, true);
        emit ExpireDateSet(futureTime);
        nft.setExpireDate(futureTime);
    }
    
    function test_RevertWhen_SetExpireDateInPast() public {
        vm.expectRevert("Expiration must be in future");
        nft.setExpireDate(block.timestamp - 1);
    }
    
    function test_RevertWhen_MintingAfterExpiration() public {
        uint256 futureTime = block.timestamp + 3600;
        nft.setExpireDate(futureTime);
        
        // Should work before expiration
        nft.mintAtIndex(1);
        
        // Fast forward past expiration
        vm.warp(futureTime + 1);
        
        // Should fail after expiration
        vm.expectRevert("Minting has expired");
        nft.mintAtIndex(2);
        
        vm.expectRevert("Minting has expired");
        nft.mintRandom();
    }
    
    // ============ Activity Period Tests ============
    
    function test_SetActivityPeriod() public {
        uint256 startTime = block.timestamp + 3600;
        uint256 endTime = startTime + 7200;
        
        nft.setActivityPeriod(startTime, endTime);
        assertEq(nft.activityStart(), startTime);
        assertEq(nft.activityEnd(), endTime);
    }
    
    function test_SetActivityPeriod_EmitsEvent() public {
        uint256 startTime = block.timestamp + 3600;
        uint256 endTime = startTime + 7200;
        
        vm.expectEmit(false, false, false, true);
        emit ActivityPeriodSet(startTime, endTime);
        nft.setActivityPeriod(startTime, endTime);
    }
    
    function test_RevertWhen_ActivityEndBeforeStart() public {
        uint256 startTime = block.timestamp + 3600;
        uint256 endTime = startTime - 1;
        
        vm.expectRevert("End must be after start");
        nft.setActivityPeriod(startTime, endTime);
    }
    
    function test_IsTransferActive() public {
        uint256 startTime = block.timestamp + 3600;
        uint256 endTime = startTime + 7200;
        
        nft.setActivityPeriod(startTime, endTime);
        
        // Before start
        assertFalse(nft.isTransferActive());
        
        // During period
        vm.warp(startTime + 1);
        assertTrue(nft.isTransferActive());
        
        // After end
        vm.warp(endTime + 1);
        assertFalse(nft.isTransferActive());
    }
    
    function test_IsActivityEnded() public {
        uint256 startTime = block.timestamp + 3600;
        uint256 endTime = startTime + 7200;
        
        nft.setActivityPeriod(startTime, endTime);
        
        // Before end
        assertFalse(nft.isActivityEnded());
        
        // After end
        vm.warp(endTime + 1);
        assertTrue(nft.isActivityEnded());
    }
    
    // ============ Transfer Tests ============
    
    function test_Transfer_DuringActivePeriod() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        vm.prank(user1);
        nft.transferFrom(user1, user2, 1);
        
        assertEq(nft.ownerOf(1), user2);
    }
    
    function test_RevertWhen_TransferBeforeActivityStart() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        uint256 futureTime = block.timestamp + 3600;
        nft.setActivityPeriod(futureTime, futureTime + 7200);
        
        vm.prank(user1);
        vm.expectRevert("Transfers not active or frozen");
        nft.transferFrom(user1, user2, 1);
    }
    
    function test_RevertWhen_TransferAfterActivityEnd() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        uint256 endTime = block.timestamp + 3600;
        nft.setActivityPeriod(block.timestamp, endTime);
        
        vm.warp(endTime + 1);
        
        vm.prank(user1);
        vm.expectRevert("Transfers not active or frozen");
        nft.transferFrom(user1, user2, 1);
    }
    
    function test_Transfer_UpdatesOwnedIds() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        vm.prank(user1);
        nft.transferFrom(user1, user2, 1);
        
        uint256[] memory user1Owned = nft.ownedIds(user1);
        uint256[] memory user2Owned = nft.ownedIds(user2);
        
        assertEq(user1Owned.length, 0);
        assertEq(user2Owned.length, 1);
        assertEq(user2Owned[0], 1);
    }
    
    // ============ Burn Tests ============
    
    function test_Burn_ByOwner() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        vm.prank(user1);
        nft.burn(1);
        
        vm.expectRevert();
        nft.ownerOf(1);
        
        assertFalse(nft.tokenExists(1));
    }
    
    function test_Burn_EmitsEvent() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        vm.expectEmit(true, true, false, true);
        emit TokenBurned(user1, 1);
        
        vm.prank(user1);
        nft.burn(1);
    }
    
    function test_RevertWhen_NonOwnerBurnsBeforeActivityEnd() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        vm.prank(user2);
        vm.expectRevert("Not authorized to burn");
        nft.burn(1);
    }
    
    function test_Burn_AnyoneAfterActivityEnd() public {
        vm.prank(user1);
        nft.mintAtIndex(1);
        
        uint256 endTime = block.timestamp + 3600;
        nft.setActivityPeriod(block.timestamp, endTime);
        
        vm.warp(endTime + 1);
        
        vm.prank(user2);
        nft.burn(1);
        
        vm.expectRevert();
        nft.ownerOf(1);
    }
    
    function test_Burn_UpdatesOwnedIds() public {
        vm.startPrank(user1);
        nft.mintAtIndex(1);
        nft.mintAtIndex(2);
        nft.mintAtIndex(3);
        vm.stopPrank();
        
        uint256[] memory ownedBefore = nft.ownedIds(user1);
        assertEq(ownedBefore.length, 3);
        
        vm.prank(user1);
        nft.burn(2);
        
        uint256[] memory ownedAfter = nft.ownedIds(user1);
        assertEq(ownedAfter.length, 2);
        assertFalse(_contains(ownedAfter, 2));
    }
    
    // ============ Helper Functions Tests ============
    
    function test_GetAvailableTokens() public {
        uint256[] memory available = nft.getAvailableTokens(10);
        assertEq(available.length, 10);
    }
    
    function test_GetAvailableTokens_AfterMints() public {
        nft.mintAtIndex(0);
        nft.mintAtIndex(1);
        nft.mintAtIndex(2);
        
        uint256[] memory available = nft.getAvailableTokens(10);
        assertFalse(_contains(available, 0));
        assertFalse(_contains(available, 1));
        assertFalse(_contains(available, 2));
    }
    
    function test_RevertWhen_GetAvailableTokensLimitTooHigh() public {
        vm.expectRevert("Limit too high");
        nft.getAvailableTokens(101);
    }
    
    function test_OwnedIds_EmptyForNonOwner() public {
        uint256[] memory owned = nft.ownedIds(user1);
        assertEq(owned.length, 0);
    }
    
    function test_OwnedIds_ReturnsAllTokens() public {
        vm.startPrank(user1);
        nft.mintAtIndex(5);
        nft.mintAtIndex(10);
        nft.mintAtIndex(15);
        vm.stopPrank();
        
        uint256[] memory owned = nft.ownedIds(user1);
        assertEq(owned.length, 3);
        assertTrue(_contains(owned, 5));
        assertTrue(_contains(owned, 10));
        assertTrue(_contains(owned, 15));
    }
    
    // ============ Withdraw Tests ============
    
    function test_Withdraw() public {
        nft.setMintPrice(MINT_PRICE);
        
        vm.prank(user1);
        nft.mintAtIndex{value: MINT_PRICE}(1);
        
        uint256 balanceBefore = owner.balance;
        nft.withdraw();
        uint256 balanceAfter = owner.balance + MINT_PRICE;
        
        assertEq(balanceAfter, balanceBefore);
    }
    
    function test_RevertWhen_NonOwnerWithdraws() public {
        vm.prank(user1);
        vm.expectRevert();
        nft.withdraw();
    }
    
    function test_RevertWhen_WithdrawNoBalance() public {
        vm.expectRevert("No balance to withdraw");
        nft.withdraw();
    }
    
    // ============ Fuzz Tests ============
    
    function testFuzz_MintAtIndex(uint256 tokenId) public {
        vm.assume(tokenId < 10000);
        
        nft.mintAtIndex(tokenId);
        assertEq(nft.ownerOf(tokenId), owner);
    }
    
    function testFuzz_MintPrice(uint256 price) public {
        vm.assume(price < 1000 ether);
        
        nft.setMintPrice(price);
        assertEq(nft.mintPrice(), price);
    }
    
    function testFuzz_ActivityPeriod(uint256 start, uint256 duration) public {
        vm.assume(start > block.timestamp);
        vm.assume(duration > 0 && duration < 365 days);
        
        uint256 end = start + duration;
        nft.setActivityPeriod(start, end);
        
        assertEq(nft.activityStart(), start);
        assertEq(nft.activityEnd(), end);
    }
    
    // ============ Helper Functions ============
    
    function _contains(uint256[] memory array, uint256 value) internal pure returns (bool) {
        for (uint256 i = 0; i < array.length; i++) {
            if (array[i] == value) {
                return true;
            }
        }
        return false;
    }
}