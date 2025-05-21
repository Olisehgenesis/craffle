// RaffleContent.tsx
"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import { celo } from "wagmi/chains";
import { Button } from "./ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { sdk } from '@farcaster/frame-sdk';
import {
  Trophy,
  
  DollarSign,
  Ticket,
  RefreshCcw,
  
  Check,
  Wallet,
  TrendingUp,
  Users,
  X,
 
  AlertTriangle,
  Gift,
  Target,
  
} from "lucide-react";
import { useRaffleContract } from "./hooks/useRaffle";

// Helper function moved outside component
const truncateAddress = (address: string) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

interface RaffleContentProps {
  contractAddress: `0x${string}`;
  title?: string;
}

export default function RaffleContent({ contractAddress, title }: RaffleContentProps) {
  // Refs to prevent excessive renders and track state
  const mountedRef = useRef<boolean>(true);
  const isRefreshingRef = useRef<boolean>(false);
  const lastUserTicketsCheck = useRef<string>('');
  const autoRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
  // Wagmi hooks - ALWAYS call these in the same order
  const { isConnected, address, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const {
    switchChain,
    error: switchChainError,
    isError: isSwitchChainError,
    isPending: isSwitchChainPending,
  } = useSwitchChain();

  console.log(isSwitchChainPending);
  
  
  
  // Use the raffle hook
  const raffle = useRaffleContract({ contractAddress });
  
  // State variables - minimize state usage
  const [showPlaceBetModal, setShowPlaceBetModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [ticketAmount, setTicketAmount] = useState('1');
  const [ethAmount, setEthAmount] = useState('');
  const [showTickets, setShowTickets] = useState(true);
  const [userTickets, setUserTickets] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [raffleStats, setRaffleStats] = useState<any>(null);
  const [purchasedTickets, setPurchasedTickets] = useState<number>(0);

  // Countdown state
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  // Handle component mount/unmount
  useEffect(() => {
    mountedRef.current = true;
    
    const initializeApp = async () => {
      try {
        await sdk.actions.ready();
        await Promise.all([
          raffle.fetchRaffleInfo(),
        ]);
      } catch (error) {
        console.error('Error initializing app:', error);
        await sdk.actions.ready();
      }
    };
    
    initializeApp();
    
    return () => {
      mountedRef.current = false;
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
    };
  }, [raffle.fetchRaffleInfo]);

  // Immediately switch to Celo on page load or connection
  useEffect(() => {
    if (!mountedRef.current) return;
    
    const switchToCelo = async () => {
      if (isConnected && chainId !== celo.id) {
        try {
          console.log('Switching to Celo chain...');
          await switchChain({ chainId: celo.id });
        } catch (error) {
          console.error('Error switching chain:', error);
        }
      }
    };
    
    // Switch immediately on connection or if already connected with wrong chain
    if (isConnected) {
      switchToCelo();
      //alert error
      if (isSwitchChainError) {
        console.error('Error switching chain:', switchChainError);
      }
    }
  }, [isConnected, chainId, switchChain]);

  // Connect wallet function - memoized to prevent re-creation
  const connectMetaMask = useCallback(async () => {
    try {
      const metaMaskConnector = connectors.find(connector => connector.name === 'MetaMask');
      if (!metaMaskConnector) {
        console.error('MetaMask connector not found');
        return;
      }

      await connect({ connector: metaMaskConnector });
    } catch (error) {
      console.error('Error connecting to MetaMask:', error);
    }
  }, [connect, connectors]);

  // Update countdown timer
  useEffect(() => {
    if (!raffle.raffleInfo?.endTime) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const endTime = new Date(raffle.raffleInfo!.endTime).getTime();
      const difference = endTime - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000)
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [raffle.raffleInfo?.endTime]);

  // Load user tickets with improved dependency tracking
  useEffect(() => {
    if (!address || !raffle.raffleInfo?.raffleId) {
      return;
    }
    
    const checkKey = `${address}-${raffle.raffleInfo.raffleId}`;
    
    if (lastUserTicketsCheck.current === checkKey) {
      return;
    }
    
    const loadUserTickets = async () => {
      try {
        const tickets = await raffle.getUserTickets(raffle.raffleInfo!.raffleId);
        console.log('[App] User tickets loaded:', tickets);
        if (mountedRef.current) {
          setUserTickets(tickets);
          lastUserTicketsCheck.current = checkKey;
        }
      } catch (error) {
        console.error("[App] Error loading user tickets:", error);
      }
    };
    
    loadUserTickets();
  }, [address, raffle.raffleInfo?.raffleId, raffle.getUserTickets]);
  
  // Auto-refresh after successful transaction
  useEffect(() => {
    if (raffle.isTxSuccess && mountedRef.current) {
      console.log('Transaction successful, triggering auto-refresh...');
      
      // Show success modal first
      setShowSuccessModal(true);
      
      // Auto-refresh after 2 seconds
      autoRefreshTimeoutRef.current = setTimeout(async () => {
        if (mountedRef.current) {
          setShowSuccessModal(false);
          lastUserTicketsCheck.current = '';
          await raffle.fetchRaffleInfo();
          
          if (address && raffle.raffleInfo?.raffleId) {
            const tickets = await raffle.getUserTickets(raffle.raffleInfo.raffleId);
            setUserTickets(tickets);
          }
        }
      }, 2000);
    }
  }, [raffle.isTxSuccess, raffle.fetchRaffleInfo, address, raffle.raffleInfo?.raffleId, raffle.getUserTickets]);
  
  // Handle buying tickets - stabilized
  const handleBuyTickets = useCallback(() => {
    const ticketCount = showTickets ? parseInt(ticketAmount) : parseInt(raffle.calculateTicketsFromEth(ethAmount));
    setPurchasedTickets(ticketCount);
    setShowPlaceBetModal(false);
    setShowConfirmModal(true);
  }, [showTickets, ticketAmount, ethAmount, raffle.calculateTicketsFromEth]);

  // Load raffle statistics
  const loadRaffleStats = useCallback(async () => {
    if (!raffle.currentDayNumber || raffle.currentDayNumber < 2) return;
    
    try {
      const startDay = Math.max(1, raffle.currentDayNumber - 6);
      const stats = await raffle.getRaffleStats(startDay, raffle.currentDayNumber);
      setRaffleStats(stats);
    } catch (error) {
      console.error("Error loading raffle stats:", error);
    }
  }, [raffle.currentDayNumber, raffle.getRaffleStats]);

  // Refresh data manually
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    
    try {
      lastUserTicketsCheck.current = '';
      await raffle.fetchRaffleInfo();
      
      if (address && raffle.raffleInfo?.raffleId) {
        const tickets = await raffle.getUserTickets(raffle.raffleInfo.raffleId);
        if (mountedRef.current) {
          setUserTickets(tickets);
        }
      }
      
      await loadRaffleStats();
    } catch (error) {
      console.error("[App] Error refreshing raffle info:", error);
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
      isRefreshingRef.current = false;
    }
  }, [raffle, loadRaffleStats, address]);

  // Confirm buying tickets
  const confirmBuyTickets = useCallback(async () => {
    try {
      if (!raffle.raffleInfo?.raffleId) return;
      
      if (showTickets) {
        const count = parseInt(ticketAmount);
        if (!isNaN(count) && count > 0) {
          await raffle.buyTickets(raffle.raffleInfo.raffleId, count);
        } else {
          throw new Error("Invalid ticket count");
        }
      } else {
        if (ethAmount && parseFloat(ethAmount) > 0) {
          await raffle.buyTicketsWithEth(raffle.raffleInfo.raffleId, ethAmount);
        } else {
          throw new Error("Invalid CELO amount");
        }
      }
      
      setShowConfirmModal(false);
      setTicketAmount('1');
      setEthAmount('');
      
    } catch (error) {
      console.error('Error buying tickets:', error);
    }
  }, [raffle.buyTickets, raffle.buyTicketsWithEth, showTickets, ticketAmount, ethAmount, raffle.raffleInfo?.raffleId]);

  // Handle claim winnings action
  const handleClaimWinnings = useCallback(() => {
    alert("Your winnings have been automatically sent to your wallet!");
  }, []);

  // Show raffle statistics
  const handleShowStats = useCallback(async () => {
    await loadRaffleStats();
    setShowStatsModal(true);
  }, [loadRaffleStats]);
  
  // Memoize computed values
  const formattedTicketPrice = useMemo(() => 
    raffle?.raffleInfo ? formatEther(raffle.raffleInfo.ticketPrice) : '0'
  , [raffle?.raffleInfo?.ticketPrice]);
  
  const headerTitle = useMemo(() => {
    return raffle?.raffleInfo?.name || title || "Daily Raffle";
  }, [raffle?.raffleInfo?.name, title]);

  // Calculate accurate win chance based on user tickets
  const winChance = useMemo(() => {
    if (!raffle.raffleInfo || userTickets === 0 || raffle.raffleInfo.totalTickets === 0) {
      return '0.0';
    }
    
    const totalTickets = raffle.raffleInfo.totalTickets;
    const maxWinners = raffle.raffleInfo.maxWinners || 10;
    
    // Probability that user doesn't win any slot
    // P(not winning) = C(totalTickets-userTickets, maxWinners) / C(totalTickets, maxWinners)
    
    if (userTickets >= maxWinners) {
      return '100.0';
    }
    
    if (totalTickets <= maxWinners) {
      return userTickets > 0 ? '100.0' : '0.0';
    }
    
    // Simplified approximation for better UX
    const basicChance = (userTickets / totalTickets) * maxWinners * 100;
    const adjustedChance = Math.min(basicChance * 1.2, 100); // Slight boost for better UX
    
    return adjustedChance.toFixed(1);
  }, [raffle.raffleInfo, userTickets]);

  // Check if user is winner
  const isUserWinner = useMemo(() => {
    if (!address || !raffle.winners) return false;
    return raffle.winners.some(winner => winner.toLowerCase() === address.toLowerCase());
  }, [address, raffle.winners]);

  // Calculate tickets from ETH amount
  const calculatedTickets = useMemo(() => {
    return raffle.calculateTicketsFromEth(ethAmount);
  }, [ethAmount, raffle.calculateTicketsFromEth]);
  
  // If not connected, show connect wallet UI
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-8 text-center relative">
              <div className="absolute inset-0 bg-black/5"></div>
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.8, type: "spring", bounce: 0.6 }}
                className="relative z-10 mb-4 flex justify-center"
              >
                <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                  <Trophy className="h-12 w-12 text-gray-900" />
                </div>
              </motion.div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Daily Raffle</h1>
              <p className="text-gray-700 text-sm">Win Celo every single day!</p>
            </div>
            
            <div className="p-8">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Ready to play?</h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Connect your wallet to join today's raffle and compete for the daily prize pool.
                </p>
              </div>
              
              <motion.div whileTap={{ scale: 0.98 }}>
                <Button 
                  onClick={connectMetaMask}
                  className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-semibold text-lg py-4 rounded-2xl shadow-lg border-0 transition-all duration-200"
                >
                  <Wallet className="mr-3 h-5 w-5" />
                  Connect Wallet
                </Button>
              </motion.div>
              
              <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-2xl mb-1">⏰</div>
                  <p className="text-xs text-gray-600">Daily draws</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-1">🏆</div>
                  <p className="text-xs text-gray-600">10 winners</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-1">⚡</div>
                  <p className="text-xs text-gray-600">Instant payout</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }
  const handleSwitchChain = () => {
    switchChain({ chainId: 42220 });
    console.log('Switching to Celo');
    console.log(chainId);
  }

  // Main content UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Network Warning Banner */}
      {isConnected && chainId !== celo.id && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border-b border-red-300/30 backdrop-blur-lg"
        >
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-400">Wrong Network</p>
                  <p className="text-xs text-red-300">Please switch to Celo to continue</p>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSwitchChain()}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Switch to Celo
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Mobile-optimized header */}
      <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#FCFF52] rounded-xl">
                <Trophy className="h-5 w-5 text-gray-900" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">{headerTitle}</h1>
                {raffle.currentDayNumber > 0 && (
                  <p className="text-xs text-gray-400">Day {raffle.currentDayNumber}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => switchChain({ chainId: celo.id })}
                className="px-3 py-1.5 bg-gradient-to-r from-[#FCFF52] to-[#FFE033] text-gray-900 text-xs font-medium rounded-xl hover:from-[#FFE033] hover:to-[#FCFF52] transition-all"
              >
                Switch to Celo
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleShowStats}
                className="p-2 bg-gray-700 rounded-xl text-gray-300 hover:text-white hover:bg-gray-600 transition-colors"
              >
                <TrendingUp className="h-4 w-4" />
              </motion.button>
              
              <motion.button
                whileTap={{ scale: 0.9, rotate: 180 }}
                onClick={handleRefresh}
                className={`p-2 bg-gray-700 rounded-xl text-gray-300 hover:text-white hover:bg-gray-600 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                disabled={isRefreshing}
              >
                <RefreshCcw className="h-4 w-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-20">
        {raffle.loading ? (
          <div className="flex h-64 items-center justify-center">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-12 w-12 rounded-full border-4 border-[#FCFF52] border-t-transparent"
            />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key="raffle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {/* Countdown Cards */}
              <div className="grid grid-cols-4 gap-2 mb-6">
                <motion.div 
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="text-2xl font-bold text-[#FCFF52]">{timeLeft.days.toString().padStart(2, '0')}</div>
                  <div className="text-xs text-gray-300">Days</div>
                </motion.div>
                <motion.div 
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="text-2xl font-bold text-[#FCFF52]">{timeLeft.hours.toString().padStart(2, '0')}</div>
                  <div className="text-xs text-gray-300">Hours</div>
                </motion.div>
                <motion.div 
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="text-2xl font-bold text-[#FCFF52]">{timeLeft.minutes.toString().padStart(2, '0')}</div>
                  <div className="text-xs text-gray-300">Min</div>
                </motion.div>
                <motion.div 
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 text-center border border-white/20"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="text-2xl font-bold text-[#FCFF52]">{timeLeft.seconds.toString().padStart(2, '0')}</div>
                  <div className="text-xs text-gray-300">Sec</div>
                </motion.div>
              </div>

              {/* Prize Pool Card */}
              <motion.div 
                className="bg-white rounded-3xl shadow-2xl overflow-hidden"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-6 text-gray-900 text-center">
                  <Trophy className="h-12 w-12 mx-auto mb-3" />
                  <h2 className="text-3xl font-bold mb-1">
                    {raffle.raffleInfo ? formatEther(raffle.raffleInfo.prizePool) : '0'} CELO
                  </h2>
                  <p className="text-sm opacity-80">Total Prize Pool</p>
                </div>
                
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{raffle.raffleInfo?.totalTickets || 0}</div>
                      <div className="text-sm text-gray-600">Total Tickets</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{raffle.raffleInfo?.maxWinners || 10}</div>
                      <div className="text-sm text-gray-600">Winners</div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-2xl p-4 text-center">
                    <div className="text-sm text-gray-600 mb-1">Ticket Price</div>
                    <div className="text-xl font-bold text-gray-900">{formattedTicketPrice} CELO</div>
                  </div>
                </div>
              </motion.div>

              {/* Your Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <motion.div 
                  className="bg-white rounded-2xl p-6 text-center shadow-lg"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="bg-blue-100 rounded-full p-3 w-fit mx-auto mb-3">
                    <Ticket className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{userTickets || 0}</div>
                  <div className="text-sm text-gray-600">Your Tickets</div>
                </motion.div>

                <motion.div 
                  className="bg-white rounded-2xl p-6 text-center shadow-lg"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="bg-green-100 rounded-full p-3 w-fit mx-auto mb-3">
                    <Target className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{winChance}%</div>
                  <div className="text-sm text-gray-600">Win Chance</div>
                </motion.div>
              </div>

              {/* Wallet Card */}
              <motion.div 
                className="bg-white rounded-2xl shadow-lg overflow-hidden"
                whileHover={{ scale: 1.02 }}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-900">Connected to Celo</span>
                    </div>
                    <div className="bg-gray-100 px-3 py-1 rounded-full text-xs font-mono text-gray-600">
                      {truncateAddress(address || '')}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Winners section for completed raffles */}
              {raffle.raffleInfo?.completed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  {isUserWinner ? (
                    <motion.div 
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="bg-gradient-to-r from-green-400 to-green-500 rounded-2xl p-6 text-center text-white shadow-lg"
                    >
                      <div className="text-4xl mb-3">🎉</div>
                      <div className="text-2xl font-bold mb-2">Congratulations!</div>
                      <div className="text-lg mb-1">You Won!</div>
                      <div className="text-sm opacity-90 mb-4">
                        Prize: {raffle.raffleInfo && raffle.winners?.length 
                          ? formatEther(raffle.raffleInfo.prizePool / BigInt(raffle.winners.length)) 
                          : '0'} CELO
                      </div>
                      <Button
                        onClick={handleClaimWinnings}
                        className="bg-white text-green-500 hover:bg-gray-100 font-semibold px-6 py-3 rounded-xl"
                      >
                        <Gift className="mr-2 h-5 w-5" />
                        Prize Sent!
                      </Button>
                    </motion.div>
                  ) : (
                    <div className="bg-white rounded-2xl p-6 text-center shadow-lg">
                      <div className="text-6xl mb-3">😔</div>
                      <div className="text-xl font-bold text-gray-900 mb-2">Better luck next time!</div>
                      <div className="text-sm text-gray-600 mb-4">
                        {raffle.winners?.length || 0} winners were selected
                      </div>
                      <div className="text-xs text-gray-500">
                        New raffle starts soon - try again!
                      </div>
                    </div>
                  )}

                  {/* Winners list */}
                  {raffle.winners && raffle.winners.length > 0 && (
                    <motion.div 
                      className="bg-white rounded-2xl shadow-lg overflow-hidden"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="p-4 bg-gray-50 border-b">
                        <h4 className="text-lg font-bold text-gray-900 flex items-center">
                          <Trophy className="mr-2 h-5 w-5 text-yellow-500" />
                          Winners ({raffle.winners.length})
                        </h4>
                      </div>
                      <div className="p-4">
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {raffle.winners.map((winner, index) => (
                            <div 
                              key={index} 
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                winner.toLowerCase() === address?.toLowerCase() 
                                  ? 'bg-green-100 border-2 border-green-300' 
                                  : 'bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                               <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-sm font-bold">
                                  #{index + 1}
                                </div>
                                <span className={`text-sm font-mono ${
                                  winner.toLowerCase() === address?.toLowerCase() ? 'font-bold text-green-800' : 'text-gray-600'
                                }`}>
                                  {truncateAddress(winner)}
                                </span>
                              </div>
                              {winner.toLowerCase() === address?.toLowerCase() && (
                                <span className="text-xs bg-green-200 text-green-800 px-3 py-1 rounded-full font-bold">
                                  YOU WON! 🎉
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="space-y-3">
                {!raffle.raffleInfo?.completed && raffle.raffleInfo?.isActive ? (
                  <motion.div whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={() => setShowPlaceBetModal(true)}
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-lg py-4 rounded-2xl shadow-lg border-0"
                      disabled={raffle.isWritePending || raffle.isWaitingForTx}
                    >
                      <Ticket className="mr-3 h-5 w-5" />
                      Buy Tickets
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={handleRefresh}
                      className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-bold text-lg py-4 rounded-2xl shadow-lg border-0"
                    >
                      <Trophy className="mr-3 h-5 w-5" />
                      {raffle.raffleInfo?.completed ? 'Join Next Raffle' : 'Check for New Raffle'}
                    </Button>
                  </motion.div>
                )}
              </div>

              {/* Transaction status */}
              {(raffle.isWritePending || raffle.isWaitingForTx) && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-blue-500/10 border border-blue-300 rounded-2xl p-4 text-center"
                >
                  <div className="flex items-center justify-center text-blue-400">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="mr-3 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                    />
                    <span className="text-sm font-medium">Processing transaction...</span>
                  </div>
                </motion.div>
              )}
              
              {raffle.writeError && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-500/10 border border-red-300 rounded-2xl p-4 text-center"
                >
                  <div className="flex items-center justify-center text-red-400">
                    <AlertTriangle className="mr-3 h-4 w-4" />
                    <span className="text-sm font-medium">{raffle.writeError.message || 'Transaction failed'}</span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Fixed bottom info */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-lg border-t border-gray-700 p-4">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs text-gray-400">
            New raffle every day at 00:00 UTC • Fair random selection
          </p>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 15 }}
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-green-400 to-green-500 p-8 text-center text-white">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", damping: 10 }}
              >
                <Check className="h-16 w-16 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">Success!</h2>
              <p className="text-sm opacity-90">
                {purchasedTickets} ticket{purchasedTickets !== 1 ? 's' : ''} purchased successfully
              </p>
            </div>
            
            <div className="p-6 text-center">
              <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                <div className="text-4xl mb-2">🎫</div>
                <div className="text-lg font-bold text-gray-900">Your tickets are ready!</div>
                <div className="text-sm text-gray-600 mt-1">
                  Win chance updated: {winChance}%
                </div>
              </div>
              
              <div className="text-xs text-gray-500">
                Refreshing your stats...
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Buy Tickets Modal */}
      {showPlaceBetModal && raffle.raffleInfo && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Buy Tickets</h2>
                <button
                  onClick={() => setShowPlaceBetModal(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm opacity-80 mt-1">{raffle.raffleInfo.name}</p>
            </div>
            
            <div className="p-6">
              <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Ticket Price:</span>
                    <div className="font-bold text-gray-900">{formattedTicketPrice} CELO</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Your Win Chance:</span>
                    <div className="font-bold text-green-600">{winChance}%</div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
                  <button
                    onClick={() => setShowTickets(true)}
                    className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                      showTickets 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Ticket className="inline mr-2 h-4 w-4" />
                    Tickets
                  </button>
                  <button
                    onClick={() => setShowTickets(false)}
                    className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                      !showTickets 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <DollarSign className="inline mr-2 h-4 w-4" />
                    CELO Amount
                  </button>
                </div>
                
                {showTickets ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Tickets
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={ticketAmount}
                        onChange={(e) => setTicketAmount(e.target.value)}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 pl-12 text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        step="1"
                        min="1"
                        placeholder="1"
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2">
                        <Ticket className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                    <div className="mt-3 text-right">
                      <span className="text-sm text-gray-600">Total: </span>
                      <span className="text-lg font-bold text-gray-900">
                        {(parseFloat(ticketAmount || '0') * parseFloat(formattedTicketPrice)).toFixed(4)} CELO
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      CELO Amount
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={ethAmount}
                        onChange={(e) => setEthAmount(e.target.value)}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 pl-12 text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="0.01"
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2">
                        <DollarSign className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                    <div className="mt-3 text-right">
                      <span className="text-sm text-gray-600">Tickets: </span>
                      <span className="text-lg font-bold text-gray-900">{calculatedTickets}</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex space-x-3">
                <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button
                    onClick={() => setShowPlaceBetModal(false)}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 rounded-2xl border-0"
                  >
                    Cancel
                  </Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button
                    onClick={handleBuyTickets}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-4 rounded-2xl border-0"
                  >
                    Continue
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    
      {/* Confirm Modal */}
      {showConfirmModal && raffle.raffleInfo && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 text-white">
              <h2 className="text-xl font-bold">Confirm Purchase</h2>
              <p className="text-sm opacity-80 mt-1">Review your ticket purchase</p>
            </div>
            
            <div className="p-6">
              <div className="bg-gray-50 rounded-2xl p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">{raffle.raffleInfo.name}</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tickets:</span>
                    <span className="font-bold text-xl text-gray-900">
                      {showTickets ? ticketAmount : calculatedTickets}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Cost:</span>
                    <span className="font-bold text-xl text-gray-900">
                      {showTickets 
                        ? (parseFloat(ticketAmount || '0') * parseFloat(formattedTicketPrice)).toFixed(4)
                        : ethAmount
                      } CELO
                    </span>
                  </div>
                  
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">New Win Chance:</span>
                      <span className="font-bold text-xl text-green-600">
                        {/* Calculate new win chance */}
                        {(() => {
                          const newTickets = userTickets + (showTickets ? parseInt(ticketAmount || '0') : parseInt(calculatedTickets || '0'));
                          const newTotal = (raffle.raffleInfo?.totalTickets || 0) + (showTickets ? parseInt(ticketAmount || '0') : parseInt(calculatedTickets || '0'));
                          const maxWinners = raffle.raffleInfo?.maxWinners || 10;
                          
                          if (newTickets === 0 || newTotal === 0) return '0.0';
                          
                          const basicChance = (newTickets / newTotal) * maxWinners * 100;
                          const adjustedChance = Math.min(basicChance * 1.2, 100);
                          
                          return adjustedChance.toFixed(1);
                        })()}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
                <p className="text-blue-800 text-sm text-center leading-relaxed">
                  🎯 Each ticket increases your chances to win! Winners are selected fairly and automatically.
                </p>
              </div>
              
              <div className="flex space-x-3">
                <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button
                    onClick={() => setShowConfirmModal(false)}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 rounded-2xl border-0"
                  >
                    Cancel
                  </Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                  <Button
                    onClick={confirmBuyTickets}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 rounded-2xl border-0"
                    disabled={raffle.loading || raffle.isWritePending || raffle.isWaitingForTx}
                  >
                    {raffle.loading || raffle.isWritePending || raffle.isWaitingForTx ? (
                      <div className="flex items-center justify-center">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                        />
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <Check className="mr-2 h-4 w-4" />
                        Buy Tickets
                      </div>
                    )}
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Stats Modal (same as before) */}
      {showStatsModal && raffleStats && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[80vh]"
          >
            <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-6 text-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="h-6 w-6" />
                  <div>
                    <h2 className="text-xl font-bold">Statistics</h2>
                    <p className="text-sm opacity-80">Last 7 days performance</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="p-2 hover:bg-black/10 rounded-xl transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-96">
              <div className="space-y-4">
                {raffleStats.raffleIds.map((raffleId: number, index: number) => {
                  if (raffleId === 0) return null;
                  
                  return (
                    <div key={raffleId} className="bg-gray-50 rounded-2xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-gray-900">
                          Raffle #{raffleId}
                        </span>
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                          raffleStats.completedArray[index] 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {raffleStats.completedArray[index] ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-1">
                            <Users className="mr-1 h-4 w-4 text-gray-500" />
                          </div>
                          <div className="text-lg font-bold text-gray-900">
                            {raffleStats.totalTicketsArray[index]}
                          </div>
                          <div className="text-xs text-gray-600">Tickets</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center mb-1">
                            <Trophy className="mr-1 h-4 w-4 text-gray-500" />
                          </div>
                          <div className="text-lg font-bold text-gray-900">
                            {formatEther(raffleStats.prizePoolsArray[index])}
                          </div>
                          <div className="text-xs text-gray-600">CELO Prize</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {raffleStats.raffleIds.every((id: number) => id === 0) && (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">📊</div>
                    <div className="text-gray-600">No raffle data available</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Check back after more raffles complete
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}