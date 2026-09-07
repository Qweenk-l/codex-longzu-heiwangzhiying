import { readFileSync } from 'node:fs';

const flag = (key, value = true) => ({ type: 'flag', key, value });
const visible = text => text.replace(/\*\*|`/g, '').replace(/^>\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const prepare = text => text.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  .split('\n').filter(line => !/^>\s*(?:\*\*【V0\.7C|~~)/.test(line))
  .map(line => line.replace(/^>\s*【红字修订】/, '')).join('\n')
  .replace(/；(自由输入根|立即结果|后台写入)：/g, '\n   - $1：');
const field = (text, label) => text.match(new RegExp(`^   - ${label}：([^\\n]+)`, 'm'))?.[1] ?? '';
const writes = text => [...text.matchAll(/`([A-Za-z]\w*)(?:\s*=\s*(true|false))?`/g)].map(m => flag(m[1], m[2] !== 'false'));
const parts = body => Object.fromEntries([...body.matchAll(/^### ([^\n]+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => [m[1], m[2].trim()]));
const rows = text => {
  const logical = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('|')) logical.push(line);
    else if (logical.length && (logical.at(-1).match(/\|/g) ?? []).length < 3) logical[logical.length - 1] += line.trim();
  }
  return logical.filter(line => !/后台条件|^\|\s*-/.test(line)).map(line => visible(line.split('|').slice(2, -1).join('|')));
};

export function buildChaptersTenThirteen(baseline) {
  const source = prepare(readFileSync(new URL('../content-source/v0.7C-ch10-ch13.md', import.meta.url), 'utf8'));
  const sections = Object.fromEntries([...source.matchAll(/^## (CH(?:10|11|12|13)-[^｜\n]+)｜([^\n]+)\n([\s\S]*?)(?=^## |^# |$(?![\s\S]))/gm)]
    .map(m => [m[1], { title: m[2], body: m[3], blocks: parts(m[3]) }]));
  if (Object.keys(sections).length !== 39) throw new Error('Expected 39 authored sections');
  const old = Object.fromEntries(baseline.nodes.map(node => [node.id, node]));
  const nodes = {};
  const add = (id, content = '', next, effects = []) => {
    if (nodes[id]) throw new Error(`Duplicate content node ${id}`);
    const node = { id, chapter: Number(id.match(/^CH(\d+)/)[1]), title: sections[id]?.title ?? id, content: visible(content), choices: [] };
    if (next) node.autoNextNodeId = next;
    if (effects.length) node.entryEffects = effects;
    nodes[id] = node;
    return node;
  };
  // All continuations below are explicit source relationships. Missing ones fail
  // the parent validation rather than silently jumping to a later chapter.
  const next = {
    'CH10-01':'CH10-02','CH10-02':'CH10-03','CH10-03':'CH10-04','CH10-04':'CH10-05','CH10-05':'CH10-06',
    'CH10-06':'CH10-07','CH10-07':'CH10-08','CH10-08':'CH10-09','CH10-09':'CH10-10','CH10-10':'CH11-01',
    'CH11-01':'CH11-02','CH11-02':'CH11-03','CH11-03':'CH11-04','CH11-04':'CH11-05',
    'CH11-05':'CH11-06','CH11-06':'CH11-07','CH11-07':'CH11-08','CH11-08':'CH12-01',
    'CH12-01':'CH12-02','CH12-02':'CH12-03','CH12-03':'CH12-04','CH12-04':'CH12-05',
    'CH12-05':'CH12-06','CH12-07A':'CH12-08','CH12-07B':'CH12-08','CH12-07C':'CH12-08',
    'CH12-08':'CH12-09','CH12-09':'CH13-01','CH13-01':'CH13-02','CH13-02':'CH13-03',
    'CH13-03':'CH13-04A','CH13-04A':'CH13-05','CH13-04B':'CH13-05','CH13-04C':'CH13-05',
    'CH13-05':'CH13-06','CH13-06':'CH13-07','CH13-07':'CH13-08',
  };
  for (const [id, section] of Object.entries(sections)) {
    const blocks = section.blocks;
    let content = blocks['玩家可见正文'] ?? blocks['玩家可见内容'] ?? '';
    content = content.replace(/^自动进入[^\n]*$/gm, '');
    if (blocks['玩家可见 UI']) content += '\n\n' + blocks['玩家可见 UI'];
    add(id, content, next[id]);
  }
  const choiceSource = { 'CH11-05': 'CH11-05-CHOICE', 'CH13-02': 'CH13-02-CHOICE' };
  for (const [id, section] of Object.entries(sections)) {
    const text = section.blocks['可见选项'] ?? '';
    for (const match of text.matchAll(/^\s*(\d+)\. \*\*(.+?)\*\*\n([\s\S]*?)(?=^\s*\d+\. \*\*|$(?![\s\S]))/gm)) {
      const index = Number(match[1]) - 1;
      const prior = old[choiceSource[id] ?? id]?.choices[index];
      const choiceId = prior?.id ?? (id === 'CH12-01' ? ['ch12-01-check', 'ch12-01-forge', 'ch12-01-danger'][index] : undefined);
      if (!choiceId) throw new Error(`No stable choice ID ${id}/${index}`);
      const resultText = field(match[3], '立即结果');
      if (!resultText) throw new Error(`No authored immediate result ${id}/${index}`);
      const target = id === 'CH12-06' ? `${id}-FEEDBACK-${index + 1}` : prior?.nextNodeId ?? `${id}-${['CHECK','FORGE','DANGER'][index]}`;
      add(target, resultText, id === 'CH11-07' && index < 2 ? id : next[id]);
      nodes[id].choices.push({ id: choiceId, label: visible(match[2]),
        keywords: [...field(match[3], '自由输入根').matchAll(/`([^`]+)`/g)].map(m => m[1]),
        effects: writes(field(match[3], '后台写入')), nextNodeId: target });
    }
    if (nodes[id].choices.length) delete nodes[id].autoNextNodeId;
  }
  // Conditional sequences render every independent group in order; alternatives
  // inside one group use first-match rules. Dispatch nodes contain no prose.
  const sequence = (owner, groups, destination) => {
    const stages = groups.map((_, i) => `${owner}-CONDITION-${i + 1}`);
    groups.forEach((alternatives, i) => {
      const after = stages[i + 1] ?? destination;
      const gate = add(stages[i], '', after);
      gate.autoNextRules = alternatives.map((item, j) => {
        const id = `${stages[i]}-TEXT-${j + 1}`;
        add(id, item.text, after);
        return { conditions: item.conditions, nextNodeId: id };
      });
    });
    nodes[owner].autoNextNodeId = stages[0] ?? destination;
  };
  const option = (conditions, text) => ({ conditions, text });
  const table = id => rows(sections[id].blocks['条件短结果（展示层）'] ?? '');
  const beforeChoices = (id, groups) => {
    const destination = `${id}-CHOICE`;
    add(destination);
    nodes[destination].choices = nodes[id].choices;
    nodes[id].choices = [];
    sequence(id, groups, destination);
    return destination;
  };
  const afterChoices = (id, groups, destination = next[id]) => {
    const resolve = `${id}-RESULT`;
    add(resolve);
    for (const choice of nodes[id].choices) nodes[choice.nextNodeId].autoNextNodeId = resolve;
    sequence(resolve, groups, destination);
    return resolve;
  };
  let t = table('CH10-02');
  sequence('CH10-02', [[option([flag('preparedIndependentComms')], t[0]), option([flag('reliedOnPrimaryMissionComms')], t[1]), option([], t[2])]], 'CH10-03');
  const sharedBlood = sections['CH10-03'].blocks['可见选项'].match(/\*\*共同结果：\*\* ([^\n]+)/)?.[1];
  if (!sharedBlood) throw new Error('Missing blood-door common outcome');
  add('CH10-03-RESULT', sharedBlood.replace(/自动进入[^。]*。/, ''), 'CH10-04');
  for (const choice of nodes['CH10-03'].choices) nodes[choice.nextNodeId].autoNextNodeId = 'CH10-03-RESULT';
  t = table('CH10-04');
  afterChoices('CH10-04', [[option([flag('preparedEmergencyExtraction')], t[0]), option([], t[1])]]);
  const sonar = nodes['CH10-04'].choices.find(c => c.id === 'ch10-04-sonar');
  add('CH10-04-SONAR-FAIL', '你尝试回传位移，主频道却没有传回可用的答复。诺诺把你的灯压向脚边，示意你避开齿轮下的空腔。', 'CH10-04-RESULT');
  sonar.nextNodeRules = [{ conditions: [flag('preparedIndependentComms')], nextNodeId: sonar.nextNodeId }];
  sonar.nextNodeId = 'CH10-04-SONAR-FAIL';
  // These two short echoes implement the source's stated familiarity differences.
  beforeChoices('CH10-05', [
    [option([flag('dreamFocusName')], '“康斯坦丁”的声音有些熟悉，让你想起梦里听见的呼唤。你仍然读不懂墙上完整的龙文。')],
    [option([flag('dreamFocusFlame')], '残痕里的火焰纹理让你想起那场梦。熟悉感转瞬即逝，没有替你解释墙上的文字。')],
  ]);
  for (const choice of nodes['CH10-05-CHOICE'].choices) nodes[choice.nextNodeId].entryEffects = [flag('foundTwinThroneEvidence')];
  t = table('CH10-06');
  beforeChoices('CH10-06', [[option([flag('preservedBrotherEvidence')], t[0]), option([], t[1])]]);
  const scanNode = nodes['CH10-07'];
  const scanIndex = scanNode.choices.findIndex(c => c.id === 'ch10-07-scan');
  const scan = scanNode.choices[scanIndex];
  scan.conditions = [flag('requestedNonlethalDragonProtocol'), flag('preparedIndependentComms')];
  scanNode.choices.splice(scanIndex + 1, 0, { ...structuredClone(scan), id: 'ch10-07-scan-emergency', conditions: [flag('requestedNonlethalDragonProtocol'), flag('preparedIndependentComms', false), flag('preparedEmergencyExtraction')] });
  t = table('CH10-08');
  sequence('CH10-08', [
    [option([flag('preparedIndependentComms')], t[0]), option([flag('reliedOnPrimaryMissionComms')], t[1])],
    [option([flag('preparedEmergencyExtraction')], t[2]), option([], t[3])],
  ], 'CH10-09');
  t = table('CH10-10');
  const returnText = sections['CH10-10'].blocks['条件短结果（展示层）'].match(/两人最终返回[^]*$/)?.[0];
  if (!returnText) throw new Error('Missing return to ship common prose');
  add('CH10-10-RESULT', returnText, 'CH11-01', ['completedChapterTen','nonoReturnedFromBronzeCity','sevenSinsCaseSecuredOnDeck','foundYeShengAtFinalRoute'].map(k => flag(k)));
  nodes['CH10-10-RESULT'].checkpointId = 'CP-CH10-END';
  sequence('CH10-10', [[option([flag('preparedEmergencyExtraction')], t[0]), option([], t[1])]], 'CH10-10-RESULT');
  t = table('CH11-01');
  sequence('CH11-01', [[option([flag('prioritizedFindingOldTang')], t[0]), option([flag('sharedOldTangDataWithExecutionBureau')], t[1]), option([], t[2])]], 'CH11-02');
  t = table('CH11-02');
  sequence('CH11-02', [
    [option([flag('oldTangDisplayedHumanFear')], t[0])], [option([flag('requestedOldTangIdentityCheck')], t[1])],
    [option([flag('oldTangDisplayedHumanFear',false),flag('requestedOldTangIdentityCheck',false)], t[2])],
  ], 'CH11-03');
  t = table('CH11-03');
  sequence('CH11-03', [
    [option([flag('focusedOnNonoAfterShooting')], t[0])], [option([flag('prioritizedDiveEvacuation')], t[1])],
    [option([flag('focusedOnNonoAfterShooting',false),flag('prioritizedDiveEvacuation',false)], t[2])],
  ], 'CH11-04');
  // The authored call feedback contains a condition, not two successive events.
  const call = nodes['CH11-04'].choices[2];
  const callText = nodes[call.nextNodeId].content;
  const callParts = callText.match(/^(.+?)若船上已经保存过他的人的证据，(.+?)；若没有，(.+)$/);
  if (!callParts) throw new Error('Missing conditional Old Tang call feedback');
  nodes[call.nextNodeId].content = callParts[1] + callParts[3];
  add('CH11-04-CALL-EVIDENCE', callParts[1] + callParts[2] + '。', 'CH11-05');
  const hKeys = ['preservedOldTangTrust','preservedOldTangInvasionRecord','preservedOldTangHumanMessage'];
  call.nextNodeRules = hKeys.map(k => ({ conditions:[flag(k)], nextNodeId:'CH11-04-CALL-EVIDENCE' }));
  t = table('CH11-05');
  beforeChoices('CH11-05', [
    [option([flag('preparedEmergencyExtraction')], t[0]), option([], t[1])],
    [option([flag('preparedIndependentComms')], t[2]), option([flag('reliedOnPrimaryMissionComms')], t[3])],
    [option([flag('deployedNonlethalDragonRestraint')], t[4]), option([flag('prioritizedConventionalWeapons')], t[5])],
  ]);
  t = table('CH11-06');
  beforeChoices('CH11-06', [
    [option([flag('answeredExchangeWhisper')], t[0])], [option([flag('triedToLowerSniperRifle')], t[1])],
    [option([flag('triedToUnderstandGunTrance')], t[2])],
    [option([flag('sawLittleDevilAtStation')], t[3]), option([flag('noticedLittleDevilEyes')], t[3])],
  ]);
  nodes['CH11-08'].entryEffects = ['nonoSurvivedNortonAttack','sevenSinsCaseReadyForBattle','completedChapterEleven'].map(k => flag(k));
  nodes['CH11-08'].checkpointId = 'CP-CH11-END';
  // Approved injury and information-boundary adaptations, not source rewrites.
  nodes['CH12-01'].content = nodes['CH12-01'].content.replace('它没有锁孔。诺诺把手掌贴在匣盖上，像是在感觉里面是否还有什么活着的东西。', '它没有锁孔。诺诺仍躺在担架上，示意你把手掌贴在匣盖上，确认里面是否还有动静。');
  const structureMarker = '诺诺看了看匣底的尺寸，又看向你在青铜城记下的结构图。';
  const atStructure = nodes['CH12-01'].content.indexOf(structureMarker);
  if (atStructure < 0) throw new Error('Missing structure boundary');
  const structure = nodes['CH12-01'].content.slice(atStructure);
  nodes['CH12-01'].content = nodes['CH12-01'].content.slice(0,atStructure).trim();
  const ch1201Choice = beforeChoices('CH12-01', [[
    option([flag('recordedBronzeForgeLocation')], structure), option([flag('securedNonlethalRestraintBlueprint')], structure),
    option([], '诺诺从担架上看了看匣底的尺寸。\n\n诺诺：最大的那柄和铸造台的槽口正好对应。它不是收藏品，是给某个王准备的答案。'),
  ]]);
  const forge = nodes[ch1201Choice].choices[1];
  forge.conditions = [flag('recordedBronzeForgeLocation')];
  nodes[ch1201Choice].choices.splice(2,0,{ ...structuredClone(forge), id:'ch12-01-forge-blueprint', conditions:[flag('recordedBronzeForgeLocation',false),flag('securedNonlethalRestraintBlueprint')] });
  nodes['CH12-03'].content = nodes['CH12-03'].content.replace('诺诺按住匣盖。','诺诺躺在担架上，示意你先按住匣盖。');
  nodes['CH12-03'].choices[2].label = nodes['CH12-03'].choices[2].label.replace('请诺诺把匣子合上','按诺诺的提示把匣子合上');
  nodes['CH12-03-CLOSE'].content = nodes['CH12-03-CLOSE'].content.replace('诺诺把匣盖压回去','你按诺诺的提示把匣盖压回去');
  nodes['CH12-03'].choices[1].effects = [flag('greedAvailable')];
  nodes['CH12-04'].content = nodes['CH12-04'].content.replace('诺诺站在你身后','诺诺躺在你身后的担架上');
  const hCombos = [3,5,6,7].map(mask => hKeys.map((k,i)=>flag(k,Boolean(mask & (1<<i)))));
  t = table('CH12-04');
  afterChoices('CH12-04', [[...hCombos.map(conditions=>option(conditions,t[0])),option([],t[1])]]);
  nodes['CH12-05'].content = nodes['CH12-05'].content.replace('诺诺打开任务终端，把你们实际带到现场的记录逐项展开。','你把任务终端放在诺诺手边，按她的提示把你们实际带到现场的记录逐项展开。');
  nodes['CH12-05'].choices[0].conditions = [flag('preservedBrotherEvidence')];
  const restraint = nodes['CH12-05'].choices[1];
  restraint.conditions = [flag('requestedNonlethalDragonProtocol'),flag('deployedNonlethalDragonRestraint')];
  nodes['CH12-05'].choices.splice(2,0,{...structuredClone(restraint),id:'ch12-05-restraint-blueprint',conditions:[flag('requestedNonlethalDragonProtocol'),flag('deployedNonlethalDragonRestraint',false),flag('securedNonlethalRestraintBlueprint')]});
  const final = nodes['CH12-06'];
  const [lethal,human,save] = final.choices;
  const b = [flag('witnessedConstantineShieldOldTang'),flag('preservedBrotherEvidence')];
  // Verify the exact established witness key rather than granting new evidence.
  const earlierKeys = JSON.stringify(baseline.nodes.filter(n=>/^CH[1-9]-/.test(n.id)));
  if (!earlierKeys.includes('witnessedConstantineShieldOldTang')) throw new Error('Unknown brother witness flag');
  nodes[lethal.nextNodeId].autoNextNodeId='CH12-07A';
  const humanFeedback = nodes[human.nextNodeId];
  humanFeedback.autoNextNodeId='CH12-07A';
  humanFeedback.autoNextRules=hCombos.map(conditions=>({conditions:[...conditions,...b],nextNodeId:'CH12-07B'}));
  nodes[save.nextNodeId].autoNextNodeId='CH12-07C';
  const cCombos = [
    [flag('requestedNonlethalDragonProtocol'),flag('deployedNonlethalDragonRestraint')],
    [flag('requestedNonlethalDragonProtocol'),flag('deployedNonlethalDragonRestraint',false),flag('securedNonlethalRestraintBlueprint')],
  ];
  const ready = hCombos.flatMap(h=>cCombos.map(c=>[...h,...b,...c]));
  final.choices.splice(2,1,...ready.map((conditions,i)=>({...structuredClone(save),id:i?`${save.id}-${i}`:save.id,conditions})));
  // Missing preparation explains the whole requirement, never a false diagnosis.
  const locked = sections['CH12-06'].body.match(/叙事理由：“([^”]+)”/)?.[1];
  if (!locked) throw new Error('Missing final gate locked explanation');
  const finalIntro=add('CH12-06-INTRO',final.content);
  final.content='';
  sequence(finalIntro.id, [[...ready.map(conditions=>option(conditions,'')),option([],locked)]], 'CH12-06');
  // CH12-05 outcomes arrive at the explanatory intro; the decision ID stays stable.
  for (const choice of nodes['CH12-05'].choices) nodes[choice.nextNodeId].autoNextNodeId=finalIntro.id;
  for (const [suffix,key] of [['A','resolvedCanonRoute'],['B','resolvedHumanRoute'],['C','resolvedEmberRoute']]) {
    nodes[`CH12-07${suffix}`].entryEffects = [flag(key),flag('nortonThreatNeutralized')];
  }
  nodes['CH12-07C'].entryEffects.push(flag('committedToSaveOldTang'),flag('usedWrathForSeparation'));
  const preparationMarker='束缚组件在船侧张开，青铜城结构图被反接进金属匣。';
  const atPreparation=nodes['CH12-07C'].content.indexOf(preparationMarker);
  if(atPreparation<0) throw new Error('Missing containment equipment boundary');
  const tail=nodes['CH12-07C'].content.slice(atPreparation+preparationMarker.length).trim();
  nodes['CH12-07C'].content=nodes['CH12-07C'].content.slice(0,atPreparation).trim();
  add('CH12-07C-TAIL',tail,'CH12-08');
  sequence('CH12-07C',[[
    option([flag('deployedNonlethalDragonRestraint'),flag('securedNonlethalRestraintBlueprint')],preparationMarker),
    option([flag('deployedNonlethalDragonRestraint')],'束缚组件在船侧张开，分离后的力量有了外部容纳位置。'),
    option([flag('securedNonlethalRestraintBlueprint')],'青铜城结构图被反接进金属匣，分离回路沿着蓝图展开。'),
  ]],'CH12-07C-TAIL');
  nodes['CH12-08'].entryEffects=[flag('nortonThreatNeutralized')];
  const outcomes=[['A','endingCanonAshes','resolvedCanonRoute'],['B','endingHumanEcho','resolvedHumanRoute'],['C','endingEmberAlive','resolvedEmberRoute']];
  nodes['CH12-09'].autoNextNodeId='CH12-09A';
  nodes['CH12-09'].autoNextRules=outcomes.map(([suffix,,route])=>({conditions:[flag(route),...(suffix==='C'?[flag('committedToSaveOldTang'),flag('usedWrathForSeparation')]:[])],nextNodeId:`CH12-09${suffix}`}));
  for(const [suffix,key] of outcomes) {
    const node=add(`CH12-09${suffix}`,'','CH13-01',[flag(key),flag('completedChapterTwelve')]);
    node.checkpointId='CP-CH12-END';
  }
  // Chapter thirteen reads a single outcome; no outcome flag is written here.
  beforeChoices('CH13-01',[[option([flag('focusedOnNonoAfterShooting')],'你先问起她的伤势，等她答话。')]]);
  t=table('CH13-02');
  beforeChoices('CH13-02',[[option([flag('preparedIndependentComms')],t[0]),option([],t[1])]]);
  nodes['CH13-03'].autoNextRules=[{conditions:[flag('endingHumanEcho')],nextNodeId:'CH13-04B'},{conditions:[flag('endingEmberAlive')],nextNodeId:'CH13-04C'}];
  const summary=nodes['CH13-07'];
  summary.content=summary.content.replace('屏幕在黑底上逐项显示本季事实：','第一季经历：')
    .replace(/^- 你是否保存了老唐作为人的证据[^\n]*\n?/m,'').replace(/^- 季终结果：[^\n]*\n?/m,'');
  const evidenceNames=['你保留了对老唐的信任。','你保存了老唐的手机和聊天记录。','你保存了老唐的人类消息及时间戳。'];
  sequence('CH13-07',[
    ...hKeys.map((k,i)=>[option([flag(k)],evidenceNames[i])]),
    [option([flag('preservedBrotherEvidence')],'你保存了康斯坦丁护住哥哥的影像。')],
    [option([flag('endingEmberAlive')],'季终结果：残火未熄。证据与准备支持了分离和封印；老唐仍需隔离观察。'),option([flag('endingHumanEcho')],'季终结果：人性回响。老唐在最后一秒作出了人的回应，但没有生还。'),option([flag('endingCanonAshes')],'季终结果：原著余烬。诺顿的威胁已解除，老唐没有回来。')],
  ],'CH13-08');
  nodes['CH13-08'].entryEffects=[flag('completedSeasonOne')];
  nodes['CH13-08'].checkpointId='CP-SEASON1-END';
  nodes['CH13-08'].stageEnd=true;
  return { nodes };
}
