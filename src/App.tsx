import  { useState, useEffect } from 'react';
import { createWalletClient, parseEther, encodeFunctionData, formatEther, createPublicClient, http, WalletClient } from 'viem';
import { celo } from 'viem/chains';
import { useSwitchChain } from 'wagmi';
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk';
import { raffleABI } from './hooks/abi';
import { PublicClient } from 'viem';

const RAFFLE_CONTRACT_ADDRESS = '0x492CC1634AA2E8Ba909F2a61d886ef6c8C651074';

const DIVVI_CONFIG = {
  consumer: '0x53eaF4CD171842d8144e45211308e5D90B4b0088',
  providers: [
    '0x0423189886d7966f0dd7e7d256898daeee625dca',
    '0xc95876688026be9d6fa7a7c33328bd013effa2bb',
    '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8'
  ]
};

export default function CeloRaffleApp() {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Purchase states
  const [ticketAmount, setTicketAmount] = useState(1);
  const [ethAmount, setEthAmount] = useState('');
  const [purchaseMethod, setPurchaseMethod] = useState('tickets');
  const [isLoading, setIsLoading] = useState(false);
  
  // Raffle info
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
  
  // Transaction states
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Animation states
  const [isAnimating, setIsAnimating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const { switchChain } = useSwitchChain();

  // Switch to Celo network
  const switchToCelo = async () => {
    try {
      await switchChain({ chainId: celo.id });
    } catch (error) {
      setError('Failed to switch to Celo network');
    }
  };

  // Initialize clients
  useEffect(() => {
    const initializeClients = () => {
      const publicClientInstance = createPublicClient({
        chain: celo,
        transport: http()
      });
      setPublicClient(publicClientInstance as any);
    };

    initializeClients();
  }, []);

// Connect Wallet with animation
const connectWallet = async () => {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    setError('Please install MetaMask or another Web3 wallet 💼');
    return;
  }

    setIsConnecting(true);
    setIsAnimating(true);
    
    try {
      const client = createWalletClient({
        chain: celo,
        transport: http()
      });

      const [address] = await client.getAddresses();
      setWalletClient(client);
      setAccount(address as `0x${string}`);
      setError('');
      setSuccess('🎉 Wallet connected! Welcome to the raffle!');
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    } catch (err: unknown) {
      setError('Failed to connect wallet: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsConnecting(false);
      setIsAnimating(false);
    }
  };''

  // Fetch current raffle info
  const fetchRaffleInfo = async () => {
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
  };

  // Fetch user tickets
  const fetchUserTickets = async () => {
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
  };

  // Create daily raffle with enhanced feedback
  const createDailyRaffle = async () => {
    if (!walletClient || !account) {
      setError('Please connect your wallet first 🔌');
      return;
    }

    setIsLoading(true);
    setIsAnimating(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const encoded = encodeFunctionData({
        abi: raffleABI,
        functionName: 'createDailyRaffle',
        args: []
      });

      const dataSuffix = getDataSuffix({
        consumer: account as `0x${string}`,
        providers: DIVVI_CONFIG.providers.map(provider => provider as `0x${string}`)
      });
      const finalData = encoded + dataSuffix;

      const hash = await walletClient.sendTransaction({
        account,
        to: RAFFLE_CONTRACT_ADDRESS,
        data: finalData as `0x${string}`,
        chain: celo
      });

      setTxHash(hash);
      setSuccess('🚀 Daily raffle creation in progress...');

      if (!publicClient) {
        throw new Error('Public client not initialized');
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        const chainId = await walletClient.getChainId();
        await submitReferral({
          txHash: hash,
          chainId
        });

        setSuccess('🎊 Daily raffle created successfully!');
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        
        await fetchRaffleInfo();
      } else {
        setError('❌ Transaction failed');
      }
    } catch (err) {
      console.error('Create raffle error:', err);
      setError('Failed to create daily raffle: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
      setIsAnimating(false);
    }
  };

  // Buy tickets with enhanced feedback
  const buyTickets = async () => {
    if (!walletClient || !account || !raffleInfo) {
      setError('Please connect your wallet and ensure raffle info is loaded 🔄');
      return;
    }

    if (ticketAmount <= 0) {
      setError('Please enter a valid ticket amount 🎫');
      return;
    }

    setIsLoading(true);
    setIsAnimating(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const totalCost = BigInt(ticketAmount) * raffleInfo.ticketPrice;

      const encoded = encodeFunctionData({
        abi: raffleABI,
        functionName: 'buyTickets',
        args: [BigInt(ticketAmount)]
      });

      const dataSuffix = getDataSuffix({
        consumer: account as `0x${string}`,
        providers: DIVVI_CONFIG.providers.map(provider => provider as `0x${string}`)
      });
      const finalData = encoded + dataSuffix;

      const hash = await walletClient.sendTransaction({
        account,
        to: RAFFLE_CONTRACT_ADDRESS as `0x${string}`,
        data: finalData as `0x${string}`,
        value: totalCost,
        chain: celo
      });

      setTxHash(hash);
      setSuccess(`🎫 Buying ${ticketAmount} ticket(s)... Good luck!`);

      if (!publicClient) {
        throw new Error('Public client not initialized');
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        const chainId = await walletClient.getChainId();
        await submitReferral({
          txHash: hash,
          chainId
        });

        setSuccess(`🎉 Successfully bought ${ticketAmount} ticket(s)! You're in the game!`);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        
        await fetchRaffleInfo();
        await fetchUserTickets();
      } else {
        setError('❌ Transaction failed');
      }
    } catch (err) {
      console.error('Buy tickets error:', err);
      setError('Failed to buy tickets: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
      setIsAnimating(false);
    }
  };

  // Buy tickets with ETH with enhanced feedback
  const buyTicketsWithEth = async () => {
    if (!walletClient || !account || !ethAmount) {
      setError('Please connect your wallet and enter a CELO amount 💰');
      return;
    }

    if (parseFloat(ethAmount) <= 0) {
      setError('Please enter a valid CELO amount 💱');
      return;
    }

    setIsLoading(true);
    setIsAnimating(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const ethValue = parseEther(ethAmount);

      const encoded = encodeFunctionData({
        abi: raffleABI,
        functionName: 'buyTicketsWithEth',
        args: []
      });

      const dataSuffix = getDataSuffix({
        consumer: account as `0x${string}`,
        providers: DIVVI_CONFIG.providers.map(provider => provider as `0x${string}`)
      });
      const finalData = encoded + dataSuffix;

      const hash = await walletClient.sendTransaction({
        account,
        to: RAFFLE_CONTRACT_ADDRESS as `0x${string}`,
        data: finalData as `0x${string}`,
        value: ethValue,
        chain: celo
      });

      setTxHash(hash);
      setSuccess(`💸 Buying tickets with ${ethAmount} CELO...`);

      if (!publicClient) {
        throw new Error('Public client not initialized');
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (receipt.status === 'success') {
        const chainId = await walletClient.getChainId();
        await submitReferral({
          txHash: hash,
          chainId
        });

        setSuccess(`🎊 Successfully bought tickets with ${ethAmount} CELO!`);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        
        setEthAmount('');
        await fetchRaffleInfo();
        await fetchUserTickets();
      } else {
        setError('❌ Transaction failed');
      }
    } catch (err) {
      console.error('Buy tickets with ETH error:', err);
      setError('Failed to buy tickets with CELO: ' + (err instanceof Error ? err.message : 'Unknown error'));
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

  // Load data effects
  useEffect(() => {
    if (publicClient) {
      fetchRaffleInfo();
    }
  }, [publicClient]);

  useEffect(() => {
    if (raffleInfo && account) {
      fetchUserTickets();
    }
  }, [raffleInfo, account]);

  useEffect(() => {
    if (!publicClient) return;

    const interval = setInterval(() => {
      fetchRaffleInfo();
      if (account && raffleInfo) {
        fetchUserTickets();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [publicClient, account, raffleInfo]);

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
          <h1 className="text-3xl font-bold text-fig mb-2">
            Daily Raffle
          </h1>
          <p className="text-forest font-medium">
            Win big on Celo! 🚀
          </p>
          <div className="text-2xl mt-2">Day #{currentDayNumber} 📅</div>
        </div>

        {/* Celo Network Switch */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 mb-4 border-2 border-prosperity-yellow shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-prosperity-yellow rounded-full"></div>
              <span className="font-bold text-fig">Celo Network</span>
            </div>
            <button
              onClick={switchToCelo}
              className="bg-forest hover:bg-forest/80 text-white px-4 py-2 rounded-xl font-bold transition-all transform hover:scale-105"
            >
              Switch 🔄
            </button>
          </div>
        </div>

        {/* Wallet Connection */}
        {!account ? (
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 text-center border-2 border-prosperity-yellow shadow-lg">
            <div className="text-4xl mb-4">👛</div>
            <h2 className="text-xl font-bold text-fig mb-4">
              Connect to Play!
            </h2>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className={`bg-prosperity-yellow hover:bg-prosperity-yellow/80 text-fig font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
                isAnimating ? 'animate-pulse' : ''
              }`}
            >
              {isConnecting ? 'Connecting... 🔗' : 'Connect Wallet 🚀'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Player Info */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-jade shadow-lg">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-lg">🎮 Player</div>
                  <p className="text-sm font-mono text-wood">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-forest">Your Tickets</div>
                  <div className="text-2xl font-bold text-fig">🎫 {userTickets}</div>
                  {raffleInfo && raffleInfo.totalTickets > 0 && (
                    <div className="text-xs text-forest">
                      {getWinChance()}% win chance
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Current Raffle Status */}
            {raffleInfo && (
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-sky shadow-lg">
                <div className="text-center">
                  <div className="text-lg font-bold text-fig mb-2">
                    🏆 Raffle #{raffleInfo.raffleId}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="text-center">
                      <div className="text-xs text-forest">Total Tickets</div>
                      <div className="text-xl font-bold text-fig">
                        🎫 {raffleInfo.totalTickets}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-forest">Prize Pool</div>
                      <div className="text-xl font-bold text-fig">
                        💰 {formatEther(raffleInfo.prizePool)}
                      </div>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${
                    isRaffleActive 
                      ? 'bg-success/20 text-success' 
                      : 'bg-error/20 text-error'
                  }`}>
                    {isRaffleActive ? '🟢 LIVE' : '🔴 ENDED'}
                  </div>
                  {raffleInfo.endTime && (
                    <div className="text-xs text-wood mt-1">
                      ⏰ Ends: {formatTime(raffleInfo.endTime)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Create Daily Raffle */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-citrus shadow-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-fig mb-2">
                  🎪 Start New Raffle
                </div>
                <p className="text-sm text-forest mb-3">
                  Create today's raffle and be the first to play!
                </p>
                <button
                  onClick={createDailyRaffle}
                  disabled={isLoading}
                  className={`w-full bg-citrus hover:bg-citrus/80 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
                    isAnimating ? 'animate-pulse' : ''
                  }`}
                >
                  {isLoading ? 'Creating... 🎨' : 'Create Raffle 🚀'}
                </button>
              </div>
            </div>

            {/* Ticket Purchase */}
            {raffleInfo && isRaffleActive && (
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-4 border-2 border-lotus shadow-lg">
                <div className="text-lg font-bold text-fig mb-3 text-center">
                  🎫 Buy Tickets
                </div>
                
                {/* Purchase Method Toggle */}
                <div className="flex mb-4 bg-sand rounded-xl p-1">
                  <button
                    onClick={() => setPurchaseMethod('tickets')}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                      purchaseMethod === 'tickets'
                        ? 'bg-prosperity-yellow text-fig shadow-md'
                        : 'text-wood hover:text-fig'
                    }`}
                  >
                    🎫 Count
                  </button>
                  <button
                    onClick={() => setPurchaseMethod('eth')}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                      purchaseMethod === 'eth'
                        ? 'bg-prosperity-yellow text-fig shadow-md'
                        : 'text-wood hover:text-fig'
                    }`}
                  >
                    💰 CELO
                  </button>
                </div>

                {/* Purchase by ticket count */}
                {purchaseMethod === 'tickets' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-forest mb-2 font-medium">
                        Number of Tickets 🎫
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={ticketAmount}
                        onChange={(e) => setTicketAmount(parseInt(e.target.value) || 1)}
                        className="w-full bg-gypsum border-2 border-sand rounded-xl px-4 py-3 text-fig placeholder-wood focus:outline-none focus:border-prosperity-yellow transition-colors"
                        placeholder="Enter tickets"
                      />
                      {raffleInfo.ticketPrice > 0n && (
                        <p className="text-sm text-forest mt-2">
                          💸 Total: {formatEther(BigInt(ticketAmount) * raffleInfo.ticketPrice)} CELO
                        </p>
                      )}
                    </div>
                    <button
                      onClick={buyTickets}
                      disabled={isLoading || ticketAmount <= 0}
                      className={`w-full bg-lotus hover:bg-lotus/80 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
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
                      <label className="block text-forest mb-2 font-medium">
                        CELO Amount 💰
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={ethAmount}
                        onChange={(e) => setEthAmount(e.target.value)}
                        className="w-full bg-gypsum border-2 border-sand rounded-xl px-4 py-3 text-fig placeholder-wood focus:outline-none focus:border-prosperity-yellow transition-colors"
                        placeholder="Enter CELO"
                      />
                      {ethAmount && raffleInfo.ticketPrice > 0n && (
                        <p className="text-sm text-forest mt-2">
                          🎫 Tickets: {calculateTicketsFromEth()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={buyTicketsWithEth}
                      disabled={isLoading || !ethAmount || parseFloat(ethAmount) <= 0}
                      className={`w-full bg-lavender hover:bg-lavender/80 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-105 disabled:opacity-50 ${
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
              <div className="bg-error/20 border-2 border-error rounded-xl p-3">
                <p className="text-error font-medium text-center">❌ {error}</p>
              </div>
            )}

            {success && (
              <div className="bg-success/20 border-2 border-success rounded-xl p-3">
                <p className="text-success font-medium text-center">✅ {success}</p>
              </div>
            )}

            {txHash && (
              <div className="bg-sky/20 border-2 border-sky rounded-xl p-3">
                <p className="text-sky font-medium text-center text-sm">
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