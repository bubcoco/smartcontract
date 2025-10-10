#!/bin/bash
set -euo pipefail

# Global variables
network=
tags=
address=
proxy=false
dflag=false
vflag=false
wflag=false
bflag=false

# Help function
Help() {
    echo "usage: ./deploy.sh -n <network> -t <tags> [-a <address>] [-p] [-D] [-V] [-W] [-B]"
    echo "decription: this is a script to help deploy and setup UPO smart contracts"
    echo
    echo "Options: "
    echo "h     Print help"
    echo "n     Set network"
    echo "t     Set tags (contract name)"
    echo "a     Set contract address"
    echo "p     Set is proxy contract"
    echo "D     Deploy contract"
    echo "V     Verify contract"
    echo "W     Grant BE WORKER"
    echo "B     Grant WORKER of BalanceVault"
    exit
}

# Prompting for y/any
Prompt() {
    qtext=$1
    printf "$qtext? (y/n): "
    # -s: to not echo typed text
    # -n 1: read only 1 character (separate with space)
    read -s -n 1 atext

    # this grammar (the #[] operator) means that the variable $atext where any Y or y in 1st position will be dropped if they exist.
    if [ "$atext" != "${atext#[Yy]}" ] || [ "$atext" = "" ]; then
        echo Yes
    else
        echo No
        exit
    fi
}

# Error throwing
Error() {
    echo "Error: $1"
    exit
}

# Write (add/edit) to yaml file
Write() {
    key=$1
    value=$2
    
    # Check whether key exist in .yaml
    count=$(grep -ic "$key:" "$file" || true)
    if [ $count -ne 0 ]; then
        # append new key, value
        sed -i.bak "/$key: /d" "$file" && rm "$file.bak"
    fi
     echo "$key:$value" >>"$file"
}

# Verify required args
Require() {
    valid=true
    for var in "$@"; do
        if [ -z "$var" ]; then
            valid=false
            break
        fi
    done
}

# Verify and setup address field
SetupAddress() {
    echo "Setting up address"
    if [ -z "$address" ]; then
        echo "Flag [-a] not found, try retrieving from $file using [-t]"
        line=$(grep -A3 "$tags: " "$file" || echo "")
        if [ ! -z "$line" ]; then
            address=$(echo $line | tail -n1 | cut -d" " -f2)
        else
            Error "Key $tags not found in $file"
        fi
    fi
    echo "Proceeding using address: $address"
}

# Deploy function
Deploy() {
    echo "======================================================== Deploy ========================================================"
    Require "$network" "$tags"
    if [ "$valid" = false ]; then
        Error "Deploy required flag [-n, -t] is missing"
    fi
    
    # MODIFIED: Command changed for Hardhat Ignition
    local module_path="ignition/modules/${tags}.ts"
    if [ ! -f "$module_path" ]; then
        Error "Deployment module not found at: $module_path"
    fi

    echo "Deploying module $tags ($module_path) on network $network"
    
    # MODIFIED: New command and more robust address parsing for Ignition's output
    # Hardhat Ignition output looks like: ✔ "MyContract" deployed as MyModule#MyContract to 0x...
    # We grep for the line with the module name and grab the last word.
    # The 'tee /dev/tty' command ensures the output is still shown to the user in real-time.
    deploy_output=$(npx hardhat ignition deploy --network $network "$module_path" | tee /dev/tty)
    deployed_address=$(echo "$deploy_output" | grep "deployed as .*$tags" | awk '{print $NF}')

    if [ -z "$deployed_address" ]; then
        Error "Could not parse deployed address from Ignition output."
    fi

    address=$deployed_address
    Write "$tags" "$address"
    echo
    echo "Successfully deployed and wrote address to $file"
    echo
}

# Verify function
Verify() {
    echo "======================================================== Verify ========================================================"
    Require "$network" "$tags"
    if [ "$valid" = false ]; then
        Error "Verify required flag [-n, -t] is missing"
    fi
    SetupAddress

    echo "Verifying address $address on network $network"
    # Using stored args for non-proxy contract
    if [ "$proxy" = true ]; then
        echo "Verifying proxy contract"
        npx hardhat --network $network verify $address
    else
        echo "Verifying non-proxy contract"
        npx hardhat --network $network verify $address --constructor-args ./deploy/arguments/${tags}.ts
    fi
    echo
}

# Add worker function
AddWorker() {
    echo "======================================================= AddWorker ======================================================"
    Require "$network" "$tags"
    if [ "$valid" = false ]; then
        Error "AddWorker required flag [-n, -t] is missing"
    fi
    SetupAddress

    echo "===== Adding WORKER to address $address on network $network ====="
    # Adding proxy flag for proxy contract
    if [ "$proxy" = true ]; then
        npx hardhat addWorker --network $network --cname $tags --caddress $address --path ./data/Workers.csv --proxy
    else
        npx hardhat addWorker --network $network --cname $tags --caddress $address --path ./data/Workers.csv
    fi
    echo
}

GrantBalanceVaultWorker() {
    echo "=============================================== GrantBalanceVaultWorker ================================================"
    Require "$network" "$tags"
    if [ "$valid" = false ]; then
        Error "GrantBalanceVaultWorker required flag [-n, -t] is missing"
    fi
    SetupAddress

    # Create/Replace BalanceVault WORKER csv
    echo "Address" >./data/BWorkers.csv
    echo "$address" >>./data/BWorkers.csv

    # Import .env and remove exceed token
    source ./.env
    ((testvar = $(echo ${#BALANCE_VAULT_ADDR})))
    if [ $testvar -eq 42 ]; then
        baddress="${BALANCE_VAULT_ADDR}"
    else 
        baddress="${BALANCE_VAULT_ADDR:0:42}"
    fi
    echo "Granting BalanceVault[$baddress] WORKER to address $address on network $network"
    npx hardhat addWorker --network $network --cname BalanceVaultV2 --caddress $baddress --path ./data/BWorkers.csv --proxy
    echo
}

# Main program
while getopts hn:t:a:pDVWBT flag; do
    case ${flag} in
    h) Help ;;
    n)
        network=${OPTARG}
        file="deploy/address_data/deploy_${network}.yaml"
        ;;
    t) tags=${OPTARG} ;;
    a) address=${OPTARG} ;;
    p) proxy=true ;;
    D) dflag=true ;;
    V) vflag=true ;;
    W) wflag=true ;;
    B) bflag=true ;;
    esac
done

if [ "$dflag" = true ] || [ "$vflag" = true ] || [ "$wflag" = true ] || [ "$bflag" = true ]; then
    echo "Verifying requirement for job execution ..."
    Prompt "Matching .env with network"
    Prompt "WALLET_PRIVATE_KEY is valid"

    if [ "$dflag" = true ]; then
        Prompt "Check deploy script and arguments"
    fi

    if [ "$vflag" = true ]; then
        Prompt "POLYGONSCAN_API_KEY is valid for network"
    fi

    if [ "$wflag" = true ]; then
        Prompt "WORKER list on ./data/Worker.csv is valid"
    fi

    if [ "$bflag" = true ]; then
        Prompt "BALANCE_VAULT_ADDR is valid"
    fi

    if [ "$dflag" = true ]; then
        Deploy
    fi

    if [ "$vflag" = true ]; then
        Verify
    fi

    if [ "$wflag" = true ]; then
        AddWorker
    fi

    if [ "$bflag" = true ]; then
        GrantBalanceVaultWorker
    fi

    echo "========================================================= Done ========================================================="
else
    Help
fi
