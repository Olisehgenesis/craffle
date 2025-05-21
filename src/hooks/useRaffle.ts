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

// Enhanced RaffleInfo type with new fields
interface RaffleInfo {
  raffleId: number;
  name: string;
  startTime: Date;
  endTime: Date;
  ticketPrice: bigint;
  totalTickets: number;
  prizePool: bigint;
  completed: boolean;
  creator: string;
  maxWinners: number;
  timeRemaining: number;
  dayNumber?: number;
  isActive?: boolean;
}

// Enhanced RaffleStats type
interface RaffleStats {
  raffleIds: number[];
  totalTicketsArray: number[];
  prizePoolsArray: bigint[];
  completedArray: boolean[];
}

// Active raffle info
interface ActiveRaffle {
  raffleId: number;
  name: string;
  endTime: Date;
  totalTickets: number;
  prizePool: bigint;
}

// Participant stats
interface ParticipantStats {
  totalTickets: number;
  totalSpent: bigint;
}

// Search result interface
interface RaffleSearchResult {
  raffleIds: number[];
  names: string[];
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
  contractAddress = "0x2cfE616062261927fCcC727333d6dD3D5880FDd1",
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
  
  // State variables - enhanced with new fields
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
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
  const [raffleCreationFee, setRaffleCreationFee] = useState<bigint>(BigInt(0));

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
        const [deploymentTimeResult, currentDayResult, creationFeeResult] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'getDeploymentTime',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'getCurrentDayNumber',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'raffleCreationFee',
          }) as Promise<bigint>
        ]);
        
        if (mountedRef.current) {
          setDeploymentTime(Number(deploymentTimeResult));
          setCurrentDayNumber(Number(currentDayResult));
          setRaffleCreationFee(creationFeeResult);
          
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

  // Check if user is owner/admin - separate effect with stable dependencies
  useEffect(() => {
    if (!address || !publicClient || !isConnected) return;
    
    const checkPermissions = async () => {
      try {
        const [ownerResult, adminResult] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'owner',
          }) as Promise<`0x${string}`>,
          publicClient.readContract({
            address: contractAddress,
            abi: raffleABI,
            functionName: 'isAdmin',
            args: [address],
          }) as Promise<boolean>
        ]);
        
        if (mountedRef.current) {
          setIsOwner(ownerResult === address);
          setIsAdmin(adminResult);
        }
      } catch (err) {
        console.error('[useRaffle] Error checking permissions:', err);
      }
    };
    
    checkPermissions();
  }, [address, contractAddress, publicClient, isConnected]);

  // Fetch current raffle info - enhanced with new fields
  const fetchRaffleInfo = useCallback(async () => {
    if (!publicClient) {
      console.log('[useRaffle] Public client not available for fetch');
      return null;
    }
    
    // Debounce fetch calls to prevent excessive requests
    const now = Date.now();
    if (now - lastFetchTime.current < 3000) {
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
      
      // Fetch enhanced raffle info using getRaffleInfo function
      const [result, isActive] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'getRaffleInfo',
          args: [BigInt(currentId)],
        }) as Promise<[bigint, string, bigint, bigint, bigint, bigint, bigint, boolean, `0x${string}`, bigint, bigint]>,
        publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'isCurrentRaffleActive',
        }) as Promise<boolean>
      ]);
      
      const parsedInfo: RaffleInfo = {
        raffleId: Number(result[0]),
        name: result[1],
        startTime: new Date(Number(result[2]) * 1000),
        endTime: new Date(Number(result[3]) * 1000),
        ticketPrice: result[4],
        totalTickets: Number(result[5]),
        prizePool: result[6],
        completed: result[7],
        creator: result[8],
        maxWinners: Number(result[9]),
        timeRemaining: Math.max(0, Number(result[3]) - Math.floor(Date.now() / 1000)),
        dayNumber: Number(result[10]),
        isActive
      };
      
      if (!mountedRef.current) return null;
      
      setRaffleInfo(parsedInfo);
      setTicketPrice(result[4]);
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
        }
      } else {
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

  // Auto-check for new raffles
  useEffect(() => {
    if (!publicClient || !isInitialized.current) {
      console.log('[useRaffle] Auto-check disabled - not ready');
      return;
    }
    
    const checkForNewRaffle = async () => {
      if (isCheckingRef.current) {
        console.log('[useRaffle] Skipping auto-check - already in progress');
        return;
      }
      
      try {
        console.log('[useRaffle] Starting auto-check for new raffle');
        isCheckingRef.current = true;
        setIsAutoCheckingNewRaffle(true);
        
        // Just check if current raffle is still active
        const isActive = await publicClient.readContract({
          address: contractAddress,
          abi: raffleABI,
          functionName: 'isCurrentRaffleActive',
        }) as boolean;
        
        if (!isActive && raffleInfo && !raffleInfo.completed && mountedRef.current) {
          console.log('[useRaffle] Current raffle ended, refreshing info');
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
    
    checkForNewRaffle();
    const intervalId = setInterval(checkForNewRaffle, 300000);
    autoCheckInterval.current = intervalId;
    
    return () => {
      if (autoCheckInterval.current) {
        clearInterval(autoCheckInterval.current);
        autoCheckInterval.current = undefined;
      }
      isCheckingRef.current = false;
      if (mountedRef.current) {
        setIsAutoCheckingNewRaffle(false);
      }
    };
  }, [publicClient, contractAddress, fetchRaffleInfo, raffleInfo]);

  // Get enhanced raffle info for a specific day
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
      }) as [bigint, string, bigint, bigint, bigint, bigint, bigint, boolean, `0x${string}`, bigint];
      
      return {
        raffleId: Number(result[0]),
        name: result[1],
        startTime: new Date(Number(result[2]) * 1000),
        endTime: new Date(Number(result[3]) * 1000),
        ticketPrice: result[4],
        totalTickets: Number(result[5]),
        prizePool: result[6],
        completed: result[7],
        creator: result[8],
        maxWinners: Number(result[9]),
        timeRemaining: Math.max(0, Number(result[3]) - Math.floor(Date.now() / 1000)),
        dayNumber
      } as RaffleInfo;
    } catch (err) {
      console.error('Error fetching day raffle:', err);
      throw new RaffleError('Failed to fetch day raffle info', 'DAY_RAFFLE_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Get raffle info by ID
  const getRaffleInfo = useCallback(async (raffleId: number) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getRaffleInfo',
        args: [BigInt(raffleId)],
      }) as [bigint, string, bigint, bigint, bigint, bigint, bigint, boolean, `0x${string}`, bigint, bigint];
      
      return {
        raffleId: Number(result[0]),
        name: result[1],
        startTime: new Date(Number(result[2]) * 1000),
        endTime: new Date(Number(result[3]) * 1000),
        ticketPrice: result[4],
        totalTickets: Number(result[5]),
        prizePool: result[6],
        completed: result[7],
        creator: result[8],
        maxWinners: Number(result[9]),
        timeRemaining: Math.max(0, Number(result[3]) - Math.floor(Date.now() / 1000)),
        dayNumber: Number(result[10])
      } as RaffleInfo;
    } catch (err) {
      console.error('Error fetching raffle info:', err);
      throw new RaffleError('Failed to fetch raffle info', 'RAFFLE_INFO_ERROR');
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

  // Get all active raffles
  const getActiveRaffles = useCallback(async () => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const activeRaffleIds = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getActiveRaffles',
      }) as bigint[];
      
      // Fetch details for each active raffle
      const activeRaffles: ActiveRaffle[] = [];
      for (const raffleId of activeRaffleIds) {
        try {
          const raffleInfo = await getRaffleInfo(Number(raffleId));
          activeRaffles.push({
            raffleId: raffleInfo.raffleId,
            name: raffleInfo.name,
            endTime: raffleInfo.endTime,
            totalTickets: raffleInfo.totalTickets,
            prizePool: raffleInfo.prizePool
          });
        } catch (err) {
          console.error(`Error fetching details for raffle ${raffleId}:`, err);
        }
      }
      
      return activeRaffles;
    } catch (err) {
      console.error('Error fetching active raffles:', err);
      throw new RaffleError('Failed to fetch active raffles', 'ACTIVE_RAFFLES_ERROR');
    }
  }, [publicClient, contractAddress, getRaffleInfo]);

  // Get participant stats
  const getParticipantStats = useCallback(async (participant: string) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'getParticipantStats',
        args: [participant as `0x${string}`],
      }) as [bigint, bigint];
      
      return {
        totalTickets: Number(result[0]),
        totalSpent: result[1]
      } as ParticipantStats;
    } catch (err) {
      console.error('Error fetching participant stats:', err);
      throw new RaffleError('Failed to fetch participant stats', 'PARTICIPANT_STATS_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Search raffles by name
  const searchRafflesByName = useCallback(async (searchTerm: string, maxResults: number = 10) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const result = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'searchRafflesByName',
        args: [searchTerm, BigInt(maxResults)],
      }) as [bigint[], string[]];
      
      return {
        raffleIds: result[0].map(id => Number(id)),
        names: result[1]
      } as RaffleSearchResult;
    } catch (err) {
      console.error('Error searching raffles by name:', err);
      throw new RaffleError('Failed to search raffles', 'SEARCH_ERROR');
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

  // Check if participant has won a raffle
  const hasParticipantWon = useCallback(async (raffleId: number, participant: string) => {
    if (!publicClient) {
      throw new RaffleError('Public client not available', 'CLIENT_ERROR');
    }
    
    try {
      const hasWon = await publicClient.readContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'hasParticipantWon',
        args: [BigInt(raffleId), participant as `0x${string}`],
      }) as boolean;
      
      return hasWon;
    } catch (err) {
      console.error('Error checking if participant won:', err);
      throw new RaffleError('Failed to check win status', 'WIN_CHECK_ERROR');
    }
  }, [publicClient, contractAddress]);

  // Create custom raffle
  const createCustomRaffle = useCallback(async (
    name: string, 
    startTime: Date, 
    endTime: Date, 
    maxWinners: number
  ) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'createCustomRaffle',
        args: [
          name,
          BigInt(Math.floor(startTime.getTime() / 1000)),
          BigInt(Math.floor(endTime.getTime() / 1000)),
          BigInt(maxWinners)
        ],
        value: raffleCreationFee,
      });
      
      return tx;
    } catch (err) {
      console.error('Error creating custom raffle:', err);
      throw new RaffleError('Failed to create custom raffle', 'CREATE_RAFFLE_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress, raffleCreationFee]);

  // Update raffle name
  const updateRaffleName = useCallback(async (raffleId: number, newName: string) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'updateRaffleName',
        args: [BigInt(raffleId), newName],
      });
      
      return tx;
    } catch (err) {
      console.error('Error updating raffle name:', err);
      throw new RaffleError('Failed to update raffle name', 'UPDATE_NAME_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Generate random winners (Admin only)
  const generateRandomWinners = useCallback(async (raffleId: number) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'generateRandomWinners',
        args: [BigInt(raffleId)],
      });
      
      return tx;
    } catch (err) {
      console.error('Error generating random winners:', err);
      throw new RaffleError('Failed to generate random winners', 'GENERATE_WINNERS_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Set winners (Admin only)
  const setWinnersAdmin = useCallback(async (raffleId: number, winners: string[]) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'setWinners',
        args: [BigInt(raffleId), winners as `0x${string}`[]],
      });
      
      return tx;
    } catch (err) {
      console.error('Error setting winners:', err);
      throw new RaffleError('Failed to set winners', 'SET_WINNERS_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Set winner count (Admin only)
  const setWinnerCount = useCallback(async (raffleId: number, winnerCount: number) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'setWinnerCount',
        args: [BigInt(raffleId), BigInt(winnerCount)],
      });
      
      return tx;
    } catch (err) {
      console.error('Error setting winner count:', err);
      throw new RaffleError('Failed to set winner count', 'SET_WINNER_COUNT_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Add admin (Owner only)
  const addAdmin = useCallback(async (adminAddress: string) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'addAdmin',
        args: [adminAddress as `0x${string}`],
      });
      
      return tx;
    } catch (err) {
      console.error('Error adding admin:', err);
      throw new RaffleError('Failed to add admin', 'ADD_ADMIN_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Remove admin (Owner only)
  const removeAdmin = useCallback(async (adminAddress: string) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'removeAdmin',
        args: [adminAddress as `0x${string}`],
      });
      
      return tx;
    } catch (err) {
      console.error('Error removing admin:', err);
      throw new RaffleError('Failed to remove admin', 'REMOVE_ADMIN_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Complete raffle
  const completeRaffle = useCallback(async (raffleId: number) => {
    if (!walletClient || !address) {
      throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
    }
    
    try {
      const tx = await writeContract({
        address: contractAddress,
        abi: raffleABI,
        functionName: 'completeRaffle',
        args: [BigInt(raffleId)],
      });
      
      return tx;
    } catch (err) {
      console.error('Error completing raffle:', err);
      throw new RaffleError('Failed to complete raffle', 'COMPLETE_ERROR');
    }
  }, [walletClient, address, writeContract, contractAddress]);

  // Timer effect for countdown
  useEffect(() => {
    if (!raffleInfo) return;
    
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, Math.floor(raffleInfo.endTime.getTime() / 1000) - now);
      
      if (mountedRef.current) {
        setTimeRemaining(remaining);
      }
      
      if (remaining === 0 && !raffleInfo.completed) {
        console.log('[useRaffle] Raffle time ended, refreshing info');
        lastFetchTime.current = 0;
        fetchRaffleInfo();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [raffleInfo, fetchRaffleInfo]);

  // Buy tickets for specific raffle
 // Buy tickets for specific raffle
const buyTickets = useCallback(async (raffleId: number, count: number) => {
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
      args: [BigInt(raffleId), BigInt(count)],
      value: totalCost,
    });
    return tx;
  } catch (err) {
    console.error('Error buying tickets:', err);
    throw new RaffleError('Failed to buy tickets', 'BUY_TICKETS_ERROR');
  }
}, [walletClient, address, writeContract, contractAddress, ticketPrice]);

// Buy tickets with ETH amount for specific raffle
const buyTicketsWithEth = useCallback(async (raffleId: number, ethAmount: string) => {
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
      args: [BigInt(raffleId)],
      value: amount,
    });
    return tx;
  } catch (err) {
    console.error('Error buying tickets with ETH:', err);
    throw new RaffleError('Failed to buy tickets with ETH', 'BUY_TICKETS_ERROR');
  }
}, [walletClient, address, writeContract, contractAddress]);

// Emergency withdraw (Owner only)
const emergencyWithdraw = useCallback(async () => {
  if (!walletClient || !address) {
    throw new RaffleError('Wallet not connected', 'WALLET_ERROR');
  }
  
  try {
    const tx = await writeContract({
      address: contractAddress,
      abi: raffleABI,
      functionName: 'emergencyWithdraw',
    });
    
    return tx;
  } catch (err) {
    console.error('Error withdrawing funds:', err);
    throw new RaffleError('Failed to withdraw funds', 'WITHDRAW_ERROR');
  }
}, [walletClient, address, writeContract, contractAddress]);

// Get user's tickets for any raffle
const getUserTickets = useCallback(async (raffleId: number, userAddress?: string) => {
  if (!publicClient) {
    return 0;
  }
  
  const targetAddress = userAddress || address;
  if (!targetAddress) {
    return 0;
  }
  
  try {
    const tickets = await publicClient.readContract({
      address: contractAddress,
      abi: raffleABI,
      functionName: 'getUserTickets',
      args: [targetAddress as `0x${string}`, BigInt(raffleId)],
    }) as bigint;
    
    return Number(tickets);
  } catch (err) {
    console.error('Error getting user tickets:', err);
    return 0;
  }
}, [publicClient, address, contractAddress]);

// Get participants for a raffle
const getParticipants = useCallback(async (raffleId: number) => {
  if (!publicClient) {
    throw new RaffleError('Public client not available', 'CLIENT_ERROR');
  }
  
  try {
    const participants = await publicClient.readContract({
      address: contractAddress,
      abi: raffleABI,
      functionName: 'getParticipants',
      args: [BigInt(raffleId)],
    }) as `0x${string}`[];
    
    return participants;
  } catch (err) {
    console.error('Error getting participants:', err);
    throw new RaffleError('Failed to get participants', 'PARTICIPANTS_ERROR');
  }
}, [publicClient, contractAddress]);

// Get winners for a raffle
const getWinners = useCallback(async (raffleId: number) => {
  if (!publicClient) {
    throw new RaffleError('Public client not available', 'CLIENT_ERROR');
  }
  
  try {
    const winners = await publicClient.readContract({
      address: contractAddress,
      abi: raffleABI,
      functionName: 'getWinners',
      args: [BigInt(raffleId)],
    }) as `0x${string}`[];
    
    return winners;
  } catch (err) {
    console.error('Error getting winners:', err);
    throw new RaffleError('Failed to get winners', 'WINNERS_ERROR');
  }
}, [publicClient, contractAddress]);

// Get raffle name
const getRaffleName = useCallback(async (raffleId: number) => {
  if (!publicClient) {
    throw new RaffleError('Public client not available', 'CLIENT_ERROR');
  }
  
  try {
    const name = await publicClient.readContract({
      address: contractAddress,
      abi: raffleABI,
      functionName: 'getRaffleName',
      args: [BigInt(raffleId)],
    }) as string;
    
    return name;
  } catch (err) {
    console.error('Error getting raffle name:', err);
    throw new RaffleError('Failed to get raffle name', 'NAME_ERROR');
  }
}, [publicClient, contractAddress]);

// Check if specific raffle is active
const isRaffleActive = useCallback(async (raffleId: number) => {
  if (!publicClient) {
    throw new RaffleError('Public client not available', 'CLIENT_ERROR');
  }
  
  try {
    const isActive = await publicClient.readContract({
      address: contractAddress,
      abi: raffleABI,
      functionName: 'isRaffleActive',
      args: [BigInt(raffleId)],
    }) as boolean;
    
    return isActive;
  } catch (err) {
    console.error('Error checking if raffle is active:', err);
    throw new RaffleError('Failed to check raffle status', 'STATUS_ERROR');
  }
}, [publicClient, contractAddress]);

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
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}, []);

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

// Validate raffle name
const validateRaffleName = useCallback((name: string) => {
  if (!name || name.trim().length === 0) {
    return 'Raffle name cannot be empty';
  }
  if (name.length > 100) {
    return 'Raffle name too long (max 100 characters)';
  }
  return null;
}, []);

// Return all necessary data and functions
return {
  // State
  isOwner,
  isAdmin,
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
  raffleCreationFee,
  
  // Transaction states
  isWritePending,
  isWaitingForTx,
  isWriteSuccess,
  isTxSuccess,
  writeError,

  // Core functions
  publicClient,
  fetchRaffleInfo,
  
  // Read functions
  getDayRaffle,
  getRaffleInfo,
  getRaffleStats,
  getActiveRaffles,
  getParticipantStats,
  searchRafflesByName,
  raffleExistsForDay,
  hasParticipantWon,
  getUserTickets,
  getParticipants,
  getWinners,
  getRaffleName,
  isRaffleActive,
  
  // Write functions - Raffle management
  createCustomRaffle,
  updateRaffleName,
  completeRaffle,
  
  // Write functions - Ticket purchasing
  buyTickets,
  buyTicketsWithEth,
  
  // Write functions - Admin only
  generateRandomWinners,
  setWinners: setWinnersAdmin,
  setWinnerCount,
  
  // Write functions - Owner only
  addAdmin,
  removeAdmin,
  emergencyWithdraw,
  
  // Utility functions
  resetError,
  resetWriteState,
  formatTimeRemaining,
  calculateTicketsFromEth,
  validateRaffleName
};
}

// Export the enhanced hook
export default useRaffleContract;