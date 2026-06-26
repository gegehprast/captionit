import { ERROR_CODES } from "@/config/constants"
import { AppError } from "@/core/errors"

export class DirectoryNotFoundError extends AppError {
  public constructor(path: string) {
    super(`Directory not found: ${path}`, ERROR_CODES.DIRECTORY_NOT_FOUND, 404)
  }
}

export class DirectoryAccessError extends AppError {
  public constructor(path: string) {
    super(
      `Access denied to directory: ${path}`,
      ERROR_CODES.DIRECTORY_ACCESS_DENIED,
      403,
    )
  }
}

export class ImageReadError extends AppError {
  public constructor(file: string, details?: unknown) {
    super(
      `Failed to read image: ${file}`,
      ERROR_CODES.IMAGE_READ_ERROR,
      500,
      details,
    )
  }
}

export class CaptioningApiError extends AppError {
  public constructor(message: string, details?: unknown) {
    super(message, ERROR_CODES.CAPTIONING_API_ERROR, 502, details)
  }
}

export class InvalidPathError extends AppError {
  public constructor(message = "Invalid or unsafe path provided") {
    super(message, ERROR_CODES.INVALID_PATH, 400)
  }
}
