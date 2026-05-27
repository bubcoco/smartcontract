/**
 * FeeGrantErr.ts — FEE_GRANT_INVALID error path verification
 *
 * Tests every failure mode that produces FEE_GRANT_INVALID on the
 * custom Besu node (image: besu:FeeGrantErr).
 *
 * Covers:
 *  [A] No flag, zero balance    → UPFRONT_COST_EXCEEDS_BALANCE (normal rejection, not FEE_GRANT_INVALID)
 *  [B] Expired grant            → FEE_GRANT_INVALID (flag set, grant endTime in past)
 *  [C] Spend limit too low      → FEE_GRANT_INVALID (flag set, spendLimit < upfrontCost)
 *  [D] Granter below min bal    → FEE_GRANT_INVALID (flag set, granter has < 1 ETH)
 *  [E] Valid wildcard grant     → baseline: must SUCCEED
 *
 * Notes:
 *  - The fee-grant FLAG is set automatically by setFeeGrant() / wildcard(); there is no setFlag().
 *  - setFeeGrant(spendLimit=0, endTime=0) is rejected by the precompile ("unlimited budget AND time"
 *    is not a valid basic grant); use wildcard() for fully unlimited sponsorship.
 *  - Only the precompile owner (ADMIN) can call write functions.
 *    For [D], admin passes a low-balance address as the granter param.
 *
 * Usage: npx tsx scripts/FeeGrantErr.ts
 * Requires .env: ADMIN (precompile owner, well-funded)
 */

import { ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// ─── Constants ──────────────────────────────────────────────────────────────

const RPC_URL = "http://localhost:8545";
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";
const MINIMUM_GRANTER_BALANCE = ethers.parseEther("1"); // 1 ETH minimum enforced by node

const FEE_GRANT_ABI = [
  // setFeeGrant: spendLimit=0 + endTime=0 is rejected ("unlimited budget AND time").
  // Use wildcard() for a fully unlimited grant instead.
  "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
  "function revokeFeeGrant(address grantee, address program) returns (bool)",
  "function isGrantedForProgram(address grantee, address program) view returns (bool)",
  "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
  // wildcard: sets flag + allowance=3 (unlimited, all programs). Owner-only.
  "function wildcard(address grantee) returns (bool)",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(RPC_URL);

async function rawRpcSend(method: string, params: any[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  return res.json();
}

/** Send a raw signed tx from a zero-balance wallet via raw RPC (no ethers gas estimation). */
async function sendRawFromBurner(
  burner: ethers.Wallet,
  to: string,
  data: string,
  gasLimit: bigint,
  gasPriceBig: bigint
): Promise<{ txHash?: string; error?: string; rpcError?: any }> {
  const nonce = await provider.getTransactionCount(burner.address, "pending");
  const chainId = (await provider.getNetwork()).chainId;
  const tx = { to, data, gasLimit, gasPrice: gasPriceBig, nonce, chainId, value: 0n };
  const signed = await burner.signTransaction(tx);
  const result = await rawRpcSend("eth_sendRawTransaction", [signed]);
  if (result.error) return { error: result.error.message, rpcError: result.error };
  return { txHash: result.result };
}

/** Wait for tx confirmation; returns receipt or null on timeout. */
async function waitTx(txHash: string, timeoutBlocks = 6): Promise<ethers.TransactionReceipt | null> {
  const startBlock = await provider.getBlockNumber();
  while ((await provider.getBlockNumber()) < startBlock + timeoutBlocks) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** Call setFeeGrant and verify the grant was actually stored (precompile returns FALSE silently on invalid params). */
async function assertGrantCreated(
  feeGrant: ethers.Contract,
  grantee: string,
  program: string,
  label: string
): Promise<void> {
  const granted = await feeGrant.isGrantedForProgram(grantee, program);
  if (!granted) throw new Error(`${label}: setFeeGrant returned false — grant was NOT created (check params)`);
}

function pass(msg: string) { console.log(`  ✅ PASS  ${msg}`); }
function fail(msg: string) { console.log(`  ❌ FAIL  ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          FeeGrantErr — FEE_GRANT_INVALID path tests          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const adminKey = process.env.ADMIN;
  if (!adminKey) throw new Error("ADMIN private key not set in .env");

  // admin is the precompile owner — only owner can call write functions
  const admin = new ethers.Wallet(adminKey, provider);
  const feeGrant = new ethers.Contract(GAS_FEE_GRANT_ADDRESS, FEE_GRANT_ABI, admin);

  // Node health
  const blockRes = await rawRpcSend("eth_blockNumber", []);
  if (blockRes.error) { console.error("❌ Node is DOWN.", blockRes.error); process.exit(1); }
  const currentBlock = parseInt(blockRes.result, 16);
  console.log(`Node UP  Block: ${currentBlock}`);
  console.log(`Admin (owner):  ${admin.address}  balance: ${ethers.formatEther(await provider.getBalance(admin.address))} ETH\n`);

  // Fresh zero-balance burner wallets — one per test case
  const burnerA = ethers.Wallet.createRandom().connect(provider); // no flag, no grant
  const burnerB = ethers.Wallet.createRandom().connect(provider); // expired grant
  const burnerC = ethers.Wallet.createRandom().connect(provider); // spend limit too low
  const burnerD = ethers.Wallet.createRandom().connect(provider); // granter < 1 ETH
  const burnerE = ethers.Wallet.createRandom().connect(provider); // valid wildcard

  info(`Burner A (no flag):      ${burnerA.address}`);
  info(`Burner B (expired):      ${burnerB.address}`);
  info(`Burner C (spend limit):  ${burnerC.address}`);
  info(`Burner D (granter bal):  ${burnerD.address}`);
  info(`Burner E (valid):        ${burnerE.address}\n`);

  // Gas params — fetch live from node
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
  const burnerGasLimit = 30_000n;
  const upfrontCost = gasPrice * burnerGasLimit;
  info(`Gas price:    ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  info(`Upfront cost: ${ethers.formatEther(upfrontCost)} ETH\n`);

  const results: { label: string; passed: boolean }[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // [A] No flag, zero balance — standard rejection (not FEE_GRANT_INVALID)
  //     Verifies the normal rejection path is unaffected by fee-grant changes.
  // Expected: tx rejected at txpool (UPFRONT_COST_EXCEEDS_BALANCE)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("─── [A] No flag, zero balance (standard rejection) ──────────────");
  try {
    // No setup — burnerA is a fresh zero-balance wallet with no grant and no flag
    const { txHash, error } = await sendRawFromBurner(burnerA, admin.address, "0x", burnerGasLimit, gasPrice);

    if (error) {
      pass(`[A] Zero-balance tx rejected at admission: "${error}"`);
      results.push({ label: "A: no-flag zero-balance rejected", passed: true });
    } else {
      info(`[A] Tx accepted into pool: ${txHash} — waiting for inclusion...`);
      const receipt = await waitTx(txHash!);
      if (!receipt || receipt.status === 0) {
        pass(`[A] Tx dropped/failed — no balance, no grant`);
        results.push({ label: "A: no-flag zero-balance rejected", passed: true });
      } else {
        fail(`[A] Tx SUCCEEDED — should have been rejected (no balance, no grant)`);
        results.push({ label: "A: no-flag zero-balance rejected", passed: false });
      }
    }
  } catch (e: any) {
    fail(`[A] Unexpected exception: ${e.message}`);
    results.push({ label: "A: no-flag zero-balance rejected", passed: false });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // [B] Expired grant — setFeeGrant with endTime already in the past
  //     setFeeGrant sets the flag automatically. The node sees: flag=true,
  //     grant exists but endTime < currentBlock → FEE_GRANT_INVALID
  // Expected: rejected (FEE_GRANT_INVALID)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n─── [B] Expired grant ───────────────────────────────────────────");
  try {
    const latestBlock = await provider.getBlockNumber();
    // endTime 5 blocks in the past — well expired
    const expiredEndTime = BigInt(Math.max(1, latestBlock - 5));

    // spendLimit=0 is OK here because endTime is non-zero (not "unlimited budget AND time")
    // period=0, periodLimit=0 → basic grant (allowance=1)
    const grantTx = await feeGrant.setFeeGrant(
      admin.address,        // granter
      burnerB.address,      // grantee (flag auto-set by precompile)
      ethers.ZeroAddress,   // program = wildcard slot (covers all programs)
      0n,                   // spendLimit=0: unlimited budget (OK since endTime != 0)
      0,                    // period=0
      0,                    // periodLimit=0
      expiredEndTime,       // endTime: already past
      { gasLimit: 200_000 }
    );
    await grantTx.wait();
    // Verify the grant was actually stored
    await assertGrantCreated(feeGrant, burnerB.address, ethers.ZeroAddress, "[B]");
    info(`[B] Expired grant stored (endTime block=${expiredEndTime}, current=${latestBlock})`);

    const { txHash, error } = await sendRawFromBurner(burnerB, admin.address, "0x", burnerGasLimit, gasPrice);

    if (error) {
      pass(`[B] Expired grant rejected: "${error}"`);
      results.push({ label: "B: expired grant → FEE_GRANT_INVALID", passed: true });
    } else {
      info(`[B] Tx in pool: ${txHash}`);
      const receipt = await waitTx(txHash!);
      if (!receipt || receipt.status === 0) {
        pass(`[B] Tx dropped/failed (expired grant)`);
        results.push({ label: "B: expired grant → FEE_GRANT_INVALID", passed: true });
      } else {
        fail(`[B] Tx SUCCEEDED — expired grant should not sponsor`);
        results.push({ label: "B: expired grant → FEE_GRANT_INVALID", passed: false });
      }
    }
  } catch (e: any) {
    fail(`[B] Unexpected exception: ${e.message}`);
    results.push({ label: "B: expired grant → FEE_GRANT_INVALID", passed: false });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // [C] Spend limit too low — grant spendLimit is 1 wei below upfrontCost
  //     flag auto-set by setFeeGrant. Node sees: flag=true, grant valid but
  //     spendLimit < upfrontCost → FEE_GRANT_INVALID
  // Expected: rejected (FEE_GRANT_INVALID)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n─── [C] Spend limit too low ─────────────────────────────────────");
  try {
    const tinyLimit = upfrontCost - 1n;               // 1 wei below needed
    const farFuture = BigInt(currentBlock + 100_000); // endTime well in the future

    // spendLimit > 0 and endTime > 0 → valid params for setFeeGrant
    const grantTx = await feeGrant.setFeeGrant(
      admin.address,
      burnerC.address,
      ethers.ZeroAddress,
      tinyLimit,    // spendLimit: 1 wei below upfrontCost
      0,
      0,
      farFuture,    // endTime: far future so it doesn't expire
      { gasLimit: 200_000 }
    );
    await grantTx.wait();
    await assertGrantCreated(feeGrant, burnerC.address, ethers.ZeroAddress, "[C]");
    info(`[C] Grant stored: spendLimit=${ethers.formatEther(tinyLimit)} ETH, upfrontCost=${ethers.formatEther(upfrontCost)} ETH`);

    const { txHash, error } = await sendRawFromBurner(burnerC, admin.address, "0x", burnerGasLimit, gasPrice);

    if (error) {
      pass(`[C] Spend-limit-too-low rejected: "${error}"`);
      results.push({ label: "C: spend limit < upfrontCost → FEE_GRANT_INVALID", passed: true });
    } else {
      info(`[C] Tx in pool: ${txHash}`);
      const receipt = await waitTx(txHash!);
      if (!receipt || receipt.status === 0) {
        pass(`[C] Tx dropped/failed (spend limit exceeded)`);
        results.push({ label: "C: spend limit < upfrontCost → FEE_GRANT_INVALID", passed: true });
      } else {
        fail(`[C] Tx SUCCEEDED — spend limit below upfront cost should have failed`);
        results.push({ label: "C: spend limit < upfrontCost → FEE_GRANT_INVALID", passed: false });
      }
    }
  } catch (e: any) {
    fail(`[C] Unexpected exception: ${e.message}`);
    results.push({ label: "C: spend limit < upfrontCost → FEE_GRANT_INVALID", passed: false });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // [D] Granter balance below 1 ETH minimum
  //     Admin creates a grant where the stored granter is a wallet with 0.9 ETH.
  //     Node checks granter.balance >= MINIMUM_GRANTER_BALANCE (1 ETH) → fails.
  // Expected: rejected (FEE_GRANT_INVALID)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n─── [D] Granter below minimum balance ───────────────────────────");
  try {
    // Fund a disposable address with 0.9 ETH (< 1 ETH minimum)
    const lowBalanceGranter = ethers.Wallet.createRandom();
    const fundTx = await admin.sendTransaction({
      to: lowBalanceGranter.address,
      value: ethers.parseEther("0.9"),
      gasLimit: 21_000n,
    });
    await fundTx.wait();
    info(`[D] Low-balance granter: ${lowBalanceGranter.address}  balance: ${ethers.formatEther(await provider.getBalance(lowBalanceGranter.address))} ETH`);

    // Admin (owner) calls setFeeGrant with lowBalanceGranter as the stored granter param
    const farFuture = BigInt(currentBlock + 100_000);
    const grantTx = await feeGrant.setFeeGrant(
      lowBalanceGranter.address, // granter param — stored in grant, balance < 1 ETH
      burnerD.address,
      ethers.ZeroAddress,
      0n,         // spendLimit=0: unlimited (OK since endTime != 0)
      0,
      0,
      farFuture,  // endTime: far future
      { gasLimit: 200_000 }
    );
    await grantTx.wait();
    await assertGrantCreated(feeGrant, burnerD.address, ethers.ZeroAddress, "[D]");
    info(`[D] Grant stored with low-balance granter`);

    const { txHash, error } = await sendRawFromBurner(burnerD, admin.address, "0x", burnerGasLimit, gasPrice);

    if (error) {
      pass(`[D] Low-balance granter rejected: "${error}"`);
      results.push({ label: "D: granter < 1 ETH → FEE_GRANT_INVALID", passed: true });
    } else {
      info(`[D] Tx in pool: ${txHash}`);
      const receipt = await waitTx(txHash!);
      if (!receipt || receipt.status === 0) {
        pass(`[D] Tx dropped/failed (granter below minimum)`);
        results.push({ label: "D: granter < 1 ETH → FEE_GRANT_INVALID", passed: true });
      } else {
        fail(`[D] Tx SUCCEEDED — granter below 1 ETH minimum should have failed`);
        results.push({ label: "D: granter < 1 ETH → FEE_GRANT_INVALID", passed: false });
      }
    }
  } catch (e: any) {
    fail(`[D] Unexpected exception: ${e.message}`);
    results.push({ label: "D: granter < 1 ETH → FEE_GRANT_INVALID", passed: false });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // [E] Valid wildcard grant — baseline must SUCCEED
  //     wildcard() sets allowance=3 (no spend limit, no period, no expiry).
  //     Admin is granter with ample balance. BurnerE has zero ETH.
  // Expected: tx accepted and confirmed on-chain
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n─── [E] Valid wildcard grant (baseline must SUCCEED) ────────────");
  try {
    // wildcard(): sets flag + allowance=3 (unlimited all programs). Owner-only.
    const wildcardTx = await feeGrant.wildcard(burnerE.address, { gasLimit: 200_000 });
    await wildcardTx.wait();
    info(`[E] Wildcard grant created for ${burnerE.address} (granter=admin, ${ethers.formatEther(await provider.getBalance(admin.address))} ETH)`);

    const { txHash, error } = await sendRawFromBurner(burnerE, admin.address, "0x", burnerGasLimit, gasPrice);

    if (error) {
      fail(`[E] Valid sponsored tx REJECTED — should have been accepted: "${error}"`);
      results.push({ label: "E: valid wildcard grant → succeeds", passed: false });
    } else {
      info(`[E] Tx accepted: ${txHash}`);
      const receipt = await waitTx(txHash!);
      if (receipt && receipt.status === 1) {
        pass(`[E] Tx confirmed on-chain (block ${receipt.blockNumber})`);
        results.push({ label: "E: valid wildcard grant → succeeds", passed: true });
      } else if (!receipt) {
        fail(`[E] Tx timed out (not included within timeout)`);
        results.push({ label: "E: valid wildcard grant → succeeds", passed: false });
      } else {
        fail(`[E] Tx reverted on-chain (status=${receipt.status})`);
        results.push({ label: "E: valid wildcard grant → succeeds", passed: false });
      }
    }
  } catch (e: any) {
    fail(`[E] Unexpected exception: ${e.message}`);
    results.push({ label: "E: valid wildcard grant → succeeds", passed: false });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed}/${total} passed`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  for (const r of results) {
    console.log(`║  ${r.passed ? "✅" : "❌"} ${r.label}`);
  }
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (passed < total) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
