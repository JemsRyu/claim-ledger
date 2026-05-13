import { UrlInput } from "@/components/UrlInput";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center px-6 pt-20 pb-16 text-foreground sm:pt-28">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <a
              href="/"
              aria-label="claim-ledger — back to home"
              className="font-mono text-base font-bold uppercase tracking-widest text-foreground/85 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded sm:text-lg"
            >
              claim-ledger
            </a>
            <span className="text-xs text-foreground/45">
              by Jemin Ryu
            </span>
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Claim auditor for informational videos.
          </h1>
          <p className="text-balance text-lg leading-relaxed text-foreground/70">
            Paste any YouTube URL. The auditor extracts every factual claim,
            timestamps each one word-for-word against the transcript, and flags
            the ones that hedge or skip sourcing. Click a timestamp to jump
            there in the embedded player; click a flag to research the claim
            against academic literature.
          </p>
        </header>

        <UrlInput />

        <section
          aria-label="status"
          className="flex flex-col gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-sm leading-relaxed text-foreground/60"
        >
          <p>
            <span className="mr-2 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Live
            </span>
            Real Sonnet 4.6 extraction + Haiku 4.5 classification, streaming
            into the ledger as each claim lands.
          </p>
          <p className="text-xs text-foreground/45">
            The model never emits timestamps. Verbatim quotes are
            fuzzy-matched against the transcript and spans are derived
            deterministically server-side — click any timestamp to verify.
          </p>
        </section>

        <footer className="flex items-center gap-4 text-sm text-foreground/50">
          <a
            href="https://github.com/JemsRyu/claim-ledger"
            className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            GitHub
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/JemsRyu/claim-ledger/blob/main/DESIGN.md"
            className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            Design
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/JemsRyu/claim-ledger/blob/main/PLAN.md"
            className="underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            Plan
          </a>
        </footer>
      </div>
    </main>
  );
}
