import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { ReorderDemo } from "./reorder-demo"

export default function DemoPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
          <FlaskConical className="h-4 w-4" aria-hidden /> Sandbox · you are the farmer
        </p>
        <h1 className="text-2xl">Be a user in a live A/B test</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          The portfolio is the view from the review meeting. This page is the other end of the pipe. You&apos;re
          dropped into the <code className="font-mono text-sm">one_tap_reorder</code> test on a mock Uzhavan reorder
          screen, and every tap goes through the real SDK into the same database the{" "}
          <Link href="/features/one_tap_reorder" className="text-primary hover:underline">
            feature report
          </Link>{" "}
          reads. The console below shows what the ingest API actually said back.
        </p>
      </div>
      <ReorderDemo />
    </div>
  )
}
