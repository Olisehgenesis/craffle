import { useState, useEffect, useCallback } from 'react';
import {  formatEther, Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient, useSendTransaction } from 'wagmi';
import { celo } from 'viem/chains';
import { useSwitchChain } from 'wagmi';
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk';
import { Interface } from 'ethers';
import { sdk } from '@farcaster/frame-sdk';
import { raffleABI } from './hooks/abi';

// Mock ABI - replace with your actual raffle ABI
const RAFFLE_CONTRACT_ADDRESS = '0x492CC1634AA2E8Ba909F2a61d886ef6c8C651074';

// Centralized Divvi configuration
const DIVVI_CONFIG = {
 consumer: '0x53eaF4CD171842d8144e45211308e5D90B4b0088' as `0x${string}`,
 providers: [
   '0x0423189886d7966f0dd7e7d256898daeee625dca',
   '0xc95876688026be9d6fa7a7c33328bd013effa2bb', 
   '0x5f0a55fad9424ac99429f635dfb9bf20c3360ab8'
 ] as `0x${string}`[]
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
 const [countdown, setCountdown] = useState('');
 const [timeLeft, setTimeLeft] = useState({
   days: 0,
   hours: 0,
   minutes: 0,
   seconds: 0
 });
 const [isSliding, setIsSliding] = useState(false);
 const [slideProgress, setSlideProgress] = useState(0);

 console.log(isSliding);

 // Utility functions
 const showSuccess = useCallback((message: string, shouldReload = false) => {
   setSuccess(message);
   setShowConfetti(true);
   setTimeout(() => setShowConfetti(false), 3000);
   
   // Reload app after ticket purchases for fresh data
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

 // Countdown calculation
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
   } else {
     setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
     setCountdown('Ended');
   }
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
   if (!account || !raffleInfo) {
     setError('Please connect your wallet first 🔌');
     return;
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
       onSuccess: (txHash) => {
         setTxHash(txHash);
         showSuccess('🎊 Tickets purchased successfully!', true); // Reload after ticket purchase
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

 // Helper functions
 const formatTime = (timestamp: string | number | Date) => {
   return new Date(timestamp).toLocaleString();
 };

 const getWinChance = () => {
   if (!raffleInfo || raffleInfo.totalTickets === 0) return 0;
   return ((userTickets / raffleInfo.totalTickets) * 100).toFixed(1);
 };

 // Format numbers to 1 decimal place
 const formatToOneDecimal = (value: string | number) => {
   return parseFloat(value.toString()).toFixed(1);
 };

 // Slide to buy ticket handler
 const handleSlideComplete = async () => {
   if (!account || !raffleInfo || !isRaffleActive) return;
   
   setIsSliding(false);
   setSlideProgress(0);
   await buyTickets(1); // Buy one ticket
 };

 const handleSlideStart = () => {
   setIsSliding(true);
 };

 // Debug environment on mount
 useEffect(() => {
   console.log('🔍 App mounted, checking environment:', {
     userAgent: navigator.userAgent,
     location: window.location.href,
     isFrame: window !== window.top,
     hasParent: window.parent !== window
   });
 }, []);

 // Initialize Farcaster Mini App - COMPLETE FIXED VERSION
 useEffect(() => {
   const initializeFarcaster = async () => {
     try {
       console.log('🚀 Initializing Farcaster Mini App...');
       
       // Set app ready immediately to prevent blank page
       setIsAppReady(true);
       
       // Try to call ready() regardless of context detection
       // This is safer than trying to detect context
       try {
         await sdk.actions.ready({ disableNativeGestures: true });
         console.log('✅ Farcaster sdk.actions.ready() called successfully');
       } catch (sdkError) {
         console.log('ℹ️ SDK ready() failed (probably not in Farcaster):', sdkError);
         // This is expected when not in Farcaster - just continue
       }
       
       // Load initial data
       if (publicClient) {
         console.log('📊 Fetching initial raffle data...');
         await fetchRaffleInfo();
       }
       
       console.log('🎯 App initialization complete');
       
     } catch (error) {
       console.error('❌ Error during initialization:', error);
       // Always ensure app is marked as ready
       setIsAppReady(true);
     }
   };

   // Start initialization immediately
   initializeFarcaster();
 }, [publicClient, fetchRaffleInfo]);

 // Add back the countdown timer effect
 useEffect(() => {
   if (!raffleInfo || !raffleInfo.endTime) return;

   const timer = setInterval(() => {
     calculateTimeLeft(raffleInfo.endTime);
   }, 1000);

   // Calculate immediately
   calculateTimeLeft(raffleInfo.endTime);

   return () => clearInterval(timer);
 }, [raffleInfo, calculateTimeLeft]);

 // Add back the slide to buy ticket effect
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

 // Add back the data refresh interval
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

 // Show loading state until app is ready
 if (!isAppReady) {
   return (
     <div className="min-h-screen bg-gradient-to-br from-green-50 via-yellow-50 to-green-100 flex items-center justify-center">
       <div className="text-center">
         <div className="text-6xl mb-4 animate-spin">🎰</div>
         <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading...</h2>
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

       {/* Main Content */}
       <div className="space-y-4 pb-24">
         {/* Player Info - Always show when connected */}
         {account && (
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
         )}

         {/* Connect Wallet - Only show when not connected */}
         {!account && (
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
         )}

         {/* Rest of the content - Only show when connected */}
         {account && (
           <>
             {/* Current Raffle Status */}
             {raffleInfo && (
               <div className="bg-white/90 backdrop-blur-lg rounded-3xl p-6 border-2 border-blue-400 shadow-xl relative overflow-hidden">
                 {/* Background gradient decoration */}
                 <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 opacity-50"></div>
                 <div className="relative z-10">
                   <div className="text-center">
                     <div className="flex items-center justify-center gap-2 mb-4">
                       <div className="text-2xl animate-pulse">🏆</div>
                       <div className="text-xl font-bold text-gray-800">
                         Raffle #{raffleInfo.raffleId}
                       </div>
                       <div className="text-2xl animate-pulse">🏆</div>
                     </div>
                     
                     {/* Status Badge */}
                     <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-4 shadow-lg ${
                       isRaffleActive 
                         ? 'bg-gradient-to-r from-green-400 to-green-500 text-white animate-pulse' 
                         : 'bg-gradient-to-r from-red-400 to-red-500 text-white'
                     }`}>
                       {isRaffleActive ? '🟢 LIVE NOW!' : '🔴 ENDED'}
                     </div>

                     {/* Countdown Timer */}
                     {isRaffleActive && raffleInfo.endTime && (
                       <div className="mb-4 p-3 bg-gradient-to-r from-orange-100 to-yellow-100 rounded-2xl border border-orange-200">
                         <div className="text-sm text-orange-600 font-medium mb-1">⏰ Time Remaining</div>
                         <div className="text-2xl font-bold text-orange-800 font-mono tracking-wider">
                           {countdown}
                         </div>
                         {timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes < 30 && (
                           <div className="text-xs text-red-600 mt-1 animate-pulse">
                             🚨 Hurry! Raffle ending soon!
                           </div>
                         )}
                       </div>
                     )}
                     
                     {/* Stats Grid */}
                     <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className="bg-gradient-to-br from-blue-100 to-blue-200 p-4 rounded-2xl border border-blue-300">
                         <div className="text-xs text-blue-600 font-medium">Total Tickets</div>
                         <div className="text-2xl font-bold text-blue-800 flex items-center justify-center gap-1">
                           🎫 {raffleInfo.totalTickets.toLocaleString()}
                         </div>
                         <div className="text-xs text-blue-500 mt-1">
                           {raffleInfo.totalTickets > 100 ? 'High Competition!' : 'Good Odds!'}
                         </div>
                       </div>
                       <div className="bg-gradient-to-br from-green-100 to-green-200 p-4 rounded-2xl border border-green-300">
                         <div className="text-xs text-green-600 font-medium">Prize Pool</div>
                         <div className="text-2xl font-bold text-green-800 flex items-center justify-center gap-1">
                           💰 {formatToOneDecimal(formatEther(raffleInfo.prizePool))}
                         </div>
                         <div className="text-xs text-green-500 mt-1">CELO</div>
                       </div>
                     </div>

                     {/* Ticket Price */}
                     {raffleInfo.ticketPrice > 0n && (
                       <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-3 rounded-xl border border-purple-200 mb-3">
                         <div className="text-sm text-purple-600 font-medium">🎫 Ticket Price</div>
                         <div className="text-lg font-bold text-purple-800">
                           {formatToOneDecimal(formatEther(raffleInfo.ticketPrice))} CELO
                         </div>
                       </div>
                     )}

                     {/* End Time */}
                     {raffleInfo.endTime && (
                       <div className="text-xs text-gray-500 bg-gray-100 rounded-lg p-2">
                         🗓️ Ends: {formatTime(raffleInfo.endTime)}
                       </div>
                     )}
                   </div>
                 </div>
               </div>
             )}

             {/* Create Daily Raffle */}
             {!isRaffleActive && (
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
             )}

             {/* Slide to Buy Ticket */}
             {raffleInfo && isRaffleActive && (
               <div className="bg-gradient-to-r from-purple-400 to-indigo-400 rounded-2xl p-6 border-2 border-purple-300 shadow-xl relative overflow-hidden">
                 <div className="text-center mb-4">
                   <div className="text-white font-bold text-lg mb-2">🎫 Buy Ticket</div>
                 </div>
                 
                 {/* Slide to Buy Component */}
                 <div 
                   id="slide-container"
                   className="relative bg-white/20 rounded-full h-16 flex items-center px-2 backdrop-blur-sm border border-white/30"
                 >
                   {/* Background Track */}
                   <div 
                     className="absolute left-2 top-2 bottom-2 bg-white/30 rounded-full transition-all duration-300 ease-out"
                     style={{ width: `${slideProgress}%` }}
                   ></div>
                   
                   {/* Slider Button */}
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
                       <span className="text-white text-xl">✅</span>
                     ) : isLoading ? (
                       <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                     ) : (
                       <span className="text-2xl">🎫</span>
                     )}
                   </div>
                   
                   {/* Slide Text */}
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <span className="text-white font-bold text-lg drop-shadow-lg">
                       {isLoading ? 'Processing...' :
                        slideProgress > 90 ? 'Release to Buy!' : 
                        slideProgress > 10 ? 'Keep Sliding...' : 
                        'Slide to Buy →'}
                     </span>
                   </div>
                 </div>
                 
                 {/* Purchase Instructions */}
                 <div className="text-center mt-3">
                   <div className="text-white/80 text-xs">
                     💡 Slide right to purchase your ticket
                   </div>
                 </div>
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
           </>
         )}
       </div>
     </div>

     {/* Bottom Navigation - Celo Network Switch */}
     {account && (
       <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t-2 border-yellow-400 shadow-2xl">
         <div className="max-w-md mx-auto p-4">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
                 <span className="text-sm font-bold">🌐</span>
               </div>
               <div>
                 <div className="font-bold text-gray-800 text-sm">Celo Network</div>
                 <div className="text-xs text-gray-600">Connected & Ready</div>
               </div>
             </div>
             <button
               onClick={switchToCelo}
               className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg text-sm"
             >
               Switch 🔄
             </button>
           </div>
         </div>
       </div>
     )}
   </div>
 );
}