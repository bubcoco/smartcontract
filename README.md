# Smart Contract Project

This project contains smart contracts and benchmarking tools for the Private blockchain network (Besu QBFT).

## Project Overview

### Contracts
- **MemberCard** - ERC721 loyalty card with stamp system
- **ContractFactory2** - Factory for deploying ERC20, ERC721, and ERC1155 tokens
- **Token (Gems)** - ERC20 token

### Key Features
- Hardhat 3 Beta with TypeScript
- Hardhat Ignition for deployments
- Blockscout verification
- TPS benchmarking suite

---

## Quick Start

### Prerequisites
```bash
npm install
```

### Environment Setup
Create a `.env` file:
```env
PRIV_KEY=your_private_key_here
RPC_URL=http://localhost:8545
```

---

## Shell Scripts

The project includes several shell scripts for deployment and management:

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Interactive deployment script with flags for deploy, verify, and worker management |
| `deploy-all.sh` | Deploy and verify all contracts (MemberCard, ContractFactory2, Token) |
| `reset.sh` | Clear Ignition deployment cache and compiled artifacts |

### deploy.sh - Interactive Deployment

```bash
# Show help
./deploy.sh -h

# Deploy a contract
./deploy.sh -n besu -t MemberCard -D

# Verify a contract
./deploy.sh -n besu -t MemberCard -V

# Deploy and verify
./deploy.sh -n besu -t MemberCard -D -V

# With specific address
./deploy.sh -n besu -t MemberCard -a 0x... -V
```

**Flags:**
- `-n <network>` - Network name (e.g., besu)
- `-t <tags>` - Contract/module name
- `-a <address>` - Contract address (optional)
- `-p` - Is proxy contract
- `-D` - Deploy contract
- `-V` - Verify contract
- `-W` - Grant worker role
- `-B` - Grant BalanceVault worker

### deploy-all.sh - Deploy All Contracts

```bash
./deploy-all.sh
```

This script will:
1. **Phase 1**: Deploy MemberCard, ContractFactory2, and Token contracts
2. **Phase 2**: Verify all contracts on Blockscout using addresses from `deployed_addresses.json`

### reset.sh - Reset Deployment State

```bash
./reset.sh
```

Clears Ignition deployment cache and compiled artifacts.

---

## Deployment

### Manual Deployment

```bash
# Deploy individual modules
npx hardhat ignition deploy ignition/modules/MemberCard.ts --network besu
npx hardhat ignition deploy ignition/modules/ContractFactory2.ts --network besu
npx hardhat ignition deploy ignition/modules/Token.ts --network besu
```

### Verify Contracts

```bash
npx hardhat verify --network besu <CONTRACT_ADDRESS> [constructor args...]
```

---

## Deployed Addresses

After deployment, contract addresses are saved to:
```
ignition/deployments/chain-235/deployed_addresses.json
```

Example:
```json
{
  "MemberCardModule#MemberCard": "0x...",
  "ContractFactory2Module#ContractFactory2": "0x...",
  "Token#Gems": "0x..."
}
```

---

## Benchmarking

The `benchmark/` directory contains TPS benchmarking scripts for testing network throughput.

### Benchmark Scripts

| Script | Purpose | Transaction Type |
|--------|---------|------------------|
| `benchmark.ts` | High-performance TPS testing | Single (Parallel) - Native transfers + Counter.inc() |
| `benchmark2.ts` | Advanced operations | Single (Parallel) - ERC20 transfers, minting, factory creation |
| `benchmark3.ts` | Confirmation-based TPS | Single (Parallel with await) - Waits for each tx confirmation |
| `benchmark4.ts` | Sustained throughput | Single (Sequential per account) - Balance-based (10 ETH per account) |
| `benchmark5.ts` | Account Abstraction (ERC-4337) | Bundle - Simulated UserOperation bundling |
| `benchmark6.ts` | Multicall / Batching | Batch - Parallel transactions per account |
| `benchmark7.ts` | **Production Readiness Test** | Mixed - Validates nonce handling across all tx types |
| `benchmark8.ts` | **Duration-Based Stress Test** | Aggressive - Maximum TPS stress test with duration control |

### Run Benchmarks

```bash
# High-performance TPS benchmark
npx tsx benchmark/benchmark.ts

# Advanced operations (ERC20, Factory)
npx tsx benchmark/benchmark2.ts

# Confirmation-based (accurate TPS)
npx tsx benchmark/benchmark3.ts

# Balance-based sustained throughput
npx tsx benchmark/benchmark4.ts

# With fresh accounts (recommended after errors)
npx tsx benchmark/benchmark4.ts --fresh

# Clear stuck pending transactions
npx tsx benchmark/benchmark4.ts --clear

# Account Abstraction (ERC-4337 style bundling)
npx tsx benchmark/benchmark5.ts

# Multicall / Batched transactions comparison
npx tsx benchmark/benchmark6.ts

# Production Readiness Test (validates nonce handling)
npx tsx benchmark/benchmark7.ts
npx tsx benchmark/benchmark7.ts --accounts=10 --txPerTest=50

# Duration-Based Stress Test (maximum TPS)
npx tsx benchmark/benchmark8.ts
npx tsx benchmark/benchmark8.ts --duration=120 --accounts=50
npx tsx benchmark/benchmark8.ts --turbo  # Maximum aggression mode
```

### Production Readiness Test (benchmark7)

This test validates that the network is ready for production by:
- Testing native ETH transfers, contract calls, ERC20 transfers, ERC721 minting, and **multiple contract deployments**
- Verifying **no nonce gaps** occur during operations
- Testing both sequential and parallel contract deployments
- Generating a PASS/FAIL report for production deployment

| Result | Meaning |
|--------|---------|
| ✅ PASS | No nonce gaps, all transactions successful |
| ⚠️ ISSUES | Some failures but no nonce gaps |
| ❌ FAIL | Nonce gaps detected - not production ready |

### Duration-Based Stress Test (benchmark8)

Combines the best of benchmark3 and benchmark7 for maximum stress testing:
- **Duration-based**: Run for a specified number of seconds
- **Fire-and-forget**: Sends transactions without blocking for confirmation
- **Async tracking**: Confirmations tracked asynchronously
- **Nonce recovery**: Auto-recovers from nonce issues
- **Turbo mode**: `--turbo` flag for maximum aggression (50 accounts, 30 pending/account)

```bash
# Default 60 second test
npx tsx benchmark/benchmark8.ts

# Custom duration and accounts
npx tsx benchmark/benchmark8.ts --duration=120 --accounts=30 --pending=15

# Maximum aggression mode
npx tsx benchmark/benchmark8.ts --turbo
```

### Benchmark Configuration

Edit the `CONFIG` object in each benchmark file to adjust:
- `numAccounts` - Number of parallel accounts
- `totalTransactions` - Transactions per test
- `targetTPS` - Target transactions per second
- `gasPrice` - Gas price for transactions

### Deployed Address Loading

All benchmarks automatically load contract addresses from:
```
ignition/deployments/chain-235/deployed_addresses.json
```

This is handled by `benchmark/deployed-addresses.ts`.

### Benchmark Reports

Reports are saved to `benchmark/reports/` in both JSON and HTML formats.

---

## Network Configuration

### Besu Network (Chain ID: 235)
```typescript
besu: {
  type: "http",
  chainId: 235,
  url: 'http://localhost:8545',
  accounts: [configVariable("PRIV_KEY")],
}
```

### Besu Node Recommendations
For high TPS benchmarking, configure your Besu nodes with:
```
--tx-pool-limit-by-account-percentage=1.0
--tx-pool-max-size=10000
--rpc-tx-feecap=0
```

---

## Project Structure

```
├── contracts/           # Solidity smart contracts
├── ignition/
│   ├── modules/        # Hardhat Ignition deployment modules
│   └── deployments/    # Deployed contract addresses
├── benchmark/
│   ├── benchmark.ts    # High-performance TPS
│   ├── benchmark2.ts   # Advanced operations
│   ├── benchmark3.ts   # Confirmation-based
│   ├── benchmark4.ts   # Balance-based sustained
│   ├── deployed-addresses.ts  # Address loader utility
│   └── reports/        # Benchmark reports
├── scripts/            # Utility scripts
├── deploy-all.sh       # Deploy & verify script
├── reset.sh            # Reset deployment state
└── hardhat.config.ts   # Hardhat configuration
```

---

## Testing

```bash
# Run all tests
npx hardhat test

# Run Solidity tests only
npx hardhat test solidity

# Run Mocha tests only
npx hardhat test mocha
```

---

## License

MIT
