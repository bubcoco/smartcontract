import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CouponModule = buildModule("CouponModule", (m) => {
    const tokenName = m.getParameter("tokenName", "Coupon");
    const tokenSymbol = m.getParameter("tokenSymbol", "CPN");

    const coupon = m.contract("Coupon", [tokenName, tokenSymbol]);

    return { coupon };
});

export default CouponModule;
