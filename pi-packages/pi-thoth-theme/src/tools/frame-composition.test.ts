import type { TextContent } from '@earendil-works/pi-ai';
import type { AgentToolResult } from '@earendil-works/pi-coding-agent';
import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, type TUI } from '@earendil-works/pi-tui';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { createCustomBashTool } from './bash.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createCustomPowerShellTool } from './powershell.ts';
import { createCustomReadTool } from './read.ts';
import { createCustomWriteTool } from './write.ts';

const config: ThemeConfig = {
  icons: 'nerd',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  images: { enabled: true },
  welcome: { enabled: true },
};

const cwd = process.cwd();

beforeAll(() => {
  initTheme('dark', false);
});

function createTestComponent(
  tool: any,
  toolCallId: string,
  args: Record<string, unknown>,
  options = { showImages: true },
) {
  const ui = { requestRender: () => {} } as TUI;
  return new ToolExecutionComponent(
    tool.name,
    toolCallId,
    args,
    options,
    tool,
    ui,
    cwd,
  );
}

function assertBorderContinuity(lines: string[]) {
  const plain = lines.map(stripTerminalSequences);
  const content = plain[0] === '' ? plain.slice(1) : plain;

  expect(content.length).toBeGreaterThanOrEqual(2);

  // Top border: first line starts with ╭ and ends with ╮
  expect(content[0]).toMatch(/^╭.*╮$/);

  // Bottom border: last line starts with ╰ and ends with ╯
  expect(content.at(-1)).toMatch(/^╰.*╯$/);

  // Intermediate lines: all lines between 0 and content.length - 1 must have left [│├] and right [│┤]
  for (let i = 1; i < content.length - 1; i++) {
    const row = content[i];
    expect(row).toMatch(/^[│├].*[│┤]$/);
  }

  // No blank rows inside content lines
  expect(content.some((line) => line.trim() === '')).toBe(false);

  // No second top border
  expect(
    content.slice(1).some((line) => line.includes('╭') || line.includes('╮')),
  ).toBe(false);
}

describe('Frame composition with real SDK ToolExecutionComponent', () => {
  describe('read tool', () => {
    it('composes joined frame for text file collapsed and expanded', () => {
      const read = createCustomReadTool(cwd, config);
      expect(read.renderShell).toBe('self');

      const component = createTestComponent(read, 'call-read-1', {
        path: 'src/index.ts',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'line 1\nline 2\nline 3\nline 4\nline 5',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const collapsedLines = component.render(80);
      assertBorderContinuity(collapsedLines);

      component.setExpanded(true);
      const expandedLines = component.render(80);
      assertBorderContinuity(expandedLines);
      expect(expandedLines.join('\n')).toContain('line 3');
    });

    it('composes joined frame for empty file collapsed and expanded', () => {
      const read = createCustomReadTool(cwd, config);
      const component = createTestComponent(read, 'call-read-empty', {
        path: 'empty.txt',
      });
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: '' } as TextContent],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const collapsedLines = component.render(80);
      assertBorderContinuity(collapsedLines);
      expect(collapsedLines.join('\n')).toContain('0 lines');

      component.setExpanded(true);
      const expandedLines = component.render(80);
      assertBorderContinuity(expandedLines);
      expect(expandedLines.join('\n')).toContain('(empty file)');
    });

    it('composes joined frame for image file note', () => {
      const read = createCustomReadTool(cwd, config);
      const component = createTestComponent(
        read,
        'call-read-img',
        { path: 'logo.png' },
        { showImages: false },
      );
      const result: AgentToolResult<unknown> = {
        content: [
          { type: 'text', text: 'Read image file' } as TextContent,
          {
            type: 'image',
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AP8AAP8FAAH/+lyI0QAAAABJRU5ErkJggg==',
          } as any,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('Read image file');
    });

    it('composes joined frame for error case', () => {
      const read = createCustomReadTool(cwd, config);
      const component = createTestComponent(read, 'call-read-err', {
        path: 'missing.ts',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'ENOENT: no such file or directory',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: true });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('ENOENT');
    });
  });

  describe('bash tool', () => {
    it('renders real SDK exit 0 with Exit 0 footer and continuity', () => {
      const bash = createCustomBashTool(cwd, config);
      expect(bash.renderShell).toBe('self');

      const component = createTestComponent(bash, 'call-bash-exit0', {
        command: 'echo "hello world"',
      });

      // Matches real SDK output at dist/core/tools/bash.js:288-305 for exit 0
      const result = {
        content: [{ type: 'text', text: 'hello world' }],
        details: { truncation: null, fullOutputPath: null },
        structuredContent: {
          output: 'hello world',
          truncated: false,
          exit_code: 0,
          wall_time_seconds: 0.1,
        },
        isError: false,
      };

      component.updateResult(result, false);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 0');
      expect(plain).not.toContain('running…');
    });

    it('renders real SDK exit 7 with Exit 7 footer, error styling, and continuity', () => {
      const bash = createCustomBashTool(cwd, config);
      const component = createTestComponent(bash, 'call-bash-exit7', {
        command: 'curl invalid://url',
      });

      // Matches real SDK output at dist/core/tools/bash.js:297-304 for exitCode !== 0
      const result = {
        content: [
          {
            type: 'text',
            text: 'curl: (7) Failed to connect\nCommand exited with code 7',
          },
        ],
        details: { truncation: null, fullOutputPath: null },
        structuredContent: {
          output: 'curl: (7) Failed to connect\nCommand exited with code 7',
          truncated: false,
          exit_code: 7,
          wall_time_seconds: 0.2,
        },
        isError: true,
      };

      component.updateResult(result, false);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 7');
      expect(plain).not.toContain('Exit 1');
      expect(plain).not.toContain('running…');
    });

    // ToolExecutionComponent drops structuredContent before rendering
    // (tool-execution.js:267), so these results carry only the SDK text, built
    // as appendStatus does (bash.js:256,297-305).
    it('ignores a status-like stdout line when the command exits 0', () => {
      const bash = createCustomBashTool(cwd, config);
      const component = createTestComponent(bash, 'call-bash-fake-status-0', {
        command: 'echo "Command exited with code 77"',
      });

      component.updateResult(
        {
          content: [{ type: 'text', text: 'Command exited with code 77' }],
          details: { truncation: null, fullOutputPath: null },
          isError: false,
        },
        false,
      );
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 0');
      expect(plain).not.toContain('Exit 77');
    });

    it('reads only the trailing SDK status when stdout also mentions one', () => {
      const bash = createCustomBashTool(cwd, config);
      const component = createTestComponent(bash, 'call-bash-fake-status-7', {
        command: 'echo "Command exited with code 77"; exit 7',
      });

      component.updateResult(
        {
          content: [
            {
              type: 'text',
              text: 'Command exited with code 77\n\nCommand exited with code 7',
            },
          ],
          details: { truncation: null, fullOutputPath: null },
          isError: true,
        },
        false,
      );
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 7');
      expect(plain).not.toContain('Exit 77');
    });

    it('renders real SDK partial result with running footer (no Exit) and continuity', () => {
      const bash = createCustomBashTool(cwd, config);
      const component = createTestComponent(bash, 'call-bash-partial', {
        command: 'npm run test:watch',
      });

      // Matches real SDK streaming at dist/core/tools/bash.js:188-194
      const result = {
        content: [{ type: 'text', text: 'Compiling tests...' }],
        details: { truncation: null, fullOutputPath: null },
        isError: false,
      };

      component.updateResult(result, true);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('running…');
      expect(plain).not.toContain('Exit');
    });

    it('freezes elapsed time at completion across expand and re-renders', async () => {
      const bash = createCustomBashTool(cwd, config);
      const component = createTestComponent(bash, 'call-bash-freeze', {
        command: 'sleep 0.05',
      });

      // Mark execution started so startedAt is recorded
      component.markExecutionStarted();
      component.render(80);

      // Simulate a small delay
      await new Promise((resolve) => setTimeout(resolve, 30));

      const result = {
        content: [{ type: 'text', text: 'finished sleeping' }],
        details: { truncation: null, fullOutputPath: null },
        structuredContent: {
          output: 'finished sleeping',
          truncated: false,
          exit_code: 0,
          wall_time_seconds: 0.05,
        },
        isError: false,
      };

      component.updateResult(result, false);
      const initialLines = component.render(80);
      assertBorderContinuity(initialLines);

      const initialPlain = initialLines.map(stripTerminalSequences).join('\n');
      const elapsedMatch = initialPlain.match(/(\d+(?:\.\d+)?(?:ms|s))/);
      const initialElapsed = elapsedMatch?.[1];

      // Delay further
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Re-render via expansion
      component.setExpanded(true);
      const expandedLines = component.render(80);
      assertBorderContinuity(expandedLines);
      const expandedPlain = expandedLines
        .map(stripTerminalSequences)
        .join('\n');
      expect(expandedPlain).toContain(initialElapsed);

      // Invalidate and re-render
      component.invalidate();
      const invalidatedLines = component.render(80);
      assertBorderContinuity(invalidatedLines);
      const invalidatedPlain = invalidatedLines
        .map(stripTerminalSequences)
        .join('\n');
      expect(invalidatedPlain).toContain(initialElapsed);
    });

    it('composes joined frame for bash error case', () => {
      const bash = createCustomBashTool(cwd, config);
      const component = createTestComponent(bash, 'call-bash-err', {
        command: 'invalid_cmd',
      });

      const result = {
        content: [
          {
            type: 'text',
            text: 'Command exited with code 127',
          },
        ],
        details: {},
        isError: true,
      };

      component.updateResult(result, false);
      const lines = component.render(80);
      assertBorderContinuity(lines);
      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 127');
    });
  });

  describe('powershell tool', () => {
    it('renders real SDK exit 0 with Exit 0 footer and continuity', () => {
      const ps = createCustomPowerShellTool(cwd, config);
      expect(ps.renderShell).toBe('self');

      const component = createTestComponent(ps, 'call-ps-exit0', {
        command: 'Write-Output "hello world"',
      });

      const result = {
        content: [{ type: 'text', text: 'hello world' }],
        details: { truncation: null, fullOutputPath: null },
        structuredContent: {
          output: 'hello world',
          truncated: false,
          exit_code: 0,
          wall_time_seconds: 0.1,
        },
        isError: false,
      };

      component.updateResult(result, false);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 0');
      expect(plain).not.toContain('running…');
    });

    it('renders real SDK exit 7 with Exit 7 footer, error styling, and continuity', () => {
      const ps = createCustomPowerShellTool(cwd, config);
      const component = createTestComponent(ps, 'call-ps-exit7', {
        command: 'Invoke-WebRequest invalid://url',
      });

      const result = {
        content: [
          {
            type: 'text',
            text: 'Invoke-WebRequest: Failed to connect\nCommand exited with code 7',
          },
        ],
        details: { truncation: null, fullOutputPath: null },
        structuredContent: {
          output:
            'Invoke-WebRequest: Failed to connect\nCommand exited with code 7',
          truncated: false,
          exit_code: 7,
          wall_time_seconds: 0.2,
        },
        isError: true,
      };

      component.updateResult(result, false);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 7');
      expect(plain).not.toContain('Exit 1');
      expect(plain).not.toContain('running…');
    });

    it('ignores a status-like stdout line when the command exits 0', () => {
      const ps = createCustomPowerShellTool(cwd, config);
      const component = createTestComponent(ps, 'call-ps-fake-status-0', {
        command: 'Write-Output "Command exited with code 77"',
      });

      component.updateResult(
        {
          content: [{ type: 'text', text: 'Command exited with code 77' }],
          details: { truncation: null, fullOutputPath: null },
          isError: false,
        },
        false,
      );
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 0');
      expect(plain).not.toContain('Exit 77');
    });

    it('reads only the trailing SDK status when stdout also mentions one', () => {
      const ps = createCustomPowerShellTool(cwd, config);
      const component = createTestComponent(ps, 'call-ps-fake-status-7', {
        command: 'Write-Output "Command exited with code 77"; exit 7',
      });

      component.updateResult(
        {
          content: [
            {
              type: 'text',
              text: 'Command exited with code 77\n\nCommand exited with code 7',
            },
          ],
          details: { truncation: null, fullOutputPath: null },
          isError: true,
        },
        false,
      );
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('Exit 7');
      expect(plain).not.toContain('Exit 77');
    });

    it('renders real SDK partial result with running footer (no Exit) and continuity', () => {
      const ps = createCustomPowerShellTool(cwd, config);
      const component = createTestComponent(ps, 'call-ps-partial', {
        command: 'Start-Sleep -Seconds 10',
      });

      const result = {
        content: [{ type: 'text', text: 'Sleeping...' }],
        details: { truncation: null, fullOutputPath: null },
        isError: false,
      };

      component.updateResult(result, true);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('running…');
      expect(plain).not.toContain('Exit');
    });

    it('strips ANSI SGR sequences from powershell output while maintaining border continuity', () => {
      const ps = createCustomPowerShellTool(cwd, config);
      const component = createTestComponent(ps, 'call-ps-sgr', {
        command: 'Get-Process',
      });

      const result = {
        content: [
          {
            type: 'text',
            text: '\x1b[32;1mPS /Users/demo> \x1b[0mGet-Process\nId ProcessName\n\x1b[33m1234\x1b[0m node',
          },
        ],
        details: { truncation: null, fullOutputPath: null },
        isError: false,
      };

      component.updateResult(result, false);
      const lines = component.render(80);
      assertBorderContinuity(lines);

      const plain = lines.map(stripTerminalSequences).join('\n');
      expect(plain).toContain('PS /Users/demo> Get-Process');
      expect(plain).toContain('1234 node');
      expect(plain).not.toContain('␛[32;1m');
    });
  });

  describe('ls tool', () => {
    it('composes joined frame for normal directory entries', () => {
      const ls = createCustomLsTool(cwd, config);
      expect(ls.renderShell).toBe('self');

      const component = createTestComponent(ls, 'call-ls-1', {
        path: 'src',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'src/\n  index.ts\n  tools/\n',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('index.ts');
    });

    it('composes joined frame for empty directory sentinel', () => {
      const ls = createCustomLsTool(cwd, config);
      const component = createTestComponent(ls, 'call-ls-empty', {
        path: 'empty-dir',
      });
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: '' } as TextContent],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('empty directory');
    });

    it('composes joined frame for ls error case', () => {
      const ls = createCustomLsTool(cwd, config);
      const component = createTestComponent(ls, 'call-ls-err', {
        path: 'non-existent',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'ENOENT: directory not found',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: true });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('ENOENT');
    });
  });

  describe('find tool', () => {
    it('composes joined frame for normal search matches', () => {
      const find = createCustomFindTool(cwd, config);
      expect(find.renderShell).toBe('self');

      const component = createTestComponent(find, 'call-find-1', {
        pattern: '*.ts',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'src/index.ts\nsrc/tools/bash.ts\nsrc/tools/read.ts',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('index.ts');
    });

    it('composes joined frame for no matches found sentinel', () => {
      const find = createCustomFindTool(cwd, config);
      const component = createTestComponent(find, 'call-find-empty', {
        pattern: '*.xyz',
      });
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: '' } as TextContent],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('no matches found');
    });

    it('composes joined frame for find error case', () => {
      const find = createCustomFindTool(cwd, config);
      const component = createTestComponent(find, 'call-find-err', {
        pattern: '*.ts',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'EACCES: permission denied',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: true });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('EACCES');
    });
  });

  describe('grep tool', () => {
    it('composes joined frame for grouped results', () => {
      const grep = createCustomGrepTool(cwd, config);
      expect(grep.renderShell).toBe('self');

      const component = createTestComponent(grep, 'call-grep-1', {
        pattern: 'renderShell',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'src/tools/bash.ts:12:renderShell: self\nsrc/tools/read.ts:15:renderShell: self',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('bash.ts');
    });

    it('composes ONE single joined frame for raw fallback (no second top border)', () => {
      const grep = createCustomGrepTool(cwd, config);
      const component = createTestComponent(grep, 'call-grep-raw', {
        pattern: 'something',
      });
      // Content that does not follow normal groupable path:line format triggers raw fallback
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'raw line without pattern format 1\nraw line without pattern format 2',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);

      // Verify border continuity: exactly one top border, exactly one bottom border, no blank rows
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('raw line without pattern format');
    });

    it('composes joined frame for no matches found sentinel', () => {
      const grep = createCustomGrepTool(cwd, config);
      const component = createTestComponent(grep, 'call-grep-empty', {
        pattern: 'nonexistent_pattern_12345',
      });
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: '' } as TextContent],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('no matches found');
    });

    it('composes joined frame for grep error case', () => {
      const grep = createCustomGrepTool(cwd, config);
      const component = createTestComponent(grep, 'call-grep-err', {
        pattern: '[invalid regex',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'Invalid regular expression: /[invalid regex/',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: true });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('Invalid regular expression');
    });
  });

  describe('edit tool', () => {
    it('composes joined frame for normal diff collapsed and expanded', () => {
      const edit = createCustomEditTool(cwd, config);
      expect(edit.renderShell).toBe('self');

      const component = createTestComponent(edit, 'call-edit-1', {
        path: 'src/index.ts',
      });
      const diff = [
        '--- a/src/index.ts',
        '+++ b/src/index.ts',
        '@@ -1,3 +1,4 @@',
        ' line 1',
        '-old line 2',
        '+new line 2',
        '+new line 3',
      ].join('\n');
      const result: AgentToolResult<unknown> = {
        content: [
          { type: 'text', text: 'Edit applied successfully' } as TextContent,
        ],
        details: { diff },
      };

      component.updateResult({ ...result, isError: false });
      const collapsedLines = component.render(80);
      assertBorderContinuity(collapsedLines);
      expect(collapsedLines.join('\n')).toContain('+2');

      component.setExpanded(true);
      const expandedLines = component.render(80);
      assertBorderContinuity(expandedLines);
      expect(expandedLines.join('\n')).toContain('+new line 3');
    });

    it('composes joined frame for edit error case', () => {
      const edit = createCustomEditTool(cwd, config);
      const component = createTestComponent(edit, 'call-edit-err', {
        path: 'src/index.ts',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'Could not find target content to replace',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: true });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('Could not find target content');
    });
  });

  describe('write tool', () => {
    it('composes joined frame for normal write collapsed and expanded', () => {
      const write = createCustomWriteTool(cwd, config);
      expect(write.renderShell).toBe('self');

      const component = createTestComponent(write, 'call-write-1', {
        path: 'src/created.ts',
        content: 'const a = 1;\nconst b = 2;\nconst c = 3;',
      });
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: 'Wrote 3 lines' } as TextContent],
        details: {},
      };

      component.updateResult({ ...result, isError: false });
      const collapsedLines = component.render(80);
      assertBorderContinuity(collapsedLines);
      expect(collapsedLines.join('\n')).toContain('+3 lines');

      component.setExpanded(true);
      const expandedLines = component.render(80);
      assertBorderContinuity(expandedLines);
      expect(expandedLines.join('\n')).toContain('const b = 2');
    });

    it('composes joined frame for write error case', () => {
      const write = createCustomWriteTool(cwd, config);
      const component = createTestComponent(write, 'call-write-err', {
        path: 'readonly.txt',
      });
      const result: AgentToolResult<unknown> = {
        content: [
          {
            type: 'text',
            text: 'EACCES: permission denied, open readonly.txt',
          } as TextContent,
        ],
        details: {},
      };

      component.updateResult({ ...result, isError: true });
      const lines = component.render(80);
      assertBorderContinuity(lines);
      expect(lines.join('\n')).toContain('EACCES');
    });
  });
});
