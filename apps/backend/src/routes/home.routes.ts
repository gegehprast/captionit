import { join } from "node:path"
import { createRoute } from "@bunkit/server"

createRoute("GET", "/")
  .openapi({
    operationId: "home",
    summary: "Home page",
    description:
      "Serves the frontend app in production or the API welcome page in dev",
    tags: ["General"],
  })
  .handler(async ({ res }) => {
    const dir = process.env.STATIC_DIR ?? join(import.meta.dir, "../../public")
    const index = Bun.file(join(dir, "index.html"))
    if (await index.exists()) {
      return new Response(index, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      })
    }

    return res.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CaptionIt API</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { color: #333; }
    .links { margin-top: 2rem; }
    .links a { display: inline-block; margin-right: 1rem; padding: 0.5rem 1rem; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
    .links a:hover { background: #0056b3; }
  </style>
</head>
<body>
  <h1>CaptionIt API</h1>
  <p>Run <code>bun run build</code> then <code>bun run start</code> to serve the full app.</p>
  <div class="links">
    <a href="/docs">API Documentation</a>
    <a href="/openapi.json">OpenAPI Spec</a>
    <a href="/api/health">Health Check</a>
  </div>
</body>
</html>
    `)
  })
