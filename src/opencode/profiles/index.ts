/**
 * Host-neutral OpenCode model profiles.
 *
 * Inject the effective role roster into ModelProfileStore; use resolve(sessionName)
 * for selection and resolveRoleProfile for field-level inheritance. Persisted files
 * never contain the virtual `default`. Warnings are returned by resolve, collected
 * by read(scope, warnings), and optionally forwarded to the store's warn callback.
 * Runtime reads tolerate bad files; mutations reject invalid files to avoid data loss.
 *
 * ModelProfileWorkspace owns drafts until save. Same-profile concurrent saves raise
 * ProfileConflictError (code PROFILE_CONFLICT); discard then reload entries to retry.
 * Store mutations re-read files and atomically replace each individual file, not a
 * transaction across global/project files or a cross-process compare-and-swap lock.
 */
export * from './editor.js';
export * from './resolver.js';
export * from './store.js';
export * from './types.js';
