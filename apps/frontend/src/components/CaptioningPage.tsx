import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import {
  type CaptioningConfig,
  type CaptioningEvent,
  type CaptioningSettings,
  type CaptionMode,
  getCaptioningConfig,
  type ImageFile,
  scanDirectory,
  stopCaptioningSession,
  streamCaptioning,
} from "../lib/captioningApi"
import { CaptioningForm } from "./CaptioningForm"
import { ImageStatusList } from "./ImageStatusList"
import { buildFeedLines, type FeedLine, ProgressFeed } from "./ProgressFeed"
import { SettingsSidebar } from "./SettingsSidebar"

export function CaptioningPage() {
  const [dirPath, setDirPath] = useState("")
  const [scannedDirPath, setScannedDirPath] = useState("")
  const [images, setImages] = useState<ImageFile[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<CaptioningConfig | null>(null)
  const [settings, setSettings] = useState<CaptioningSettings>({
    serviceHost: "",
    apiKey: "",
    modelName: "",
    instruction: "",
    maxResolution: 0,
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeFile, setActiveFile] = useState<string | undefined>()
  const [liveCaption, setLiveCaption] = useState<string | undefined>()
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set())
  const [feedLines, setFeedLines] = useState<FeedLine[]>([])
  const [feedOpen, setFeedOpen] = useState(false)
  const [isStopPending, setIsStopPending] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const eventsRef = useRef<CaptioningEvent[]>([])
  const stopPendingRef = useRef(false)

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

  const handleScan = useCallback(async (path: string) => {
    setError(null)
    setIsScanning(true)
    setCheckedFiles(new Set())
    try {
      const result = await scanDirectory(path)
      setScannedDirPath(path)
      setImages(result.images)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsScanning(false)
    }
  }, [])

  const handleStart = useCallback(
    async (path: string, mode: CaptionMode, filesFilter?: string[]) => {
      setError(null)
      setActiveFile(undefined)
      setLiveCaption(undefined)
      setIsStopPending(false)
      stopPendingRef.current = false
      setIsStreaming(true)
      setFeedLines([])
      setFeedOpen(true)
      eventsRef.current = []

      const ac = new AbortController()
      abortRef.current = ac
      const sessionId = crypto.randomUUID()
      sessionIdRef.current = sessionId

      // Re-scan to get fresh status before streaming (always full dir, not filtered)
      try {
        const result = await scanDirectory(path)
        setScannedDirPath(path)
        setImages(result.images)
      } catch {
        // proceed anyway
      }

      try {
        await streamCaptioning({
          dirPath: path,
          mode,
          filesFilter,
          settings,
          sessionId,
          signal: ac.signal,
          onEvent(event) {
            // Track active file and live caption
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
            // Accumulate for feed
            eventsRef.current = [...eventsRef.current, event]
            setFeedLines(buildFeedLines(eventsRef.current))

            if (
              stopPendingRef.current &&
              (event.type === "done" ||
                event.type === "error" ||
                event.type === "skip")
            ) {
              stopCaptioningSession(sessionId).catch(() => {})
              abortRef.current?.abort()
            }
          },
        })
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") {
          toast("Stopped after the current image finished", { icon: "⏹" })
        } else {
          toast.error(
            `Stream interrupted: ${e instanceof Error ? e.message : String(e)}`,
            { duration: 6000 },
          )
        }
      } finally {
        sessionIdRef.current = null
        const lastEvent = eventsRef.current.findLast(
          (ev) => ev.type === "summary",
        )
        if (lastEvent?.type === "summary") {
          const s = lastEvent
          const msg = `Done — ${s.captioned} captioned${
            s.skipped > 0 ? `, ${s.skipped} skipped` : ""
          }${s.failed > 0 ? `, ${s.failed} failed` : ""}`
          if (s.failed > 0) {
            toast.error(msg, { duration: 6000 })
          } else {
            toast.success(msg, { duration: 5000 })
          }
        }
        setIsStreaming(false)
        setIsStopPending(false)
        stopPendingRef.current = false
        setActiveFile(undefined)
        setLiveCaption(undefined)
      }
    },
    [settings],
  )

  const handleStop = useCallback(() => {
    if (isStopPending) return
    setIsStopPending(true)
    stopPendingRef.current = true
    toast("Stopping... will stop after the current image finishes", {
      icon: "⏳",
    })
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
          onScan={handleScan}
          onStart={handleStart}
          onStop={handleStop}
          isStopPending={isStopPending}
          onClearSelection={() => setCheckedFiles(new Set())}
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
