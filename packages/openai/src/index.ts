import {
  type FunctionTool,
  type RunContext,
  type ToolExecuteArgument,
  type ToolInputParameters,
  tool,
} from '@openai/agents'
import type { ActionRecord, Nominee } from 'nominee'

export interface OpenAIToolCallDetails {
  toolCall?: { callId: string }
}

interface OpenAICall<TInput> {
  input: TInput
  context: RunContext<any>
  details?: OpenAIToolCallDetails
}

type Resolver<TInput> = (call: OpenAICall<TInput>) => string | Promise<string>

type ApprovalFunction<TParameters extends ToolInputParameters> = (
  context: RunContext,
  input: ToolExecuteArgument<TParameters>,
  callId?: string,
) => boolean | Promise<boolean>

export interface NomineeOpenAIToolConfig<
  TParameters extends ToolInputParameters,
  TContext,
  TResult,
> {
  name: string
  description: string
  parameters: TParameters
  nominee: Nominee
  user: string | Resolver<ToolExecuteArgument<TParameters>>
  /** Policy action name. Defaults to the OpenAI tool name. */
  action?: string
  resource?: string | Resolver<ToolExecuteArgument<TParameters>>
  tenant?: string | Resolver<ToolExecuteArgument<TParameters>>
  connection?: string | Resolver<ToolExecuteArgument<TParameters>>
  scopes?: string[]
  /** Combined with Nominee's `ask` decision through OpenAI's resumable approval flow. */
  needsApproval?: boolean | ApprovalFunction<TParameters>
  strict?: boolean
  execute: (
    input: ToolExecuteArgument<TParameters>,
    context: {
      token?: string
      action: ActionRecord
      openai: RunContext<TContext>
      details?: OpenAIToolCallDetails
    },
  ) => TResult | Promise<TResult>
}

/**
 * Create an OpenAI Agents SDK function tool whose execution is authorized and
 * credential-bound by Nominee. A Nominee `ask` rule becomes a native,
 * resumable OpenAI tool approval; the approved call id is sealed into the
 * Nominee action receipts.
 */
export function nomineeTool<
  TParameters extends ToolInputParameters,
  TContext = unknown,
  TResult = string,
>(
  config: NomineeOpenAIToolConfig<TParameters, TContext, TResult>,
): FunctionTool<TContext, TParameters, TResult> {
  const action = config.action ?? config.name
  const approval: ApprovalFunction<TParameters> = async (context, input, callId) => {
    const typedContext = context as RunContext<TContext>
    const call = { input, context: typedContext }
    const configured =
      typeof config.needsApproval === 'function'
        ? await config.needsApproval(context, input, callId)
        : (config.needsApproval ?? false)
    if (configured) return true
    const user = await resolve(config.user, call)
    const resource = await resolveOptional(config.resource, call)
    const tenant = await resolveOptional(config.tenant, call)
    const decision = await config.nominee.check({
      tool: action,
      user,
      input,
      resource,
      tenant,
    })
    return decision.effect === 'ask'
  }

  const options = {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    ...(config.strict === undefined ? {} : { strict: config.strict }),
    needsApproval: approval,
    errorFunction: null,
    execute: async (
      input: ToolExecuteArgument<TParameters>,
      context?: RunContext<TContext>,
      details?: OpenAIToolCallDetails,
    ) => {
      if (!context) throw new Error('nominee-openai: OpenAI run context is required')
      const call = { input, context, details }
      const user = await resolve(config.user, call)
      const resource = await resolveOptional(config.resource, call)
      const tenant = await resolveOptional(config.tenant, call)
      const connection = await resolveOptional(config.connection, call)
      const callId = details?.toolCall?.callId
      const frameworkApproved =
        callId &&
        context.isToolApproved({
          toolName: config.name,
          callId,
        }) === true

      return config.nominee.run(
        {
          tool: action,
          input,
          user,
          ...(resource ? { resource } : {}),
          ...(tenant ? { tenant } : {}),
          ...(connection ? { connection } : {}),
          ...(config.scopes?.length ? { scopes: config.scopes } : {}),
          ...(frameworkApproved
            ? {
                requireApproval: true,
                frameworkApproval: { id: callId, via: 'openai-agents' },
              }
            : {}),
        },
        ({ action: actionRecord, token }) =>
          config.execute(input, {
            action: actionRecord,
            token,
            openai: context,
            details,
          }),
      )
    },
  }
  return tool(options as never) as FunctionTool<TContext, TParameters, TResult>
}

async function resolve<TInput>(
  value: string | Resolver<TInput>,
  call: OpenAICall<TInput>,
): Promise<string> {
  return typeof value === 'function' ? value(call) : value
}

async function resolveOptional<TInput>(
  value: string | Resolver<TInput> | undefined,
  call: OpenAICall<TInput>,
): Promise<string | undefined> {
  return value === undefined ? undefined : resolve(value, call)
}
