import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition module for deploying PointFactory contract
 * 
 * Usage:
 * npx hardhat ignition deploy ignition/modules/PointFactory.ts --network <network-name>
 * 
 * To verify on Etherscan:
 * npx hardhat ignition deploy ignition/modules/PointFactory.ts --network <network-name> --verify
 */
const PointFactoryModule = buildModule("PointFactoryModule", (m) => {
  // Deploy PointFactory
  // The factory contract will be owned by the deployer (msg.sender)
  const pointFactory = m.contract("PointFactory", []);

  return { pointFactory };
});

export default PointFactoryModule;