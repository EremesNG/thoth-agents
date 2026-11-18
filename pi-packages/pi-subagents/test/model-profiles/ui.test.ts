import fs from 'node:fs';
import path from 'node:path';
import { renderFakeCursor } from '@earendil-works/pi-tui';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { describe, expect, it, vi } from 'vitest';
import type { ModalSession } from '../../src/model-profiles/command.js';
import {
  buildNonTuiModelProfilesMessage,
  createSubagentModelProfilesModal,
  runSubagentModelsCommand,
} from '../../src/model-profiles-ui.js';
import { resolveFallbackChain } from '../../src/profile-resolver.js';
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
      for (const width of [90, 110]) {
        const legend = text(width)
          .split('\n')
          .map((line) => line.slice(0, Math.floor(width * 0.25)))
          .join('\n');
        for (const marker of [
          'markers (not keys)',
          '● effective',
          'S session',
          'P pin  G global',
          '~ shadowed',
        ])
          expect(legend).toContain(marker);
      }
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

    it.each([
      'g',
      'G',
    ])('routes %s to global activation without replacing Home/End navigation', (key) => {
      seed();
      const { press, text } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right, KEYS.down); // solo, analyst
      press(key);
      expect(env().store.read('global').active).toBe('solo');
      expect(text()).toMatch(/›\s+analyst/);
      press(key);
      expect(env().store.read('global').active).toBeUndefined();
      expect(text()).toMatch(/›\s+analyst/);
      press('\u001b[H');
      expect(text()).toMatch(/›\s+orchestrator/);
      press('\u001b[F');
      expect(text()).toMatch(/›\s+reviewer/);
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
    it.each([
      's',
      'S',
    ])('saves the selected draft with %s and remains responsive until close', (key) => {
      const { press, text, typeName, workspace, done } = open(env());
      press('n');
      expect(text()).toContain('New profile from default');
      typeName('fresh');
      expect(text()).toContain('Scope for fresh');
      press(KEYS.enter);
      expect(text()).toContain('fresh (local) · draft: unsaved');
      expect(text()).toContain('pending: 1 change');
      expect(fs.existsSync(env().store.paths.project)).toBe(false);
      press(key);
      expect(workspace.pendingCount()).toBe(0);
      expect(env().readFile('project').profiles.fresh.agents).toEqual({
        analyst: { model: 'openai/gpt-5.5', effort: 'low' },
        reviewer: { model: 'anthropic/claude-x', effort: 'high' },
      });
      expect(text()).toContain('Saved fresh (local)');
      expect(text()).not.toContain('draft');
      expect(done).not.toHaveBeenCalled();
      press(KEYS.down);
      expect(text()).toMatch(/›\s+analyst/);
      press(KEYS.esc, 'q');
      expect(done).toHaveBeenCalledExactlyOnceWith({
        action: 'close',
        discarded: 0,
      });
    });

    it.each([
      ['M', 'Choose model provider'],
      ['E', 'Choose effort'],
      ['O', 'Orchestrator of solo set to openai/gpt-5.5 low'],
      ['N', 'New profile from default'],
      ['C', 'Clone profile from solo'],
      ['R', 'Rename solo'],
      ['D', 'Delete solo?'],
    ])('accepts uppercase %s as an overview command', (key, expected) => {
      seed();
      const { press, text } = open(env(), 40, {
        model: () => ({ provider: 'openai', id: 'gpt-5.5' }),
        effort: () => 'low',
      });
      press(KEYS.right, KEYS.right, KEYS.right, key);
      expect(text()).toContain(expected);
    });

    it('accepts uppercase U and P for session selection and project pin', () => {
      seed();
      const { press } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right, 'U');
      expect(env().session.value).toBe('solo');
      press('P');
      expect(env().store.read('project').active).toBe('solo');
      press('U', 'P');
      expect(env().session.value).toBeUndefined();
      expect(env().store.read('project').active).toBeUndefined();
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

    it.each([
      's',
      'S',
    ])('edits agent model and effort through the pickers and saves them with %s', (key) => {
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
      press(key);
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
        `name: so${renderFakeCursor('l')}o`,
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
        `name: ab${renderFakeCursor('c')}`,
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

    it.each([
      'n',
      'r',
    ])('advertises Ctrl-U clearing in the %s name prompt', (key) => {
      seed();
      const { press, text } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right, key);
      expect(text()).toContain('ctrl+u clear');
      press('name', '\u0015', KEYS.enter);
      expect(text()).toContain('Profile name must be non-empty');
    });

    it('describes Backspace deletion and Ctrl-U clearing in the model picker', () => {
      seed();
      const { press, text } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right, 'm');
      press(KEYS.down, KEYS.down, KEYS.enter); // openai models
      expect(text()).toContain('backspace delete');
      expect(text()).toContain('ctrl+u clear');
      expect(text()).not.toContain('backspace clear');
      press('pt');
      expect(text()).toContain('search: pt');
      press(BACKSPACE);
      expect(text()).toContain('search: p');
      press('\u0015');
      expect(text()).toContain('search: (type to filter)');
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
      expect(raw).toContain(renderFakeCursor('🙂'));
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

    it.each([
      'g',
      'G',
    ])('ignores %s during discard confirmation and preserves resume/discard controls', (key) => {
      seed();
      const { press, text, workspace, done } = open(env());
      press(KEYS.right, KEYS.right, KEYS.right);
      press('e', KEYS.down, KEYS.enter, KEYS.esc); // unsaved orchestrator effort
      expect(text()).toContain('Discard unsaved draft?');
      press(key);
      expect(env().store.read('global').active).toBe('shared');
      expect(text()).toContain('Discard unsaved draft?');
      expect(done).not.toHaveBeenCalled();
      press('k');
      expect(text()).toContain('Subagent model profiles');
      expect(workspace.pendingCount()).toBe(1);
      press('q', key, KEYS.esc);
      expect(text()).toContain('Subagent model profiles');
      expect(env().store.read('global').active).toBe('shared');
      press('q', key, 'd');
      expect(done).toHaveBeenCalledExactlyOnceWith({
        action: 'close',
        discarded: 1,
      });
      expect(
        env().readFile('global').profiles.solo.orchestrator,
      ).toBeUndefined();
      expect(env().store.read('global').active).toBe('shared');
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
    it.each([
      's',
      'S',
    ])('shows a save failure with %s and remains responsive', (key) => {
      const { press, text, typeName, done } = open(env());
      press('n');
      typeName('tmp');
      press(KEYS.enter);
      // A directory in place of the file makes the store read fail.
      fs.mkdirSync(env().store.paths.project, { recursive: true });
      press(key);
      expect(text()).toContain('Cannot read model profiles');
      expect(text()).toContain('draft: unsaved');
      expect(done).not.toHaveBeenCalled();
      press(KEYS.esc, 'd');
      expect(done).toHaveBeenCalledExactlyOnceWith({
        action: 'close',
        discarded: 1,
      });
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

  describe('fallback chains', () => {
    const CHAIN = ['anthropic/claude-x', 'openrouter/org/backup'];
    const seedChain = (fallback_models: string[] = CHAIN) =>
      env().writeProfiles('global', {
        profiles: {
          fb: {
            agents: {
              analyst: {
                model: 'openai/gpt-5.5',
                effort: 'high',
                fallback_models,
              },
            },
          },
        },
      });
    /** Select fb and its analyst row. */
    const openFb = (fallbacks: string[] = CHAIN, height = 40) => {
      seedChain(fallbacks);
      const view = open(env(), height);
      view.press(KEYS.right, KEYS.down);
      return view;
    };
    const savedAnalyst = () =>
      env().readFile('global').profiles.fb.agents.analyst;
    const maxWidth = (text: string) =>
      Math.max(...text.split('\n').map((line) => panelVisibleWidth(line)));

    it.each([
      [
        200,
        /analyst\s+openai\/gpt-5\.5\s+high\s+\[profile\] anthropic\/claude-x, openrouter\/org\/bac/,
      ],
      [100, /analyst\s+openai\/gpt-5\.5\s+high\s+\[profile\] anth/],
      [70, /analyst\s+openai\/gpt-5\.5\s+high\s+\[profile\] a/],
      [50, /analyst openai\/\S+ high \[profile\] a/],
    ])('shows source and a chain preview on an unselected row at %i columns', (width, row) => {
      const { text, press } = openFb();
      press(KEYS.down); // analyst is no longer selected
      const out = text(width);
      expect(out).toMatch(row);
      expect(maxWidth(out)).toBeLessThanOrEqual(width);
    });

    it('wraps a long chain in the selected footer so the last model stays readable', () => {
      const long = [
        'anthropic/claude-sonnet-5-5-long-name',
        'openrouter/org/some-very-long-model-name',
        'openrouter/org/another-long-backup-model',
        'openrouter/org/final-fallback-model',
      ];
      const { text } = openFb(long);
      for (const width of [50, 70, 110]) {
        const out = text(width);
        expect(out).toContain('final-fallback-model');
        expect(out).toContain('anthropic/claude-sonnet-5-5-long-name');
        expect(maxWidth(out)).toBeLessThanOrEqual(width);
      }
    });

    /** analyst: profile chain; reviewer: agent chain; planner: default chain. */
    const seedSources = () => {
      const dir = path.join(env().cwd, '.pi', 'subagents');
      fs.writeFileSync(
        path.join(dir, 'reviewer.md'),
        '---\nname: reviewer\ndescription: reviewer agent\nmodel: anthropic/claude-x\neffort: high\nfallback_models: [openrouter/org/agent-backup]\n---\nbody',
      );
      fs.writeFileSync(
        path.join(dir, 'planner.md'),
        '---\nname: planner\ndescription: planner agent\n---\nbody',
      );
      fs.writeFileSync(
        path.join(env().cwd, '.pi', 'subagents.json'),
        JSON.stringify({
          default_fallback_models: ['zeta/org/default-backup'],
        }),
      );
      seedChain();
    };
    const contentOf = (line: string) =>
      (line.includes('││') ? line.split('││')[1] : line)
        .replace(/^\s*│?\s?/, '')
        .replace(/\s*│\s*$/, '');

    it('keeps the source marker and >= 4 characters of the first fallback on every row at every width', () => {
      seedSources();
      const expected = [
        ['anal', 'profile', 'prof', 'anth'],
        ['revi', 'agent', 'agt', 'open'],
        ['plan', 'default', 'def', 'zeta'],
      ];
      for (let width = 40; width <= 220; width += 1) {
        const view = open(env());
        view.press(KEYS.right); // fb; the orchestrator row stays selected
        const out = view.text(width);
        expect(maxWidth(out), `width ${width}`).toBeLessThanOrEqual(width);
        for (const [prefix, source, short, first] of expected) {
          const line = out.split('\n').find((l) => l.includes(prefix)) ?? '';
          expect(line, `width ${width} ${source}`).toMatch(
            new RegExp(`\\[(${source}|${short})\\] ?${first}`),
          );
        }
      }
    });

    it('splits oversized model ids across footer rows at every width', () => {
      const ids = [
        'openrouter/anthropic/claude-3-5-sonnet-20241022:beta',
        'openrouter/org/another-long-backup-model-with-a-long-name',
        'x/y',
      ];
      for (let width = 40; width <= 220; width += 1) {
        const view = openFb(ids);
        const lines = view.text(width).split('\n').map(contentOf);
        const start = lines.findIndex((l) => l.startsWith('fallbacks ['));
        expect(start, `width ${width}`).toBeGreaterThan(-1);
        const footer = lines
          .slice(start)
          .filter((l) => !/^[╰─╯]+$/.test(l))
          .map((l) => l.replace(/^\s*(→\s*)?/, ''))
          .join('');
        for (const id of ids) expect(footer, `width ${width}`).toContain(id);
      }
    });

    it('shows an overflow row instead of silently dropping footer lines', () => {
      const ids = Array.from(
        { length: 6 },
        (_, i) => `openrouter/org/model-${i}`,
      );
      let overflowSeen = false;
      for (let height = 12; height <= 30; height += 1) {
        const text = openFb(ids, height).text(50);
        if (!text.includes('selected: analyst')) continue; // no footer room at all
        const overflow = /\+\d+ more · f to view/.test(text);
        overflowSeen ||= overflow;
        expect(overflow || text.includes('model-5'), `height ${height}`).toBe(
          true,
        );
      }
      expect(overflowSeen).toBe(true);
    });

    it('lists the whole inherited chain in the editor, scrollable at a bounded height', () => {
      const ids = Array.from(
        { length: 6 },
        (_, i) => `zeta/org/inherited-${i}`,
      );
      fs.mkdirSync(path.join(env().cwd, '.pi'), { recursive: true });
      fs.writeFileSync(
        path.join(env().cwd, '.pi', 'subagents.json'),
        JSON.stringify({ default_fallback_models: ids }),
      );
      seedChain([]);
      const view = open(env(), 14);
      view.press(KEYS.right, KEYS.down, 'f');
      const seen = new Set<string>();
      for (let step = 0; step < ids.length + 1; step += 1) {
        const text = view.text(60);
        expect(text).toContain('inherited [default] chain');
        for (const id of ids) if (text.includes(id)) seen.add(id);
        view.press(KEYS.down);
      }
      expect([...seen].sort()).toEqual(ids);
      view.press('d');
      expect(view.text(60)).toContain('Inherited entries are read-only');
    });

    /** Rows of the detail view: drop border, selection and dirty columns. */
    const detailText = (text: string) =>
      text
        .split('\n')
        .map(contentOf)
        .filter((l) => !/^[╰─╯╭]/.test(l))
        .map((l) => l.slice(4))
        .join('');
    const prefixed = Array.from(
      { length: 12 },
      (_, i) =>
        `openrouter/org/common-prefix-for-every-single-model:beta-${String(i + 1).padStart(2, '0')}`,
    );

    it('keeps the distinguishing suffix visible and each full id reachable at 50x14', () => {
      const view = openFb(prefixed, 14);
      view.press('f');
      const seen = new Set<string>();
      for (let i = 0; i < prefixed.length; i += 1) {
        const text = view.text(50);
        expect(maxWidth(text)).toBeLessThanOrEqual(50);
        for (const [n] of prefixed.entries())
          if (text.includes(`beta-${String(n + 1).padStart(2, '0')}`))
            seen.add(prefixed[n]);
        view.press(KEYS.enter); // detail view of this row
        const detail = view.text(50);
        expect(maxWidth(detail)).toBeLessThanOrEqual(50);
        expect(detailText(detail)).toContain(prefixed[i]);
        expect(detail).toContain(`${i + 1} of 12 effective`);
        expect(detail).toContain('[profile]');
        view.press(KEYS.esc); // back at the same index
        expect(view.text(50)).toMatch(
          new RegExp(`[›>]\\s+${i + 1}/12 openrout`),
        );
        view.press(KEYS.down);
      }
      expect(seen.size).toBe(prefixed.length);
    });

    it.each([
      40, 50,
    ])('shows the whole id in the detail view at %i columns', (width) => {
      const id = 'openrouter/anthropic/claude-3-5-sonnet-20241022:beta';
      const view = openFb([id]);
      view.press('f', 'v');
      const out = view.text(width);
      expect(maxWidth(out)).toBeLessThanOrEqual(width);
      expect(detailText(out)).toContain(id);
      expect(out).toContain('1 of 1');
      view.press('q');
      expect(view.text(width)).toContain('Fallback models');
    });

    it('shows inherited rows in the detail view with their source', () => {
      fs.mkdirSync(path.join(env().cwd, '.pi'), { recursive: true });
      fs.writeFileSync(
        path.join(env().cwd, '.pi', 'subagents.json'),
        JSON.stringify({
          default_fallback_models: ['zeta/org/a', 'zeta/org/b'],
        }),
      );
      seedChain([]);
      const view = open(env());
      view.press(KEYS.right, KEYS.down, 'f', KEYS.down, KEYS.enter);
      const out = view.text(60);
      expect(out).toContain('2 of 2');
      expect(out).toContain('[default]');
      expect(out).toContain('inherited chain');
      expect(detailText(out)).toContain('zeta/org/b');
    });

    it('opens a read-only chain viewer on the default profile', () => {
      fs.mkdirSync(path.join(env().cwd, '.pi'), { recursive: true });
      fs.writeFileSync(
        path.join(env().cwd, '.pi', 'subagents.json'),
        JSON.stringify({
          default_fallback_models: ['zeta/org/a', 'zeta/org/b'],
        }),
      );
      const view = open(env());
      view.press(KEYS.down, 'f');
      let out = view.text(80);
      expect(out).toContain('Fallback models');
      expect(out).toContain('read-only');
      expect(out).not.toContain('Create a new profile');
      expect(out).toContain('inherited 1/2 zeta/org/a');
      expect(out).toContain('inherited 2/2 zeta/org/b');
      for (const key of ['a', 'd', '[', ']', 'c']) {
        view.press(key);
        expect(view.text(80), key).toContain('is read-only');
        expect(view.text(80), key).not.toContain('Choose fallback provider');
      }
      view.press(KEYS.down, KEYS.enter);
      out = view.text(80);
      expect(out).toContain('2 of 2');
      expect(detailText(out)).toContain('zeta/org/b');
      view.press(KEYS.enter);
      view.press(KEYS.esc);
      expect(view.text(80)).toContain('Subagent model profiles');
      expect(view.workspace.pendingCount()).toBe(0);
    });

    const parseRef = (id: string) => {
      const [provider, ...rest] = id.split('/');
      return { provider, id: rest.join('/') };
    };
    const selectedLine = (text: string) =>
      text
        .split('\n')
        .map(contentOf)
        .find((l) => /^[›>]/.test(l)) ?? '';

    it('marks the entry equal to the primary as skipped and numbers the rest like the resolver', () => {
      env().writeProfiles('global', {
        profiles: {
          fb: {
            agents: {
              analyst: {
                model: prefixed[7],
                effort: 'high',
                fallback_models: prefixed,
              },
            },
          },
        },
      });
      const effective = resolveFallbackChain(
        { profile: prefixed.map(parseRef) },
        parseRef(prefixed[7]),
      ).models;
      expect(effective).toHaveLength(11);
      const tall = open(env(), 40);
      tall.press(KEYS.right, KEYS.down);
      // the overview chain/footer already use the effective chain
      const overviewLines = tall.text(200).split('\n').map(contentOf);
      const start = overviewLines.findIndex((l) => l.startsWith('fallbacks ['));
      expect(start).toBeGreaterThan(-1);
      // the footer chain lists only what the runtime tries (the primary is
      // still named in the row/selected lines above it)
      const chainText = overviewLines.slice(start).join('\n');
      expect(chainText).toContain('beta-07');
      expect(chainText).toContain('beta-09');
      expect(chainText).toContain('beta-12');
      expect(chainText).not.toContain('beta-08');
      const view = open(env(), 14);
      view.press(KEYS.right, KEYS.down, 'f');
      expect(view.text(50)).toContain('12, 11 effective');
      for (let i = 0; i < prefixed.length; i += 1) {
        const line = selectedLine(view.text(50));
        const ordinal = effective.findIndex(
          (m) => `${m.provider}/${m.id}` === prefixed[i],
        );
        if (i === 7) expect(line).toContain('skipped (primary)');
        else expect(line).toContain(`${ordinal + 1}/11`);
        view.press(KEYS.enter);
        const detail = view.text(50);
        expect(maxWidth(detail)).toBeLessThanOrEqual(50);
        expect(detailText(detail)).toContain(prefixed[i]);
        if (i === 7) expect(detail).toContain('skipped: same as primary');
        else expect(detail).toContain(`${ordinal + 1} of 11 effective`);
        view.press(KEYS.esc, KEYS.down);
      }
    });

    it('re-evaluates skipped entries when the primary changes after the list was saved', () => {
      const view = openFb(['anthropic/claude-x', 'openrouter/org/backup']);
      view.press('f');
      expect(view.text(80)).toContain('1/2 anthropic/claude-x');
      const entry = view.workspace.entries().find((e) => e.name === 'fb');
      if (!entry) throw new Error('fb missing');
      view.workspace.edit(entry, 'analyst', {
        model: { provider: 'anthropic', id: 'claude-x' },
      });
      const out = view.text(80);
      expect(out).toContain('own list (2, 1 effective)');
      expect(out).toMatch(/- anthropic\/claude-x skipped \(primary\)/);
      expect(out).toContain('1/1 openrouter/org/backup');
      view.press(KEYS.enter);
      expect(view.text(80)).toContain('skipped: same as primary');
    });

    it('marks a duplicate of an earlier entry as skipped', () => {
      // The store drops duplicates on load, so stage one in the workspace.
      const view = openFb(['anthropic/claude-x', 'openrouter/org/backup']);
      const entry = view.workspace.entries().find((e) => e.name === 'fb');
      if (!entry) throw new Error('fb missing');
      const ref = (provider: string, id: string) => ({ provider, id });
      view.workspace.edit(entry, 'analyst', {
        fallback_models: [
          ref('anthropic', 'claude-x'),
          ref('openrouter', 'org/backup'),
          ref('anthropic', 'claude-x'),
          ref('zeta', 'org/last'),
        ],
      });
      view.press('f');
      const out = view.text(80);
      expect(out).toContain('own list (4, 3 effective)');
      expect(out).toContain('1/3 anthropic/claude-x');
      expect(out).toContain('2/3 openrouter/org/backup');
      expect(out).toMatch(/- anthropic\/claude-x skipped \(duplicate\)/);
      expect(out).toContain('3/3 zeta/org/last');
      view.press(KEYS.down, KEYS.down, KEYS.enter);
      expect(view.text(80)).toContain('skipped: duplicate of an earlier entry');
      view.press(KEYS.esc, 'd'); // raw index: removes the duplicate itself
      expect(view.text(80)).toContain('own list (3)');
    });
    it('mentions v and enter for the detail view in the editor legend', () => {
      const view = openFb();
      view.press('f');
      expect(view.text(110)).toContain('enter/v detail');
    });
    it('shows f in the legend', () => {
      const { text } = openFb();
      expect(text(110)).toContain('f fallbacks');
    });

    it('lists the full ordered chain with its source in the selected footer', () => {
      const { text, press } = openFb();
      expect(text(110)).toMatch(
        /fallbacks \[profile\]: anthropic\/claude-x\s*\S+\s*openrouter\/org\/backup/,
      );
      press(KEYS.down); // reviewer has no chain
      expect(text(110)).not.toContain('fallbacks [');
    });

    it('marks agent and default sources', () => {
      fs.mkdirSync(path.join(env().cwd, '.pi'), { recursive: true });
      fs.writeFileSync(
        path.join(env().cwd, '.pi', 'subagents.json'),
        JSON.stringify({ default_fallback_models: ['openrouter/org/default'] }),
      );
      seedChain([]);
      const { press, text } = open(env());
      press(KEYS.right, KEYS.down);
      expect(text(160)).toContain('[default] openrouter/org/default');
    });

    it('opens the editor with f and returns with escape or q', () => {
      const { press, text } = openFb();
      press('f');
      let out = text();
      expect(out).toContain('Fallback models');
      expect(out).toContain('1/2 anthropic/claude-x');
      expect(out).toContain('2/2 openrouter/org/backup');
      expect(out).toContain('own list (2)');
      press(KEYS.esc);
      expect(text()).toContain('Subagent model profiles');
      press('F', 'q');
      out = text();
      expect(out).toContain('Subagent model profiles');
      expect(out).not.toContain('Fallback models');
    });

    it('shows the inherited chain as context when the own list is empty', () => {
      const { press, text } = openFb();
      press(KEYS.down, 'f'); // reviewer
      expect(text()).toContain('no fallback chain');
      press('a', KEYS.esc);
      expect(text()).toContain('Fallback models');
    });

    it('ignores f on the orchestrator and protects default', () => {
      const { press, text } = openFb();
      press(KEYS.up, 'f');
      expect(text()).toContain('no fallback chain');
      const view = open(env());
      view.press(KEYS.down, 'f');
      expect(view.text()).toContain('read-only');
      expect(view.text()).not.toContain('Create a new profile');
    });

    it('appends through the provider/model picker and returns to the editor', () => {
      const { press, text, workspace } = openFb(['openrouter/org/backup']);
      press('f', 'a');
      expect(text()).toContain('Choose fallback provider');
      expect(text()).not.toContain('reset to default model');
      press(KEYS.enter); // anthropic
      expect(text()).toContain('Select anthropic model for analyst');
      press(KEYS.enter);
      expect(text()).toContain('Fallback models');
      expect(text()).toContain('2/2 anthropic/claude-x');
      expect(workspace.pendingCount()).toBe(1);
      // primary and existing entries are refused
      press('a', KEYS.down, KEYS.enter, KEYS.enter);
      expect(text()).toContain('is the primary or already in the list');
      expect(text()).toContain('Fallback models');
    });

    it('returns to the editor when the pickers are cancelled', () => {
      const { press, text } = openFb();
      press('f', 'a', KEYS.esc);
      expect(text()).toContain('Fallback models');
      press('a', KEYS.enter, KEYS.esc);
      expect(text()).toContain('Fallback models');
      press('a', 'q');
      expect(text()).toContain('Fallback models');
    });

    it('moves, deletes and clears entries', () => {
      const { press, text, workspace } = openFb();
      const list = () =>
        workspace
          .entries()
          .find((entry) => entry.name === 'fb')
          ?.agents.analyst.fallback_models?.map((m) => `${m.provider}/${m.id}`);
      press('f', ']');
      expect(list()).toEqual([CHAIN[1], CHAIN[0]]);
      press('[');
      expect(list()).toEqual(CHAIN);
      press('[');
      expect(text()).toContain('Already at the edge of the list');
      press('d');
      expect(list()).toEqual([CHAIN[1]]);
      press('c');
      expect(list()).toBeUndefined();
      press('c');
      expect(text()).toContain('already empty');
    });

    it('tracks dirty state, shows the new chain at once and can be reverted', () => {
      const { press, text, workspace } = openFb();
      press('f', ']', KEYS.esc);
      expect(workspace.pendingCount()).toBe(1);
      const out = text(160);
      expect(out).toContain('pending: 1 change');
      expect(out).toMatch(/\* analyst/);
      expect(out).toMatch(
        /openrouter\/org\/backup\s*\S+\s*anthropic\/claude-x/,
      );
      press('f', KEYS.down, '[', KEYS.esc);
      expect(workspace.pendingCount()).toBe(0);
      expect(text(160)).not.toMatch(/\* analyst/);
    });

    it('persists edits and a cleared list on save, then reloads', () => {
      const { press } = openFb();
      press('f', 'd', KEYS.esc, 's');
      expect(savedAnalyst().fallback_models).toEqual([CHAIN[1]]);
      press('f', 'c', KEYS.esc);
      press('s');
      expect(savedAnalyst()).toEqual({
        model: 'openai/gpt-5.5',
        effort: 'high',
      });
      const reopened = open(env());
      reopened.press(KEYS.right, KEYS.down);
      expect(reopened.text(160)).not.toContain('[profile]');
      expect(reopened.workspace.pendingCount()).toBe(0);
    });
  });

  describe('model row names', () => {
    const junieModels = [
      {
        provider: 'junie',
        id: 'mix.normal',
        name: 'Junie Normal (GPT-6.1 Terra)',
      },
      { provider: 'junie', id: 'mix.frontier', name: 'Junie Frontier' },
    ];

    function editable(models: any[], current = 'junie/mix.normal') {
      env().writeProfiles('global', {
        profiles: { editable: profile(current, 'low') },
      });
      const panel = open(env(), 40, undefined, models);
      panel.press(KEYS.right); // editable (global)
      panel.press('m', KEYS.down, KEYS.enter); // skip orchestrator, provider, junie
      return panel;
    }

    it('renders the model name before the saved provider/id', () => {
      const { text } = editable(junieModels);
      expect(text()).toContain(
        'Junie Normal (GPT-6.1 Terra) — junie/mix.normal',
      );
      expect(text()).toContain('Junie Frontier — junie/mix.frontier');
    });

    it('keeps the current format when the name is absent or equals the id', () => {
      const { press, text } = editable([
        { provider: 'junie', id: 'mix.normal', label: 'Label Normal' },
        { provider: 'junie', id: 'mix.frontier', name: 'mix.frontier' },
      ]);
      expect(text()).toContain('Label Normal (junie/mix.normal)');
      expect(text()).toContain('mix.frontier (junie/mix.frontier)');
      expect(text()).not.toContain('— junie/mix.frontier');
      press(KEYS.esc);
      expect(text()).toContain('profile 2/2');
    });

    it('matches the name in search and still saves the provider/id', () => {
      const { press, text, workspace } = editable(junieModels, 'other/legacy');
      expect(text()).toContain('provider: junie · 2 models');
      expect(text()).toContain('2 models');
      press('terra');
      expect(text()).toContain('1/2 match');
      expect(text()).toContain(
        'Junie Normal (GPT-6.1 Terra) — junie/mix.normal',
      );
      expect(text()).not.toContain('Junie Frontier — junie/mix.frontier');
      press(KEYS.enter); // select the searched model
      const orchestrator = () =>
        workspace.entries().find((entry) => entry.name === 'editable')
          ?.orchestrator;
      expect(orchestrator()?.model).toEqual({
        provider: 'junie',
        id: 'mix.normal',
      });
      press('s');
      const saved = JSON.parse(
        fs.readFileSync(env().store.paths.global, 'utf8'),
      ).profiles.editable.orchestrator;
      expect(saved.model).toBe('junie/mix.normal');
    });
  });
});
