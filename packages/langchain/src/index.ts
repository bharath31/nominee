import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface, ToolRunnableConfig } from '@langchain/core/tools'
import type { ActionRecord, Nominee } from 'nominee'
import type { z } from 'zod'

interface LangChainCall<TInput> {
  input: TInput
  config?: ToolRunnableConfig
}

type Resolver<TInput> = string | ((call: LangChainCall<TInput>) => string | Promise<string>)

/** Context passed to `execute` after Nominee issues a capability. */
export interface NomineeLangChainContext {
  token?: string
  action: ActionRecord
  user: string
  langchain?: ToolRunnableConfig
}

export interface NomineeLangChainToolConfig<TSchema extends z.ZodType, TOutput> {
  name: string
  description: string
  schema: TSchema
  nominee: Nominee
  user: Resolver<z.infer<TSchema>>
  /** Policy action name. Defaults to the LangChain tool name. */
  action?: string
  resource?: Resolver<z.infer<TSchema>>
  tenant?: Resolver<z.infer<TSchema>>
  connection?: Resolver<z.infer<TSchema>>
  scopes?: string[]
  /** Force Nominee's portable approval path (same as `ask` / `requireApproval`). */
  requireApproval?: boolean
  execute: (input: z.infer<TSchema>, context: NomineeLangChainContext) => TOutput | Promise<TOutput>
}

/**
 * Create a LangChain structured tool whose side effect runs only through
 * `nominee.run()`. Denied calls never reach `execute`. `ask` without an
 * inline handler surfaces `ActionPendingError` for durable resume.
 */
export function nomineeTool<TSchema extends z.ZodType, TOutput>(
  config: NomineeLangChainToolConfig<TSchema, TOutput>,
): StructuredToolInterface {
  const action = config.action ?? config.name
  return tool(
    async (input: z.infer<TSchema>, langchainConfig?: ToolRunnableConfig) => {
      const call = { input, config: langchainConfig }
      const user = await resolve(config.user, call)
      const resource = await resolveOptional(config.resource, call)
      const tenant = await resolveOptional(config.tenant, call)
      const connection = await resolveOptional(config.connection, call)

      return config.nominee.run(
        {
          tool: action,
          input,
          user,
          ...(resource ? { resource } : {}),
          ...(tenant ? { tenant } : {}),
          ...(connection ? { connection } : {}),
          ...(config.scopes?.length ? { scopes: config.scopes } : {}),
          ...(config.requireApproval ? { requireApproval: true } : {}),
        },
        ({ action: actionRecord, token }) =>
          config.execute(input, {
            action: actionRecord,
            token,
            user,
            langchain: langchainConfig,
          }),
      )
    },
    {
      name: config.name,
      description: config.description,
      schema: config.schema,
    },
  ) as StructuredToolInterface
}

/**
 * Bind a nominee instance (and optional default user) once, returning a
 * `nomineeTool` you can call without repeating them.
 */
export function withNominee(nominee: Nominee, defaults?: { user?: Resolver<never> }) {
  return <TSchema extends z.ZodType, TOutput>(
    config: Omit<NomineeLangChainToolConfig<TSchema, TOutput>, 'nominee' | 'user'> & {
      user?: Resolver<z.infer<TSchema>>
    },
  ) => {
    const user = config.user ?? defaults?.user
    if (user === undefined) {
      throw new Error(
        'nominee-langchain: `user` is required (pass it here or as a default to withNominee)',
      )
    }
    return nomineeTool({
      ...config,
      nominee,
      user: user as Resolver<z.infer<TSchema>>,
    })
  }
}

async function resolve<TInput>(
  value: Resolver<TInput>,
  call: LangChainCall<TInput>,
): Promise<string> {
  return typeof value === 'function' ? value(call) : value
}

async function resolveOptional<TInput>(
  value: Resolver<TInput> | undefined,
  call: LangChainCall<TInput>,
): Promise<string | undefined> {
  return value === undefined ? undefined : resolve(value, call)
}
