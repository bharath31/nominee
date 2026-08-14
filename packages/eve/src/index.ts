import { defineTool } from 'eve/tools'
import type { Approval, ToolContext } from 'eve/tools'
import type { Nominee } from 'nominee'
import type { z } from 'zod'

/**
 * Resolves the principal the agent acts on behalf of. Either a fixed user id,
 * or a function of the Eve tool context (e.g. read it off the session).
 */
export type UserResolver = string | ((ctx: ToolContext) => string | Promise<string>)

/** Augmented context passed to your `execute`, on top of Eve's own. */
export interface NomineeEveContext {
  /** A fresh token for `connection`, fetched via your nominee strategy. */
  token?: string
  /** The resolved principal. */
  user: string
  /** Eve's native tool context (session, getToken, requireAuth, …). */
  eve: ToolContext
}

export interface NomineeEveToolConfig<TSchema extends z.ZodType, TOutput> {
  /** The nominee instance whose strategy brokers tokens / approvals. */
  nominee: Nominee
  /** Who the agent acts for. */
  user: UserResolver
  /** Fetch a fresh token for this connection (e.g. `"github"`) before execute. */
  connection?: string
  /** Optional scopes to request for the token. */
  scopes?: string[]
  /** Application resource checked by Nominee's authorizer / strategy.can(). */
  resource?: string | ((input: z.infer<TSchema>, ctx: ToolContext) => string | Promise<string>)
  /** Tenant boundary checked and recorded for the action. */
  tenant?: string | ((input: z.infer<TSchema>, ctx: ToolContext) => string | Promise<string>)
  /**
   * Require human approval (via your nominee strategy — e.g. Auth0 CIBA push)
   * before running `execute`. Throws and aborts the tool if denied.
   */
  approval?: boolean
  /** Action name used for the approval prompt and audit log. Defaults to `"tool"`. */
  action?: string
  description: string
  inputSchema: TSchema
  execute: (input: z.infer<TSchema>, ctx: NomineeEveContext) => TOutput | Promise<TOutput>
  /**
   * Eve-native approval gate (interactive web consent), passed straight through
   * to `defineTool` as Eve's `approval`. Independent of nominee's `approval`
   * boolean (which is provider-portable / CIBA). Use the
   * `always`/`once`/`never` helpers from `eve/tools/approval`.
   */
  eveApproval?: Approval<z.infer<TSchema>>
  /**
   * @deprecated Eve renamed this field to `approval`; use `eveApproval` to
   * distinguish it from nominee's portable `approval` boolean.
   */
  needsApproval?: Approval<z.infer<TSchema>>
}

async function resolveUser(user: UserResolver, ctx: ToolContext): Promise<string> {
  return typeof user === 'function' ? user(ctx) : user
}

/**
 * Wrap an Eve tool so it draws its token and human approval from nominee —
 * letting an Eve agent use Auth0 Token Vault, a generic OAuth store, or any
 * nominee strategy instead of being tied to Vercel Connect.
 *
 * Returns a real, branded Eve `defineTool(...)` — drop it straight into
 * `agent/tools/<name>.ts` as the default export.
 *
 * ```ts
 * // agent/tools/close_issue.ts
 * import { nomineeTool } from 'nominee-eve'
 * import { z } from 'zod'
 * import { nominee } from '../../lib/nominee.js'
 *
 * export default nomineeTool({
 *   nominee,
 *   user: (ctx) => ctx.session.userId,
 *   connection: 'github',
 *   approval: true,
 *   action: 'close_issue',
 *   description: 'Close a GitHub issue',
 *   inputSchema: z.object({ repo: z.string(), issue: z.number() }),
 *   async execute({ repo, issue }, { token }) {
 *     // `token` is a fresh GitHub token, auto-refreshed by nominee
 *   },
 * })
 * ```
 */
export function nomineeTool<TSchema extends z.ZodType, TOutput>(
  config: NomineeEveToolConfig<TSchema, TOutput>,
) {
  const { nominee, action = 'tool' } = config

  const definition = {
    description: config.description,
    inputSchema: config.inputSchema,
    approval: nominee.mode === 'observe' ? undefined : (config.eveApproval ?? config.needsApproval),
    async execute(input: z.infer<TSchema>, ctx: ToolContext): Promise<TOutput> {
      const user = await resolveUser(config.user, ctx)

      const resource =
        typeof config.resource === 'function' ? await config.resource(input, ctx) : config.resource
      const tenant =
        typeof config.tenant === 'function' ? await config.tenant(input, ctx) : config.tenant
      return nominee.run(
        {
          tool: action,
          input,
          user,
          resource,
          tenant,
          connection: config.connection,
          scopes: config.scopes,
          requireApproval: config.approval,
        },
        ({ token }) => config.execute(input, { token, user, eve: ctx }),
      )
    },
  }

  // Eve's defineTool is overloaded over Standard Schema generics; Zod schemas
  // satisfy it at runtime. Cast keeps our Zod-inferred public API while handing
  // Eve the branded definition it requires.
  return defineTool(definition as Parameters<typeof defineTool>[0])
}

/**
 * Bind a nominee instance (and optional default user) once, returning a
 * `nomineeTool` you can call without repeating them.
 */
export function withNominee(nominee: Nominee, defaults?: { user?: UserResolver }) {
  return <TSchema extends z.ZodType, TOutput>(
    config: Omit<NomineeEveToolConfig<TSchema, TOutput>, 'nominee' | 'user'> & {
      user?: UserResolver
    },
  ) => {
    const user = config.user ?? defaults?.user
    if (user === undefined) {
      throw new Error(
        'nominee-eve: `user` is required (pass it here or as a default to withNominee)',
      )
    }
    return nomineeTool({ ...config, nominee, user } as NomineeEveToolConfig<TSchema, TOutput>)
  }
}
