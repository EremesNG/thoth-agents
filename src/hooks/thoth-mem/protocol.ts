export const SDD_TOPIC_KEY_FORMAT = 'sdd/{change}/{artifact}';

export const FIRST_ACTION_INSTRUCTION =
  'FIRST ACTION REQUIRED: Call mem_session_summary with the content of the compacted summary. This preserves what was accomplished before compaction. Do this BEFORE any other work. Then call mem_context for a recent-session overview, and use the 3-layer recall protocol (mem_search with mode "compact" -> mem_timeline -> mem_get_observation) for precise retrieval.';

export const SESSION_SUMMARY_TEMPLATE = `Use this exact structure for \`mem_session_summary\` content:

## Goal
[What we were working on this session]

## Instructions
[User preferences or constraints discovered during this session]

## Discoveries
- [Technical findings, gotchas, non-obvious learnings]

## Accomplished
- [Completed items with key details]

## Next Steps
- [What remains to be done]

## Relevant Files
- path/to/file.ts - [what it does or what changed]`;

export function buildCompactionReminder(sessionID: string): string {
  return `FIRST ACTION REQUIRED: this session was compacted. Call \`mem_session_summary\` with the content of the compacted summary and \`session_id\` \`${sessionID}\`. This preserves what was accomplished before compaction. Do this BEFORE any other work. After that, call \`mem_capture_passive\` if the summary includes \`## Key Learnings:\`, call \`mem_context\` for a recent-session overview, and use the 3-layer recall protocol (\`mem_search\` with \`mode: "compact"\` -> \`mem_timeline\` -> \`mem_get_observation\`) for precise retrieval.`;
}

export function buildCompactorInstruction(project: string): string {
  return `CRITICAL INSTRUCTION: place this at the TOP of the compacted summary exactly as an action item for the resumed agent: "FIRST ACTION REQUIRED: Call mem_session_summary with the content of this compacted summary. Use project: '${project}'. This preserves what was accomplished before compaction. Do this BEFORE any other work."`;
}

export function buildMemoryInstructions(
  sessionID: string,
  project: string,
): string {
  return `
<memory_protocol>
Persistent memory is available through thoth-mem. Follow this protocol.

IMPORTANT: Your current session_id is \`${sessionID}\` and project is \`${project}\`.
Always pass these values when calling memory tools that accept them (mem_session_summary, mem_save, mem_capture_passive, etc.).

### CORE TOOLS
mem_save, mem_search, mem_context, mem_session_summary, mem_get_observation, mem_save_prompt, mem_update, mem_suggest_topic_key, mem_timeline, mem_capture_passive

### SUBAGENT HANDOFF
- When dispatching subagents for thoth-mem work, load the bundled \`thoth-mem-agents\` skill.
- Orchestrator owns \`mem_session_start\`, \`mem_session_summary\`, and \`mem_save_prompt\`.
- Do not ask subagents to save prompts or session summaries; pass parent \`session_id\` and \`project\` instead.

### WHEN TO SAVE
Call \`mem_save\` IMMEDIATELY after ANY of these:
- Architecture, design, or workflow decision made
- Bug fixed (include root cause)
- Non-obvious discovery, gotcha, or edge case found
- Configuration change or environment setup
- Pattern or convention established (naming, structure, approach)
- User preference or constraint learned
- Feature implemented with non-obvious approach
- User confirms a recommendation ("dale", "go with that", "sounds good", "sí, esa")
- User rejects an approach or expresses a preference ("no, better X", "I prefer X")
- Discussion concludes with a clear direction chosen

Use \`title\` as Verb + what changed or was learned.
Use \`type\` from: bugfix | decision | architecture | discovery | pattern | config | learning | manual.
Set \`scope\` intentionally.
Reuse \`topic_key\` for the same evolving topic. Do not overwrite unrelated topics.
If unsure about a stable \`topic_key\`, call \`mem_suggest_topic_key\` first.
If you need to modify a known observation by exact ID, call \`mem_update\` instead of creating a new record.
Put the durable details in \`content\` with this structure:
  - What: concise description of what changed or was learned
  - Why: why it mattered or what problem it solved
  - Where: files, paths, or systems involved
  - Learned: edge cases, caveats, or follow-up notes

**Self-check after EVERY task**: "Did I or the user just make a decision, confirm a recommendation, express a preference, fix a bug, learn something, or establish a convention? If yes → mem_save NOW."

You can also call \`mem_save_prompt\` to manually save a user prompt that you consider particularly important for future context.

### WHEN TO SEARCH MEMORY
- Broad recovery (session start, after compaction): call \`mem_context\` for a recent-session overview.
- Targeted 3-layer recall (specific memory retrieval):
  1. Call \`mem_search\` with \`mode: "compact"\` (default) to scan the compact index of IDs + titles.
  2. Call \`mem_timeline\` around promising observation IDs for chronological context within the same session.
  3. Call \`mem_get_observation\` only for observations you need in full.
- Use \`mode: "preview"\` with \`mem_search\` only when compact results are insufficient to disambiguate.
- Search proactively on the first message about a project, feature, or problem when prior context may matter.
- Search before starting work that may have been done before.
- Search when the user mentions a topic that lacks enough local context.

### SESSION CLOSE PROTOCOL
- Before ending the session, call \`mem_session_summary\` with this exact template.
- This is NOT optional. If you skip this, the next session starts blind.
- Do not claim memory was saved unless the tool call succeeded.
- If your response includes \`## Key Learnings:\`, also call \`mem_capture_passive\`.

${SESSION_SUMMARY_TEMPLATE}

### AFTER COMPACTION
- IMMEDIATELY call \`mem_session_summary\` with the compacted summary content.
- Then call \`mem_context\` for a recent-session overview.
- Use the 3-layer recall protocol (\`mem_search\` with \`mode: "compact"\` -> \`mem_timeline\` -> \`mem_get_observation\`) for precise artifact/prior-observation retrieval.
- Only then continue working.

### SDD TOPIC KEY CONVENTION
- use ${SDD_TOPIC_KEY_FORMAT}
- examples: sdd/add-user-auth/spec, sdd/add-user-auth/design, sdd/add-user-auth/tasks
</memory_protocol>
`.trim();
}

export function buildSaveNudge(): string {
  return 'MEMORY REMINDER: It has been a while since your last save. If you have made decisions, discoveries, or completed significant work, call mem_save now.';
}
