import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Token", (m) => {
  const token = m.contract("Gems", ["500000000000000000000000000000000"]);


  return { token };
});
