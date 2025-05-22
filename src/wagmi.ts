import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { http, createConfig, injected } from "wagmi";
import { celo } from "wagmi/chains";
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

export const config = createConfig({
  chains: [celo],
  connectors: [farcasterFrame(), injected()],
  transports: {
    [celo.id]: http(),
  },
});

const queryClient = new QueryClient();

export function WagmiConfig({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
