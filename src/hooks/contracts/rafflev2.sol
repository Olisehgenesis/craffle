// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DailyRaffle
 * @dev A daily raffle contract where participants buy tickets with ETH
 * and winners are selected fairly with one wallet per winning slot
 */
contract DailyRaffle is Ownable(msg.sender), ReentrancyGuard {
    // Default number of winners
    uint256 public constant DEFAULT_WINNERS_COUNT = 10;

    // Admin role mapping
    mapping(address => bool) public isAdmin;

    // Struct to store raffle information
    struct Raffle {
        uint256 id;
        string name; // Name of the raffle
        uint256 startTime;
        uint256 endTime;
        uint256 ticketPrice; // In ETH (1 ETH = 1 ticket)
        uint256 totalTickets;
        uint256 prizePool;
        bool completed;
        address[] winners;
        mapping(address => uint256) ticketsPurchased;
        address[] participants;
        uint256 dayNumber; // Day number since contract deployment
        address creator; // Who created this raffle
        uint256 maxWinners; // Maximum number of winners for this raffle
        mapping(address => bool) hasWon; // Track if address has already won
    }

    // Mapping of raffle ID to raffle
    mapping(uint256 => Raffle) public raffles;

    // Mapping of day number to raffle ID
    mapping(uint256 => uint256) public dayToRaffleId;

    // Current raffle ID
    uint256 public currentRaffleId;

    // Contract deployment timestamp
    uint256 public immutable deploymentTime;

    // Raffle creation fee (to prevent spam)
    uint256 public raffleCreationFee = 0.01 ether;

    // Minimum raffle duration
    uint256 public constant MIN_RAFFLE_DURATION = 1 hours;

    // Maximum raffle duration
    uint256 public constant MAX_RAFFLE_DURATION = 7 days;

    // Events
    event RaffleCreated(
        uint256 indexed raffleId, string name, uint256 startTime, uint256 endTime, uint256 dayNumber, address creator
    );
    event TicketPurchased(uint256 indexed raffleId, address indexed buyer, uint256 amount);
    event RaffleCompleted(uint256 indexed raffleId, address[] winners, uint256 prizePerWinner);
    event WinnersUpdated(uint256 indexed raffleId, address[] winners);
    event NewRaffleAutoCreated(uint256 indexed raffleId, string name, uint256 dayNumber);
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event RaffleCreationFeeUpdated(uint256 newFee);
    event RaffleNameUpdated(uint256 indexed raffleId, string newName);

    modifier onlyAdminOrOwner() {
        require(isAdmin[msg.sender] || msg.sender == owner(), "Only admin or owner can call this function");
        _;
    }

    /**
     * @dev Constructor to initialize the contract
     */
    constructor() {
        deploymentTime = block.timestamp;
        // Start with raffle ID 1
        currentRaffleId = 1;

        // Add owner as admin
        isAdmin[msg.sender] = true;

        // Initialize the first raffle to start immediately
        uint256 startTime = block.timestamp;
        uint256 endTime = _getNextMidnight();

        _createRaffle("Daily Raffle #1", startTime, endTime, 1, msg.sender, DEFAULT_WINNERS_COUNT);
    }

    /**
     * @dev Add an admin
     * @param admin Address to add as admin
     */
    function addAdmin(address admin) external onlyOwner {
        require(admin != address(0), "Admin cannot be zero address");
        require(!isAdmin[admin], "Address is already an admin");

        isAdmin[admin] = true;
        emit AdminAdded(admin);
    }

    /**
     * @dev Remove an admin
     * @param admin Address to remove from admin
     */
    function removeAdmin(address admin) external onlyOwner {
        require(isAdmin[admin], "Address is not an admin");
        require(admin != owner(), "Cannot remove owner as admin");

        isAdmin[admin] = false;
        emit AdminRemoved(admin);
    }

    /**
     * @dev Set raffle creation fee
     * @param newFee New creation fee in wei
     */
    function setRaffleCreationFee(uint256 newFee) external onlyOwner {
        raffleCreationFee = newFee;
        emit RaffleCreationFeeUpdated(newFee);
    }

    /**
     * @dev Gets the timestamp for the next midnight UTC (00:00)
     * @return Timestamp for next midnight
     */
    function _getNextMidnight() internal view returns (uint256) {
        // Get current timestamp
        uint256 timestamp = block.timestamp;

        // Calculate seconds since midnight
        uint256 secondsInDay = 86400; // 24 * 60 * 60
        uint256 secondsSinceMidnight = timestamp % secondsInDay;

        // Calculate timestamp for next midnight
        return timestamp + secondsInDay - secondsSinceMidnight;
    }

    /**
     * @dev Calculate the day number since contract deployment
     * @param timestamp The timestamp to calculate day for
     * @return Day number (1-based)
     */
    function _getDayNumber(uint256 timestamp) internal view returns (uint256) {
        return ((timestamp - deploymentTime) / 1 days) + 1;
    }

    /**
     * @dev Get current day number
     * @return Current day number since deployment
     */
    function getCurrentDayNumber() external view returns (uint256) {
        return _getDayNumber(block.timestamp);
    }

    /**
     * @dev Internal function to create a new raffle
     * @param _name Name of the raffle
     * @param _startTime Start time of the raffle (UTC timestamp)
     * @param _endTime End time of the raffle (UTC timestamp)
     * @param _dayNumber Day number for this raffle
     * @param _creator Address of the raffle creator
     * @param _maxWinners Maximum number of winners
     */
    function _createRaffle(
        string memory _name,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _dayNumber,
        address _creator,
        uint256 _maxWinners
    ) internal {
        require(bytes(_name).length > 0, "Raffle name cannot be empty");
        require(bytes(_name).length <= 100, "Raffle name too long");

        // Create a new raffle
        Raffle storage newRaffle = raffles[currentRaffleId];
        newRaffle.id = currentRaffleId;
        newRaffle.name = _name;
        newRaffle.startTime = _startTime;
        newRaffle.endTime = _endTime;
        newRaffle.ticketPrice = 1 ether; // 1 ETH = 1 ticket
        newRaffle.completed = false;
        newRaffle.dayNumber = _dayNumber;
        newRaffle.creator = _creator;
        newRaffle.maxWinners = _maxWinners;

        // Map day number to raffle ID
        dayToRaffleId[_dayNumber] = currentRaffleId;

        emit RaffleCreated(currentRaffleId, _name, _startTime, _endTime, _dayNumber, _creator);
    }

    /**
     * @dev Create a custom raffle (anyone can call)
     * @param _name Name of the raffle
     * @param _startTime Start time of the raffle
     * @param _endTime End time of the raffle
     * @param _maxWinners Maximum number of winners
     * @return raffleId The ID of the created raffle
     */
    function createCustomRaffle(string memory _name, uint256 _startTime, uint256 _endTime, uint256 _maxWinners)
        external
        payable
        returns (uint256 raffleId)
    {
        require(msg.value >= raffleCreationFee, "Insufficient creation fee");
        require(bytes(_name).length > 0, "Raffle name cannot be empty");
        require(bytes(_name).length <= 100, "Raffle name too long");
        require(_startTime >= block.timestamp, "Start time must be in the future");
        require(_endTime > _startTime, "End time must be after start time");
        require(_endTime - _startTime >= MIN_RAFFLE_DURATION, "Raffle duration too short");
        require(_endTime - _startTime <= MAX_RAFFLE_DURATION, "Raffle duration too long");
        require(_maxWinners > 0 && _maxWinners <= 100, "Invalid number of winners");

        // For custom raffles, use current raffle ID + 1000000 to distinguish from daily raffles
        uint256 customRaffleId = currentRaffleId + 1000000;

        // Create the raffle with custom ID
        Raffle storage newRaffle = raffles[customRaffleId];
        newRaffle.id = customRaffleId;
        newRaffle.name = _name;
        newRaffle.startTime = _startTime;
        newRaffle.endTime = _endTime;
        newRaffle.ticketPrice = 1 ether;
        newRaffle.completed = false;
        newRaffle.dayNumber = 0; // Custom raffles don't have day numbers
        newRaffle.creator = msg.sender;
        newRaffle.maxWinners = _maxWinners;

        emit RaffleCreated(customRaffleId, _name, _startTime, _endTime, 0, msg.sender);

        return customRaffleId;
    }

    /**
     * @dev Get raffle for a specific day
     * @param dayNumber Day number (1-based, starting from deployment day)
     * @return raffleId Raffle ID for that day
     * @return name Name of the raffle
     * @return startTime Raffle start time
     * @return endTime Raffle end time
     * @return ticketPrice Price per ticket in ETH
     * @return totalTickets Total tickets sold
     * @return prizePool Total prize pool
     * @return completed Whether the raffle is completed
     * @return creator Address of raffle creator
     * @return maxWinners Maximum number of winners
     */
    function getDayRaffle(uint256 dayNumber)
        external
        view
        returns (
            uint256 raffleId,
            string memory name,
            uint256 startTime,
            uint256 endTime,
            uint256 ticketPrice,
            uint256 totalTickets,
            uint256 prizePool,
            bool completed,
            address creator,
            uint256 maxWinners
        )
    {
        uint256 raffleIdForDay = dayToRaffleId[dayNumber];
        require(raffleIdForDay != 0, "No raffle exists for this day");

        Raffle storage raffle = raffles[raffleIdForDay];
        return (
            raffle.id,
            raffle.name,
            raffle.startTime,
            raffle.endTime,
            raffle.ticketPrice,
            raffle.totalTickets,
            raffle.prizePool,
            raffle.completed,
            raffle.creator,
            raffle.maxWinners
        );
    }

    /**
     * @dev Get raffle information by ID
     * @param raffleId ID of the raffle
     * @return id Raffle ID
     * @return name Name of the raffle
     * @return startTime Raffle start time
     * @return endTime Raffle end time
     * @return ticketPrice Price per ticket in ETH
     * @return totalTickets Total tickets sold
     * @return prizePool Total prize pool
     * @return completed Whether the raffle is completed
     * @return creator Address of raffle creator
     * @return maxWinners Maximum number of winners
     * @return dayNumber Day number of the raffle
     */
    function getRaffleInfo(uint256 raffleId)
        external
        view
        returns (
            uint256 id,
            string memory name,
            uint256 startTime,
            uint256 endTime,
            uint256 ticketPrice,
            uint256 totalTickets,
            uint256 prizePool,
            bool completed,
            address creator,
            uint256 maxWinners,
            uint256 dayNumber
        )
    {
        Raffle storage raffle = raffles[raffleId];
        require(raffle.id != 0, "Raffle does not exist");

        return (
            raffle.id,
            raffle.name,
            raffle.startTime,
            raffle.endTime,
            raffle.ticketPrice,
            raffle.totalTickets,
            raffle.prizePool,
            raffle.completed,
            raffle.creator,
            raffle.maxWinners,
            raffle.dayNumber
        );
    }

    /**
     * @dev Purchase tickets for any raffle
     * @param raffleId ID of the raffle to participate in
     * @param _amount Number of tickets to purchase
     */
    function buyTickets(uint256 raffleId, uint256 _amount) external payable nonReentrant {
        Raffle storage raffle = raffles[raffleId];
        require(raffle.id != 0, "Raffle does not exist");

        require(block.timestamp >= raffle.startTime, "Raffle has not started yet");
        require(block.timestamp < raffle.endTime, "Raffle has ended");
        require(_amount > 0, "Amount must be greater than 0");

        uint256 totalCost = _amount * raffle.ticketPrice;
        require(msg.value == totalCost, "Incorrect ETH amount sent");

        // If this is the first time the participant is buying tickets
        if (raffle.ticketsPurchased[msg.sender] == 0) {
            raffle.participants.push(msg.sender);
        }

        // Update ticket count for the participant
        raffle.ticketsPurchased[msg.sender] += _amount;

        // Update total tickets and prize pool
        raffle.totalTickets += _amount;
        raffle.prizePool += msg.value;

        emit TicketPurchased(raffleId, msg.sender, _amount);
    }

    /**
     * @dev Buy tickets with ETH amount for any raffle
     * @param raffleId ID of the raffle to participate in
     */
    function buyTicketsWithEth(uint256 raffleId) external payable nonReentrant {
        Raffle storage raffle = raffles[raffleId];
        require(raffle.id != 0, "Raffle does not exist");

        require(block.timestamp >= raffle.startTime, "Raffle has not started yet");
        require(block.timestamp < raffle.endTime, "Raffle has ended");
        require(msg.value > 0, "Must send ETH to buy tickets");

        uint256 ticketCount = msg.value / raffle.ticketPrice;
        require(ticketCount > 0, "Insufficient ETH for even one ticket");

        // Calculate actual cost (in case of remainder)
        uint256 actualCost = ticketCount * raffle.ticketPrice;
        uint256 refund = msg.value - actualCost;

        // If this is the first time the participant is buying tickets
        if (raffle.ticketsPurchased[msg.sender] == 0) {
            raffle.participants.push(msg.sender);
        }

        // Update ticket count for the participant
        raffle.ticketsPurchased[msg.sender] += ticketCount;

        // Update total tickets and prize pool
        raffle.totalTickets += ticketCount;
        raffle.prizePool += actualCost;

        // Refund excess ETH if any
        if (refund > 0) {
            (bool success,) = msg.sender.call{value: refund}("");
            require(success, "Refund failed");
        }

        emit TicketPurchased(raffleId, msg.sender, ticketCount);
    }

    /**
     * @dev Update raffle name (only creator, admin, or owner can update)
     * @param raffleId ID of the raffle
     * @param newName New name for the raffle
     */
    function updateRaffleName(uint256 raffleId, string memory newName) external {
        Raffle storage raffle = raffles[raffleId];
        require(raffle.id != 0, "Raffle does not exist");
        require(!raffle.completed, "Cannot update completed raffle name");
        require(
            msg.sender == raffle.creator || isAdmin[msg.sender] || msg.sender == owner(),
            "Only creator, admin, or owner can update raffle name"
        );
        require(bytes(newName).length > 0, "Raffle name cannot be empty");
        require(bytes(newName).length <= 100, "Raffle name too long");

        raffle.name = newName;
        emit RaffleNameUpdated(raffleId, newName);
    }

    /**
     * @dev Get raffle name
     * @param raffleId ID of the raffle
     * @return name Name of the raffle
     */
    function getRaffleName(uint256 raffleId) external view returns (string memory name) {
        require(raffles[raffleId].id != 0, "Raffle does not exist");
        return raffles[raffleId].name;
    }

    /**
     * @dev Search raffles by name (partial match)
     * @param searchTerm Term to search for in raffle names
     * @param maxResults Maximum number of results to return
     * @return raffleIds Array of matching raffle IDs
     * @return names Array of matching raffle names
     */
    function searchRafflesByName(string memory searchTerm, uint256 maxResults)
        external
        view
        returns (uint256[] memory raffleIds, string[] memory names)
    {
        require(bytes(searchTerm).length > 0, "Search term cannot be empty");
        require(maxResults > 0 && maxResults <= 100, "Invalid max results");

        uint256[] memory tempIds = new uint256[](maxResults);
        string[] memory tempNames = new string[](maxResults);
        uint256 count = 0;

        // Search through raffles (this is not gas efficient for large numbers)
        for (uint256 i = 1; i <= currentRaffleId + 1000000 && count < maxResults; i++) {
            if (raffles[i].id != 0) {
                string memory raffleName = raffles[i].name;
                if (_containsSubstring(raffleName, searchTerm)) {
                    tempIds[count] = i;
                    tempNames[count] = raffleName;
                    count++;
                }
            }
        }

        // Create arrays with exact size
        raffleIds = new uint256[](count);
        names = new string[](count);

        for (uint256 i = 0; i < count; i++) {
            raffleIds[i] = tempIds[i];
            names[i] = tempNames[i];
        }

        return (raffleIds, names);
    }

    /**
     * @dev Helper function to check if a string contains a substring (case-insensitive)
     * @param str Main string
     * @param substr Substring to search for
     * @return contains Whether the substring is found
     */
    function _containsSubstring(string memory str, string memory substr) internal pure returns (bool contains) {
        bytes memory strBytes = bytes(str);
        bytes memory substrBytes = bytes(substr);

        if (substrBytes.length > strBytes.length) {
            return false;
        }

        for (uint256 i = 0; i <= strBytes.length - substrBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < substrBytes.length; j++) {
                // Simple case-insensitive comparison (only for ASCII)
                uint8 strChar = uint8(strBytes[i + j]);
                uint8 substrChar = uint8(substrBytes[j]);

                // Convert to lowercase
                if (strChar >= 65 && strChar <= 90) strChar += 32;
                if (substrChar >= 65 && substrChar <= 90) substrChar += 32;

                if (strChar != substrChar) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return true;
            }
        }
        return false;
    }
    /**
     * @dev Generate random winners for a raffle (Admin or Owner only)
     * @param raffleId ID of the raffle
     * @return winners Array of unique winner addresses
     */

    function generateRandomWinners(uint256 raffleId) external onlyAdminOrOwner returns (address[] memory winners) {
        Raffle storage raffle = raffles[raffleId];
        require(raffle.id != 0, "Raffle does not exist");
        require(block.timestamp >= raffle.endTime, "Raffle has not ended yet");
        require(!raffle.completed, "Raffle has already been completed");
        require(raffle.participants.length > 0, "No participants in raffle");

        uint256 numWinners = raffle.maxWinners;
        if (numWinners > raffle.participants.length) {
            numWinners = raffle.participants.length;
        }

        winners = new address[](numWinners);
        address[] memory availableParticipants = new address[](raffle.participants.length);

        // Copy participants to available list
        for (uint256 i = 0; i < raffle.participants.length; i++) {
            availableParticipants[i] = raffle.participants[i];
        }

        uint256 remainingParticipants = raffle.participants.length;

        // Select winners without duplicates
        for (uint256 i = 0; i < numWinners; i++) {
            // Generate random index
            uint256 randomIndex = uint256(
                keccak256(abi.encodePacked(block.timestamp, block.difficulty, msg.sender, i, raffleId))
            ) % remainingParticipants;

            // Select winner
            winners[i] = availableParticipants[randomIndex];
            raffle.hasWon[winners[i]] = true;

            // Remove selected participant by swapping with last element
            availableParticipants[randomIndex] = availableParticipants[remainingParticipants - 1];
            remainingParticipants--;
        }

        raffle.winners = winners;
        emit WinnersUpdated(raffleId, winners);

        return winners;
    }

    /**
     * @dev Complete any raffle and distribute prizes
     * @param raffleId ID of the raffle to complete
     */
    function completeRaffle(uint256 raffleId) external nonReentrant {
        _completeRaffle(raffleId);
    }

    /**
     * @dev Internal function to complete a raffle
     * @param raffleId ID of the raffle to complete
     */
    function _completeRaffle(uint256 raffleId) internal {
        Raffle storage raffle = raffles[raffleId];
        require(raffle.id != 0, "Raffle does not exist");

        require(block.timestamp >= raffle.endTime, "Raffle has not ended yet");
        require(!raffle.completed, "Raffle has already been completed");

        // Mark the raffle as completed
        raffle.completed = true;

        // If no tickets were purchased, emit event and return
        if (raffle.totalTickets == 0) {
            emit RaffleCompleted(raffleId, new address[](0), 0);
            return;
        }

        // If no winners set, use participants
        if (raffle.winners.length == 0) {
            require(isAdmin[msg.sender] || msg.sender == owner(), "Only admin can complete raffle without winners set");
            // This should not happen if generateRandomWinners was called
            revert("Winners must be set before completion");
        }

        // Calculate prize per winner
        uint256 prizePerWinner = raffle.prizePool / raffle.winners.length;

        // Distribute prizes to winners
        for (uint256 i = 0; i < raffle.winners.length; i++) {
            address payable winner = payable(raffle.winners[i]);
            (bool success,) = winner.call{value: prizePerWinner}("");
            require(success, "Prize transfer failed");
        }

        emit RaffleCompleted(raffleId, raffle.winners, prizePerWinner);
    }

    /**
     * @dev Set or update winners for the specified raffle (Admin only)
     * @param _raffleId ID of the raffle
     * @param _winners Array of winner addresses
     */
    function setWinners(uint256 _raffleId, address[] memory _winners) external onlyAdminOrOwner {
        Raffle storage raffle = raffles[_raffleId];
        require(raffle.id != 0, "Raffle does not exist");
        require(!raffle.completed, "Raffle has already been completed");
        require(_winners.length > 0, "Must have at least one winner");
        require(_winners.length <= raffle.maxWinners, "Too many winners");

        // Check for duplicates
        for (uint256 i = 0; i < _winners.length; i++) {
            require(_winners[i] != address(0), "Winner cannot be zero address");
            for (uint256 j = i + 1; j < _winners.length; j++) {
                require(_winners[i] != _winners[j], "Duplicate winner addresses not allowed");
            }
        }

        raffle.winners = _winners;

        emit WinnersUpdated(_raffleId, _winners);
    }

    /**
     * @dev Set the number of winners for a raffle (Admin only)
     * @param _raffleId ID of the raffle
     * @param _winnerCount Number of winners to set
     */
    function setWinnerCount(uint256 _raffleId, uint256 _winnerCount) external onlyAdminOrOwner {
        require(_winnerCount > 0 && _winnerCount <= 100, "Invalid winner count");
        Raffle storage raffle = raffles[_raffleId];
        require(raffle.id != 0, "Raffle does not exist");
        require(!raffle.completed, "Raffle has already been completed");

        raffle.maxWinners = _winnerCount;

        // Clear existing winners when changing count
        delete raffle.winners;

        emit WinnersUpdated(_raffleId, new address[](0));
    }

    /**
     * @dev Get all active raffles
     * @return activeRaffles Array of active raffle IDs
     */
    function getActiveRaffles() external view returns (uint256[] memory activeRaffles) {
        uint256 count = 0;

        // Count active raffles (this is not gas efficient for large numbers, consider pagination)
        for (uint256 i = 1; i <= currentRaffleId + 1000000; i++) {
            if (raffles[i].id != 0 && !raffles[i].completed && block.timestamp < raffles[i].endTime) {
                count++;
            }
        }

        activeRaffles = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i <= currentRaffleId + 1000000; i++) {
            if (raffles[i].id != 0 && !raffles[i].completed && block.timestamp < raffles[i].endTime) {
                activeRaffles[index] = i;
                index++;
            }
        }

        return activeRaffles;
    }

    /**
     * @dev Get participant's total tickets across all raffles
     * @param participant Address of participant
     * @return totalTickets Total tickets purchased
     * @return totalSpent Total ETH spent
     */
    function getParticipantStats(address participant)
        external
        view
        returns (uint256 totalTickets, uint256 totalSpent)
    {
        totalTickets = 0;
        totalSpent = 0;

        for (uint256 i = 1; i <= currentRaffleId + 1000000; i++) {
            if (raffles[i].id != 0) {
                uint256 tickets = raffles[i].ticketsPurchased[participant];
                totalTickets += tickets;
                totalSpent += tickets * raffles[i].ticketPrice;
            }
        }

        return (totalTickets, totalSpent);
    }

    /**
     * @dev Check if address has won a specific raffle
     * @param raffleId ID of the raffle
     * @param participant Address to check
     * @return hasWon Whether the address has won
     */
    function hasParticipantWon(uint256 raffleId, address participant) external view returns (bool hasWon) {
        return raffles[raffleId].hasWon[participant];
    }

    // ... (include all other existing functions with minimal changes)

    /**
     * @dev Get user tickets for any raffle
     * @param _user User address
     * @param _raffleId Raffle ID
     * @return Number of tickets purchased by user
     */
    function getUserTickets(address _user, uint256 _raffleId) external view returns (uint256) {
        return raffles[_raffleId].ticketsPurchased[_user];
    }

    /**
     * @dev Get the winners of a raffle
     * @param _raffleId ID of the raffle
     * @return Array of winner addresses
     */
    function getWinners(uint256 _raffleId) external view returns (address[] memory) {
        return raffles[_raffleId].winners;
    }

    /**
     * @dev Get the list of participants in a raffle
     * @param _raffleId ID of the raffle
     * @return Array of participant addresses
     */
    function getParticipants(uint256 _raffleId) external view returns (address[] memory) {
        return raffles[_raffleId].participants;
    }

    /**
     * @dev Emergency function to withdraw ETH in case of issues
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success,) = owner().call{value: balance}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Check if current raffle is active (not ended)
     * @return active Whether current raffle is active
     */
    function isCurrentRaffleActive() external view returns (bool active) {
        Raffle storage raffle = raffles[currentRaffleId];
        return block.timestamp >= raffle.startTime && block.timestamp < raffle.endTime;
    }

    /**
     * @dev Check if specific raffle is active
     * @param raffleId ID of the raffle to check
     * @return active Whether the raffle is active
     */
    function isRaffleActive(uint256 raffleId) external view returns (bool active) {
        Raffle storage raffle = raffles[raffleId];
        return raffle.id != 0 && !raffle.completed && block.timestamp >= raffle.startTime
            && block.timestamp < raffle.endTime;
    }
}
