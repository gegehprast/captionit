import { useEffect, useState } from "react"
import {
  type CaptioningSettings,
  getCaptioningConfig,
} from "../lib/captioningApi"

interface SettingsSidebarProps {
  open: boolean
  onClose: () => void
  settings: CaptioningSettings
  onChange: (settings: CaptioningSettings) => void
  disabled?: boolean
}

export function SettingsSidebar({
  open,
  onClose,
  settings,
  onChange,
  disabled = false,
}: SettingsSidebarProps) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingDefaults, setLoadingDefaults] = useState(false)

  const loadDefaults = async () => {
    setLoadingDefaults(true)
    setLoadError(null)
    try {
      const cfg = await getCaptioningConfig()
      onChange({
        serviceHost: cfg.serviceHost,
        apiKey: settings.apiKey,
        modelName: cfg.modelName,
        instruction: cfg.instruction,
        maxResolution: cfg.maxResolution,
      })
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load defaults")
    } finally {
      setLoadingDefaults(false)
    }
  }

  // Auto-load defaults when sidebar opens and fields are empty
  useEffect(() => {
    if (
      open &&
      !settings.serviceHost &&
      !settings.modelName &&
      !settings.instruction &&
      !settings.maxResolution
    ) {
      loadDefaults()
    }
  }, [open]) // intentionally only re-runs when open changes

  const set = <K extends keyof CaptioningSettings>(
    key: K,
    value: CaptioningSettings[K],
  ) => onChange({ ...settings, [key]: value })

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-96 bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {/* Service Host */}
          <div className="space-y-1.5">
            <label
              htmlFor="setting-serviceHost"
              className="block text-xs font-medium text-gray-400 uppercase tracking-wide"
            >
              Service Host
            </label>
            <input
              id="setting-serviceHost"
              value={settings.serviceHost}
              onChange={(e) => set("serviceHost", e.target.value)}
              disabled={disabled}
              placeholder="https://api.venice.ai/api/v1"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 disabled:opacity-50 font-mono text-sm"
            />
            <p className="text-xs text-gray-600">
              Base URL of any OpenAI-compatible API
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label
              htmlFor="setting-apiKey"
              className="block text-xs font-medium text-gray-400 uppercase tracking-wide"
            >
              API Key
            </label>
            <input
              id="setting-apiKey"
              value={settings.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              disabled={disabled}
              placeholder="Leave blank to use server default"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 disabled:opacity-50 font-mono text-sm"
            />
            <p className="text-xs text-gray-600">
              Overrides the server-side{" "}
              <code className="text-gray-500">SERVICE_API_KEY</code>
            </p>
          </div>

          {/* Model Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="setting-modelName"
              className="block text-xs font-medium text-gray-400 uppercase tracking-wide"
            >
              Model
            </label>
            <input
              id="setting-modelName"
              value={settings.modelName}
              onChange={(e) => set("modelName", e.target.value)}
              disabled={disabled}
              placeholder="gemma-4-uncensored"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 disabled:opacity-50 font-mono text-sm"
            />
          </div>

          {/* Instruction */}
          <div className="space-y-1.5">
            <label
              htmlFor="setting-instruction"
              className="block text-xs font-medium text-gray-400 uppercase tracking-wide"
            >
              Instruction
            </label>
            <textarea
              id="setting-instruction"
              value={settings.instruction}
              onChange={(e) => set("instruction", e.target.value)}
              disabled={disabled}
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 disabled:opacity-50 text-sm resize-y font-mono"
            />
            <p className="text-xs text-gray-600">
              System prompt sent to the model for each image
            </p>
          </div>

          {/* Max Resolution */}
          <div className="space-y-1.5">
            <label
              htmlFor="setting-maxResolution"
              className="block text-xs font-medium text-gray-400 uppercase tracking-wide"
            >
              Max Resolution
            </label>
            <input
              id="setting-maxResolution"
              type="number"
              min={256}
              step={128}
              value={settings.maxResolution || ""}
              onChange={(e) =>
                set(
                  "maxResolution",
                  e.target.value === ""
                    ? 0
                    : Number.parseInt(e.target.value, 10),
                )
              }
              disabled={disabled}
              placeholder="1024"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 disabled:opacity-50 font-mono text-sm"
            />
            <p className="text-xs text-gray-600">
              Images are resized to this max dimension before sending (px).
              Lower = faster.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 shrink-0 space-y-2">
          {loadError && <p className="text-xs text-red-400">{loadError}</p>}
          <button
            type="button"
            onClick={loadDefaults}
            disabled={disabled || loadingDefaults}
            className="w-full px-4 py-2 bg-pink-800 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingDefaults ? "Loading…" : "Load server defaults"}
          </button>
        </div>
      </div>
    </>
  )
}
