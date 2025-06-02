import { createConfig } from 'wagmi';
import { celo } from 'viem/chains';
import { http } from 'viem';

export const config = createConfig({
  chains: [celo],
  transports: {
    [celo.id]: http()
  }
}); 