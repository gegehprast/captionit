import { useState } from "react"
import type { CaptionMode } from "../lib/captioningApi"
import { DirectoryBrowser } from "./DirectoryBrowser"

interface CaptioningFormProps {
  onScan: (dirPath: string) => void
  onStart: (dirPath: string, mode: CaptionMode, filesFilter?: string[]) => void
  onStop: () => void
  isScanning: boolean
  isStreaming: boolean
  dirPath: string
  onDirPathChange: (v: string) => void
  /** Files to caption (from selection in the image list). Undefined = all. */
  selectedFiles?: string[]
}

export function CaptioningForm({
  onScan,
  onStart,
  onStop,
  isScanning,
  isStreaming,
  dirPath,
  onDirPathChange,
  selectedFiles,
}: CaptioningFormProps) {
  const [mode, setMode] = useState<CaptionMode>("store")

  const busy = isScanning || isStreaming

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">Dataset Directory</h2>

      <DirectoryBrowser
        value={dirPath}
        onChange={onDirPathChange}
        onNavigate={onScan}
        disabled={busy}
      />

      <div className="flex items-end gap-4">
        <div className="w-56">
          <label className="block text-sm text-gray-400 mb-1" htmlFor="mode">
            Mode
          </label>
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as CaptionMode)}
            disabled={busy}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 disabled:opacity-50"
          >
            <option value="store">Store (skip existing)</option>
            <option value="replace">Replace (overwrite all)</option>
            <option value="append">Append (add to existing)</option>
          </select>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onScan(dirPath)}
            disabled={!dirPath || busy}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? "Reloading…" : "Reload"}
          </button>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onStart(
                  dirPath,
                  mode,
                  selectedFiles?.length ? selectedFiles : undefined,
                )
              }
              disabled={!dirPath || busy}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedFiles?.length
                ? `Caption Selected (${selectedFiles.length})`
                : "Caption All"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
