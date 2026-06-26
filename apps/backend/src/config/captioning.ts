export const DEFAULT_INSTRUCTION = `You are an expert AI image captioner preparing a dataset for a Character LoRA. Write a concise, natural language paragraph describing the image.

Describe:
1. The subject's appearance (clothing, hair, pose)
2. Facial expression and gaze direction
3. Background and environment
4. Lighting
5. Camera angle`

export const captioningConfig = {
  DEFAULT_SERVICE_API_KEY: process.env.DEFAULT_SERVICE_API_KEY ?? "",
  DEFAULT_SERVICE_HOST: process.env.DEFAULT_SERVICE_HOST ?? "",
  DEFAULT_MODEL_NAME: process.env.DEFAULT_MODEL_NAME ?? "gemma-4-uncensored",
  DEFAULT_INSTRUCTION:
    process.env.CAPTIONING_INSTRUCTION || DEFAULT_INSTRUCTION,
  DEFAULT_MAX_RESOLUTION: process.env.DEFAULT_MAX_RESOLUTION
    ? Number.parseInt(process.env.DEFAULT_MAX_RESOLUTION, 10)
    : 1024,
} as const
