import { useCallback, useEffect, useState } from "react"
import { type BrowseResult, browseDirectory } from "../lib/captioningApi"

interface DirectoryBrowserProps {
  value: string
  onChange: (path: string) => void
  disabled?: boolean
}

export function DirectoryBrowser({
  value,
  onChange,
  disabled = false,
}: DirectoryBrowserProps) {
  const [browse, setBrowse] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await browseDirectory(path)
        setBrowse(result)
        onChange(result.path)
        setInputValue(result.path)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [onChange],
  )

  // Load root on first mount if no value provided
  useEffect(() => {
    if (!browse && !value) {
      load("/")
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") load(inputValue)
  }

  return (
    <div className="space-y-2">
      {/* Manual path input + Go */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="/home/user/dataset"
          disabled={disabled}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => load(inputValue)}
          disabled={disabled || loading}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "…" : "Go"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {browse && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
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
                  onClick={() => load(crumb.path)}
                  disabled={disabled}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50 font-mono"
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
                      onClick={() => load(childPath)}
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
