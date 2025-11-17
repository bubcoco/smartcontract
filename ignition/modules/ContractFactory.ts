import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ContractFactoryModule = buildModule("ContractFactoryModule", (m) => {
  // Deploy the ContractFactory
  const contractFactory = m.contract("ContractFactory", []);

  return { contractFactory };
});

export default ContractFactoryModule;