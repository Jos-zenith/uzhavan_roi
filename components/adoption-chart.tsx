/** Weekly adoption — a single series, so no legend; hover shows the exact value. */
export function AdoptionChart({ weeks }: { weeks: { label: string; users: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.users))
  const last = weeks.at(-1)
  return (
    <figure>
      <div className="flex h-28 items-end gap-[2px]" role="list" aria-label="Weekly exposed users">
        {weeks.map((w) => (
          <div key={w.label} role="listitem" className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full group-hover:opacity-80"
              style={{
                height: `${(w.users / max) * 100}%`,
                minHeight: w.users > 0 ? 2 : 0,
                background: "var(--viz-positive)",
                borderRadius: "4px 4px 0 0",
              }}
            />
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-lg group-hover:block"
            >
              Week of {w.label}: <span className="tabular-nums">{w.users.toLocaleString("en-IN")}</span> users
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 h-px bg-muted-foreground/50" aria-hidden />
      <figcaption className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{weeks[0]?.label}</span>
        {last && <span className="tabular-nums">this week: {last.users.toLocaleString("en-IN")}</span>}
      </figcaption>
    </figure>
  )
}
