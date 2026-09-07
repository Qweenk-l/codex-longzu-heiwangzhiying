import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Session, Story } from '../src/engine/types';
import { availableChoices, choose, startGame } from '../src/engine/engine';
import { exportGame, importGame, importSeasonArchives } from '../src/storage/repository';

const current: Story = JSON.parse(readFileSync(new URL('../src/content/stage-one.json', import.meta.url), 'utf8'));
const story = current;
function gate(overrides: Record<string, string> = {}, story: Story = current): Session {
  let state = startGame(story);
  const plan = { 'CH9-02': 'ch9-02-message', 'CH9-04': 'ch9-04-prepare', 'CH9-05': 'ch9-05-backup',
    'CH9-06': 'ch9-06-nonlethal', 'CH9-07': 'ch9-07-restraint', 'CH8-10': 'ch8-10-brother',
    'CH10-07': 'ch10-07-record', 'CH11-07': 'ch11-07-confirm', 'CH12-03': 'ch12-03-close',
    'CH12-05': 'ch12-05-lethal', ...overrides };
  for (let i = 0; state.currentNodeId !== 'CH12-06'; i++) {
    if (i > 100 || state.status !== 'choice') throw new Error(state.currentNodeId);
    const choices = availableChoices(story, state);
    const wanted = plan[state.currentNodeId as keyof typeof plan];
    const selected = wanted ? choices.find(c => c.id === wanted || c.id.startsWith(wanted + '-')) : choices[0];
    if (!selected) throw new Error(`Unavailable ${state.currentNodeId}/${wanted}`);
    state = choose(story, state, state.currentNodeId, selected.id);
  }
  return state;
}
const text = (s: Session) => s.history.filter(e => e.kind === 'story').map(e => e.text).join('\n');
describe('C16 legal narrative continuity', () => {
  it('keeps a damaged containment frame available without resurrecting a destroyed component', () => {
    const state = gate();
    expect(state.flags.securedNonlethalRestraintBlueprint).not.toBe(true);
    const save = availableChoices(story, state).find(c => c.id.startsWith('ch12-06-save'))!;
    const result = choose(story, state, state.currentNodeId, save.id);
    expect(result.flags.endingEmberAlive).toBe(true);
    expect(text(result)).not.toContain('记录到一组共振频率后被高温熔毁');
    expect(text(result)).toContain('承载框架');
    expect(text(result)).not.toContain('只有致命火力');
    expect(text(result)).not.toContain('先带诺诺与金属匣上浮，再把你拖进舱内');
  });
  it.each(['ch12-06-lethal', 'ch12-06-human'])('reopens the closed case and draws Greed before %s', choice => {
    const state = gate();
    const result = choose(story, state, state.currentNodeId, choice);
    expect(result.flags.greedAvailable).toBe(true);
    expect(result.flags.sevenSinsCaseClosed).toBe(false);
    const recent = result.history.slice(state.history.length).map(e => e.text).join('\n');
    expect(recent).toContain('重新打开');
    expect(recent.indexOf('重新打开')).toBeLessThan(recent.indexOf(choice.endsWith('human') ? '你没有立刻' : '贪婪在你手里'));
    expect(text(result)).not.toContain('或者仍把手放在暴怒');
    expect(text(result)).not.toContain('无论龙王死去');
  });
  it('allows earning trust after disarm and recovering footage through the formal evidence request', () => {
    for (const evidence of ['brother', 'human']) {
      const state = gate({ 'CH8-01': 'ch8-01-disarm', 'CH8-10': `ch8-10-${evidence}`,
        'CH9-02': evidence === 'human' ? 'ch9-02-share' : 'ch9-02-message' });
      expect(state.flags.prioritizedNonoSafetyWithOldTang).toBe(true);
      expect(state.flags.preservedOldTangTrust).toBe(true);
      expect(state.flags.preservedBrotherEvidence).toBe(true);
      expect(availableChoices(story, state).some(c => c.id.startsWith('ch12-06-save'))).toBe(true);
    }
  });
  it('still denies rescue without executable equipment after recovery', () => {
    const state = gate({ 'CH8-01': 'ch8-01-disarm', 'CH8-10': 'ch8-10-human', 'CH9-02': 'ch9-02-share', 'CH9-07': 'ch9-07-weapons' });
    expect(availableChoices(story, state).some(c => c.id.startsWith('ch12-06-save'))).toBe(false);
    expect(choose(story, state, state.currentNodeId, 'ch12-06-human').flags.endingHumanEcho).toBe(true);
  });
});


describe('C16 previous-version replay', () => {
  const old: Story = JSON.parse(readFileSync(new URL('../content-source/legacy-season-one.20260906.1.json', import.meta.url), 'utf8'));
  function finish(content: Story, state: Session): Session {
    for (let i = 0; state.status === 'choice'; i++) {
      if (i > 30) throw new Error(state.currentNodeId);
      state = choose(content, state, state.currentNodeId, availableChoices(content, state)[0].id);
    }
    return state;
  }
  it('validates old choices before earning the new recovery, and rejects forged state', () => {
    const previous = gate({ 'CH8-01': 'ch8-01-disarm' }, old);
    expect(previous.flags.preservedOldTangTrust).not.toBe(true);
    const file = exportGame(old, previous);
    const upgraded = importGame(story, file);
    expect(upgraded.currentNodeId).toBe('CH12-06');
    expect(upgraded.flags.preservedOldTangTrust).toBe(true);
    expect(upgraded.choices).toEqual(previous.choices);
    const forged = JSON.parse(file); forged.session.flags.preservedOldTangTrust = true;
    expect(() => importGame(story, JSON.stringify(forged))).toThrow();
    expect(importGame(story, exportGame(story, upgraded))).toEqual(upgraded);
  });
  it('keeps the latest archive per result when revised evidence makes old outcomes converge', () => {
    const oldEnds = [false, true].map(trust => {
      const state = gate(trust ? {} : { 'CH8-01': 'ch8-01-disarm' }, old);
      return finish(old, choose(old, state, state.currentNodeId, 'ch12-06-human'));
    });
    expect(oldEnds[0].flags.endingCanonAshes).toBe(true);
    expect(oldEnds[1].flags.endingHumanEcho).toBe(true);
    const file = exportGame(old, oldEnds[1], oldEnds);
    const archives = importSeasonArchives(story, file);
    expect(archives).toHaveLength(1);
    expect(archives[0].flags.endingHumanEcho).toBe(true);
    expect(archives[0].choices).toEqual(oldEnds[1].choices);
  });
});
