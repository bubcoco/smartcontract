// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../interfaces/IVault.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockVault is IVault, Ownable {
    struct Escrow {
        address seller;
        address buyer;
        uint256 totalAmount;
        uint256 remainingAmount;
        uint256 couponsLocked;
        uint256 couponsRedeemed;
        bool active;
        uint256 lockedAt;
    }

    mapping(uint256 => Escrow) public escrows;
    IERC20 public paymentToken;

    constructor(address _paymentToken) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
    }

    function lockFunds(
        uint256 escrowId,
        address seller,
        address buyer,
        uint256 amount,
        uint256 couponsLocked
    ) external override {
        // Transfer funds from buyer to vault
        require(
            paymentToken.transferFrom(buyer, address(this), amount),
            "Transfer failed"
        );

        escrows[escrowId] = Escrow({
            seller: seller,
            buyer: buyer,
            totalAmount: amount,
            remainingAmount: amount,
            couponsLocked: couponsLocked,
            couponsRedeemed: 0,
            active: true,
            lockedAt: block.timestamp
        });

        emit FundsLocked(escrowId, seller, buyer, amount);
    }

    function releaseFunds(uint256 escrowId) external override {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.active, "Escrow not active");

        uint256 amount = escrow.remainingAmount;
        escrow.remainingAmount = 0;
        escrow.active = false;
        escrow.couponsRedeemed = escrow.couponsLocked;

        require(
            paymentToken.transfer(escrow.seller, amount),
            "Transfer failed"
        );

        emit FundsReleased(escrowId, escrow.seller, escrow.buyer, amount);
    }

    function releaseFundsPartial(
        uint256 escrowId,
        uint256 couponsToRedeem
    ) external override {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.active, "Escrow not active");
        require(
            escrow.couponsRedeemed + couponsToRedeem <= escrow.couponsLocked,
            "Exceeds locked coupons"
        );

        // Calculate amount to release based on proportion
        uint256 amountToRelease = (escrow.totalAmount * couponsToRedeem) /
            escrow.couponsLocked;

        // Adjust for rounding issues on last redemption
        if (escrow.couponsRedeemed + couponsToRedeem == escrow.couponsLocked) {
            amountToRelease = escrow.remainingAmount;
            escrow.active = false;
        }

        escrow.remainingAmount -= amountToRelease;
        escrow.couponsRedeemed += couponsToRedeem;

        require(
            paymentToken.transfer(escrow.seller, amountToRelease),
            "Transfer failed"
        );

        emit FundsReleased(
            escrowId,
            escrow.seller,
            escrow.buyer,
            amountToRelease
        );
    }

    function returnFunds(uint256 escrowId) external override {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.active, "Escrow not active");

        uint256 amount = escrow.remainingAmount;
        escrow.remainingAmount = 0;
        escrow.active = false;

        require(paymentToken.transfer(escrow.buyer, amount), "Transfer failed");

        emit FundsReturned(escrowId, escrow.buyer, amount);
    }

    function getEscrow(
        uint256 escrowId
    )
        external
        view
        override
        returns (
            address seller,
            address buyer,
            uint256 totalAmount,
            uint256 remainingAmount,
            uint256 couponsLocked,
            uint256 couponsRedeemed,
            bool active,
            uint256 lockedAt
        )
    {
        Escrow memory escrow = escrows[escrowId];
        return (
            escrow.seller,
            escrow.buyer,
            escrow.totalAmount,
            escrow.remainingAmount,
            escrow.couponsLocked,
            escrow.couponsRedeemed,
            escrow.active,
            escrow.lockedAt
        );
    }

    function hasActiveEscrow(
        uint256 escrowId
    ) external view override returns (bool) {
        return escrows[escrowId].active;
    }
}
