import { agent404Worker } from "@agent404/cloudflare";

export default {
  async fetch(request, env, ctx) {
    const worker = agent404Worker({
      apiKey: env.AGENT404_PUBLIC_KEY || "pk_4f07b4c2d0e64790b3a72d5db97e3402",
      // Probe through the Pages asset binding instead of fetching the same
      // URL: a self-fetch re-enters this function and recurses until
      // Cloudflare kills it (error 1019).
      fetchOrigin: (req) => env.ASSETS.fetch(req),
    });
    return worker.fetch(request, env, ctx);
  },
};
