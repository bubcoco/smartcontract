#!/usr/bin/env bash

# =============================================================================
# Deploy and Verify Script for DLT Network
# Deploys: NewPointFactory (point-loyalty), Coupon, THB, Vault, MarketplaceOat
# Flow: Deploy contracts in dependency order, then verify all
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ==================== CONFIGURATION ====================
NETWORK="dlt"
CHAIN_ID="116687680"

# Project directories (absolute paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMARTCONTRACT_DIR="${SCRIPT_DIR}"
POINT_LOYALTY_DIR="$(cd "${SCRIPT_DIR}/../blockchain_point-loyalty" && pwd)"

# Ignition paths
SC_MODULES_DIR="${SMARTCONTRACT_DIR}/ignition/modules"
PL_MODULES_DIR="${POINT_LOYALTY_DIR}/ignition/modules"
SC_DEPLOYMENTS_DIR="${SMARTCONTRACT_DIR}/ignition/deployments/chain-${CHAIN_ID}"
PL_DEPLOYMENTS_DIR="${POINT_LOYALTY_DIR}/ignition/deployments/chain-${CHAIN_ID}"
SC_ADDRESSES_FILE="${SC_DEPLOYMENTS_DIR}/deployed_addresses.json"
PL_ADDRESSES_FILE="${PL_DEPLOYMENTS_DIR}/deployed_addresses.json"

# ==================== HELPER FUNCTIONS ====================

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

# Deploy a contract using Hardhat Ignition
# Args: $1=module_name, $2=module_file_path, $3=project_dir, $4=parameters_json (optional)
deploy_contract() {
    local module_name=$1
    local module_file=$2
    local project_dir=$3
    local parameters_json=$4

    print_info "Deploying ${module_name}..."

    local deploy_cmd="npx hardhat ignition deploy ${module_file} --network ${NETWORK}"

    # Add parameters if provided
    if [ -n "$parameters_json" ]; then
        # Write parameters to a temp file
        local params_file
        params_file=$(mktemp /tmp/ignition-params-XXXXXX.json)
        printf '%s' "$parameters_json" > "$params_file"
        print_info "Parameters file: ${params_file}"
        print_info "Parameters content: $(cat "$params_file")"
        deploy_cmd="${deploy_cmd} --parameters ${params_file}"
    fi

    print_info "Running: ${deploy_cmd}"
    print_info "Working directory: ${project_dir}"

    # Run ignition deploy with delayed confirmation
    if output=$( (sleep 5; echo "y") | bash -c "cd '${project_dir}' && ${deploy_cmd}" 2>&1); then
        echo "$output"
        print_success "${module_name} deployed successfully!"

        # Clean up temp file
        [ -n "$params_file" ] && rm -f "$params_file"
        return 0
    else
        # Check if it's already deployed
        if echo "$output" | grep -q "already been deployed"; then
            print_warning "${module_name} already deployed, skipping..."
            [ -n "$params_file" ] && rm -f "$params_file"
            return 0
        else
            print_error "Failed to deploy ${module_name}"
            echo "$output"
            [ -n "$params_file" ] && rm -f "$params_file"
            return 1
        fi
    fi
}

# Get contract address from deployed_addresses.json
# Args: $1=contract_key, $2=addresses_file
get_contract_address() {
    local contract_key=$1
    local addresses_file=$2

    if [ -f "$addresses_file" ]; then
        if command -v jq > /dev/null 2>&1; then
            address=$(jq -r ".\"${contract_key}\"" "$addresses_file" 2>/dev/null)
        else
            address=$(grep -o "\"${contract_key}\": *\"0x[a-fA-F0-9]*\"" "$addresses_file" | grep -o "0x[a-fA-F0-9]*")
        fi

        if [ -n "$address" ] && [ "$address" != "null" ]; then
            echo "$address"
            return 0
        fi
    fi

    return 1
}

# Verify a contract on blockscout
# Args: $1=contract_name, $2=contract_address, $3=project_dir, $4=constructor_args (optional)
verify_contract() {
    local contract_name=$1
    local contract_address=$2
    local project_dir=$3
    local constructor_args=$4

    print_info "Verifying ${contract_name} at ${contract_address}..."

    local verify_cmd="npx hardhat verify --network ${NETWORK} ${contract_address}"

    if [ -n "$constructor_args" ]; then
        verify_cmd="${verify_cmd} ${constructor_args}"
    fi

    print_info "Running: ${verify_cmd}"

    if output=$(bash -c "cd '${project_dir}' && ${verify_cmd}" 2>&1); then
        echo "$output"
        print_success "${contract_name} verified successfully!"
        return 0
    else
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
# PHASE 1: Deploy NewPointFactory (blockchain_point-loyalty)
# =============================================================================
deploy_phase1() {
    print_header "PHASE 1: Deploy NewPointFactory (blockchain_point-loyalty)"

    deploy_contract \
        "NewPointFactory" \
        "${PL_MODULES_DIR}/newPointFactory.ts" \
        "${POINT_LOYALTY_DIR}" \
        || true

    # Retrieve deployed address
    local factory_address
    factory_address=$(get_contract_address "NewPointFactoryModule#NewPointTokenFactory" "$PL_ADDRESSES_FILE") || true

    if [ -n "$factory_address" ]; then
        print_success "NewPointFactory deployed at: ${factory_address}"
    else
        print_warning "Could not read NewPointFactory address from deployed_addresses.json"
    fi
}

# =============================================================================
# PHASE 2: Deploy Coupon and THB (smartcontract — independent)
# =============================================================================
deploy_phase2() {
    print_header "PHASE 2: Deploy Coupon & THB (smartcontract)"

    # Deploy Coupon
    deploy_contract \
        "Coupon" \
        "${SC_MODULES_DIR}/Coupon.ts" \
        "${SMARTCONTRACT_DIR}" \
        || true

    # Deploy THB
    deploy_contract \
        "THB" \
        "${SC_MODULES_DIR}/THB.ts" \
        "${SMARTCONTRACT_DIR}" \
        || true

    # Print deployed addresses
    local coupon_address thb_address
    coupon_address=$(get_contract_address "CouponModule#Coupon" "$SC_ADDRESSES_FILE") || true
    thb_address=$(get_contract_address "THBModule#THB" "$SC_ADDRESSES_FILE") || true

    [ -n "$coupon_address" ] && print_success "Coupon deployed at: ${coupon_address}"
    [ -n "$thb_address" ] && print_success "THB deployed at: ${thb_address}"
}

# =============================================================================
# PHASE 3: Deploy Vault (depends on THB)
# =============================================================================
deploy_phase3() {
    print_header "PHASE 3: Deploy Vault (smartcontract)"

    # Get THB address from Phase 2
    local thb_address
    thb_address=$(get_contract_address "THBModule#THB" "$SC_ADDRESSES_FILE")

    if [ -z "$thb_address" ]; then
        print_error "Cannot deploy Vault: THB address not found!"
        print_error "Please ensure THB was deployed successfully in Phase 2"
        return 1
    fi

    print_info "Using THB address: ${thb_address}"

    # Create parameters JSON for Vault
    local params_json="{\"VaultModule\": {\"thbToken\": \"${thb_address}\"}}"

    deploy_contract \
        "Vault" \
        "${SC_MODULES_DIR}/Vault.ts" \
        "${SMARTCONTRACT_DIR}" \
        "$params_json" \
        || true

    local vault_address
    vault_address=$(get_contract_address "VaultModule#Vault" "$SC_ADDRESSES_FILE") || true
    [ -n "$vault_address" ] && print_success "Vault deployed at: ${vault_address}"
}

# =============================================================================
# PHASE 4: Deploy MarketplaceOat (depends on THB, Coupon, Vault)
# =============================================================================
deploy_phase4() {
    print_header "PHASE 4: Deploy MarketplaceOat (smartcontract)"

    # Get addresses from previous phases
    local thb_address coupon_address vault_address
    thb_address=$(get_contract_address "THBModule#THB" "$SC_ADDRESSES_FILE")
    coupon_address=$(get_contract_address "CouponModule#Coupon" "$SC_ADDRESSES_FILE")
    vault_address=$(get_contract_address "VaultModule#Vault" "$SC_ADDRESSES_FILE")

    if [ -z "$thb_address" ]; then
        print_error "Cannot deploy MarketplaceOat: THB address not found!"
        return 1
    fi
    if [ -z "$coupon_address" ]; then
        print_error "Cannot deploy MarketplaceOat: Coupon address not found!"
        return 1
    fi
    if [ -z "$vault_address" ]; then
        print_error "Cannot deploy MarketplaceOat: Vault address not found!"
        return 1
    fi

    print_info "Using THB address:    ${thb_address}"
    print_info "Using Coupon address: ${coupon_address}"
    print_info "Using Vault address:  ${vault_address}"

    # Create parameters JSON for MarketplaceOat
    local params_json="{\"MarketplaceOatModule\": {\"thbToken\": \"${thb_address}\", \"couponContract\": \"${coupon_address}\", \"vault\": \"${vault_address}\"}}"

    deploy_contract \
        "MarketplaceOat" \
        "${SC_MODULES_DIR}/MarketplaceOat.ts" \
        "${SMARTCONTRACT_DIR}" \
        "$params_json" \
        || true

    local marketplace_address
    marketplace_address=$(get_contract_address "MarketplaceOatModule#Marketplace" "$SC_ADDRESSES_FILE") || true
    [ -n "$marketplace_address" ] && print_success "MarketplaceOat deployed at: ${marketplace_address}"
}

# =============================================================================
# PHASE 5: Verify All Contracts
# =============================================================================
verify_all_contracts() {
    print_header "PHASE 5: Verify All Contracts"

    # ---------- NewPointFactory (point-loyalty) ----------
    print_header "Verifying NewPointFactory"
    local factory_address
    factory_address=$(get_contract_address "NewPointFactoryModule#NewPointTokenFactory" "$PL_ADDRESSES_FILE") || true
    if [ -n "$factory_address" ]; then
        verify_contract "NewPointTokenFactory" "$factory_address" "$POINT_LOYALTY_DIR" || true
    else
        print_warning "Skipping NewPointFactory verification — address not found"
    fi

    # ---------- Coupon (smartcontract) ----------
    print_header "Verifying Coupon"
    local coupon_address
    coupon_address=$(get_contract_address "CouponModule#Coupon" "$SC_ADDRESSES_FILE") || true
    if [ -n "$coupon_address" ]; then
        verify_contract "Coupon" "$coupon_address" "$SMARTCONTRACT_DIR" '"Coupon" "CPN"' || true
    else
        print_warning "Skipping Coupon verification — address not found"
    fi

    # ---------- THB (smartcontract) ----------
    print_header "Verifying THB"
    local thb_address
    thb_address=$(get_contract_address "THBModule#THB" "$SC_ADDRESSES_FILE") || true
    if [ -n "$thb_address" ]; then
        verify_contract "THB" "$thb_address" "$SMARTCONTRACT_DIR" '"Thai Baht Token" "THB" 2' || true
    else
        print_warning "Skipping THB verification — address not found"
    fi

    # ---------- Vault (smartcontract) ----------
    print_header "Verifying Vault"
    local vault_address
    vault_address=$(get_contract_address "VaultModule#Vault" "$SC_ADDRESSES_FILE") || true
    if [ -n "$thb_address" ] && [ -n "$vault_address" ]; then
        verify_contract "Vault" "$vault_address" "$SMARTCONTRACT_DIR" "$thb_address" || true
    else
        print_warning "Skipping Vault verification — address not found"
    fi

    # ---------- MarketplaceOat (smartcontract) ----------
    print_header "Verifying MarketplaceOat"
    local marketplace_address
    marketplace_address=$(get_contract_address "MarketplaceOatModule#Marketplace" "$SC_ADDRESSES_FILE") || true
    if [ -n "$marketplace_address" ]; then
        local coupon_addr vault_addr
        coupon_addr=$(get_contract_address "CouponModule#Coupon" "$SC_ADDRESSES_FILE") || true
        vault_addr=$(get_contract_address "VaultModule#Vault" "$SC_ADDRESSES_FILE") || true
        verify_contract "Marketplace" "$marketplace_address" "$SMARTCONTRACT_DIR" "${thb_address} ${coupon_addr} ${vault_addr}" || true
    else
        print_warning "Skipping MarketplaceOat verification — address not found"
    fi

    print_success "All verifications completed!"
}

# =============================================================================
# PRINT SUMMARY
# =============================================================================
print_summary() {
    print_header "Deployment Summary"

    echo -e "${CYAN}Network:${NC}  ${NETWORK}"
    echo -e "${CYAN}Chain ID:${NC} ${CHAIN_ID}"
    echo ""

    echo -e "${CYAN}─── blockchain_point-loyalty ───${NC}"
    if [ -f "$PL_ADDRESSES_FILE" ]; then
        cat "$PL_ADDRESSES_FILE"
    else
        echo "  (no deployed_addresses.json found)"
    fi

    echo ""
    echo -e "${CYAN}─── smartcontract ───${NC}"
    if [ -f "$SC_ADDRESSES_FILE" ]; then
        cat "$SC_ADDRESSES_FILE"
    else
        echo "  (no deployed_addresses.json found)"
    fi

    print_header "Complete!"
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    print_header "Deploy All Contracts to DLT Network"

    echo -e "${CYAN}Contracts to deploy:${NC}"
    echo "  1. NewPointFactory   (blockchain_point-loyalty)"
    echo "  2. Coupon            (smartcontract)"
    echo "  3. THB               (smartcontract)"
    echo "  4. Vault             (smartcontract) — depends on THB"
    echo "  5. MarketplaceOat    (smartcontract) — depends on THB, Coupon, Vault"
    echo ""

    # Validate directories
    if [ ! -f "${SMARTCONTRACT_DIR}/hardhat.config.ts" ]; then
        print_error "smartcontract project not found at: ${SMARTCONTRACT_DIR}"
        exit 1
    fi

    if [ ! -f "${POINT_LOYALTY_DIR}/hardhat.config.ts" ]; then
        print_error "blockchain_point-loyalty project not found at: ${POINT_LOYALTY_DIR}"
        exit 1
    fi

    # Validate ignition modules
    local missing=false
    for module_file in \
        "${PL_MODULES_DIR}/newPointFactory.ts" \
        "${SC_MODULES_DIR}/Coupon.ts" \
        "${SC_MODULES_DIR}/THB.ts" \
        "${SC_MODULES_DIR}/Vault.ts" \
        "${SC_MODULES_DIR}/MarketplaceOat.ts"; do
        if [ ! -f "$module_file" ]; then
            print_error "Module file not found: ${module_file}"
            missing=true
        fi
    done

    if [ "$missing" = true ]; then
        exit 1
    fi

    print_success "All module files found"
    echo ""

    # Execute deployment phases
    deploy_phase1
    deploy_phase2
    deploy_phase3
    deploy_phase4

    # Verify all contracts
    verify_all_contracts

    # Print summary
    print_summary
}

# Run main function
main "$@"
