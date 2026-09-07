import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import rawStory from '../src/content/stage-one.json';
import type { Story } from '../src/engine/types';
import { availableChoices, choose, startGame } from '../src/engine/engine';

const story = rawStory as Story;
const source = readFileSync(new URL('../content-source/v0.7C-ch10-ch13.md', import.meta.url), 'utf8');
function at(id: string, flags: Record<string, boolean> = {}) {
  const local = structuredClone(story);
  local.entryNodeId = id;
  local.nodes[id].entryEffects = [...(local.nodes[id].entryEffects ?? []), ...Object.entries(flags).map(([key, value]) => ({ type: 'flag' as const, key, value }))];
  return startGame(local);
}
const prose = (state: ReturnType<typeof at>) => state.history.filter(e => e.kind === 'story').map(e => e.text).join('\n');

describe('CH10–CH13 source fidelity and conditional presentation', () => {
  it('preserves the approved source byte for byte and includes all 39 authored sections', () => {
    const original = new URL('../../01-剧情文档/03-审阅与原始批注/2026-09-06-修订审阅版/龙族试玩第一季第十至第十三章剧情与玩法设计稿-v0.7C-修订标注版-2026-09-06修订审阅版.md', import.meta.url);
    expect(readFileSync(original).equals(readFileSync(new URL('../content-source/v0.7C-ch10-ch13.md', import.meta.url)))).toBe(true);
    const ids = [...source.matchAll(/^## (CH(?:10|11|12|13)-[^｜\r\n]+)｜/gm)].map(m => m[1]);
    expect(ids).toHaveLength(39);
    for (const id of ids) expect(story.nodes[id], id).toBeTruthy();
    for (const node of Object.values(story.nodes).filter(n => n.chapter >= 10)) {
      expect(node.content, node.id).not.toMatch(/<!--|【V0\.7C|【红字修订】|系统处理|共同后继/);
      const targets = [node.autoNextNodeId, ...(node.autoNextRules ?? []).map(r => r.nextNodeId), ...node.choices.flatMap(c => [c.nextNodeId, ...(c.nextNodeRules ?? []).map(r => r.nextNodeId)])].filter(Boolean);
      for (const target of targets) expect(story.nodes[target!], `${node.id} -> ${target}`).toBeTruthy();
    }
  });
  it('includes revised prose from table cells split by editorial comments', () => {
    const state = at('CH10-04');
    const next = choose(story, state, state.currentNodeId, 'ch10-04-sonar');
    expect(prose(next)).toContain('氧气警报提前亮起。诺诺把你的灯按灭，要求把每一次照明都用在真正的转向上：“余量不多了。后面再想停下来查东西，得先确认我们还回得去。”');
  });
  it('shows failed communications only on the unprepared sonar route', () => {
    for (const prepared of [false, true]) {
      const state = at('CH10-04', { preparedIndependentComms: prepared });
      const next = choose(story, state, state.currentNodeId, 'ch10-04-sonar');
      expect(prose(next).includes('你尝试回传位移，主频道却没有传回可用的答复。诺诺把你的灯压向脚边，示意你避开齿轮下的空腔。')).toBe(!prepared);
    }
  });
  it('shows independent communications and oxygen echoes together', () => {
    const state = at('CH10-08', { preparedIndependentComms: true, preparedEmergencyExtraction: true });
    const entries = state.history.filter(e => /^CH10-08-CONDITION-.*-TEXT/.test(e.nodeId));
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.text.length > 0)).toBe(true);
  });
  it('does not invent a structure record and exposes only available forge comparisons', () => {
    const missing = at('CH12-01');
    expect(prose(missing)).not.toContain('你在青铜城记下的结构图');
    expect(availableChoices(story, missing).map(c => c.id)).toEqual(['ch12-01-check', 'ch12-01-danger']);
    for (const key of ['recordedBronzeForgeLocation', 'securedNonlethalRestraintBlueprint']) {
      const prepared = at('CH12-01', { [key]: true });
      expect(prose(prepared)).toContain('你在青铜城记下的结构图');
      expect(availableChoices(story, prepared).filter(c => c.id.startsWith('ch12-01-forge'))).toHaveLength(1);
    }
  });
  it('shows only the actual containment equipment on the saving route', () => {
    for (const [component, blueprint] of [[true, false], [false, true], [true, true]]) {
      const text = prose(at('CH12-07C', { deployedNonlethalDragonRestraint: component, securedNonlethalRestraintBlueprint: blueprint }));
      expect(text.includes('束缚组件在船侧张开')).toBe(component);
      expect(text.includes('青铜城结构图被反接进金属匣')).toBe(blueprint);
    }
  });
  it('keeps the three actual results exclusive and chapter thirteen reads them without rewriting', () => {
    for (const node of Object.values(story.nodes).filter(n => n.chapter === 13)) {
      expect([...(node.entryEffects ?? []), ...node.choices.flatMap(c => c.effects ?? [])].some(e => e.key.startsWith('ending'))).toBe(false);
    }
    for (const [key, suffix] of [['endingCanonAshes', 'A'], ['endingHumanEcho', 'B'], ['endingEmberAlive', 'C']]) {
      const state = at('CH13-03', { [key]: true });
      expect(state.history.filter(e => /^CH13-04[ABC]$/.test(e.nodeId)).map(e => e.nodeId)).toEqual([`CH13-04${suffix}`]);
    }
    expect(story.nodes['CH13-08'].stageEnd).toBe(true);
  });
});
