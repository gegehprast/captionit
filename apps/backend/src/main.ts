import z from "zod"
import "@/types"
import { config } from "@/config"
import { captioningConfig } from "@/config/captioning"
import { logger } from "@/core/logger"
import { shutdownManager } from "@/core/shutdown-manager"
import { server } from "./core/server"

// Clear z.globalRegistry to avoid duplicate schema IDs on hot reload
// There must be a better way to handle this.
z.globalRegistry.clear()

async function main() {
  logger.info("🚀 Starting CaptionIt...")
  logger.debug("Environment configuration", {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    host: config.HOST,
    logLevel: config.LOG_LEVEL,
  })

  // Fail fast if required captioning env vars are missing
  if (!captioningConfig.SERVICE_API_KEY) {
    logger.error("Missing required environment variable: SERVICE_API_KEY")
    process.exit(1)
  }
  if (!captioningConfig.SERVICE_HOST) {
    logger.error("Missing required environment variable: SERVICE_HOST")
    process.exit(1)
  }

  await import("@/routes")

  try {
    // Setup graceful shutdown handlers
    shutdownManager.setupSignalHandlers()
    shutdownManager.setupErrorHandlers()

    // Register cleanup handlers
    shutdownManager.onShutdown("main-cleanup", async () => {
      logger.info("Stopping server...")
      const stopServerResult = await server.stop()
      if (stopServerResult.isErr()) {
        logger.error("Error stopping server", {
          error: stopServerResult.error,
        })
      }
    })

    // Start the server
    const serverStartResult = await server.start()
    if (serverStartResult.isErr()) {
      throw serverStartResult.error
    }

    logger.info(`✅ App ready at http://${config.HOST}:${config.PORT}`)
  } catch (error) {
    logger.error("Failed to start application", { error })
    await shutdownManager.shutdown("ERROR")
    process.exit(1)
  }
}

main()
