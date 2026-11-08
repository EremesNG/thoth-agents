/** Portable server/TUI contract. No server, filesystem or profile-core runtime imports. */
import { z } from 'zod';

export const ProfileRoleSchema = z.enum([
  'orchestrator',
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'worker',
]);
export const ProfileScopeSchema = z.enum(['global', 'project']);
export const SelectionScopeSchema = z.enum([
  'session',
  'project',
  'global',
  'default',
]);
export const RoleModelSchema = z.object({
  model: z
    .string()
    .regex(/^[^/\s#]+\/[^\s#]+$/)
    .optional(),
  variant: z
    .string()
    .regex(/^[^\s#]+$/)
    .optional(),
});
export const ProfileSchema = z.object({
  agents: z.partialRecord(ProfileRoleSchema, RoleModelSchema),
});
const name = z.string().trim().min(1);
const session = z.object({ sessionID: z.string().min(1) });
const optionalSession = session.partial();
const target = z.object({ scope: ProfileScopeSchema, name });
const selectionScope = z.enum(['session', 'project', 'global']);
export const ProfileEntrySchema = target.extend({
  source: ProfileScopeSchema,
  shadowed: z.boolean(),
  profile: ProfileSchema,
  /** Opaque per-profile token, including absence. Never construct in the client. */
  revision: z.string(),
});
export const ProfileStateSchema = z.object({
  profiles: z.array(ProfileEntrySchema),
  defaultProfile: ProfileSchema,
  roles: z.array(ProfileRoleSchema),
  selections: z.object({
    session: name.optional(),
    project: name.optional(),
    global: name.optional(),
  }),
  effective: z.object({
    name,
    source: ProfileScopeSchema.optional(),
    selectedBy: SelectionScopeSchema,
    profile: ProfileSchema,
  }),
  orchestrator: RoleModelSchema.optional(),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      models: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          variants: z.array(z.string()),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()),
});
export const ProfileErrorSchema = z.object({
  code: z.enum([
    'PROFILE_CONFLICT',
    'PROFILE_SHADOWED',
    'INVALID_REQUEST',
    'MODEL_UNAVAILABLE',
    'OPERATION_FAILED',
  ]),
  message: z.string(),
});
function result<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: ProfileErrorSchema }),
  ]);
}

/** RPC failures are returned values, not thrown application errors. events is required by OpenCode. */
export const profileRpc = {
  id: 'thoth-model-profiles',
  methods: {
    state: { input: optionalSession, output: result(ProfileStateSchema) },
    create: {
      input: target.extend({ profile: ProfileSchema }),
      output: result(z.object({ revision: z.string() })),
    },
    save: {
      input: target.extend({
        profile: ProfileSchema,
        baseRevision: z.string(),
      }),
      output: result(z.object({ revision: z.string() })),
    },
    rename: {
      input: target.extend({ newName: name }),
      output: result(z.object({})),
    },
    delete: { input: target, output: result(z.object({})) },
    activate: {
      input: optionalSession.extend({ scope: selectionScope, name }),
      output: result(ProfileStateSchema),
    },
    clear: {
      input: optionalSession.extend({ scope: selectionScope }),
      output: result(ProfileStateSchema),
    },
    capture: { input: session, output: result(RoleModelSchema) },
  },
  events: {},
} as const;

export type ProfileState = z.infer<typeof ProfileStateSchema>;
export type ProfileError = z.infer<typeof ProfileErrorSchema>;
export type ProfileRpcMethod = keyof typeof profileRpc.methods;
export type ProfileRpcInput<M extends ProfileRpcMethod> = z.infer<
  (typeof profileRpc.methods)[M]['input']
>;
export type ProfileRpcOutput<M extends ProfileRpcMethod> = z.infer<
  (typeof profileRpc.methods)[M]['output']
>;
