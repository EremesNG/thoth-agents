import {
  createAssistantMessageEventStream,
  envApiKeyAuth,
} from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { trace } from './provider-fixture.js';

export default function nativeOnlyProvider(pi: ExtensionAPI) {
  pi.registerProvider({
    id: 'native-only-fixture',
    name: 'Native-only fixture',
    auth: { apiKey: envApiKeyAuth('Fixture', []) },
    getModels: () => [],
    stream: () => createAssistantMessageEventStream(),
    streamSimple: () => createAssistantMessageEventStream(),
  });
  trace('native-only:loaded');
  pi.on('session_shutdown', () => trace('native-only:session_shutdown'));
}
