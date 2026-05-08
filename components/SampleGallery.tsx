"use client";

import { CURATED_SAMPLES } from "@/lib/samples/curated";

type Props = {
  disabled: boolean;
  onSelect: (url: string) => void;
};

export function SampleGallery({ disabled, onSelect }: Props) {
  return (
    <section
      aria-label="Curated samples"
      className="flex flex-col gap-2"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="font-mono text-xs uppercase tracking-widest text-foreground/50">
          Try a sample
        </h2>
        <span className="text-xs text-foreground/40">
          labeled by content type, not creator
        </span>
      </header>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CURATED_SAMPLES.map((sample) => (
          <li key={sample.id}>
            <button
              type="button"
              onClick={() => onSelect(sample.url)}
              disabled={disabled}
              className="group flex w-full flex-col gap-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-foreground/10 disabled:hover:bg-foreground/[0.02]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-foreground/60 group-hover:text-foreground/85">
                  {sample.label}
                </span>
                {sample.expectedKind === "no-audit-applicable" && (
                  <span
                    title="This sample demonstrates the empty-state behavior"
                    className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-foreground/55"
                  >
                    empty-state
                  </span>
                )}
              </span>
              <span className="text-xs leading-relaxed text-foreground/55">
                {sample.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
