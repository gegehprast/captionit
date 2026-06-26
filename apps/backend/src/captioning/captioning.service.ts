import { basename, extname, join, resolve } from "node:path"
import { err, ok, type Result } from "@bunkit/result"
import OpenAI, { APIError } from "openai"
import sharp from "sharp"
import type { AppError } from "@/core/errors"
import { logger } from "@/core/logger"
import {
  DirectoryAccessError,
  DirectoryNotFoundError,
  ImageReadError,
  InvalidPathError,
} from "./captioning.errors"

export const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
])

export const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

export type CaptionMode = "store" | "append" | "replace"

export interface ImageFile {
  file: string
  hasCaption: boolean
  caption: string | null
  sizeMB: string
}

/**
 * Validate that a path is absolute and doesn't contain traversal sequences.
 */
export function validatePath(
  dirPath: string,
): Result<string, InvalidPathError> {
  if (!dirPath || dirPath.trim().length === 0) {
    return err(new InvalidPathError("Path must not be empty"))
  }
  const resolved = resolve(dirPath)
  // Reject relative paths by requiring the resolved path to equal an absolute form
  if (resolved !== resolve(resolved)) {
    return err(new InvalidPathError("Path traversal detected"))
  }
  return ok(resolved)
}

/**
 * Scan a directory for images and check for existing caption files.
 */
export async function scanDirectory(
  dirPath: string,
  filesFilter?: string[],
): Promise<Result<ImageFile[], AppError>> {
  const pathResult = validatePath(dirPath)
  if (pathResult.isErr()) return pathResult

  const resolvedPath = pathResult.value

  try {
    // bun:file for directories — use readdir via import
    const { readdir, stat } = await import("node:fs/promises")

    let statResult: Awaited<ReturnType<typeof stat>>
    try {
      statResult = await stat(resolvedPath)
    } catch {
      return err(new DirectoryNotFoundError(resolvedPath))
    }

    if (!statResult.isDirectory()) {
      return err(new DirectoryNotFoundError(resolvedPath))
    }

    let entries: string[]
    try {
      entries = await readdir(resolvedPath)
    } catch {
      return err(new DirectoryAccessError(resolvedPath))
    }

    const imageFiles = entries
      .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
      .filter((f) => !filesFilter || filesFilter.includes(f))
      .sort()

    const results: ImageFile[] = []

    for (const file of imageFiles) {
      const imagePath = join(resolvedPath, file)
      const txtPath = join(resolvedPath, `${basename(file, extname(file))}.txt`)

      const imageFile = Bun.file(imagePath)
      const sizeMB = ((await imageFile.size) / 1024 / 1024).toFixed(2)

      const txtFile = Bun.file(txtPath)
      const hasCaption = await txtFile.exists()
      const caption = hasCaption ? await txtFile.text() : null

      results.push({ file, hasCaption, caption, sizeMB })
    }

    return ok(results)
  } catch {
    return err(new DirectoryAccessError(resolvedPath))
  }
}

/**
 * Stream caption tokens for a single image from the AI API.
 */
export async function* streamCaption(
  imagePath: string,
  baseURL: string,
  apiKey: string,
  model: string,
  instruction: string,
  maxResolution: number,
): AsyncGenerator<string> {
  // sharp always outputs jpeg after resize, so no need to detect mime from ext

  const imageFile = Bun.file(imagePath)
  const rawBuffer = await imageFile.arrayBuffer()
  const originalSizeKB = Math.round(rawBuffer.byteLength / 1024)

  logger.debug("Resizing image", {
    file: basename(imagePath),
    originalSizeKB,
    maxResolution,
  })

  // Resize to maxResolution on the longest side — vision models don't benefit
  // from higher resolution and large images cause very slow encoding in Ollama
  const resized = await sharp(Buffer.from(rawBuffer))
    .resize(maxResolution, maxResolution, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer()

  const resizedSizeKB = Math.round(resized.byteLength / 1024)
  logger.debug("Image resized", {
    file: basename(imagePath),
    originalSizeKB,
    resizedSizeKB,
    reduction: `${Math.round((1 - resized.byteLength / rawBuffer.byteLength) * 100)}%`,
  })

  const base64 = resized.toString("base64")
  const dataUrl = `data:image/jpeg;base64,${base64}`

  const client = new OpenAI({ apiKey, baseURL, timeout: 5 * 60 * 1000 })

  logger.debug("Sending to API", { file: basename(imagePath), model, baseURL })

  const stream = await client.chat.completions.create({
    model,
    stream: true,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  })

  try {
    let tokenCount = 0
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ""
      if (delta) {
        tokenCount++
        yield delta
      }
    }
    logger.debug("API stream complete", {
      file: basename(imagePath),
      tokenCount,
    })
  } catch (e) {
    if (e instanceof APIError) {
      // Surface the real message from Ollama/backend instead of the generic SDK wrapper
      const detail =
        (e.error as { error?: { message?: string } } | undefined)?.error
          ?.message ?? e.message
      throw new Error(detail)
    }
    throw e
  }
}

/**
 * Write a caption to the .txt file next to the image.
 */
export async function writeCaptionFile(
  txtPath: string,
  caption: string,
  mode: CaptionMode,
): Promise<Result<void, AppError>> {
  try {
    if (mode === "append") {
      const existing = Bun.file(txtPath)
      let existingText = ""
      if (await existing.exists()) {
        existingText = await existing.text()
      }
      const separator =
        existingText.length > 0 && !existingText.endsWith("\n") ? "\n" : ""
      await Bun.write(txtPath, `${existingText}${separator}${caption}`)
    } else {
      await Bun.write(txtPath, caption)
    }
    return ok(undefined)
  } catch (e) {
    return err(new ImageReadError(txtPath, e))
  }
}
