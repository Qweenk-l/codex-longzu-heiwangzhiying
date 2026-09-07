import { readFileSync } from 'node:fs';

const flag = (key, value = true) => ({ type: 'flag', key, value });
const keys = text => [...text.matchAll(/`([A-Za-z]\w*)`/g)].map(m => m[1]);
// Editorial instructions are not narrative, even when placed in a visible block.
const editorial = [
  '无论选择哪一边，安珀馆晚宴仍是学院公开活动，玩家都会前往；选择只决定谁在 CH9 的任务席位讨论中先为路明非担保。',
  '无论玩家如何回应，老唐都只知道任务表层，不知道外部雇主身份，也不知道黄铜罐会孵化康斯坦丁。',
  '正式决定仍属于执行部负责人，不把路明非写成新任指挥官。',
  '说明结束后，界面重新显示前两项，玩家仍须作出明确选择；本状态不跨节点保留。',
];
const visible = text => {
  let result = text.split('\n')
    .map(line => line.replace(/<!--[\s\S]*?-->/g, ''))
    .filter(line => !/^\s*(?:\*\*|---|>.*(?:~~|【V0\.7C)|自动进入|共同进入)/.test(line))
    .map(line => line.replace(/^>\s*(?:【红字修订】)?/, '').replace(/`/g, ''))
    .join('\n');
  for (const note of editorial) result = result.replace(note, '');
  return result.replace(/\n{3,}/g, '\n\n').trim();
};

export function buildChaptersSixNine(baseline) {
  const source = readFileSync(new URL('../content-source/v0.7C-ch6-ch9.md', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    // Review comments after a short-result colon are editorial only; join the
    // authored continuation so it remains one parsed short-result sentence.
    .replace(/：<!--[\s\S]*?-->\n/g, '：')
    .replace(/<!--[\s\S]*?-->/g, '');
  const original = Object.fromEntries(baseline.nodes.map(n => [n.id, n]));
  const nodes = {};
  const add = (id, title, content) => {
    if (nodes[id]) throw new Error(`Duplicate node ${id}`);
    const old = original[id];
    const node = { id, chapter: Number(id[2]), title, content: visible(content), choices: [], entryEffects: [] };
    if (old?.autoNextNodeId) node.autoNextNodeId = old.autoNextNodeId;
    nodes[id] = node;
    return node;
  };
  for (const [, id, title, body] of source.matchAll(/^## (CH[6-9]-\d+)｜([^\n]+)\n([\s\S]*?)(?=^## |^# |$(?![\s\S]))/gm)) {
    const blocks = Object.fromEntries([...body.matchAll(/^### ([^\n]+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
    const prose = Object.entries(blocks).find(([heading]) => heading.startsWith('玩家可见正文'));
    const node = add(id, title, prose[1]);
    const common = Object.entries(blocks).find(([heading]) => /^共同(?:结果|结算)/.test(heading));
    let result;
    if (common) result = add(common[0].match(/`([^`]+)`/)[1], title, common[1]);
    const choiceBlock = blocks['可见选项'] ?? blocks['条件可见选项'] ?? '';
    for (const [, label, meta] of choiceBlock.matchAll(/^\d+\. \*\*(.+?)\*\*\n([\s\S]*?)(?=^\d+\. |^\*\*|$(?![\s\S]))/gm)) {
      const short = meta.match(/- 短结果 `([^`]+)`：([^\n]+)/);
      if (!short) throw new Error(`Missing result ${id}`);
      const prior = original[id].choices.find(c => c.nextNodeId === short[1]);
      if (!prior) throw new Error(`Missing choice ID ${id}/${short[1]}`);
      const choice = { id: prior.id, label, keywords: [...(meta.match(/- 自由输入根：([^\n]+)/)?.[1] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]),
        effects: keys(meta.match(/- 写入：([^\n]+)/)?.[1] ?? '').map(k => flag(k)), nextNodeId: short[1] };
      const condition = meta.match(/- 条件：([^\n]+)/)?.[1];
      if (condition && !/或|至少/.test(condition)) {
        choice.conditions = [...condition.matchAll(/`(\w+)(?: = (true|false))?`/g)].map(m => flag(m[1], m[2] !== 'false'));
      }
      node.choices.push(choice);
      const text = short[2].replace(/自动进入[^。]*。$/, '');
      const shortNode = add(short[1], title, text);
      if (result) shortNode.autoNextNodeId = result.id;
    }
    const system = blocks['系统处理'] ?? '';
    const facts = [...system.matchAll(/- 固定写入：([^。\n]+)/g)].flatMap(m => keys(m[1]).map(k => flag(k)));
    if (id === 'CH6-05') facts.push(flag('chapterFiveRewardPending3E', false));
    const recipients = result ? [result] : node.choices.length ? node.choices.map(c => nodes[c.nextNodeId]) : [node];
    for (const recipient of recipients) {
      recipient.entryEffects.push(...facts);
      const checkpoint = system.match(/保存检查点[： ]*`([^`]+)`/)?.[1];
      if (checkpoint) recipient.checkpointId = checkpoint;
    }
    if (id === 'CH6-09') for (const recipient of recipients) recipient.autoNextNodeId = 'CH7-01';
  }
  // OR clauses become disjoint visible variants, never AND requirements or duplicate buttons.
  for (const [id, choiceId, alternatives] of [
    ['CH6-05', 'ch6-05-parents', ['readParentsLetter', 'askedPriorityParents']],
    ['CH9-06', 'ch9-06-nonlethal', ['preservedOldTangTrust', 'preservedOldTangInvasionRecord', 'preservedOldTangHumanMessage']],
  ]) {
    const node = nodes[id], index = node.choices.findIndex(c => c.id === choiceId), choice = node.choices[index];
    node.choices.splice(index, 1, ...alternatives.map((key, i) => ({ ...structuredClone(choice),
      id: i ? `${choiceId}-${i + 1}` : choiceId,
      conditions: [...alternatives.slice(0, i).map(k => flag(k, false)), flag(key)] })));
  }
  // Keep the author's conditional backing between the briefing and its closing dialogue.
  const backing = source.match(/### 条件短结果（展示层）\n([\s\S]*?)(?=^## )/m)[1];
  const tail = backing.slice(backing.indexOf('你看完职责表。'));
  add('CH9-03-CLOSE', nodes['CH9-03'].title, tail).autoNextNodeId = 'CH9-04';
  nodes['CH9-03'].autoNextNodeId = 'CH9-03-CLOSE';
  nodes['CH9-03'].autoNextRules = [];
  for (const [, key, text] of backing.matchAll(/^\| `(\w+) = true` \| (.+) \|$/gm)) {
    const id = `CH9-03-${key}`;
    const echo = add(id, nodes['CH9-03'].title, text);
    echo.autoNextNodeId = 'CH9-03-CLOSE';
    nodes['CH9-03'].autoNextRules.push({ conditions: [flag(key)], nextNodeId: id });
  }
  // Risk review returns to the same decision with only the two actual commitments.
  nodes['CH9-04-REVIEW'].autoNextNodeId = 'CH9-04';
  nodes['CH9-04'].choices.find(c => c.id === 'ch9-04-review').conditions = [flag('reviewedWorstCaseExtraction', false)];
  for (const id of ['CH9-04-PREPARE', 'CH9-04-STANDARD']) nodes[id].entryEffects.push(flag('reviewedWorstCaseExtraction', false));
  // No protocol means no experimental-equipment page. The original short result supplies prose.
  for (const id of ['CH9-06-LETHAL', 'CH9-06-CHECK']) {
    nodes[id].entryEffects.push(flag('standardMissionLoadoutConfirmed'));
    nodes[id].autoNextNodeId = 'CH9-08';
  }
  // Two approved, runtime-only continuity corrections; source snapshot remains unchanged.
  nodes['CH6-06'].content = nodes['CH6-06'].content.replace('曼斯的声音从扬声器里传来，比你在面试时听见的更低。', '曼斯的声音从扬声器里传来，低沉而紧绷。');
  const armed = structuredClone(nodes['CH8-03']);
  armed.id = 'CH8-03-DISARMED'; nodes[armed.id] = armed;
  nodes['CH8-03'].content = nodes['CH8-03'].content.replace('她把老唐那支枪插进后腰，又从维修箱里取出一把短枪。', '她从维修箱里取出一把短枪。');
  nodes['CH8-02'].autoNextRules = [{ conditions: [flag('prioritizedNonoSafetyWithOldTang')], nextNodeId: armed.id }];
  delete nodes['CH9-08'].autoNextNodeId;
  nodes['CH9-08'].stageEnd = true;
  return { nodes };
}
