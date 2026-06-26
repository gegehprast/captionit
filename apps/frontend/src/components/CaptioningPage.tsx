import { useCallback, useEffect, useRef, useState } from "react"
import {
  type CaptioningConfig,
  type CaptioningEvent,
  type CaptionMode,
  getCaptioningConfig,
  type ImageFile,
  scanDirectory,
  streamCaptioning,
} from "../lib/captioningApi"
import { CaptioningForm } from "./CaptioningForm"
import { ImageStatusList } from "./ImageStatusList"
import type { FeedLine } from "./ProgressFeed"
import { buildFeedLines, ProgressFeed } from "./ProgressFeed"

export function CaptioningPage() {
  const [dirPath, setDirPath] = useState("")
  const [images, setImages] = useState<ImageFile[]>([])
  const [feedLines, setFeedLines] = useState<FeedLine[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<CaptioningConfig | null>(null)
  const [activeFile, setActiveFile] = useState<string | undefined>()
  const [liveCaption, setLiveCaption] = useState<string | undefined>()
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set())

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getCaptioningConfig()
      .then(setConfig)
      .catch(() => {
        /* silently ignore if backend not ready */
      })
  }, [])

  const handleScan = useCallback(async (path: string) => {
    setError(null)
    setIsScanning(true)
    setFeedLines([])
    setCheckedFiles(new Set())
    try {
      const result = await scanDirectory(path)
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
      setFeedLines([])
      setActiveFile(undefined)
      setLiveCaption(undefined)
      setIsStreaming(true)

      const ac = new AbortController()
      abortRef.current = ac

      // Re-scan to get fresh status before streaming
      try {
        const result = await scanDirectory(path, filesFilter)
        setImages(result.images)
      } catch {
        // proceed anyway
      }

      const events: CaptioningEvent[] = []

      try {
        await streamCaptioning({
          dirPath: path,
          mode,
          filesFilter,
          signal: ac.signal,
          onEvent(event) {
            events.push(event)

            // Track active file and live caption
            if (event.type === "image") {
              setActiveFile(event.file)
              setLiveCaption("")
            } else if (event.type === "token") {
              setLiveCaption((prev) => (prev ?? "") + event.delta)
            } else if (event.type === "done") {
              // Update the image in the list
              setImages((prev) =>
                prev.map((img) =>
                  img.file === event.file
                    ? { ...img, hasCaption: true, caption: event.caption }
                    : img,
                ),
              )
              setActiveFile(undefined)
              setLiveCaption(undefined)
            } else if (event.type === "skip") {
              // no-op
            }

            // Rebuild feed lines (immutable snapshot)
            const lines = buildFeedLines([...events])
            setFeedLines(lines)
          },
        })
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        setIsStreaming(false)
        setActiveFile(undefined)
        setLiveCaption(undefined)
      }
    },
    [],
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">CaptionIt</h1>
          {config && (
            <div className="text-xs text-gray-500 text-right">
              <div>{config.modelName}</div>
              <div className="truncate max-w-48">{config.serviceHost}</div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <CaptioningForm
          dirPath={dirPath}
          onDirPathChange={setDirPath}
          onScan={handleScan}
          onStart={handleStart}
          onStop={handleStop}
          isScanning={isScanning}
          isStreaming={isStreaming}
          selectedFiles={checkedFiles.size > 0 ? [...checkedFiles] : undefined}
        />

        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {feedLines.length > 0 && <ProgressFeed lines={feedLines} />}

        {images.length > 0 && (
          <ImageStatusList
            dirPath={dirPath}
            images={images}
            activeFile={activeFile}
            liveCaption={liveCaption}
            checkedFiles={checkedFiles}
            onCheckedChange={setCheckedFiles}
          />
        )}
      </main>
    </div>
  )
}
