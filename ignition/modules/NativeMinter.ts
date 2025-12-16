import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NativeMinterModule", (m) => {
  const precompiled = "0x0000000000000000000000000000000000001001";
  const admin = "0x538e4A82BE01D1C06760488F15B3064da955EDA4";

  const nativeMinter = m.contract("MockNativeMinter", [precompiled, admin]);

  return { nativeMinter };
});
