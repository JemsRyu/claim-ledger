type Props = {
  reason: string;
};

export function EmptyAudit({ reason }: Props) {
  return (
    <section
      aria-label="Audit result"
      className="flex flex-col gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-5 text-sm leading-relaxed"
    >
      <header className="flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-foreground/30" />
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-foreground/55">
          No audit applicable
        </h2>
      </header>
      <p className="text-foreground/75">{reason}</p>
      <p className="text-xs text-foreground/45">
        The auditor surfaces the structure of factual claims being made.
        Non-informational content (music, narrative, performance) has no
        claims to surface — that&rsquo;s a quality signal, not a failure.
      </p>
    </section>
  );
}
