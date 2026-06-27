import { basename, extname, join } from "node:path"
import { logger } from "@/core/logger"
import {
  type CaptionMode,
  type ImageFile,
  streamCaption,
  writeCaptionFile,
} from "./captioning.service"

export type CaptioningEvent =
  | { type: "start"; total: number }
  | { type: "image"; file: string; index: number; sizeMB: string }
  | { type: "token"; delta: string }
  | { type: "done"; file: string; caption: string }
  | { type: "skip"; file: string }
  | { type: "error"; file: string; message: string }
  | { type: "summary"; captioned: number; skipped: number; failed: number }

export interface SessionEvent {
  id: number
  data: CaptioningEvent
}

export type SessionStatus = "running" | "done" | "stopped"

export interface SessionState {
  id: string
  status: SessionStatus
  total: number
  captioned: number
  skipped: number
  failed: number
}

interface Session {
  id: string
  ac: AbortController
  events: SessionEvent[]
  subscribers: Set<(event: SessionEvent) => void>
  status: SessionStatus
  total: number
  captioned: number
  skipped: number
  failed: number
}

export interface StartSessionOptions {
  sessionId: string
  images: ImageFile[]
  resolvedDir: string
  mode: CaptionMode
  resolvedBaseURL: string
  resolvedApiKey: string
  modelName: string
  instruction: string
  maxResolution: number
}

const sessions = new Map<string, Session>()

export function getSessionState(sessionId: string): SessionState | undefined {
  const s = sessions.get(sessionId)
  if (!s) return undefined
  return {
    id: s.id,
    status: s.status,
    total: s.total,
    captioned: s.captioned,
    skipped: s.skipped,
    failed: s.failed,
  }
}

export function subscribeToSession(
  sessionId: string,
  fromEventId: number,
  onEvent: (event: SessionEvent) => void,
  onClose: () => void,
): (() => void) | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined

  // Replay missed events
  for (const event of session.events) {
    if (event.id > fromEventId) onEvent(event)
  }

  // If already done, close immediately
  if (session.status !== "running") {
    onClose()
    return () => {}
  }

  // Subscribe for future events
  const subscriber = (event: SessionEvent) => {
    onEvent(event)
    if (event.data.type === "summary") onClose()
  }
  session.subscribers.add(subscriber)

  return () => session.subscribers.delete(subscriber)
}

export function stopSession(sessionId: string): boolean {
  const session = sessions.get(sessionId)
  if (!session || session.status !== "running") return false
  session.ac.abort()
  return true
}

export function startSession(options: StartSessionOptions): Session {
  const {
    sessionId,
    images,
    resolvedDir,
    mode,
    resolvedBaseURL,
    resolvedApiKey,
    modelName,
    instruction,
    maxResolution,
  } = options

  const ac = new AbortController()
  const session: Session = {
    id: sessionId,
    ac,
    events: [],
    subscribers: new Set(),
    status: "running",
    total: images.length,
    captioned: 0,
    skipped: 0,
    failed: 0,
  }
  sessions.set(sessionId, session)

  const emit = (data: CaptioningEvent) => {
    const event: SessionEvent = { id: session.events.length + 1, data }
    session.events.push(event)
    for (const sub of [...session.subscribers]) {
      try {
        sub(event)
      } catch {
        session.subscribers.delete(sub)
      }
    }
  }

  // Run processing detached from any HTTP connection
  ;(async () => {
    try {
      emit({ type: "start", total: images.length })
      logger.info("Captioning session started", {
        sessionId,
        total: images.length,
        mode,
        model: modelName,
        baseURL: resolvedBaseURL,
        maxResolution,
      })

      for (const image of images) {
        if (session.ac.signal.aborted) break

        const imagePath = join(resolvedDir, image.file)
        const txtPath = join(
          resolvedDir,
          `${basename(image.file, extname(image.file))}.txt`,
        )

        if (mode === "store" && image.hasCaption) {
          logger.debug("Skipping already-captioned image", { file: image.file })
          emit({ type: "skip", file: image.file })
          session.skipped++
          continue
        }

        emit({
          type: "image",
          file: image.file,
          index: images.indexOf(image) + 1,
          sizeMB: image.sizeMB,
        })

        logger.info("Captioning image", {
          file: image.file,
          index: images.indexOf(image) + 1,
          total: images.length,
        })

        try {
          let caption = ""
          for await (const token of streamCaption(
            imagePath,
            resolvedBaseURL,
            resolvedApiKey,
            modelName,
            instruction,
            maxResolution,
          )) {
            caption += token
            emit({ type: "token", delta: token })
          }

          caption = caption.trim()
          if (!caption) {
            emit({
              type: "error",
              file: image.file,
              message: "Empty response from API",
            })
            session.failed++
            continue
          }

          const writeResult = await writeCaptionFile(txtPath, caption, mode)
          if (writeResult.isErr()) {
            emit({
              type: "error",
              file: image.file,
              message: writeResult.error.message,
            })
            session.failed++
            continue
          }

          emit({ type: "done", file: image.file, caption })
          logger.info("Caption saved", {
            file: image.file,
            captionLength: caption.length,
          })
          session.captioned++
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          logger.error("Captioning failed", { file: image.file, error: e })
          emit({ type: "error", file: image.file, message })
          session.failed++
        }
      }
    } catch (e) {
      logger.error("Unexpected error in captioning session", {
        sessionId,
        error: e,
      })
    } finally {
      emit({
        type: "summary",
        captioned: session.captioned,
        skipped: session.skipped,
        failed: session.failed,
      })
      session.status = session.ac.signal.aborted ? "stopped" : "done"
      logger.info("Captioning session complete", {
        sessionId,
        captioned: session.captioned,
        skipped: session.skipped,
        failed: session.failed,
      })
      // Keep session in memory for 10 minutes for late reconnects
      setTimeout(() => sessions.delete(sessionId), 10 * 60 * 1000)
    }
  })()

  return session
}
