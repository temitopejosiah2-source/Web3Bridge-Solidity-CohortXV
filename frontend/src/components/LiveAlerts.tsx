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

function decodeVapidKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

export function LiveAlerts() {
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const [alerts, setAlerts] = useState<MintAlert[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [watchError, setWatchError] = useState("");
  const seen = useRef(new Set<string>());
  const lastScannedBlock = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    setNotificationPermission(
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported",
    );
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
        const subscription = await registration?.pushManager.getSubscription();
        setPushEnabled(Boolean(subscription));
      }).catch((caught: unknown) => {
        setPushError(caught instanceof Error ? caught.message : "Could not check background-alert status.");
      });
    }
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
    setPushBusy(true);
    setPushError("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setNotificationPermission("unsupported");
        throw new Error("This browser does not support Web Push notifications.");
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Background alerts are not configured for this deployment.");

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") throw new Error("Allow notifications in your browser to enable background alerts.");

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error(await responseError(response, "Could not save your push subscription."));
      }
      setPushEnabled(true);
    } catch (caught) {
      setPushError(caught instanceof Error ? caught.message : "Could not enable background alerts.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disableNotifications() {
    setPushBusy(true);
    setPushError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setPushEnabled(false);
        return;
      }
      const response = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not remove your push subscription."));
      await subscription.unsubscribe();
      setPushEnabled(false);
    } catch (caught) {
      setPushError(caught instanceof Error ? caught.message : "Could not disable background alerts.");
    } finally {
      setPushBusy(false);
    }
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
          {pushEnabled ? (
            <button className="secondary-action" type="button" onClick={disableNotifications} disabled={pushBusy}>
              {pushBusy ? "Disabling…" : "Disable background alerts"}
            </button>
          ) : (
            <button className="secondary-action" type="button" onClick={enableNotifications} disabled={pushBusy}>
              {pushBusy ? "Enabling…" : "Enable background alerts"}
            </button>
          )}
        </div>

        {pushError && <p className="activity-error" role="alert">{pushError}</p>}
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
