import { agent404Worker } from "@agent404/cloudflare";

export default {
  async fetch(request, env, ctx) {
    const worker = agent404Worker({
      apiKey: env.AGENT404_PUBLIC_KEY || "pk_4f07b4c2d0e64790b3a72d5db97e3402",
    });
    return worker.fetch(request, env, ctx);
  },
};
