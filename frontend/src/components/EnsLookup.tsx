"use client";

import { useState, type FormEvent } from "react";
import { useEnsAddress, useEnsAvatar, useEnsName, useEnsText } from "wagmi";
import { mainnet } from "wagmi/chains";
import { ipfsToHttp } from "@/contracts/nft";
import { safeNormalize } from "@/lib/ens";
import { AddressName } from "./AddressName";

export function EnsLookup({ defaultName = "vitalik.eth" }: { defaultName?: string }) {
  const [input, setInput] = useState(defaultName);
  const [query, setQuery] = useState<string | undefined>(() => safeNormalize(defaultName));
  const [validationError, setValidationError] = useState("");
  const [hasSearched, setHasSearched] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const { data: resolved, isLoading, isError } = useEnsAddress({ name: query, chainId: mainnet.id });
  const { data: avatar } = useEnsAvatar({ name: query, chainId: mainnet.id });
  const { data: description } = useEnsText({ name: query, key: "description", chainId: mainnet.id });
  const { data: twitter } = useEnsText({ name: query, key: "com.twitter", chainId: mainnet.id });
  const { data: primaryName } = useEnsName({
    address: resolved ?? undefined,
    chainId: mainnet.id,
    query: { enabled: Boolean(resolved) },
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = safeNormalize(input.trim());
    setHasSearched(true);
    if (!normalized) {
      setQuery(undefined);
      setValidationError("Enter a valid ENS name ending in .eth.");
      return;
    }
    setValidationError("");
    setQuery(normalized);
  }

  function editName(value: string) {
    setInput(value);
    setQuery(undefined);
    setHasSearched(false);
    setValidationError("");
    setAvatarFailed(false);
  }

  return (
    <section className="panel ens-panel">
      <div className="panel-body">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Discover · 02 / 03</p>
            <h2 className="panel-title">Find an ENS name</h2>
            <p className="panel-note">Resolve a name on Ethereum mainnet. No wallet connection needed.</p>
          </div>
          <span className="panel-mark panel-mark-ens" aria-hidden="true">.eth</span>
        </div>

        <form className="lookup-form" onSubmit={search} role="search">
          <label className="visually-hidden" htmlFor="ens-name">ENS name</label>
          <input
            className="search-input"
            id="ens-name"
            value={input}
            onChange={(event) => editName(event.target.value)}
            placeholder="name.eth"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? "ens-error" : "ens-hint"}
          />
          <button className="secondary-action lookup-button" type="submit" disabled={!input.trim()}>
            Look up
          </button>
        </form>
        {validationError ? (
          <p className="field-error" id="ens-error" role="alert">{validationError}</p>
        ) : (
          <p className="field-help" id="ens-hint">Try vitalik.eth</p>
        )}

        <div className="lookup-state" aria-live="polite">
          {isLoading && query && <p className="state-message"><span className="button-spinner" />Resolving {query}…</p>}
          {isError && query && !isLoading && <p className="field-error">ENS could not be reached. Check your connection and try again.</p>}
          {hasSearched && query && !isLoading && !isError && !resolved && (
            <div className="empty-state lookup-empty">
              <span className="empty-mark" aria-hidden="true">?</span>
              <strong>No address found</strong>
              <span>This name has no address record set, or it may not be registered.</span>
            </div>
          )}
        </div>

        {resolved && query && (
          <div className="lookup-result">
            {avatar && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ens-avatar" src={ipfsToHttp(avatar)} alt={`${query} avatar`} onError={() => setAvatarFailed(true)} />
            ) : (
              <div className="ens-avatar ens-avatar-placeholder" aria-hidden="true">ENS</div>
            )}
            <div className="lookup-details">
              <p className="lookup-primary">{primaryName ?? query}</p>
              <p className="lookup-address">
                <span className="detail-label">Resolved wallet</span>
                <AddressName address={resolved} className="resolved-name" />
              </p>
              {description && <p className="lookup-description">{description}</p>}
              <div className="lookup-meta">
                <span className="meta-tag">Ethereum mainnet</span>
                {twitter && <span className="meta-tag">X · @{twitter.replace(/^@/, "")}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
