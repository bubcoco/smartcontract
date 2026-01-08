#!/usr/bin/env bash

# =============================================================================
# Deploy and Verify Script for Loaffinity Network
# Deploys: MemberCard (ERC721), ContractFactory2, Token (Gems)
# Flow: Deploy ALL contracts first, then verify ALL contracts
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
NETWORK="loaffinity"
CHAIN_ID="235"
IGNITION_DIR="./ignition"
MODULES_DIR="${IGNITION_DIR}/modules"
DEPLOYMENTS_DIR="${IGNITION_DIR}/deployments/chain-${CHAIN_ID}"
DEPLOYED_ADDRESSES_FILE="${DEPLOYMENTS_DIR}/deployed_addresses.json"

# Contract definitions: ModuleName:ModuleFile:ContractKey:SolidityContractName:ConstructorArgs
CONTRACTS=(
    "MemberCard:MemberCard:MemberCardModule#MemberCard:MemberCard:"
    "ContractFactory2:ContractFactory2:ContractFactory2Module#ContractFactory2:ContractFactory2:"
    "Token:Token:Token#Gems:Gems:500000000000000000000000000000000"
)

# Print with color
print_header() {
    echo ""
    echo -e "${CYAN}======================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}======================================================${NC}"
    echo ""
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to deploy a contract using Hardhat Ignition
deploy_contract() {
    local module_name=$1
    local module_file=$2
    
    print_info "Deploying ${module_name}..."
    
    # Run ignition deploy with delayed confirmation
    if output=$( (sleep 5; echo "y") | npx hardhat ignition deploy "${MODULES_DIR}/${module_file}.ts" --network ${NETWORK} 2>&1); then
        echo "$output"
        print_success "${module_name} deployed successfully!"
        return 0
    else
        # Check if it's already deployed
        if echo "$output" | grep -q "already been deployed"; then
            print_warning "${module_name} already deployed, skipping..."
            return 0
        else
            print_error "Failed to deploy ${module_name}"
            echo "$output"
            return 1
        fi
    fi
}

# Function to get contract address from deployed_addresses.json
get_contract_address() {
    local contract_key=$1
    
    if [ -f "$DEPLOYED_ADDRESSES_FILE" ]; then
        if command -v jq > /dev/null 2>&1; then
            address=$(jq -r ".\"${contract_key}\"" "$DEPLOYED_ADDRESSES_FILE" 2>/dev/null)
        else
            address=$(grep -o "\"${contract_key}\": *\"0x[a-fA-F0-9]*\"" "$DEPLOYED_ADDRESSES_FILE" | grep -o "0x[a-fA-F0-9]*")
        fi
        
        if [ -n "$address" ] && [ "$address" != "null" ]; then
            echo "$address"
            return 0
        fi
    fi
    
    return 1
}

# Function to verify a contract
verify_contract() {
    local contract_name=$1
    local contract_address=$2
    local constructor_args=$3
    
    print_info "Verifying ${contract_name} at ${contract_address}..."
    
    # Build verification command
    local verify_cmd="npx hardhat verify --network ${NETWORK} ${contract_address}"
    
    # Add constructor arguments if provided
    if [ -n "$constructor_args" ]; then
        verify_cmd="${verify_cmd} ${constructor_args}"
    fi
    
    print_info "Running: ${verify_cmd}"
    
    # Run verification
    if output=$(eval "$verify_cmd" 2>&1); then
        echo "$output"
        print_success "${contract_name} verified successfully!"
        return 0
    else
        # Check if already verified
        if echo "$output" | grep -qi "already verified"; then
            print_warning "${contract_name} already verified"
            return 0
        else
            print_error "Failed to verify ${contract_name}"
            echo "$output"
            return 1
        fi
    fi
}

# =============================================================================
# PHASE 1: DEPLOY ALL CONTRACTS
# =============================================================================
deploy_all_contracts() {
    print_header "PHASE 1: Deploying All Contracts"
    
    for contract_info in "${CONTRACTS[@]}"; do
        IFS=':' read -r name module_file contract_key solidity_name constructor_args <<< "$contract_info"
        
        print_header "Deploying ${name}"
        deploy_contract "$name" "$module_file" || true
    done
    
    print_success "All deployments completed!"
}

# =============================================================================
# PHASE 2: VERIFY ALL CONTRACTS
# =============================================================================
verify_all_contracts() {
    print_header "PHASE 2: Verifying All Contracts"
    
    # Check if deployed_addresses.json exists
    if [ ! -f "$DEPLOYED_ADDRESSES_FILE" ]; then
        print_error "deployed_addresses.json not found at ${DEPLOYED_ADDRESSES_FILE}"
        print_error "Please ensure contracts were deployed successfully"
        return 1
    fi
    
    print_info "Reading addresses from: ${DEPLOYED_ADDRESSES_FILE}"
    echo ""
    cat "$DEPLOYED_ADDRESSES_FILE"
    echo ""
    
    for contract_info in "${CONTRACTS[@]}"; do
        IFS=':' read -r name module_file contract_key solidity_name constructor_args <<< "$contract_info"
        
        print_header "Verifying ${name}"
        
        # Get address from deployed_addresses.json
        address=$(get_contract_address "$contract_key")
        
        if [ -n "$address" ]; then
            print_info "Found address for ${name}: ${address}"
            
            if [ -n "$constructor_args" ]; then
                print_info "Constructor args: ${constructor_args}"
            else
                print_info "Constructor args: (none)"
            fi
            
            verify_contract "$solidity_name" "$address" "$constructor_args" || true
        else
            print_error "Could not find address for ${name} (key: ${contract_key})"
        fi
    done
    
    print_success "All verifications completed!"
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    print_header "Deploy and Verify Script for Loaffinity Network"
    
    # Check if we're in the right directory
    if [ ! -f "hardhat.config.ts" ]; then
        print_error "Please run this script from the smartcontract project root directory"
        exit 1
    fi
    
    # Check if required modules exist
    for contract_info in "${CONTRACTS[@]}"; do
        IFS=':' read -r name module_file contract_key solidity_name constructor_args <<< "$contract_info"
        if [ ! -f "${MODULES_DIR}/${module_file}.ts" ]; then
            print_error "Module file not found: ${MODULES_DIR}/${module_file}.ts"
            exit 1
        fi
    done
    
    print_success "All module files found"
    
    # Phase 1: Deploy all contracts
    deploy_all_contracts
    
    # Phase 2: Verify all contracts
    verify_all_contracts
    
    # Summary
    print_header "Deployment Summary"
    echo -e "${CYAN}Network:${NC} ${NETWORK}"
    echo -e "${CYAN}Chain ID:${NC} ${CHAIN_ID}"
    echo ""
    
    if [ -f "$DEPLOYED_ADDRESSES_FILE" ]; then
        echo -e "${CYAN}Deployed Contracts:${NC}"
        cat "$DEPLOYED_ADDRESSES_FILE"
    fi
    
    print_header "Complete!"
}

# Run main function
main "$@"
