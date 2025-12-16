// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/INativeMinter.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IGasPrice.sol";
import "./interfaces/IRevenueRatio.sol";
import "./interfaces/ITreasuryRegistry.sol";
import "./interfaces/IGasFeeGrant.sol";
import "./interfaces/IOwnable.sol";

contract PrecompileTester {
    address public constant NATIVE_MINTER_ADDR =
        0x0000000000000000000000000000000000001001;
    address public constant ADDRESS_REGISTRY_ADDR =
        0x0000000000000000000000000000000000001002;
    address public constant GAS_PRICE_ADDR =
        0x0000000000000000000000000000000000001003;
    address public constant REVENUE_RATIO_ADDR =
        0x0000000000000000000000000000000000001004;
    address public constant TREASURY_REGISTRY_ADDR =
        0x0000000000000000000000000000000000001005;
    address public constant GAS_FEE_GRANT_ADDR =
        0x0000000000000000000000000000000000001006;

    constructor() {}

    receive() external payable {}

    // NativeMinter
    function testMint(
        address to,
        uint256 value
    ) external returns (bool, string memory) {
        return INativeMinter(NATIVE_MINTER_ADDR).mint(to, value);
    }

    function testMinterInitializeOwnerAndSupply(
        address owner,
        uint256 totalSupply
    ) external returns (bool) {
        return
            INativeMinter(NATIVE_MINTER_ADDR).initializeOwnerAndSupply(
                owner,
                totalSupply
            );
    }

    function testMinterOwner() external view returns (address) {
        return INativeMinter(NATIVE_MINTER_ADDR).owner();
    }

    function testMinterInitialized() external view returns (bool) {
        return INativeMinter(NATIVE_MINTER_ADDR).initialized();
    }

    function testMinterInitializeOwner(address owner) external returns (bool) {
        return INativeMinter(NATIVE_MINTER_ADDR).initializeOwner(owner);
    }

    function testMinterTransferOwnership(
        address newOwner
    ) external returns (bool) {
        return INativeMinter(NATIVE_MINTER_ADDR).transferOwnership(newOwner);
    }

    // AddressRegistry
    function testAddressRegistryContains(
        address account
    ) external view returns (bool) {
        return IAddressRegistry(ADDRESS_REGISTRY_ADDR).contains(account);
    }

    function testAddressRegistryDiscovery(
        address account
    ) external view returns (address) {
        return IAddressRegistry(ADDRESS_REGISTRY_ADDR).discovery(account);
    }

    function testAddressRegistryAdd(
        address account,
        address initiator
    ) external returns (bool) {
        return
            IAddressRegistry(ADDRESS_REGISTRY_ADDR).addToRegistry(
                account,
                initiator
            );
    }

    function testAddressRegistryRemove(
        address account
    ) external returns (bool) {
        return
            IAddressRegistry(ADDRESS_REGISTRY_ADDR).removeFromRegistry(account);
    }

    // GasPrice
    function testGasPriceGet() external view returns (uint256) {
        return IGasPrice(GAS_PRICE_ADDR).gasPrice();
    }

    function testGasPriceStatus() external view returns (bool) {
        return IGasPrice(GAS_PRICE_ADDR).status();
    }

    function testGasPriceEnable() external returns (bool) {
        return IGasPrice(GAS_PRICE_ADDR).enable();
    }

    function testGasPriceDisable() external returns (bool) {
        return IGasPrice(GAS_PRICE_ADDR).disable();
    }

    function testGasPriceSet(uint256 price) external returns (bool) {
        return IGasPrice(GAS_PRICE_ADDR).setGasPrice(price);
    }

    // RevenueRatio
    function testRevenueRatioStatus() external view returns (bool) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).status();
    }

    function testRevenueRatioEnable() external returns (bool) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).enable();
    }

    function testRevenueRatioDisable() external returns (bool) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).disable();
    }

    function testRevenueRatioContract() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).contractRatio();
    }

    function testRevenueRatioCoinbase() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).coinbaseRatio();
    }

    function testRevenueRatioProvider() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).providerRatio();
    }

    function testRevenueRatioTreasury() external view returns (uint256) {
        return IRevenueRatio(REVENUE_RATIO_ADDR).treasuryRatio();
    }

    function testRevenueRatioSet(
        uint8 contractRatio,
        uint8 coinbaseRatio,
        uint8 providerRatio,
        uint8 treasuryRatio
    ) external returns (bool) {
        return
            IRevenueRatio(REVENUE_RATIO_ADDR).setRevenueRatio(
                contractRatio,
                coinbaseRatio,
                providerRatio,
                treasuryRatio
            );
    }

    // TreasuryRegistry
    function testTreasuryRegistryGet() external view returns (address) {
        return ITreasuryRegistry(TREASURY_REGISTRY_ADDR).treasuryAt();
    }

    function testTreasuryRegistrySet(
        address newTreasury
    ) external returns (bool) {
        return
            ITreasuryRegistry(TREASURY_REGISTRY_ADDR).setTreasury(newTreasury);
    }

    // GasFeeGrant
    function testGasFeeGrantSet(
        address granter,
        address grantee,
        address program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    ) external returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_ADDR).setFeeGrant(
                granter,
                grantee,
                program,
                spendLimit,
                period,
                periodLimit,
                endTime
            );
    }

    function testGasFeeGrantRevoke(
        address grantee,
        address program
    ) external returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_ADDR).revokeFeeGrant(grantee, program);
    }

    function testGasFeeGrantPeriodCanSpend(
        address grantee,
        address program
    ) external view returns (uint256) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_ADDR).periodCanSpend(grantee, program);
    }

    function testGasFeeGrantPeriodReset(
        address grantee,
        address program
    ) external view returns (uint256) {
        return IGasFeeGrant(GAS_FEE_GRANT_ADDR).periodReset(grantee, program);
    }

    function testGasFeeGrantIsExpired(
        address grantee,
        address program
    ) external view returns (bool) {
        return IGasFeeGrant(GAS_FEE_GRANT_ADDR).isExpired(grantee, program);
    }

    function testGasFeeGrantIsGrantedForProgram(
        address grantee,
        address program
    ) external view returns (bool) {
        return
            IGasFeeGrant(GAS_FEE_GRANT_ADDR).isGrantedForProgram(
                grantee,
                program
            );
    }

    function testGasFeeGrantIsGrantedForAllProgram(
        address grantee
    ) external view returns (bool) {
        return IGasFeeGrant(GAS_FEE_GRANT_ADDR).isGrantedForAllProgram(grantee);
    }

    function testGasFeeGrantGet(
        address grantee,
        address program
    ) external view returns (IGasFeeGrant.Grant memory) {
        return IGasFeeGrant(GAS_FEE_GRANT_ADDR).grant(grantee, program);
    }
}