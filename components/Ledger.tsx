"use client";

import { useEffect, useState } from "react";
import type {
  AdversarialFlag,
  ValidatedClaim,
} from "@/lib/lens/types";
import { ClaimCard } from "./ClaimCard";
import { LensProgress } from "./LensProgress";
import { EmptyAudit } from "./EmptyAudit";

type LedgerState =
  | {
      status: "extracting" | "classifying" | "done";
      claims: ValidatedClaim[];
      classifiedIds: Set<string>;
    }
  | { status: "no-audit-applicable"; message: string }
  | { status: "no-transcript"; message: string }
  | { status: "error"; message: string };

const INITIAL_STATE: LedgerState = {
  status: "extracting",
  claims: [],
  classifiedIds: new Set(),
};

type Props = {
  videoId: string;
  onSeek: (seconds: number) => void;
};

export function Ledger({ videoId, onSeek }: Props) {
  const [state, setState] = useState<LedgerState>(INITIAL_STATE);

  useEffect(() => {
    setState(INITIAL_STATE);

    const source = new EventSource(
      `/api/audit?videoId=${encodeURIComponent(videoId)}`,
    );
    let closed = false;

    function safeClose() {
      if (!closed) {
        closed = true;
        source.close();
      }
    }

    source.addEventListener("lens-start", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        lens: "extraction" | "classification";
      };
      setState((prev) => {
        if (
          prev.status === "no-audit-applicable" ||
          prev.status === "no-transcript" ||
          prev.status === "error"
        ) {
          return prev;
        }
        return {
          ...prev,
          status: data.lens === "extraction" ? "extracting" : "classifying",
        };
      });
    });

    source.addEventListener("validated", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        claim: ValidatedClaim;
      };
      setState((prev) => {
        if (
          prev.status === "no-audit-applicable" ||
          prev.status === "no-transcript" ||
          prev.status === "error"
        ) {
          return prev;
        }
        if (prev.claims.some((c) => c.id === data.claim.id)) return prev;
        return {
          ...prev,
          claims: [...prev.claims, data.claim],
        };
      });
    });

    source.addEventListener("classified", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        claimId: string;
        flags: AdversarialFlag[];
      };
      setState((prev) => {
        if (
          prev.status === "no-audit-applicable" ||
          prev.status === "no-transcript" ||
          prev.status === "error"
        ) {
          return prev;
        }
        const nextClassified = new Set(prev.classifiedIds);
        nextClassified.add(data.claimId);
        return {
          ...prev,
          classifiedIds: nextClassified,
          claims: prev.claims.map((c) =>
            c.id === data.claimId ? { ...c, flags: data.flags } : c,
          ),
        };
      });
    });

    source.addEventListener("no-audit-applicable", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        reason: string;
      };
      setState({ status: "no-audit-applicable", message: data.reason });
    });

    source.addEventListener("no-transcript", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        reason: string;
      };
      setState({ status: "no-transcript", message: data.reason });
    });

    source.addEventListener("done", () => {
      setState((prev) => {
        if (
          prev.status === "no-audit-applicable" ||
          prev.status === "no-transcript" ||
          prev.status === "error"
        ) {
          return prev;
        }
        return { ...prev, status: "done" };
      });
      safeClose();
    });

    source.addEventListener("error", (event) => {
      // Only treat as error if the stream is actually closed (not a transient).
      if (source.readyState === EventSource.CLOSED) {
        const data = (event as MessageEvent).data;
        let message = "Connection lost.";
        if (typeof data === "string" && data.length > 0) {
          try {
            const parsed = JSON.parse(data) as { message?: string };
            if (parsed.message) message = parsed.message;
          } catch {
            // not JSON, keep default
          }
        }
        setState((prev) =>
          prev.status === "done" ? prev : { status: "error", message },
        );
        safeClose();
      }
    });

    return () => {
      safeClose();
    };
  }, [videoId]);

  if (state.status === "no-audit-applicable") {
    return <EmptyAudit reason={state.message} />;
  }

  if (state.status === "no-transcript") {
    return (
      <section
        aria-label="Audit result"
        className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-5 text-sm text-foreground/70"
      >
        {state.message}
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        role="alert"
        className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-700 dark:text-red-400"
      >
        {state.message}
      </section>
    );
  }

  return (
    <section aria-label="Claim ledger" className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-widest text-foreground/50">
          Claim ledger
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-foreground/40">
          {state.status === "done" ? `${state.claims.length} claims` : " "}
        </span>
      </header>

      <LensProgress status={state.status} />

      {state.claims.length === 0 && state.status === "done" && (
        <p className="text-sm text-foreground/60">
          No claims surfaced. Either nothing was asserted as fact, or every
          extracted claim failed transcript validation.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {state.claims.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            classified={state.classifiedIds.has(claim.id)}
            onSeek={onSeek}
          />
        ))}
      </div>
    </section>
  );
}
