import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Session, Story } from '../src/engine/types';
import { availableChoices, choose, restoreCheckpoint, startChapterTest, startGame } from '../src/engine/engine';
import { exportGame, importGame, importSeasonArchives, loadGame, loadSeasonArchives, saveGame, seasonEnding } from '../src/storage/repository';

const story: Story = JSON.parse(readFileSync(new URL('../src/content/stage-one.json', import.meta.url), 'utf8'));
const legacy: Story = JSON.parse(readFileSync(new URL('../content-source/legacy-stage-three.1.json', import.meta.url), 'utf8'));
function finish(content: Story, initial: Session): Session {
  let state = initial;
  for (let count = 0; state.status === 'choice'; count++) {
    if (count > 160) throw new Error(`Route did not finish: ${state.currentNodeId}`);
    const choices = availableChoices(content, state);
    const choice = state.currentNodeId === 'CH11-07' ? choices[2] : choices[0];
    state = choose(content, state, state.currentNodeId, choice.id);
  }
  return state;
}
function completed(): Session {
  let state = startGame(story);
  for (const step of story.chapters.find(chapter => chapter.chapter === 13)!.canonicalPrefix) {
    state = choose(story, state, step.nodeId, step.choiceId);
  }
  return finish(story, state);
}

describe('revised season saves', () => {
  it('upgrades pre-comms-patch progress and archives by replay without accepting forged prose', () => {
    const oldStory: Story = JSON.parse(readFileSync(new URL('../content-source/legacy-season-one.20260906.json', import.meta.url), 'utf8'));
    for (const prepared of [false, true]) {
      let old = startGame(oldStory);
      for (const step of oldStory.chapters[13].canonicalPrefix) {
        old = choose(oldStory, old, step.nodeId, step.nodeId === 'CH9-05' && !prepared ? 'ch9-05-primary' : step.choiceId);
      }
      while (old.currentNodeId !== 'CH13-02-CHOICE') old = choose(oldStory, old, old.currentNodeId, availableChoices(oldStory, old)[0].id);
      old = choose(oldStory, old, old.currentNodeId, 'ch13-02-edit');
      old = finish(oldStory, old);
      const file = exportGame(oldStory, old, [old]);
      const migrated = importGame(story, file);
      expect(migrated.choices).toEqual(old.choices);
      expect(migrated.flags).toEqual({ ...old.flags, greedAvailable: true, sevenSinsCaseClosed: false });
      expect(importSeasonArchives(story, file)).toEqual([migrated]);
      expect(migrated.history.some(e => e.text.includes('出发前保存的操作要求'))).toBe(!prepared);
      expect(migrated.history.some(e => e.text.includes('收下这份不完整的记录'))).toBe(!prepared);
      const forged = JSON.parse(file); forged.session.history[0].text += '伪造';
      expect(() => importGame(story, JSON.stringify(forged))).toThrow();
    }
  });

  it('validates the old chapter-nine ending then resumes chapter ten with revised history', () => {
    const old = finish(legacy, startGame(legacy));
    expect(old.currentNodeId).toBe('CH9-08');
    const file = exportGame(legacy, old);
    const migrated = importGame(story, file);
    expect(migrated.currentNodeId).toBe('CH10-01');
    expect(migrated.choices).toEqual(old.choices);
    expect(migrated.history.find(entry => entry.nodeId === 'CH6-06')?.text).toContain('丽晶酒店');
    const forged = JSON.parse(file);
    forged.session.history.at(-1).text += '伪造';
    expect(() => importGame(story, JSON.stringify(forged))).toThrow();
  });
  it('archives formal completion independently, preserves it after rollback and exports it', async () => {
    const ending = completed();
    expect(ending.currentNodeId).toBe('CH13-08');
    expect(seasonEnding(ending)).toBe('endingCanonAshes');
    await saveGame(story, ending);
    expect(await loadSeasonArchives(story)).toEqual([ending]);
    const replay = restoreCheckpoint(story, ending, 'CP-CH11-END');
    expect(replay.flags.completedSeasonOne).not.toBe(true);
    await saveGame(story, replay);
    expect(await loadGame(story)).toEqual(replay);
    expect(await loadSeasonArchives(story)).toEqual([ending]);
    const file = exportGame(story, replay, [ending]);
    expect(importGame(story, file)).toEqual(replay);
    expect(importSeasonArchives(story, file)).toEqual([ending]);
    const forged = JSON.parse(file);
    forged.seasonArchives[0].flags.endingEmberAlive = true;
    expect(() => importGame(story, JSON.stringify(forged))).toThrow();
    expect(await loadGame(story)).toEqual(replay);
  });
  it('chapter tests and temporary endings cannot become season archives', async () => {
    const before = await loadSeasonArchives(story);
    const test = finish(story, startChapterTest(story, 13));
    expect(test.flags.completedSeasonOne).toBe(true);
    expect(seasonEnding(test)).toBeUndefined();
    await expect(saveGame(story, test)).rejects.toThrow();
    expect(() => exportGame(story, startGame(story), [test])).toThrow();
    expect(await loadSeasonArchives(story)).toEqual(before);
  });
});
