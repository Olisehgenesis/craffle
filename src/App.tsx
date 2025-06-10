import { useState, useEffect, useCallback } from 'react';
import { formatEther, Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient, useSendTransaction, useChainId } from 'wagmi';
import { celo } from 'viem/chains';
import { useSwitchChain } from 'wagmi';
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk';
import { Interface } from 'ethers';
import { sdk } from '@farcaster/frame-sdk';
import { raffleABI } from './hooks/abi';
import { 
  Home, 
  User, 
  Ticket, 
  Trophy, 
  Clock, 
  DollarSign,
  Users,
  Zap,
  Settings,
  Share2,
  ArrowRight,
  CheckCircle,
  XCircle,
  Circle,
  Globe,
  Ship,
} from 'lucide-react';
import CraffleSlotsModal from './components/SlotsGame';

const RAFFLE_CONTRACT_ADDRESS = '0x492CC1634AA2E8Ba909F2a61d886ef6c8C651074';

const DIVVI_CONFIG = {
  consumer: '0x53eaF4CD171842d8144e45211308e5D90B4b0088' as `0x${string}`,
  providers: [
    '0x0423189886d7966f0dd7e7d256898daeee625dca',
    '0xc95876688026be9d6fa7a7c33328bd013effa2bb', 
    '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8'
  ] as `0x${string}`[]
};


// Custom hook for Divvi transactions (your existing logic)
const useDivviTransaction = () => {
  const { sendTransactionAsync } = useSendTransaction();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const executeWithDivvi = useCallback(async ({
    functionName,
    args = [],
    value,
    onSuccess,
    onError
  }: {
    functionName: string;
    args?: any[];
    value?: bigint;
    onSuccess?: (txHash: string) => void;
    onError?: (error: Error) => void;
  }) => {
    try {
      if (!walletClient) throw new Error('Wallet not connected');

      if (chainId !== celo.id) {
        console.log('🔄 Switching to Celo network...');
        await switchChain({ chainId: celo.id });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const raffleInterface = new Interface(raffleABI);
      const encodedData = raffleInterface.encodeFunctionData(functionName, args);
      const dataSuffix = getDataSuffix(DIVVI_CONFIG);
      const finalData = encodedData + dataSuffix;

      const txHash = await sendTransactionAsync({
        to: RAFFLE_CONTRACT_ADDRESS as Address,
        data: finalData as `0x${string}`,
        value,
      });

      if (!txHash) throw new Error('Transaction failed to send');

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        
        if (receipt.status === 'success') {
          try {
            const chainId = await walletClient.getChainId();
            await submitReferral({
              txHash: txHash as `0x${string}`,
              chainId
            });
            console.log('✅ Divvi referral submitted successfully');
          } catch (referralError) {
            console.error('Referral submission error:', referralError);
          }

          onSuccess?.(txHash);
          return txHash;
        } else {
          throw new Error('Transaction failed');
        }
      }

      return txHash;
    } catch (error) {
      console.error(`Error in ${functionName}:`, error);
      onError?.(error as Error);
      throw error;
    }
  }, [sendTransactionAsync, walletClient, publicClient, chainId, switchChain]);

  return { executeWithDivvi };
};

export default function CeloRaffleApp() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: celo.id });
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { executeWithDivvi } = useDivviTransaction();
  
  // Navigation state
  const [activeTab, setActiveTab] = useState('raffle');
  
  // State management (all your existing state)
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [showSlotsModal, setShowSlotsModal] = useState(false);
  
  // Raffle state (all your existing raffle state)
  const [raffleInfo, setRaffleInfo] = useState<{
    raffleId: number;
    startTime: Date;
    endTime: Date;
    ticketPrice: bigint;
    totalTickets: number;
    prizePool: bigint;
    completed: boolean;
  } | null>(null);
  const [userTickets, setUserTickets] = useState(0);
  const [currentDayNumber, setCurrentDayNumber] = useState(0);
  const [isRaffleActive, setIsRaffleActive] = useState(false);
  const [raffleExistsForToday, setRaffleExistsForToday] = useState(false);
  
  // Past winners state
  const [pastWinners, setPastWinners] = useState<{
    raffleId: number;
    winners: string[];
    prizePerWinner: string;
    dayNumber: number;
    totalPrize: string;
  }[]>([]);

  
  // UI state
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  console.log('timeLeft', timeLeft);
  console.log('countdown', isAnimating);
  const [isSliding, setIsSliding] = useState(false);
  const [slideProgress, setSlideProgress] = useState(0);

  // Utility functions (all your existing functions)
  const showSuccess = useCallback((message: string, shouldReload = false) => {
    setSuccess(message);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
    
    if (shouldReload) {
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }, []);

  const resetMessages = useCallback(() => {
    setError('');
    setSuccess('');
    setTxHash('');
  }, []);

  const calculateTimeLeft = useCallback((endTime: Date) => {
    const now = new Date().getTime();
    const endTimestamp = endTime.getTime();
    const difference = endTimestamp - now;

    if (difference > 0) {
      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
      
      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${minutes}m ${seconds}s`);
      }
      return true;
    } else {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      setCountdown('Ended');
      return false;
    }
  }, []);

  // All your existing functions with full logic
  const fetchPastWinners = useCallback(async () => {
    if (!publicClient || currentDayNumber <= 1) return;

    try {
      const winners = [];
      const startDay = Math.max(1, currentDayNumber - 7);
      
      for (let day = currentDayNumber - 1; day >= startDay; day--) {
        try {
          const raffleExists = await publicClient.readContract({
            address: RAFFLE_CONTRACT_ADDRESS,
            abi: raffleABI,
            functionName: 'raffleExistsForDay',
            args: [BigInt(day)]
          }) as boolean;

          if (!raffleExists) continue;

          const [raffleId, , , , , prizePool, completed] = await publicClient.readContract({
            address: RAFFLE_CONTRACT_ADDRESS,
            abi: raffleABI,
            functionName: 'getDayRaffle',
            args: [BigInt(day)]
          }) as [bigint, bigint, bigint, bigint, bigint, bigint, boolean];

          if (!completed) continue;

          const dayWinners = await publicClient.readContract({
            address: RAFFLE_CONTRACT_ADDRESS,
            abi: raffleABI,
            functionName: 'getWinners',
            args: [raffleId]
          }) as string[];

          if (dayWinners.length > 0) {
            const totalPrize = formatEther(prizePool);
            const prizePerWinner = formatEther(prizePool / BigInt(dayWinners.length));
            
            winners.push({
              raffleId: Number(raffleId),
              winners: dayWinners,
              prizePerWinner,
              dayNumber: day,
              totalPrize
            });
          }
        } catch (err) {
          console.error(`Failed to fetch winners for day ${day}:`, err);
        }
      }
      
      setPastWinners(winners);
    } catch (err) {
      console.error('Failed to fetch past winners:', err);
    }
  }, [publicClient, currentDayNumber]);

  const fetchRaffleInfo = useCallback(async () => {
    if (!publicClient) return;

    try {
      const [raffleData, dayNumber, contractIsActive] = await Promise.all([
        publicClient.readContract({
          address: RAFFLE_CONTRACT_ADDRESS,
          abi: raffleABI,
          functionName: 'getTodayRaffle'
        }) as Promise<[bigint, bigint, bigint, bigint, bigint, bigint, boolean]>,
        publicClient.readContract({
          address: RAFFLE_CONTRACT_ADDRESS,
          abi: raffleABI,
          functionName: 'getCurrentDayNumber'
        }) as Promise<bigint>,
        publicClient.readContract({
          address: RAFFLE_CONTRACT_ADDRESS,
          abi: raffleABI,
          functionName: 'isCurrentRaffleActive'
        }) as Promise<boolean>
      ]);

      const startTime = new Date(Number(raffleData[1]) * 1000);
      const endTime = new Date(Number(raffleData[2]) * 1000);
      const now = new Date();
      const currentDay = Number(dayNumber);
      const completed = raffleData[6];

      console.log('🕐 Raffle Time Debug:', {
        startTime: {
          local: startTime.toLocaleString(),
          utc: startTime.toUTCString(),
          timestamp: Number(raffleData[1])
        },
        endTime: {
          local: endTime.toLocaleString(),
          utc: endTime.toUTCString(),
          timestamp: Number(raffleData[2])
        },
        now: {
          local: now.toLocaleString(),
          utc: now.toUTCString(),
          timestamp: Math.floor(now.getTime() / 1000)
        },
        contractIsActive,
        completed,
        raffleId: Number(raffleData[0])
      });

      setRaffleInfo({
        raffleId: Number(raffleData[0]),
        startTime,
        endTime,
        ticketPrice: raffleData[3],
        totalTickets: Number(raffleData[4]),
        prizePool: raffleData[5],
        completed
      });

      setCurrentDayNumber(currentDay);
      
      const raffleExistsToday = await publicClient.readContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: raffleABI,
        functionName: 'raffleExistsForDay',
        args: [BigInt(currentDay)]
      }) as boolean;
      
      setRaffleExistsForToday(raffleExistsToday);
      
      const nowTimestamp = Math.floor(now.getTime() / 1000);
      const startTimestamp = Number(raffleData[1]);
      const endTimestamp = Number(raffleData[2]);
      
      const timeBasedActive = nowTimestamp >= startTimestamp && nowTimestamp < endTimestamp;
      const actuallyActive = contractIsActive && timeBasedActive && !completed;
      
      console.log('🎯 Activity Status:', {
        contractIsActive,
        timeBasedActive,
        completed,
        finalActive: actuallyActive,
        timeComparison: {
          now: nowTimestamp,
          start: startTimestamp,
          end: endTimestamp,
          isAfterStart: nowTimestamp >= startTimestamp,
          isBeforeEnd: nowTimestamp < endTimestamp
        }
      });
      
      setIsRaffleActive(actuallyActive);
    } catch (err) {
      console.error('Failed to fetch raffle info:', err);
      setError('Failed to fetch raffle information 📊');
    }
  }, [publicClient]);

  const fetchUserTickets = useCallback(async () => {
    if (!publicClient || !account || !raffleInfo) {
      return;
    }

    try {
      const tickets = await publicClient.readContract({
        address: RAFFLE_CONTRACT_ADDRESS as `0x${string}`,
        abi: raffleABI,
        functionName: 'getUserTickets',
        args: [account, BigInt(raffleInfo.raffleId)]
      });

      const ticketCount = Number(tickets);
      if (ticketCount !== userTickets) {
        setUserTickets(ticketCount);
      }
    } catch (err) {
      console.error('❌ Failed to fetch user tickets:', err);
    }
  }, [publicClient, account, raffleInfo, userTickets]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setIsAnimating(true);
    
    try {
      if (address) {
        setAccount(address);
        resetMessages();
        showSuccess('🎉 Wallet connected! Welcome to the raffle!');
      } else {
        setError('No address found in wallet');
      }
    } catch (err) {
      setError('Failed to connect wallet: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsConnecting(false);
      setIsAnimating(false);
    }
  };

  const createDailyRaffle = async () => {
    if (!account) {
      setError('Please connect your wallet first 🔌');
      return;
    }

    if (chainId !== celo.id) {
      try {
        await switchChain({ chainId: celo.id });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        setError('Please switch to Celo network first');
        return;
      }
    }

    setIsLoading(true);
    setIsAnimating(true);
    resetMessages();

    try {
      await executeWithDivvi({
        functionName: 'createDailyRaffle',
        args: [],
        onSuccess: (txHash) => {
          setTxHash(txHash);
          showSuccess('🎊 Daily raffle created successfully!');
          fetchRaffleInfo();
        },
        onError: (error) => {
          setError('Failed to create daily raffle: ' + error.message);
        }
      });
    } catch (err) {
      // Error already handled in onError callback
    } finally {
      setIsLoading(false);
      setIsAnimating(false);
    }
  };

  const buyTickets = async (quantity: number) => {
    if (!account || !raffleInfo) {
      setError('Please connect your wallet first 🔌');
      return;
    }

    if (chainId !== celo.id) {
      try {
        await switchChain({ chainId: celo.id });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        setError('Please switch to Celo network first');
        return;
      }
    }

    setIsLoading(true);
    setIsAnimating(true);
    resetMessages();

    try {
      const totalPrice = raffleInfo.ticketPrice * BigInt(quantity);
      
      await executeWithDivvi({
        functionName: 'buyTickets',
        args: [BigInt(quantity)],
        value: totalPrice,
        onSuccess: async (txHash) => {
          setTxHash(txHash);
          showSuccess('🎊 Tickets purchased successfully!');
          
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
            await Promise.all([
              fetchRaffleInfo(),
              fetchUserTickets()
            ]);
          }
        },
        onError: (error) => {
          setError('Failed to buy tickets: ' + error.message);
        }
      });
    } catch (err) {
      // Error already handled in onError callback
    } finally {
      setIsLoading(false);
      setIsAnimating(false);
    }
  };

  const shareFrame = () => {
    const frameUrl = window.location.href;
    const shareText = `🎰 Join the Daily Raffle on Celo! Day #${currentDayNumber} - Prize Pool: ${raffleInfo ? formatEther(raffleInfo.prizePool) : '0'} CELO`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Daily Raffle on Celo',
        text: shareText,
        url: frameUrl
      });
    } else {
      navigator.clipboard.writeText(`${shareText} ${frameUrl}`);
      showSuccess('Share link copied to clipboard! 📋');
    }
  };
  
 
  const getWinChance = () => {
    if (!raffleInfo || raffleInfo.totalTickets === 0) return 0;
    return ((userTickets / raffleInfo.totalTickets) * 100).toFixed(1);
  };
  
  const formatToOneDecimal = (value: string | number) => {
    return parseFloat(value.toString()).toFixed(1);
  };
  
  const handleSlideComplete = async () => {
    if (!account || !raffleInfo || !isRaffleActive) return;
    
    setIsSliding(false);
    setSlideProgress(0);
    await buyTickets(1);
  };
  
  const handleSlideStart = () => {
    setIsSliding(true);
  };
  
  // Effects (keeping your existing effect structure)
  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        setIsAppReady(true);
        
        try {
          await sdk.actions.ready({ disableNativeGestures: true });
        } catch (sdkError) {
          console.log('ℹ️ SDK ready() failed (probably not in Farcaster):', sdkError);
        }
        
        if (publicClient) {
          await fetchRaffleInfo();
        }
        
      } catch (error) {
        console.error('❌ Error during initialization:', error);
        setIsAppReady(true);
      }
    };
  
    initializeFarcaster();
  }, [publicClient, fetchRaffleInfo]);
  
  useEffect(() => {
    if (account && raffleInfo) {
      fetchUserTickets();
    }
  }, [account, raffleInfo?.raffleId, fetchUserTickets]);
  
  useEffect(() => {
    if (currentDayNumber > 1) {
      fetchPastWinners();
    }
  }, [currentDayNumber, fetchPastWinners]);
  
  useEffect(() => {
    if (!raffleInfo || !raffleInfo.endTime) return;
  
    const timer = setInterval(() => {
      calculateTimeLeft(raffleInfo.endTime);
    }, 1000);
  
    calculateTimeLeft(raffleInfo.endTime);
    return () => clearInterval(timer);
  }, [raffleInfo, calculateTimeLeft]);
  
  // Slide interaction effects
  useEffect(() => {
    if (!isSliding) return;
  
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('slide-container');
      if (!container) return;
  
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.min(Math.max((x / rect.width) * 100, 0), 100);
      setSlideProgress(progress);
  
      if (progress >= 95) {
        handleSlideComplete();
      }
    };
  
    const handleTouchMove = (e: TouchEvent) => {
      const container = document.getElementById('slide-container');
      if (!container) return;
  
      const rect = container.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const progress = Math.min(Math.max((x / rect.width) * 100, 0), 100);
      setSlideProgress(progress);
  
      if (progress >= 95) {
        handleSlideComplete();
      }
    };
  
    const handleMouseUp = () => {
      setIsSliding(false);
      if (slideProgress < 95) {
        setSlideProgress(0);
      }
    };
  
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleMouseUp);
  
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isSliding, slideProgress]);
  
  // Data refresh interval
  useEffect(() => {
    if (!publicClient) return;
  
    const interval = setInterval(() => {
      fetchRaffleInfo();
      if (account && raffleInfo) {
        fetchUserTickets();
      }
    }, 30000);
  
    return () => clearInterval(interval);
  }, [publicClient, account, raffleInfo, fetchRaffleInfo, fetchUserTickets]);
  
  // Show loading state
  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-spin mb-4 mx-auto flex items-center justify-center">
            <div className="w-6 h-6 bg-white rounded-full"></div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Raffle...</h2>
          <p className="text-gray-600">Preparing your gaming experience</p>
        </div>
      </div>
    );
  }
  
  // Raffle Screen Component
  const RaffleScreen = () => (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Daily Raffle</h1>
            <p className="text-gray-600">Day #{currentDayNumber}</p>
          </div>
          <div className="text-right">
            <button
              onClick={shareFrame}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
            >
              <Share2 size={16} />
              Share
            </button>
          </div>
        </div>
  
        {/* Stats Grid */}
        {raffleInfo && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="text-green-600" size={20} />
                <span className="text-sm font-medium text-green-600">Prize Pool</span>
              </div>
              <div className="text-2xl font-bold text-green-800">
                {formatToOneDecimal(formatEther(raffleInfo.prizePool))} CELO
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="text-blue-600" size={20} />
                <span className="text-sm font-medium text-blue-600">Total Tickets</span>
              </div>
              <div className="text-2xl font-bold text-blue-800">
                {raffleInfo.totalTickets.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
  
      {/* Status Card */}
      {raffleInfo && (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="text-center">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-4 ${
              isRaffleActive 
                ? 'bg-gradient-to-r from-green-400 to-green-500 text-white' 
                : 'bg-gradient-to-r from-red-400 to-red-500 text-white'
            }`}>
              {isRaffleActive ? (
                <>
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  LIVE NOW!
                </>
              ) : (
                <>
                  <XCircle size={16} />
                  ENDED
                </>
              )}
            </div>
  
            {isRaffleActive && (
              <div className="mb-4 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Clock className="text-orange-600" size={20} />
                  <span className="text-sm font-medium text-orange-600">Time Remaining</span>
                </div>
                <div className="text-3xl font-bold text-orange-800 font-mono">
                  {countdown}
                </div>
              </div>
            )}
  
            <div className="text-lg font-semibold text-gray-800 mb-2">
              Raffle #{raffleInfo.raffleId}
            </div>
            <div className="text-sm text-gray-600">
              Ticket Price: {formatToOneDecimal(formatEther(raffleInfo.ticketPrice))} CELO
            </div>
          </div>
        </div>
      )}
  
      {/* User Tickets Card */}
      {account && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 shadow-lg border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="text-purple-600" size={20} />
                <span className="text-sm font-medium text-purple-600">Your Tickets</span>
              </div>
              <div className="text-3xl font-bold text-purple-800">{userTickets}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-600 mb-1">Win Chance</div>
              <div className="text-2xl font-bold text-purple-800">{getWinChance()}%</div>
            </div>
          </div>
        </div>
      )}
  
      {/* Actions */}
      {!account ? (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-white" size={24} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Connect Your Wallet</h3>
          <p className="text-gray-600 mb-4">Connect your wallet to participate in the raffle</p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-white font-bold py-3 px-8 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      ) : !isRaffleActive && !raffleExistsForToday ? (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-green-400 to-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="text-white" size={24} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Start Today's Raffle</h3>
          <p className="text-gray-600 mb-4">Be the first to create today's raffle!</p>
          <button
            onClick={createDailyRaffle}
            disabled={isLoading}
            className="bg-gradient-to-r from-green-400 to-blue-400 hover:from-green-500 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Raffle'}
          </button>
        </div>
      ) : isRaffleActive && (
        <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl p-6 shadow-lg text-white">
          <h3 className="text-xl font-bold mb-4 text-center">Buy Tickets</h3>
          
          {/* Slide to Buy */}
          <div 
            id="slide-container"
            className="relative bg-white/20 rounded-full h-16 flex items-center px-2 backdrop-blur-sm border border-white/30 mb-4"
          >
            <div 
              className="absolute left-2 top-2 bottom-2 bg-white/30 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${slideProgress}%` }}
            ></div>
            
            <div 
              className="relative z-10 bg-white rounded-full w-12 h-12 flex items-center justify-center cursor-pointer shadow-lg transition-all duration-200 hover:scale-110 select-none"
              style={{ 
                transform: `translateX(${(slideProgress / 100) * (280 - 48)}px)`,
                background: slideProgress > 90 ? '#10B981' : '#ffffff'
              }}
              onMouseDown={handleSlideStart}
              onTouchStart={handleSlideStart}
            >
              {slideProgress > 90 ? (
                <CheckCircle className="text-white" size={24} />
              ) : isLoading ? (
                <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Ticket className="text-purple-500" size={24} />
              )}
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white font-bold text-lg drop-shadow-lg">
                {isLoading ? 'Processing...' :
                 slideProgress > 90 ? 'Release to Buy!' : 
                 slideProgress > 10 ? 'Keep Sliding...' : 
                 'Slide to Buy Ticket →'}
              </span>
            </div>
          </div>
          
          <div className="text-center text-white/80 text-sm">
            💡 Slide right to purchase your ticket for {raffleInfo ? formatToOneDecimal(formatEther(raffleInfo.ticketPrice)) : '0'} CELO
          </div>
        </div>
      )}
  
      {/* Past Winners */}
      {pastWinners.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="text-yellow-600" size={20} />
            <h3 className="text-lg font-bold text-gray-800">Recent Winners</h3>
          </div>
          <div className="space-y-3">
            {pastWinners.slice(0, 3).map((winner, index) => (
              <div key={index} className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-3 border border-yellow-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-orange-800">Day #{winner.dayNumber}</span>
                  <span className="text-xs text-orange-600">{parseFloat(winner.totalPrize).toFixed(1)} CELO</span>
                </div>
                <div className="text-xs">
                  {winner.winners.slice(0, 2).map((addr, i) => (
                    <div key={i} className="flex justify-between items-center mb-1">
                      <span className="font-mono text-orange-700">
                        🏆 {addr.slice(0, 6)}...{addr.slice(-4)}
                      </span>
                      <span className="text-orange-600 font-medium">
                        {parseFloat(winner.prizePerWinner).toFixed(2)} CELO
                      </span>
                    </div>
                  ))}
                  {winner.winners.length > 2 && (
                    <div className="text-center text-orange-600">
                      +{winner.winners.length - 2} more winners
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
  
      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <XCircle className="text-red-500" size={20} />
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        </div>
      )}
  
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="text-green-500" size={20} />
            <p className="text-green-600 font-medium">{success}</p>
          </div>
        </div>
      )}
  
      {txHash && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Zap className="text-blue-500" size={20} />
            <p className="text-blue-600 font-medium text-sm">
              Transaction: {txHash.slice(0, 8)}...{txHash.slice(-8)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
  
  // Slots Screen Component
  const SlotsScreen = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
        <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🎰</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Slots Game</h2>
        <p className="text-gray-600 mb-6">Try your luck with our exciting slots game!</p>
        <button
          onClick={() => {
            console.log('Opening slots modal...');
            setShowSlotsModal(true);
          }}
          className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-bold py-3 px-8 rounded-xl transition-all transform hover:scale-105 shadow-lg"
        >
          Play Slots
        </button>
      </div>
  
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-200">
        <h3 className="text-lg font-bold text-purple-800 mb-4">How to Play</h3>
        <div className="space-y-3 text-sm text-purple-700">
          <div className="flex items-start gap-3">
            <span className="font-bold">1.</span>
            <span>Get 3 free spins per day</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="font-bold">2.</span>
            <span>Match all 3 tokens to win points</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="font-bold">3.</span>
            <span>~33% chance to win each spin</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="font-bold">4.</span>
            <span>Collect points and climb the leaderboard</span>
          </div>
        </div>
      </div>
    </div>
  );
  
  // Profile Screen Component
  const ProfileScreen = () => (
    <div className="space-y-6">
      {/* User Info */}
      {account ? (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              <User className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Your Profile</h2>
              <p className="text-sm font-mono text-gray-600">
                {account.slice(0, 8)}...{account.slice(-6)}
              </p>
            </div>
          </div>
  
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="text-green-600" size={20} />
                <span className="text-sm font-medium text-green-600">Total Tickets</span>
              </div>
              <div className="text-2xl font-bold text-green-800">{userTickets}</div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="text-blue-600" size={20} />
                <span className="text-sm font-medium text-blue-600">Win Rate</span>
              </div>
              <div className="text-2xl font-bold text-blue-800">{getWinChance()}%</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-gray-500" size={24} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Not Connected</h3>
          <p className="text-gray-600 mb-4">Connect your wallet to view your profile</p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105"
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      )}
  
      {/* Network Status */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${chainId === celo.id ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Network Status</h3>
              <p className="text-sm text-gray-600">
                {chainId === celo.id ? 'Connected to Celo' : 'Wrong Network'}
              </p>
            </div>
          </div>
          {chainId !== celo.id && (
            <button
              onClick={() => switchChain({ chainId: celo.id })}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-2 px-4 rounded-xl transition-all transform hover:scale-105"
            >
              Switch to Celo
            </button>
          )}
        </div>
        
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 border border-yellow-200">
          <div className="text-sm text-yellow-800">
            <div className="font-medium mb-2">Network Details:</div>
            <div>Chain ID: {chainId}</div>
            <div>Required: {celo.id} (Celo)</div>
          </div>
        </div>
      </div>
  
      {/* Settings */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="text-gray-600" size={20} />
          <h3 className="text-lg font-bold text-gray-800">Settings</h3>
        </div>
        
        <div className="space-y-3">
          <button
            onClick={shareFrame}
            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Share2 className="text-gray-600" size={18} />
              <span className="text-gray-800">Share App</span>
            </div>
            <ArrowRight className="text-gray-400" size={18} />
          </button>
          
          <button
            onClick={() => window.open('https://celoscan.io', '_blank')}
            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">🔍</span>
              <span className="text-gray-800">View on Explorer</span>
            </div>
            <ArrowRight className="text-gray-400" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Confetti Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce text-2xl"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`
              }}
            >
              {['🎉', '🎊', '🥳', '✨', '🌟'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}
  
      {/* Main Content */}
      <div className="max-w-lg mx-auto min-h-screen flex flex-col">
        {/* Content Area */}
        <div className="flex-1 p-4 pb-24">
          {activeTab === 'raffle' && <RaffleScreen />}
          {activeTab === 'slots' && <SlotsScreen />}
          {activeTab === 'profile' && <ProfileScreen />}
        </div>
  
        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-2xl">
          <div className="max-w-lg mx-auto">
            <div className="flex justify-around py-2">
              <button
                onClick={() => setActiveTab('raffle')}
                className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'raffle' 
                    ? 'text-blue-600' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Home size={20} />
                <span className="text-xs font-medium">Raffle</span>
                {activeTab === 'raffle' && (
                  <div className="w-8 h-0.5 bg-blue-600 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab('slots')}
                className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'slots' 
                    ? 'text-blue-600' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <span className="text-xl">🎰</span>
                <span className="text-xs font-medium">Slots</span>
                {activeTab === 'slots' && (
                  <div className="w-8 h-0.5 bg-blue-600 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${
                  activeTab === 'profile' 
                    ? 'text-blue-600' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <User size={20} />
                <span className="text-xs font-medium">Profile</span>
                {activeTab === 'profile' && (
                  <div className="w-8 h-0.5 bg-blue-600 rounded-full"></div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
   
      {/* Slots Modal */}
      <CraffleSlotsModal isOpen={showSlotsModal} onClose={() => setShowSlotsModal(false)} />
    </div>
   );
   }