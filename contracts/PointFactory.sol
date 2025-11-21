// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.28;

// import "@openzeppelin/contracts/access/Ownable.sol";
// import "./PointToken.sol";

// /// @title PointFactory
// /// @notice Deploys PointToken (ERC-7818 Expirable) contracts with factory-controlled ownership.
// contract PointFactory is Ownable {
//     // --- Events ---
//     // Updated to include ERC-7818 expiration config (blockTime/frameSize) for indexers
//     event NewPointContract(
//         address indexed pointAddress, 
//         address indexed owner, 
//         uint16 blockTime, 
//         uint8 frameSize
//     );

//     // --- Errors ---
//     error PointOwnerRequired();
//     error TokenNameRequired();
//     error TokenSymbolRequired();
//     error InvalidBlockTime();
//     error InvalidFrameSize();

//     constructor() Ownable(msg.sender) {}

//     function createNewPointContract(
//         uint256 _initialSupply,
//         address _owner,
//         string calldata _name,
//         string calldata _symbol,
//         uint16 _blockTime,
//         uint8 _frameSize
//     ) external onlyOwner returns (address pointAddress) {
//         // Checks
//         if (_owner == address(0)) {
//             revert PointOwnerRequired();
//         }
//         // Checking bytes length is cheaper than string comparison
//         if (bytes(_name).length == 0) {
//             revert TokenNameRequired();
//         }
//         if (bytes(_symbol).length == 0) {
//             revert TokenSymbolRequired();
//         }
//         if (_blockTime == 0) {
//             revert InvalidBlockTime();
//         }
//         if (_frameSize == 0) {
//             revert InvalidFrameSize();
//         }

//         // Deployment of the ERC-7818 PointToken
//         PointToken token = new PointToken(
//             _initialSupply,
//             _owner,
//             _name,
//             _symbol,
//             _blockTime,
//             _frameSize
//         );
        
//         pointAddress = address(token);

//         // Emit event with expiration settings
//         emit NewPointContract(pointAddress, _owner, _blockTime, _frameSize);
//     }
// }