import { extname, join, normalize } from "node:path"
import { createRoute } from "@bunkit/server"

function publicDir(): string {
  return process.env.STATIC_DIR ?? join(import.meta.dir, "../../public")
}

async function serveStatic(pathname: string): Promise<Response> {
  const dir = publicDir()
  const safe = normalize(pathname)

  // Security: prevent path traversal
  const resolved = join(dir, safe)
  if (!resolved.startsWith(normalize(dir))) {
    return new Response("Forbidden", { status: 403 })
  }

  const file = Bun.file(resolved)
  if (await file.exists()) {
    const isImmutable = /\.[a-f0-9]{8,}\.(js|css|woff2?)$/.test(resolved)
    const headers: Record<string, string> = {}
    if (isImmutable)
      headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return new Response(file, { headers })
  }

  // SPA fallback: serve index.html for paths without a file extension
  if (!extname(pathname)) {
    const index = Bun.file(join(dir, "index.html"))
    if (await index.exists()) {
      return new Response(index, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      })
    }
  }

  return new Response(JSON.stringify({ message: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  })
}

createRoute("GET", "/:path*")
  .excludeFromDocs()
  .handler(({ params }) => serveStatic(`/${params.path as string}`))
