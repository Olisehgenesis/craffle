// useRaffle.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  usePublicClient, 
  useWalletClient, 
  useWriteContract, 
  useWaitForTransactionReceipt,
  useAccount
} from 'wagmi';
import { parseEther } from 'viem';
import { raffleABI } from './abi';
import { celo } from 'viem/chains';

interface UseRaffleContractOptions {
  contractAddress?: `0x${string}`;
}

// Define RaffleInfo type for better type safety
interface RaffleInfo {
  raffleId: number;
  startTime: Date;
  endTime: Date;
  ticketPrice: bigint;
  totalTickets: number;
  prizePool: bigint;
  completed: boolean;
  timeRemaining: number;
  dayNumber?: number;
  isActive?: boolean;
}

// Define RaffleStats type for batch queries
interface RaffleStats {
  raffleIds: number[];
  totalTicketsArray: number[];
  prizePoolsArray: bigint[];
  completedArray: boolean[];
}

// Custom error class for raffle-specific errors
class RaffleError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'RaffleError';
  }
}

/**
 * Enhanced hook for interacting with the DailyRaffle contract
 */
export function useRaffleContract({ 
  contractAddress = "0xF274C1bde9AA841613266ecaca651000D9fD4Be5",
}: UseRaffleContractOptions = {}) {
  // Refs to prevent effects from running unnecessarily
  const mountedRef = useRef<boolean>(true);
  const lastFetchTime = useRef<number>(0);
  const lastRaffleId = useRef<number | null>(null);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const autoCheckInterval = useRef<ReturnType<typeof setInterval>>();
  const isInitialized = useRef<boolean>(false);
  const isCheckingRef = useRef<boolean>(false);
  
  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: celo.id });
  const { data: walletClient } = useWalletClient({
    account: address,
    chainId: celo.id 
  });
  
  // Write contract hooks
  const { 
    data: writeData, 
    writeContract, 
    isPending: isWritePending, 
    isSuccess: isWriteSuccess, 
    error: writeError,
    reset: resetWrite 
  } = useWriteContract();

  // Transaction receipt
  const { 
    data: txReceipt, 
    isLoading: isWaitingForTx, 
    isSuccess: isTxSuccess 
  } = useWaitForTransactionReceipt({
    hash: writeData,
  });
  console.log(txReceipt);
  
  // State variables - use stable initial values
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRaffleId, setCurrentRaffleId] = useState<number>(0);
  const [ticketPrice, setTicketPrice] = useState<bigint>(BigInt(0));
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [winners, setWinners] = useState<string[]>([]);
  const [raffleInfo, setRaffleInfo] = useState<RaffleInfo | null>(null);
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(0);
  const [deploymentTime, setDeploymentTime] = useState<number>(0);
  const [isAutoCheckingNewRaffle, setIsAutoCheckingNewRaffle] = useState<boolean>(false);

  // Set up cleanup effect
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (autoCheckInterval.current) {
        clearInterval(autoCheckInterval.current);
      }
    };
  }, []);

  // Initialize contract data - run once when components mount
  useEffect(() => {
    if (!publicClient || isInitialized.current) return;
    
    const initializeContract = async () => {
      console.log('[useRaffle] Initializing contract data');
      setLoading(true);
      isInitialized.current = true;
      
      try {
        // Fetch all initial data in parallel
        const [deploymentTimeResult, currentDayResult] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'getDeploymentTime',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'getCurrentDayNumber',
          }) as Promise<bigint>
        ]);
        
        if (mountedRef.current) {
          setDeploymentTime(Number(deploymentTimeResult));
          setCurrentDayNumber(Number(currentDayResult));
          
          // Fetch raffle info after basic contract info is loaded
          await fetchRaffleInfo();
        }
      } catch (err) {
        console.error('[useRaffle] Error initializing contract:', err);
        if (mountedRef.current) {
          setError('Failed to initialize contract data');
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };
    
    initializeContract();
  }, [publicClient, contractAddress]);

  // Check if user is owner - separate effect with stable dependencies
  useEffect(() => {
    if (!address || !publicClient || !isConnected) return;
    
    const checkOwner = async () => {
      try {
        const ownerResult = await publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'owner',
        });
        
        if (mountedRef.current) {
          setIsOwner(ownerResult === address);
        }
      } catch (err) {
        console.error('[useRaffle] Error checking owner:', err);
      }
    };
    
    checkOwner();
  }, [address, contractAddress, publicClient, isConnected]);

  // Fetch current raffle info - memoized with better error handling
  const fetchRaffleInfo = useCallback(async () => {
    if (!publicClient) {
      console.log('[useRaffle] Public client not available for fetch');
      return null;
    }
    
    // Debounce fetch calls to prevent excessive requests
    const now = Date.now();
    if (now - lastFetchTime.current < 3000) { // Increased debounce to 3 seconds
      console.log('[useRaffle] Skipping fetch due to debounce');
      return raffleInfo;
    }
    
    lastFetchTime.current = now;
    
    try {
      console.log('[useRaffle] Starting to fetch raffle info');
      
      // Get the current raffle ID first
      const raffleIdResult = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'currentRaffleId',
      }) as bigint;
      
      const currentId = Number(raffleIdResult);
      console.log('[useRaffle] Current raffle ID:', currentId);
      
      // Only skip if same raffle ID AND we have complete data
      if (currentId === lastRaffleId.current && raffleInfo && !raffleInfo.completed) {
        console.log('[useRaffle] Skipping update - same raffle ID and data exists');
        return raffleInfo;
      }
      
      lastRaffleId.current = currentId;
      
      if (mountedRef.current) {
        setCurrentRaffleId(currentId);
      }
      
      // Fetch raffle info and status in parallel
      const [result, isActive] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'getCurrentRaffleInfo',
        }) as Promise<[bigint, bigint, bigint, bigint, bigint, bigint, boolean]>,
        publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'isCurrentRaffleActive',
        }) as Promise<boolean>
      ]);
      
      const parsedInfo: RaffleInfo = {
        raffleId: Number(result[0]),
        startTime: new Date(Number(result[1]) * 1000),
        endTime: new Date(Number(result[2]) * 1000),
        ticketPrice: result[3],
        totalTickets: Number(result[4]),
        prizePool: result[5],
        completed: result[6],
        timeRemaining: Math.max(0, Number(result[2]) - Math.floor(Date.now() / 1000)),
        isActive
      };
      
      if (!mountedRef.current) return null;
      
      setRaffleInfo(parsedInfo);
      setTicketPrice(result[3]);
      setTimeRemaining(parsedInfo.timeRemaining);
      
      // Fetch winners if the raffle is completed
      if (parsedInfo.completed) {
        try {
          const winnersResult = await publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'getWinners',
            args: [result[0]],
          }) as `0x${string}`[];
          
          if (mountedRef.current) {
            setWinners(winnersResult);
          }
        } catch (winnersError) {
          console.error('[useRaffle] Error fetching winners:', winnersError);
          // Don't fail the entire fetch if winners fail
        }
      } else {
        // Clear winners if raffle is not completed
        if (mountedRef.current) {
          setWinners([]);
        }
      }
      
      if (mountedRef.current) {
        setError(null);
      }
      
      console.log('[useRaffle] Successfully fetched raffle info:', parsedInfo);
      return parsedInfo;
    } catch (err) {
      console.error('[useRaffle] Error fetching raffle info:', err);
      if (mountedRef.current) {
        setError('Failed to fetch raffle information');
      }
      return null;
    }
  }, [contractAddress, publicClient, raffleInfo]);

  // Auto-check for new raffles - improved with better timing
  useEffect(() => {
    if (!publicClient || !isInitialized.current) {
      console.log('[useRaffle] Auto-check disabled - not ready');
      return;
    }
    
    const checkForNewRaffle = async () => {
      // Prevent concurrent checks using ref instead of state
      if (isCheckingRef.current) {
        console.log('[useRaffle] Skipping auto-check - already in progress');
        return;
      }
      
      try {
        console.log('[useRaffle] Starting auto-check for new raffle');
        isCheckingRef.current = true;
        setIsAutoCheckingNewRaffle(true);
        
        const newRaffleCreated = await publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'checkAndCreateNewRaffle',
        }) as boolean;
        
        console.log('[useRaffle] Auto-check result:', newRaffleCreated);
        
        if (newRaffleCreated && mountedRef.current) {
          console.log('[useRaffle] New raffle created, refreshing info');
          // Force refresh raffle info
          lastRaffleId.current = null;
          lastFetchTime.current = 0;
          await fetchRaffleInfo();
        }
      } catch (err) {
        console.error('[useRaffle] Error checking for new raffle:', err);
      } finally {
        if (mountedRef.current) {
          isCheckingRef.current = false;
          setIsAutoCheckingNewRaffle(false);
        }
      }
    };
    
    // Check immediately
    checkForNewRaffle();
    
    // Set up interval to check every 5 minutes (increased from 2 minutes)
    const intervalId = setInterval(checkForNewRaffle, 300000);
    
    // Store interval ID in ref for cleanup
    autoCheckInterval.current = intervalId;
    
    return () => {
      // Clear interval
      if (autoCheckInterval.current) {
        clearInterval(autoCheckInterval.current);
        autoCheckInterval.current = undefined;
      }
      // Reset checking state
      isCheckingRef.current = false;
      if (mountedRef.current) {
        setIsAutoCheckingNewRaffle(false);
      }
    };
  }, [publicClient, contractAddress, fetchRaffleInfo]);

  // Get raffle info for a specific day
  const getDayRaffle = useCallback(async (dayNumber: number) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getDayRaffle',
        args: [BigInt(dayNumber)],
      }) as [bigint, bigint, bigint, bigint, bigint, bigint, boolean];
      
      return {
        raffleId: Number(result[0]),
        startTime: new Date(Number(result[1]) * 1000),
        endTime: new Date(Number(result[2]) * 1000),
        ticketPrice: result[3],
        totalTickets: Number(result[4]),
        prizePool: result[5],
        completed: result[6],
        timeRemaining: Math.max(0, Number(result[2]) - Math.floor(Date.now() / 1000)),
        dayNumber
      } as RaffleInfo;
    } catch (err) {
      console.error('Error fetching day raffle:', err);
      throw new RaffleError('Failed to fetch day raffle info', 'DAY_RAFFLE_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Get today's raffle
  const getTodayRaffle = useCallback(async () => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getTodayRaffle',
      }) as [bigint, bigint, bigint, bigint, bigint, bigint, boolean];
      
      return {
        raffleId: Number(result[0]),
        startTime: new Date(Number(result[1]) * 1000),
        endTime: new Date(Number(result[2]) * 1000),
        ticketPrice: result[3],
        totalTickets: Number(result[4]),
        prizePool: result[5],
        completed: result[6],
        timeRemaining: Math.max(0, Number(result[2]) - Math.floor(Date.now() / 1000))
      } as RaffleInfo;
    } catch (err) {
      console.error('Error fetching today raffle:', err);
      throw new RaffleError('Failed to fetch today raffle info', 'TODAY_RAFFLE_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Get raffle statistics for multiple days
  const getRaffleStats = useCallback(async (startDay: number, endDay: number) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getRaffleStats',
        args: [BigInt(startDay), BigInt(endDay)],
      }) as [bigint[], bigint[], bigint[], boolean[]];
      
      return {
        raffleIds: result[0].map(id => Number(id)),
        totalTicketsArray: result[1].map(tickets => Number(tickets)),
        prizePoolsArray: result[2],
        completedArray: result[3]
      } as RaffleStats;
    } catch (err) {
      console.error('Error fetching raffle stats:', err);
      throw new RaffleError('Failed to fetch raffle stats', 'STATS_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Check if raffle exists for a day
  const raffleExistsForDay = useCallback(async (dayNumber: number) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const exists = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'raffleExistsForDay',
        args: [BigInt(dayNumber)],
      }) as boolean;
      
      return exists;
    } catch (err) {
      console.error('Error checking if raffle exists:', err);
      throw new RaffleError('Failed to check raffle existence', 'EXISTS_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Manually check and create new raffle
  const checkAndCreateNewRaffle = useCallback(async () => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'checkAndCreateNewRaffle',
      });
      
      return tx;
    } catch (err) {
      console.error('Error checking and creating new raffle:', err);
      throw new RaffleError('Failed to check and create new raffle', 'CREATE_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Complete current raffle
  const completeRaffle = useCallback(async () => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'completeRaffle',
      });
      
      return tx;
    } catch (err) {
      console.error('Error completing raffle:', err);
      throw new RaffleError('Failed to complete raffle', 'COMPLETE_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Timer effect for countdown - improved stability
  useEffect(() => {
    if (!raffleInfo) return;
    
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, Math.floor(raffleInfo.endTime.getTime() / 1000) - now);
      
      if (mountedRef.current) {
        setTimeRemaining(remaining);
      }
      
      // If raffle just ended and we have a completed status mismatch, refresh
      if (remaining === 0 && !raffleInfo.completed) {
        console.log('[useRaffle] Raffle time ended, refreshing info');
        lastFetchTime.current = 0; // Reset debounce
        fetchRaffleInfo();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [raffleInfo, fetchRaffleInfo]);

  // Buy tickets with improved error handling
  const buyTickets = useCallback(async (count: number) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    if (count <= 0) {
      throw new RaffleError('Invalid ticket count', 'INVALID_COUNT');
    }
    
    try {
      const totalCost = BigInt(count) * ticketPrice;
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'buyTickets',
        args: [BigInt(count)],
        value: totalCost,
      });
      return tx;
    } catch (err) {
      console.error('Error buying tickets:', err);
      throw new RaffleError('Failed to buy tickets', 'BUY_TICKETS_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress, ticketPrice]);

  // Withdraw funds with improved error handling
  const withdrawFunds = useCallback(async () => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'withdrawFunds',
      });
      return tx;
    } catch (err) {
      console.error('Error withdrawing funds:', err);
      throw new RaffleError('Failed to withdraw funds', 'WITHDRAW_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Reset error state
  const resetError = useCallback(() => {
    if (mountedRef.current) {
      setError(null);
    }
  }, []);

  // Reset write state
  const resetWriteState = useCallback(() => {
    if (mountedRef.current) {
      resetWrite();
    }
  }, [resetWrite]);

  // Format time remaining into a human-readable string
  const formatTimeRemaining = useCallback((seconds: number) => {
    if (seconds <= 0) return 'Ended';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }, []);

  // Get user's tickets for current raffle
  const getUserTickets = useCallback(async () => {
    if (!publicClient || !address || !raffleInfo?.raffleId) {
      return 0;
    }
    
    try {
      const tickets = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getTicketsPurchased',
        args: [BigInt(raffleInfo.raffleId), address],
      }) as bigint;
      
      return Number(tickets);
    } catch (err) {
      console.error('Error getting user tickets:', err);
      return 0;
    }
  }, [publicClient, address, raffleInfo?.raffleId, contractAddress]);

  // Buy tickets with ETH amount
  const buyTicketsWithEth = useCallback(async (ethAmount: string) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    const amount = parseEther(ethAmount);
    if (amount <= BigInt(0)) {
      throw new RaffleError('Invalid ETH amount', 'INVALID_AMOUNT');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'buyTicketsWithEth',
        value: amount,
      });
      return tx;
    } catch (err) {
      console.error('Error buying tickets with ETH:', err);
      throw new RaffleError('Failed to buy tickets with ETH', 'BUY_TICKETS_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Calculate number of tickets from ETH amount
  const calculateTicketsFromEth = useCallback((ethAmount: string) => {
    if (!ethAmount || !ticketPrice) return '0';
    
    try {
      const amount = parseEther(ethAmount);
      const tickets = amount / ticketPrice;
      return tickets.toString();
    } catch (err) {
      console.error('Error calculating tickets from ETH:', err);
      return '0';
    }
  }, [ticketPrice]);

  // Return all necessary data and functions
  return {
    isOwner,
    loading,
    error,
    currentRaffleId,
    ticketPrice,
    timeRemaining,
    winners,
    raffleInfo,
    currentDayNumber,
    deploymentTime,
    isAutoCheckingNewRaffle,
    isWritePending,
    isWaitingForTx,
    isWriteSuccess,
    isTxSuccess,
    writeError,

    publicClient,
    fetchRaffleInfo,
    getDayRaffle,
    getTodayRaffle,
    getRaffleStats,
    raffleExistsForDay,
    checkAndCreateNewRaffle,
    completeRaffle,
    buyTickets,
    buyTicketsWithEth,
    getUserTickets,
    withdrawFunds,
    resetError,
    resetWriteState,
    formatTimeRemaining,
    calculateTicketsFromEth
  };
}

// Export the hook for use in components
export default useRaffleContract;