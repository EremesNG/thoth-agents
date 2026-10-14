import fs from 'node:fs';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { describe, expect, it, vi } from 'vitest';
import type { ModalSession } from '../../src/model-profiles/command.js';
import {
  buildNonTuiModelProfilesMessage,
  createSubagentModelProfilesModal,
  runSubagentModelsCommand,
} from '../../src/model-profiles-ui.js';
import type { ThinkingEffort } from '../../src/types.js';
import {
  AVAILABLE_MODELS,
  KEYS,
  type ProfileEnv,
  stripAnsi,
  useProfileEnv,
} from './support.js';

const theme = { fg: (_role: string, text: string) => text };

type Live = {
  model?: { provider: string; id: string };
  effort?: ThinkingEffort;
};

function open(
  env: ProfileEnv,
  height = 40,
  session?: ModalSession,
  availableModels = AVAILABLE_MODELS,
) {
  const done = vi.fn();
  const workspace = env.workspace();
  const modal = createSubagentModelProfilesModal({
    workspace,
    session,
    availableModels,
    theme,
    maxHeight: () => height,
    done,
  });
  const press = (...keys: string[]) => {
    for (const key of keys) modal.handleInput(key);
  };
  const text = (width = 110) => stripAnsi(modal.render(width).join('\n'));
  /** Type a name into the prompt and confirm it. */
  const typeName = (name: string) => press(...name.split(''), KEYS.enter);
  return { modal, workspace, done, press, text, typeName };
}

const profile = (model: string, effort: string, reviewer = model) => ({
  agents: {
    analyst: { model, effort },
    reviewer: { model: reviewer, effort },
  },
});

const BACKSPACE = '\u007f';

describe('named model profile panel', () => {
  const env = useProfileEnv();

  function seed() {
    env().writeProfiles('global', {
      active: 'shared',
      profiles: {
        shared: profile('openai/gpt-5.5', 'high'),
        solo: profile('openai/gpt-5.5', 'low'),
      },
    });
    env().writeProfiles('project', {
      profiles: { shared: profile('anthropic/claude-x', 'medium') },
    });
  }

  describe('layout', () => {
    it('renders a profile sidebar beside the agent list at wide widths', () => {
      seed();
      env().store.setProjectPin('shared');
      env().session.value = 'solo';
      const { modal, text } = open(env());
      const plain = text(110);
      const lines = plain.split('\n');
      expect(plain).toContain('Profiles');
      expect(plain).toContain('Subagent model profiles');
      // default first, then local, then global profiles with tags and markers
      const sidebar = lines.map((line) => line.slice(0, 28)).join('\n');
      expect(sidebar.indexOf('default')).toBeLessThan(
        sidebar.indexOf('shared (local)'),
      );
      expect(sidebar).toMatch(/ P\s+shared \(local\)/);
      expect(sidebar).toMatch(/G\s+shared \(global\)~/);
      expect(sidebar).toMatch(/● S\s+solo \(global\)/);
      expect(plain).toContain('● effective');
      // agent detail shows effective model/effort of the selected profile
      expect(plain).toMatch(/analyst\s+openai\/gpt-5\.5\s+low/);
      expect(plain).toMatch(/reviewer\s+anthropic\/claude-x\s+high/);
      expect(lines.every((line) => panelVisibleWidth(line) === 110)).toBe(true);
      for (const width of [90, 100, 120, 160])
        expect(
          modal.render(width).every((line) => panelVisibleWidth(line) <= width),
        ).toBe(true);
    });

    it('stacks the profile list above the agents when narrow', () => {
      seed();
      const { modal, text } = open(env());
      const plain = text(70);
      expect(plain).not.toContain('Profiles');
      expect(plain).toContain('profile 1/4');
      expect(plain).toMatch(/› +default/);
      expect(plain).toMatch(/● +shared \(local\)/);
      expect(plain).toMatch(/G +shared \(global\)~/);
      for (const width of [1, 3, 5, 20, 42, 60, 89, 90])
        expect(
          modal.render(width).every((line) => panelVisibleWidth(line) <= width),
        ).toBe(true);
    });

    it('switches to the sidebar exactly at width 90', () => {
      const { modal } = open(env());
      expect(stripAnsi(modal.render(89).join('\n'))).not.toContain('Profiles');
      expect(stripAnsi(modal.render(90).join('\n'))).toContain('Profiles');
    });

    it('measures wide glyphs in cells and keeps the shell hints', () => {
      env().writeProfiles('global', {
        profiles: { 界界界界界界界界界界: profile('openai/gpt-5.5', 'low') },
      });
      const { modal, press, text } = open(env());
      press(KEYS.right);
      expect(text(100)).toContain('界界');
      expect(
        modal.render(100).every((line) => panelVisibleWidth(line) === 100),
      ).toBe(true);
      expect(text(100)).toContain('esc/q close');
    });
  });

  describe('browsing and activation', () => {
    it('uses default for a dangling global active even when a project profile has that name', () => {
      env().writeProfiles('global', { active: 'orphan', profiles: {} });
      env().writeProfiles('project', {
        profiles: { orphan: profile('anthropic/claude-x', 'max') },
      });
      const { workspace } = open(env());
      expect(workspace.effective()).toEqual({ name: 'default' });
      expect(workspace.markers(workspace.entries()[0]).effective).toBe(true);
      expect(workspace.markers(workspace.entries()[1]).effective).toBe(false);
      env().session.value = 'orphan';
      expect(env().workspace().effective()).toEqual({
        name: 'orphan',
        scope: 'project',
      });
      env().session.value = undefined;
      env().store.setProjectPin('orphan');
      workspace.reload();
      expect(workspace.effective()).toEqual({
        name: 'orphan',
        scope: 'project',
      });
    });

    it('shadows an existing global active with the same-named project profile', () => {
      seed();
      const { workspace } = open(env());
      expect(workspace.effective()).toEqual({
        name: 'shared',
        scope: 'project',
      });
      expect(workspace.markers(workspace.entries()[1]).effective).toBe(true);
      expect(workspace.markers(workspace.entries()[2]).effective).toBe(false);
    });

    it('browses profiles with left/right without activating anything', () => {
      seed();
      const { press, text } = open(env());
      press(KEYS.right);
      expect(text()).toContain('profile 2/4');
      expect(text()).toMatch(/analyst\s+anthropic\/claude-x\s+medium/);
      press(KEYS.right, KEYS.right, KEYS.right, KEYS.right);
      expect(text()).toContain('profile 4/4');
      press(KEYS.left, KEYS.left, KEYS.left, KEYS.left, KEYS.left);
      expect(text()).toContain('profile 1/4');
      expect(env().session.history).toEqual([]);
      expect(env().readFile('global').active).toBe('shared');
      expect(env().store.read('project').active).toBeUndefined();
    });

    it('moves between agents with arrows and j/k', () => {
      const { press, text } = open(env());
      expect(text()).toMatch(/›\s+orchestrator/);
      press(KEYS.down);
      expect(text()).toMatch(/›\s+analyst/);
      press('j');
      expect(text()).toMatch(/›\s+reviewer/);
      press('k');
      expect(text()).toMatch(/›\s+analyst/);
      press('j');
      expect(text()).toMatch(/›\s+reviewer/);
    });

    it('u/g/p set and toggle session, global active and project pin', () => {
      seed();
      const { press, text } = open(env());
      // order: default, shared (local), shared (global, shadowed), solo (global)
      press(KEYS.right, KEYS.right);
      press('u');
      expect(text()).toContain('shadowed by the local profile');
      press('p');
      expect(text()).toContain('shadowed by the local profile');
      press('g');
      expect(text()).toContain('Cleared the global active (shared)');
      expect(env().store.read('global').active).toBeUndefined();
      press('g');
      expect(env().store.read('global').active).toBe('shared');

      press(KEYS.right); // solo (global)
      press('u');
      expect(env().session.value).toBe('solo');
      expect(text()).toContain('Session now uses solo');
      press('u');
      expect(env().session.value).toBeUndefined();
      press('p');
      expect(env().store.read('project').active).toBe('solo');
      press('g');
      expect(env().store.read('global').active).toBe('solo');

      press(KEYS.left, KEYS.left); // shared (local)
      press('g');
      expect(text()).toContain('Global active must be a global profile');
      press('p');
      expect(env().store.read('project').active).toBe('shared');
    });

    it('intercepts g before the shell treats it as Home', () => {
      seed();
      const { press, text } = open(env());
      press(KEYS.down, KEYS.down); // agent cursor on reviewer
      press('g');
      expect(text()).toMatch(/›\s+reviewer/);
      expect(text()).toContain('Global active profile is default');
    });

    it('toggling the session selection clears it', () => {
      seed();
      env().session.value = 'solo';
      const { press, text } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right); // solo
      press('u');
      expect(env().session.value).toBeUndefined();
      expect(text()).toContain('Cleared the session selection');
    });
  });

  describe('lifecycle', () => {
    it('creates a draft from default and an unedited save stores a full copy', () => {
      const { press, text, typeName, workspace } = open(env());
      press('n');
      expect(text()).toContain('New profile from default');
      typeName('fresh');
      expect(text()).toContain('Scope for fresh');
      press(KEYS.enter); // project (first)
      expect(text()).toContain('fresh (local) · draft: unsaved');
      expect(text()).toContain('pending: 1 change');
      expect(fs.existsSync(env().store.paths.project)).toBe(false);
      press('s');
      expect(text()).toContain('Saved fresh (local)');
      expect(workspace.pendingCount()).toBe(0);
      expect(env().readFile('project').profiles.fresh.agents).toEqual({
        analyst: { model: 'openai/gpt-5.5', effort: 'low' },
        reviewer: { model: 'anthropic/claude-x', effort: 'high' },
      });
      expect(text()).not.toContain('draft');
    });

    it('clones the selected profile into a draft in the chosen scope', () => {
      seed();
      const { press, text, typeName } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right); // solo (global)
      press('c');
      typeName('solo-copy');
      press(KEYS.down, KEYS.enter); // global
      expect(text()).toContain('solo-copy (global) · draft: unsaved');
      expect(text()).toMatch(/analyst\s+openai\/gpt-5\.5\s+low/);
      press('s');
      expect(env().readFile('global').profiles['solo-copy'].agents).toEqual(
        env().readFile('global').profiles.solo.agents,
      );
    });

    it('rejects reserved and empty names, and duplicates in the same scope', () => {
      seed();
      const { press, text, typeName } = open(env());
      press('n');
      typeName('default');
      expect(text()).toContain('default is a reserved virtual profile');
      press(KEYS.esc);
      press('n', KEYS.enter);
      expect(text()).toContain('Profile name must be non-empty');
      press(KEYS.esc);
      press('n');
      typeName('shared');
      press(KEYS.enter); // project scope already has shared
      expect(text()).toContain('already exists in project scope');
      expect(Object.keys(env().readFile('project').profiles)).toEqual([
        'shared',
      ]);
    });

    it('edits agent model and effort through the pickers and saves them', () => {
      seed();
      const { press, text, workspace } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right); // solo (global)
      press(KEYS.down, KEYS.enter); // skip the orchestrator row
      expect(text()).toContain('Select model provider for analyst in solo');
      press(KEYS.down, KEYS.down); // reset, anthropic, openai
      press(KEYS.enter);
      expect(text()).toContain('Select openai model for analyst');
      press(KEYS.enter); // gpt-5.5
      expect(text()).toContain('Choose effort');
      press(KEYS.enter); // keep the highlighted current effort
      expect(workspace.pendingCount()).toBe(0);
      press('e', KEYS.down, KEYS.down, KEYS.down, KEYS.enter);
      expect(workspace.pendingCount()).toBe(1);
      expect(text()).toContain('pending: 1 change');
      expect(text()).toContain('solo* (global)');
      press('s');
      expect(workspace.pendingCount()).toBe(0);
      const saved = env().readFile('global').profiles.solo.agents;
      expect(saved.analyst.model).toBe('openai/gpt-5.5');
      expect(saved.analyst.effort).not.toBe('low');
      expect(saved.reviewer).toEqual({
        model: 'openai/gpt-5.5',
        effort: 'low',
      });
    });

    it('resets an agent value to the default effective value', () => {
      seed();
      const { press, workspace } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right, KEYS.down); // solo, analyst
      press('m', KEYS.enter); // "reset to default model"
      const solo = workspace.entries().find((entry) => entry.name === 'solo');
      // analyst default = orchestrator gpt-5.5, so no change versus saved
      expect(solo?.agents.analyst.model).toEqual({
        provider: 'openai',
        id: 'gpt-5.5',
      });
      press(KEYS.down, 'm', KEYS.enter);
      expect(solo?.agents.reviewer.model).toEqual({
        provider: 'anthropic',
        id: 'claude-x',
      });
      expect(workspace.pendingCount()).toBe(1);
    });

    it('offers a new profile when editing default and protects it', () => {
      const { press, text } = open(env());
      press(KEYS.enter);
      expect(text()).toContain('default is read-only');
      expect(text()).toContain('Create a new profile from default');
      press(KEYS.enter);
      expect(text()).toContain('New profile from default');
      press(KEYS.esc);
      press('r');
      expect(text()).toContain('default cannot be renamed');
      press('d');
      expect(text()).toContain('default cannot be deleted');
      press('s');
      expect(text()).toContain('default is read-only');
    });

    it('declining the default edit offer changes nothing', () => {
      const { press, text, workspace } = open(env());
      press(KEYS.enter, KEYS.down, KEYS.enter);
      expect(text()).toContain('profile 1/1');
      expect(workspace.pendingCount()).toBe(0);
    });

    it('renames saved profiles in their file', () => {
      seed();
      const { press, text, typeName } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right); // solo
      press('r');
      expect(text()).toContain('Rename solo');
      press(KEYS.esc);
      expect(text()).toContain('Subagent model profiles');
      press('r', BACKSPACE, BACKSPACE, BACKSPACE, BACKSPACE);
      typeName('duo');
      expect(text()).toContain('Renamed solo to duo');
      expect(Object.keys(env().readFile('global').profiles).sort()).toEqual([
        'duo',
        'shared',
      ]);
      expect(text()).toContain('duo (global)');
    });

    it('edits a rename at the cursor without moving the profile selection', () => {
      seed();
      const { modal, press, text } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right, 'r'); // solo
      press(KEYS.left, KEYS.left);
      expect(modal.render(110).join('\n')).toContain(
        'name: so\u001b[7ml\u001b[27mo',
      );
      press('X', KEYS.right, BACKSPACE, '\u001b[3~', 'ab');
      expect(text()).toContain('name: soXab');
      press(KEYS.enter);
      expect(text()).toContain('Renamed solo to soXab');
      expect(env().readFile('global').profiles.soXab).toBeDefined();
      expect(env().readFile('global').profiles.shared).toBeDefined();
      expect(text()).toContain('profile 4/4');
    });

    it.each([
      'n',
      'c',
    ])('edits new names with %s using jumps and pasted text', (key) => {
      const { modal, press, text, workspace } = open(env());
      press(key, 'ac', '\u001b[H', KEYS.left, KEYS.right);
      press('\u001b[200~b\u001b[201~');
      expect(modal.render(110).join('\n')).toContain(
        'name: ab\u001b[7mc\u001b[27m',
      );
      press('\u001b[F', KEYS.right, BACKSPACE, 'd');
      press('\u0001', '\u001b[3~', 'A', '\u0005', 'e');
      expect(text()).toContain('name: Abde');
      press(KEYS.enter);
      expect(text()).toContain('Scope for Abde');
      press(KEYS.enter);
      expect(workspace.entries().some((entry) => entry.name === 'Abde')).toBe(
        true,
      );
    });

    it('keeps clear, validation and cancel behavior while editing a rename', () => {
      seed();
      const { press, text, done } = open(env());
      press(KEYS.right, 'r', KEYS.left, '\u0015', KEYS.enter);
      expect(text()).toContain('Profile name must be non-empty');
      press('changed', KEYS.left, KEYS.right, KEYS.esc);
      expect(text()).toContain('profile 2/4');
      expect(env().readFile('project').profiles.shared).toBeDefined();
      expect(done).not.toHaveBeenCalled();
    });

    it('scrolls long names to keep a grapheme cursor visible within the frame', () => {
      const { modal, press } = open(env());
      press('n', 'abcdefghijklmnop界🙂', KEYS.left, BACKSPACE);
      const raw = modal.render(24).join('\n');
      expect(raw).toContain('\u001b[7m🙂\u001b[27m');
      expect(
        modal.render(24).every((line) => panelVisibleWidth(line) <= 24),
      ).toBe(true);
    });

    it('renames drafts in memory without writing', () => {
      const { press, text, typeName } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter);
      press('r', BACKSPACE, BACKSPACE, BACKSPACE);
      typeName('other');
      expect(text()).toContain('other (local) · draft: unsaved');
      expect(fs.existsSync(env().store.paths.project)).toBe(false);
    });

    it('rename carries the project pin and session selection', () => {
      seed();
      env().store.setProjectPin('solo');
      env().session.value = 'solo';
      const { press, typeName } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right); // solo
      press('r', BACKSPACE, BACKSPACE, BACKSPACE, BACKSPACE);
      typeName('duo');
      expect(env().store.read('project').active).toBe('duo');
      expect(env().session.value).toBe('duo');
    });

    it('delete confirms and reports cleared global active and project pin', () => {
      seed();
      env().store.setProjectPin('solo');
      env().store.setGlobalActive('solo');
      const { press, text } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right); // solo
      press('d');
      expect(text()).toContain('Delete solo?');
      expect(text()).toContain('global active');
      expect(text()).toContain('project pin');
      press(KEYS.down, KEYS.enter); // keep it
      expect(env().readFile('global').profiles.solo).toBeDefined();
      press('d', KEYS.enter);
      expect(text()).toContain('Deleted solo.');
      expect(text()).toContain('Cleared project pin, global active');
      expect(env().readFile('global').profiles.solo).toBeUndefined();
      expect(env().readFile('global').active).toBeUndefined();
      expect(env().store.read('project').active).toBeUndefined();
    });

    it('deleting a draft discards it without touching files', () => {
      const { press, text, typeName, workspace } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter);
      expect(workspace.pendingCount()).toBe(1);
      press('d', KEYS.enter);
      expect(workspace.pendingCount()).toBe(0);
      expect(text()).not.toContain('tmp (local)');
      expect(fs.existsSync(env().store.paths.project)).toBe(false);
    });

    it('refuses to activate an unsaved draft', () => {
      const { press, text, typeName } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter);
      press('u');
      expect(text()).toContain('Save the draft before using it');
    });
  });

  describe('combined model and effort editing', () => {
    const models = [
      {
        provider: 'openai',
        id: 'gpt-5.5',
        label: 'GPT 5.5',
        reasoning: true,
        thinkingLevelMap: {
          minimal: null,
          low: null,
          medium: 'medium',
          high: 'high',
          xhigh: null,
          max: null,
        },
      },
      {
        provider: 'anthropic',
        id: 'claude-x',
        label: 'Claude X',
        reasoning: false,
      },
    ];

    function setup(row: 'orchestrator' | 'analyst', model: string) {
      env().writeProfiles('global', {
        profiles: {
          editable: {
            orchestrator: { model, effort: 'off' },
            agents: { analyst: { model, effort: 'off' } },
          },
        },
      });
      const panel = open(
        env(),
        40,
        { model: () => ({ provider: 'openai', id: 'gpt-5.5' }) },
        models,
      );
      panel.press(KEYS.right);
      if (row === 'analyst') panel.press(KEYS.down);
      const entry = panel.workspace
        .entries()
        .find((e) => e.name === 'editable');
      if (!entry) throw new Error('Missing editable profile');
      const values = () =>
        row === 'orchestrator' ? entry.orchestrator : entry.agents.analyst;
      return { ...panel, values };
    }

    function expectReasoningChoices(text: string) {
      expect(text).toContain('Choose effort');
      for (const level of ['off', 'medium', 'high'])
        expect(text).toMatch(new RegExp(`(?:›| ) +${level} +`));
      for (const level of ['minimal', 'low', 'xhigh', 'max'])
        expect(text).not.toMatch(new RegExp(`(?:›| ) +${level} +`));
    }

    it.each([
      'orchestrator',
      'analyst',
    ] as const)('uses the newly selected reasoning model for %s and stages high', (row) => {
      const { press, text, values, workspace } = setup(
        row,
        'anthropic/claude-x',
      );
      press(KEYS.enter, KEYS.down, KEYS.down, KEYS.enter, KEYS.enter);
      expectReasoningChoices(text());
      press(KEYS.down, KEYS.down, KEYS.enter); // off -> medium -> high
      expect(values()).toEqual({
        model: { provider: 'openai', id: 'gpt-5.5' },
        effort: 'high',
      });
      expect(workspace.pendingCount()).toBe(1);
      const saved = env().readFile('global').profiles.editable;
      expect(
        (row === 'orchestrator' ? saved.orchestrator : saved.agents.analyst)
          .effort,
      ).toBe('off');
    });

    it.each([
      'orchestrator',
      'analyst',
    ] as const)('offers only reset/off after selecting a non-reasoning model for %s', (row) => {
      const { press, text, values } = setup(row, 'openai/gpt-5.5');
      press(KEYS.enter, KEYS.down, KEYS.enter, KEYS.enter);
      expect(text()).toContain('Choose effort');
      expect(text()).toContain(
        row === 'orchestrator'
          ? 'reset to session effort'
          : 'reset to default effort',
      );
      expect(text()).toMatch(/› +off +/);
      for (const level of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
        expect(text()).not.toMatch(new RegExp(`(?:›| ) +${level} +`));
      press(KEYS.enter);
      expect(values()).toEqual({
        model: { provider: 'anthropic', id: 'claude-x' },
        effort: 'off',
      });
    });

    it.each([
      'orchestrator',
      'analyst',
    ] as const)('uses the fallback reasoning model after resetting the model for %s', (row) => {
      const { press, text, values } = setup(row, 'anthropic/claude-x');
      press(KEYS.enter, KEYS.enter); // reset model, then effort
      expectReasoningChoices(text());
      press(KEYS.down, KEYS.down, KEYS.enter);
      expect(values()?.effort).toBe('high');
      expect(values()?.model).toEqual(
        row === 'orchestrator'
          ? undefined
          : { provider: 'openai', id: 'gpt-5.5' },
      );
    });
  });

  describe('closing', () => {
    it('closes immediately when clean', () => {
      const { press, done } = open(env());
      press(KEYS.esc);
      expect(done).toHaveBeenCalledExactlyOnceWith({
        action: 'close',
        discarded: 0,
      });
    });

    it('asks before discarding drafts and unsaved edits', () => {
      seed();
      const { press, text, typeName, done } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter);
      press(KEYS.esc);
      expect(text()).toContain('Discard unsaved draft?');
      expect(done).not.toHaveBeenCalled();
      press('k');
      expect(text()).toContain('Subagent model profiles');
      press('q', 'd');
      expect(done).toHaveBeenCalledExactlyOnceWith({
        action: 'close',
        discarded: 1,
      });
      expect(env().readFile('project').profiles.tmp).toBeUndefined();
    });

    it('saving clears the pending state so closing no longer asks', () => {
      const { press, typeName, done } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter, 's', KEYS.esc);
      expect(done).toHaveBeenCalledWith({ action: 'close', discarded: 0 });
    });
  });

  describe('store errors', () => {
    it('shows a save failure instead of swallowing it', () => {
      const { press, text, typeName } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter);
      // A directory in place of the file makes the store read fail.
      fs.mkdirSync(env().store.paths.project, { recursive: true });
      press('s');
      expect(text()).toContain('Cannot read model profiles');
      expect(text()).toContain('draft: unsaved');
    });

    it('reports a malformed profiles file when opening the command', async () => {
      env().writeProfiles('global', { profiles: { bad: { agents: [] } } });
      const notify = vi.fn();
      const message = await runSubagentModelsCommand(
        env().ctx({ ui: { custom: vi.fn(), notify } }),
      );
      expect(message).toContain('Cannot read model profiles');
      expect(notify).toHaveBeenCalledWith(message, 'error');
    });
  });

  describe('non-overlay flows', () => {
    it('lists profiles in the non-TUI message', async () => {
      seed();
      const message = await runSubagentModelsCommand(env().ctx());
      expect(message).toContain('/subagents-model');
      expect(message).toContain('default');
      expect(message).toContain('shared (local)');
      expect(message).toMatch(/G +shared \(global\) \[shadowed\]/);
      expect(
        buildNonTuiModelProfilesMessage(undefined, env().agentDir),
      ).toContain(env().store.paths.global);
    });

    it('ui.select flow only lists and activates', async () => {
      seed();
      const select = vi
        .fn()
        .mockImplementationOnce(async (_title: string, choices: string[]) =>
          choices.find((choice) => choice.includes('solo (global)')),
        )
        .mockImplementationOnce(async () => 'Use for this session');
      const notify = vi.fn();
      const message = await runSubagentModelsCommand(
        env().ctx({ ui: { select, notify } }),
      );
      expect(message).toBe('Session now uses solo.');
      expect(env().session.value).toBe('solo');
      expect(notify).toHaveBeenCalledWith(message, 'info');
      expect(select.mock.calls[1][1]).toEqual([
        'Use for this session',
        'Set as global active',
        'Pin to this project',
        'Cancel',
      ]);
    });

    it('ui.select flow sets the global active profile and pin, and can cancel', async () => {
      seed();
      const pick = (needle: string, action: string) =>
        vi
          .fn()
          .mockImplementationOnce(async (_t: string, c: string[]) =>
            c.find((choice) => choice.includes(needle)),
          )
          .mockImplementationOnce(async () => action);
      await runSubagentModelsCommand(
        env().ctx({
          ui: { select: pick('solo (global)', 'Set as global active') },
        }),
      );
      expect(env().store.read('global').active).toBe('solo');
      await runSubagentModelsCommand(
        env().ctx({
          ui: { select: pick('shared (local)', 'Pin to this project') },
        }),
      );
      expect(env().store.read('project').active).toBe('shared');
      const cancelled = await runSubagentModelsCommand(
        env().ctx({ ui: { select: vi.fn(async () => 'Cancel') } }),
      );
      expect(cancelled).toContain('Cancelled');
    });

    it('ui.select flow reports activation errors', async () => {
      seed();
      const notify = vi.fn();
      const select = vi
        .fn()
        .mockImplementationOnce(async (_t: string, c: string[]) =>
          c.find((choice) => choice.includes('shared (global)')),
        )
        .mockImplementationOnce(async () => 'Pin to this project');
      const message = await runSubagentModelsCommand(
        env().ctx({ ui: { select, notify } }),
      );
      expect(message).toContain('shadowed by the local profile');
      expect(notify).toHaveBeenCalledWith(message, 'error');
    });

    it('opens the overlay through ui.custom and reports the close', async () => {
      const notify = vi.fn();
      let options: unknown;
      const custom = vi.fn(async (factory: any, opts: unknown) => {
        options = opts;
        const panel = factory(
          { requestRender() {}, terminal: { rows: 40 } },
          theme,
          undefined,
          () => {},
        );
        expect(stripAnsi(panel.render(100).join('\n'))).toContain('Profiles');
        return { action: 'close', discarded: 2 };
      });
      const message = await runSubagentModelsCommand(
        env().ctx({
          ui: { custom, notify },
          modelRegistry: { getAvailable: async () => AVAILABLE_MODELS },
        }),
      );
      expect(options).toMatchObject({ overlay: true });
      expect(message).toBe(
        'Closed model profiles; discarded 2 unsaved drafts/edits.',
      );
      expect(notify).toHaveBeenCalledWith(message, 'warning');
    });
  });

  describe('orchestrator', () => {
    const orch = (model: string, effort?: string) => ({
      ...profile('openai/gpt-5.5', 'low'),
      orchestrator: { model, ...(effort ? { effort } : {}) },
    });

    function seedOrchestrator() {
      env().writeProfiles('global', {
        profiles: {
          solo: profile('openai/gpt-5.5', 'low'),
          boss: orch('anthropic/claude-x', 'high'),
        },
      });
    }

    /** A mutable live session plus a scripted activation applier. */
    function live(
      initial: Live = {},
      apply?: ModalSession['applyOrchestrator'],
    ) {
      const state: Live = {
        model: { provider: 'openai', id: 'gpt-5.5' },
        effort: 'low',
        ...initial,
      };
      const session: ModalSession = {
        model: () => state.model,
        effort: () => state.effort,
        applyOrchestrator: apply,
      };
      return { state, session };
    }

    const saved = () => env().readFile('global').profiles;
    // default, boss, solo (global profiles sort by name)
    const BOSS = [KEYS.right];
    const SOLO = [KEYS.right, KEYS.right];

    it('shows the orchestrator as the first row, "session model" when unset', () => {
      seedOrchestrator();
      const { press, text } = open(env(), 40, live().session);
      const wide = text(110);
      expect(wide).toMatch(/›\s+orchestrator\s+session model\s+session\s/);
      expect(wide.indexOf('orchestrator')).toBeLessThan(
        wide.indexOf('analyst'),
      );
      press(...BOSS);
      expect(text(110)).toMatch(/orchestrator\s+anthropic\/claude-x\s+high/);
      expect(text(70)).toMatch(/orchestrator\s+anthropic\/claude-x\s+high/);
      expect(text(50)).toContain('orchestrator · anthropic/claude-x');
      press(KEYS.left);
      expect(text(50)).toContain('orchestrator · session model · session');
    });

    it('edits the orchestrator through the pickers, saves and resets it', () => {
      seedOrchestrator();
      const { press, text, workspace } = open(env(), 40, live().session);
      press(...SOLO, KEYS.enter);
      expect(text()).toContain(
        'Select model provider for orchestrator in solo',
      );
      press(KEYS.down, KEYS.enter, KEYS.enter); // anthropic, claude-x
      expect(text()).toContain('Choose effort');
      press(KEYS.down, KEYS.down, KEYS.enter); // inherit, off, minimal
      expect(workspace.pendingCount()).toBe(1);
      expect(text()).toContain('solo* (global)');
      expect(saved().solo.orchestrator).toBeUndefined();
      press('s');
      expect(saved().solo.orchestrator).toEqual({
        model: 'anthropic/claude-x',
        effort: 'minimal',
      });
      // reset in the pickers returns both fields to unset
      press('m', KEYS.enter);
      press('e', KEYS.up, KEYS.up, KEYS.enter);
      expect(text()).toMatch(/orchestrator\s+session model\s+session\s/);
      expect(workspace.pendingCount()).toBe(1);
      press('s');
      expect(saved().solo.orchestrator).toBeUndefined();
    });

    it('labels reset choices as the session value', () => {
      seedOrchestrator();
      const { press, text } = open(env(), 40, live().session);
      press(...BOSS, 'm');
      expect(text()).toContain('reset to session model');
      press(KEYS.esc, 'e');
      expect(text()).toContain('reset to session effort');
    });

    it('is read-only in default and offers a new profile', () => {
      const { press, text, workspace } = open(env(), 40, live().session);
      press(KEYS.enter);
      expect(text()).toContain('default is read-only');
      expect(text()).toContain('edit orchestrator');
      press(KEYS.enter, ...'fresh'.split(''), KEYS.enter, KEYS.enter);
      const draft = workspace.entries().find((e) => e.name === 'fresh');
      expect(draft?.orchestrator).toBeUndefined();
      press('s');
      expect(env().readFile('project').profiles.fresh).not.toHaveProperty(
        'orchestrator',
      );
    });

    it('keeps the orchestrator across clone and rename', () => {
      seedOrchestrator();
      const { press, typeName, workspace } = open(env(), 40, live().session);
      press(...BOSS, 'c');
      typeName('copy');
      press(KEYS.enter, 's'); // project scope, then save
      const copied = { model: 'anthropic/claude-x', effort: 'high' };
      expect(env().readFile('project').profiles.copy.orchestrator).toEqual(
        copied,
      );
      press('r', '\u0015');
      typeName('renamed');
      const renamed = workspace.entries().find((e) => e.name === 'renamed');
      expect(renamed?.orchestrator?.model?.id).toBe('claude-x');
      expect(env().readFile('project').profiles.renamed.orchestrator).toEqual(
        copied,
      );
    });

    it('flags drift against the live session only when the effective orchestrator differs', () => {
      seedOrchestrator();
      env().store.setGlobalActive('boss');
      const { state, session } = live();
      const { text } = open(env(), 40, session);
      expect(text()).toContain(
        'drift: session openai/gpt-5.5 low ≠ profile anthropic/claude-x high',
      );
      state.model = { provider: 'anthropic', id: 'claude-x' };
      state.effort = 'high';
      expect(text()).not.toContain('drift:');
    });

    it('shows no drift without an effective orchestrator', () => {
      seedOrchestrator();
      env().store.setGlobalActive('solo');
      expect(open(env(), 40, live().session).text()).not.toContain('drift:');
    });

    it('captures the live session as an unsaved draft edit, repeatedly with fresh values', async () => {
      seedOrchestrator();
      const apply = vi.fn(async () => ({
        status: 'applied' as const,
        message: 'Profile orchestrator applied.',
      }));
      const { state, session } = live({}, apply);
      const { press, text, workspace } = open(env(), 40, session);
      press(...SOLO, 'o');
      expect(text()).toContain(
        'Orchestrator of solo set to openai/gpt-5.5 low',
      );
      expect(workspace.pendingCount()).toBe(1);
      expect(saved().solo.orchestrator).toBeUndefined();
      press('s');
      expect(saved().solo.orchestrator).toEqual({
        model: 'openai/gpt-5.5',
        effort: 'low',
      });
      // activating boss changes the live session; capture must read it fresh
      press(KEYS.left, 'u');
      state.model = { provider: 'anthropic', id: 'claude-x' };
      state.effort = 'high';
      await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
      press(KEYS.right, 'o');
      expect(text()).toContain('set to anthropic/claude-x high');
      press('s');
      expect(saved().solo.orchestrator).toEqual({
        model: 'anthropic/claude-x',
        effort: 'high',
      });
    });

    it('offers a new profile for o on default and errors without a session model', () => {
      seedOrchestrator();
      const first = open(env(), 40, live().session);
      first.press('o');
      expect(first.text()).toContain('capture the session model');
      const none = open(env(), 40, live({ model: undefined }).session);
      none.press(...SOLO, 'o');
      expect(none.text()).toContain('No current session model to capture.');
      expect(none.workspace.pendingCount()).toBe(0);
    });

    it.each([
      'applied',
      'clamped',
      'unavailable',
      'untouched',
    ] as const)('shows the %s activation outcome after u', async (status) => {
      seedOrchestrator();
      const message = `outcome ${status}`;
      const apply = vi.fn(async () => ({ status, message }));
      const { press, text } = open(env(), 40, live({}, apply).session);
      press(...BOSS, 'u');
      await vi.waitFor(() =>
        expect(text()).toContain(`Session now uses boss. ${message}`),
      );
    });

    it('applies after g and p and after toggle-clear, and survives apply failures', async () => {
      seedOrchestrator();
      const apply = vi
        .fn()
        .mockResolvedValue({ status: 'untouched', message: 'left alone' });
      const { press, text } = open(env(), 40, live({}, apply).session);
      press(...BOSS, 'g');
      await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
      press('p');
      await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
      press('p'); // toggle-clear the pin
      await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(3));
      await vi.waitFor(() =>
        expect(text()).toContain('Cleared the project pin'),
      );
      expect(text()).toContain('left alone');
      apply.mockRejectedValueOnce(new Error('boom'));
      press('u');
      await vi.waitFor(() => expect(text()).toContain('boom'));
    });

    it('wires live accessors and the applier from the command context', async () => {
      seedOrchestrator();
      const apply = vi.fn(async () => ({
        status: 'unavailable' as const,
        message: 'Orchestrator x unavailable.',
      }));
      const select = vi
        .fn()
        .mockImplementationOnce(async (_t: string, c: string[]) =>
          c.find((choice) => choice.includes('boss (global)')),
        )
        .mockImplementationOnce(async () => 'Use for this session');
      const message = await runSubagentModelsCommand(
        env().ctx({
          ui: { select, notify: vi.fn() },
          applyEffectiveProfileOrchestrator: apply,
        }),
      );
      expect(apply).toHaveBeenCalledTimes(1);
      expect(message).toBe(
        'Session now uses boss. Orchestrator x unavailable.',
      );
    });
  });
});
