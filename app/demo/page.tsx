import { ReorderDemo } from "./reorder-demo"

export default function DemoPage() {
  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-bold">Live demo: instrumenting a feature</h1>
        <p className="text-muted-foreground">
          A mock of the Uzhavan reorder screen, wired to the real telemetry SDK. Each visitor is deterministically
          assigned to the <code className="font-mono text-sm">one_tap_reorder</code> A/B test. Place an order and
          watch the events go through the common schema into the same pipeline the ROI report reads from.
        </p>
      </div>
      <ReorderDemo />
    </div>
  )
}
