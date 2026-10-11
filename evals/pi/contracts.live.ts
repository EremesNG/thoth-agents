import os from 'node:os';
import path from 'node:path';
import { it } from 'vitest';
import { evaluationCaps } from './harness';
import { evaluateCase, liveCases } from './live-cases';
import { reportEvaluationStatus, reportVerboseEvaluation } from './reporting';

const configured = process.env.THOTH_EVAL_MODEL?.trim() ?? '';
const slash = configured.indexOf('/');
if (slash <= 0 || slash === configured.length - 1)
  throw new Error(
    'Set THOTH_EVAL_MODEL to provider/model; run pnpm run eval:pi for configuration guidance.',
  );
const model = {
  provider: configured.slice(0, slash),
  id: configured.slice(slash + 1),
};
const selected = process.env.THOTH_EVAL_CASE?.trim();
const cases = liveCases.filter((item) => !selected || item.id === selected);
if (!cases.length)
  throw new Error(
    `Unknown THOTH_EVAL_CASE ${selected}; choose ${liveCases.map((item) => item.id).join(', ')}`,
  );
const budget = { spent: 0 };

for (const item of cases) {
  it(
    item.id,
    async (ctx) => {
      const result = await evaluateCase(item, {
        model,
        budget,
        authSource:
          process.env.THOTH_EVAL_AUTH ??
          path.join(os.homedir(), '.pi', 'agent', 'auth.json'),
      });
      console.log(
        `${item.id}: ${result.status} | reasons: ${result.reasons.join('; ') || 'all assertions satisfied'} | warnings: ${result.warnings.join('; ') || 'none'} | cost: $${(result.parentCost + result.childCost).toFixed(4)} | turns: ${result.turns} | modelsUsed: ${result.modelsUsed.join(', ')}`,
      );
      reportVerboseEvaluation(result);
      reportEvaluationStatus(result, (reason) => ctx.skip(reason));
    },
    evaluationCaps(process.env, item.live.caps).timeMs + 120000,
  );
}
