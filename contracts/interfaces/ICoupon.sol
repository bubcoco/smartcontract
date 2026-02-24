// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface ICoupon is IERC1155 {
    event CouponTypeCreated(uint256 indexed typeId, string name);

    event CouponMinted(
        uint256 indexed typeId,
        address indexed to,
        uint256 amount
    );

    event CouponRedeemed(
        uint256 indexed typeId,
        address indexed owner,
        uint256 amount
    );

    function createCouponType(
        string memory name,
        uint256 startDate,
        uint256 expireDate
    ) external returns (uint256);

    function mint(address to, uint256 typeId, uint256 amount) external;

    function redeem(uint256 typeId, uint256 amount) external;

    function redeemFrom(address from, uint256 typeId, uint256 amount) external;

    function getCouponData(
        uint256 typeId
    )
        external
        view
        returns (
            string memory name,
            uint256 startDate,
            uint256 expireDate,
            uint256 totalSupply,
            uint256 totalRedeemed
        );

    function getTotalSupply(uint256 typeId) external view returns (uint256);

    function getTotalRedeemed(uint256 typeId) external view returns (uint256);

    function batchMint(
        address[] calldata recipients,
        uint256[] calldata typeIds,
        uint256[] calldata amounts
    ) external;

    function burn(address from, uint256 typeId, uint256 amount) external;

    function isCouponActive(uint256 typeId) external view returns (bool);

    function setMarketplace(address marketplace) external;
}
