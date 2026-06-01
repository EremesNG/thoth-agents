export const SDD_TOPIC_KEY_FORMAT = 'sdd/{change}/{artifact}';

export const FIRST_ACTION_INSTRUCTION =
  'FIRST ACTION REQUIRED: Call mem_session(action="summary") with the content of the compacted summary. This preserves what was accomplished before compaction. Do this BEFORE any other work. Then call mem_context(recall_query=...) for fused recent context, and use the recall funnel (mem_recall(mode="compact") -> mem_recall(mode="context") -> mem_get(...)) for precise retrieval.';

export const SESSION_SUMMARY_TEMPLATE = `Use this exact structure for \`mem_session(action="summary")\` content:

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
  return `FIRST ACTION REQUIRED: this session was compacted. Call \`mem_session(action="summary")\` with the content of the compacted summary and \`session_id\` \`${sessionID}\`. This preserves what was accomplished before compaction. Do this BEFORE any other work. After that, call \`mem_context(recall_query=...)\` for fused recent context, and use the recall funnel (\`mem_recall(mode="compact")\` -> \`mem_recall(mode="context")\` -> \`mem_get(...)\`) for precise retrieval.`;
}

export function buildCompactorInstruction(project: string): string {
  return `CRITICAL INSTRUCTION: place this at the TOP of the compacted summary exactly as an action item for the resumed agent: "FIRST ACTION REQUIRED: Call mem_session(action="summary") with the content of this compacted summary. Use project: '${project}'. This preserves what was accomplished before compaction. Do this BEFORE any other work."`;
}

export function buildMemoryInstructions(
  sessionID: string,
  project: string,
): string {
  return `
<memory_protocol>
Persistent memory is available through thoth-mem. Follow this protocol.

IMPORTANT: Your current session_id is \`${sessionID}\` and project is \`${project}\`.
Always pass these values when calling memory tools that accept them.

### CORE TOOLS
mem_save, mem_recall, mem_context, mem_get, mem_project, mem_session

### OWNERSHIP AND SUBAGENT HANDOFF
- Root owns \`mem_session(action="start"|"checkpoint"|"summary")\` and \`mem_save(kind="prompt"|"session_summary")\`.
- Start root memory-backed workflows with \`mem_session(action="start")\` before any other thoth-mem operation when tools and identity are available.
- Save the real user prompt with \`mem_save(kind="prompt")\`; never save generated subagent prompts as user intent.
- Before memory-dependent delegation, save the handoff body with \`mem_session(action="summary")\` or \`mem_save(kind="session_summary")\`.
- Subagent handoff prompts carry parent \`session_id\`, \`project\`, permissions, and recovery instructions only; do not ask subagents to own session lifecycle actions or save prompts.

### WHEN TO SAVE
Call \`mem_save(kind="observation")\` IMMEDIATELY after ANY of these:
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
Use \`kind\` intentionally: \`observation\`, \`prompt\`, \`session_summary\`, or \`passive_learnings\`.
Use \`type\` from: bugfix | decision | architecture | discovery | pattern | config | learning | manual.
Set \`scope\` intentionally.
Reuse a stable \`topic_key\` for the same evolving topic. Do not overwrite unrelated topics.
Put durable observation details in \`content\` with this structure:
  - What: concise description of what changed or was learned
  - Why: why it mattered or what problem it solved
  - Where: files, paths, or systems involved
  - Learned: edge cases, caveats, or follow-up notes

**Self-check after EVERY task**: "Did I or the user just make a decision, confirm a recommendation, express a preference, fix a bug, learn something, or establish a convention? If yes → mem_save(kind="observation") NOW."

### RECALL FUNNEL
- Broad recovery (session start, after compaction): call \`mem_context(recall_query=...)\` for fused recent context when useful.
- Targeted retrieval:
  1. Call \`mem_recall(mode="compact")\` to scan candidate IDs and titles.
  2. Call \`mem_recall(mode="context")\` to expand the strongest hits into retrieved context.
  3. Call \`mem_get(...)\` only for records you need in full.
- Use HyDE/fused recall for semantic or ambiguous searches.
- Set \`mem_recall\` \`limit\` from 1 to 20 for candidate/result count.
- Narrow with \`topic_key\`, \`type\`, \`time_from\`, \`time_to\`, \`scope\`, \`project\`, and \`session_id\` filters.
- Use \`mem_get\` with \`kind="observation"|"prompt"\`; use \`mem_get(include_timeline=true)\` with \`before\`/\`after\`, and \`offset\`/\`max_length\` for large content.
- Use bounded \`mem_project(action="graph"|"topics"|"topic")\` for relationship and topic navigation; \`mem_project(action="graph")\` relations are \`HAS_TYPE\`, \`IN_PROJECT\`, \`HAS_TOPIC_KEY\`, \`HAS_WHAT\`, \`HAS_WHY\`, \`HAS_WHERE\`, and \`HAS_LEARNED\`; these calls supplement, not replace, the recall funnel.
- Search proactively on the first message about a project, feature, or problem when prior context may matter.
- Search before starting work that may have been done before.
- Search when the user mentions a topic that lacks enough local context.

### SESSION CLOSE PROTOCOL
- Before ending the session, call \`mem_session(action="summary")\` with this exact template.
- This is NOT optional. If you skip this, the next session starts blind.
- Do not claim memory was saved unless the tool call succeeded.
- If your response includes \`## Key Learnings:\`, preserve them with \`mem_save(kind="passive_learnings")\`.

${SESSION_SUMMARY_TEMPLATE}

### AFTER COMPACTION
- IMMEDIATELY call \`mem_session(action="summary")\` with the compacted summary content.
- Then call \`mem_context(recall_query=...)\` for fused recent context.
- Use the recall funnel (\`mem_recall(mode="compact")\` -> \`mem_recall(mode="context")\` -> \`mem_get(...)\`) for precise artifact/prior-observation retrieval.
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
