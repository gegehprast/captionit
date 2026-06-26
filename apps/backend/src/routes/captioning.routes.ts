import { basename, extname, join } from "node:path"
import { createRoute } from "@bunkit/server"
import { z } from "zod"
import {
  type CaptionMode,
  IMAGE_EXTENSIONS,
  MIME_MAP,
  scanDirectory,
  streamCaption,
  validatePath,
  writeCaptionFile,
} from "@/captioning/captioning.service"
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
    modelName: z.string(),
    instruction: z.string(),
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

    // Build breadcrumb segments from the resolved path
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
      modelName: captioningConfig.DEFAULT_MODEL_NAME,
      instruction: captioningConfig.DEFAULT_INSTRUCTION,
    })
  })

/**
 * GET /api/captioning/image?path=<absolute-path>
 * Serve a local image file by absolute path for display in the UI.
 * Only files with recognised image extensions are served.
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
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const pathResult = validatePath(filePath)
    if (pathResult.isErr()) {
      return new Response(
        JSON.stringify({ message: pathResult.error.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
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

    const txtPath = join(`${imgPath.slice(0, imgPath.length - ext.length)}.txt`)
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
 * POST /api/captioning/stream
 * SSE endpoint — captions images in a directory and streams progress events.
 *
 * Body: { dirPath, mode, filesFilter? }
 * Events: start | image | token | done | skip | error | summary
 */
createRoute("POST", "/api/captioning/stream")
  .openapi({
    operationId: "streamCaptioning",
    summary: "Stream captioning",
    description: "Caption images in a directory with real-time SSE progress",
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
      })
      .meta({ id: "StreamBody", title: "Stream Request Body" }),
  )
  .handler(async ({ body, req }) => {
    const {
      dirPath,
      mode,
      filesFilter,
      serviceHost,
      apiKey,
      modelName,
      instruction,
    } = body as {
      dirPath: string
      mode: CaptionMode
      filesFilter?: string[]
      serviceHost?: string
      apiKey?: string
      modelName?: string
      instruction?: string
    }

    // Validate path upfront
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

    const images = scanResult.value
    const resolvedApiKey =
      (apiKey ?? captioningConfig.DEFAULT_SERVICE_API_KEY) || "no-key"
    const resolvedBaseURL = serviceHost ?? captioningConfig.DEFAULT_SERVICE_HOST

    function sseEvent(data: object): string {
      return `data: ${JSON.stringify(data)}\n\n`
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (data: object) => {
          try {
            controller.enqueue(new TextEncoder().encode(sseEvent(data)))
          } catch {
            // client disconnected
          }
        }

        enqueue({ type: "start", total: images.length })

        let captioned = 0
        let skipped = 0
        let failed = 0

        for (const image of images) {
          // Abort if client closed connection
          if (req.signal.aborted) break

          const resolvedDir = pathResult.value
          const imagePath = join(resolvedDir, image.file)
          const txtPath = join(
            resolvedDir,
            `${basename(image.file, extname(image.file))}.txt`,
          )

          // In "store" mode, skip already-captioned images
          if (mode === "store" && image.hasCaption) {
            enqueue({ type: "skip", file: image.file })
            skipped++
            continue
          }

          enqueue({
            type: "image",
            file: image.file,
            index: images.indexOf(image) + 1,
            sizeMB: image.sizeMB,
          })

          try {
            let caption = ""
            for await (const token of streamCaption(
              imagePath,
              resolvedBaseURL,
              resolvedApiKey,
              modelName ?? captioningConfig.DEFAULT_MODEL_NAME,
              instruction ?? captioningConfig.DEFAULT_INSTRUCTION,
            )) {
              if (req.signal.aborted) break
              caption += token
              enqueue({ type: "token", delta: token })
            }

            caption = caption.trim()
            if (!caption) {
              enqueue({
                type: "error",
                file: image.file,
                message: "Empty response from API",
              })
              failed++
              continue
            }

            const writeResult = await writeCaptionFile(txtPath, caption, mode)
            if (writeResult.isErr()) {
              enqueue({
                type: "error",
                file: image.file,
                message: writeResult.error.message,
              })
              failed++
              continue
            }

            enqueue({ type: "done", file: image.file, caption })
            captioned++
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            logger.error("Captioning failed", { file: image.file, error: e })
            enqueue({ type: "error", file: image.file, message })
            failed++
          }
        }

        enqueue({ type: "summary", captioned, skipped, failed })
        controller.close()
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
