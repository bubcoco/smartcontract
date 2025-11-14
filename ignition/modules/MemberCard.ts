// ignition/modules/MemberCard.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MemberCardModule = buildModule("MemberCardModule", (m) => {
  // Deploy the MemberCard contract
  const memberCard = m.contract("MemberCard", []);

  return { memberCard };
});

export default MemberCardModule;