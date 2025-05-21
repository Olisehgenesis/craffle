// // RaffleContent.tsx
// "use client";

// import { useCallback, useEffect, useState, useMemo, useRef } from "react";
// import { useAccount, useConnect, useSwitchChain } from "wagmi";
// import { formatEther } from "viem";
// import { celo } from "viem/chains";
// import { Button } from "./ui/Button";
// import { motion, AnimatePresence } from "framer-motion";
// import {
//   Trophy,
//   Clock,
//   DollarSign,
//   Ticket,
//   RefreshCcw,
//   Calendar,
//   AlertTriangle,
//   Check,
//   Wallet,
//   TrendingUp,
//   Users,
//   X,
//   Zap
// } from "lucide-react";
// import { useRaffleContract } from "./hooks/useRaffle";

// // Helper function moved outside component
// const truncateAddress = (address: string) => {
//   if (!address) return '';
//   return `${address.slice(0, 6)}...${address.slice(-4)}`;
// };

// interface RaffleContentProps {
//   contractAddress: `0x${string}`;
//   title?: string;
// }

// export default function RaffleContent({ contractAddress, title }: RaffleContentProps) {
//   // Refs to prevent excessive renders and track state
//   const mountedRef = useRef<boolean>(true);
//   const isRefreshingRef = useRef<boolean>(false);
//   const lastUserTicketsCheck = useRef<string>(''); // Track last check key
  
//   // Wagmi hooks - ALWAYS call these in the same order
//   const { isConnected, address, chainId } = useAccount();
//   const { connect, connectors } = useConnect();

//   const { switchChain } = useSwitchChain();
  
//   // Use the raffle hook
//   const raffle = useRaffleContract({ contractAddress });
  
//   // State variables - minimize state usage
//   const [showPlaceBetModal, setShowPlaceBetModal] = useState(false);
//   const [showConfirmModal, setShowConfirmModal] = useState(false);
//   const [ticketAmount, setTicketAmount] = useState('1');
//   const [ethAmount, setEthAmount] = useState('');
//   const [showTickets, setShowTickets] = useState(true);
//   const [userTickets, setUserTickets] = useState(0);
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const [showStatsModal, setShowStatsModal] = useState(false);
//   const [raffleStats, setRaffleStats] = useState<any>(null);

//   // Handle component mount/unmount
//   useEffect(() => {
//     mountedRef.current = true;
//     return () => {
//       mountedRef.current = false;
//     };
//   }, []);

//   // Check if we need to switch to Celo chain - only run when connection status changes
//   useEffect(() => {
//     if (!isConnected || !chainId) return;
    
//     const switchToCelo = async () => {
//       if (chainId !== celo.id) {
//         try {
//           await switchChain({ chainId: celo.id as 42220 });
//         } catch (error) {
//           console.error('Error switching chain:', error);
//         }
//       }
//     };
    
//     switchToCelo();
//   }, [isConnected, chainId, switchChain]);

//   // Connect wallet function - memoized to prevent re-creation
//   const connectMetaMask = useCallback(async () => {
//     try {
//       const metaMaskConnector = connectors.find(connector => connector.name === 'MetaMask');
//       if (!metaMaskConnector) {
//         console.error('MetaMask connector not found');
//         return;
//       }

//       await connect({ connector: metaMaskConnector });
//     } catch (error) {
//       console.error('Error connecting to MetaMask:', error);
//     }
//   }, [connect, connectors]);

//   // Load user tickets with improved dependency tracking
//   useEffect(() => {
//     if (!address || !raffle.raffleInfo?.raffleId) {
//       console.log('[App] Skipping user tickets load - missing requirements:', { 
//         hasAddress: !!address, 
//         hasRaffleInfo: !!raffle.raffleInfo,
//         raffleId: raffle.raffleInfo?.raffleId
//       });
//       return;
//     }
    
//     // Create a unique key for this check
//     const checkKey = `${address}-${raffle.raffleInfo.raffleId}`;
    
//     // Skip if we already checked this exact combination
//     if (lastUserTicketsCheck.current === checkKey) {
//       console.log('[App] Skipping user tickets load - already checked this combination');
//       return;
//     }
    
//     const loadUserTickets = async () => {
//       console.log('[App] Loading user tickets for:', checkKey);
//       try {
//         if (!raffle.raffleInfo) return;
//         const tickets = await raffle.getUserTickets(raffle.raffleInfo.raffleId);
//         console.log('[App] User tickets loaded:', tickets);
//         if (mountedRef.current) {
//           setUserTickets(tickets);
//           lastUserTicketsCheck.current = checkKey;
//         }
//       } catch (error) {
//         console.error("[App] Error loading user tickets:", error);
//       }
//     };
    
//     loadUserTickets();
//   }, [address, raffle.raffleInfo?.raffleId, raffle.getUserTickets]);
  
//   // Handle buying tickets - stabilized
//   const handleBuyTickets = useCallback(() => {
//     setShowPlaceBetModal(false);
//     setShowConfirmModal(true);
//   }, []);

//   // Load raffle statistics
//   const loadRaffleStats = useCallback(async () => {
//     if (!raffle.currentDayNumber || raffle.currentDayNumber < 2) return;
    
//     try {
//       const startDay = Math.max(1, raffle.currentDayNumber - 6); // Last 7 days
//       const stats = await raffle.getRaffleStats(startDay, raffle.currentDayNumber);
//       setRaffleStats(stats);
//     } catch (error) {
//       console.error("Error loading raffle stats:", error);
//     }
//   }, [raffle.currentDayNumber, raffle.getRaffleStats]);

//   // Refresh data manually with improved state management
//   const handleRefresh = useCallback(async () => {
//     console.log('[App] Starting manual refresh');
//     if (isRefreshingRef.current) {
//       console.log('[App] Refresh already in progress, skipping');
//       return;
//     }
    
//     isRefreshingRef.current = true;
//     setIsRefreshing(true);
    
//     try {
//       // Reset user tickets check to force re-checking
//       lastUserTicketsCheck.current = '';
      
//       if (raffle.raffleInfo?.completed) {
//         console.log('[App] Current raffle completed, checking for new raffle');
//         // Optionally, you can call a valid method here or just fetchRaffleInfo
//         // await raffle.createNewRaffle?.(); // Uncomment if such a method exists
//         // Otherwise, just fetch the latest raffle info
//         await raffle.fetchRaffleInfo();
//       }
      
//       console.log('[App] Fetching raffle info');
//       await raffle.fetchRaffleInfo();
      
//       // Load user tickets after raffle info is refreshed
//       if (address && raffle.raffleInfo?.raffleId) {
//         console.log('[App] Refreshing user tickets');
//         const tickets = await raffle.getUserTickets(raffle.raffleInfo.raffleId);
//         console.log('[App] New user tickets count:', tickets);
//         if (mountedRef.current) {
//           setUserTickets(tickets);
//         }
//       }
      
//       console.log('[App] Loading raffle stats');
//       await loadRaffleStats();
//     } catch (error) {
//       console.error("[App] Error refreshing raffle info:", error);
//     } finally {
//       if (mountedRef.current) {
//         setIsRefreshing(false);
//       }
//       isRefreshingRef.current = false;
//       console.log('[App] Refresh completed');
//     }
//   }, [raffle, loadRaffleStats, address]);

//   // Confirm buying tickets with improved error handling
//   const confirmBuyTickets = useCallback(async () => {
//     try {
//       if (showTickets) {
//         // Buy by ticket count
//         const count = parseInt(ticketAmount);
//         if (!isNaN(count) && count > 0) {
//           if (!raffle.raffleInfo) {
//             throw new Error("Raffle info is not available");
//           }
//           const tx = await raffle.buyTickets(raffle.raffleInfo.raffleId, count);
//           if (tx !== null) {
//             setShowConfirmModal(false);
//             setTicketAmount('1');
//             setEthAmount('');
            
//             // Reset user tickets check to force re-checking after purchase
//             lastUserTicketsCheck.current = '';
            
//             // Wait for transaction to be mined
//             const receipt = await raffle.publicClient?.waitForTransactionReceipt({ hash: tx as unknown as `0x${string}` });
//             if (receipt?.status === 'success') {
//               // Reload the page after successful transaction
//               window.location.reload();
//             }
//           }
//         } else {
//           throw new Error("Invalid ticket count");
//         }
//       } else {
//         // Buy by ETH amount
//         if (ethAmount && parseFloat(ethAmount) > 0) {
//           if (!raffle.raffleInfo) {
//             throw new Error("Raffle info is not available");
//           }
//           const tx = await raffle.buyTicketsWithEth(raffle.raffleInfo.raffleId, ethAmount);
//           if (tx !== null) {
//             setShowConfirmModal(false);
//             setTicketAmount('1');
//             setEthAmount('');
            
//             // Reset user tickets check to force re-checking after purchase
//             lastUserTicketsCheck.current = '';
            
//             // Wait for transaction to be mined
//             const receipt = await raffle.publicClient?.waitForTransactionReceipt({ hash: tx as unknown as `0x${string}` });
//             if (receipt?.status === 'success') {
//               // Reload the page after successful transaction
//               window.location.reload();
//             }
//           }
//         } else {
//           throw new Error("Invalid CELO amount");
//         }
//       }
//     } catch (error) {
//       console.error('Error buying tickets:', error);
//     }
//   }, [raffle.buyTickets, raffle.buyTicketsWithEth, showTickets, ticketAmount, ethAmount, raffle.publicClient]);

//   // Handle claim winnings action - stabilized
//   const handleClaimWinnings = useCallback(() => {
//     // Just a UI acknowledgment since winnings are automatically sent
//     alert("Your winnings have been automatically sent to your wallet!");
//   }, []);

//   // Show raffle statistics
//   const handleShowStats = useCallback(async () => {
//     await loadRaffleStats();
//     setShowStatsModal(true);
//   }, [loadRaffleStats]);
  
//   // Memoize computed values to prevent unnecessary re-renders
//   const formattedTicketPrice = useMemo(() => 
//     raffle?.raffleInfo ? formatEther(raffle.raffleInfo.ticketPrice) : '0'
//   , [raffle?.raffleInfo?.ticketPrice]);
  
//   const headerTitle = useMemo(() => {
//     return title || "Daily Raffle";
//   }, [title]);

//   // Use the hook's built-in time formatting
//   const timeRemainingFormatted = useMemo(() => {
//     return raffle.formatTimeRemaining(raffle.timeRemaining);
//   }, [raffle.timeRemaining, raffle.formatTimeRemaining]);

//   // Check if user is winner - memoized
//   const isUserWinner = useMemo(() => {
//     if (!address || !raffle.winners) return false;
//     return raffle.winners.some(winner => winner.toLowerCase() === address.toLowerCase());
//   }, [address, raffle.winners]);

//   // Calculate tickets from ETH amount
//   const calculatedTickets = useMemo(() => {
//     return raffle.calculateTicketsFromEth(ethAmount);
//   }, [ethAmount, raffle.calculateTicketsFromEth]);
  
//   // If not connected, show connect wallet UI
//   if (!isConnected) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
//         <motion.div 
//           initial={{ opacity: 0, y: 30 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ duration: 0.6, ease: "easeOut" }}
//           className="w-full max-w-sm"
//         >
//           <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
//             <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-8 text-center relative">
//               <div className="absolute inset-0 bg-black/5"></div>
//               <motion.div 
//                 initial={{ scale: 0, rotate: -180 }}
//                 animate={{ scale: 1, rotate: 0 }}
//                 transition={{ duration: 0.8, type: "spring", bounce: 0.6 }}
//                 className="relative z-10 mb-4 flex justify-center"
//               >
//                 <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
//                   <Trophy className="h-12 w-12 text-gray-900" />
//                 </div>
//               </motion.div>
//               <h1 className="text-3xl font-bold text-gray-900 mb-2">Daily Raffle</h1>
//               <p className="text-gray-700 text-sm">Win Celo every single day!</p>
//             </div>
            
//             <div className="p-8">
//               <div className="text-center mb-6">
//                 <h2 className="text-xl font-semibold text-gray-800 mb-2">Ready to play?</h2>
//                 <p className="text-gray-600 text-sm leading-relaxed">
//                   Connect your wallet to join today's raffle and compete for the daily prize pool.
//                 </p>
//               </div>
              
//               <motion.div whileTap={{ scale: 0.98 }}>
//                 <Button 
//                   onClick={connectMetaMask}
//                   className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-semibold text-lg py-4 rounded-2xl shadow-lg border-0 transition-all duration-200"
//                 >
//                   <Wallet className="mr-3 h-5 w-5" />
//                   Connect Wallet
//                 </Button>
//               </motion.div>
              
//               <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-gray-100">
//                 <div className="text-center">
//                   <div className="text-2xl mb-1">⏰</div>
//                   <p className="text-xs text-gray-600">Daily draws</p>
//                 </div>
//                 <div className="text-center">
//                   <div className="text-2xl mb-1">🏆</div>
//                   <p className="text-xs text-gray-600">10 winners</p>
//                 </div>
//                 <div className="text-center">
//                   <div className="text-2xl mb-1">⚡</div>
//                   <p className="text-xs text-gray-600">Instant payout</p>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </motion.div>
//       </div>
//     );
//   }
  
//   // Main content UI
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
//       {/* Mobile-optimized header */}
//       <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur-lg border-b border-gray-700">
//         <div className="max-w-md mx-auto px-4 py-3">
//           <div className="flex items-center justify-between">
//             <div className="flex items-center space-x-3">
//               <div className="p-2 bg-[#FCFF52] rounded-xl">
//                 <Trophy className="h-5 w-5 text-gray-900" />
//               </div>
//               <div>
//                 <h1 className="text-lg font-bold text-white">{headerTitle}</h1>
//                 {raffle.currentDayNumber > 0 && (
//                   <p className="text-xs text-gray-400">Day {raffle.currentDayNumber}</p>
//                 )}
//               </div>
//             </div>
            
//             <div className="flex items-center space-x-2">
//               <motion.button
//                 whileTap={{ scale: 0.9 }}
//                 onClick={handleShowStats}
//                 className="p-2 bg-gray-700 rounded-xl text-gray-300 hover:text-white hover:bg-gray-600 transition-colors"
//               >
//                 <TrendingUp className="h-4 w-4" />
//               </motion.button>
              
//               <motion.button
//                 whileTap={{ scale: 0.9, rotate: 180 }}
//                 onClick={handleRefresh}
//                 className={`p-2 bg-gray-700 rounded-xl text-gray-300 hover:text-white hover:bg-gray-600 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
//                 disabled={isRefreshing}
//               >
//                 <RefreshCcw className="h-4 w-4" />
//               </motion.button>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div className="max-w-md mx-auto p-4 pb-20">
//         {raffle.loading ? (
//           <div className="flex h-64 items-center justify-center">
//             <motion.div 
//               animate={{ rotate: 360 }}
//               transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
//               className="h-12 w-12 rounded-full border-4 border-[#FCFF52] border-t-transparent"
//             />
//           </div>
//         ) : (
//           <AnimatePresence mode="wait">
//             <motion.div
//               key="raffle"
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -20 }}
//               transition={{ duration: 0.3 }}
//               className="space-y-4"
//             >
//               {/* Main raffle card */}
//               <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
//                 {/* Status header */}
//                 <div className={`p-6 text-center ${
//                   raffle.raffleInfo?.completed 
//                     ? 'bg-gradient-to-r from-orange-400 to-orange-500' 
//                     : 'bg-gradient-to-r from-[#FCFF52] to-[#FFE033]'
//                 } text-gray-900`}>
//                   <div className="flex items-center justify-center space-x-2 mb-2">
//                     <div className="flex items-center space-x-1">
//                       <Clock className="h-4 w-4" />
//                       <span className="text-sm font-medium">{timeRemainingFormatted}</span>
//                     </div>
//                     <span className="text-gray-600">•</span>
//                     <div className="flex items-center space-x-1">
//                       <Calendar className="h-4 w-4" />
//                       <span className="text-sm">
//                         {raffle.raffleInfo ? new Date(raffle.raffleInfo.endTime).toLocaleDateString() : '...'}
//                       </span>
//                     </div>
//                   </div>
//                   <div className="flex items-center justify-between">
//                     <h2 className="text-xl font-bold">Raffle #{raffle.raffleInfo?.raffleId || '...'}</h2>
//                     <motion.button
//                       whileTap={{ scale: 0.98 }}
//                       onClick={() => switchChain({ chainId: celo.id })}
//                       className="px-3 py-1.5 bg-white/20 backdrop-blur-sm text-gray-900 text-xs font-medium rounded-xl hover:bg-white/30 transition-all"
//                     >
//                       Switch to Celo
//                     </motion.button>
//                   </div>
//                 </div>

//                 <div className="p-6 space-y-6">
//                   {/* Prize pool spotlight */}
//                   <div className="text-center">
//                     <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#FCFF52] to-[#FFE033] rounded-2xl mb-4">
//                       <Trophy className="h-10 w-10 text-gray-900" />
//                     </div>
//                     <h3 className="text-sm font-medium text-gray-600 mb-1">Prize Pool</h3>
//                     <div className="text-4xl font-bold text-gray-900 mb-2">
//                       {raffle.raffleInfo ? formatEther(raffle.raffleInfo.prizePool) : '0'} CELO
//                     </div>
//                     <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
//                       <span>{raffle.raffleInfo?.totalTickets || 0} tickets</span>
//                       <span>•</span>
//                       <span>{formattedTicketPrice} CELO/ticket</span>
//                     </div>
//                   </div>

//                   {/* Your stats */}
//                   <div className="grid grid-cols-2 gap-4">
//                     <div className="bg-gray-50 rounded-2xl p-4 text-center">
//                       <Ticket className="h-6 w-6 text-[#FCFF52] mx-auto mb-2" />
//                       <div className="text-2xl font-bold text-gray-900">{userTickets || 0}</div>
//                       <div className="text-xs text-gray-600">Your Tickets</div>
//                     </div>
//                     <div className="bg-gray-50 rounded-2xl p-4 text-center">
//                       <Zap className="h-6 w-6 text-orange-500 mx-auto mb-2" />
//                       <div className="text-2xl font-bold text-gray-900">
//                         {userTickets > 0 && raffle.raffleInfo && raffle.raffleInfo.totalTickets > 0 
//                           ? ((userTickets / raffle.raffleInfo.totalTickets) * 100).toFixed(1)
//                           : '0'
//                         }%
//                       </div>
//                       <div className="text-xs text-gray-600">Win Chance</div>
//                     </div>
//                   </div>

//                   {/* Wallet info */}
//                   <div className="bg-gray-50 rounded-2xl p-4">
//                     <div className="flex items-center justify-between">
//                       <div className="flex items-center space-x-3">
//                         <div className="w-3 h-3 bg-green-500 rounded-full"></div>
//                         <span className="text-sm font-medium text-gray-900">Connected</span>
//                       </div>
//                       <div className="bg-white px-3 py-1 rounded-full text-xs font-mono text-gray-600 border">
//                         {truncateAddress(address || '')}
//                       </div>
//                     </div>
//                   </div>

//                   {/* Winners section for completed raffles */}
//                   {raffle.raffleInfo?.completed && (
//                     <div className="space-y-3">
//                       {isUserWinner ? (
//                         <motion.div 
//                           initial={{ scale: 0.9 }}
//                           animate={{ scale: 1 }}
//                           className="bg-gradient-to-r from-green-400 to-green-500 rounded-2xl p-6 text-center text-white"
//                         >
//                           <div className="text-4xl mb-2">🎉</div>
//                           <div className="text-xl font-bold mb-2">You Won!</div>
//                           <div className="text-sm opacity-90 mb-4">
//                             Prize: {raffle.raffleInfo && raffle.winners?.length 
//                               ? formatEther(raffle.raffleInfo.prizePool / BigInt(raffle.winners.length)) 
//                               : '0'} CELO
//                           </div>
//                           <Button
//                             onClick={handleClaimWinnings}
//                             className="bg-white text-green-500 hover:bg-gray-100 font-semibold px-6 py-2 rounded-xl"
//                           >
//                             <Trophy className="mr-2 h-4 w-4" />
//                             Claim Prize
//                           </Button>
//                         </motion.div>
//                       ) : (
//                         <div className="bg-gray-50 rounded-2xl p-4 text-center">
//                           <div className="text-sm text-gray-600 mb-2">
//                             {raffle.winners?.length ? "Better luck next time!" : "No winners declared yet."}
//                           </div>
//                           <div className="text-xs text-gray-500">
//                             {raffle.winners?.length || 0} winners • Check back for the next raffle
//                           </div>
//                         </div>
//                       )}

//                       {/* Winners list */}
//                       {raffle.winners && raffle.winners.length > 0 && (
//                         <div className="bg-gray-50 rounded-2xl p-4">
//                           <h4 className="text-sm font-medium text-gray-900 mb-3">Winners ({raffle.winners.length})</h4>
//                           <div className="space-y-2 max-h-32 overflow-y-auto">
//                             {raffle.winners.map((winner, index) => (
//                               <div 
//                                 key={index} 
//                                 className={`flex items-center justify-between p-2 rounded-lg ${
//                                   winner.toLowerCase() === address?.toLowerCase() 
//                                     ? 'bg-green-100 border border-green-300' 
//                                     : 'bg-white'
//                                 }`}
//                               >
//                                 <span className={`text-xs font-mono ${
//                                   winner.toLowerCase() === address?.toLowerCase() ? 'font-semibold text-green-800' : 'text-gray-600'
//                                 }`}>
//                                   {truncateAddress(winner)}
//                                 </span>
//                                 {winner.toLowerCase() === address?.toLowerCase() && (
//                                   <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full font-medium">
//                                     You
//                                   </span>
//                                 )}
//                               </div>
//                             ))}
//                           </div>
//                         </div>
//                       )}
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Action buttons */}
//               <div className="space-y-3">
//                 {!raffle.raffleInfo?.completed && raffle.raffleInfo?.isActive ? (
//                   <motion.div whileTap={{ scale: 0.98 }}>
//                     <Button
//                       onClick={() => setShowPlaceBetModal(true)}
//                       className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-bold text-lg py-4 rounded-2xl shadow-lg border-0"
//                       disabled={raffle.isWritePending || raffle.isWaitingForTx}
//                     >
//                       <Ticket className="mr-3 h-5 w-5" />
//                       Buy Tickets
//                     </Button>
//                   </motion.div>
//                 ) : (
//                   <motion.div whileTap={{ scale: 0.98 }}>
//                     <Button
//                       onClick={handleRefresh}
//                       className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-bold text-lg py-4 rounded-2xl shadow-lg border-0"
//                     >
//                       <Trophy className="mr-3 h-5 w-5" />
//                       {raffle.raffleInfo?.completed ? 'Join Next Raffle' : 'Check for New Raffle'}
//                     </Button>
//                   </motion.div>
//                 )}
//               </div>

//               {/* Transaction status */}
//               {(raffle.isWritePending || raffle.isWaitingForTx) && (
//                 <motion.div 
//                   initial={{ opacity: 0, scale: 0.9 }}
//                   animate={{ opacity: 1, scale: 1 }}
//                   className="bg-blue-500/10 border border-blue-300 rounded-2xl p-4 text-center"
//                 >
//                   <div className="flex items-center justify-center text-blue-400">
//                     <motion.div 
//                       animate={{ rotate: 360 }}
//                       transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
//                       className="mr-3 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
//                     />
//                     <span className="text-sm font-medium">Transaction in progress...</span>
//                   </div>
//                 </motion.div>
//               )}
              
//               {raffle.isWriteSuccess && raffle.isTxSuccess && (
//                 <motion.div 
//                   initial={{ opacity: 0, scale: 0.9 }}
//                   animate={{ opacity: 1, scale: 1 }}
//                   className="bg-green-500/10 border border-green-300 rounded-2xl p-4 text-center"
//                 >
//                   <div className="flex items-center justify-center text-green-400">
//                     <Check className="mr-3 h-4 w-4" />
//                     <span className="text-sm font-medium">Transaction successful!</span>
//                   </div>
//                 </motion.div>
//               )}
              
//               {raffle.writeError && (
//                 <motion.div 
//                   initial={{ opacity: 0, scale: 0.9 }}
//                   animate={{ opacity: 1, scale: 1 }}
//                   className="bg-red-500/10 border border-red-300 rounded-2xl p-4 text-center"
//                 >
//                   <div className="flex items-center justify-center text-red-400">
//                     <AlertTriangle className="mr-3 h-4 w-4" />
//                     <span className="text-sm font-medium">{raffle.writeError.message || 'Transaction failed'}</span>
//                   </div>
//                 </motion.div>
//               )}
//             </motion.div>
//           </AnimatePresence>
//         )}
//       </div>

//       {/* Fixed bottom info */}
//       <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-lg border-t border-gray-700 p-4">
//         <div className="max-w-md mx-auto text-center">
//           <p className="text-xs text-gray-400">
//             New raffle every day at 00:00 UTC • 10 winners share the prize pool
//           </p>
//         </div>
//       </div>

//       {/* Buy Tickets Modal */}
//       {showPlaceBetModal && raffle.raffleInfo && (
//         <motion.div 
//           initial={{ opacity: 0 }}
//           animate={{ opacity: 1 }}
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
//         >
//           <motion.div 
//             initial={{ scale: 0.9, opacity: 0 }}
//             animate={{ scale: 1, opacity: 1 }}
//             transition={{ type: "spring", damping: 20 }}
//             className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
//           >
//             <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-6 text-gray-900">
//               <div className="flex items-center justify-between">
//                 <h2 className="text-xl font-bold">Buy Tickets</h2>
//                 <button
//                   onClick={() => setShowPlaceBetModal(false)}
//                   className="p-2 hover:bg-black/10 rounded-xl transition-colors"
//                 >
//                   <X className="h-5 w-5" />
//                 </button>
//               </div>
//               <p className="text-sm opacity-80 mt-1">Raffle #{raffle.raffleInfo.raffleId}</p>
//             </div>
            
//             <div className="p-6">
//               <div className="bg-gray-50 rounded-2xl p-4 mb-6">
//                 <div className="grid grid-cols-2 gap-4 text-sm">
//                   <div>
//                     <span className="text-gray-600">Ticket Price:</span>
//                     <div className="font-bold text-gray-900">{formattedTicketPrice} CELO</div>
//                   </div>
//                   <div>
//                     <span className="text-gray-600">Time Left:</span>
//                     <div className="font-bold text-gray-900 flex items-center space-x-1">
//                       <Clock className="h-4 w-4 text-[#FCFF52]" />
//                       <motion.span
//                         key={timeRemainingFormatted}
//                         initial={{ scale: 1.2, opacity: 0 }}
//                         animate={{ scale: 1, opacity: 1 }}
//                         transition={{ duration: 0.3 }}
//                         className="text-[#FCFF52]"
//                       >
//                         {timeRemainingFormatted}
//                       </motion.span>
//                     </div>
//                   </div>
//                 </div>
//               </div>

//               <div className="mb-6">
//                 <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
//                   <button
//                     onClick={() => setShowTickets(true)}
//                     className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
//                       showTickets 
//                         ? 'bg-white text-gray-900 shadow-sm' 
//                         : 'text-gray-600 hover:text-gray-900'
//                     }`}
//                   >
//                     <Ticket className="inline mr-2 h-4 w-4" />
//                     Tickets
//                   </button>
//                   <button
//                     onClick={() => setShowTickets(false)}
//                     className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
//                       !showTickets 
//                         ? 'bg-white text-gray-900 shadow-sm' 
//                         : 'text-gray-600 hover:text-gray-900'
//                     }`}
//                   >
//                     <DollarSign className="inline mr-2 h-4 w-4" />
//                     ETH Amount
//                   </button>
//                 </div>
                
//                 {showTickets ? (
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-2">
//                       Number of Tickets
//                     </label>
//                     <div className="relative">
//                       <input
//                         type="number"
//                         value={ticketAmount}
//                         onChange={(e) => setTicketAmount(e.target.value)}
//                         className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 pl-12 text-lg font-semibold focus:ring-2 focus:ring-[#FCFF52] focus:border-transparent outline-none"
//                         step="1"
//                         min="1"
//                         placeholder="1"
//                       />
//                       <div className="absolute left-4 top-1/2 -translate-y-1/2">
//                         <Ticket className="h-5 w-5 text-gray-400" />
//                       </div>
//                     </div>
//                     <div className="mt-3 text-right">
//                       <span className="text-sm text-gray-600">Total: </span>
//                       <span className="text-lg font-bold text-gray-900">
//                         {(parseFloat(ticketAmount || '0') * parseFloat(formattedTicketPrice)).toFixed(4)} CELO
//                       </span>
//                     </div>
//                   </div>
//                 ) : (
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-2">
//                       ETH Amount
//                     </label>
//                     <div className="relative">
//                       <input
//                         type="text"
//                         value={ethAmount}
//                         onChange={(e) => setEthAmount(e.target.value)}
//                         className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 pl-12 text-lg font-semibold focus:ring-2 focus:ring-[#FCFF52] focus:border-transparent outline-none"
//                         placeholder="0.01"
//                       />
//                       <div className="absolute left-4 top-1/2 -translate-y-1/2">
//                         <DollarSign className="h-5 w-5 text-gray-400" />
//                       </div>
//                     </div>
//                     <div className="mt-3 text-right">
//                       <span className="text-sm text-gray-600">Tickets: </span>
//                       <span className="text-lg font-bold text-gray-900">{calculatedTickets}</span>
//                     </div>
//                   </div>
//                 )}
//               </div>
              
//               <div className="flex space-x-3">
//                 <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
//                   <Button
//                     onClick={() => setShowPlaceBetModal(false)}
//                     className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 rounded-2xl border-0"
//                   >
//                     Cancel
//                   </Button>
//                 </motion.div>
//                 <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
//                   <Button
//                     onClick={handleBuyTickets}
//                     className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-bold py-4 rounded-2xl border-0"
//                   >
//                     Continue
//                   </Button>
//                 </motion.div>
//               </div>
//             </div>
//           </motion.div>
//         </motion.div>
//       )}
    
//       {/* Confirm Modal */}
//       {showConfirmModal && raffle.raffleInfo && (
//         <motion.div 
//           initial={{ opacity: 0 }}
//           animate={{ opacity: 1 }}
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
//         >
//           <motion.div 
//             initial={{ scale: 0.9, opacity: 0 }}
//             animate={{ scale: 1, opacity: 1 }}
//             transition={{ type: "spring", damping: 20 }}
//             className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
//           >
//             <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-6 text-gray-900">
//               <h2 className="text-xl font-bold">Confirm Purchase</h2>
//               <p className="text-sm opacity-80 mt-1">Review your ticket purchase</p>
//             </div>
            
//             <div className="p-6">
//               <div className="bg-gray-50 rounded-2xl p-6 mb-6">
//                 <h3 className="text-lg font-bold text-gray-900 mb-4">Daily Raffle #{raffle.raffleInfo.raffleId}</h3>
                
//                 <div className="space-y-3">
//                   <div className="flex justify-between items-center">
//                     <span className="text-gray-600">Tickets:</span>
//                     <span className="font-bold text-xl text-gray-900">
//                       {showTickets ? ticketAmount : calculatedTickets}
//                     </span>
//                   </div>
                  
//                   <div className="flex justify-between items-center">
//                     <span className="text-gray-600">Total Cost:</span>
//                     <span className="font-bold text-xl text-gray-900">
//                       {showTickets 
//                         ? (parseFloat(ticketAmount || '0') * parseFloat(formattedTicketPrice)).toFixed(4)
//                         : ethAmount
//                       } CELO
//                     </span>
//                   </div>
//                 </div>
//               </div>
              
//               <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
//                 <p className="text-blue-800 text-sm text-center leading-relaxed">
//                   Each ticket gives you a chance to win a share of the prize pool. 
//                   Results are determined at 00:00 UTC daily.
//                 </p>
//               </div>
              
//               <div className="flex space-x-3">
//                 <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
//                   <Button
//                     onClick={() => setShowConfirmModal(false)}
//                     className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 rounded-2xl border-0"
//                   >
//                     Cancel
//                   </Button>
//                 </motion.div>
//                 <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
//                   <Button
//                     onClick={confirmBuyTickets}
//                     className="w-full bg-gradient-to-r from-[#FCFF52] to-[#FFE033] hover:from-[#FFE033] hover:to-[#FCFF52] text-gray-900 font-bold py-4 rounded-2xl border-0"
//                     disabled={raffle.loading || raffle.isWritePending || raffle.isWaitingForTx}
//                   >
//                     {raffle.loading || raffle.isWritePending || raffle.isWaitingForTx ? (
//                       <div className="flex items-center justify-center">
//                         <motion.div 
//                           animate={{ rotate: 360 }}
//                           transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
//                           className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
//                         />
//                         Processing...
//                       </div>
//                     ) : (
//                       <div className="flex items-center justify-center">
//                         <Check className="mr-2 h-4 w-4" />
//                         Confirm Purchase
//                       </div>
//                     )}
//                   </Button>
//                 </motion.div>
//               </div>
//             </div>
//           </motion.div>
//         </motion.div>
//       )}

//       {/* Stats Modal */}
//       {showStatsModal && raffleStats && (
//         <motion.div 
//           initial={{ opacity: 0 }}
//           animate={{ opacity: 1 }}
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
//         >
//           <motion.div 
//             initial={{ scale: 0.9, opacity: 0 }}
//             animate={{ scale: 1, opacity: 1 }}
//             transition={{ type: "spring", damping: 20 }}
//             className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[80vh]"
//           >
//             <div className="bg-gradient-to-r from-[#FCFF52] to-[#FFE033] p-6 text-gray-900">
//               <div className="flex items-center justify-between">
//                 <div className="flex items-center space-x-3">
//                   <TrendingUp className="h-6 w-6" />
//                   <div>
//                     <h2 className="text-xl font-bold">Statistics</h2>
//                     <p className="text-sm opacity-80">Last 7 days performance</p>
//                   </div>
//                 </div>
//                 <button
//                   onClick={() => setShowStatsModal(false)}
//                   className="p-2 hover:bg-black/10 rounded-xl transition-colors"
//                 >
//                   <X className="h-5 w-5" />
//                 </button>
//               </div>
//             </div>
            
//             <div className="p-6 overflow-y-auto max-h-96">
//               <div className="space-y-4">
//                 {raffleStats.raffleIds.map((raffleId: number, index: number) => {
//                   if (raffleId === 0) return null; // Skip non-existent raffles
                  
//                   return (
//                     <div key={raffleId} className="bg-gray-50 rounded-2xl p-4">
//                       <div className="flex justify-between items-center mb-3">
//                         <span className="font-bold text-gray-900">
//                           Raffle #{raffleId}
//                         </span>
//                         <span className={`text-xs px-3 py-1 rounded-full font-medium ${
//                           raffleStats.completedArray[index] 
//                             ? 'bg-green-100 text-green-800' 
//                             : 'bg-yellow-100 text-yellow-800'
//                         }`}>
//                           {raffleStats.completedArray[index] ? 'Completed' : 'Active'}
//                         </span>
//                       </div>
                      
//                       <div className="grid grid-cols-2 gap-4">
//                         <div className="text-center">
//                           <div className="flex items-center justify-center mb-1">
//                             <Users className="mr-1 h-4 w-4 text-gray-500" />
//                           </div>
//                           <div className="text-lg font-bold text-gray-900">
//                             {raffleStats.totalTicketsArray[index]}
//                           </div>
//                           <div className="text-xs text-gray-600">Tickets</div>
//                         </div>
//                         <div className="text-center">
//                           <div className="flex items-center justify-center mb-1">
//                             <Trophy className="mr-1 h-4 w-4 text-gray-500" />
//                           </div>
//                           <div className="text-lg font-bold text-gray-900">
//                             {formatEther(raffleStats.prizePoolsArray[index])}
//                           </div>
//                           <div className="text-xs text-gray-600">CELO Prize</div>
//                         </div>
//                       </div>
//                     </div>
//                   );
//                 })}
                
//                 {raffleStats.raffleIds.every((id: number) => id === 0) && (
//                   <div className="text-center py-8">
//                     <div className="text-gray-400 mb-2">📊</div>
//                     <div className="text-gray-600">No raffle data available</div>
//                     <div className="text-xs text-gray-500 mt-1">
//                       Check back after more raffles complete
//                     </div>
//                   </div>
//                 )}
//               </div>
//             </div>
//           </motion.div>
//         </motion.div>
//       )}
//     </div>
//   );
// }