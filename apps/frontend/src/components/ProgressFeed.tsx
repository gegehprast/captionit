import { useEffect, useRef, useState } from "react"
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
  isStreaming: boolean
  isStopPending: boolean
  isOpen: boolean
  onClose: () => void
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

export function ProgressFeed({
  lines,
  isStreaming,
  isStopPending,
  isOpen,
  onClose,
}: ProgressFeedProps) {
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const clampPosition = (x: number, y: number) => {
    const panel = panelRef.current
    const panelWidth = panel?.offsetWidth ?? 384
    const panelHeight = panel?.offsetHeight ?? 360
    const maxX = Math.max(16, window.innerWidth - panelWidth - 16)
    const maxY = Math.max(16, window.innerHeight - panelHeight - 16)

    return {
      x: Math.min(Math.max(16, x), maxX),
      y: Math.min(Math.max(16, y), maxY),
    }
  }

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) setMinimized(false)
  }, [isStreaming])

  // Initialize the panel position once we can measure the viewport and panel.
  useEffect(() => {
    if (!isOpen) return

    const updateInitialPosition = () => {
      const panel = panelRef.current
      const panelWidth = panel?.offsetWidth ?? 384
      const panelHeight = panel?.offsetHeight ?? 360
      setPosition({
        x: Math.max(16, window.innerWidth - panelWidth - 16),
        y: Math.max(16, window.innerHeight - panelHeight - 16),
      })
    }

    updateInitialPosition()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleResize = () => {
      setPosition((current) => clampPosition(current.x, current.y))
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [isOpen])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (event: PointerEvent) => {
      setPosition(
        clampPosition(
          event.clientX - dragOffsetRef.current.x,
          event.clientY - dragOffsetRef.current.y,
        ),
      )
    }

    const handleUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("pointercancel", handleUp)

    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("pointercancel", handleUp)
    }
  }, [isDragging])

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [lines.length, minimized])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className="fixed w-96 z-50 shadow-2xl rounded-xl overflow-hidden border border-gray-700 select-none"
      style={{ left: position.x, top: position.y }}
    >
      {/* Title bar */}
      <div
        className={`flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const target = event.target as HTMLElement
          if (target.closest("button")) return

          const panel = panelRef.current
          if (!panel) return

          const rect = panel.getBoundingClientRect()
          dragOffsetRef.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }
          setIsDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-200 pointer-events-none">
          {isStreaming && (
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse inline-block" />
          )}
          <span>Progress</span>
          {isStopPending && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 border border-amber-500/30">
              stopping...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-xs leading-none"
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? "▲" : "▼"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-xs leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      {!minimized && (
        <div className="font-mono text-xs overflow-y-auto max-h-80 p-3 space-y-1 bg-gray-950 cursor-auto">
          {lines.length === 0 && <div className="text-gray-500">Waiting…</div>}
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
                    className="text-gray-200 whitespace-pre-wrap wrap-break-word"
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
                    skipped:{" "}
                    <span className="text-gray-400">{line.skipped}</span>{" "}
                    failed: <span className="text-red-400">{line.failed}</span>
                  </div>
                )
              default:
                return null
            }
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
