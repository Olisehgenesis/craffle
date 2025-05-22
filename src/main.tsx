import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { WagmiConfig } from "./wagmi";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WagmiConfig>
      <App />
    </WagmiConfig>
  </React.StrictMode>,
);
