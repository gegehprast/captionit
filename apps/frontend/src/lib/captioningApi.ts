import { apiClient } from "./api-client"

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001"

export type CaptionMode = "store" | "append" | "replace"

export interface ImageFile {
  file: string
  hasCaption: boolean
  caption: string | null
  sizeMB: string
}

export interface ScanResult {
  dirPath: string
  images: ImageFile[]
  total: number
}

export interface CaptioningConfig {
  serviceHost: string
  modelName: string
  instruction: string
  maxResolution: number
}

export interface CaptioningSettings {
  serviceHost: string
  apiKey: string
  modelName: string
  instruction: string
  maxResolution: number
}

export type CaptioningEvent =
  | { type: "start"; total: number }
  | { type: "image"; file: string; index: number; sizeMB: string }
  | { type: "token"; delta: string }
  | { type: "done"; file: string; caption: string }
  | { type: "skip"; file: string }
  | { type: "error"; file: string; message: string }
  | { type: "summary"; captioned: number; skipped: number; failed: number }

export type SessionStatus = "running" | "done" | "stopped"

export interface SessionState {
  id: string
  status: SessionStatus
  total: number
  captioned: number
  skipped: number
  failed: number
}

export interface BrowseResult {
  path: string
  breadcrumbs: { name: string; path: string }[]
  dirs: string[]
  imageCount: number
}

export async function browseDirectory(path: string): Promise<BrowseResult> {
  const res = await fetch(
    `${BASE_URL}/api/captioning/browse?path=${encodeURIComponent(path)}`,
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((body as { message?: string }).message ?? res.statusText)
  }
  return res.json() as Promise<BrowseResult>
}

export async function scanDirectory(
  dirPath: string,
  filesFilter?: string[],
): Promise<ScanResult> {
  const { data, error } = await apiClient.POST("/api/captioning/scan", {
    body: { dirPath, filesFilter },
  })
  if (error)
    throw new Error((error as { message?: string }).message ?? "Scan failed")
  return data as ScanResult
}

export async function getCaptioningConfig(): Promise<CaptioningConfig> {
  const { data, error } = await apiClient.GET("/api/captioning/config")
  if (error) throw new Error("Failed to load config")
  return data as CaptioningConfig
}

export async function saveCaption(
  dirPath: string,
  file: string,
  caption: string,
): Promise<void> {
  const imagePath = `${dirPath.replace(/\/$/, "")}/${file}`
  const { error } = await apiClient.PUT("/api/captioning/caption", {
    body: { imagePath, caption },
  })
  if (error)
    throw new Error((error as { message?: string }).message ?? "Save failed")
}

export async function startCaptioningSession(
  dirPath: string,
  mode: CaptionMode,
  settings: CaptioningSettings,
  filesFilter?: string[],
): Promise<string> {
  const sessionId = crypto.randomUUID()
  const { error } = await apiClient.POST("/api/captioning/start", {
    body: {
      dirPath,
      mode,
      filesFilter,
      sessionId,
      ...(settings.serviceHost ? { serviceHost: settings.serviceHost } : {}),
      ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
      ...(settings.modelName ? { modelName: settings.modelName } : {}),
      ...(settings.instruction ? { instruction: settings.instruction } : {}),
      ...(settings.maxResolution
        ? { maxResolution: settings.maxResolution }
        : {}),
    },
  })
  if (error)
    throw new Error(
      (error as { message?: string }).message ?? "Failed to start",
    )
  return sessionId
}

export async function getCaptioningSession(
  sessionId: string,
): Promise<SessionState | null> {
  const res = await fetch(
    `${BASE_URL}/api/captioning/session?sessionId=${encodeURIComponent(sessionId)}`,
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Failed to get session")
  return res.json() as Promise<SessionState>
}

export async function stopCaptioningSession(sessionId: string): Promise<void> {
  await apiClient.POST("/api/captioning/stop", { body: { sessionId } })
}

export interface ConnectToSessionOptions {
  sessionId: string
  onEvent: (event: CaptioningEvent) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (msg: string) => void
}

/**
 * Connect to a captioning session via EventSource (SSE).
 * EventSource automatically reconnects on network drops and sends Last-Event-ID
 * so the backend can replay missed events.
 *
 * Returns a cleanup function that closes the connection.
 */
export function connectToSession({
  sessionId,
  onEvent,
  onOpen,
  onClose,
  onError,
}: ConnectToSessionOptions): () => void {
  const url = `${BASE_URL}/api/captioning/events?sessionId=${encodeURIComponent(sessionId)}`
  const es = new EventSource(url)

  // Tracks whether we should suppress onClose in onerror.
  // Set to true on: (1) page unload — so localStorage is preserved for reload,
  // (2) clean summary receipt, (3) manual disconnect.
  let done = false

  const onBeforeUnload = () => {
    done = true
  }
  window.addEventListener("beforeunload", onBeforeUnload)

  es.onopen = () => onOpen?.()

  es.onmessage = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data as string) as CaptioningEvent
      onEvent(event)
      if (event.type === "summary") {
        done = true
        window.removeEventListener("beforeunload", onBeforeUnload)
        es.close()
        onClose?.()
      }
    } catch {
      // ignore malformed events
    }
  }

  es.onerror = () => {
    // CLOSED state means: (a) es.close() called, (b) server returned non-2xx, or (c) page unload.
    // We only want onClose for case (b). The done flag covers (a) and (c).
    // Reconnecting errors have readyState === CONNECTING — ignore those.
    if (es.readyState === EventSource.CLOSED && !done) {
      window.removeEventListener("beforeunload", onBeforeUnload)
      onError?.("Connection closed")
      onClose?.()
    }
  }

  return () => {
    done = true
    window.removeEventListener("beforeunload", onBeforeUnload)
    es.close()
    // Intentionally not calling onClose — manual disconnect preserves localStorage
    // so a hard navigation can still reconnect.
  }
}

export function getImageUrl(dirPath: string, file: string): string {
  const filePath = `${dirPath.replace(/\/$/, "")}/${file}`
  return `${BASE_URL}/api/captioning/image?path=${encodeURIComponent(filePath)}`
}
