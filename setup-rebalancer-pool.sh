#!/bin/bash

# =============================================================================
# Setup Rebalancer Test Pool
# =============================================================================
# Deploys test tokens, creates a V3 pool, and mints an LP position
#
# Usage:
#   ./setup-rebalancer-pool.sh
# =============================================================================

set -e

echo "=========================================="
echo "  Rebalancer Test Pool Setup"
echo "=========================================="
echo ""

# Run the TypeScript script
npx tsx scripts/setup-rebalancer-pool.ts

echo ""
echo "Done! Check test-pool-config.json in the rebalancer directory."
