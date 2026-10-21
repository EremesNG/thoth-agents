import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

// A fresh VM exposes GC in Vitest workers and node:test without CLI flags.
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

export function renderChain<
  C extends { render(width: number): string[]; invalidate(): void },
>(render: (previous: C | undefined, index: number) => C) {
  const previous: WeakRef<C>[] = [];
  let latest = render(undefined, 0);
  for (let index = 1; index < 32; index++) {
    previous.push(new WeakRef(latest));
    latest = render(latest, index);
  }
  return { latest, previous };
}

export async function assertCollected(references: WeakRef<object>[]) {
  // WeakRef targets survive the current job. Yield before each full collection,
  // including after a failed deref check, rather than relying on memory pressure.
  for (let attempt = 0; attempt < 10; attempt++) {
    await setImmediate();
    gc();
    if (references.every((reference) => reference.deref() === undefined))
      return;
  }
  assert.equal(
    references.filter((reference) => reference.deref() !== undefined).length,
    0,
    'previous render components/results must be collectable while the latest stays mounted',
  );
}
