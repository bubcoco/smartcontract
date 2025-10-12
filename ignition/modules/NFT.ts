import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const NFTModule = buildModule("NFT", (m) => {
  // Constructor parameters
  const currencyAddress = m.getParameter("currencyAddress", "0x0000000000000000000000000000000000000000");
  const baseTokenURI = m.getParameter("baseTokenURI", "ipfs://");
  const royaltyFeesInBips = m.getParameter("royaltyFeesInBips", 500); // 5% default
  const subId = m.getParameter("subId", 1);

  // Deploy the NFT contract
  const nft = m.contract("NFT", [
    currencyAddress,
    baseTokenURI,
    royaltyFeesInBips,
    subId,
  ]);

  return { nft };
});

export default NFTModule;