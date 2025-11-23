// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Zillopoly
 * @dev A simple guessing game where players bet on whether a random number will be under or over a threshold
 *
 * Game Rules:
 * - Players choose a threshold (1-99)
 * - Players bet HOBO tokens and guess "under" or "over"
 * - A random number (1-100) is generated
 * - If guess is correct: player wins 2x their bet
 * - If guess is wrong: player loses their bet
 *
 * WARNING: This uses block-based randomness which is NOT secure for production.
 * For production, use Chainlink VRF or similar oracle-based randomness.
 */
contract Zillopoly is Ownable, ReentrancyGuard {
    IERC20 public hoboToken;
    uint256 public houseBalance;
    uint256 public constant MIN_BET = 1e18; // 1 HOBO
    uint256 public maxBet = 100e18; // 100 HOBO

    enum Guess { UNDER, OVER }

    struct GameResult {
        address player;
        uint256 betAmount;
        uint256 threshold;
        Guess guess;
        uint256 rolledNumber;
        bool won;
        uint256 payout;
        uint256 timestamp;
    }

    mapping(address => GameResult[]) public playerHistory;
    GameResult[] public allGames;

    event GamePlayed(
        address indexed player,
        uint256 betAmount,
        uint256 threshold,
        Guess guess,
        uint256 rolledNumber,
        bool won,
        uint256 payout
    );
    event HouseFunded(uint256 amount);
    event HouseWithdrawn(uint256 amount);
    event MaxBetUpdated(uint256 newMaxBet);

    constructor(address _hoboToken) Ownable(msg.sender) {
        hoboToken = IERC20(_hoboToken);
    }

    /**
     * @dev Play the under/over game
     * @param betAmount Amount of HOBO tokens to bet
     * @param threshold The threshold number (1-99)
     * @param guess Whether the random number will be UNDER or OVER the threshold
     */
    function play(uint256 betAmount, uint256 threshold, Guess guess) external nonReentrant {
        require(betAmount >= MIN_BET, "Bet amount too low");
        require(betAmount <= maxBet, "Bet amount exceeds maximum");
        require(threshold >= 1 && threshold <= 99, "Threshold must be between 1 and 99");
        require(houseBalance >= betAmount, "House doesn't have enough balance");

        // Transfer bet from player
        require(hoboToken.transferFrom(msg.sender, address(this), betAmount), "Transfer failed");

        // Generate random number (1-100)
        // WARNING: This is NOT secure randomness - use Chainlink VRF for production
        uint256 rolledNumber = _generateRandomNumber();

        // Determine if player won
        bool won = false;
        if (guess == Guess.UNDER && rolledNumber < threshold) {
            won = true;
        } else if (guess == Guess.OVER && rolledNumber > threshold) {
            won = true;
        }

        uint256 payout = 0;
        if (won) {
            // Player wins 2x their bet
            payout = betAmount * 2;
            houseBalance -= betAmount; // House loses the player's winnings
            require(hoboToken.transfer(msg.sender, payout), "Payout transfer failed");
        } else {
            // Player loses, house keeps the bet
            houseBalance += betAmount;
        }

        // Record game result
        GameResult memory result = GameResult({
            player: msg.sender,
            betAmount: betAmount,
            threshold: threshold,
            guess: guess,
            rolledNumber: rolledNumber,
            won: won,
            payout: payout,
            timestamp: block.timestamp
        });

        playerHistory[msg.sender].push(result);
        allGames.push(result);

        emit GamePlayed(msg.sender, betAmount, threshold, guess, rolledNumber, won, payout);
    }

    /**
     * @dev Generate a pseudo-random number between 1 and 100
     * WARNING: Not cryptographically secure - for demo purposes only
     */
    function _generateRandomNumber() private view returns (uint256) {
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            allGames.length
        )));
        return (random % 100) + 1;
    }

    /**
     * @dev Owner can fund the house balance
     * @param amount Amount of HOBO tokens to add to house balance
     */
    function fundHouse(uint256 amount) external onlyOwner {
        require(hoboToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        houseBalance += amount;
        emit HouseFunded(amount);
    }

    /**
     * @dev Owner can withdraw from house balance
     * @param amount Amount of HOBO tokens to withdraw
     */
    function withdrawHouse(uint256 amount) external onlyOwner {
        require(amount <= houseBalance, "Insufficient house balance");
        houseBalance -= amount;
        require(hoboToken.transfer(msg.sender, amount), "Transfer failed");
        emit HouseWithdrawn(amount);
    }

    /**
     * @dev Update maximum bet amount
     * @param newMaxBet New maximum bet amount
     */
    function setMaxBet(uint256 newMaxBet) external onlyOwner {
        require(newMaxBet >= MIN_BET, "Max bet must be >= min bet");
        maxBet = newMaxBet;
        emit MaxBetUpdated(newMaxBet);
    }

    /**
     * @dev Get player's game history
     * @param player Address of the player
     * @return Array of game results for the player
     */
    function getPlayerHistory(address player) external view returns (GameResult[] memory) {
        return playerHistory[player];
    }

    /**
     * @dev Get total number of games played
     */
    function getTotalGames() external view returns (uint256) {
        return allGames.length;
    }

    /**
     * @dev Get game result by index
     * @param index Index of the game
     */
    function getGame(uint256 index) external view returns (GameResult memory) {
        require(index < allGames.length, "Game index out of bounds");
        return allGames[index];
    }
}
