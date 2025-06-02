import { useState, useEffect, useCallback } from 'react';
import { parseEther, formatEther, Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient, useSendTransaction } from 'wagmi';
import { celo } from 'viem/chains';
import { useSwitchChain } from 'wagmi';
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk';
import { Interface } from 'ethers';
import { sdk } from '@farcaster/frame-sdk';

// Mock ABI - replace with your actual raffle ABI
const raffleABI = [
  {
    inputs: [],
    name: 'createDailyRaffle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'quantity', type: 'uint256' }],
    name: 'buyTickets',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'buyTicketsWithEth',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getCurrentRaffleInfo',
    outputs: [
      { name: 'raffleId', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'ticketPrice', type: 'uint256' },
      { name: 'totalTickets', type: 'uint256' },
      { name: 'prizePool', type: 'uint256' },
      { name: 'completed', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getCurrentDayNumber',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'isCurrentRaffleActive',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'raffleId', type: 'uint256' }
    ],
    name: 'getUserTickets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const RAFFLE_CONTRACT_ADDRESS = '0x492CC1634AA2E8Ba909F2a61d886ef6c8C651074';

// Centralized Divvi configuration
const DIVVI_CONFIG: { consumer: `0x${string}`; providers: `0x${string}`[] } = {
  consumer: '0x53eaF4CD171842d8144e45211308e5D90B4b0088',
  providers: [
    '0x0423189886d7966f0dd7e7d256898daeee625dca',
    '0xc95876688026be9d6fa7a7c33328bd013effa2bb', 
    '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8'
  ]
};

// Custom hook for Divvi-enabled transactions
const useDivviTransaction = () => {
  const { sendTransactionAsync } = useSendTransaction();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: celo.id });

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

      // Create interface and encode function data
      const raffleInterface = new Interface(raffleABI);
      const encodedData = raffleInterface.encodeFunctionData(functionName, args);

      // Get Divvi data suffix
      const dataSuffix = getDataSuffix(DIVVI_CONFIG);
      const finalData = encodedData + dataSuffix;

      // Send transaction with Divvi integration
      const txHash = await sendTransactionAsync({
        to: RAFFLE_CONTRACT_ADDRESS as Address,
        data: finalData as `0x${string}`,
        value,
      });

      if (!txHash) throw new Error('Transaction failed to send');

      // Wait for confirmation
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        
        if (receipt.status === 'success') {
          // Submit to Divvi
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
  }, [sendTransactionAsync, walletClient, publicClient]);

  return { executeWithDivvi };
};

export default function CeloRaffleApp() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: celo.id });
  const { switchChain } = useSwitchChain();
  const { executeWithDivvi } = useDivviTransaction();
  
  // State management
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [ticketAmount, setTicketAmount] = useState(1);
  const [ethAmount, setEthAmount] = useState('');
  const [purchaseMethod, setPurchaseMethod] = useState('tickets');
  const [isLoading, setIsLoading] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  
  // Raffle state
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
  
  // UI state
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Utility functions
  const showSuccess = useCallback((message: string) => {
    setSuccess(message);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  }, []);

  const resetMessages = useCallback(() => {
    setError('');
    setSuccess('');
    setTxHash('');
  }, []);

  // Switch to Celo network
  const switchToCelo = async () => {
    try {
      await switchChain({ chainId: celo.id });
    } catch (error) {
      setError('Failed to switch to Celo network');
    }
  };

  // Connect wallet
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

  // Fetch raffle information
  const fetchRaffleInfo = useCallback(async () => {
    if (!publicClient) return;

    try {
      const [raffleData, dayNumber, isActive] = await Promise.all([
        publicClient.readContract({
          address: RAFFLE_CONTRACT_ADDRESS,
          abi: raffleABI,
          functionName: 'getCurrentRaffleInfo'
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

      setRaffleInfo({
        raffleId: Number(raffleData[0]),
        startTime: new Date(Number(raffleData[1]) * 1000),
        endTime: new Date(Number(raffleData[2]) * 1000),
        ticketPrice: raffleData[3],
        totalTickets: Number(raffleData[4]),
        prizePool: raffleData[5],
        completed: raffleData[6]
      });

      setCurrentDayNumber(Number(dayNumber));
      setIsRaffleActive(isActive);
    } catch (err) {
      console.error('Failed to fetch raffle info:', err);
      setError('Failed to fetch raffle information 📊');
    }
  }, [publicClient]);

  // Fetch user tickets
  const fetchUserTickets = useCallback(async () => {
    if (!publicClient || !account || !raffleInfo) return;

    try {
      const tickets = await publicClient.readContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: raffleABI,
        functionName: 'getUserTickets',
        args: [account, BigInt(raffleInfo.raffleId)]
      });

      setUserTickets(Number(tickets));
    } catch (err) {
      console.error('Failed to fetch user tickets:', err);
    }
  }, [publicClient, account, raffleInfo]);

  // Create daily raffle with Divvi
  const createDailyRaffle = async () => {
    if (!account) {
      setError('Please connect your wallet first 🔌');
      return;
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

  // Buy tickets with Divvi
  const buyTickets = async (quantity: number) => {
    if (!account) {
      setError('Please connect your wallet first 🔌');
      return;
    }

    setIsLoading(true);
    setIsAnimating(true);
    resetMessages();

    try {
      await executeWithDivvi({
        functionName: 'buyTickets',
        args: [quantity],
        onSuccess: (txHash) => {
          setTxHash(txHash);
          showSuccess('🎊 Tickets purchased successfully!');
          fetchRaffleInfo();
          fetchUserTickets();
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

  // Buy tickets with ETH and Divvi
  const buyTicketsWithEth = async () => {
    if (!account || !ethAmount) {
      setError('Please connect your wallet and enter a CELO amount 💰');
      return;
    }

    if (parseFloat(ethAmount) <= 0) {
      setError('Please enter a valid CELO amount 💱');
      return;
    }

    setIsLoading(true);
    setIsAnimating(true);
    resetMessages();

    try {
      const ethValue = parseEther(ethAmount);

      await executeWithDivvi({
        functionName: 'buyTicketsWithEth',
        args: [],
        value: ethValue,
        onSuccess: (txHash) => {
          setTxHash(txHash);
          showSuccess(`🎊 Successfully bought tickets with ${ethAmount} CELO!`);
          setEthAmount('');
          fetchRaffleInfo();
          fetchUserTickets();
        },
        onError: (error) => {
          setError('Failed to buy tickets with CELO: ' + error.message);
        }
      });
    } catch (err) {
      // Error already handled in onError callback
    } finally {
      setIsLoading(false);
      setIsAnimating(false);
    }
  };

  // Helper functions
  const formatTime = (timestamp: string | number | Date) => {
    return new Date(timestamp).toLocaleString();
  };

  const calculateTicketsFromEth = () => {
    if (!ethAmount || !raffleInfo) return 0;
    try {
      const ethValue = parseEther(ethAmount);
      return Number(ethValue / raffleInfo.ticketPrice);
    } catch {
      return 0;
    }
  };

  const getWinChance = () => {
    if (!raffleInfo || raffleInfo.totalTickets === 0) return 0;
    return ((userTickets / raffleInfo.totalTickets) * 100).toFixed(2);
  };

  // Effects
  useEffect(() => {
    if (publicClient) {
      fetchRaffleInfo();
    }
  }, [fetchRaffleInfo]);

  useEffect(() => {
    if (raffleInfo && account) {
      fetchUserTickets();
    }
  }, [fetchUserTickets]);

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

  // Initialize Farcaster Mini App
  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        // Wait for initial data to load
        if (publicClient) {
          await fetchRaffleInfo();
        }
        
        // Call ready when the app is fully loaded
        await sdk.actions.ready();
        setIsAppReady(true);
        console.log('✅ Farcaster Mini App ready');
      } catch (error) {
        console.error('Failed to initialize Farcaster Mini App:', error);
        // Fallback - mark as ready anyway
        setIsAppReady(true);
      }
    };

    initializeFarcaster();
  }, [publicClient, fetchRaffleInfo]);

  // Show loading state until app is ready
  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-yellow-50 to-green-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-spin">🎰</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Raffle...</h2>
          <div className="animate-pulse text-gray-600">Preparing your game experience</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-yellow-50 to-green-100 p-4 relative overflow-hidden">
      {/* Confetti Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
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

      {/* Floating decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-6xl animate-spin-slow">🎯</div>
        <div className="absolute top-20 right-20 text-4xl animate-bounce">💰</div>
        <div className="absolute bottom-20 left-20 text-5xl animate-pulse">🎪</div>
        <div className="absolute bottom-10 right-10 text-3xl animate-spin-slow">🎲</div>
      </div>

      <div className="max-w-md mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-3 animate-bounce">🎰</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Daily Raffle
          </h1>
          <p className="text-gray-600 font-medium">
            Win big on Celo! 🚀
          </p>
          <div className="text-2xl mt-2">Day #{currentDayNumber} 📅</div>
        </div>

        {/* Celo Network Switch */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 mb-4 border-2 border-yellow-400 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-yellow-400 rounded-full"></div>
              <span className="font-bold text-gray-800">Celo Network</span>
            </div>
            <button
              onClick={switchToCelo}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-bold transition-all transform hover:scale-105"
            >
              Switch 🔄
            </button>
          </div>
        </div>

        {/* Wallet Connection */}
        {!account ? (
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 text-center border-2 border-yellow-400 shadow-lg">
            <div className="text-4xl mb-4">👛</div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Connect to Play!
            </h2>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className={`bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
                isAnimating ? 'animate-pulse' : ''
              }`}
            >
              {isConnecting ? 'Connecting... 🔗' : 'Connect Wallet 🚀'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Player Info */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-green-400 shadow-lg">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-lg">🎮 Player</div>
                  <p className="text-sm font-mono text-gray-600">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-green-600">Your Tickets</div>
                  <div className="text-2xl font-bold text-gray-800">🎫 {userTickets}</div>
                  {raffleInfo && raffleInfo.totalTickets > 0 && (
                    <div className="text-xs text-green-600">
                      {getWinChance()}% win chance
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Current Raffle Status */}
            {raffleInfo && (
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-blue-400 shadow-lg">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-800 mb-2">
                    🏆 Raffle #{raffleInfo.raffleId}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="text-center">
                      <div className="text-xs text-green-600">Total Tickets</div>
                      <div className="text-xl font-bold text-gray-800">
                        🎫 {raffleInfo.totalTickets}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-green-600">Prize Pool</div>
                      <div className="text-xl font-bold text-gray-800">
                        💰 {formatEther(raffleInfo.prizePool)}
                      </div>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${
                    isRaffleActive 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-red-100 text-red-600'
                  }`}>
                    {isRaffleActive ? '🟢 LIVE' : '🔴 ENDED'}
                  </div>
                  {raffleInfo.endTime && (
                    <div className="text-xs text-gray-500 mt-1">
                      ⏰ Ends: {formatTime(raffleInfo.endTime)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Create Daily Raffle */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-orange-400 shadow-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-800 mb-2">
                  🎪 Start New Raffle
                </div>
                <p className="text-sm text-green-600 mb-3">
                  Create today's raffle and be the first to play!
                </p>
                <button
                  onClick={createDailyRaffle}
                  disabled={isLoading}
                  className={`w-full bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
                    isAnimating ? 'animate-pulse' : ''
                  }`}
                >
                  {isLoading ? 'Creating... 🎨' : 'Create Raffle 🚀'}
                </button>
              </div>
            </div>

            {/* Ticket Purchase */}
            {raffleInfo && isRaffleActive && (
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-purple-400 shadow-lg">
                <div className="text-lg font-bold text-gray-800 mb-3 text-center">
                  🎫 Buy Tickets
                </div>
                
                {/* Purchase Method Toggle */}
                <div className="flex mb-4 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setPurchaseMethod('tickets')}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                      purchaseMethod === 'tickets'
                        ? 'bg-yellow-400 text-gray-800 shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    🎫 Count
                  </button>
                  <button
                    onClick={() => setPurchaseMethod('eth')}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                      purchaseMethod === 'eth'
                        ? 'bg-yellow-400 text-gray-800 shadow-md'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    💰 CELO
                  </button>
                </div>

                {/* Purchase by ticket count */}
                {purchaseMethod === 'tickets' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-green-600 mb-2 font-medium">
                        Number of Tickets 🎫
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={ticketAmount}
                        onChange={(e) => setTicketAmount(parseInt(e.target.value) || 1)}
                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
                        placeholder="Enter tickets"
                      />
                      {raffleInfo.ticketPrice > 0n && (
                        <p className="text-sm text-green-600 mt-2">
                          💸 Total: {formatEther(BigInt(ticketAmount) * raffleInfo.ticketPrice)} CELO
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => buyTickets(ticketAmount)}
                      disabled={isLoading || ticketAmount <= 0}
                      className={`w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
                        isAnimating ? 'animate-pulse' : ''
                      }`}
                    >
                      {isLoading ? 'Buying... 🛒' : `Buy ${ticketAmount} Ticket(s) 🎫`}
                    </button>
                  </div>
                )}

                {/* Purchase by CELO amount */}
                {purchaseMethod === 'eth' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-green-600 mb-2 font-medium">
                        CELO Amount 💰
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={ethAmount}
                        onChange={(e) => setEthAmount(e.target.value)}
                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
                        placeholder="Enter CELO"
                      />
                      {ethAmount && raffleInfo.ticketPrice > 0n && (
                        <p className="text-sm text-green-600 mt-2">
                          🎫 Tickets: {calculateTicketsFromEth()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={buyTicketsWithEth}
                      disabled={isLoading || !ethAmount || parseFloat(ethAmount) <= 0}
                      className={`w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
                        isAnimating ? 'animate-pulse' : ''
                      }`}
                    >
                      {isLoading ? 'Buying... 💸' : `Buy with ${ethAmount} CELO 💰`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Status Messages */}
            {error && (
              <div className="bg-red-100 border-2 border-red-400 rounded-xl p-3">
                <p className="text-red-600 font-medium text-center">❌ {error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-100 border-2 border-green-400 rounded-xl p-3">
                <p className="text-green-600 font-medium text-center">✅ {success}</p>
              </div>
            )}

            {txHash && (
              <div className="bg-blue-100 border-2 border-blue-400 rounded-xl p-3">
                <p className="text-blue-600 font-medium text-center text-sm">
                  🔗 Transaction: {txHash.slice(0, 8)}...{txHash.slice(-8)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}