import { useCallback, useEffect, useRef, useState } from "react"
import { type BrowseResult, browseDirectory } from "../lib/captioningApi"

interface DirectoryBrowserProps {
  value: string
  onChange: (path: string) => void
  /** Called when the user navigates by clicking a breadcrumb or subdirectory. */
  onNavigate?: (path: string) => void
  disabled?: boolean
}

export function DirectoryBrowser({
  value,
  onChange,
  onNavigate,
  disabled = false,
}: DirectoryBrowserProps) {
  const [browse, setBrowse] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (path: string, navigate = false) => {
      setLoading(true)
      setError(null)
      try {
        const result = await browseDirectory(path)
        setBrowse(result)
        onChange(result.path)
        setInputValue(result.path)
        if (navigate) {
          onNavigate?.(result.path)
          // Close dropdown if no subdirs remain and there are images here
          if (result.dirs.length === 0 && result.imageCount > 0) setOpen(false)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [onChange, onNavigate],
  )

  // Load root on first mount if no value provided
  useEffect(() => {
    if (!browse && !value) {
      load("/home")
    }
  }, []) // intentionally only runs on mount

  // Close when clicking outside the component
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") load(inputValue, true)
    if (e.key === "Escape") setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Manual path input + Go */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setOpen(true)}
          placeholder="/home/user/dataset"
          disabled={disabled}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 disabled:opacity-50 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => load(inputValue, true)}
          disabled={disabled || loading}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "…" : "Go / Reload"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

      {open && browse && (
        <div
          role="listbox"
          aria-label="Directory listing"
          className="absolute z-30 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl"
        >
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-700 overflow-x-auto">
            {browse.breadcrumbs.map((crumb, i) => (
              <span
                key={crumb.path}
                className="flex items-center gap-1 shrink-0"
              >
                {i > 0 && <span className="text-gray-600">/</span>}
                <button
                  type="button"
                  onClick={() => load(crumb.path, true)}
                  disabled={disabled}
                  className="text-xs text-pink-400 hover:text-pink-300 transition-colors disabled:opacity-50 font-mono"
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          {/* Subdirectory list */}
          {browse.dirs.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500 italic">
              No subdirectories
            </p>
          ) : (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-700/50">
              {browse.dirs.map((dir) => {
                const childPath = `${browse.path === "/" ? "" : browse.path}/${dir}`
                return (
                  <li key={dir}>
                    <button
                      type="button"
                      onClick={() => load(childPath, true)}
                      disabled={disabled}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2 font-mono"
                    >
                      <span className="text-gray-500">📁</span>
                      {dir}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
