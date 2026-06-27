import { extname } from "node:path"
import { createRoute } from "@bunkit/server"
import { z } from "zod"
import {
  IMAGE_EXTENSIONS,
  MIME_MAP,
  scanDirectory,
  validatePath,
  writeCaptionFile,
} from "@/captioning/captioning.service"
import {
  getSessionState,
  startSession,
  stopSession,
  subscribeToSession,
} from "@/captioning/captioning.session"
import { captioningConfig } from "@/config/captioning"
import { logger } from "@/core/logger"

// --- Shared Schemas ---

const ImageFileSchema = z
  .object({
    file: z.string().meta({ example: "photo01.jpg" }),
    hasCaption: z.boolean().meta({ example: true }),
    caption: z.string().nullable().meta({ example: "A woman standing..." }),
    sizeMB: z.string().meta({ example: "1.24" }),
  })
  .meta({ id: "ImageFile", title: "Image File" })

const ScanBodySchema = z
  .object({
    dirPath: z.string().min(1).meta({ example: "/home/user/dataset" }),
    filesFilter: z
      .array(z.string())
      .optional()
      .meta({ example: ["photo01.jpg", "photo02.png"] }),
  })
  .meta({ id: "ScanBody", title: "Scan Request Body" })

const ScanResponseSchema = z
  .object({
    dirPath: z.string(),
    images: z.array(ImageFileSchema),
    total: z.number(),
  })
  .meta({ id: "ScanResponse", title: "Scan Response" })

const ConfigResponseSchema = z
  .object({
    serviceHost: z.string(),
    apiKey: z.string(),
    modelName: z.string(),
    instruction: z.string(),
    maxResolution: z.number(),
  })
  .meta({ id: "ConfigResponse", title: "Captioning Config" })

// --- Routes ---

/**
 * GET /api/captioning/browse?path=<dir>
 * List subdirectories for path traversal in the UI.
 */
createRoute("GET", "/api/captioning/browse")
  .openapi({
    operationId: "browseDirectory",
    summary: "Browse directories",
    description:
      "List subdirectories of a given path for interactive traversal",
    tags: ["Captioning"],
  })
  .excludeFromDocs()
  .handler(async ({ req }) => {
    const url = new URL(req.url)
    const rawPath = url.searchParams.get("path") ?? "/"

    const pathResult = validatePath(rawPath)
    if (pathResult.isErr()) {
      return new Response(
        JSON.stringify({ message: pathResult.error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const resolvedPath = pathResult.value
    const { readdir, stat } = await import("node:fs/promises")
    const { join: pathJoin } = await import("node:path")

    try {
      await stat(resolvedPath)
    } catch {
      return new Response(
        JSON.stringify({ message: `Directory not found: ${resolvedPath}` }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }

    let entries: string[]
    try {
      entries = await readdir(resolvedPath)
    } catch {
      return new Response(JSON.stringify({ message: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const dirs: string[] = []
    let imageCount = 0
    for (const entry of entries.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    )) {
      try {
        const entryPath = pathJoin(resolvedPath, entry)
        const s = await stat(entryPath)
        if (s.isDirectory() && !entry.startsWith(".")) {
          dirs.push(entry)
        } else if (s.isFile()) {
          const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase()
          if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
            imageCount++
          }
        }
      } catch {
        // skip inaccessible entries
      }
    }

    const segments = resolvedPath === "/" ? [""] : resolvedPath.split("/")
    const breadcrumbs = segments.map((seg, i) => ({
      name: seg === "" ? "/" : seg,
      path: i === 0 ? "/" : segments.slice(0, i + 1).join("/"),
    }))

    return new Response(
      JSON.stringify({ path: resolvedPath, breadcrumbs, dirs, imageCount }),
      { headers: { "Content-Type": "application/json" } },
    )
  })

/**
 * POST /api/captioning/scan
 * Scan a directory and return image list with caption status.
 */
createRoute("POST", "/api/captioning/scan")
  .openapi({
    operationId: "scanDirectory",
    summary: "Scan directory",
    description:
      "Scan a local directory for images and return their caption status",
    tags: ["Captioning"],
  })
  .body(ScanBodySchema)
  .response(ScanResponseSchema)
  .handler(async ({ body, res }) => {
    const result = await scanDirectory(body.dirPath, body.filesFilter)

    if (result.isErr()) {
      const e = result.error
      return new Response(
        JSON.stringify({ message: e.message, code: e.code }),
        {
          status: e.statusCode,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    return res.ok({
      dirPath: body.dirPath,
      images: result.value,
      total: result.value.length,
    })
  })

/**
 * GET /api/captioning/config
 * Return the active service configuration.
 */
createRoute("GET", "/api/captioning/config")
  .openapi({
    operationId: "getCaptioningConfig",
    summary: "Get captioning config",
    description: "Returns the current service host, model, and instruction",
    tags: ["Captioning"],
  })
  .response(ConfigResponseSchema)
  .handler(({ res }) => {
    return res.ok({
      serviceHost: captioningConfig.DEFAULT_SERVICE_HOST,
      apiKey: captioningConfig.DEFAULT_SERVICE_API_KEY,
      modelName: captioningConfig.DEFAULT_MODEL_NAME,
      instruction: captioningConfig.DEFAULT_INSTRUCTION,
      maxResolution: captioningConfig.DEFAULT_MAX_RESOLUTION,
    })
  })

/**
 * GET /api/captioning/image?path=<absolute-path>
 * Serve a local image file by absolute path for display in the UI.
 */
createRoute("GET", "/api/captioning/image")
  .openapi({
    operationId: "getImage",
    summary: "Serve local image",
    description: "Serves a local image file by absolute path",
    tags: ["Captioning"],
  })
  .excludeFromDocs()
  .handler(async ({ req }) => {
    const url = new URL(req.url)
    const filePath = url.searchParams.get("path")

    if (!filePath) {
      return new Response(
        JSON.stringify({ message: "Missing path query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const pathResult = validatePath(filePath)
    if (pathResult.isErr()) {
      return new Response(
        JSON.stringify({ message: pathResult.error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const ext = extname(filePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return new Response(JSON.stringify({ message: "Not an image file" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const file = Bun.file(pathResult.value)
    if (!(await file.exists())) {
      return new Response(JSON.stringify({ message: "File not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    const mime = MIME_MAP[ext] ?? "image/jpeg"
    return new Response(file, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
      },
    })
  })

/**
 * PUT /api/captioning/caption
 * Overwrite the .txt caption file for a given image.
 */
createRoute("PUT", "/api/captioning/caption")
  .openapi({
    operationId: "saveCaption",
    summary: "Save caption",
    description: "Overwrite the caption .txt file for an image",
    tags: ["Captioning"],
  })
  .body(
    z
      .object({
        imagePath: z
          .string()
          .min(1)
          .meta({ example: "/home/user/dataset/photo01.jpg" }),
        caption: z.string(),
      })
      .meta({ id: "SaveCaptionBody", title: "Save Caption Body" }),
  )
  .handler(async ({ body, res }) => {
    const pathResult = validatePath(body.imagePath)
    if (pathResult.isErr()) {
      return new Response(
        JSON.stringify({ message: pathResult.error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const imgPath = pathResult.value
    const ext = extname(imgPath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return new Response(JSON.stringify({ message: "Not an image file" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const txtPath = `${imgPath.slice(0, imgPath.length - ext.length)}.txt`
    const result = await writeCaptionFile(txtPath, body.caption, "replace")
    if (result.isErr()) {
      return new Response(JSON.stringify({ message: result.error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    return res.ok({ saved: true })
  })

/**
 * POST /api/captioning/start
 * Validate, scan, and start a captioning session in the background.
 * Returns a sessionId the client uses to subscribe to events.
 */
createRoute("POST", "/api/captioning/start")
  .openapi({
    operationId: "startCaptioning",
    summary: "Start captioning session",
    description:
      "Validates the directory, scans for images, and starts a background captioning session. Returns a sessionId.",
    tags: ["Captioning"],
  })
  .body(
    z
      .object({
        dirPath: z.string().min(1).meta({ example: "/home/user/dataset" }),
        mode: z
          .enum(["store", "append", "replace"])
          .default("store")
          .meta({ example: "store" }),
        filesFilter: z.array(z.string()).optional(),
        serviceHost: z.string().optional(),
        apiKey: z.string().optional(),
        modelName: z.string().optional(),
        instruction: z.string().optional(),
        maxResolution: z.number().int().positive().optional(),
        sessionId: z
          .string()
          .meta({ description: "Client-generated session ID (UUID)" }),
      })
      .meta({ id: "StartBody", title: "Start Captioning Body" }),
  )
  .response(
    z
      .object({ sessionId: z.string() })
      .meta({ id: "StartResponse", title: "Start Captioning Response" }),
  )
  .handler(async ({ body, res }) => {
    const {
      dirPath,
      mode,
      filesFilter,
      serviceHost,
      apiKey,
      modelName,
      instruction,
      maxResolution,
      sessionId,
    } = body as {
      dirPath: string
      mode: "store" | "append" | "replace"
      filesFilter?: string[]
      serviceHost?: string
      apiKey?: string
      modelName?: string
      instruction?: string
      maxResolution?: number
      sessionId: string
    }

    const pathResult = validatePath(dirPath)
    if (pathResult.isErr()) {
      return new Response(
        JSON.stringify({
          message: pathResult.error.message,
          code: pathResult.error.code,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const scanResult = await scanDirectory(dirPath, filesFilter)
    if (scanResult.isErr()) {
      const e = scanResult.error
      return new Response(
        JSON.stringify({ message: e.message, code: e.code }),
        {
          status: e.statusCode,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    startSession({
      sessionId,
      images: scanResult.value,
      resolvedDir: pathResult.value,
      mode,
      resolvedBaseURL: serviceHost ?? captioningConfig.DEFAULT_SERVICE_HOST,
      resolvedApiKey: apiKey || "no-key",
      modelName: modelName ?? captioningConfig.DEFAULT_MODEL_NAME,
      instruction: instruction ?? captioningConfig.DEFAULT_INSTRUCTION,
      maxResolution: maxResolution ?? captioningConfig.DEFAULT_MAX_RESOLUTION,
    })

    logger.info("Captioning session created", { sessionId })
    return res.ok({ sessionId })
  })

/**
 * GET /api/captioning/session?sessionId=<id>
 * Return the current status of a captioning session.
 * Used by the frontend to check if a persisted session is still active on page reload.
 */
createRoute("GET", "/api/captioning/session")
  .openapi({
    operationId: "getCaptioningSession",
    summary: "Get captioning session status",
    description: "Returns the status and progress of a captioning session",
    tags: ["Captioning"],
  })
  .response(
    z
      .object({
        id: z.string(),
        status: z.enum(["running", "done", "stopped"]),
        total: z.number(),
        captioned: z.number(),
        skipped: z.number(),
        failed: z.number(),
      })
      .meta({ id: "SessionState", title: "Session State" }),
  )
  .handler(({ req }) => {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get("sessionId")

    if (!sessionId) {
      return new Response(
        JSON.stringify({ message: "Missing sessionId query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const state = getSessionState(sessionId)
    if (!state) {
      return new Response(JSON.stringify({ message: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify(state), {
      headers: { "Content-Type": "application/json" },
    })
  })

/**
 * GET /api/captioning/events?sessionId=<id>
 * SSE endpoint — subscribe to a captioning session's event stream.
 * Supports reconnection via the Last-Event-ID header (replays missed events).
 *
 * Events: start | image | token | done | skip | error | summary
 */
createRoute("GET", "/api/captioning/events")
  .openapi({
    operationId: "captioningEvents",
    summary: "Subscribe to captioning events",
    description:
      "SSE stream for a captioning session. Supports Last-Event-ID for seamless reconnect.",
    tags: ["Captioning"],
  })
  .excludeFromDocs()
  .handler(({ req }) => {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get("sessionId")

    if (!sessionId) {
      return new Response(
        JSON.stringify({ message: "Missing sessionId query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const lastEventId = parseInt(req.headers.get("Last-Event-ID") ?? "0", 10)

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        const enqueue = (id: number, data: object) => {
          try {
            controller.enqueue(
              encoder.encode(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`),
            )
          } catch {
            // client disconnected
          }
        }

        const unsubscribe = subscribeToSession(
          sessionId,
          lastEventId,
          (event) => enqueue(event.id, event.data),
          () => {
            try {
              controller.close()
            } catch {
              // already closed
            }
          },
        )

        if (!unsubscribe) {
          // Session not found — send an error event so client knows
          enqueue(0, { type: "error", file: "", message: "Session not found" })
          try {
            controller.close()
          } catch {
            // already closed
          }
          return
        }

        // Clean up subscriber when client disconnects
        req.signal.addEventListener("abort", () => {
          unsubscribe()
          try {
            controller.close()
          } catch {
            // already closed
          }
        })
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  })

/**
 * POST /api/captioning/stop
 * Signal a running session to stop after the current image finishes.
 */
createRoute("POST", "/api/captioning/stop")
  .openapi({
    operationId: "stopCaptioning",
    summary: "Stop captioning session",
    description:
      "Signals a running captioning session to stop after the current image",
    tags: ["Captioning"],
  })
  .body(
    z
      .object({ sessionId: z.string() })
      .meta({ id: "StopBody", title: "Stop Request Body" }),
  )
  .handler(({ body, res }) => {
    stopSession(body.sessionId)
    return res.ok({ ok: true })
  })
