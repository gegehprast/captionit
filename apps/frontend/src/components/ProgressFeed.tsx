import { useEffect, useRef } from "react"
import type { CaptioningEvent } from "../lib/captioningApi"

export type FeedLine =
  | { kind: "info"; text: string }
  | {
      kind: "image"
      file: string
      index: number
      total: number
      sizeMB: string
    }
  | { kind: "token"; file: string; accumulated: string }
  | { kind: "done"; file: string; caption: string }
  | { kind: "skip"; file: string }
  | { kind: "error"; file: string; message: string }
  | { kind: "summary"; captioned: number; skipped: number; failed: number }

interface ProgressFeedProps {
  lines: FeedLine[]
}

export function buildFeedLines(events: CaptioningEvent[]): FeedLine[] {
  const lines: FeedLine[] = []
  let currentFile: string | null = null
  let tokenBuffer = ""
  let total = 0

  for (const event of events) {
    switch (event.type) {
      case "start":
        total = event.total
        lines.push({
          kind: "info",
          text: `Starting — ${total} image(s) to process`,
        })
        break
      case "image":
        // Flush previous token buffer
        if (currentFile && tokenBuffer) {
          lines.push({
            kind: "done",
            file: currentFile,
            caption: tokenBuffer.trim(),
          })
          tokenBuffer = ""
        }
        currentFile = event.file
        tokenBuffer = ""
        lines.push({
          kind: "image",
          file: event.file,
          index: event.index,
          total,
          sizeMB: event.sizeMB,
        })
        break
      case "token": {
        tokenBuffer += event.delta
        // Update live token line — replace last token line for same file
        const file = currentFile ?? ""
        const lastIdx = lines.findLastIndex(
          (l: FeedLine) =>
            l.kind === "token" && (l as { file: string }).file === file,
        )
        if (lastIdx >= 0) {
          lines[lastIdx] = {
            kind: "token",
            file,
            accumulated: tokenBuffer,
          }
        } else {
          lines.push({
            kind: "token",
            file,
            accumulated: tokenBuffer,
          })
        }
        break
      }
      case "done": {
        // Replace token line with final done line
        const tokenIdx = lines.findLastIndex(
          (l: FeedLine) =>
            l.kind === "token" && (l as { file: string }).file === event.file,
        )
        if (tokenIdx >= 0) {
          lines[tokenIdx] = {
            kind: "done",
            file: event.file,
            caption: event.caption,
          }
        } else {
          lines.push({ kind: "done", file: event.file, caption: event.caption })
        }
        currentFile = null
        tokenBuffer = ""
        break
      }
      case "skip":
        lines.push({ kind: "skip", file: event.file })
        break
      case "error":
        lines.push({ kind: "error", file: event.file, message: event.message })
        currentFile = null
        tokenBuffer = ""
        break
      case "summary":
        lines.push({ kind: "summary", ...event })
        break
    }
  }

  return lines
}

export function ProgressFeed({ lines }: ProgressFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines.length])

  if (lines.length === 0) return null

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 font-mono text-sm overflow-y-auto max-h-96 space-y-1">
      {lines.map((line, i) => {
        switch (line.kind) {
          case "info":
            return (
              <div key={i} className="text-gray-400">
                {line.text}
              </div>
            )
          case "image":
            return (
              <div key={i} className="text-violet-400 mt-2">
                [{line.index}/{line.total}] {line.file}{" "}
                <span className="text-gray-500">({line.sizeMB} MB)</span>
              </div>
            )
          case "token":
            return (
              <div
                key={i}
                className="text-gray-200 whitespace-pre-wrap break-words"
              >
                {line.accumulated}
                <span className="animate-pulse">▌</span>
              </div>
            )
          case "done":
            return (
              <div key={i} className="text-green-400">
                ✓ saved
              </div>
            )
          case "skip":
            return (
              <div key={i} className="text-gray-500">
                [skip] {line.file}
              </div>
            )
          case "error":
            return (
              <div key={i} className="text-red-400">
                ✗ {line.file}: {line.message}
              </div>
            )
          case "summary":
            return (
              <div
                key={i}
                className="text-white mt-2 border-t border-gray-800 pt-2"
              >
                Done — captioned:{" "}
                <span className="text-green-400">{line.captioned}</span>{" "}
                skipped: <span className="text-gray-400">{line.skipped}</span>{" "}
                failed: <span className="text-red-400">{line.failed}</span>
              </div>
            )
          default:
            return null
        }
      })}
      <div ref={bottomRef} />
    </div>
  )
}
