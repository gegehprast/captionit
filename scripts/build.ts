import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { $ } from "bun"

const ROOT = join(import.meta.dir, "..")
const BACKEND = join(ROOT, "apps/backend")
const FRONTEND = join(ROOT, "apps/frontend")
const DIST = join(ROOT, "dist")

console.log("🏗  Building CaptionIt...\n")

// 1. Build frontend with empty VITE_API_URL so all requests go to same origin
console.log("📦 Building frontend...")
await $`bun run build`.cwd(FRONTEND).env({ ...process.env, VITE_API_URL: "" })

// 2. Bundle backend JS — exclude sharp (native module, must stay on disk)
console.log("⚙️  Bundling backend...")
const existingEnv = Bun.file(join(DIST, ".env"))
const savedEnv = (await existingEnv.exists()) ? await existingEnv.text() : null
await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })
if (savedEnv !== null) await writeFile(join(DIST, ".env"), savedEnv)

await $`bun build src/main.ts --outfile ${join(DIST, "server.js")} --target=bun --external=sharp`.cwd(
  BACKEND,
)

// 3. Copy frontend dist → dist/public
console.log("📂 Copying frontend assets...")
await cp(join(FRONTEND, "dist"), join(DIST, "public"), { recursive: true })

// 4. Install sharp and its native deps into dist/node_modules
//    bun resolves 'sharp' from dist/node_modules at runtime
console.log("📦 Installing native modules (sharp)...")
await writeFile(
  join(DIST, "package.json"),
  JSON.stringify({
    name: "captionit-dist",
    private: true,
    dependencies: { sharp: "^0.35.2" },
  }),
)
await $`bun install --no-save`.cwd(DIST)

// 5. Create a run script
const runScript = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec env STATIC_DIR="$DIR/public" bun "$DIR/server.js" "$@"
`
await writeFile(join(DIST, "run.sh"), runScript, { mode: 0o755 })

// 6. Copy .env.example
await $`cp ${join(BACKEND, ".env.example")} ${join(DIST, ".env.example")}`

console.log(`
✅ Build complete!

📁 Output: dist/
   server.js      — bundled backend (run with bun)
   public/        — frontend assets
   node_modules/  — native deps (sharp)
   run.sh         — start script
   .env.example   — copy to dist/.env and fill in your config

▶  To run:
   cd dist
   cp .env.example .env   # fill in DEFAULT_SERVICE_HOST etc.
   ./run.sh
`)
