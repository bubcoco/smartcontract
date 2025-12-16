// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "forge-std/Test.sol";
import "../contracts/PrecompileTester.sol";
import "../contracts/interfaces/INativeMinter.sol";
import "../contracts/interfaces/IAddressRegistry.sol";
import "../contracts/interfaces/IGasPrice.sol";
import "../contracts/interfaces/IRevenueRatio.sol";
import "../contracts/interfaces/ITreasuryRegistry.sol";
import "../contracts/interfaces/IGasFeeGrant.sol";

// --- Mock Contracts ---

contract MockNativeMinter is INativeMinter {
    function mint(
        address,
        uint256
    ) external pure returns (bool, string memory) {
        return (true, "Minted");
    }
    function initializeOwnerAndSupply(
        address,
        uint256
    ) external pure returns (bool) {
        return true;
    }
    function owner() external pure returns (address) {
        return address(0);
    }
    function transferOwnership(address) external pure returns (bool) {
        return true;
    }
    function initialized() external pure returns (bool) {
        return true;
    }
    function initializeOwner(address) external pure returns (bool) {
        return true;
    }
}

contract MockAddressRegistry is IAddressRegistry {
    function contains(address) external pure returns (bool) {
        return true;
    }
    function discovery(address) external pure returns (address) {
        return address(2);
    }
    function addToRegistry(address, address) external pure returns (bool) {
        return true;
    }
    function removeFromRegistry(address) external pure returns (bool) {
        return true;
    }
}

contract MockGasPrice is IGasPrice {
    function gasPrice() external pure returns (uint256) {
        return 100 gwei;
    }
    function status() external pure returns (bool) {
        return true;
    }
    function enable() external pure returns (bool) {
        return true;
    }
    function disable() external pure returns (bool) {
        return true;
    }
    function setGasPrice(uint256) external pure returns (bool) {
        return true;
    }
}

contract MockRevenueRatio is IRevenueRatio {
    function status() external pure returns (bool) {
        return true;
    }
    function enable() external pure returns (bool) {
        return true;
    }
    function disable() external pure returns (bool) {
        return true;
    }
    function contractRatio() external pure returns (uint256) {
        return 10;
    }
    function coinbaseRatio() external pure returns (uint256) {
        return 20;
    }
    function providerRatio() external pure returns (uint256) {
        return 30;
    }
    function treasuryRatio() external pure returns (uint256) {
        return 40;
    }
    function setRevenueRatio(
        uint8,
        uint8,
        uint8,
        uint8
    ) external pure returns (bool) {
        return true;
    }
}

contract MockTreasuryRegistry is ITreasuryRegistry {
    function treasuryAt() external pure returns (address) {
        return address(3);
    }
    function setTreasury(address) external pure returns (bool) {
        return true;
    }
}

contract MockGasFeeGrant is IGasFeeGrant {
    function setFeeGrant(
        address,
        address,
        address,
        uint256,
        uint32,
        uint256,
        uint256
    ) external pure returns (bool) {
        return true;
    }
    function revokeFeeGrant(address, address) external pure returns (bool) {
        return true;
    }
    function periodCanSpend(address, address) external pure returns (uint256) {
        return 500;
    }
    function periodReset(address, address) external pure returns (uint256) {
        return 0;
    }
    function isExpired(address, address) external pure returns (bool) {
        return false;
    }
    function isGrantedForProgram(
        address,
        address
    ) external pure returns (bool) {
        return true;
    }
    function isGrantedForAllProgram(address) external pure returns (bool) {
        return true;
    }
    function grant(
        address,
        address
    ) external pure returns (IGasFeeGrant.Grant memory) {
        return
            IGasFeeGrant.Grant({
                granter: address(0),
                allowance: IGasFeeGrant.FEE_ALLOWANCE_TYPE.NON_ALLOWANCE,
                spendLimit: 0,
                periodLimit: 0,
                periodCanSpend: 0,
                startTime: 0,
                endTime: 0,
                latestTransaction: 0,
                period: 0
            });
    }
}

contract PrecompileTesterTest is Test {
    PrecompileTester tester;

    address constant NATIVE_MINTER_ADDR =
        0x0000000000000000000000000000000000001001;
    address constant ADDRESS_REGISTRY_ADDR =
        0x0000000000000000000000000000000000001002;
    address constant GAS_PRICE_ADDR =
        0x0000000000000000000000000000000000001003;
    address constant REVENUE_RATIO_ADDR =
        0x0000000000000000000000000000000000001004;
    address constant TREASURY_REGISTRY_ADDR =
        0x0000000000000000000000000000000000001005;
    address constant GAS_FEE_GRANT_ADDR =
        0x0000000000000000000000000000000000001006;

    function setUp() public {
        tester = new PrecompileTester();

        // Etch mock bytecode to precompile addresses
        vm.etch(NATIVE_MINTER_ADDR, address(new MockNativeMinter()).code);
        vm.etch(ADDRESS_REGISTRY_ADDR, address(new MockAddressRegistry()).code);
        vm.etch(GAS_PRICE_ADDR, address(new MockGasPrice()).code);
        vm.etch(REVENUE_RATIO_ADDR, address(new MockRevenueRatio()).code);
        vm.etch(
            TREASURY_REGISTRY_ADDR,
            address(new MockTreasuryRegistry()).code
        );
        vm.etch(GAS_FEE_GRANT_ADDR, address(new MockGasFeeGrant()).code);
    }

    // --- NativeMinter Tests ---

    function testMint() public {
        (bool success, string memory msg_) = tester.testMint(address(1), 100);
        assertTrue(success);
        assertEq(msg_, "Minted");
    }

    function testMinterInitializeOwnerAndSupply() public {
        bool success = tester.testMinterInitializeOwnerAndSupply(
            address(this),
            1000
        );
        assertTrue(success);
    }

    // --- AddressRegistry Tests ---

    function testAddressRegistryContains() public {
        bool exists = tester.testAddressRegistryContains(address(1));
        assertTrue(exists);
    }

    function testAddressRegistryDiscovery() public {
        address res = tester.testAddressRegistryDiscovery(address(1));
        assertEq(res, address(2));
    }

    function testAddressRegistryAdd() public {
        bool success = tester.testAddressRegistryAdd(address(1), address(2));
        assertTrue(success);
    }

    function testAddressRegistryRemove() public {
        bool success = tester.testAddressRegistryRemove(address(1));
        assertTrue(success);
    }

    // --- GasPrice Tests ---

    function testGasPriceGet() public {
        uint256 price = tester.testGasPriceGet();
        assertEq(price, 100 gwei);
    }

    function testGasPriceStatus() public {
        bool status = tester.testGasPriceStatus();
        assertTrue(status);
    }

    function testGasPriceEnable() public {
        assertTrue(tester.testGasPriceEnable());
    }

    function testGasPriceDisable() public {
        assertTrue(tester.testGasPriceDisable());
    }

    function testGasPriceSet() public {
        assertTrue(tester.testGasPriceSet(200));
    }

    // --- RevenueRatio Tests ---

    function testRevenueRatioCalls() public {
        assertTrue(tester.testRevenueRatioStatus());
        assertTrue(tester.testRevenueRatioEnable());
        assertTrue(tester.testRevenueRatioDisable());

        assertEq(tester.testRevenueRatioContract(), 10);
        assertEq(tester.testRevenueRatioCoinbase(), 20);
        assertEq(tester.testRevenueRatioProvider(), 30);
        assertEq(tester.testRevenueRatioTreasury(), 40);

        assertTrue(tester.testRevenueRatioSet(10, 20, 30, 40));
    }

    // --- TreasuryRegistry Tests ---

    function testTreasuryRegistryFunctions() public {
        assertEq(tester.testTreasuryRegistryGet(), address(3));
        assertTrue(tester.testTreasuryRegistrySet(address(4)));
    }

    // --- GasFeeGrant Tests ---

    function testGasFeeGrantFunctions() public {
        address granter = address(10);
        address grantee = address(11);
        address program = address(12);

        assertTrue(
            tester.testGasFeeGrantSet(
                granter,
                grantee,
                program,
                100,
                100,
                100,
                100
            )
        );
        assertTrue(tester.testGasFeeGrantRevoke(grantee, program));

        assertEq(tester.testGasFeeGrantPeriodCanSpend(grantee, program), 500);
        assertFalse(tester.testGasFeeGrantIsExpired(grantee, program));
    }
}
