import { useCallback, useEffect, useRef, useState } from "react"

function playDoneChime() {
  try {
    const ctx = new AudioContext()
    for (const [freq, start, duration] of [
      [523.25, 0, 0.25], // C5
      [659.25, 0.12, 0.25], // E5
      [783.99, 0.24, 0.4], // G5
    ] as [number, number, number][]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + start + duration,
      )
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
  } catch {
    // AudioContext not available (e.g. SSR or restricted environment)
  }
}

import toast from "react-hot-toast"
import {
  type CaptioningConfig,
  type CaptioningEvent,
  type CaptioningSettings,
  type CaptionMode,
  connectToSession,
  getCaptioningConfig,
  getCaptioningSession,
  type ImageFile,
  scanDirectory,
  startCaptioningSession,
  stopCaptioningSession,
} from "../lib/captioningApi"
import {
  clearPersistedSession,
  readLockedFiles,
  readPersistedSession,
  readSettings,
  readUserPrefs,
  writeLockedFiles,
  writePersistedSession,
  writeSettings,
  writeUserPrefs,
} from "../lib/persistence"
import { CaptioningForm } from "./CaptioningForm"
import { ImageStatusList } from "./ImageStatusList"
import { buildFeedLines, type FeedLine, ProgressFeed } from "./ProgressFeed"
import { SettingsSidebar } from "./SettingsSidebar"

export function CaptioningPage() {
  const [dirPath, setDirPath] = useState(
    () => readUserPrefs()?.dirPath ?? readPersistedSession()?.dirPath ?? "",
  )
  const [mode, setMode] = useState<CaptionMode>(
    () => readUserPrefs()?.mode ?? readPersistedSession()?.mode ?? "store",
  )
  const [scannedDirPath, setScannedDirPath] = useState("")
  const [images, setImages] = useState<ImageFile[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<CaptioningConfig | null>(null)
  const [settings, setSettings] = useState<CaptioningSettings>(() => {
    const saved = readSettings()
    return {
      serviceHost: saved?.serviceHost ?? "",
      apiKey: saved?.apiKey ?? "",
      modelName: saved?.modelName ?? "",
      instruction: saved?.instruction ?? "",
      maxResolution: saved?.maxResolution ?? 0,
    }
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeFile, setActiveFile] = useState<string | undefined>()
  const [liveCaption, setLiveCaption] = useState<string | undefined>()
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set())
  const [lockedFiles, setLockedFiles] = useState<Set<string>>(new Set())
  const [feedLines, setFeedLines] = useState<FeedLine[]>([])
  const [feedOpen, setFeedOpen] = useState(false)
  const [isStopPending, setIsStopPending] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const lockedFilesRef = useRef(lockedFiles)
  const scannedDirPathRef = useRef(scannedDirPath)
  const imagesRef = useRef(images)
  useEffect(() => {
    lockedFilesRef.current = lockedFiles
  }, [lockedFiles])
  useEffect(() => {
    scannedDirPathRef.current = scannedDirPath
  }, [scannedDirPath])
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  const eventsRef = useRef<CaptioningEvent[]>([])
  const stopPendingRef = useRef(false)
  const disconnectRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    getCaptioningConfig()
      .then((cfg) => {
        setConfig(cfg)
        setSettings((prev) => ({
          serviceHost: prev.serviceHost || cfg.serviceHost,
          apiKey: prev.apiKey,
          modelName: prev.modelName || cfg.modelName,
          instruction: prev.instruction || cfg.instruction,
          maxResolution: prev.maxResolution || cfg.maxResolution,
        }))
      })
      .catch(() => {
        /* silently ignore if backend not ready */
      })
  }, [])

  useEffect(() => {
    writeUserPrefs({ dirPath, mode })
  }, [dirPath, mode])

  useEffect(() => {
    writeSettings(settings)
  }, [settings])

  // Auto-scan on mount if a directory was previously used
  useEffect(() => {
    if (dirPath) handleScan(dirPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On mount: check if there's a persisted session from a previous page load
  useEffect(() => {
    let cancelled = false
    let localDisconnect: (() => void) | null = null

    const saved = readPersistedSession()
    if (!saved) return

    const { sessionId, dirPath: savedDirPath } = saved

    getCaptioningSession(sessionId)
      .then(async (state) => {
        if (cancelled) return

        if (!state || state.status !== "running") {
          clearPersistedSession()
          return
        }

        // Session is still running — restore UI then reconnect
        toast("Reconnecting to active captioning session…", { icon: "🔄" })
        sessionIdRef.current = sessionId
        setIsStreaming(true)
        setFeedOpen(true)
        eventsRef.current = []
        setDirPath(savedDirPath)

        // Populate the image list so replayed events can update statuses
        try {
          const result = await scanDirectory(savedDirPath)
          if (!cancelled) {
            setScannedDirPath(savedDirPath)
            setImages(result.images)
          }
        } catch {
          // proceed without image list
        }

        if (cancelled) return

        localDisconnect = connectToSession({
          sessionId,
          onEvent: handleEvent,
          onClose: handleSessionClose,
          onError: (msg) => {
            toast.error(`Stream error: ${msg}`)
          },
        })
        disconnectRef.current = localDisconnect
      })
      .catch(() => {
        if (!cancelled) clearPersistedSession()
      })

    return () => {
      cancelled = true
      localDisconnect?.()
      localDisconnect = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEvent = useCallback((event: CaptioningEvent) => {
    if (event.type === "image") {
      setActiveFile(event.file)
      setLiveCaption("")
    } else if (event.type === "token") {
      setLiveCaption((prev) => (prev ?? "") + event.delta)
    } else if (event.type === "done") {
      setImages((prev) =>
        prev.map((img) =>
          img.file === event.file
            ? { ...img, hasCaption: true, caption: event.caption }
            : img,
        ),
      )
      setActiveFile(undefined)
      setLiveCaption(undefined)
    } else if (event.type === "error") {
      setActiveFile(undefined)
      setLiveCaption(undefined)
    }

    eventsRef.current = [...eventsRef.current, event]
    setFeedLines(buildFeedLines(eventsRef.current))
  }, [])

  const handleSessionClose = useCallback(() => {
    const lastEvent = eventsRef.current.findLast((ev) => ev.type === "summary")

    if (lastEvent?.type === "summary") {
      const s = lastEvent
      const stoppedByUser = stopPendingRef.current
      const msg = `${stoppedByUser ? "Stopped — " : "Done — "}${s.captioned} captioned${
        s.skipped > 0 ? `, ${s.skipped} skipped` : ""
      }${s.failed > 0 ? `, ${s.failed} failed` : ""}`

      if (stoppedByUser) {
        toast(msg, { icon: "⏹" })
      } else if (s.failed > 0) {
        toast.error(msg, { duration: 6000 })
      } else {
        playDoneChime()
        toast.success(msg, { duration: 5000 })
      }
    }

    clearPersistedSession()
    sessionIdRef.current = null
    disconnectRef.current = null
    setIsStreaming(false)
    setIsStopPending(false)
    stopPendingRef.current = false
    setActiveFile(undefined)
    setLiveCaption(undefined)
  }, [])

  const toggleLocked = useCallback((file: string) => {
    setLockedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      writeLockedFiles(scannedDirPathRef.current, next)
      return next
    })
  }, [])

  const handleLockSelected = useCallback((files: Set<string>) => {
    setLockedFiles((prev) => {
      const next = new Set(prev)
      for (const f of files) next.add(f)
      writeLockedFiles(scannedDirPathRef.current, next)
      return next
    })
  }, [])

  const handleUnlockSelected = useCallback((files: Set<string>) => {
    setLockedFiles((prev) => {
      const next = new Set(prev)
      for (const f of files) next.delete(f)
      writeLockedFiles(scannedDirPathRef.current, next)
      return next
    })
  }, [])

  const handleScan = useCallback(async (path: string) => {
    setError(null)
    setIsScanning(true)

    try {
      const result = await scanDirectory(path)
      setScannedDirPath(path)
      setImages(result.images)
      setLockedFiles(readLockedFiles(path))

      const set = new Set<string>()
      set.add(result.images[0]?.file)
      setCheckedFiles(set)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsScanning(false)
    }
  }, [])

  const handleStart = useCallback(
    async (path: string, mode: CaptionMode, filesFilter?: string[]) => {
      const locked = lockedFilesRef.current
      let filter = filesFilter
      if (locked.size > 0) {
        const base = filter ?? imagesRef.current.map((i) => i.file)
        filter = base.filter((f) => !locked.has(f))
        if (filter.length === 0) {
          toast.error("All selected images are locked, nothing to caption.")
          return
        }
      }

      setError(null)
      setActiveFile(undefined)
      setLiveCaption(undefined)
      setIsStopPending(false)
      stopPendingRef.current = false
      setIsStreaming(true)
      setFeedLines([])
      setFeedOpen(true)
      eventsRef.current = []

      try {
        const sessionId = await startCaptioningSession(
          path,
          mode,
          settings,
          filter,
        )
        sessionIdRef.current = sessionId
        writePersistedSession({ sessionId, dirPath: path, mode })

        // Rescan to get fresh image list before events start arriving
        try {
          const result = await scanDirectory(path)
          setScannedDirPath(path)
          setImages(result.images)
        } catch {
          // proceed anyway
        }

        disconnectRef.current = connectToSession({
          sessionId,
          onEvent: handleEvent,
          onClose: handleSessionClose,
          onError: (msg) => {
            // EventSource reconnects automatically on most errors.
            // Only fatal errors (CLOSED state) reach here.
            toast.error(`Stream error: ${msg}`, { duration: 6000 })
          },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setIsStreaming(false)
        clearPersistedSession()
      }
    },
    [settings, handleEvent, handleSessionClose],
  )

  const handleStop = useCallback(() => {
    if (isStopPending) return
    setIsStopPending(true)
    stopPendingRef.current = true
    toast("Stopping… will finish the current image first", { icon: "⏳" })
    const sid = sessionIdRef.current
    if (sid) stopCaptioningSession(sid).catch(() => {})
  }, [isStopPending])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-lvw mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">CaptionIt</h1>
          <div className="flex items-center gap-4">
            {config && (
              <div className="text-xs text-gray-500 text-right">
                <div>{settings.modelName || config.modelName}</div>
                <div className="truncate max-w-48">
                  {settings.serviceHost || config.serviceHost}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label="Open settings"
            >
              ⚙
            </button>
          </div>
        </div>
      </header>

      <SettingsSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        settings={settings}
        onChange={setSettings}
        disabled={isStreaming}
      />

      <main className="max-w-lvw mx-auto px-4 py-8 space-y-6">
        <CaptioningForm
          dirPath={dirPath}
          onDirPathChange={setDirPath}
          mode={mode}
          onModeChange={setMode}
          onScan={handleScan}
          onStart={handleStart}
          onStop={handleStop}
          isStopPending={isStopPending}
          isScanning={isScanning}
          isStreaming={isStreaming}
          selectedFiles={checkedFiles.size > 0 ? [...checkedFiles] : undefined}
        />

        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {images.length > 0 && (
          <ImageStatusList
            dirPath={scannedDirPath}
            images={images}
            activeFile={activeFile}
            liveCaption={liveCaption}
            checkedFiles={checkedFiles}
            onCheckedChange={setCheckedFiles}
            lockedFiles={lockedFiles}
            onToggleLocked={toggleLocked}
            onLockSelected={handleLockSelected}
            onUnlockSelected={handleUnlockSelected}
            onCaptionSaved={(file, caption) =>
              setImages((prev) =>
                prev.map((img) =>
                  img.file === file
                    ? { ...img, hasCaption: caption.length > 0, caption }
                    : img,
                ),
              )
            }
          />
        )}
      </main>

      <ProgressFeed
        lines={feedLines}
        isStreaming={isStreaming}
        isStopPending={isStopPending}
        isOpen={feedOpen}
        onClose={() => setFeedOpen(false)}
      />
    </div>
  )
}
