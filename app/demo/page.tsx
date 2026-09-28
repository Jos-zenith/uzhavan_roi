import { ReorderDemo } from "./reorder-demo"

export default function DemoPage() {
  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-bold">Live demo: one feature, instrumented end to end</h1>
        <p className="text-muted-foreground">
          This is the Uzhavan reorder screen wired to the real SDK. Every event it sends goes into the same database
          the <code className="font-mono text-sm">one_tap_reorder</code> report reads from. The console shows the
          ingest API&apos;s actual responses. Nothing on this page is simulated except the farmer.
        </p>
      </div>
      <ReorderDemo />
    </div>
  )
}
