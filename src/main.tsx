import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";

import App from "./App.tsx";
import { config } from "./wagmi.ts";
import { celo } from "wagmi/chains";
import { useSwitchChain } from "wagmi";

import "./index.css";

const queryClient = new QueryClient();

// switch to celo
const { switchChain } = useSwitchChain();
switchChain({ chainId: celo.id });
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App contractAddress="0x2cfE616062261927fCcC727333d6dD3D5880FDd1" />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
