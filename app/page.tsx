import { UrlInput } from "@/components/UrlInput";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center px-6 pt-20 pb-16 text-foreground sm:pt-28">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-widest text-foreground/50">
            claim-ledger
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Claim auditor for informational video.
          </h1>
          <p className="text-balance text-lg leading-relaxed text-foreground/70">
            Paste any informational YouTube URL. Get back a structured ledger of
            every factual claim, with verbatim quotes, click-to-verify
            timestamps, and adversarial flags.
          </p>
        </header>

        <UrlInput />

        <section
          aria-label="status"
          className="flex flex-col gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-sm leading-relaxed text-foreground/60"
        >
          <p>
            <span className="mr-2 inline-block rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-foreground/80">
              Phase 1
            </span>
            Mocked end-to-end. Real claim extraction (Sonnet 4.6) and
            classification (Haiku 4.5) lands in Phase 2 — see{" "}
            <code className="font-mono text-foreground/80">PLAN.md</code>.
          </p>
          <p className="text-xs text-foreground/45">
            Click-to-verify timestamps are real even in the mock: claim
            verbatim text is fuzzy-matched against the actual transcript and
            the span is derived deterministically server-side.
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
