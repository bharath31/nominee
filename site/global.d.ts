// Vercel Edge Functions expose `process.env` (statically injected at build/
// deploy time) without pulling in the rest of Node's globals - @types/node
// would collide with the WebWorker `fetch`/`Request`/`Response` lib types
// this project relies on, so this is a narrow, local stand-in instead.
declare const process: {
  env: Record<string, string | undefined>
}
