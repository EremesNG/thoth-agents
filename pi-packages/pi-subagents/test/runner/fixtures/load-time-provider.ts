import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { fixtureProvider, trace } from './provider-fixture.js';

export default function loadTimeProvider(pi: ExtensionAPI) {
  pi.registerProvider(
    'load-time-fixture',
    fixtureProvider('child-owned provider streamed'),
  );
  pi.on('session_start', () => trace('load-time:session_start'));
  pi.on('before_agent_start', () => {
    trace('load-time:before_agent_start');
  });
  pi.on('session_shutdown', async () => {
    trace('load-time:session_shutdown');
    if (process.env.PI_SUBAGENTS_FIXTURE_SHUTDOWN === 'hang')
      await new Promise(() => {});
    if (process.env.PI_SUBAGENTS_FIXTURE_SHUTDOWN === 'throw')
      throw new Error('Fixture shutdown failed');
  });
}
