// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract PrecompileTest {
    
    // Test ecRecover (0x01)
    function testECRecover(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public pure returns (address) {
        return ecrecover(hash, v, r, s);
    }
    
    // Test SHA256 (0x02)
    function testSHA256(bytes memory data) public pure returns (bytes32) {
        return sha256(data);
    }
    
    // Test RIPEMD160 (0x03)
    function testRIPEMD160(bytes memory data) public pure returns (bytes20) {
        return ripemd160(data);
    }
    
    // Test Identity (0x04) - data copy
    function testIdentity(bytes memory data) public view returns (bytes memory) {
        bytes memory result = new bytes(data.length);
        
        assembly {
            let success := staticcall(
                gas(),
                0x04,
                add(data, 0x20),
                mload(data),
                add(result, 0x20),
                mload(data)
            )
            if iszero(success) {
                revert(0, 0)
            }
        }
        
        return result;
    }
    
    // Test ModExp (0x05)
    function testModExp(
        uint256 base,
        uint256 exponent,
        uint256 modulus
    ) public view returns (uint256 result) {
        assembly {
            let ptr := mload(0x40)
            
            // Length of base (32 bytes)
            mstore(ptr, 0x20)
            // Length of exponent (32 bytes)
            mstore(add(ptr, 0x20), 0x20)
            // Length of modulus (32 bytes)
            mstore(add(ptr, 0x40), 0x20)
            // Base
            mstore(add(ptr, 0x60), base)
            // Exponent
            mstore(add(ptr, 0x80), exponent)
            // Modulus
            mstore(add(ptr, 0xa0), modulus)
            
            let success := staticcall(
                gas(),
                0x05,
                ptr,
                0xc0,
                add(ptr, 0xc0),
                0x20
            )
            
            if iszero(success) {
                revert(0, 0)
            }
            
            result := mload(add(ptr, 0xc0))
        }
    }
    
    // Test ecAdd (0x06) for BN256 curve
    function testECAdd(
        uint256 x1, uint256 y1,
        uint256 x2, uint256 y2
    ) public view returns (uint256, uint256) {
        uint256[4] memory input;
        input[0] = x1;
        input[1] = y1;
        input[2] = x2;
        input[3] = y2;
        
        uint256[2] memory result;
        
        assembly {
            let success := staticcall(
                gas(),
                0x06,
                input,
                0x80,
                result,
                0x40
            )
            if iszero(success) {
                revert(0, 0)
            }
        }
        
        return (result[0], result[1]);
    }
    
    // Test ecMul (0x07)
    function testECMul(
        uint256 x,
        uint256 y,
        uint256 scalar
    ) public view returns (uint256, uint256) {
        uint256[3] memory input;
        input[0] = x;
        input[1] = y;
        input[2] = scalar;
        
        uint256[2] memory result;
        
        assembly {
            let success := staticcall(
                gas(),
                0x07,
                input,
                0x60,
                result,
                0x40
            )
            if iszero(success) {
                revert(0, 0)
            }
        }
        
        return (result[0], result[1]);
    }
}