import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const THBModule = buildModule("THBModule", (m) => {
    const name = m.getParameter("name", "Thai Baht Token");
    const symbol = m.getParameter("symbol", "THB");
    const decimals = m.getParameter("decimals", 2);

    const thb = m.contract("THB", [name, symbol, decimals]);

    return { thb };
});

export default THBModule;
