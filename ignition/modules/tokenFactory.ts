import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TokenFactoryModule = buildModule("GameToken", (m) => {
  // Constructor parameters
  const gameAdmins = m.getParameter("gameAdmins", true);

  // Deploy the NFT contract
  const gameToken = m.contract("GameToken", [
    
  ]);

  return { gameToken };
});

export default TokenFactoryModule;