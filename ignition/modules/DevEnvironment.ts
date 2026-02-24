import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DevEnvironmentModule = buildModule("DevEnvironmentModule", (m) => {
    // 1. Deploy Mocks
    const mockTHB = m.contract("MockTHB", []);
    const mockCoupon = m.contract("MockCoupon", []);

    // 2. Deploy Vault (requires payment token)
    const mockVault = m.contract("MockVault", [mockTHB]);

    // 3. Deploy Marketplace (requires THB, Coupon, Vault)
    const marketplace = m.contract("Marketplace", [mockTHB, mockCoupon, mockVault]);

    // 4. Deploy ContractFactory2 (for Fee Grant tests)
    const contractFactory2 = m.contract("ContractFactory2", []);

    return {
        mockTHB,
        mockCoupon,
        mockVault,
        marketplace,
        contractFactory2
    };
});

export default DevEnvironmentModule;
