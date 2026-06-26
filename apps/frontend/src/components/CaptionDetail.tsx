import { useEffect, useRef, useState } from "react"
import type { ImageFile } from "../lib/captioningApi"
import { getImageUrl, saveCaption } from "../lib/captioningApi"

interface CaptionDetailProps {
  dirPath: string
  image: ImageFile
  isStreaming: boolean
  liveCaption?: string
  onCaptionSaved?: (file: string, caption: string) => void
}

export function CaptionDetail({
  dirPath,
  image,
  isStreaming,
  liveCaption,
  onCaptionSaved,
}: CaptionDetailProps) {
  const [editCaption, setEditCaption] = useState(image.caption ?? "")
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when image changes or live caption streams in
  useEffect(() => {
    if (isStreaming && liveCaption !== undefined) {
      setEditCaption(liveCaption)
    } else {
      setEditCaption(image.caption ?? "")
    }
    setSaveStatus("idle")
  }, [image.file, isStreaming, liveCaption])

  const handleChange = (value: string) => {
    setEditCaption(value)
    setSaveStatus("saving")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await saveCaption(dirPath, image.file, value)
        setSaveStatus("saved")
        onCaptionSaved?.(image.file, value)
      } catch {
        setSaveStatus("error")
      }
    }, 800)
  }

  return (
    <div className="w-80 shrink-0 sticky top-4 self-start">
      <div className="border border-gray-800 bg-gray-900 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
        {/* Full-size image */}
        <div className="bg-gray-950 border-b border-gray-800 flex items-center justify-center shrink-0 h-full overflow-hidden">
          <img
            src={getImageUrl(dirPath, image.file)}
            alt={image.file}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Info + caption */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-xs font-mono text-gray-300 break-all">
            {image.file}
          </p>
          <p className="text-xs text-gray-500">{image.sizeMB} MB</p>

          <div className="pt-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Caption</span>
              {isStreaming ? (
                <span className="text-xs text-violet-400">streaming…</span>
              ) : saveStatus === "saving" ? (
                <span className="text-xs text-gray-500">saving…</span>
              ) : saveStatus === "saved" ? (
                <span className="text-xs text-green-500">saved</span>
              ) : saveStatus === "error" ? (
                <span className="text-xs text-red-400">save failed</span>
              ) : null}
            </div>

            {isStreaming ? (
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap wrap-break-word max-h-[45vh] overflow-y-auto pr-1">
                {editCaption}
                <span className="animate-pulse">▌</span>
              </p>
            ) : (
              <textarea
                value={editCaption}
                onChange={(e) => handleChange(e.target.value)}
                rows={12}
                className="w-full min-h-40 h-[42vh] max-h-[58vh] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 leading-relaxed focus:outline-none focus:border-violet-500 resize-y font-sans"
                placeholder="No caption yet — type to add one"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
