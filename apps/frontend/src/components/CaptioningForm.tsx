import { useState } from "react"
import type { CaptionMode } from "../lib/captioningApi"
import { DirectoryBrowser } from "./DirectoryBrowser"

interface CaptioningFormProps {
  onScan: (dirPath: string) => void
  onStart: (dirPath: string, mode: CaptionMode, filesFilter?: string[]) => void
  onStop: () => void
  isStopPending: boolean
  onClearSelection: () => void
  isScanning: boolean
  isStreaming: boolean
  dirPath: string
  onDirPathChange: (v: string) => void
  selectedFiles?: string[]
}

export function CaptioningForm({
  onScan,
  onStart,
  onStop,
  isStopPending,
  onClearSelection,
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

      <div className="flex gap-3 flex-wrap">
        <div className="w-52">
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as CaptionMode)}
            disabled={busy}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-pink-500 disabled:opacity-50 text-sm"
          >
            <option value="store">Store (skip existing)</option>
            <option value="replace">Replace (overwrite all)</option>
            <option value="append">Append (add to existing)</option>
          </select>
        </div>

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopPending}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isStopPending ? "Stopping..." : "Stop"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onStart(dirPath, mode, undefined)}
              disabled={!dirPath || busy}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Caption All
            </button>
            {selectedFiles && selectedFiles.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => onStart(dirPath, mode, selectedFiles)}
                  disabled={!dirPath || busy}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Caption Selected ({selectedFiles.length})
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={busy}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Selection
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
