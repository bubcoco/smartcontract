# Smart Contract Project

This project contains smart contracts and benchmarking tools for the Loaffinity blockchain network (Besu QBFT).

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

## Deployment

### Deploy All Contracts to Loaffinity Network

```bash
./deploy-all.sh
```

This script will:
1. **Phase 1**: Deploy MemberCard, ContractFactory2, and Token contracts
2. **Phase 2**: Verify all contracts on Blockscout using addresses from `deployed_addresses.json`

### Reset Deployment State

```bash
./reset.sh
```

Clears Ignition deployment cache and compiled artifacts.

### Manual Deployment

```bash
# Deploy individual modules
npx hardhat ignition deploy ignition/modules/MemberCard.ts --network loaffinity
npx hardhat ignition deploy ignition/modules/ContractFactory2.ts --network loaffinity
npx hardhat ignition deploy ignition/modules/Token.ts --network loaffinity
```

### Verify Contracts

```bash
npx hardhat verify --network loaffinity <CONTRACT_ADDRESS> [constructor args...]
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
| `benchmark.ts` | High-performance TPS testing | Native transfers + Counter.inc() |
| `benchmark2.ts` | Advanced operations | ERC20 transfers, minting, factory creation |
| `benchmark3.ts` | Confirmation-based TPS | Waits for each tx confirmation |
| `benchmark4.ts` | Sustained throughput | Balance-based (10 ETH per account) |

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

### Loaffinity Network (Chain ID: 235)
```typescript
loaffinity: {
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
