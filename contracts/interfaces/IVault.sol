// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IVault {
    // Events
    event FundsLocked(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 amount
    );
    event FundsReleased(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 amount
    );
    event FundsReturned(
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 amount
    );

    // Core functions
    function lockFunds(
        uint256 tokenId,
        address seller,
        address buyer,
        uint256 amount,
        uint256 couponsLocked
    ) external;

    function releaseFunds(uint256 tokenId) external;

    function releaseFundsPartial(
        uint256 tokenId,
        uint256 couponsToRedeem
    ) external;

    function returnFunds(uint256 tokenId) external;

    // View functions
    function getEscrow(
        uint256 tokenId
    )
        external
        view
        returns (
            address seller,
            address buyer,
            uint256 totalAmount,
            uint256 remainingAmount,
            uint256 couponsLocked,
            uint256 couponsRedeemed,
            bool active,
            uint256 lockedAt
        );

    function hasActiveEscrow(uint256 tokenId) external view returns (bool);
}
