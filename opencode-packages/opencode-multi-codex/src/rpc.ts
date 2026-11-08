/** JSON-safe server/TUI contract; no host runtime imports. */
import { z } from 'zod';

const number = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const session = { sessionID: z.string().trim().min(1).optional() };
const window = z.object({
  remainingPercent: z.number(),
  resetAt: z.number().optional(),
  windowSeconds: z.number().optional(),
});
export const CodexStateSchema = z.object({
  accounts: z.array(
    z.object({
      number,
      providerID: z.string(),
      label: z.string(),
      credentialState: z.enum(['ok', 'missing']),
      blockedUntil: z.number().nullable(),
      quota: z.object({
        state: z.enum(['fresh', 'stale', 'unavailable']),
        primary: window.optional(),
        secondary: window.optional(),
        fetchedAt: z.number().optional(),
        error: z.string().optional(),
      }),
    }),
  ),
  unmappedCredentials: z.array(z.object({ id: z.string(), label: z.string() })),
  sessionOverride: number.nullable(),
  notices: z.array(z.string()),
  guidance: z.string().optional(),
});
const result = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: CodexStateSchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(['INVALID_REQUEST', 'OPERATION_FAILED']),
      message: z.string(),
    }),
  }),
]);
export const codexRpc = {
  id: 'thoth-multi-codex',
  methods: {
    state: { input: z.object(session), output: result },
    add: {
      input: z.object({
        ...session,
        credentialID: z.string().trim().min(1).optional(),
      }),
      output: result,
    },
    remove: {
      input: z.object({ ...session, number: number.min(2) }),
      output: result,
    },
    switch: {
      input: z.object({
        sessionID: z.string().trim().min(1),
        number: number.nullable(),
      }),
      output: result,
    },
    refreshQuota: {
      input: z.object({ ...session, number: number.optional() }),
      output: result,
    },
  },
  events: {},
} as const;
export type CodexState = z.infer<typeof CodexStateSchema>;
export type CodexRpcMethod = keyof typeof codexRpc.methods;
export type CodexRpcInput<M extends CodexRpcMethod> = z.infer<
  (typeof codexRpc.methods)[M]['input']
>;
export type CodexRpcOutput<M extends CodexRpcMethod> = z.infer<
  (typeof codexRpc.methods)[M]['output']
>;
export type CodexRpcPort = {
  [M in CodexRpcMethod]: (
    input: CodexRpcInput<M>,
  ) => Promise<CodexRpcOutput<M>>;
};
