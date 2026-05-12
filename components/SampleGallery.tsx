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
      <header>
        <h2 className="font-mono text-xs uppercase tracking-widest text-foreground/50">
          Try a sample
        </h2>
      </header>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CURATED_SAMPLES.map((sample) => (
          <li key={sample.id}>
            <button
              type="button"
              onClick={() => onSelect(sample.url)}
              disabled={disabled}
              className="group flex w-full flex-col gap-2 overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.02] p-0 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-foreground/10 disabled:hover:bg-foreground/[0.02]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${sample.id}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="aspect-video w-full bg-foreground/[0.04] object-cover"
              />
              <div className="flex flex-col gap-1 px-3 pb-3 pt-1">
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
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
