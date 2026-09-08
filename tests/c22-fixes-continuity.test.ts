import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Session, Story } from '../src/engine/types';
import { availableChoices, choose, startGame } from '../src/engine/engine';
import { exportGame, importGame, importSeasonArchives } from '../src/storage/repository';

const story: Story = JSON.parse(readFileSync(new URL('../src/content/stage-one.json', import.meta.url), 'utf8'));
const previous: Story = JSON.parse(readFileSync(new URL('../content-source/legacy-season-one.20260907.1.json', import.meta.url), 'utf8'));
function reach(content: Story, target: string, plan: Record<string, string> = {}): Session {
  let state = startGame(content);
  for (let count = 0; state.currentNodeId !== target; count++) {
    if (count > 100 || state.status !== 'choice') throw new Error(`Cannot reach ${target}: ${state.currentNodeId}`);
    const choices = availableChoices(content, state);
    const wanted = plan[state.currentNodeId] ?? (state.currentNodeId === 'CH11-07' ? 'ch11-07-confirm' : undefined);
    const selected = wanted ? choices.find(c => c.id === wanted || c.id.startsWith(wanted + '-')) : choices[0];
    if (!selected) throw new Error(`Unavailable ${state.currentNodeId}/${wanted}`);
    state = choose(content, state, state.currentNodeId, selected.id);
  }
  return state;
}
const sceneText = (state: Session, nodeId: string) => state.history.filter(e => e.nodeId === nodeId && e.kind === 'story').at(-1)?.text ?? '';

describe('C22-FIX local narrative corrections', () => {
  it('keeps the unknown pursuer unnamed without removing the remembered-name action', () => {
    for (const focus of ['watch-flame', 'remember-name']) for (const stance of ['ch8-01-trust', 'ch8-01-disarm']) {
      const plan = { 'PRO-01': focus, 'CH8-01': stance };
      const atDoor = reach(story, stance.endsWith('disarm') ? 'CH8-03-DISARMED' : 'CH8-03', plan);
      const report = availableChoices(story, atDoor).find(c => c.id === 'ch8-03-report')!;
      expect(report.label).not.toContain('康斯坦丁');
      const atPool = choose(story, atDoor, atDoor.currentNodeId, report.id);
      expect(atPool.currentNodeId).toBe('CH8-05');
      expect(sceneText(atPool, 'CH8-04')).not.toContain('康斯坦丁');
      expect(availableChoices(story, atPool).some(c => c.id === 'ch8-05-name')).toBe(focus === 'remember-name');
    }
  });

  it('records only after the choice and keeps raw recording local with either communications setup', () => {
    for (const comms of ['ch9-05-primary', 'ch9-05-backup']) for (const evidence of ['ch8-10-brother', 'ch8-10-submit']) {
      const state = reach(story, 'CH10-06-CHOICE', { 'CH9-05': comms, 'CH8-10': evidence });
      const before = state.history.filter(e => e.nodeId.startsWith('CH10-06')).map(e => e.text).join('\n');
      expect(before).not.toMatch(/存到|你只记录了|录音里/);
      const options = availableChoices(story, state);
      expect(options.map(c => c.id)).toEqual(['ch10-06-save', 'ch10-06-respond', 'ch10-06-record']);
      expect(options[2].label).not.toContain('要求船上');
      const saved = choose(story, state, state.currentNodeId, 'ch10-06-save');
      expect(sceneText(saved, 'CH10-06-SAVE')).toContain('随身记录器');
      expect(sceneText(saved, 'CH10-06-SAVE')).toContain('存了下来');
      const raw = choose(story, state, state.currentNodeId, 'ch10-06-record');
      expect(sceneText(raw, 'CH10-06-RECORD')).toContain('随身');
      expect(sceneText(raw, 'CH10-06-RECORD')).toContain('返回船上后');
      const response = choose(story, state, state.currentNodeId, 'ch10-06-respond');
      expect(sceneText(response, 'CH10-06-RESPOND')).toBe(previous.nodes['CH10-06-RESPOND'].content);
    }
  });

  it('identifies the moving blade before every handling choice and recalls only shared scenes', () => {
    const state = reach(story, 'CH12-03');
    expect(sceneText(state, 'CH11-02')).not.toMatch(/在冰窖里|有没有想过回家/);
    expect(sceneText(state, 'CH11-02')).toMatch(/后座/);
    expect(sceneText(state, 'CH11-02')).toMatch(/泳池/);
    expect(story.nodes['CH11-05-CHOICE'].choices.find(c => c.id === 'ch11-05-oldtang')!.label).not.toContain('岸上');
    expect(sceneText(state, 'CH12-03')).toContain('路鸣泽：那把松动的短刀，叫贪婪。');
    expect(state.flags.greedAvailable).not.toBe(true);
    expect(availableChoices(story, state).map(c => c.id)).toEqual(['ch12-03-hold', 'ch12-03-draw', 'ch12-03-close']);
  });

  it('preserves the entire state contract, graph, checkpoints and chapter prefixes', () => {
    const mechanics = (content: Story) => {
      const copy = structuredClone(content);
      delete (copy as Partial<Story>).contentVersion;
      for (const node of Object.values(copy.nodes)) {
        node.content = '';
        for (const choice of node.choices) { choice.label = ''; choice.keywords = []; }
      }
      return copy;
    };
    expect(story.contentVersion).toBe('v0.7C-season-one.20260908.1');
    expect(mechanics(story)).toEqual(mechanics(previous));
  });

  it('upgrades existing C16 saves and all three archives without changing decisions or outcomes', () => {
    const plan = { 'CH3-03': 'ch3-03-ask', 'CH8-01': 'ch8-01-disarm', 'CH8-03-DISARMED': 'ch8-03-report',
      'CH8-10': 'ch8-10-human', 'CH9-02': 'ch9-02-share', 'CH9-04': 'ch9-04-prepare',
      'CH9-05': 'ch9-05-primary', 'CH9-06': 'ch9-06-nonlethal', 'CH9-07': 'ch9-07-restraint',
      'CH10-06-CHOICE': 'ch10-06-record', 'CH10-07': 'ch10-07-record', 'CH12-03': 'ch12-03-close' };
    const gate = reach(previous, 'CH12-06', plan);
    const ends = availableChoices(previous, gate).map(choice => {
      let state = choose(previous, gate, gate.currentNodeId, choice.id);
      while (state.status === 'choice') state = choose(previous, state, state.currentNodeId, availableChoices(previous, state)[0].id);
      return state;
    });
    expect(ends).toHaveLength(3);
    const file = exportGame(previous, gate, ends);
    const migrated = importGame(story, file);
    expect(migrated.contentVersion).toBe('v0.7C-season-one.20260908.1');
    expect(migrated.choices).toEqual(gate.choices);
    expect(migrated.flags).toEqual(gate.flags);
    expect(migrated.checkpoints).toEqual(gate.checkpoints);
    expect(migrated.history.map(e => [e.id, e.nodeId, e.kind])).toEqual(gate.history.map(e => [e.id, e.nodeId, e.kind]));
    const archives = importSeasonArchives(story, file);
    expect(archives.map(s => s.flags)).toEqual(ends.map(s => s.flags));
    expect(archives.map(s => s.choices)).toEqual(ends.map(s => s.choices));
    expect(importGame(story, exportGame(story, migrated, archives))).toEqual(migrated);
    const forgedProse = JSON.parse(file); forgedProse.session.history[0].text += '伪造';
    expect(() => importGame(story, JSON.stringify(forgedProse))).toThrow();
    const forgedState = JSON.parse(file); forgedState.session.flags.preservedOldTangTrust = false;
    expect(() => importGame(story, JSON.stringify(forgedState))).toThrow();
  });
});
