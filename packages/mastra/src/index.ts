import type { InferPublicSchema, PublicSchema } from '@mastra/core/schema'
import { type ToolExecutionContext, createTool } from '@mastra/core/tools'
import type { ActionRecord, Nominee } from 'nominee'

interface MastraResolverCall<TInput> {
  input: TInput
  requestContext: Record<string, unknown>
}

type Resolver<TInput> = (call: MastraResolverCall<TInput>) => string | Promise<string>

interface MastraApprovalContext {
  requestContext?: Record<string, unknown>
  workspace?: unknown
}

export interface NomineeMastraToolConfig<
  TInputSchema extends PublicSchema<any>,
  TOutputSchema extends PublicSchema<any> | undefined = undefined,
> {
  id: string
  description: string
  inputSchema: TInputSchema
  outputSchema?: TOutputSchema
  nominee: Nominee
  user: string | Resolver<InferPublicSchema<TInputSchema>>
  /** Policy action name. Defaults to the Mastra tool id. */
  action?: string
  resource?: string | Resolver<InferPublicSchema<TInputSchema>>
  tenant?: string | Resolver<InferPublicSchema<TInputSchema>>
  connection?: string | Resolver<InferPublicSchema<TInputSchema>>
  scopes?: string[]
  /**
   * Native Mastra approval rule. Its successful pause/resume is recorded in
   * the Nominee receipt chain before execution.
   */
  requireApproval?:
    | boolean
    | ((
        input: InferPublicSchema<TInputSchema>,
        context?: MastraApprovalContext,
      ) => boolean | Promise<boolean>)
  /**
   * Also map Nominee `ask` decisions into Mastra's native approval flow.
   * Default false: portable Nominee approvals surface as ActionPendingError.
   */
  nativeApprovals?: boolean
  execute: (
    input: InferPublicSchema<TInputSchema>,
    context: {
      token?: string
      action: ActionRecord
      mastra: ToolExecutionContext
    },
  ) =>
    | InferPublicSchema<NonNullable<TOutputSchema>>
    | Promise<InferPublicSchema<NonNullable<TOutputSchema>>>
}

/** Create a Mastra tool whose side effect runs only through a Nominee action. */
export function nomineeTool<
  TInputSchema extends PublicSchema<any>,
  TOutputSchema extends PublicSchema<any> | undefined = undefined,
>(config: NomineeMastraToolConfig<TInputSchema, TOutputSchema>) {
  type Input = InferPublicSchema<TInputSchema>
  const action = config.action ?? config.id

  const configuredApproval = async (
    input: Input,
    context?: MastraApprovalContext,
  ): Promise<boolean> =>
    typeof config.requireApproval === 'function'
      ? config.requireApproval(input, context)
      : (config.requireApproval ?? false)

  const requireApproval = async (
    input: Input,
    context?: MastraApprovalContext,
  ): Promise<boolean> => {
    if (await configuredApproval(input, context)) return true
    if (!config.nativeApprovals) return false
    const requestContext = context?.requestContext ?? {}
    const call = { input, requestContext }
    const user = await resolve(config.user, call)
    const resource = await resolveOptional(config.resource, call)
    const tenant = await resolveOptional(config.tenant, call)
    return (
      (await config.nominee.check({ tool: action, user, input, resource, tenant })).effect === 'ask'
    )
  }

  return createTool({
    id: config.id,
    description: config.description,
    inputSchema: config.inputSchema,
    ...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
    requireApproval,
    execute: async (input: Input, context: ToolExecutionContext) => {
      const requestContext = normalizeRequestContext(context.requestContext)
      const call = { input, requestContext }
      const user = await resolve(config.user, call)
      const resource = await resolveOptional(config.resource, call)
      const tenant = await resolveOptional(config.tenant, call)
      const connection = await resolveOptional(config.connection, call)
      const frameworkApprovalRequired = await requireApproval(input, { requestContext })
      // Mastra invokes an agent tool's execute callback only after its native
      // approval gate. The runtime-generated toolCallId binds that control-flow
      // evidence to this exact invocation. Workflow/direct execution has no
      // equivalent trusted marker, so it falls back to Nominee's portable
      // pending approval instead of self-approving.
      const approvalId = frameworkApprovalRequired ? context.agent?.toolCallId : undefined

      return config.nominee.run(
        {
          tool: action,
          input,
          user,
          ...(resource ? { resource } : {}),
          ...(tenant ? { tenant } : {}),
          ...(connection ? { connection } : {}),
          ...(config.scopes?.length ? { scopes: config.scopes } : {}),
          ...(approvalId
            ? {
                requireApproval: true,
                frameworkApproval: { id: approvalId, via: 'mastra' },
              }
            : frameworkApprovalRequired
              ? { requireApproval: true }
              : {}),
        },
        ({ action: actionRecord, token }) =>
          config.execute(input, {
            action: actionRecord,
            token,
            mastra: context,
          }),
      )
    },
  } as never)
}

function normalizeRequestContext(value: unknown): Record<string, unknown> {
  if (
    value &&
    typeof value === 'object' &&
    'all' in value &&
    typeof (value as { all?: unknown }).all === 'object'
  ) {
    return (value as { all: Record<string, unknown> }).all
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

async function resolve<TInput>(
  value: string | Resolver<TInput>,
  call: MastraResolverCall<TInput>,
): Promise<string> {
  return typeof value === 'function' ? value(call) : value
}

async function resolveOptional<TInput>(
  value: string | Resolver<TInput> | undefined,
  call: MastraResolverCall<TInput>,
): Promise<string | undefined> {
  return value === undefined ? undefined : resolve(value, call)
}
