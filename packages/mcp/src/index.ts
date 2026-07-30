import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js'
import type { ActionRecord, Nominee } from 'nominee'
import type { ZodType } from 'zod'

export type McpToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>

interface McpResolverCall<TInput> {
  input: TInput
  extra: McpToolExtra
}

type Resolver<TInput> = (call: McpResolverCall<TInput>) => string | Promise<string>

export interface NomineeMcpToolConfig<TInput, TResult extends CallToolResult = CallToolResult> {
  name: string
  title?: string
  description?: string
  inputSchema: ZodType<TInput>
  outputSchema?: ZodType
  annotations?: ToolAnnotations
  nominee: Nominee
  user: string | Resolver<TInput>
  /** Policy action name. Defaults to the MCP tool name. */
  action?: string
  resource?: string | Resolver<TInput>
  tenant?: string | Resolver<TInput>
  connection?: string | Resolver<TInput>
  scopes?: string[]
  requireApproval?: boolean
  execute: (
    input: TInput,
    context: {
      token?: string
      action: ActionRecord
      mcp: McpToolExtra
    },
  ) => TResult | Promise<TResult>
}

/**
 * Build a standalone MCP tool callback. This is useful with low-level servers
 * and makes the enforcement boundary directly unit-testable.
 */
export function nomineeMcpHandler<TInput, TResult extends CallToolResult = CallToolResult>(
  config: NomineeMcpToolConfig<TInput, TResult>,
): (input: TInput, extra: McpToolExtra) => Promise<TResult> {
  const action = config.action ?? config.name
  return async (input, extra) => {
    const call = { input, extra }
    const user = await resolve(config.user, call)
    const resource = await resolveOptional(config.resource, call)
    const tenant = await resolveOptional(config.tenant, call)
    const connection = await resolveOptional(config.connection, call)

    return config.nominee.run(
      {
        tool: action,
        input,
        user,
        requireApproval: config.requireApproval,
        ...(resource ? { resource } : {}),
        ...(tenant ? { tenant } : {}),
        ...(connection ? { connection } : {}),
        ...(config.scopes?.length ? { scopes: config.scopes } : {}),
      },
      ({ action: actionRecord, token }) =>
        config.execute(input, {
          action: actionRecord,
          token,
          mcp: extra,
        }),
    )
  }
}

/** Register a decision-bound tool on the current MCP SDK's `McpServer`. */
export function registerNomineeTool<TInput, TResult extends CallToolResult = CallToolResult>(
  server: McpServer,
  config: NomineeMcpToolConfig<TInput, TResult>,
): RegisteredTool {
  const handler = nomineeMcpHandler(config)
  return server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: config.outputSchema,
      annotations: config.annotations,
    } as never,
    handler as never,
  )
}

async function resolve<TInput>(
  value: string | Resolver<TInput>,
  call: McpResolverCall<TInput>,
): Promise<string> {
  return typeof value === 'function' ? value(call) : value
}

async function resolveOptional<TInput>(
  value: string | Resolver<TInput> | undefined,
  call: McpResolverCall<TInput>,
): Promise<string | undefined> {
  return value === undefined ? undefined : resolve(value, call)
}
