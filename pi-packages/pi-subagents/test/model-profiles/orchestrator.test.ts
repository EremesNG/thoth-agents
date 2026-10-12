import { expect, it, vi } from 'vitest';
import { applyProfileOrchestrator } from '../../src/model-profiles/orchestrator.js';

function host() {
  const model = { provider: 'openai', id: 'gpt' } as any;
  return {
    model,
    ctx: { modelRegistry: { find: vi.fn(() => model) } },
    pi: {
      setModel: vi.fn(async () => true),
      setThinkingLevel: vi.fn(),
      getThinkingLevel: vi.fn(() => 'high' as const),
    },
  };
}
it('awaits the model switch before applying effort and reports applied', async () => {
  const { model, ctx, pi } = host();
  pi.setModel.mockImplementation(async () => {
    expect(pi.setThinkingLevel).not.toHaveBeenCalled();
    return true;
  });
  expect(
    await applyProfileOrchestrator(pi, ctx, {
      agents: {},
      orchestrator: { model, effort: 'high' },
    }),
  ).toMatchObject({ status: 'applied' });
  expect(ctx.modelRegistry.find).toHaveBeenCalledWith('openai', 'gpt');
  expect(pi.setModel).toHaveBeenCalledWith(model);
  expect(pi.setThinkingLevel).toHaveBeenCalledWith('high');
});
it.each([
  'missing',
  'false',
  'rejection',
] as const)('keeps effort untouched when model is unavailable (%s)', async (failure) => {
  const { model, ctx, pi } = host();
  if (failure === 'missing')
    ctx.modelRegistry.find.mockReturnValue(undefined as any);
  if (failure === 'false') pi.setModel.mockResolvedValue(false);
  if (failure === 'rejection') pi.setModel.mockRejectedValue(new Error('auth'));
  expect(
    await applyProfileOrchestrator(pi, ctx, {
      agents: {},
      orchestrator: { model, effort: 'high' },
    }),
  ).toMatchObject({
    status: 'unavailable',
    message: expect.stringContaining('unavailable'),
  });
  expect(pi.setThinkingLevel).not.toHaveBeenCalled();
});
it('reports native effort clamping from readback', async () => {
  const { model, ctx, pi } = host();
  expect(
    await applyProfileOrchestrator(pi, ctx, {
      agents: {},
      orchestrator: { model, effort: 'max' },
    }),
  ).toEqual({
    status: 'clamped',
    message: 'Orchestrator effort max clamped to high.',
  });
});
it('leaves the session entirely untouched without an orchestrator', async () => {
  const { ctx, pi } = host();
  expect(await applyProfileOrchestrator(pi, ctx, { agents: {} })).toMatchObject(
    { status: 'untouched' },
  );
  expect(pi.setModel).not.toHaveBeenCalled();
  expect(pi.setThinkingLevel).not.toHaveBeenCalled();
  expect(pi.getThinkingLevel).not.toHaveBeenCalled();
});
it('supports effort-only and model-only overrides', async () => {
  const { model, ctx, pi } = host();
  expect(
    await applyProfileOrchestrator(pi, ctx, {
      agents: {},
      orchestrator: { effort: 'high' },
    }),
  ).toMatchObject({ status: 'applied' });
  expect(pi.setModel).not.toHaveBeenCalled();
  pi.setThinkingLevel.mockClear();
  expect(
    await applyProfileOrchestrator(pi, ctx, {
      agents: {},
      orchestrator: { model },
    }),
  ).toMatchObject({ status: 'applied' });
  expect(pi.setThinkingLevel).not.toHaveBeenCalled();
});
