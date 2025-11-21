import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PointTokenModule = buildModule("PointTokenModule", (m) => {
  // Parameters
  const owner = m.getParameter("owner", "0x0000000000000000000000000000000000000000");
  const name = m.getParameter("name", "Point Token");
  const symbol = m.getParameter("symbol", "POINT");
  const initBlockNumber = m.getParameter("initBlockNumber", 0);
  const duration = m.getParameter("duration", 10);
  const size = m.getParameter("size", 10);
  const safe = m.getParameter("safe", false);
  const initialSupply = m.getParameter("initialSupply", 1000000n * 10n ** 18n);

  // Deploy PointToken
  const pointToken = m.contract("PointToken", [
    name,
    symbol,
    initBlockNumber,
    duration,
    size,
    safe,
    owner,
  ]);

  // Mint initial supply
  m.call(pointToken, "mint", [owner, initialSupply]);

  return { pointToken };
});

export default PointTokenModule;