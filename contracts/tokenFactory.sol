// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GameToken
 * @dev ERC20 token that can be minted based on game performance
 */
contract GameToken is ERC20, Ownable, ReentrancyGuard {
    
    // Mapping to track claimed game sessions
    mapping(bytes32 => bool) public claimedSessions;
    
    // Mapping to track total tokens earned by each player
    mapping(address => uint256) public totalEarned;
    
    // Game admin addresses authorized to verify scores
    mapping(address => bool) public gameAdmins;
    
    // Token reward rate (tokens per coin collected)
    uint256 public rewardRate = 1 * 10**18; // 1 token per coin by default
    
    // Events
    event TokensMinted(address indexed player, uint256 coins, uint256 tokens, bytes32 sessionId);
    event RewardRateUpdated(uint256 newRate);
    event GameAdminAdded(address indexed admin);
    event GameAdminRemoved(address indexed admin);
    
    constructor() ERC20("Game Token", "GEMS") Ownable(msg.sender) {
        gameAdmins[msg.sender] = true;
    }
    
    /**
     * @dev Mint tokens to player based on coins collected
     * @param player Address of the player
     * @param coinsCollected Number of coins collected in the game
     * @param sessionId Unique identifier for the game session
     */
    function mintReward(
        address player,
        uint256 coinsCollected,
        bytes32 sessionId
    ) external nonReentrant {
        require(gameAdmins[msg.sender], "Only game admins can mint rewards");
        require(player != address(0), "Invalid player address");
        require(coinsCollected > 0, "Must collect at least 1 coin");
        require(!claimedSessions[sessionId], "Session already claimed");
        
        // Mark session as claimed
        claimedSessions[sessionId] = true;
        
        // Calculate tokens to mint
        uint256 tokensToMint = coinsCollected * rewardRate;
        
        // Mint tokens to player
        _mint(player, tokensToMint);
        
        // Update total earned
        totalEarned[player] += tokensToMint;
        
        emit TokensMinted(player, coinsCollected, tokensToMint, sessionId);
    }
    
    /**
     * @dev Batch mint rewards for multiple players
     * @param players Array of player addresses
     * @param coinsCollected Array of coins collected by each player
     * @param sessionIds Array of session IDs
     */
    function batchMintRewards(
        address[] calldata players,
        uint256[] calldata coinsCollected,
        bytes32[] calldata sessionIds
    ) external nonReentrant {
        require(gameAdmins[msg.sender], "Only game admins can mint rewards");
        require(
            players.length == coinsCollected.length && 
            players.length == sessionIds.length,
            "Array lengths must match"
        );
        
        for (uint256 i = 0; i < players.length; i++) {
            if (!claimedSessions[sessionIds[i]] && players[i] != address(0) && coinsCollected[i] > 0) {
                claimedSessions[sessionIds[i]] = true;
                uint256 tokensToMint = coinsCollected[i] * rewardRate;
                _mint(players[i], tokensToMint);
                totalEarned[players[i]] += tokensToMint;
                emit TokensMinted(players[i], coinsCollected[i], tokensToMint, sessionIds[i]);
            }
        }
    }
    
    /**
     * @dev Update the reward rate (tokens per coin)
     * @param newRate New reward rate in wei
     */
    function setRewardRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be greater than 0");
        rewardRate = newRate;
        emit RewardRateUpdated(newRate);
    }
    
    /**
     * @dev Add a game admin
     * @param admin Address to add as admin
     */
    function addGameAdmin(address admin) external onlyOwner {
        require(admin != address(0), "Invalid address");
        require(!gameAdmins[admin], "Already an admin");
        gameAdmins[admin] = true;
        emit GameAdminAdded(admin);
    }
    
    /**
     * @dev Remove a game admin
     * @param admin Address to remove as admin
     */
    function removeGameAdmin(address admin) external onlyOwner {
        require(gameAdmins[admin], "Not an admin");
        gameAdmins[admin] = false;
        emit GameAdminRemoved(admin);
    }
    
    /**
     * @dev Check if a session has been claimed
     * @param sessionId The session ID to check
     */
    function isSessionClaimed(bytes32 sessionId) external view returns (bool) {
        return claimedSessions[sessionId];
    }
    
    /**
     * @dev Get player statistics
     * @param player Address of the player
     */
    function getPlayerStats(address player) external view returns (
        uint256 balance,
        uint256 totalTokensEarned
    ) {
        return (balanceOf(player), totalEarned[player]);
    }
}