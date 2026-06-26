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
}

export type CaptioningEvent =
  | { type: "start"; total: number }
  | { type: "image"; file: string; index: number; sizeMB: string }
  | { type: "token"; delta: string }
  | { type: "done"; file: string; caption: string }
  | { type: "skip"; file: string }
  | { type: "error"; file: string; message: string }
  | { type: "summary"; captioned: number; skipped: number; failed: number }

export interface BrowseResult {
  path: string
  breadcrumbs: { name: string; path: string }[]
  dirs: string[]
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
  const res = await fetch(`${BASE_URL}/api/captioning/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dirPath, filesFilter }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((body as { message?: string }).message ?? res.statusText)
  }
  return res.json() as Promise<ScanResult>
}

export async function getCaptioningConfig(): Promise<CaptioningConfig> {
  const res = await fetch(`${BASE_URL}/api/captioning/config`)
  if (!res.ok) throw new Error("Failed to load config")
  return res.json() as Promise<CaptioningConfig>
}

export interface StreamCaptioningOptions {
  dirPath: string
  mode: CaptionMode
  filesFilter?: string[]
  onEvent: (event: CaptioningEvent) => void
  signal: AbortSignal
}

export function getImageUrl(dirPath: string, file: string): string {
  const filePath = `${dirPath.replace(/\/$/, "")}/${file}`
  return `${BASE_URL}/api/captioning/image?path=${encodeURIComponent(filePath)}`
}

export async function streamCaptioning({
  dirPath,
  mode,
  filesFilter,
  onEvent,
  signal,
}: StreamCaptioningOptions): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/captioning/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dirPath, mode, filesFilter }),
    signal,
  })

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((body as { message?: string }).message ?? res.statusText)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""

    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith("data: ")) continue
      try {
        const event = JSON.parse(line.slice(6)) as CaptioningEvent
        onEvent(event)
      } catch {
        // ignore malformed lines
      }
    }
  }
}
