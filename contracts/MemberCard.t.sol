// test/MemberCard.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/MemberCard.sol";

contract MemberCardTest is Test {
    MemberCard public memberCard;
    address public owner;
    address public user1;
    address public user2;

    event CardMinted(address indexed to, uint256 indexed tokenId);
    event Stamped(uint256 indexed tokenId, uint256 stampCount, uint256 timestamp);
    event Redeemed(uint256 indexed tokenId, address indexed owner);

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        memberCard = new MemberCard();
    }

    // ============ Deployment Tests ============

    function test_Deployment() public view {
        assertEq(memberCard.owner(), owner);
        assertEq(memberCard.name(), "MemberCard");
        assertEq(memberCard.symbol(), "MCARD");
        assertEq(memberCard.MAX_STAMPS(), 10);
    }

    // ============ Minting Tests ============

    function test_MintCard() public {
        uint256 tokenId = memberCard.mintCard(user1);
        
        assertEq(memberCard.ownerOf(tokenId), user1);
        assertEq(tokenId, 0);
    }

    function test_MintCard_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit CardMinted(user1, 0);
        
        memberCard.mintCard(user1);
    }

    function test_MintCard_InitializesCorrectly() public {
        memberCard.mintCard(user1);
        
        (uint256 stampCount, bool redeemed, , bool canRedeem) = memberCard.getCardInfo(0);
        
        assertEq(stampCount, 0);
        assertEq(redeemed, false);
        assertEq(canRedeem, false);
    }

    function test_MintCard_MultipleCards() public {
        memberCard.mintCard(user1);
        memberCard.mintCard(user2);
        memberCard.mintCard(user1);
        
        assertEq(memberCard.ownerOf(0), user1);
        assertEq(memberCard.ownerOf(1), user2);
        assertEq(memberCard.ownerOf(2), user1);
    }

    function testFail_MintCard_OnlyOwner() public {
        vm.prank(user1);
        memberCard.mintCard(user2);

        vm.expectRevert("Ownable: caller is not the owner");
    }

    // ============ Stamping Tests ============

    function test_AddStamp() public {
        memberCard.mintCard(user1);
        memberCard.addStamp(0);
        
        assertEq(memberCard.getStampCount(0), 1);
    }

    function test_AddStamp_EmitsEvent() public {
        memberCard.mintCard(user1);
        
        vm.expectEmit(true, false, false, false);
        emit Stamped(0, 1, block.timestamp);
        
        memberCard.addStamp(0);
    }

    function test_AddStamp_RecordsTimestamp() public {
        memberCard.mintCard(user1);
        
        memberCard.addStamp(0);
        vm.warp(block.timestamp + 100);
        memberCard.addStamp(0);
        
        uint256[] memory stamps = memberCard.getStamps(0);
        assertEq(stamps.length, 2);
        assertTrue(stamps[1] > stamps[0]);
    }

    function test_AddStamp_UpTo10Stamps() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        assertEq(memberCard.getStampCount(0), 10);
    }

    function testFail_AddStamp_MoreThan10() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 11; i++) {
            memberCard.addStamp(0);
        }
        vm.expectRevert("Card is full");
    }

    function test_AddStamp_RevertsWhenFull() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.expectRevert("Card is full");
        memberCard.addStamp(0);
    }

    function test_AddStamp_RevertsNonExistent() public {
        vm.expectRevert("Card does not exist");
        memberCard.addStamp(999);
    }

    function test_AddStamp_RevertsAfterRedemption() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        vm.expectRevert("Card already redeemed");
        memberCard.addStamp(0);
    }

    function testFail_AddStamp_OnlyOwner() public {
        memberCard.mintCard(user1);
        
        vm.prank(user1);
        memberCard.addStamp(0);

        vm.expectRevert("Ownable: caller is not the owner");
    }

    // ============ Redemption Tests ============

    function test_RedeemReward() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        assertTrue(memberCard.isRedeemed(0));
    }

    function test_RedeemReward_EmitsEvent() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.expectEmit(true, true, false, true);
        emit Redeemed(0, user1);
        
        vm.prank(user1);
        memberCard.redeemReward(0);
    }

    function test_RedeemReward_RevertsLessThan10Stamps() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 9; i++) {
            memberCard.addStamp(0);
        }
        
        vm.expectRevert("Need 10 stamps to redeem");
        vm.prank(user1);
        memberCard.redeemReward(0);
    }

    function test_RedeemReward_RevertsNotOwner() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.expectRevert("Not the card owner");
        vm.prank(user2);
        memberCard.redeemReward(0);
    }

    function test_RedeemReward_RevertsAlreadyRedeemed() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        vm.expectRevert("Already redeemed");
        vm.prank(user1);
        memberCard.redeemReward(0);
    }

    function test_RedeemReward_CanRedeemStatus() public {
        memberCard.mintCard(user1);
        
        (, , , bool canRedeem) = memberCard.getCardInfo(0);
        assertFalse(canRedeem);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        (, , , canRedeem) = memberCard.getCardInfo(0);
        assertTrue(canRedeem);
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        (, , , canRedeem) = memberCard.getCardInfo(0);
        assertFalse(canRedeem);
    }

    // ============ Reset Tests ============

    function test_ResetCard() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        memberCard.resetCard(0);
        
        (uint256 stampCount, bool redeemed, uint256[] memory stamps, ) = memberCard.getCardInfo(0);
        
        assertEq(stampCount, 0);
        assertFalse(redeemed);
        assertEq(stamps.length, 0);
    }

    function test_ResetCard_AllowsStampingAfter() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        memberCard.resetCard(0);
        memberCard.addStamp(0);
        
        assertEq(memberCard.getStampCount(0), 1);
    }

    function test_ResetCard_RevertsNotRedeemed() public {
        memberCard.mintCard(user1);
        
        vm.expectRevert("Card not yet redeemed");
        memberCard.resetCard(0);
    }

    function testFail_ResetCard_OnlyOwner() public {
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        vm.prank(user1);
        memberCard.resetCard(0);

    
    }

    // ============ View Function Tests ============

    function test_GetCardInfo() public {
        memberCard.mintCard(user1);
        memberCard.addStamp(0);
        memberCard.addStamp(0);
        
        (uint256 stampCount, bool redeemed, uint256[] memory stamps, bool canRedeem) = memberCard.getCardInfo(0);
        
        assertEq(stampCount, 2);
        assertFalse(redeemed);
        assertEq(stamps.length, 2);
        assertFalse(canRedeem);
    }

    function test_GetStampCount() public {
        memberCard.mintCard(user1);
        memberCard.addStamp(0);
        memberCard.addStamp(0);
        
        assertEq(memberCard.getStampCount(0), 2);
    }

    function test_GetStamps() public {
        memberCard.mintCard(user1);
        memberCard.addStamp(0);
        memberCard.addStamp(0);
        
        uint256[] memory stamps = memberCard.getStamps(0);
        assertEq(stamps.length, 2);
    }

    function test_IsRedeemed() public {
        memberCard.mintCard(user1);
        
        assertFalse(memberCard.isRedeemed(0));
        
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        
        vm.prank(user1);
        memberCard.redeemReward(0);
        
        assertTrue(memberCard.isRedeemed(0));
    }

    function test_GetCardInfo_RevertsNonExistent() public {
        vm.expectRevert("Card does not exist");
        memberCard.getCardInfo(999);
    }

    // ============ Integration Tests ============

    function test_CompleteLifecycle() public {
        // Mint
        memberCard.mintCard(user1);
        assertEq(memberCard.ownerOf(0), user1);
        
        // Add stamps
        for (uint256 i = 0; i < 10; i++) {
            memberCard.addStamp(0);
        }
        assertEq(memberCard.getStampCount(0), 10);
        
        // Redeem
        vm.prank(user1);
        memberCard.redeemReward(0);
        assertTrue(memberCard.isRedeemed(0));
        
        // Reset
        memberCard.resetCard(0);
        assertEq(memberCard.getStampCount(0), 0);
        assertFalse(memberCard.isRedeemed(0));
    }

    function test_MultipleCardsIndependent() public {
        memberCard.mintCard(user1);
        memberCard.mintCard(user2);
        
        memberCard.addStamp(0);
        memberCard.addStamp(0);
        memberCard.addStamp(1);
        
        assertEq(memberCard.getStampCount(0), 2);
        assertEq(memberCard.getStampCount(1), 1);
    }

    // ============ Fuzz Tests ============

    function testFuzz_MintCard(address to) public {
        vm.assume(to != address(0));
        
        uint256 tokenId = memberCard.mintCard(to);
        assertEq(memberCard.ownerOf(tokenId), to);
    }

    function testFuzz_AddStamps(uint8 numStamps) public {
        vm.assume(numStamps > 0 && numStamps <= 10);
        
        memberCard.mintCard(user1);
        
        for (uint256 i = 0; i < numStamps; i++) {
            memberCard.addStamp(0);
        }
        
        assertEq(memberCard.getStampCount(0), numStamps);
    }
}