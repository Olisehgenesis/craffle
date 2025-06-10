import { useState, useEffect, useRef } from 'react';
import { 
  DollarSign, 
  Circle, 
  Globe, 
  CheckCircle, 
  Ship,
  X,
  RotateCw
} from 'lucide-react';

// Token symbols for the slots
const TOKENS = [
  { icon: DollarSign, name: 'cUSD', value: 100, color: 'text-green-500' },
  { icon: Circle, name: 'CELO', value: 200, color: 'text-yellow-500' },
  { icon: Globe, name: 'G$ Dollar', value: 300, color: 'text-blue-500' },
  { icon: CheckCircle, name: 'Good Dollar', value: 150, color: 'text-emerald-500' },
  { icon: Ship, name: 'Shipper', value: 250, color: 'text-purple-500' }
];

interface CraffleSlotsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CraffleSlotsModal = ({ isOpen, onClose }: CraffleSlotsModalProps) => {
  const [reels, setReels] = useState([0, 0, 0]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinningReels, setSpinningReels] = useState([false, false, false]);
  const [spinsToday, setSpinsToday] = useState(() => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('craffle-last-date');
    const savedSpins = localStorage.getItem('craffle-spins-today');
    
    if (savedDate === today && savedSpins) {
      return parseInt(savedSpins);
    }
    return 0;
  });
  const [lastWin, setLastWin] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [totalWinnings, setTotalWinnings] = useState(() => {
    const saved = localStorage.getItem('craffle-total-winnings');
    return saved ? parseInt(saved) : 0;
  });

  // Refs for reel animations
  const reel1Ref = useRef<HTMLDivElement>(null);
  const reel2Ref = useRef<HTMLDivElement>(null);
  const reel3Ref = useRef<HTMLDivElement>(null);
  const reelRefs = [reel1Ref, reel2Ref, reel3Ref];

  const MAX_DAILY_SPINS = 3;

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('craffle-spins-today', spinsToday.toString());
    localStorage.setItem('craffle-last-date', new Date().toDateString());
    localStorage.setItem('craffle-total-winnings', totalWinnings.toString());
  }, [spinsToday, totalWinnings]);

  // Get random token index
  const getRandomToken = () => {
    return Math.floor(Math.random() * TOKENS.length);
  };

  // Check if all three slots match
  const checkWin = (reelResults: number[]) => {
    if (reelResults[0] === reelResults[1] && reelResults[1] === reelResults[2]) {
      return TOKENS[reelResults[0]].value;
    }
    return 0;
  };

  // Create reel strip with multiple symbols
  const createReelStrip = () => {
    const strip = [];
    for (let i = 0; i < 20; i++) {
      strip.push(getRandomToken());
    }
    return strip;
  };

  // Animate individual reel
  const animateReel = (reelIndex: number, finalSymbol: number, duration: number) => {
    return new Promise<void>((resolve) => {
      const reelRef = reelRefs[reelIndex];
      if (!reelRef.current) {
        resolve();
        return;
      }

      // Set spinning state
      setSpinningReels(prev => {
        const newState = [...prev];
        newState[reelIndex] = true;
        return newState;
      });

      const reel = reelRef.current;
      const symbolHeight = 80; // Height of each symbol
      const totalSpins = 5; // Number of complete rotations
      const finalOffset = finalSymbol * symbolHeight;
      const totalDistance = (totalSpins * TOKENS.length * symbolHeight) + finalOffset;

      // Reset position
      reel.style.transition = 'none';
      reel.style.transform = 'translateY(0px)';

      // Start spinning
      setTimeout(() => {
        reel.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        reel.style.transform = `translateY(-${totalDistance}px)`;
      }, 10);

      // Complete animation
      setTimeout(() => {
        setSpinningReels(prev => {
          const newState = [...prev];
          newState[reelIndex] = false;
          return newState;
        });
        
        setReels(prev => {
          const newReels = [...prev];
          newReels[reelIndex] = finalSymbol;
          return newReels;
        });
        
        resolve();
      }, duration);
    });
  };

  // Spin the slots with realistic timing
  const spinSlots = async () => {
    if (isSpinning || spinsToday >= MAX_DAILY_SPINS) return;

    setIsSpinning(true);
    setLastWin(0);
    setShowCelebration(false);

    // Determine final result with 1 in 3 chance to win
    const shouldWin = Math.random() < 0.33;
    let finalReels;

    if (shouldWin) {
      // Force a win - all same token
      const winningToken = getRandomToken();
      finalReels = [winningToken, winningToken, winningToken];
    } else {
      // Force a loss - make sure they don't all match
      do {
        finalReels = [getRandomToken(), getRandomToken(), getRandomToken()];
      } while (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]);
    }

    // Animate reels with staggered timing (like real slot machines)
    const promises = [
      animateReel(0, finalReels[0], 1500), // First reel stops after 1.5s
      animateReel(1, finalReels[1], 2200), // Second reel stops after 2.2s
      animateReel(2, finalReels[2], 2900), // Third reel stops after 2.9s
    ];

    await Promise.all(promises);

    // Check for win
    const winAmount = checkWin(finalReels);
    if (winAmount > 0) {
      setLastWin(winAmount);
      setTotalWinnings(prev => prev + winAmount);
      setShowCelebration(true);
      
      // Hide celebration after 3 seconds
      setTimeout(() => setShowCelebration(false), 3000);
    }

    // Update spins count
    setSpinsToday(prev => prev + 1);
    setIsSpinning(false);
  };

  // Render reel strip
  const renderReelStrip = (reelIndex: number) => {
    const strip = [];
    // Create a long strip for smooth animation
    for (let i = 0; i < 30; i++) {
      const tokenIndex = i % TOKENS.length;
      const Token = TOKENS[tokenIndex];
      strip.push(
        <div
          key={i}
          className="h-20 flex items-center justify-center bg-white border-b border-gray-200"
        >
          <Token.icon size={40} className={Token.color} />
        </div>
      );
    }
    return strip;
  };

  if (!isOpen) return null;

  const canSpin = spinsToday < MAX_DAILY_SPINS && !isSpinning;
  const spinsLeft = MAX_DAILY_SPINS - spinsToday;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 rounded-3xl p-8 max-w-md w-full border-4 border-yellow-400 shadow-2xl relative overflow-hidden">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-yellow-400 text-2xl transition-colors"
        >
          <X size={24} />
        </button>

        {/* Celebration Animation */}
        {showCelebration && (
          <div className="absolute inset-0 pointer-events-none z-20">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce text-2xl"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${1 + Math.random() * 2}s`
                }}
              >
                {['🎉', '🎊', '✨', '🌟', '💫'][Math.floor(Math.random() * 5)]}
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-yellow-400 mb-2">🎰 CRAFFLE SLOTS</h2>
          <p className="text-purple-200">Match all 3 tokens to win!</p>
        </div>

        {/* Slot Machine */}
        <div className="bg-black/30 rounded-2xl p-6 mb-6 border-2 border-yellow-400">
          <div className="flex justify-center gap-2 mb-4">
            {reels.map((tokenIndex, reelIndex) => {
              const Token = TOKENS[tokenIndex];
              return (
                <div
                  key={reelIndex}
                  className="relative bg-gray-800 rounded-xl w-24 h-20 border-4 border-yellow-400 shadow-lg overflow-hidden"
                >
                  {/* Reel window */}
                  <div className="absolute inset-0 bg-white">
                    {spinningReels[reelIndex] ? (
                      // Animated reel strip
                      <div
                        ref={reelRefs[reelIndex]}
                        className="relative"
                      >
                        {renderReelStrip(reelIndex)}
                      </div>
                    ) : (
                      // Static result
                      <div className="h-full flex items-center justify-center">
                        <Token.icon size={40} className={Token.color} />
                      </div>
                    )}
                  </div>

                  {/* Reel overlay for 3D effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none"></div>
                </div>
              );
            })}
          </div>

          {/* Token Names */}
          <div className="flex justify-center gap-2 text-sm text-purple-200">
            {reels.map((tokenIndex, reelIndex) => (
              <div key={reelIndex} className="w-24 text-center font-medium">
                {TOKENS[tokenIndex].name}
              </div>
            ))}
          </div>
        </div>

        {/* Win Display */}
        {lastWin > 0 && (
          <div className="text-center mb-4 p-4 bg-gradient-to-r from-green-500 to-green-600 rounded-xl border-2 border-yellow-400 animate-pulse">
            <div className="text-2xl font-bold text-white">
              🎉 JACKPOT! 🎉
            </div>
            <div className="text-xl text-yellow-200">
              +{lastWin} points!
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-black/20 rounded-xl p-3 text-center border border-purple-400">
            <div className="text-purple-200 text-sm">Spins Left Today</div>
            <div className="text-2xl font-bold text-yellow-400">{spinsLeft}</div>
          </div>
          <div className="bg-black/20 rounded-xl p-3 text-center border border-purple-400">
            <div className="text-purple-200 text-sm">Total Winnings</div>
            <div className="text-2xl font-bold text-green-400">{totalWinnings}</div>
          </div>
        </div>

        {/* Spin Button */}
        <button
          onClick={spinSlots}
          disabled={!canSpin}
          className={`w-full py-4 rounded-xl font-bold text-xl transition-all transform ${
            canSpin
              ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-purple-900 hover:scale-105 shadow-lg'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSpinning ? (
            <div className="flex items-center justify-center gap-2">
              <RotateCw className="animate-spin" size={20} />
              SPINNING...
            </div>
          ) : spinsToday >= MAX_DAILY_SPINS ? (
            'NO SPINS LEFT TODAY'
          ) : (
            `🎰 PULL LEVER (${spinsLeft} left)`
          )}
        </button>

        {/* Rules */}
        <div className="mt-4 text-center text-xs text-purple-300">
          <p>• 3 free spins per day</p>
          <p>• Match all 3 tokens to win</p>
          <p>• ~33% chance to win each spin</p>
        </div>

        {/* Token Values */}
        <div className="mt-4 bg-black/20 rounded-xl p-3 border border-purple-400">
          <div className="text-center text-sm text-purple-200 mb-2">Token Values</div>
          <div className="grid grid-cols-5 gap-1 text-xs">
            {TOKENS.map((token, index) => {
              const TokenIcon = token.icon;
              return (
                <div key={index} className="text-center">
                  <div className="flex justify-center mb-1">
                    <TokenIcon size={16} className={token.color} />
                  </div>
                  <div className="text-purple-300">{token.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};


export default CraffleSlotsModal;