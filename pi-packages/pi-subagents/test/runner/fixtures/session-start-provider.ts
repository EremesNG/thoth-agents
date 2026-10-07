import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { fixtureProvider, trace } from './provider-fixture.js';

export default function sessionStartProvider(pi: ExtensionAPI) {
  pi.on('session_start', () => {
    trace('session-start:session_start');
    pi.registerProvider(
      'session-start-fixture',
      fixtureProvider('inherited provider streamed'),
    );
  });
  pi.on('before_agent_start', () => {
    trace('session-start:before_agent_start');
  });
  pi.on('session_shutdown', () => trace('session-start:session_shutdown'));
}
