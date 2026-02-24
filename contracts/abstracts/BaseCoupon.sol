// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ICoupon.sol";

interface IMarketplaceCallback {
    function onCouponRedeemed(uint256 typeId, uint256 amount) external;
}

abstract contract BaseCoupon is ICoupon, ERC1155, Ownable, ReentrancyGuard {
    error CouponTypeNotFound();
    error InvalidRedeemCode();
    error ZeroAddress();
    error EmptyRedeemCode();
    error ExceedsMaxSupply();
    error InsufficientBalance();
    error ZeroAmount();
    error CouponNotStarted();
    error CouponExpired();
    error InvalidDateRange();

    struct CouponType {
        string name;
        uint256 startDate;
        uint256 expireDate;
        uint256 totalSupply;
        uint256 totalRedeemed;
        bool exists;
    }

    // State variables
    uint256 private _nextTypeId = 1;
    mapping(uint256 => CouponType) private _couponTypes;
    string public tokenName;
    string public tokenSymbol;

    // Marketplace callback address
    address public marketplace;

    constructor(
        string memory _tokenName,
        string memory _tokenSymbol
    ) ERC1155("") {
        tokenName = _tokenName;
        tokenSymbol = _tokenSymbol;
    }

    function createCouponType(
        string memory name,
        uint256 startDate,
        uint256 expireDate
    ) external virtual override onlyOwner nonReentrant returns (uint256) {
        if (startDate >= expireDate) revert InvalidDateRange();

        uint256 typeId = _nextTypeId;
        _nextTypeId++;

        _couponTypes[typeId] = CouponType({
            name: name,
            startDate: startDate,
            expireDate: expireDate,
            totalSupply: 0,
            totalRedeemed: 0,
            exists: true
        });

        emit CouponTypeCreated(typeId, name);
        return typeId;
    }

    /**
     * @notice Set the marketplace contract address for redemption callbacks
     * @param _marketplace Address of the marketplace contract
     */
    function setMarketplace(address _marketplace) external onlyOwner {
        if (_marketplace == address(0)) revert ZeroAddress();
        marketplace = _marketplace;
    }

    function mint(
        address to,
        uint256 typeId,
        uint256 amount
    ) external virtual override onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();

        CouponType storage couponType = _couponTypes[typeId];
        couponType.totalSupply += amount;
        _mint(to, typeId, amount, "");

        emit CouponMinted(typeId, to, amount);
    }

    function redeem(
        uint256 typeId,
        uint256 amount
    ) external virtual override nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();

        // Check if coupon is within valid date range
        CouponType storage couponType = _couponTypes[typeId];
        if (block.timestamp < couponType.startDate) revert CouponNotStarted();
        if (block.timestamp > couponType.expireDate) revert CouponExpired();

        if (balanceOf(msg.sender, typeId) < amount) {
            revert InsufficientBalance();
        }

        couponType.totalRedeemed += amount;

        // Burn the redeemed coupons
        _burn(msg.sender, typeId, amount);

        // Notify marketplace to release escrow funds to sellers
        if (marketplace != address(0)) {
            IMarketplaceCallback(marketplace).onCouponRedeemed(typeId, amount);
        }

        emit CouponRedeemed(typeId, msg.sender, amount);
    }

    function redeemFrom(
        address from,
        uint256 typeId,
        uint256 amount
    ) external virtual nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();

        // Check if coupon is within valid date range
        CouponType storage couponType = _couponTypes[typeId];
        if (block.timestamp < couponType.startDate) revert CouponNotStarted();
        if (block.timestamp > couponType.expireDate) revert CouponExpired();

        if (balanceOf(from, typeId) < amount) {
            revert InsufficientBalance();
        }

        // Only owner or approved operators can redeem from someone else
        require(
            msg.sender == owner() ||
                msg.sender == from ||
                isApprovedForAll(from, msg.sender),
            "Not authorized to redeem"
        );

        couponType.totalRedeemed += amount;
        couponType.totalSupply -= amount;

        // Burn the redeemed coupons
        _burn(from, typeId, amount);

        // Notify marketplace to release escrow funds to sellers
        if (marketplace != address(0)) {
            IMarketplaceCallback(marketplace).onCouponRedeemed(typeId, amount);
        }

        emit CouponRedeemed(typeId, from, amount);
    }

    function getCouponData(
        uint256 typeId
    )
        external
        view
        virtual
        override
        returns (
            string memory name,
            uint256 startDate,
            uint256 expireDate,
            uint256 totalSupply,
            uint256 totalRedeemed
        )
    {
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();

        CouponType memory couponType = _couponTypes[typeId];
        return (
            couponType.name,
            couponType.startDate,
            couponType.expireDate,
            couponType.totalSupply,
            couponType.totalRedeemed
        );
    }

    function getTotalSupply(
        uint256 typeId
    ) external view virtual override returns (uint256) {
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();
        return _couponTypes[typeId].totalSupply;
    }

    function getTotalRedeemed(
        uint256 typeId
    ) external view virtual override returns (uint256) {
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();
        return _couponTypes[typeId].totalRedeemed;
    }

    function batchMint(
        address[] calldata recipients,
        uint256[] calldata typeIds,
        uint256[] calldata amounts
    ) external virtual override onlyOwner nonReentrant {
        require(
            recipients.length == typeIds.length &&
                typeIds.length == amounts.length,
            "Arrays length mismatch"
        );
        require(recipients.length > 0, "Empty arrays");

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            if (!_couponTypes[typeIds[i]].exists) revert CouponTypeNotFound();

            CouponType storage couponType = _couponTypes[typeIds[i]];

            couponType.totalSupply += amounts[i];
            _mint(recipients[i], typeIds[i], amounts[i], "");

            emit CouponMinted(typeIds[i], recipients[i], amounts[i]);
        }
    }

    function burn(
        address from,
        uint256 typeId,
        uint256 amount
    ) external virtual override onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();

        _burn(from, typeId, amount);
        _couponTypes[typeId].totalSupply -= amount;
    }

    function isCouponActive(uint256 typeId) external view returns (bool) {
        if (!_couponTypes[typeId].exists) return false;

        CouponType memory couponType = _couponTypes[typeId];
        return
            block.timestamp >= couponType.startDate &&
            block.timestamp <= couponType.expireDate;
    }

    function getCouponDates(
        uint256 typeId
    ) external view returns (uint256 startDate, uint256 expireDate) {
        if (!_couponTypes[typeId].exists) revert CouponTypeNotFound();

        CouponType memory couponType = _couponTypes[typeId];
        return (couponType.startDate, couponType.expireDate);
    }

    function totalTypes() external view returns (uint256) {
        return _nextTypeId - 1;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155, IERC165) returns (bool) {
        return
            interfaceId == type(ICoupon).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
