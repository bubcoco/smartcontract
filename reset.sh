rm -rf ./ignition/deployments/chain-235

npx hardhat clean

# Fund user wallet from admin
echo "Funding user wallet..."
npx tsx scripts/fund-user.ts 10000

echo "Reset completed successfully!"