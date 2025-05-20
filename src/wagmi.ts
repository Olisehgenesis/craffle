import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { http, createConfig } from "wagmi";
import { celo } from "wagmi/chains";

export const config = createConfig({
  chains: [celo],
  connectors: [farcasterFrame()],
  transports: {
    [celo.id]: http(),
   
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
