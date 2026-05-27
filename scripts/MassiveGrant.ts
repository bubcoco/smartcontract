/**
 * Massive GasFeeGrant Stress Test
 *
 * Tests 20,000 fresh random grantees against the custom Besu fee-grant precompile.
 *
 * Test Scenarios:
 *   1. ADMIN wildcard grant: env.ADMIN grants 20,000 fresh zero-balance wallets.
 *   2. ATM contract granter: deploy MassiveGrantATM, mint native coin to it through
 *      NativeMinterPrecompile, then store ATM as the fee payer for 20,000 fresh wallets.
 *   3. Every fresh wallet sends sponsored transactions:
 *      - native transfer
 *      - smart contract interaction: MassiveGrantATM.ping(uint256)
 *
 * Usage:
 *   npx hardhat compile
 *   npx tsx scripts/MassiveGrant.ts
 *
 * Useful smaller dry runs:
 *   npx tsx scripts/MassiveGrant.ts --count 100 --phase admin --exercise both
 *   npx tsx scripts/MassiveGrant.ts --count 100 --phase atm --exercise both
 *
 * Full options:
 *   --count <n>               default: 20000
 *   --phase admin|atm|both    default: both
 *   --exercise transfer|interact|alternate|both  default: both
 *   --grantBatchSize <n>      default: 250
 *   --txBatchSize <n>         default: 250
 *   --rpcConcurrency <n>      default: 50
 */

import { ethers as Ethers } from "ethers";
import { config as dotenvConfig } from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "../.env") });

// ===================== CONFIG =====================
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const NATIVE_MINTER_ADDRESS = "0x0000000000000000000000000000000000001001";
const GAS_FEE_GRANT_ADDRESS = "0x0000000000000000000000000000000000001006";
const ZERO_ADDRESS = Ethers.ZeroAddress;

// ===================== ABI =====================
const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function initialized() view returns (uint256)",
  "function initializeOwner(address) returns (bool)",
  "function transferOwnership(address) returns (bool)",
];

const NATIVE_MINTER_ABI = [
  ...OWNABLE_ABI,
  "function mint(address to, uint256 amount) returns (bool)",
];

const GAS_FEE_GRANT_ABI = [
  ...OWNABLE_ABI,
  "function setFeeGrant(address granter, address grantee, address program, uint256 spendLimit, uint32 period, uint256 periodLimit, uint256 endTime) returns (bool)",
  "function revokeFeeGrant(address grantee, address program) returns (bool)",
  "function isGrantedForProgram(address grantee, address program) view returns (bool)",
  "function isGrantedForAllProgram(address grantee) view returns (bool)",
  "function grant(address grantee, address program) view returns (bytes32 granter, uint256 allowance, uint256 spendLimit, uint256 periodLimit, uint256 periodCanSpend, uint256 startTime, uint256 endTime, uint256 latestTransaction, uint256 period)",
  "function wildcard(address grantee) returns (bool)",
];

const ATM_ABI = [
  "function ping(uint256 id) returns (uint256)",
  "function balance() view returns (uint256)",
  "function totalPings() view returns (uint256)",
];

type Phase = "admin" | "atm" | "both";
type ExerciseMode = "transfer" | "interact" | "alternate" | "both";

type ScriptOptions = {
  count: number;
  phase: Phase;
  exercise: ExerciseMode;
  grantBatchSize: number;
  txBatchSize: number;
  rpcConcurrency: number;
  rpcRetries: number;
  grantGasLimit: bigint;
  transferGasLimit: bigint;
  interactGasLimit: bigint;
  confirmations: number;
  futureBlocks: bigint;
  atmMintEth: string;
  stopOnFirstFailure: boolean;
};

type SentTx = {
  label: string;
  hash?: string;
  error?: string;
};

type ExerciseStats = {
  sent: number;
  accepted: number;
  confirmed: number;
  failed: number;
  rejected: number;
};

type LocalWallet = Ethers.Wallet | Ethers.HDNodeWallet;

const provider = new Ethers.JsonRpcProvider(RPC_URL);
const gasFeeGrantInterface = new Ethers.Interface(GAS_FEE_GRANT_ABI);
const atmInterface = new Ethers.Interface(ATM_ABI);

// ===================== HELPERS =====================

function section(title: string) {
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(title);
  console.log("═══════════════════════════════════════════════════════════════════\n");
}

function pass(name: string, detail?: string) {
  console.log(`   ✅ PASS: ${name}${detail ? " — " + detail : ""}`);
}

function fail(name: string, detail?: string) {
  console.log(`   ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
}

function parseArgs(): ScriptOptions {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const current = process.argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  return {
    count: Number(args.count || process.env.MASSIVE_GRANT_COUNT || 20_000),
    phase: String(args.phase || process.env.MASSIVE_GRANT_PHASE || "both") as Phase,
    exercise: String(args.exercise || process.env.MASSIVE_GRANT_EXERCISE || "both") as ExerciseMode,
    grantBatchSize: Number(args.grantBatchSize || process.env.MASSIVE_GRANT_BATCH || 250),
    txBatchSize: Number(args.txBatchSize || process.env.MASSIVE_TX_BATCH || 250),
    rpcConcurrency: Number(args.rpcConcurrency || process.env.MASSIVE_RPC_CONCURRENCY || 50),
    rpcRetries: Number(args.rpcRetries || process.env.MASSIVE_RPC_RETRIES || 5),
    grantGasLimit: BigInt(String(args.grantGasLimit || process.env.MASSIVE_GRANT_GAS || 220_000)),
    transferGasLimit: BigInt(String(args.transferGasLimit || process.env.MASSIVE_TRANSFER_GAS || 21_000)),
    interactGasLimit: BigInt(String(args.interactGasLimit || process.env.MASSIVE_INTERACT_GAS || 90_000)),
    confirmations: Number(args.confirmations || process.env.MASSIVE_CONFIRMATIONS || 1),
    futureBlocks: BigInt(String(args.futureBlocks || process.env.MASSIVE_FUTURE_BLOCKS || 1_000_000)),
    atmMintEth: String(args.atmMintEth || process.env.MASSIVE_ATM_MINT_ETH || "1000"),
    stopOnFirstFailure: Boolean(args.stopOnFirstFailure || process.env.MASSIVE_STOP_ON_FAIL),
  };
}

function assertValidOptions(options: ScriptOptions) {
  if (!Number.isInteger(options.count) || options.count <= 0) throw new Error("--count must be a positive integer");
  if (!["admin", "atm", "both"].includes(options.phase)) throw new Error("--phase must be admin, atm, or both");
  if (!["transfer", "interact", "alternate", "both"].includes(options.exercise)) {
    throw new Error("--exercise must be transfer, interact, alternate, or both");
  }
  if (options.grantBatchSize <= 0 || options.txBatchSize <= 0) throw new Error("batch sizes must be positive");
  if (options.rpcConcurrency <= 0 || options.rpcRetries < 0) throw new Error("rpcConcurrency must be positive and rpcRetries must be >= 0");
}

function formatEth(value: bigint): string {
  return Ethers.formatEther(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientRpcError(error: any): boolean {
  const message = `${error?.message || ""} ${error?.cause?.code || ""}`.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("und_err_socket") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("socket") ||
    message.includes("closed")
  );
}

async function rawRpc(method: string, params: any[], retries = 5): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: `${Date.now()}-${Math.random()}`, method, params }),
      });
      return res.json();
    } catch (error: any) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt === retries) break;
      await sleep(100 * (attempt + 1));
    }
  }
  throw lastError;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function ensurePrecompileOwner(contract: Ethers.Contract, admin: Ethers.Wallet, label: string) {
  const initialized = await contract.initialized();
  if (initialized === 0n) {
    const tx = await contract.initializeOwner(admin.address, { gasLimit: 100_000n });
    await tx.wait(1);
    console.log(`[setup] initialized ${label} owner to ${admin.address}`);
  }

  const ownerRaw = await contract.owner();
  const owner = Ethers.getAddress(`0x${String(ownerRaw).slice(-40)}`);
  if (owner.toLowerCase() !== admin.address.toLowerCase()) {
    throw new Error(`${label} owner is ${owner}, expected ADMIN ${admin.address}`);
  }
}

async function waitForReceipts(hashes: SentTx[], confirmations: number): Promise<{ confirmed: number; failed: number }> {
  let confirmed = 0;
  let failed = 0;
  await Promise.all(
    hashes
      .filter((item) => item.hash)
      .map(async (item) => {
        try {
          const receipt = await provider.waitForTransaction(item.hash!, confirmations, 180_000);
          if (receipt && receipt.status === 1) confirmed += 1;
          else failed += 1;
        } catch (error: any) {
          failed += 1;
          console.log(`[wait] ${item.label} ${item.hash} failed waiting: ${error.message}`);
        }
      })
  );
  return { confirmed, failed };
}

async function signAndSend(
  wallet: LocalWallet,
  tx: {
    to: string;
    data: string;
    gasLimit: bigint;
    gasPrice: bigint;
    nonce: number;
    chainId: bigint;
    value?: bigint;
  },
  label: string,
  rpcRetries = 5
): Promise<SentTx> {
  try {
    const signed = await wallet.signTransaction({
      to: tx.to,
      data: tx.data,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
      nonce: tx.nonce,
      chainId: tx.chainId,
      value: tx.value ?? 0n,
    });
    const result = await rawRpc("eth_sendRawTransaction", [signed], rpcRetries);
    if (result.error) return { label, error: result.error.message };
    return { label, hash: result.result };
  } catch (error: any) {
    return { label, error: error?.message || String(error) };
  }
}

async function sendAdminGrantBatch(
  admin: Ethers.Wallet,
  payloads: { label: string; data: string }[],
  startNonce: number,
  chainId: bigint,
  gasPrice: bigint,
  gasLimit: bigint,
  confirmations: number,
  rpcConcurrency: number,
  rpcRetries: number
): Promise<{ nextNonce: number; accepted: number; confirmed: number; failed: number; rejected: number }> {
  const sent = await mapWithConcurrency(
    payloads,
    rpcConcurrency,
    (payload, index) =>
      signAndSend(
        admin,
        {
          to: GAS_FEE_GRANT_ADDRESS,
          data: payload.data,
          gasLimit,
          gasPrice,
          nonce: startNonce + index,
          chainId,
        },
        payload.label,
        rpcRetries
      )
  );

  const rejected = sent.filter((item) => item.error).length;
  for (const item of sent.filter((entry) => entry.error).slice(0, 5)) {
    console.log(`[grant rejected] ${item.label}: ${item.error}`);
  }

  const wait = await waitForReceipts(sent, confirmations);
  return {
    nextNonce: startNonce + payloads.length,
    accepted: sent.length - rejected,
    confirmed: wait.confirmed,
    failed: wait.failed,
    rejected,
  };
}

async function createWallets(count: number, label: string): Promise<LocalWallet[]> {
  console.log(`   Generating ${count} fresh random grantees for ${label}...`);
  const wallets: LocalWallet[] = [];
  for (let i = 0; i < count; i++) wallets.push(Ethers.Wallet.createRandom().connect(provider));
  console.log(`   Generated ${wallets.length} wallets`);
  console.log(`   First: ${wallets[0].address}`);
  console.log(`   Last:  ${wallets[wallets.length - 1].address}`);
  return wallets;
}

async function grantAdminWildcard(
  admin: Ethers.Wallet,
  wallets: LocalWallet[],
  options: ScriptOptions,
  chainId: bigint,
  gasPrice: bigint
) {
  section("Step 2A: ADMIN wildcard grants");
  console.log(`   Grantees: ${wallets.length}`);
  console.log(`   Granter:  ADMIN (${admin.address})`);
  console.log(`   Method:   wildcard(address)\n`);
  let nonce = await provider.getTransactionCount(admin.address, "pending");
  let accepted = 0;
  let confirmed = 0;
  let failed = 0;
  let rejected = 0;

  for (let offset = 0; offset < wallets.length; offset += options.grantBatchSize) {
    const slice = wallets.slice(offset, offset + options.grantBatchSize);
    const payloads = slice.map((wallet, localIndex) => ({
      label: `admin-wildcard-${offset + localIndex}`,
      data: gasFeeGrantInterface.encodeFunctionData("wildcard", [wallet.address]),
    }));
    const result = await sendAdminGrantBatch(
      admin,
      payloads,
      nonce,
      chainId,
      gasPrice,
      options.grantGasLimit,
      options.confirmations,
      options.rpcConcurrency,
      options.rpcRetries
    );
    nonce = result.nextNonce;
    accepted += result.accepted;
    confirmed += result.confirmed;
    failed += result.failed;
    rejected += result.rejected;
    console.log(`   [admin-grant] ${Math.min(offset + slice.length, wallets.length)}/${wallets.length} accepted=${accepted} confirmed=${confirmed} failed=${failed} rejected=${rejected}`);
    if (options.stopOnFirstFailure && (failed > 0 || rejected > 0)) throw new Error("admin wildcard grant failure");
  }
}

async function grantAtmAsPayer(
  admin: Ethers.Wallet,
  atmAddress: string,
  wallets: LocalWallet[],
  options: ScriptOptions,
  chainId: bigint,
  gasPrice: bigint
) {
  section("Step 3A: ATM contract grants");
  console.log(`   Grantees: ${wallets.length}`);
  console.log(`   Granter:  ATM contract (${atmAddress})`);
  console.log("   Method:   setFeeGrant(ATM, grantee, address(0), spendLimit=0, endTime=future)");
  console.log("   Note:     wildcard(address) cannot set ATM as granter because wildcard stores msg.sender.\n");
  const currentBlock = await provider.getBlockNumber();
  const endBlock = BigInt(currentBlock) + options.futureBlocks;
  let nonce = await provider.getTransactionCount(admin.address, "pending");
  let accepted = 0;
  let confirmed = 0;
  let failed = 0;
  let rejected = 0;

  for (let offset = 0; offset < wallets.length; offset += options.grantBatchSize) {
    const slice = wallets.slice(offset, offset + options.grantBatchSize);
    const payloads = slice.map((wallet, localIndex) => ({
      label: `atm-grant-${offset + localIndex}`,
      data: gasFeeGrantInterface.encodeFunctionData("setFeeGrant", [
        atmAddress,
        wallet.address,
        ZERO_ADDRESS,
        0n,
        0,
        0n,
        endBlock,
      ]),
    }));
    const result = await sendAdminGrantBatch(
      admin,
      payloads,
      nonce,
      chainId,
      gasPrice,
      options.grantGasLimit,
      options.confirmations,
      options.rpcConcurrency,
      options.rpcRetries
    );
    nonce = result.nextNonce;
    accepted += result.accepted;
    confirmed += result.confirmed;
    failed += result.failed;
    rejected += result.rejected;
    console.log(`   [atm-grant] ${Math.min(offset + slice.length, wallets.length)}/${wallets.length} accepted=${accepted} confirmed=${confirmed} failed=${failed} rejected=${rejected}`);
    if (options.stopOnFirstFailure && (failed > 0 || rejected > 0)) throw new Error("ATM grant failure");
  }
}

function exerciseKinds(mode: ExerciseMode, index: number): ("transfer" | "interact")[] {
  if (mode === "both") return ["transfer", "interact"];
  if (mode === "alternate") return [index % 2 === 0 ? "transfer" : "interact"];
  return [mode];
}

async function exerciseSponsoredWallets(
  label: string,
  wallets: LocalWallet[],
  atmAddress: string,
  adminAddress: string,
  options: ScriptOptions,
  chainId: bigint,
  gasPrice: bigint
): Promise<ExerciseStats> {
  section(`Exercise sponsored transactions: ${label}`);
  console.log(`   Wallets: ${wallets.length}`);
  console.log(`   Mode:    ${options.exercise}`);
  console.log(`   Batch:   ${options.txBatchSize}\n`);
  const stats: ExerciseStats = { sent: 0, accepted: 0, confirmed: 0, failed: 0, rejected: 0 };

  const tasks: { wallet: LocalWallet; nonce: number; kind: "transfer" | "interact"; index: number }[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const kinds = exerciseKinds(options.exercise, i);
    for (let nonce = 0; nonce < kinds.length; nonce++) {
      tasks.push({ wallet: wallets[i], nonce, kind: kinds[nonce], index: i });
    }
  }

  for (let offset = 0; offset < tasks.length; offset += options.txBatchSize) {
    const slice = tasks.slice(offset, offset + options.txBatchSize);
    const sent = await mapWithConcurrency(
      slice,
      options.rpcConcurrency,
      (task) => {
        const isTransfer = task.kind === "transfer";
        return signAndSend(
          task.wallet,
          {
            to: isTransfer ? adminAddress : atmAddress,
            data: isTransfer ? "0x" : atmInterface.encodeFunctionData("ping", [task.index]),
            gasLimit: isTransfer ? options.transferGasLimit : options.interactGasLimit,
            gasPrice,
            nonce: task.nonce,
            chainId,
            value: 0n,
          },
          `${label}-${task.kind}-${task.index}`,
          options.rpcRetries
        );
      }
    );

    stats.sent += sent.length;
    const rejected = sent.filter((item) => item.error);
    stats.rejected += rejected.length;
    stats.accepted += sent.length - rejected.length;
    for (const item of rejected.slice(0, 5)) console.log(`[${label} rejected] ${item.label}: ${item.error}`);

    const wait = await waitForReceipts(sent, options.confirmations);
    stats.confirmed += wait.confirmed;
    stats.failed += wait.failed;

    console.log(`   [${label}] ${Math.min(offset + slice.length, tasks.length)}/${tasks.length} accepted=${stats.accepted} confirmed=${stats.confirmed} failed=${stats.failed} rejected=${stats.rejected}`);
    if (options.stopOnFirstFailure && (stats.failed > 0 || stats.rejected > 0)) throw new Error(`${label} exercise failure`);
  }

  return stats;
}

async function deployAtm(admin: Ethers.Wallet): Promise<Ethers.Contract> {
  section("Step 1: Deploy MassiveGrantATM");
  const artifactPath = resolve(
    __dirname,
    "../artifacts/contracts/MassiveGrantATM.sol/MassiveGrantATM.json"
  );
  let artifact: { abi: any[]; bytecode: string };
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error(`Missing MassiveGrantATM artifact at ${artifactPath}. Run: npx hardhat compile`);
  }
  const factory = new Ethers.ContractFactory(artifact.abi, artifact.bytecode, admin);
  const atm = await factory.deploy({ gasLimit: 1_500_000n });
  await atm.waitForDeployment();
  console.log(`   MassiveGrantATM deployed at ${await atm.getAddress()}`);
  return atm as unknown as Ethers.Contract;
}

async function mintNativeToAtm(admin: Ethers.Wallet, atmAddress: string, amountEth: string) {
  section("Step 3: Mint native coin to ATM");
  console.log(`   Amount: ${amountEth} ETH`);
  console.log(`   ATM:    ${atmAddress}`);
  const nativeMinter = new Ethers.Contract(NATIVE_MINTER_ADDRESS, NATIVE_MINTER_ABI, admin);
  await ensurePrecompileOwner(nativeMinter, admin, "NativeMinter");
  const before = await provider.getBalance(atmAddress);
  const tx = await nativeMinter.mint(atmAddress, Ethers.parseEther(amountEth), { gasLimit: 150_000n });
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error("NativeMinter mint tx failed");
  const after = await provider.getBalance(atmAddress);
  console.log(`   ATM balance before: ${formatEth(before)} ETH`);
  console.log(`   ATM balance after:  ${formatEth(after)} ETH`);
  console.log(`   Minted delta:       ${formatEth(after - before)} ETH`);
}

async function main() {
  const options = parseArgs();
  assertValidOptions(options);

  const adminKey = process.env.ADMIN;
  if (!adminKey) throw new Error("ADMIN private key must be set in .env");
  const admin = new Ethers.Wallet(adminKey, provider);
  const network = await provider.getNetwork();
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? Ethers.parseUnits("1", "gwei");

  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║               Massive GasFeeGrant Stress Test                     ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝\n");
  console.log(`👤 ADMIN:          ${admin.address}`);
  console.log(`🌐 RPC:            ${RPC_URL}`);
  console.log(`🔗 Chain ID:       ${network.chainId}`);
  console.log(`💰 ADMIN balance:  ${formatEth(await provider.getBalance(admin.address))} ETH`);
  console.log(`👥 Grantee count:  ${options.count}`);
  console.log(`🧪 Phase:          ${options.phase}`);
  console.log(`📨 Exercise:       ${options.exercise}`);
  console.log(`📦 Grant batch:    ${options.grantBatchSize}`);
  console.log(`📦 Tx batch:       ${options.txBatchSize}`);
  console.log(`🧵 RPC concurrent: ${options.rpcConcurrency}`);
  console.log(`🔁 RPC retries:    ${options.rpcRetries}`);
  console.log(`⛽ Gas price:      ${Ethers.formatUnits(gasPrice, "gwei")} gwei\n`);

  const gasFeeGrant = new Ethers.Contract(GAS_FEE_GRANT_ADDRESS, GAS_FEE_GRANT_ABI, admin);
  await ensurePrecompileOwner(gasFeeGrant, admin, "GasFeeGrant");

  const atm = await deployAtm(admin);
  const atmAddress = await atm.getAddress();

  const phaseStats: { label: string; stats: ExerciseStats }[] = [];

  if (options.phase === "admin" || options.phase === "both") {
    const adminWallets = await createWallets(options.count, "admin-phase");
    await grantAdminWildcard(admin, adminWallets, options, network.chainId, gasPrice);
    const stats = await exerciseSponsoredWallets("admin-phase", adminWallets, atmAddress, admin.address, options, network.chainId, gasPrice);
    phaseStats.push({ label: "ADMIN wildcard granter", stats });
  }

  if (options.phase === "atm" || options.phase === "both") {
    await mintNativeToAtm(admin, atmAddress, options.atmMintEth);
    const atmWallets = await createWallets(options.count, "atm-phase");
    await grantAtmAsPayer(admin, atmAddress, atmWallets, options, network.chainId, gasPrice);
    const stats = await exerciseSponsoredWallets("atm-phase", atmWallets, atmAddress, admin.address, options, network.chainId, gasPrice);
    phaseStats.push({ label: "ATM contract granter", stats });
  }

  console.log("\n╔════════════════════════════════════════════════════════════════════╗");
  console.log("║                         Summary                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
  for (const item of phaseStats) {
    console.log(`${item.label}: sent=${item.stats.sent} accepted=${item.stats.accepted} confirmed=${item.stats.confirmed} failed=${item.stats.failed} rejected=${item.stats.rejected}`);
  }
  console.log(`ATM address: ${atmAddress}`);
  console.log(`ATM balance: ${formatEth(await provider.getBalance(atmAddress))} ETH`);
  try {
    const totalPings = await new Ethers.Contract(atmAddress, ATM_ABI, provider).totalPings();
    console.log(`ATM totalPings: ${totalPings}`);
  } catch {}

  const totalFailures = phaseStats.reduce((sum, item) => sum + item.stats.failed + item.stats.rejected, 0);
  if (totalFailures === 0) pass("All massive grant checks passed");
  else fail("Massive grant checks failed", `${totalFailures} failed/rejected txs`);
  if (totalFailures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
