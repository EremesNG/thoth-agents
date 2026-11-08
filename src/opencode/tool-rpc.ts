/** Portable server/TUI contract: Zod only, no host or filesystem dependencies. */
import { z } from 'zod';

export const ToolRoleSchema = z.enum([
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
]);
export const ToolScopeSchema = z.enum(['global', 'project']);
export const ToolEffectSchema = z.enum(['allow', 'ask', 'deny']);
export const ToolOriginSchema = z.enum(['default', 'global', 'project']);
export const ActionOverrideSchema = z.object({
  action: z
    .string()
    .min(1)
    .refine((action) => action.trim().length > 0, 'Action must not be blank'),
  effect: ToolEffectSchema,
});
const scopeState = z.object({
  present: z.boolean(),
  /** Opaque whole-file revision, including when this role is absent. */
  revision: z.string(),
  /** Ordered entries, including duplicates and patterns matching no inventory action. */
  overrides: z.array(
    ActionOverrideSchema.extend({ matchCount: z.number().int().nonnegative() }),
  ),
});
export const ToolStateSchema = z.object({
  specialists: z.array(ToolRoleSchema),
  inventory: z.array(
    z.object({
      action: z.string(),
      tools: z.array(z.string()),
      locked: z.boolean(),
    }),
  ),
  roles: z.array(
    z.object({
      role: ToolRoleSchema,
      effectiveScope: ToolOriginSchema,
      global: scopeState,
      project: scopeState,
      actions: z.array(
        z.object({
          action: z.string(),
          effect: ToolEffectSchema,
          /** Effect from shipped role rules alone, before any scope overrides. */
          baseEffect: ToolEffectSchema,
          origin: ToolOriginSchema,
          locked: z.boolean(),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()),
});
export const ToolErrorSchema = z.object({
  code: z.enum(['TOOLS_CONFLICT', 'INVALID_REQUEST', 'OPERATION_FAILED']),
  message: z.string(),
});
const result = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: ToolStateSchema }),
  z.object({ ok: z.literal(false), error: ToolErrorSchema }),
]);
const target = z.object({
  scope: ToolScopeSchema,
  role: ToolRoleSchema,
  baseRevision: z.string(),
});
export const toolRpc = {
  id: 'thoth-tool-permissions',
  methods: {
    state: { input: z.object({}), output: result },
    save: {
      input: target.extend({
        overrides: z.array(
          ActionOverrideSchema.refine(
            (entry) => entry.action !== 'subagent',
            'The subagent action is locked',
          ),
        ),
      }),
      output: result,
    },
    reset: { input: target, output: result },
  },
  events: {},
} as const;

export type ToolState = z.infer<typeof ToolStateSchema>;
export type ToolError = z.infer<typeof ToolErrorSchema>;
export type ToolRpcMethod = keyof typeof toolRpc.methods;
export type ToolRpcInput<M extends ToolRpcMethod> = z.infer<
  (typeof toolRpc.methods)[M]['input']
>;
export type ToolRpcOutput<M extends ToolRpcMethod> = z.infer<
  (typeof toolRpc.methods)[M]['output']
>;
