import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ContractFactory2Module = buildModule("ContractFactory2Module", (m) => {
  // Deploy the ContractFactory
  const contractFactory2 = m.contract("ContractFactory2", []);

  return { contractFactory2 };
});

export default ContractFactory2Module;