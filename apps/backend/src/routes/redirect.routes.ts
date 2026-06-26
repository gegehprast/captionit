import { createRoute } from "@bunkit/server"

// Internal redirect example - type-safe redirect to home page
createRoute("GET", "/api/redirect-internal")
  .openapi({
    operationId: "redirectInternal",
    summary: "Internal Redirect",
    description:
      "Demonstrates type-safe internal redirect to another route in the application",
    tags: ["System"],
  })
  .handler(({ res }) => {
    // After running `bun run route-types:generate`,
    // this will be fully type-safe with autocomplete
    return res.redirectTo("/")
  })

// Internal redirect with params - redirects to a specific image
createRoute("GET", "/api/redirect-to-health")
  .openapi({
    operationId: "redirectToHealth",
    summary: "Internal Redirect to Health",
    description:
      "Demonstrates type-safe internal redirect to another route in the application",
    tags: ["System"],
  })
  .handler(({ res }) => {
    return res.redirectTo("/api/health")
  })

// External redirect example - redirects to external URL
createRoute("GET", "/api/redirect-external")
  .openapi({
    operationId: "redirectExternal",
    summary: "External Redirect",
    description: "Demonstrates redirect to an external URL",
    tags: ["System"],
  })
  .handler(({ res }) => {
    return res.redirect("https://www.example.com", 302)
  })
