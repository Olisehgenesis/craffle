// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DailyRaffle
 * @dev A daily raffle contract where participants buy tickets with GloDollar tokens
 * and 3 winners are predetermined by default, which can be modified if the raffle hasn't ended.
 */
contract DailyRaffle is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Default number of winners (changed from 10 to 3)
    uint256 public constant DEFAULT_WINNERS_COUNT = 3;

    // GloDollar token contract
    IERC20 public immutable gloDollarToken;

    // Struct to store raffle information
    struct Raffle {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 ticketPrice; // In GloDollar tokens (1 GloDollar = 1 ticket)
        uint256 totalTickets;
        uint256 prizePool;
        bool completed;
        address[] winners;
        mapping(address => uint256) ticketsPurchased;
        address[] participants;
        uint256 dayNumber; // Day number since contract deployment
    }

    // Mapping of raffle ID to raffle
    mapping(uint256 => Raffle) public raffles;

    // Mapping of day number to raffle ID
    mapping(uint256 => uint256) public dayToRaffleId;

    // Current raffle ID
    uint256 public currentRaffleId;

    // Contract deployment timestamp
    uint256 public immutable deploymentTime;

    // Events
    event RaffleCreated(uint256 indexed raffleId, uint256 startTime, uint256 endTime, uint256 dayNumber);
    event TicketPurchased(uint256 indexed raffleId, address indexed buyer, uint256 amount);
    event RaffleCompleted(uint256 indexed raffleId, address[] winners, uint256 prizePerWinner);
    event WinnersUpdated(uint256 indexed raffleId, address[] winners);
    event NewRaffleAutoCreated(uint256 indexed raffleId, uint256 dayNumber);
    event DailyRaffleCreated(uint256 indexed raffleId, uint256 dayNumber, address creator);
    event WinnersAutoSelected(uint256 indexed raffleId, address[] winners, uint256 totalParticipants);

    /**
     * @dev Constructor to initialize the contract
     * @param _gloDollarToken Address of the GloDollar token contract
     */
    constructor(address _gloDollarToken) {
        require(_gloDollarToken != address(0), "Invalid token address");
        gloDollarToken = IERC20(_gloDollarToken);
        deploymentTime = block.timestamp;
        // Start with raffle ID 1
        currentRaffleId = 1;

        // Initialize the first raffle to start immediately
        uint256 startTime = block.timestamp;
        uint256 endTime = _getNextMidnight();

        _createRaffle(startTime, endTime, 1);
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
     * @dev Internal function to create a new raffle with default 3 random winners
     * @param _startTime Start time of the raffle (UTC timestamp)
     * @param _endTime End time of the raffle (UTC timestamp)
     * @param _dayNumber Day number for this raffle
     */
    function _createRaffle(uint256 _startTime, uint256 _endTime, uint256 _dayNumber) internal {
        // Create a new raffle
        Raffle storage newRaffle = raffles[currentRaffleId];
        newRaffle.id = currentRaffleId;
        newRaffle.startTime = _startTime;
        newRaffle.endTime = _endTime;
        newRaffle.ticketPrice = 1 ether; // 1 GloDollar = 1 ticket (assuming 18 decimals)
        newRaffle.completed = false;
        newRaffle.dayNumber = _dayNumber;

        // Map day number to raffle ID
        dayToRaffleId[_dayNumber] = currentRaffleId;

        // Set 3 default winner slots (all to contract owner initially, to be changed later)
        address[] memory defaultWinners = new address[](DEFAULT_WINNERS_COUNT);
        for (uint256 i = 0; i < DEFAULT_WINNERS_COUNT; i++) {
            defaultWinners[i] = owner();
        }
        newRaffle.winners = defaultWinners;

        emit RaffleCreated(currentRaffleId, _startTime, _endTime, _dayNumber);
    }

    /**
     * @dev Create a daily raffle - can be called by anyone
     * @dev Creates a raffle for today if one doesn't already exist
     * @return raffleId The ID of the created raffle (0 if no raffle was created)
     * @return dayNumber The day number for which the raffle was created
     */
    function createDailyRaffle() external returns (uint256 raffleId, uint256 dayNumber) {
        uint256 todayDayNumber = _getDayNumber(block.timestamp);
        
        // Check if a raffle already exists for today
        require(dayToRaffleId[todayDayNumber] == 0, "Raffle already exists for today");
        
        // If current raffle has ended but not completed, complete it first
        if (currentRaffleId > 0) {
            Raffle storage currentRaffle = raffles[currentRaffleId];
            if (block.timestamp >= currentRaffle.endTime && !currentRaffle.completed) {
                _completeRaffle(currentRaffleId);
            }
        }
        
        // Create new raffle for today
        uint256 startTime = block.timestamp;
        uint256 endTime = _getNextMidnight();
        currentRaffleId++;
        
        _createRaffle(startTime, endTime, todayDayNumber);
        
        emit DailyRaffleCreated(currentRaffleId, todayDayNumber, msg.sender);
        
        return (currentRaffleId, todayDayNumber);
    }

    /**
     * @dev Get raffle for a specific day
     * @param dayNumber Day number (1-based, starting from deployment day)
     * @return raffleId Raffle ID for that day
     * @return startTime Raffle start time
     * @return endTime Raffle end time
     * @return ticketPrice Price per ticket in GloDollar tokens
     * @return totalTickets Total tickets sold
     * @return prizePool Total prize pool
     * @return completed Whether the raffle is completed
     */
    function getDayRaffle(uint256 dayNumber)
        external
        view
        returns (
            uint256 raffleId,
            uint256 startTime,
            uint256 endTime,
            uint256 ticketPrice,
            uint256 totalTickets,
            uint256 prizePool,
            bool completed
        )
    {
        uint256 raffleIdForDay = dayToRaffleId[dayNumber];
        require(raffleIdForDay != 0, "No raffle exists for this day");
        
        Raffle storage raffle = raffles[raffleIdForDay];
        return (
            raffle.id,
            raffle.startTime,
            raffle.endTime,
            raffle.ticketPrice,
            raffle.totalTickets,
            raffle.prizePool,
            raffle.completed
        );
    }

    /**
     * @dev Get today's raffle based on current timestamp
     * @return raffleId Raffle ID for today
     * @return startTime Raffle start time
     * @return endTime Raffle end time
     * @return ticketPrice Price per ticket in GloDollar tokens
     * @return totalTickets Total tickets sold
     * @return prizePool Total prize pool
     * @return completed Whether the raffle is completed
     */
    function getTodayRaffle()
        external
        view
        returns (
            uint256 raffleId,
            uint256 startTime,
            uint256 endTime,
            uint256 ticketPrice,
            uint256 totalTickets,
            uint256 prizePool,
            bool completed
        )
    {
        uint256 todayDayNumber = _getDayNumber(block.timestamp);
        uint256 raffleIdForToday = dayToRaffleId[todayDayNumber];
        
        // If no raffle exists for today, return current raffle
        if (raffleIdForToday == 0) {
            raffleIdForToday = currentRaffleId;
        }
        
        Raffle storage raffle = raffles[raffleIdForToday];
        return (
            raffle.id,
            raffle.startTime,
            raffle.endTime,
            raffle.ticketPrice,
            raffle.totalTickets,
            raffle.prizePool,
            raffle.completed
        );
    }

    /**
     * @dev Purchase tickets for the current raffle with GloDollar tokens
     * @param _amount Number of tickets to purchase
     */
    function buyTickets(uint256 _amount) external nonReentrant {
        uint256 raffleId = currentRaffleId;
        Raffle storage raffle = raffles[raffleId];

        require(block.timestamp >= raffle.startTime, "Raffle has not started yet");
        require(block.timestamp < raffle.endTime, "Raffle has ended");
        require(_amount > 0, "Amount must be greater than 0");

        uint256 totalCost = _amount * raffle.ticketPrice;
        
        // Transfer GloDollar tokens from user to contract
        gloDollarToken.safeTransferFrom(msg.sender, address(this), totalCost);

        // If this is the first time the participant is buying tickets
        if (raffle.ticketsPurchased[msg.sender] == 0) {
            raffle.participants.push(msg.sender);
        }

        // Update ticket count for the participant
        raffle.ticketsPurchased[msg.sender] += _amount;

        // Update total tickets and prize pool
        raffle.totalTickets += _amount;
        raffle.prizePool += totalCost;

        emit TicketPurchased(raffleId, msg.sender, _amount);
    }

    /**
     * @dev Buy tickets by specifying exact GloDollar token amount
     * @param _tokenAmount Amount of GloDollar tokens to spend
     */
    function buyTicketsWithTokens(uint256 _tokenAmount) external nonReentrant {
        uint256 raffleId = currentRaffleId;
        Raffle storage raffle = raffles[raffleId];

        require(block.timestamp >= raffle.startTime, "Raffle has not started yet");
        require(block.timestamp < raffle.endTime, "Raffle has ended");
        require(_tokenAmount > 0, "Must send tokens to buy tickets");

        uint256 ticketCount = _tokenAmount / raffle.ticketPrice;
        require(ticketCount > 0, "Insufficient tokens for even one ticket");

        // Calculate actual cost (in case of remainder)
        uint256 actualCost = ticketCount * raffle.ticketPrice;
        
        // Transfer exact amount needed
        gloDollarToken.safeTransferFrom(msg.sender, address(this), actualCost);

        // If this is the first time the participant is buying tickets
        if (raffle.ticketsPurchased[msg.sender] == 0) {
            raffle.participants.push(msg.sender);
        }

        // Update ticket count for the participant
        raffle.ticketsPurchased[msg.sender] += ticketCount;

        // Update total tickets and prize pool
        raffle.totalTickets += ticketCount;
        raffle.prizePool += actualCost;

        emit TicketPurchased(raffleId, msg.sender, ticketCount);
    }

    /**
     * @dev Check if current raffle has ended and create new one if needed
     * @return newRaffleCreated Whether a new raffle was created
     */
    function checkAndCreateNewRaffle() external returns (bool newRaffleCreated) {
        uint256 raffleId = currentRaffleId;
        Raffle storage raffle = raffles[raffleId];

        // If current raffle hasn't ended, return false
        if (block.timestamp < raffle.endTime) {
            return false;
        }

        // If current raffle has ended but not completed, complete it first
        if (!raffle.completed) {
            _completeRaffle(raffleId);
        }

        // Check if we need to create a new raffle for today
        uint256 todayDayNumber = _getDayNumber(block.timestamp);
        if (dayToRaffleId[todayDayNumber] == 0) {
            // Create new raffle for today
            uint256 startTime = block.timestamp;
            uint256 endTime = _getNextMidnight();
            currentRaffleId++;
            _createRaffle(startTime, endTime, todayDayNumber);
            
            emit NewRaffleAutoCreated(currentRaffleId, todayDayNumber);
            return true;
        }

        return false;
    }

    /**
     * @dev Complete the current raffle and distribute prizes
     */
    function completeRaffle() external nonReentrant {
        _completeRaffle(currentRaffleId);
    }

    /**
     * @dev Internal function to complete a raffle
     * @param raffleId ID of the raffle to complete
     */
    function _completeRaffle(uint256 raffleId) internal {
        Raffle storage raffle = raffles[raffleId];

        require(block.timestamp >= raffle.endTime, "Raffle has not ended yet");
        require(!raffle.completed, "Raffle has already been completed");

        // Mark the raffle as completed
        raffle.completed = true;

        // If no tickets were purchased, emit event and return
        if (raffle.totalTickets == 0) {
            emit RaffleCompleted(raffleId, new address[](0), 0);
            return;
        }

        // If there are participants, automatically select winners
        if (raffle.participants.length > 0) {
            address[] memory selectedWinners = _selectRandomWinners(raffleId);
            raffle.winners = selectedWinners;
            emit WinnersAutoSelected(raffleId, selectedWinners, raffle.participants.length);
        }

        // Calculate prize per winner
        uint256 prizePerWinner = raffle.prizePool / raffle.winners.length;

        // Distribute prizes to winners using GloDollar tokens
        for (uint256 i = 0; i < raffle.winners.length; i++) {
            address winner = raffle.winners[i];
            gloDollarToken.safeTransfer(winner, prizePerWinner);
        }

        emit RaffleCompleted(raffleId, raffle.winners, prizePerWinner);
    }

    /**
     * @dev Automatically select random winners based on ticket weighting
     * @param raffleId ID of the raffle to select winners for
     * @return selectedWinners Array of selected winner addresses
     */
    function _selectRandomWinners(uint256 raffleId) internal view returns (address[] memory selectedWinners) {
        Raffle storage raffle = raffles[raffleId];
        
        // If no participants or tickets, return empty array
        if (raffle.participants.length == 0 || raffle.totalTickets == 0) {
            return new address[](0);
        }
        
        // Determine number of winners - if fewer participants than winner slots, all participants win
        uint256 winnerCount = raffle.winners.length;
        if (winnerCount > raffle.participants.length) {
            winnerCount = raffle.participants.length;
        }
        
        selectedWinners = new address[](winnerCount);
        
        // Create a weighted ticket array for fair selection
        address[] memory ticketHolders = new address[](raffle.totalTickets);
        uint256 ticketIndex = 0;
        
        // Fill the array with addresses based on tickets purchased
        for (uint256 i = 0; i < raffle.participants.length; i++) {
            address participant = raffle.participants[i];
            uint256 ticketCount = raffle.ticketsPurchased[participant];
            
            for (uint256 j = 0; j < ticketCount; j++) {
                ticketHolders[ticketIndex] = participant;
                ticketIndex++;
            }
        }
        
        // Track selected winners to avoid duplicates
        address[] memory selectedAddresses = new address[](winnerCount);
        uint256 selectedCount = 0;
        
        // Generate pseudo-random seed using block data
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            raffleId,
            raffle.totalTickets,
            raffle.prizePool
        )));
        
        // Select winners without replacement
        for (uint256 attempt = 0; attempt < winnerCount * 10 && selectedCount < winnerCount; attempt++) {
            // Generate pseudo-random index
            uint256 randomIndex = uint256(keccak256(abi.encodePacked(seed, attempt))) % raffle.totalTickets;
            address selectedAddress = ticketHolders[randomIndex];
            
            // Check if this address hasn't been selected yet
            bool alreadySelected = false;
            for (uint256 i = 0; i < selectedCount; i++) {
                if (selectedAddresses[i] == selectedAddress) {
                    alreadySelected = true;
                    break;
                }
            }
            
            if (!alreadySelected) {
                selectedWinners[selectedCount] = selectedAddress;
                selectedAddresses[selectedCount] = selectedAddress;
                selectedCount++;
            }
        }
        
        // If we couldn't select enough unique winners, fill remaining slots
        if (selectedCount < winnerCount) {
            for (uint256 i = 0; i < raffle.participants.length && selectedCount < winnerCount; i++) {
                address participant = raffle.participants[i];
                
                // Check if this participant hasn't been selected yet
                bool alreadySelected = false;
                for (uint256 j = 0; j < selectedCount; j++) {
                    if (selectedAddresses[j] == participant) {
                        alreadySelected = true;
                        break;
                    }
                }
                
                if (!alreadySelected) {
                    selectedWinners[selectedCount] = participant;
                    selectedAddresses[selectedCount] = participant;
                    selectedCount++;
                }
            }
        }
        
        // Resize array if needed
        if (selectedCount < winnerCount) {
            address[] memory resizedWinners = new address[](selectedCount);
            for (uint256 i = 0; i < selectedCount; i++) {
                resizedWinners[i] = selectedWinners[i];
            }
            return resizedWinners;
        }
        
        return selectedWinners;
    }

    /**
     * @dev Set winners for a raffle (owner only)
     * @param _raffleId ID of the raffle
     * @param _winners Array of winner addresses
     */
    function setWinners(uint256 _raffleId, address[] memory _winners) external onlyOwner {
        Raffle storage raffle = raffles[_raffleId];
        require(!raffle.completed, "Raffle has already been completed");
        require(_winners.length > 0, "Must have at least one winner");

        raffle.winners = _winners;

        emit WinnersUpdated(_raffleId, _winners);
    }

    /**
     * @dev Set the number of winners for a raffle
     * @param _raffleId ID of the raffle
     * @param _winnerCount Number of winners to set
     */
    function setWinnerCount(uint256 _raffleId, uint256 _winnerCount) external onlyOwner {
        require(_winnerCount > 0, "Must have at least one winner");
        Raffle storage raffle = raffles[_raffleId];
        require(!raffle.completed, "Raffle has already been completed");

        // Create a new array with the specified number of winners
        address[] memory newWinners = new address[](_winnerCount);

        // Copy existing winners if possible
        for (uint256 i = 0; i < _winnerCount && i < raffle.winners.length; i++) {
            newWinners[i] = raffle.winners[i];
        }

        // Fill any remaining slots with the owner's address (to be changed later)
        for (uint256 i = raffle.winners.length; i < _winnerCount; i++) {
            newWinners[i] = owner();
        }

        raffle.winners = newWinners;

        emit WinnersUpdated(_raffleId, newWinners);
    }

    /**
     * @dev Manually trigger winner selection for a raffle (owner only)
     * @param _raffleId ID of the raffle to select winners for
     * @return selectedWinners Array of selected winner addresses
     */
    function selectWinners(uint256 _raffleId) external onlyOwner returns (address[] memory selectedWinners) {
        Raffle storage raffle = raffles[_raffleId];
        require(!raffle.completed, "Raffle has already been completed");
        require(raffle.participants.length > 0, "No participants in raffle");
        
        selectedWinners = _selectRandomWinners(_raffleId);
        raffle.winners = selectedWinners;
        
        emit WinnersUpdated(_raffleId, selectedWinners);
        return selectedWinners;
    }

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
     * @dev Get the number of tickets purchased by a participant in a raffle
     * @param _raffleId ID of the raffle
     * @param _participant Address of the participant
     * @return Number of tickets purchased
     */
    function getTicketsPurchased(uint256 _raffleId, address _participant) external view returns (uint256) {
        return raffles[_raffleId].ticketsPurchased[_participant];
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
     * @dev Get the winners of a raffle
     * @param _raffleId ID of the raffle
     * @return Array of winner addresses
     */
    function getWinners(uint256 _raffleId) external view returns (address[] memory) {
        return raffles[_raffleId].winners;
    }

    /**
     * @dev Get current raffle info
     * @return raffleId Current raffle ID
     * @return startTime Raffle start time
     * @return endTime Raffle end time
     * @return ticketPrice Price per ticket in GloDollar tokens
     * @return totalTickets Total tickets sold
     * @return prizePool Total prize pool
     * @return completed Whether the raffle is completed
     */
    function getCurrentRaffleInfo()
        external
        view
        returns (
            uint256 raffleId,
            uint256 startTime,
            uint256 endTime,
            uint256 ticketPrice,
            uint256 totalTickets,
            uint256 prizePool,
            bool completed
        )
    {
        Raffle storage raffle = raffles[currentRaffleId];
        return (
            raffle.id,
            raffle.startTime,
            raffle.endTime,
            raffle.ticketPrice,
            raffle.totalTickets,
            raffle.prizePool,
            raffle.completed
        );
    }

    /**
     * @dev Check if a raffle exists for a given day
     * @param dayNumber Day number to check
     * @return exists Whether raffle exists for that day
     */
    function raffleExistsForDay(uint256 dayNumber) external view returns (bool exists) {
        return dayToRaffleId[dayNumber] != 0;
    }

    /**
     * @dev Get raffle statistics for multiple days
     * @param startDay Starting day number
     * @param endDay Ending day number
     * @return raffleIds Array of raffle IDs
     * @return totalTicketsArray Array of total tickets for each raffle
     * @return prizePoolsArray Array of prize pools for each raffle
     * @return completedArray Array of completion status for each raffle
     */
    function getRaffleStats(uint256 startDay, uint256 endDay)
        external
        view
        returns (
            uint256[] memory raffleIds,
            uint256[] memory totalTicketsArray,
            uint256[] memory prizePoolsArray,
            bool[] memory completedArray
        )
    {
        require(startDay <= endDay, "Invalid day range");
        uint256 dayCount = endDay - startDay + 1;
        
        raffleIds = new uint256[](dayCount);
        totalTicketsArray = new uint256[](dayCount);
        prizePoolsArray = new uint256[](dayCount);
        completedArray = new bool[](dayCount);

        for (uint256 i = 0; i < dayCount; i++) {
            uint256 dayNumber = startDay + i;
            uint256 raffleId = dayToRaffleId[dayNumber];
            
            raffleIds[i] = raffleId;
            if (raffleId != 0) {
                Raffle storage raffle = raffles[raffleId];
                totalTicketsArray[i] = raffle.totalTickets;
                prizePoolsArray[i] = raffle.prizePool;
                completedArray[i] = raffle.completed;
            }
        }
    }

    /**
     * @dev Emergency function to withdraw GloDollar tokens in case of issues
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = gloDollarToken.balanceOf(address(this));
        gloDollarToken.safeTransfer(owner(), balance);
    }

    /**
     * @dev Get contract deployment timestamp
     * @return Deployment timestamp
     */
    function getDeploymentTime() external view returns (uint256) {
        return deploymentTime;
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
     * @dev Get the GloDollar token address
     * @return Token contract address
     */
    function getTokenAddress() external view returns (address) {
        return address(gloDollarToken);
    }
}