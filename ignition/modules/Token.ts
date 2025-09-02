import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Token", (m) => {
  const token = m.contract("Token", [5000000]);


  return { token };
});
