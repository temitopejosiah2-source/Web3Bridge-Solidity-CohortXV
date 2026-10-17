"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import type { Address, Hash } from "viem";
import { NFT_ADDRESS, nftAbi, nftConfigured } from "@/contracts/nft";
import { AddressName } from "./AddressName";

type MintAlert = {
  key: string;
  to: Address;
  tokenId: bigint;
  uri: string;
  transactionHash?: Hash;
  blockNumber?: bigint;
  receivedAt: number;
};

const MAX_ALERTS = 50;

export function LiveAlerts() {
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const [alerts, setAlerts] = useState<MintAlert[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [watchError, setWatchError] = useState("");
  const seen = useRef(new Set<string>());
  const lastScannedBlock = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    setNotificationPermission(
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
    );
  }, []);

  const addLogs = useCallback((logs: readonly {
    args: { to?: Address; tokenId?: bigint; uri?: string };
    transactionHash?: Hash;
    blockNumber?: bigint;
    logIndex?: number | null;
  }[], notify = true) => {
    const received: MintAlert[] = [];
    for (const log of logs) {
      const { to, tokenId, uri } = log.args;
      if (!to || tokenId === undefined || !uri) continue;
      const key = `${log.transactionHash ?? log.blockNumber ?? "pending"}:${log.logIndex ?? tokenId}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      received.push({
        key,
        to,
        tokenId,
        uri,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        receivedAt: Date.now(),
      });
    }
    if (!received.length) return;

    setAlerts((current) => [...received.reverse(), ...current].slice(0, MAX_ALERTS));
    if (notify && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      for (const alert of received) {
        const notification = new Notification(`Mintroom: NFT #${alert.tokenId.toString()} minted`, {
          body: `Minted to ${alert.to}`,
          tag: alert.key,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }
  }, []);

  useEffect(() => {
    if (!publicClient || !nftConfigured) return;
    let cancelled = false;
    let polling = false;

    async function scanEvents() {
      if (polling || cancelled) return;
      polling = true;
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const lastBlock = lastScannedBlock.current;
        if (lastBlock !== undefined && latestBlock <= lastBlock) return;

        const initialScan = lastBlock === undefined;
        let cursor = initialScan
          ? latestBlock > 5_000n ? latestBlock - 5_000n : 0n
          : lastBlock + 1n;
        let scannedRanges = 0;
        while (cursor <= latestBlock && scannedRanges < 10) {
          const toBlock = cursor + 999n < latestBlock ? cursor + 999n : latestBlock;
          const logs = await publicClient.getContractEvents({
            address: NFT_ADDRESS,
            abi: nftAbi,
            eventName: "Minted",
            fromBlock: cursor,
            toBlock,
            strict: true,
          });
          if (cancelled) return;
          addLogs(logs, !initialScan);
          lastScannedBlock.current = toBlock;
          cursor = toBlock + 1n;
          scannedRanges += 1;
        }
        setWatchError("");
      } catch (caught) {
        if (!cancelled) {
          setWatchError(caught instanceof Error ? caught.message : "Could not read ClassNFT events.");
        }
      } finally {
        polling = false;
      }
    }

    void scanEvents();
    const interval = setInterval(() => void scanEvents(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [addLogs, publicClient]);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(await Notification.requestPermission());
  }

  return (
    <section className="panel activity-panel">
      <div className="panel-body">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sepolia · Live contract events</p>
            <h1 className="panel-title">Mint alerts</h1>
            <p className="panel-note">Keep this page open to watch new ClassNFT mints and receive browser notifications.</p>
          </div>
          <span className="live-event-indicator"><span className="live-dot" />Listening</span>
        </div>

        <div className="activity-toolbar">
          <p className="activity-contract">
            Watching <a href={`https://sepolia.etherscan.io/address/${NFT_ADDRESS}`} target="_blank" rel="noreferrer">ClassNFT on Sepolia ↗</a>
          </p>
          {notificationPermission === "granted" ? (
            <span className="notification-state">Browser alerts enabled</span>
          ) : (
            <button className="secondary-action" type="button" onClick={enableNotifications}>
              {notificationPermission === "denied" ? "Allow alerts in browser settings" : "Enable browser alerts"}
            </button>
          )}
        </div>

        {watchError && <p className="activity-error" role="status">{watchError} · Retrying automatically.</p>}

        {alerts.length === 0 ? (
          <div className="activity-empty" role="status">
            <span className="empty-mark" aria-hidden="true">↗</span>
            <strong>Waiting for the next mint</strong>
            <span>New Minted events appear here as Sepolia confirms them.</span>
          </div>
        ) : (
          <ol className="activity-list" aria-live="polite">
            {alerts.map((alert) => (
              <li className="activity-item" key={alert.key}>
                <span className="activity-item-mark" aria-hidden="true">✓</span>
                <div className="activity-item-copy">
                  <strong>NFT #{alert.tokenId.toString()} minted</strong>
                  <span>To <AddressName address={alert.to} className="activity-address" /></span>
                  <small>{alert.blockNumber ? `Sepolia block ${alert.blockNumber.toString()}` : "Just detected"} · {new Date(alert.receivedAt).toLocaleTimeString()}</small>
                </div>
                {alert.transactionHash && (
                  <a className="inline-link" href={`https://sepolia.etherscan.io/tx/${alert.transactionHash}`} target="_blank" rel="noreferrer">
                    View ↗
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
