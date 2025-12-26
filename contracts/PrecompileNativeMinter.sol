// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/INativeMinter.sol";
import "./interfaces/IOwnable.sol";

/**
 * @title PrecompileNativeMinter
 * @author Blockchain Department @ Advanced Info Services PCL
 * @notice A contract that interacts with the NativeMinter precompile to mint native coins
 * @dev This contract wraps the NativeMinter precompile at 0x0000000000000000000000000000000000001001
 *      and provides a convenient interface for minting native tokens from smart contracts.
 *
 *      The precompile supports the following functions:
 *      - owner(): returns the current owner
 *      - initialized(): returns if the precompile is initialized
 *      - initializeOwner(address): initializes the owner (can only be called once)
 *      - transferOwnership(address): transfers ownership to a new address
 *      - mint(address,uint256): mints native tokens to the specified address
 *
 *      Only the owner of the precompile can mint tokens.
 */
contract PrecompileNativeMinter {
    /// @notice The address of the NativeMinter precompile
    address public constant NATIVE_MINTER_PRECOMPILE =
        0x0000000000000000000000000000000000001001;

    /// @notice Emitted when native tokens are minted
    event NativeMinted(address indexed to, uint256 amount, bool success);

    /// @notice Emitted when the precompile owner is initialized
    event OwnerInitialized(address indexed owner);

    /// @notice Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /// @dev Custom errors for better gas efficiency
    error MintFailed(address to, uint256 amount);
    error InitializationFailed(address owner);
    error OwnershipTransferFailed(address newOwner);
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidRecipient();
    error InvalidAmount();

    /// @notice Allows the contract to receive native tokens
    receive() external payable {}

    // ═══════════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current owner of the NativeMinter precompile
     * @return The address of the current owner
     */
    function owner() external view returns (address) {
        return IOwnable(NATIVE_MINTER_PRECOMPILE).owner();
    }

    /**
     * @notice Checks if the NativeMinter precompile has been initialized
     * @return True if initialized, false otherwise
     */
    function initialized() external view returns (bool) {
        return IOwnable(NATIVE_MINTER_PRECOMPILE).initialized();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initialization Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes the owner of the NativeMinter precompile
     * @dev Can only be called once when the precompile is not initialized
     * @param _owner The address to set as the initial owner
     * @return success True if initialization was successful
     */
    function initializeOwner(address _owner) external returns (bool success) {
        if (IOwnable(NATIVE_MINTER_PRECOMPILE).initialized()) {
            revert AlreadyInitialized();
        }

        success = IOwnable(NATIVE_MINTER_PRECOMPILE).initializeOwner(_owner);

        if (!success) {
            revert InitializationFailed(_owner);
        }

        emit OwnerInitialized(_owner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Ownership Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Transfers ownership of the NativeMinter precompile to a new owner
     * @dev Only the current owner can call this function
     * @param _newOwner The address of the new owner
     * @return success True if ownership transfer was successful
     */
    function transferOwnership(
        address _newOwner
    ) external returns (bool success) {
        address previousOwner = IOwnable(NATIVE_MINTER_PRECOMPILE).owner();

        success = IOwnable(NATIVE_MINTER_PRECOMPILE).transferOwnership(
            _newOwner
        );

        if (!success) {
            revert OwnershipTransferFailed(_newOwner);
        }

        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Minting Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Mints native tokens to a specified address
     * @dev Only the owner of the precompile can successfully mint tokens
     * @param _to The address to receive the minted tokens
     * @param _amount The amount of native tokens to mint (in wei)
     * @return success True if minting was successful
     */
    function mint(
        address _to,
        uint256 _amount
    ) external returns (bool success) {
        if (!IOwnable(NATIVE_MINTER_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_to == address(0)) {
            revert InvalidRecipient();
        }

        if (_amount == 0) {
            revert InvalidAmount();
        }

        success = INativeMinter(NATIVE_MINTER_PRECOMPILE).mint(_to, _amount);

        if (!success) {
            revert MintFailed(_to, _amount);
        }

        emit NativeMinted(_to, _amount, success);
    }

    /**
     * @notice Mints native tokens to multiple addresses in a single transaction
     * @dev Only the owner of the precompile can successfully mint tokens
     * @param _recipients Array of addresses to receive the minted tokens
     * @param _amounts Array of amounts to mint to each address (in wei)
     * @return success True if all minting operations were successful
     */
    function batchMint(
        address[] calldata _recipients,
        uint256[] calldata _amounts
    ) external returns (bool success) {
        require(
            _recipients.length == _amounts.length,
            "Arrays length mismatch"
        );
        require(_recipients.length > 0, "Empty arrays");

        if (!IOwnable(NATIVE_MINTER_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        for (uint256 i = 0; i < _recipients.length; i++) {
            if (_recipients[i] == address(0)) {
                revert InvalidRecipient();
            }

            bool mintSuccess = INativeMinter(NATIVE_MINTER_PRECOMPILE).mint(
                _recipients[i],
                _amounts[i]
            );

            if (!mintSuccess) {
                revert MintFailed(_recipients[i], _amounts[i]);
            }

            emit NativeMinted(_recipients[i], _amounts[i], mintSuccess);
        }

        return true;
    }

    /**
     * @notice Mints the same amount of native tokens to multiple addresses
     * @dev Only the owner of the precompile can successfully mint tokens
     * @param _recipients Array of addresses to receive the minted tokens
     * @param _amount The amount of native tokens to mint to each address (in wei)
     * @return success True if all minting operations were successful
     */
    function batchMintUniform(
        address[] calldata _recipients,
        uint256 _amount
    ) external returns (bool success) {
        require(_recipients.length > 0, "Empty recipients array");

        if (!IOwnable(NATIVE_MINTER_PRECOMPILE).initialized()) {
            revert NotInitialized();
        }

        if (_amount == 0) {
            revert InvalidAmount();
        }

        for (uint256 i = 0; i < _recipients.length; i++) {
            if (_recipients[i] == address(0)) {
                revert InvalidRecipient();
            }

            bool mintSuccess = INativeMinter(NATIVE_MINTER_PRECOMPILE).mint(
                _recipients[i],
                _amount
            );

            if (!mintSuccess) {
                revert MintFailed(_recipients[i], _amount);
            }

            emit NativeMinted(_recipients[i], _amount, mintSuccess);
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Checks if this contract's address is the owner of the precompile
     * @return True if this contract is the owner
     */
    function isContractOwner() external view returns (bool) {
        return IOwnable(NATIVE_MINTER_PRECOMPILE).owner() == address(this);
    }

    /**
     * @notice Returns the precompile address for reference
     * @return The address of the NativeMinter precompile
     */
    function getPrecompileAddress() external pure returns (address) {
        return NATIVE_MINTER_PRECOMPILE;
    }
}
