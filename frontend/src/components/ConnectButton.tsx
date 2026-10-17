"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { AddressName } from "./AddressName";

export function ConnectButton() {
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const detectedConnectors = connectors.filter((connector) => connector.id !== "injected");
  const walletOptions = detectedConnectors.length > 0 ? detectedConnectors : connectors;

  useEffect(() => {
    if (isConnected) setWalletPickerOpen(false);
  }, [isConnected]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setWalletPickerOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [walletPickerOpen]);

  if (isConnected) {
    return (
      <div className="wallet-actions">
        {chain?.id !== sepolia.id && (
          <button className="secondary-action" onClick={() => switchChain({ chainId: sepolia.id })} disabled={isSwitching}>
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        )}
        <button
          className={`connect-button${chain?.id === sepolia.id ? " connected" : ""}`}
          onClick={() => disconnect()}
          title="Disconnect wallet"
          aria-label="Disconnect wallet"
        >
          <AddressName address={address} />
        </button>
        {switchError && <span className="wallet-error" role="alert">{switchError.message}</span>}
      </div>
    );
  }

  return (
    <div className="connect-stack">
      <button
        className="connect-button"
        disabled={isPending || walletOptions.length === 0}
        onClick={() => setWalletPickerOpen(true)}
        aria-label="Connect wallet"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {walletPickerOpen && (
        <div className="wallet-picker-backdrop" onMouseDown={() => setWalletPickerOpen(false)}>
          <section
            className="wallet-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="wallet-picker-heading">
              <div>
                <p className="eyebrow">Choose a wallet</p>
                <h2 id="wallet-picker-title">Connect to Mintroom</h2>
              </div>
              <button
                className="wallet-picker-close"
                type="button"
                onClick={() => setWalletPickerOpen(false)}
                aria-label="Close wallet picker"
              >
                ×
              </button>
            </div>
            <div className="wallet-options">
              {walletOptions.map((connector) => (
                <button
                  className="wallet-option"
                  key={connector.uid}
                  type="button"
                  disabled={isPending}
                  onClick={() => connect({ connector })}
                >
                  <span className="wallet-option-mark" aria-hidden="true">
                    {connector.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{connector.name}</strong>
                    <small>Detected in this browser</small>
                  </span>
                  <span className="wallet-option-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            <p className="wallet-picker-note">Only wallets installed or enabled in this browser are shown.</p>
            {connectError && <p className="wallet-picker-error" role="alert">{connectError.message}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
