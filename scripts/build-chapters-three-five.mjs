import { readFileSync } from 'node:fs';

const flag = (key, value = true) => ({ type: 'flag', key, value });
const clean = text => text.replace(/\*\*|`/g, '').trim();
const flags = text => [...text.matchAll(/`([a-zA-Z]\w*)`/g)].map(m => flag(m[1]));
const visible = text => text.split('\n')
  .map(line => line.replace(/<!--[\s\S]*?-->/g, ''))
  .filter(line => !/^\s*(?:\*\*|---|>.*(?:~~|【V0\.5D))/.test(line))
  .map(line => line.replace(/^>\s*【红字修订】/, ''))
  .join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Read the committed snapshot only. Baseline supplies stable choice IDs, never prose.
export function buildChaptersThreeFive(baseline) {
  const source = readFileSync(new URL('../content-source/v0.5D.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const sections = [...source.matchAll(/^## (CH[345]-[^｜\n]+)｜([^\n]+)\n([\s\S]*?)(?=^## |^# |$(?![\s\S]))/gm)];
  const nodes = {};
  const transitions = {};
  for (const [, ids, mode, targets, delay] of source.matchAll(/^\| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/gm)) {
    if (!ids.startsWith('`CH') || !/自动/.test(mode)) continue;
    const names = [...ids.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    const prefix = names[0].match(/^(CH\d-\d+)-/)?.[1];
    for (const name of names) transitions[/^CH\d-/.test(name) ? name : `${prefix}-${name}`] = {
      autoNextNodeId: targets.match(/`([^`]+)`/)?.[1], autoAdvanceMs: Number(delay.match(/\d+/)?.[0] ?? 0),
    };
  }
  const add = (id, title, content, metadata = '') => {
    if (nodes[id]) throw new Error(`Duplicate source node ${id}`);
    const entryEffects = metadata.split('\n').filter(line => /^(?:\*\*|- )(?:进入|自动写入|写入)/.test(line) && /写入/.test(line)).flatMap(flags);
    nodes[id] = { id, chapter: Number(id[2]), title, content: visible(content), choices: [], entryEffects, ...transitions[id] };
    return nodes[id];
  };
  for (const [, id, title, body] of sections) {
    const blocks = Object.fromEntries([...body.matchAll(/^### ([^\n]+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
    if (!blocks['玩家可见正文']) throw new Error(`Missing prose ${id}`);
    const node = add(id, title, blocks['玩家可见正文'], blocks['玩家可见正文'] + '\n' + (blocks['系统处理'] ?? ''));
    const old = baseline.nodes.find(n => n.id === id);
    if (!old) throw new Error(`Missing baseline node ${id}`);
    const common = Object.entries(blocks).find(([heading]) => heading.startsWith('共同结果 '));
    if (common) {
      const resultId = common[0].match(/`([^`]+)`/)[1];
      add(resultId, title, common[1], common[1]);
    }
    for (const [, label, meta] of (blocks['可见选项'] ?? '').matchAll(/^\d+\. \*\*(.+?)\*\*\n([\s\S]*?)(?=^\d+\. |^\*\*|$(?![\s\S]))/gm)) {
      const short = meta.match(/- 短结果 `([^`]+)`：([^\n]+)/);
      const nextNodeId = short?.[1] ?? meta.match(/- 后继：`([^`]+)`/)?.[1];
      const previous = old.choices.find(c => c.nextNodeId === nextNodeId);
      if (!previous) throw new Error(`Missing choice mapping ${id} -> ${nextNodeId}`);
      const choice = { id: previous.id, label: clean(label),
        keywords: [...(meta.match(/- 自由输入根：([^\n]+)/)?.[1] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]),
        effects: flags(meta.match(/- 写入：([^\n]+)/)?.[1] ?? ''), nextNodeId };
      const condition = meta.match(/- 显示条件：`(\w+) = (true|false)`/);
      if (condition) choice.conditions = [flag(condition[1], condition[2] === 'true')];
      node.choices.push(choice);
      if (short) {
        // Remove only the explicit routing suffix, retaining the authored short result.
        const content = short[2].replace(/[；，。]自动进入(?:\s*`[^`]+`|共同结果)。?$/, '。');
        const result = add(short[1], title, content);
        const commonWrites = body.match(/^\*\*进入任一短结果时自动写入：\*\*([^\n]+)/m)?.[1];
        if (commonWrites) result.entryEffects.push(...flags(commonWrites));
      }
    }
  }
  // The state contract supplies these two conditional phrases. Keep the authored
  // question, result and effects; only its lead-in reflects the earlier choice.
  for (const [id, choiceId, key, lead] of [
    ['CH4-03', 's-rank', 'questionedSRankBasis', '继续追问 S 级'],
    ['CH4-05', 'ask', 'noticedLittleDevilEyes', '认出同一双眼睛'],
  ]) {
    const choice = nodes[id].choices.find(c => c.id === choiceId);
    const conditional = { ...structuredClone(choice), id: `${choiceId}-recalled`, label: `${lead}：${choice.label}`, conditions: [flag(key)] };
    choice.conditions = [flag(key, false)];
    nodes[id].choices.push(conditional);
  }
  // Approved runtime-only corrections; preserve the reference snapshot verbatim.
  nodes['CH5-06'].content = nodes['CH5-06'].content.replace(
    '她在电影院里把你从人群中拽出来，在长途飞行中替你收拾狼狈，刚才又让你趴下',
    '她曾在那场告白之后出现在你面前，刚才又让你趴下',
  );
  nodes['CH5-09'].content = nodes['CH5-09'].content.replace('你明明不认识他们', '你明明不想向他们开枪');
  for (const [id, hours] of Object.entries({ 'CH3-01': 504, 'CH3-04': 48, 'CH5-14': 16 })) nodes[id].timeAdvanceHours = hours;
  for (const [id, checkpointId] of Object.entries({ 'CH3-08': 'CP-CH3-END', 'CH4-10': 'CP-CH4-END', 'CH5-14': 'CP-CH5-END' })) nodes[id].checkpointId = checkpointId;
  nodes['CH5-14'].stageEnd = true;
  for (const node of Object.values(nodes)) {
    if (!node.content || (!node.choices.length && !node.autoNextNodeId && !node.stageEnd)) throw new Error(`Incomplete source node ${node.id}`);
  }
  return { nodes };
}
