import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Story, StoryNode } from '../src/engine/types';
import { availableChoices, choose, restoreCheckpoint, startChapterTest, startGame } from '../src/engine/engine';

const path = new URL('../src/content/stage-one.json', import.meta.url);
const story: Story = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { nodes: {}, chapters: [] };
const node = (id: string): StoryNode => story.nodes[id]!;

describe('v0.4B 阶段内容契约', () => {
  it('合并序章并使用完整邀请信与 N96 正文', () => {
    expect(node('PRO-01')?.content ?? '').toContain('火焰越过城墙，把最后的回答吞没。');
    expect(story.nodes['PRO-02']).toBeUndefined();
    expect(node('CH1-02').content).toContain('却没有留下电话号码');
    expect(node('CH1-02').content).toContain('纯黑色的 N96 手机');
    expect(node('CH1-01').choices[1]?.id).toBe('avoidance');
    expect(node('CH1-01').content).toMatch(/^门外，婶婶的敲门声一阵紧过一阵。敲到第三回，门板已经有了投降的意思。/);
  });

  it('恢复两版准备、共同候场正文和第三问两个选项', () => {
    expect(node('CH1-06-OLDTANG')?.content ?? '').toContain('统计学奇迹');
    expect(node('CH1-06-NO-OLDTANG').content).toContain('最后又关上了');
    for (const id of ['CH1-07-KNOWN', 'CH1-07-UNKNOWN']) {
      expect(node(id).content).toContain('前台暂时还没把我赶出去');
      expect(node(id).choices[1]?.label).toContain('你查到的资料里');
    }
    expect(node('CH1-11').choices.map(c => c.id)).toEqual(['admit-unknown', 'question-purpose']);
    expect(node('CH1-11').choices.every(c => c.feedback?.includes('谢谢，面试结束'))).toBe(true);
  });

  it('保留尊严三版、路边条件与三处获批修正', () => {
    expect(node('CH2-08-DIGNITY-KNOWN')?.content ?? '').toContain('你要跟谁表白就自己去说，别拉我来凑数。');
    expect(node('CH2-08-DIGNITY-UNCERTAIN').content).toContain('说不清楚，我不站');
    expect(node('CH2-08-DIGNITY-SILENT').content).toContain('你没有回头');
    for (const variant of ['KNOWN', 'UNCERTAIN', 'SILENT']) {
      expect(node(`CH2-08-DIGNITY-${variant}`).content).toContain('屏幕上的句子亮起，那场安排也彻底摆到了所有人面前。');
      expect(node(`CH2-08-DIGNITY-${variant}`).content).not.toContain('才彻底看懂');
    }
    expect(node('CH2-08-CANON-KNOWN').content).toContain('你明知道这是赵孟华准备的告白，却还是站在了这里。');
    expect(node('CH2-08-CANON').content).toContain('只有你和苏晓樯不知道');
    expect(node('CH2-10').choices).toHaveLength(4);
    expect(node('CH2-10').choices.find(c => c.id === 'thank-nono')?.conditions).toEqual([{ type: 'flag', key: 'nonoRescuePublic', value: true }]);
    expect(node('CH2-10').choices.find(c => c.id === 'self-rescue')?.conditions).toEqual([{ type: 'flag', key: 'nonoRescueOutside', value: true }]);
    expect(node('CH2-12').content).toContain('几个小时前，你还困在那场告白的喧闹里');
    expect(node('CH2-12').stageEnd).not.toBe(true);
    expect(node('CH2-12').autoNextNodeId).toBe('CH3-01');
    expect(node('CH2-11').checkpointId).toBe('CP-CH2-DECISION');
  });

  it('静态图到第九章且所有节点都有真实选择、自动后继或终点', () => {
    expect(Object.keys(story.nodes)).toHaveLength(243);
    expect(Object.values(story.nodes).reduce((sum, n) => sum + n.choices.length, 0)).toBe(187);
    for (const n of Object.values(story.nodes)) {
      expect(n.chapter).toBeLessThanOrEqual(9);
      expect(n.content.trim().length).toBeGreaterThan(0);
      expect(n.content).not.toMatch(/显示条件|系统处理|写入：|\*\*|。。/);
      expect(n.choices.length > 0 || !!n.autoNextNodeId || !!n.endingId || n.stageEnd === true).toBe(true);
      const refs = [n.autoNextNodeId, ...(n.autoNextRules ?? []).map(r => r.nextNodeId), ...n.choices.flatMap(c => [c.nextNodeId, ...(c.nextNodeRules ?? []).map(r => r.nextNodeId)])].filter(Boolean);
      for (const ref of refs) expect(story.nodes[ref!], `${n.id} -> ${ref}`).toBeDefined();
      for (const c of n.choices) expect(c.label).not.toMatch(/^(继续|继续前进|下一步)[。！]?$/);
    }
  });

  it('逐段保留源稿普通节点正文，并覆盖稿内每个选项标签与回响', () => {
    const md = readFileSync(new URL('../content-source/v0.4B.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const strip = (text: string) => text.replace(/\*\*/g, '').replace(/`/g, '').trim();
    let id = '';
    let reading = false;
    let lines: string[] = [];
    const check = () => {
      if (!reading || !lines.length) return;
      const expected = strip(lines.join('\n'));
      if (id === 'PRO-01') expect(node(id).content.startsWith(expected)).toBe(true);
      else if (id !== 'CH2-12') expect(node(id).content, id).toBe(expected);
    };
    for (const line of md.split('\n')) {
      if (line.startsWith('#')) {
        check(); reading = false; lines = [];
        if (line.startsWith('## ')) id = line.slice(3).split('｜')[0];
        if (line === '### 玩家可见正文') reading = true;
      } else if (reading) lines.push(line);
    }
    const labels = new Set(Object.values(story.nodes).flatMap(n => n.choices.map(c => c.label)));
    for (const match of md.matchAll(/^\d+\. \*\*(.+)\*\*$/gm)) expect(labels.has(strip(match[1])), match[1]).toBe(true);
    const feedback = Object.values(story.nodes).flatMap(n => n.choices.map(c => c.feedback ?? '')).join('\n');
    const trims: Record<string, string> = {
      '古德里安只回答“材料让我们认为你值得见面”，不泄露血统。': '古德里安只回答“材料让我们认为你值得见面”。',
      '古德里安说学院认为你的潜力不能用普通成绩衡量，但不透露血统等级。': '古德里安说学院认为你的潜力不能用普通成绩衡量。',
    };
    for (const match of md.matchAll(/^   - 回响：(.+(?:\n {5}\S.*)*)/gm)) {
      const text = match[1].replace(/\n {5}/g, '\n\n');
      expect(feedback).toContain(trims[text] ?? text);
    }
    for (const variant of ['KNOWN', 'UNKNOWN']) {
      expect(node(`CH1-07-${variant}`).choices[0].feedback?.split('\n\n')).toHaveLength(3);
    }
  });

  it('所有节点与187个选项均可由真实引擎到达，条件正文和终点成立', () => {
    // Only retain conditions that can still be consumed downstream of this node.
    const downstream = Object.fromEntries(Object.values(story.nodes).map(n => [n.id, new Set([
      ...(n.autoNextRules ?? []).flatMap(r => r.conditions),
      ...n.choices.flatMap(c => [...(c.conditions ?? []), ...(c.nextNodeRules ?? []).flatMap(r => r.conditions)]),
    ].map(c => c.key))]));
    let changed = true;
    while(changed) {
      changed = false;
      for(const n of Object.values(story.nodes)) {
        const refs=[n.autoNextNodeId,...(n.autoNextRules??[]).map(r=>r.nextNodeId),...n.choices.flatMap(c=>[c.nextNodeId,...(c.nextNodeRules??[]).map(r=>r.nextNodeId)])].filter(Boolean) as string[];
        for(const id of refs) for(const key of downstream[id]) if(!downstream[n.id].has(key)) { downstream[n.id].add(key); changed=true; }
      }
    }
    const pending = [startGame(story)];
    const visited = new Set<string>();
    const coveredNodes = new Set<string>();
    const coveredChoices = new Set<string>();
    let ended = false;
    let completed = false;
    while (pending.length) {
      const state = pending.pop()!;
      state.history.filter(h => h.kind === 'story').forEach(h => coveredNodes.add(h.nodeId));
      const key = `${state.currentNodeId}:${[...downstream[state.currentNodeId]].sort().map(k => Number(state.flags[k] === true)).join('')}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (state.status === 'ending') {
        ended = true;
        const restored = restoreCheckpoint(story, state, 'CP-CH2-DECISION');
        expect(restored.currentNodeId).toBe('CH2-11');
        expect(restored.flags.motiveDeclinedForNow).not.toBe(true);
        expect(restored.history.some(h => h.nodeId === 'CH2-ALT-END')).toBe(false);
        continue;
      }
      if (state.status === 'stageEnd') {
        completed = true;
        expect(state.currentNodeId).toBe('CH9-08');
        expect(state.flags.acceptedCassell).toBe(true);
        continue;
      }
      const options = availableChoices(story, state);
      if (state.currentNodeId === 'CH2-07') expect(options.length).toBe(state.flags.noticedSetup ? 3 : 1);
      if (state.currentNodeId === 'CH2-10') {
        expect(options.length).toBe(3);
        expect(options.some(c => c.id === 'thank-nono')).toBe(state.flags.nonoRescuePublic === true);
        expect(options.some(c => c.id === 'self-rescue')).toBe(state.flags.nonoRescueOutside === true);
      }
      for (const choice of options) {
        coveredChoices.add(`${state.currentNodeId}/${choice.id}`);
        const next = choose(story, state, state.currentNodeId, choice.id);
        if (choice.feedback) expect(next.history.some(h => h.kind === 'feedback' && h.text === choice.feedback)).toBe(true);
        pending.push(next);
      }
    }
    expect(coveredNodes.size).toBe(243);
    expect(coveredChoices.size).toBe(186);
    const missing = Object.values(story.nodes).flatMap(n=>n.choices.map(c=>`${n.id}/${c.id}`)).filter(id=>!coveredChoices.has(id));
    // Current earlier chapters can only write askedPriorityParents after reading the letter.
    // The source OR contract also supports the isolated askedPriorityParents-only input.
    expect(missing).toEqual(['CH6-05/ch6-05-parents-2']);
    expect(ended && completed).toBe(true);
  });

  it('章节测试前情是从序章合法重放且未透支目标章选择', () => {
    for (const chapter of story.chapters) {
      let normal = startGame(story);
      for (const step of chapter.canonicalPrefix) normal = choose(story, normal, step.nodeId, step.choiceId);
      expect(node(normal.currentNodeId).chapter).toBe(chapter.chapter);
      expect(normal.history.find(h => h.kind === 'story' && node(h.nodeId).chapter === chapter.chapter)?.nodeId).toBe(chapter.entryNodeId);
      expect(normal.choices.every(c => node(c.nodeId).chapter < chapter.chapter)).toBe(true);
      const test = startChapterTest(story, chapter.chapter);
      expect(test.currentNodeId).toBe(normal.currentNodeId);
      expect(test.flags).toEqual(normal.flags);
      expect(test.mode).toBe('test');
    }
    const second = startChapterTest(story, 2);
    expect(second.flags.readParentsLetter).not.toBe(true);
    expect(second.flags.acceptedCassell).not.toBe(true);
    expect(second.flags.completedChapterTwo).not.toBe(true);
  });
});
