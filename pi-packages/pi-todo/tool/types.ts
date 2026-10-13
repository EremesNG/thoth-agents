import { StringEnum } from '@earendil-works/pi-ai';
import { type Static, Type } from 'typebox';

// ---------------------------------------------------------------------------
// Tool / command identity — verbatim string boundaries.
// Tool name "todo" is the persistence key for branch replay (filtering
// `toolResult.toolName === "todo"`) AND the permissions entry at
// `templates/pi-permissions.jsonc:26`. DO NOT rename.
// ---------------------------------------------------------------------------

export const TOOL_NAME = 'todo';
export const TOOL_LABEL = 'Todo';
export const COMMAND_NAME = 'todos';

// ---------------------------------------------------------------------------
// User-facing strings (kept stable for /todos UX parity).
// ---------------------------------------------------------------------------

export const ERR_REQUIRES_INTERACTIVE = '/todos requires interactive mode';
export const MSG_NO_TODOS = 'No todos yet. Ask the agent to add some!';

// ---------------------------------------------------------------------------
// Public domain types
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export type TaskAction =
  | 'create'
  | 'update'
  | 'list'
  | 'get'
  | 'delete'
  | 'clear'
  | 'batch';

export interface Task {
  id: number;
  subject: string;
  description?: string;
  activeForm?: string;
  status: TaskStatus;
  blockedBy?: number[];
  owner?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persistence + replay snapshot. Every successful `todo` tool call returns this
 * shape under `details`; `state/replay.ts` reads the latest one from the branch
 * to reconstruct module state. Field order and field names are pinned by
 * cross-version replay compatibility.
 */
export interface TaskDetails {
  action: TaskAction;
  params: Record<string, unknown>;
  tasks: Task[];
  nextId: number;
  error?: string;
  results?: BatchResult[];
}

export interface BatchResult {
  index: number;
  action: 'create' | 'update' | 'delete';
  id: number;
  ref?: string;
}

interface TaskFields {
  subject?: string;
  description?: string;
  activeForm?: string;
  status?: TaskStatus;
  owner?: string;
  metadata?: Record<string, unknown>;
}

export interface BatchOp extends TaskFields {
  action: 'create' | 'update' | 'delete';
  ref?: string;
  id?: number | string;
  blockedBy?: (number | string)[];
  addBlockedBy?: (number | string)[];
  removeBlockedBy?: (number | string)[];
}

/**
 * Open-shape input bag the reducer accepts. Stays an interface so the index
 * signature (`[key: string]: unknown`) lets the runtime pass through TypeBox
 * `Static<typeof TodoParamsSchema>` without `as` casts.
 */
export interface TaskMutationParams extends TaskFields {
  [key: string]: unknown;
  blockedBy?: number[];
  addBlockedBy?: number[];
  removeBlockedBy?: number[];
  id?: number;
  includeDeleted?: boolean;
  ops?: BatchOp[];
}

// ---------------------------------------------------------------------------
// TypeBox parameter schema — every `description` doubles as LLM-facing prompt
// copy. Field order and wording are pinned by registration tests.
// ---------------------------------------------------------------------------

const SingleParamsSchema = Type.Object({
  action: StringEnum([
    'create',
    'update',
    'list',
    'get',
    'delete',
    'clear',
  ] as const),
  subject: Type.Optional(
    Type.String({ description: 'Task subject line (required for create)' }),
  ),
  description: Type.Optional(
    Type.String({ description: 'Long-form task description' }),
  ),
  activeForm: Type.Optional(
    Type.String({
      description:
        "Present-continuous spinner label shown while status is in_progress (e.g. 'writing tests')",
    }),
  ),
  status: Type.Optional(
    StringEnum(['pending', 'in_progress', 'completed', 'deleted'] as const, {
      description:
        'Create status: pending (default), in_progress or completed; create rejects deleted. Multiple tasks may be in_progress. On list, filters by status.',
    }),
  ),
  blockedBy: Type.Optional(
    Type.Array(Type.Number(), {
      description: 'Initial blockedBy ids (create only)',
    }),
  ),
  addBlockedBy: Type.Optional(
    Type.Array(Type.Number(), {
      description: 'Task ids to add to blockedBy (update only, additive merge)',
    }),
  ),
  removeBlockedBy: Type.Optional(
    Type.Array(Type.Number(), {
      description:
        'Task ids to remove from blockedBy (update only, additive merge)',
    }),
  ),
  owner: Type.Optional(
    Type.String({ description: 'Agent/owner assigned to this task' }),
  ),
  metadata: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description:
        'Arbitrary metadata; pass null value for a key to delete that key on update',
    }),
  ),
  id: Type.Optional(
    Type.Number({
      description: 'Task id (required for update, get, delete)',
    }),
  ),
  includeDeleted: Type.Optional(
    Type.Boolean({
      description:
        'If true, list action returns deleted (tombstoned) tasks as well. Default: false.',
    }),
  ),
});

const batchId = Type.Union([Type.Number(), Type.String()], {
  description:
    'Task id or ref from an earlier create in this batch (strings are always refs)',
});
const BatchOpSchema = Type.Object({
  ...Type.Omit(SingleParamsSchema, [
    'action',
    'includeDeleted',
    'id',
    'blockedBy',
    'addBlockedBy',
    'removeBlockedBy',
  ]).properties,
  action: StringEnum(['create', 'update', 'delete'] as const),
  ref: Type.Optional(
    Type.String({
      description:
        'Unique call-scoped ref (create only); later ops may use it as an id',
    }),
  ),
  id: Type.Optional(batchId),
  blockedBy: Type.Optional(
    Type.Array(batchId, {
      description: 'Initial dependencies (create): ids or earlier refs',
    }),
  ),
  addBlockedBy: Type.Optional(
    Type.Array(batchId, {
      description: 'Dependencies to add (update): ids or earlier refs',
    }),
  ),
  removeBlockedBy: Type.Optional(
    Type.Array(batchId, {
      description: 'Dependencies to remove (update): ids or earlier refs',
    }),
  ),
});

export const TodoParamsSchema = Type.Object({
  ...SingleParamsSchema.properties,
  action: StringEnum([
    'create',
    'update',
    'list',
    'get',
    'delete',
    'clear',
    'batch',
  ] as const),
  ops: Type.Optional(
    Type.Array(BatchOpSchema, {
      description:
        'Batch only: 1–50 ordered create/update/delete ops; all succeed or none apply',
      minItems: 1,
      maxItems: 50,
    }),
  ),
});

export type TodoParams = Static<typeof TodoParamsSchema>;
