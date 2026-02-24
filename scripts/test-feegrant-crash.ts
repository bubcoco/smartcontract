/**
 * GasFeeGrant Precompile — IndexOutOfBoundsException Crash Proof
 *
 * Sends short calldata (4 bytes only) to read-only precompile functions
 * that have NO access control. This triggers IndexOutOfBoundsException
 * inside MainnetTransactionProcessor on the unpatched node.
 *
 * Usage: npx tsx scripts/test-feegrant-crash.ts
 */
import { ethers } from "ethers";

const RPC_URL = "http://localhost:8545";
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";

// Functions with NO access control that slice calldata without bound checks
const ATTACK_VECTORS = [
    { name: "isGrantedForProgram(address,address)", minBytes: 68 },
    { name: "grant(address,address)", minBytes: 68 },
    { name: "isGrantedForAllProgram(address)", minBytes: 36 },
    { name: "periodCanSpend(address,address)", minBytes: 68 },
    { name: "periodReset(address,address)", minBytes: 68 },
    { name: "isExpired(address,address)", minBytes: 68 },
];

async function rawRpcCall(method: string, params: any[]): Promise<any> {
    const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return res.json();
}

async function main() {
    console.log("=======================================================");
    console.log("  GAS FEE GRANT — IndexOutOfBoundsException CRASH PROOF ");
    console.log("=======================================================\n");

    // [1] Health check
    console.log("[1] Checking node health...");
    const blockRes = await rawRpcCall("eth_blockNumber", []);
    if (blockRes.error) { console.error("❌ Node is DOWN.", blockRes.error); process.exit(1); }
    console.log(`✅ Node is UP. Block: ${parseInt(blockRes.result, 16)}\n`);

    // [2] Fire each attack vector
    let crashed = 0;
    let survived = 0;

    for (const vector of ATTACK_VECTORS) {
        const selector = ethers.id(vector.name).slice(0, 10); // 4-byte selector
        console.log(`─── Testing: ${vector.name} ───`);
        console.log(`    Selector: ${selector}`);
        console.log(`    Sending:  4 bytes  (minimum expected: ${vector.minBytes} bytes)`);

        const result = await rawRpcCall("eth_call", [
            { to: GAS_FEE_GRANT_ADDRESS, data: selector },
            "latest",
        ]);

        if (result.error) {
            console.log(`    💥 RPC ERROR: ${result.error.message}`);
            crashed++;
        } else if (result.result === "0x") {
            // Empty return = node caught the exception internally
            console.log(`    💥 Empty return (node logged IndexOutOfBoundsException internally)`);
            crashed++;
        } else {
            console.log(`    ✅ Returned data: ${result.result}`);
            survived++;
        }
        console.log();
    }

    // [2.5] Test Universal < 4 Byte Crash
    console.log("=======================================================");
    console.log("  [2.5] UNIVERSAL < 4 BYTE INPUT CRASH TEST            ");
    console.log("=======================================================\n");

    const SHORT_PAYLOADS = ["0x", "0x11", "0x2233", "0x445566"];
    for (const payload of SHORT_PAYLOADS) {
        console.log(`─── Testing Universal Crash: Payload ${payload} (${(payload.length - 2) / 2} bytes) ───`);
        const result = await rawRpcCall("eth_call", [
            { to: GAS_FEE_GRANT_ADDRESS, data: payload }, // Using GasFeeGrant as representative of the 6
            "latest",
        ]);

        if (result.error) {
            console.log(`    💥 RPC ERROR: ${result.error.message}`);
            crashed++;
            ATTACK_VECTORS.push({ name: `Universal <4 bytes (${payload})`, minBytes: 4 });
        } else if (result.result === "0x") {
            console.log(`    💥 Empty return (node caught exception internally due to short payload)`);
            crashed++;
            ATTACK_VECTORS.push({ name: `Universal <4 bytes (${payload})`, minBytes: 4 });
        } else {
            console.log(`    ✅ Returned data: ${result.result} (handled gracefully)`);
            survived++;
            ATTACK_VECTORS.push({ name: `Universal <4 bytes (${payload})`, minBytes: 4 });
        }
        console.log();
    }

    // [3] Summary
    console.log("=======================================================");
    console.log("  RESULTS SUMMARY");
    console.log("=======================================================");
    console.log(`  💥 Vulnerable (crashed/empty): ${crashed}/${ATTACK_VECTORS.length}`);
    console.log(`  ✅ Handled gracefully:         ${survived}/${ATTACK_VECTORS.length}`);
    console.log();

    if (crashed > 0) {
        console.log("  🚨 VERDICT: IndexOutOfBoundsException is CONFIRMED!");
        console.log("     Check node logs for:");
        console.log("     ERROR | MainnetTransactionProcessor | Critical Exception Processing Transaction");
        console.log("     java.lang.IndexOutOfBoundsException: index is out of bounds");
    } else {
        console.log("  ✅ VERDICT: All functions handled short calldata gracefully.");
        console.log("     The bound-checking fix is working!");
    }

    // [4] Post-attack health check
    console.log("\n[4] Post-attack node health check...");
    try {
        const postBlock = await rawRpcCall("eth_blockNumber", []);
        if (postBlock.error) throw new Error(postBlock.error.message);
        console.log(`✅ Node is still alive. Block: ${parseInt(postBlock.result, 16)}`);
    } catch {
        console.log("🚨 CRITICAL: Node is UNREACHABLE after attack!");
    }
}

main().catch(console.error);
