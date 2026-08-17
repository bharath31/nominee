import { agent404Worker } from "@agent404/cloudflare";

export default {
  async fetch(request, env, ctx) {
    return agent404Worker(request, {
      publicKey: env.AGENT404_PUBLIC_KEY || "pk_4f07b4c2d0e64790b3a72d5db97e3402",
      siteId: "a46ae835-f410-40be-beea-225479f3ad94",
    });
  },
};
