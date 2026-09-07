import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Session, Story } from '../src/engine/types';
import { availableChoices, choose, restoreCheckpoint, startGame } from '../src/engine/engine';
import { exportGame, importGame } from '../src/storage/repository';

const story: Story = JSON.parse(readFileSync(new URL('../src/content/stage-one.json', import.meta.url), 'utf8'));
const endingKeys = ['endingCanonAshes', 'endingHumanEcho', 'endingEmberAlive'];
type Preparation = 'component' | 'blueprint' | 'both' | 'none';
function atFinalGate(human: boolean, brother: boolean, preparation: Preparation): Session {
  let state = startGame(story);
  for (const step of story.chapters[9].canonicalPrefix) {
    const id = step.nodeId === 'CH8-10' && !brother ? 'ch8-10-submit' : step.choiceId;
    state = choose(story, state, step.nodeId, id);
  }
  const planned = new Set([
    human ? 'ch9-02-message' : 'ch9-02-share', 'ch9-04-prepare', 'ch9-05-backup', 'ch9-06-nonlethal',
    ['component', 'both'].includes(preparation) ? 'ch9-07-restraint' : 'ch9-07-weapons',
    ['blueprint', 'both'].includes(preparation) ? 'ch10-07-scan' : 'ch10-07-record', 'ch11-07-confirm',
  ]);
  for (let count = 0; state.currentNodeId !== 'CH12-06'; count++) {
    if (count > 60 || state.status !== 'choice') throw new Error(`Could not reach final gate: ${state.currentNodeId}`);
    const choices = availableChoices(story, state);
    const selected = choices.find(choice => planned.has(choice.id)) ?? choices[0];
    state = choose(story, state, state.currentNodeId, selected.id);
    expect(endingKeys.some(key => state.flags[key])).toBe(false);
  }
  return state;
}
function finish(state: Session): Session {
  for (let count = 0; state.status === 'choice'; count++) {
    if (count > 15) throw new Error(`Season did not finish: ${state.currentNodeId}`);
    state = choose(story, state, state.currentNodeId, availableChoices(story, state)[0].id);
  }
  return state;
}

describe('legal season-one outcome routes', () => {
  it('requires human evidence, saved brother footage and executable preparation independently', () => {
    for (const human of [false, true]) for (const brother of [false, true]) for (const preparation of ['none', 'component', 'blueprint', 'both'] as const) {
      const state = atFinalGate(human, brother, preparation);
      const choices = availableChoices(story, state);
      expect(choices.some(choice => choice.id.startsWith('ch12-06-save')), `${human}/${brother}/${preparation}`)
        .toBe(human && brother && preparation !== 'none');
      const next = choose(story, state, state.currentNodeId, 'ch12-06-human');
      expect(next.flags.endingHumanEcho === true).toBe(human && brother);
      expect(next.flags.endingCanonAshes === true).toBe(!human || !brother);
    }
  });
  it('plays all three endings through chapter thirteen, round trips and rolls back without retaining future outcomes', () => {
    for (const [choiceId, endingKey, resultNode] of [
      ['ch12-06-lethal', 'endingCanonAshes', 'CH13-04A'],
      ['ch12-06-human', 'endingHumanEcho', 'CH13-04B'],
      ['ch12-06-save', 'endingEmberAlive', 'CH13-04C'],
    ]) {
      const gate = atFinalGate(true, true, 'both');
      const selected = availableChoices(story, gate).find(c => c.id.startsWith(choiceId))!;
      const ending = finish(choose(story, gate, gate.currentNodeId, selected.id));
      expect(ending.currentNodeId).toBe('CH13-08');
      expect(ending.flags.completedSeasonOne).toBe(true);
      expect(endingKeys.filter(key => ending.flags[key])).toEqual([endingKey]);
      expect(ending.history.some(entry => entry.nodeId === resultNode)).toBe(true);
      expect(ending.history.filter(entry => /CH13-04[ABC]$/.test(entry.nodeId))).toHaveLength(1);
      expect(ending.choices.filter(step => step.choiceId === 'ch11-07-confirm')).toHaveLength(1);
      expect(importGame(story, exportGame(story, ending))).toEqual(ending);
      const rolled = restoreCheckpoint(story, ending, 'CP-CH11-END');
      expect(endingKeys.some(key => rolled.flags[key])).toBe(false);
      expect(rolled.flags.firstQuarterLifeTraded).toBe(true);
      expect(rolled.flags.completedSeasonOne).not.toBe(true);
    }
  });
});
