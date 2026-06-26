export const DEFAULT_INSTRUCTION = `You are an expert AI image captioner. Write a concise, natural language paragraph describing the image.

Describe:
1. The subject's appearance (clothing, hair, pose)
2. Facial expression and gaze direction
3. Background and environment
4. Lighting
5. Camera angle
6. Whether the image is SFW, suggestive, or NSFW and why`

export const captioningConfig = {
  SERVICE_API_KEY: process.env.SERVICE_API_KEY ?? "",
  SERVICE_HOST: process.env.SERVICE_HOST ?? "",
  MODEL_NAME: process.env.MODEL_NAME ?? "gemma-4-uncensored",
  INSTRUCTION: process.env.CAPTIONING_INSTRUCTION ?? DEFAULT_INSTRUCTION,
} as const
