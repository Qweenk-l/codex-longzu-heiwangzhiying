const flag = (key, value = true) => ({ type: 'flag', key, value });

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected one C16 match for ${label}, found ${count}`);
  return text.replace(from, to);
}

function nodeAt(nodes, id) {
  const node = nodes[id];
  if (!node) throw new Error(`Missing C16 node: ${id}`);
  if (node.chapter > 9) throw new Error(`C16 front revision escaped chapter nine: ${id}`);
  return node;
}

function choiceAt(nodes, nodeId, choiceId) {
  const choice = nodeAt(nodes, nodeId).choices.find(item => item.id === choiceId);
  if (!choice) throw new Error(`Missing C16 choice: ${nodeId}/${choiceId}`);
  return choice;
}

// Approved C16 runtime corrections for the prologue through Chapter 9.
// Reviewed manuscripts and content-source snapshots remain unchanged.
export function applyC16Front(nodes) {
  const avoidance = choiceAt(nodes, 'CH1-01', 'avoidance');
  avoidance.label = replaceOnce(avoidance.label,
    '“先把这盘打完。反正拒信不会长腿跑掉。”',
    '“再开一盘。反正拒信不会长腿跑掉。”',
    'CH1-01 avoidance label');
  avoidance.feedback = '婶婶又在门外催了一声。你只好关掉游戏，先出门去拿信。';

  const indirect = choiceAt(nodes, 'CH1-01', 'indirect-probe');
  indirect.feedback = '老唐：各家不一样。我又不在招生办上班。先去看看，真有问题回来再说。\n\n婶婶又在门外催了一声，你只好先出门去拿信。';

  const silent = nodeAt(nodes, 'CH2-08-DIGNITY-SILENT');
  silent.content = replaceOnce(silent.content,
    '刚才那句拒绝只花了一口气，走到门口时，你才把下一口气慢慢吐出来。',
    '你没有说话，走到门口时，才把下一口气慢慢吐出来。',
    'CH2-08-DIGNITY-SILENT silent action');

  const threeE = nodeAt(nodes, 'CH6-01');
  threeE.content = replaceOnce(threeE.content,
    '芬格尔蹲下来，把一支可水洗的黑色笔塞给你。',
    '芬格尔蹲下来，把一支可水洗的黑色笔塞给你，只要求考试后请一顿能看见肉的早餐。',
    'CH6-01 first pen handoff');
  threeE.content = replaceOnce(threeE.content,
    '\n\n芬格尔把笔塞进你手里，只要求考试后请一顿能看见肉的早餐。',
    '',
    'CH6-01 duplicate pen handoff');

  const ch7 = nodeAt(nodes, 'CH7-08');
  const memoryBridge = '过去几年，无数个失眠夜里，你们隔着太平洋在星际地图上互相拆家。';
  const interviewMemory = '面试前他教你怎样在听不懂英语时保持微笑，还答应等你到了美国，要带你坐灰狗去看纽约以外的地方。';
  const marker = `${memoryBridge}${interviewMemory}`;
  const position = ch7.content.indexOf(marker);
  if (position < 0 || ch7.content.indexOf(marker, position + 1) >= 0) throw new Error('Missing unique CH7 memory');
  const tail = ch7.content.slice(position + marker.length).trim();
  const askedRoute = { ...structuredClone(ch7), id: 'CH7-08-ASKED-OLDTANG',
    content: `${interviewMemory}\n\n${tail}`, entryEffects: [] };
  const unaskedRoute = { ...structuredClone(ch7), id: 'CH7-08-NO-OLDTANG', content: tail, entryEffects: [] };
  delete askedRoute.checkpointId;
  delete unaskedRoute.checkpointId;
  ch7.content = ch7.content.slice(0, position) + memoryBridge;
  ch7.autoNextNodeId = unaskedRoute.id;
  ch7.autoNextRules = [
    { conditions: [flag('askedOldTang')], nextNodeId: askedRoute.id },
  ];
  nodes[askedRoute.id] = askedRoute;
  nodes[unaskedRoute.id] = unaskedRoute;

  const poolResult = nodeAt(nodes, 'CH8-03-RESULT');
  poolResult.content = replaceOnce(poolResult.content,
    '诺诺留在外侧与恺撒的防线汇合，不进入后续泳池段落。你、老唐和芬格尔沿服务梯抵达室内泳池。',
    '诺诺留在外侧与恺撒的防线汇合。你、老唐和芬格尔沿服务梯抵达室内泳池。',
    'CH8-03-RESULT destination');

  const share = choiceAt(nodes, 'CH9-02', 'ch9-02-share');
  share.label = replaceOnce(share.label,
    '把恢复数据和取证过程完整交给执行部',
    '把恢复数据和取证过程完整交给执行部，并申请调阅护兄影像',
    'CH9-02 share label');
  share.keywords = [...share.keywords, '申请调阅护兄影像'];
  const shareResult = nodeAt(nodes, 'CH9-02-SHARE');
  shareResult.content += '\n\n你要求调阅康斯坦丁护住哥哥的原始影像。执行部审核后，将经核验的副本纳入本次任务资料。';
  shareResult.entryEffects.push(flag('preservedBrotherEvidence'));

  const deployment = nodeAt(nodes, 'CH9-03');
  deployment.content = replaceOnce(deployment.content,
    '- 零：岸上监控、替补与机动支援。\n- 恺撒：战斗组与紧急撤离指挥。',
    '- 楚子航：船侧近距掩护。\n- 零：岸上监控、替补与机动支援。\n- 恺撒：战斗组火力与紧急撤离指挥。',
    'CH9-03 deployment owners');

  const protocol = nodeAt(nodes, 'CH9-06');
  protocol.content = replaceOnce(protocol.content,
    '你：那认什么？',
    '你：那我要拿什么说服他们？',
    'CH9-06 evidence question');
  const nonlethalChoices = protocol.choices.filter(choice => choice.id.startsWith('ch9-06-nonlethal'));
  if (nonlethalChoices.length !== 3) throw new Error(`Expected three C16 nonlethal variants, found ${nonlethalChoices.length}`);
  for (const nonlethal of nonlethalChoices) nonlethal.effects.push(flag('preservedOldTangTrust'));
  const nonlethalResult = nodeAt(nodes, 'CH9-06-NONLETHAL');
  nonlethalResult.content += '\n\n你：警戒不能撤。但他留下那些记录的时候，还在想以后去哪儿。我愿意为他争取这一次，前提是其他人能撤出去。';

  nodeAt(nodes, 'CH1-10').content = replaceOnce(nodeAt(nodes, 'CH1-10').content,
    '窗外有人拖动行李箱', '门外有人拖动行李箱', 'CH1-10 corridor sound');
  nodeAt(nodes, 'CH2-03-HIDDEN-INTEREST').content = replaceOnce(nodeAt(nodes, 'CH2-03-HIDDEN-INTEREST').content,
    '昨天你也这样摸过那部手机', '收到邀请那天，你也这样摸过那部手机', 'CH2-03 hidden interest echo');
  nodeAt(nodes, 'CH3-04-RESULT').content = replaceOnce(nodeAt(nodes, 'CH3-04-RESULT').content,
    '无论你如何回应，男孩都没有解释交换的内容。',
    '男孩没有解释交换的内容。',
    'CH3-04 response boundary');
  nodeAt(nodes, 'CH5-13').content = replaceOnce(nodeAt(nodes, 'CH5-13').content,
    '规则就是这么写的。用不用是你的事，但不能假装它原本写成“双方先同意”。',
    '校规上白纸黑字。你要真拿它去追人，挨揍的时候可别报我的名字。',
    'CH5-13 romance rule');
  nodeAt(nodes, 'CH5-13-RELATION').content = replaceOnce(nodeAt(nodes, 'CH5-13-RELATION').content,
    '芬格尔确认这是全校都知道的公开关系；今天的枪声不会自动把任何人的感情改写。',
    '芬格尔确认这是全校都知道的公开关系。\n\n芬格尔：赢了比赛就够了，别把人家的感情也算进奖品。',
    'CH5-13-RELATION boundary');

  return nodes;
}
