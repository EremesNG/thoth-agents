import { render } from 'ink';
import { App } from './App';

export async function runInteractiveTui(): Promise<number> {
  const instance = render(<App />);
  await instance.waitUntilExit();
  return 0;
}

export { App };
