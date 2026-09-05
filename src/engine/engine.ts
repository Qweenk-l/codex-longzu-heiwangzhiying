import type { Choice, Condition, Effect, InputResult, Rule, Session, Story, StoryNode } from './types';

function nodeAt(story: Story, id: string): StoryNode {
  if (!Object.hasOwn(story.nodes, id)) throw new Error('剧情节点缺失，已保留上一步进度。');
  return story.nodes[id];
}
function matches(flags: Session['flags'], conditions: Condition[] = []): boolean {
  return conditions.every(c => (flags[c.key] === true) === (c.value ?? true));
}
function applyEffects(state: Session, effects: Effect[] = []): void {
  for (const effect of effects) {
    if (effect.type !== 'flag' || typeof effect.value !== 'boolean' || ['__proto__', 'constructor', 'prototype'].includes(effect.key)) {
      throw new Error('剧情状态定义无效，已保留上一步进度。');
    }
    state.flags[effect.key] = effect.value;
  }
}
function target(state: Session, fallback: string | undefined, rules: Rule[] = []): string | undefined {
  return rules.find(rule => matches(state.flags, rule.conditions))?.nextNodeId ?? fallback;
}
function append(state: Session, nodeId: string, text: string, kind: 'story' | 'choice' | 'feedback'): void {
  if (text.trim()) state.history.push({ id: state.history.length, nodeId, text, kind });
}
function enter(story: Story, state: Session, nodeId: string): void {
  const node = nodeAt(story, nodeId);
  state.currentNodeId = nodeId;
  applyEffects(state, node.entryEffects);
  append(state, node.id, node.content, 'story');
  // Ending nodes never replace the last usable decision checkpoint.
  if (node.checkpointId && !node.endingId) {
    const previous = state.checkpoints.findIndex(cp => cp.id === node.checkpointId);
    if (previous >= 0) state.checkpoints.splice(previous);
    state.checkpoints.push({ id: node.checkpointId, nodeId, flags: { ...state.flags },
      historyLength: state.history.length, choiceLength: state.choices.length });
  }
}
export function availableChoices(story: Story, state: Session): Choice[] {
  if (state.status !== 'choice') return [];
  return nodeAt(story, state.currentNodeId).choices.filter(choice => matches(state.flags, choice.conditions));
}
function settle(story: Story, state: Session): Session {
  const visited = new Set<string>();
  delete state.endingId;
  for (;;) {
    const node = nodeAt(story, state.currentNodeId);
    if (visited.has(node.id)) throw new Error('剧情自动跳转出现循环，已保留上一步进度。');
    visited.add(node.id);
    if (node.endingId) { state.status = 'ending'; state.endingId = node.endingId; return state; }
    if (node.stageEnd) { state.status = 'stageEnd'; return state; }
    if (node.choices.length) {
      state.status = 'choice';
      if (!availableChoices(story, state).length) throw new Error('当前剧情没有可用行动，已保留上一步进度。');
      return state;
    }
    const next = target(state, node.autoNextNodeId, node.autoNextRules);
    if (!next) throw new Error('剧情节点缺少后续安排，已保留上一步进度。');
    const nextNode = nodeAt(story, next);
    if (state.mode === 'test' && nextNode.chapter !== state.testChapter) {
      state.status = 'stageEnd'; return state;
    }
    enter(story, state, next);
  }
}
export function startGame(story: Story): Session {
  const state: Session = { formatVersion: 1, projectId: story.id, contentVersion: story.contentVersion,
    mode: 'normal', currentNodeId: story.entryNodeId, flags: {}, history: [], choices: [], checkpoints: [], status: 'choice' };
  enter(story, state, story.entryNodeId);
  return settle(story, state);
}
export function choose(story: Story, original: Session, expectedNodeId: string, choiceId: string, input?: string): Session {
  if (original.currentNodeId !== expectedNodeId || original.status !== 'choice') throw new Error('这条行动已过期，请使用当前选项。');
  const choice = availableChoices(story, original).find(c => c.id === choiceId);
  if (!choice) throw new Error('当前无法选择这项行动。');
  if (input !== undefined && (typeof input !== 'string' || input.length > 500)) throw new Error('输入请控制在 500 字以内。');
  const state = structuredClone(original);
  state.choices.push({ nodeId: expectedNodeId, choiceId, ...(input ? { input } : {}) });
  append(state, expectedNodeId, choice.label, 'choice');
  applyEffects(state, choice.effects);
  if (choice.feedback) append(state, expectedNodeId, choice.feedback, 'feedback');
  const next = target(state, choice.nextNodeId, choice.nextNodeRules);
  if (!next) throw new Error('行动缺少后续剧情，已保留上一步进度。');
  const nextNode = nodeAt(story, next);
  if (state.mode === 'test' && nextNode.chapter !== state.testChapter) { state.status = 'stageEnd'; return state; }
  enter(story, state, next);
  return settle(story, state);
}
export function restoreCheckpoint(story: Story, original: Session, id: string): Session {
  const index = original.checkpoints.findIndex(cp => cp.id === id);
  if (index < 0) throw new Error('这个检查点尚未到达。');
  const checkpoint = original.checkpoints[index];
  if (original.mode === 'test' && nodeAt(story, checkpoint.nodeId).chapter !== original.testChapter) throw new Error('章节测试不能回退到其他章节。');
  const state = structuredClone(original);
  state.currentNodeId = checkpoint.nodeId;
  state.flags = { ...checkpoint.flags };
  state.history.length = checkpoint.historyLength;
  state.choices.length = checkpoint.choiceLength;
  state.checkpoints.length = index + 1;
  return settle(story, state);
}
const normalize = (text: string): string => text.trim().replace(/[\s，。！？、,.!?“”「」：:；;]/g, '');
export function resolveInput(story: Story, state: Session, text: string): InputResult {
  const input = normalize(text);
  const choices = availableChoices(story, state);
  const unmatched: InputResult = { kind: 'unmatched', message: '没有匹配到明确行动，请点击选项，或使用选项中的完整表达。' };
  if (!input || text.length > 500) return unmatched;
  const labels = choices.filter(c => normalize(c.label) === input);
  if (labels.length === 1) return { kind: 'matched', choiceId: labels[0].id };
  // Only scripted labels/keywords are understood; a negation must not turn into an affirmative action.
  const exact = choices.filter(c => c.keywords.some(k => normalize(k) === input));
  let candidates = exact.length ? exact
    : choices.filter(c => c.keywords.some(k => normalize(k).length >= 2 && input.includes(normalize(k))));
  if (!exact.length) {
    // A scripted keyword may itself be negative (e.g. “第三项不用”). Only
    // negation outside recognized keywords prevents executing that intention.
    const words = [...new Set(candidates.flatMap(c => c.keywords.map(normalize)))]
      .filter(word => word.length >= 2 && input.includes(word)).sort((a, b) => b.length - a.length);
    const remainder = words.reduce((text, word) => text.split(word).join(''), input);
    if (/不|没|别|勿|并非|放弃|拒绝/.test(remainder)) candidates = [];
  }
  if (candidates.length === 1) return { kind: 'matched', choiceId: candidates[0].id };
  if (candidates.length > 1) return { kind: 'ambiguous', message: '这句话可能对应多项行动，请直接选择其中一项。' };
  return unmatched;
}
export function startChapterTest(story: Story, chapterNumber: number): Session {
  const chapter = story.chapters.find(c => c.chapter === chapterNumber);
  if (!chapter) throw new Error('该章节尚未实装。');
  let state = startGame(story);
  for (const step of chapter.canonicalPrefix) state = choose(story, state, step.nodeId, step.choiceId);
  if (nodeAt(story, state.currentNodeId).chapter !== chapterNumber) throw new Error('章节前情未能到达正确入口。');
  state.mode = 'test'; state.testChapter = chapterNumber;
  return state;
}
