import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Circle, 
  Globe, 
  CheckCircle, 
  Ship,
  XCircle,
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

// Win Celebration Modal Component
const WinCelebrationModal = ({ isOpen, winAmount, onClose }: { isOpen: boolean; winAmount: number; onClose: () => void }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-8 max-w-md w-full border-4 border-yellow-400 shadow-2xl relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-yellow-400 text-2xl transition-colors"
        >
          <XCircle size={24} />
        </button>

        {/* Celebration Animation */}
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

        {/* Content */}
        <div className="text-center relative z-10">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold text-white mb-2">JACKPOT!</h2>
          <p className="text-2xl text-yellow-200 mb-6">You won {winAmount} points!</p>
          <button
            onClick={onClose}
            className="bg-white text-green-600 font-bold py-3 px-8 rounded-xl hover:bg-yellow-100 transition-colors"
          >
            Continue Playing
          </button>
        </div>
      </div>
    </div>
  );
};

// Main Slots Modal Component
const CraffleSlotsModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
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
  const [showWinModal, setShowWinModal] = useState(false);
  const [totalWinnings, setTotalWinnings] = useState(() => {
    const saved = localStorage.getItem('craffle-total-winnings');
    return saved ? parseInt(saved) : 0;
  });

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

  // Spin the slots with realistic timing
  const spinSlots = async () => {
    if (isSpinning || spinsToday >= MAX_DAILY_SPINS) return;

    setIsSpinning(true);
    setLastWin(0);
    setShowWinModal(false);

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

    // Simulate spinning animation
    setSpinningReels([true, true, true]);
    
    // Stop reels one by one
    setTimeout(() => {
      setReels(prev => [finalReels[0], prev[1], prev[2]]);
      setSpinningReels([false, true, true]);
    }, 1500);
    
    setTimeout(() => {
      setReels(prev => [prev[0], finalReels[1], prev[2]]);
      setSpinningReels([false, false, true]);
    }, 2200);
    
    setTimeout(() => {
      setReels(finalReels);
      setSpinningReels([false, false, false]);
      
      // Check for win
      const winAmount = checkWin(finalReels);
      if (winAmount > 0) {
        setLastWin(winAmount);
        setTotalWinnings(prev => prev + winAmount);
        setShowWinModal(true);
      }

      // Update spins count
      setSpinsToday(prev => prev + 1);
      setIsSpinning(false);
    }, 2900);
  };

  if (!isOpen) return null;

  const canSpin = spinsToday < MAX_DAILY_SPINS && !isSpinning;
  const spinsLeft = MAX_DAILY_SPINS - spinsToday;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 rounded-3xl p-8 max-w-md w-full border-4 border-yellow-400 shadow-2xl relative overflow-hidden">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-yellow-400 text-2xl transition-colors"
          >
            <XCircle size={24} />
          </button>

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
                    <div className="absolute inset-0 bg-white flex items-center justify-center">
                      {spinningReels[reelIndex] ? (
                        <div className="animate-spin">
                          <Token.icon size={40} className={Token.color} />
                        </div>
                      ) : (
                        <Token.icon size={40} className={Token.color} />
                      )}
                    </div>
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

      {/* Win Celebration Modal */}
      <WinCelebrationModal 
        isOpen={showWinModal} 
        winAmount={lastWin} 
        onClose={() => setShowWinModal(false)} 
      />
    </>
  );
};

export default CraffleSlotsModal; 