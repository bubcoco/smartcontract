import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import TokenFactoryModule from "./tokenFactory.js";

const ContractFactoryModule = buildModule("ContractFactory", (m) => {
  // Constructor parameters

  // Deploy the NFT contract
  const contractFactory = m.contract("ContractFactory", [
    
  ]);

  return { contractFactory };
});

export default ContractFactoryModule;