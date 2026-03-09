import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VaultModule = buildModule("VaultModule", (m) => {
    // THB token address must be provided - no sensible default
    const thbToken = m.getParameter("thbToken");

    const vault = m.contract("Vault", [thbToken]);

    return { vault };
});

export default VaultModule;
