// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title Interface Gas Fee Grant
 * @author Blockchain Department @ Advanced Info Services PCL
 */

interface IGasFeeGrant {
    enum FEE_ALLOWANCE_TYPE {
        NON_ALLOWANCE,
        BASIC_ALLOWANCE,
        PERIODIC_ALLOWANCE
    }

    struct Grant {
        address granter;
        FEE_ALLOWANCE_TYPE allowance;
        uint256 spendLimit;
        uint256 periodLimit;
        uint256 periodCanSpend;
        uint256 startTime;
        uint256 endTime;
        uint256 latestTransaction;
        uint32 period;
    }

    /**
     * @notice Grants a gas fee allowance to a specified grantee and program.
     * @dev Sets up a gas fee allowance based on the provided parameters.
     * @param granter The address that is granting the fee allowance.
     * @param grantee The address receiving the gas fee allowance.
     * @param program The contract address where the granted allowance can be used.
     * @param spendLimit The total amount of gas fees in (wei) that can be spent per transaction.
     * @param period The duration (in blocks) defining the reset period for periodic allowances.
     * @param periodLimit The maximum spendable amount per period for periodic allowances.
     * @param endTime The block number when the grant will expire.
     * @return  True if the grant is successfully set, otherwise false.
     */
    function setFeeGrant(
        address granter,
        address grantee,
        address program,
        uint256 spendLimit,
        uint32 period,
        uint256 periodLimit,
        uint256 endTime
    ) external returns (bool);

    /**
     * @notice Revokes an existing gas fee grant.
     * @dev Removes the granted allowance for a given grantee and program.
     * @param grantee The address whose fee grant is being revoked.
     * @param program The contract address associated with the grant.
     * @return True if the grant is successfully revoked, otherwise false.
     */
    function revokeFeeGrant(address grantee, address program) external returns (bool);
    
    /**
     * @notice Returns the remaining gas fee allowance available before the current period resets.
     * @dev This function only applies to periodic allowances.
     * @param grantee The address receiving the gas fee grant.
     * @param program The contract address where the grant is applicable.
     * @return The amount of gas fees left to be spent before the period resets.
     */
    function periodCanSpend(address grantee, address program) external view returns (uint256);

    /**
     * @notice Retrieves the block number when the current spending period will reset.
     * @dev This function only applies to periodic allowances.
     * @param grantee The address receiving the gas fee grant.
     * @param program The contract address where the grant is applicable.
     * @return The block number when the next spending period will reset.
     */
    function periodReset(address grantee, address program) external view returns (uint256);

    /**
     * @notice Checks whether a fee grant has isExpired.
     * @dev Compares the current block number with the grant's endTime block.
     * @param grantee The address receiving the gas fee grant.
     * @param program The contract address where the grant is applicable.
     * @return True if the grant has isExpired, otherwise `false`.
     */
    function isExpired(address grantee, address program) external view returns (bool);

    /**
     * @notice Checks whether a gas fee grant exists for a given grantee and program.
     * @dev This function verifies if the specified grantee has been granted a gas fee allowance  
     *      for transactions interacting with the specified contract address.
     * @param grantee The address that may have received a gas fee grant.
     * @param program The contract address for which the grant is being checked.
     * @return True if the grantee has an active gas fee grant for the specified contract, otherwise `false`.
     */
    function isGrantedForProgram(address grantee, address program) external view returns (bool);

    /**
     * @notice Checks whether a gas fee grant exists for a given grantee across all programs.
     * @dev This function verifies if the specified grantee has been granted a gas fee allowance  
     *      for transactions interacting with any contract address.
     * @param grantee The address that may have received a gas fee grant.
     * @return True if the grantee has an active gas fee grant across all contracts, otherwise `false`.
     */
    function isGrantedForAllProgram(address grantee) external view returns (bool);

    /**
     * @notice Retrieves the details of a gas fee grant.
     * @dev Returns the struct containing the allowance details for a specific grantee and program.
     * @param grantee The address receiving the gas fee grant.
     * @param program The contract address where the grant is applicable.
     * @return grant details The `Grant` struct containing all relevant grant data.
     */
    function grant(address grantee, address program) external view returns (Grant memory);
}
