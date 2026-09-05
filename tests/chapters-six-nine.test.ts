import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Story } from '../src/engine/types';
import { availableChoices, choose, resolveInput, restoreCheckpoint, startGame } from '../src/engine/engine';

const modulePath = '../scripts/build-chapters-six-nine.mjs';
const { buildChaptersSixNine } = await import(modulePath);
const baseline = JSON.parse(readFileSync(new URL('../content-source/baseline-v0.7C.json', import.meta.url), 'utf8'));
const story: Story = {
  id: 'six-nine-test', contentVersion: 'test', entryNodeId: 'CH6-01', chapters: [], endings: {},
  ...buildChaptersSixNine(baseline),
};

const sourcePath = new URL('../../01-剧情文档/01-当前参考稿/龙族试玩第一季第六至第九章剧情与玩法设计稿-v0.7C-修订标注版.md', import.meta.url);
const snapshotPath = new URL('../content-source/v0.7C-ch6-ch9.md', import.meta.url);

function authoredText(text: string): string {
  return text.split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !/^>\s*\*\*【V0\.7C 修订/.test(trimmed)
        && !/^>\s*~~/.test(trimmed)
        && !/^~~/.test(trimmed)
        && !/^(?:自动进入|共同进入|建议延时)/.test(trimmed)
        && !/^---$/.test(trimmed);
    })
    .map(line => line.replace(/^>\s*(?:【红字修订】)?/, '').replace(/`/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function authoredNodeText(id: string, text: string): string {
  let content = authoredText(text);
  if (id === 'CH7-02') {
    content = content.replace('\n\n无论选择哪一边，安珀馆晚宴仍是学院公开活动，玩家都会前往；选择只决定谁在 CH9 的任务席位讨论中先为路明非担保。', '');
  }
  if (id === 'CH8-01-RESULT') {
    content = content.replace('无论玩家如何回应，老唐都只知道任务表层，不知道外部雇主身份，也不知道黄铜罐会孵化康斯坦丁。\n\n', '');
  }
  if (id === 'CH8-10-RESULT') {
    content = content.replace('正式决定仍属于执行部负责人，不把路明非写成新任指挥官。', '');
  }
  if (id === 'CH6-06') content = content.replace('曼斯的声音从扬声器里传来，比你在面试时听见的更低。', '曼斯的声音从扬声器里传来，低沉而紧绷。');
  if (id === 'CH8-03') content = content.replace('她把老唐那支枪插进后腰，又从维修箱里取出一把短枪。', '她从维修箱里取出一把短枪。');
  if (id === 'CH9-04-REVIEW') content = content.replace('说明结束后，界面重新显示前两项，玩家仍须作出明确选择；本状态不跨节点保留。', '');
  return content.trim();
}

function sourceSections(): Map<string, { title: string; body: string }> {
  const source = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
  return new Map([...source.matchAll(/^## (CH[6-9]-[^｜\n]+)｜([^\n]+)\n([\s\S]*?)(?=^## |^# |$(?![\s\S]))/gm)]
    .map(([, id, title, body]) => [id, { title, body }]));
}

function block(body: string, heading: string): string {
  const marker = `### ${heading}`;
  const start = body.indexOf(marker);
  if (start < 0) throw new Error(`missing source block ${heading}`);
  return body.slice(body.indexOf('\n', start) + 1).split(/^### /m)[0].trim();
}

function expectedSourceNodes(): Map<string, string> {
  const expected = new Map<string, string>();
  for (const [id, section] of sourceSections()) {
    expected.set(id, authoredNodeText(id, block(section.body, '玩家可见正文')));
    const result = section.body.match(/^### (?:共同结果|共同结算) `([^`]+)`\n([\s\S]*?)(?=^### |$(?![\s\S]))/m);
    if (result) expected.set(result[1], authoredNodeText(result[1], result[2]));
    const options = section.body.match(/^### (?:可见选项|条件可见选项)\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1] ?? '';
    for (const [, , meta] of options.matchAll(/^\d+\. \*\*(.+?)\*\*\n([\s\S]*?)(?=^\d+\. |$(?![\s\S]))/gm)) {
      const short = meta.match(/^\s*- 短结果 `([^`]+)`：([^\n]+)/m);
      if (!short) continue;
      let content = short[2].trim();
      content = content.replace(/自动进入(?:\s*`[^`]+`|共同(?:结果|结算))。?$/, '');
      expected.set(short[1], authoredNodeText(short[1], content));
    }
  }
  return expected;
}

describe('第六至第九章内容', () => {
  it('所有新选项关键词与自然短句可匹配，混合意图不自动代选', () => {
    for(const node of Object.values(story.nodes)) for(const choice of node.choices) {
      const state=startGame(story);
      state.currentNodeId=node.id;
      state.flags={};
      for(const condition of choice.conditions??[]) state.flags[condition.key]=condition.value??true;
      expect(availableChoices(story,state).some(c=>c.id===choice.id)).toBe(true);
      expect(choice.keywords.length).toBeGreaterThan(0);
      for(const keyword of choice.keywords) {
        expect(resolveInput(story,state,keyword),`${node.id}/${keyword}`).toEqual({kind:'matched',choiceId:choice.id});
        expect(resolveInput(story,state,`我想${keyword}`)).toEqual({kind:'matched',choiceId:choice.id});
        expect(resolveInput(story,state,`我不想${keyword}`).kind).toBe('unmatched');
      }
      const other=availableChoices(story,state).find(c=>c.id!==choice.id);
      if(other) expect(resolveInput(story,state,`${choice.keywords[0]}，同时${other.keywords[0]}`).kind).toBe('ambiguous');
    }
  });
  it('风险复核只返回两项承诺，离开后关闭临时复核状态', () => {
    const local = { ...story, entryNodeId: 'CH9-04' };
    let state = startGame(local);
    state = choose(local, state, 'CH9-04', 'ch9-04-review');
    expect(state.currentNodeId).toBe('CH9-04');
    expect(availableChoices(local, state).map(c=>c.id)).toEqual(['ch9-04-prepare','ch9-04-standard']);
    expect(state.history.some(h=>h.text.includes('界面重新显示'))).toBe(false);
    state = choose(local, state, 'CH9-04', 'ch9-04-standard');
    expect(state.currentNodeId).toBe('CH9-05');
    expect(state.flags.reviewedWorstCaseExtraction).toBe(false);
    expect(state.flags.acceptedStandardExtractionRisk).toBe(true);
    expect(state.flags.preparedEmergencyExtraction).not.toBe(true);
  });

  it('三种人类证据满足OR门槛，无协议不展示实验装备，协议不等于装载', () => {
    const local = { ...story, entryNodeId: 'CH9-06' };
    const evidence = ['preservedOldTangTrust','preservedOldTangInvasionRecord','preservedOldTangHumanMessage'];
    for(let mask=0;mask<8;mask++) {
      let state = startGame(local);
      evidence.forEach((key,i)=>state.flags[key]=!!(mask & (1<<i)));
      const options = availableChoices(local,state).filter(c=>c.id.startsWith('ch9-06-nonlethal'));
      expect(options).toHaveLength(mask ? 1 : 0);
      if(mask) {
        state=choose(local,state,state.currentNodeId,options[0].id);
        expect(state.currentNodeId).toBe('CH9-07');
        state=choose(local,state,state.currentNodeId,'ch9-07-weapons');
        expect(state.flags.requestedNonlethalDragonProtocol).toBe(true);
        expect(state.flags.deployedNonlethalDragonRestraint).not.toBe(true);
      } else {
        for(const id of ['ch9-06-lethal','ch9-06-check']) {
          const end=choose(local,state,state.currentNodeId,id);
          expect(end.currentNodeId).toBe('CH9-08');
          expect(end.flags.standardMissionLoadoutConfirmed).toBe(true);
          expect(end.history.some(h=>h.nodeId==='CH9-07')).toBe(false);
        }
      }
    }
  });

  it('社团担保只显示对应正文，交枪事实控制诺诺持枪描写', () => {
    for(const key of ['receivedLionheartBacking','receivedStudentUnionBacking','remainedUnaffiliated']) {
      const local={...story,entryNodeId:'CH9-03'};
      const seed=startGame({...local,entryNodeId:'CH9-02'});
      seed.flags[key]=true;
      const next=choose(local,seed,'CH9-02','ch9-02-message');
      expect(next.history.filter(h=>h.nodeId.startsWith('CH9-03-')&&h.nodeId!=='CH9-03-CLOSE')).toHaveLength(1);
      expect(next.history.some(h=>h.nodeId===`CH9-03-${key}`)).toBe(true);
      expect(next.history.map(h=>h.text).join('\n')).not.toContain('后台条件');
    }
    for(const id of ['ch8-01-trust','ch8-01-disarm']) {
      const local={...story,entryNodeId:'CH8-01'};
      const state=choose(local,startGame(local),'CH8-01',id);
      expect(story.nodes[state.currentNodeId].content.includes('她把老唐那支枪插进后腰')).toBe(id.endsWith('disarm'));
    }
  });
  it('保留基线中的35个主节点及全部短结果、共同结果和条件正文节点', () => {
    const baselineNodes = baseline.nodes.filter((node: { id: string }) => /^CH[6-9]-/.test(node.id));
    const mainIds = Object.keys(story.nodes).filter(id => /^CH[6-9]-\d+$/.test(id));
    expect(mainIds).toHaveLength(35);
    expect(Object.keys(story.nodes)).toHaveLength(110);
    for (const node of Object.values(story.nodes)) {
      const old = node;
      expect(node, old.id).toBeDefined();
      expect(node.content.trim(), old.id).not.toBe('');
      expect(node.content, old.id).not.toMatch(/系统处理|写入：|自动进入|共同后继|【红字修订】|~~|\*\*/);
      expect(node.choices.every(choice => !/^继续(?:观看)?$/.test(choice.label)), old.id).toBe(true);
      for (const choice of node.choices) {
        expect(story.nodes[choice.nextNodeId], `${old.id}/${choice.id}`).toBeDefined();
        for (const condition of choice.conditions ?? []) expect(typeof condition.value).toBe('boolean');
      }
      for (const next of [node.autoNextNodeId, ...(node.autoNextRules ?? []).map(rule => rule.nextNodeId)]) {
        if (next) expect(story.nodes[next], `${old.id}->${next}`).toBeDefined();
      }
    }
    for (const id of ['CH6-09-NAMES','CH6-09-CAUSE','CH6-09-SILENT']) expect(story.nodes[id].checkpointId).toBe('CP-CH6-END');
    expect(story.nodes['CH7-08'].checkpointId).toBe('CP-CH7-END');
    expect(story.nodes['CH8-10-RESULT'].checkpointId).toBe('CP-CH8-END');
    expect(story.nodes['CH9-08'].checkpointId).toBe('CP-CH9-END');
    expect(story.nodes['CH9-08'].stageEnd).toBe(true);
    expect(story.nodes['CH9-08'].autoNextNodeId).toBeUndefined();
  });

  it('副本与审核稿逐字节一致，正文只采纳红字且逐段进入节点', () => {
    const source = readFileSync(sourcePath);
    const snapshot = readFileSync(snapshotPath);
    expect(snapshot.equals(source)).toBe(true);
    for (const [id, content] of expectedSourceNodes()) {
      expect(story.nodes[id]?.content, id).toBe(content);
    }
    expect(story.nodes['CH6-08'].content).toContain('那只金属匣与黄铜罐在同一处被发现');
    expect(story.nodes['CH6-08'].content).not.toContain('无法让一个人同时带走两件沉重物品');
    expect(story.nodes['CH7-07-RESULT'].content).toContain('冰窖孵化反应已确认；入侵者身份未知');
    expect(story.nodes['CH7-08'].content).toContain('雨水、机油和冰窖寒气');
    expect(story.nodes['CH8-10'].content).toContain('将指定溶液注入其中，以触发孵化');
    expect(story.nodes['CH9-02'].content).toContain('结束问询的芬格尔获准回到宿舍');
    expect(story.nodes['CH9-03-receivedLionheartBacking'].content).toBe('楚子航在确认栏上签下名字，只说：“狮心会确认路明非按职责行动。”');
  });

  it('选项 ID、后继、关键词、条件和固定旗标与基线合同一致', () => {
    for (const old of baseline.nodes.filter((node: { id: string }) => /^CH[6-9]-/.test(node.id))) {
      const actual = story.nodes[old.id];
      if (!actual) { expect(['CH6-09-RESULT','CH9-04-DECIDE','CH9-04-PREPARE-FINAL','CH9-04-STANDARD-FINAL']).toContain(old.id); continue; }
      const oldChoiceIds = new Set(old.choices.map((choice: { id: string }) => choice.id));
      expect(actual.choices.filter(choice => oldChoiceIds.has(choice.id)).map(choice => choice.id), old.id)
        .toEqual(old.choices.map((choice: { id: string }) => choice.id));
      for (const oldChoice of old.choices) {
        const choice = actual.choices.find(item => item.id === oldChoice.id);
        expect(choice?.label, `${old.id}/${oldChoice.id}`).toBe(oldChoice.label);
        expect(choice?.keywords, `${old.id}/${oldChoice.id}`).toEqual(oldChoice.keywords);
        expect(choice?.nextNodeId, `${old.id}/${oldChoice.id}`).toBe(oldChoice.nextNodeId);
        expect(choice?.effects, `${old.id}/${oldChoice.id}`).toEqual(oldChoice.effects);
      }
    }
    const writers = (key: string) => Object.values(story.nodes)
      .filter(node => node.entryEffects?.some(effect => effect.key === key))
      .map(node => node.id);
    const fixed: Record<string, string[]> = {
      completedMysteriousNinthAnswer: ['CH6-04-RESULT'],
      passedThreeE: ['CH6-05-RESULT'],
      freedomDayRewardsConfirmed: ['CH6-05-RESULT'],
      chapterFiveRewardPending3E: ['CH6-05-RESULT'],
      bronzeMapOpened: ['CH6-07-RESULT'],
      yeShengDiedInBronzeCity: ['CH6-08'],
      yajiDiedAfterDeliveringBrassUrn: ['CH6-08'],
      documentedRescueWindowFailure: ['CH6-08'],
      brassUrnRecoveredByMansTeam: ['CH6-08'],
      oldTangAppearedDuringCassellInvasion: ['CH7-08'],
      heardConstantineCallForBrother: ['CH8-02'],
      oldTangDisplayedHumanFear: ['CH8-04'],
      luFiredSageStoneShot: ['CH8-07-RESULT'],
      luDeliberatelyOffsetAim: ['CH8-07-RESULT'],
      constantineDiedAtCassell: ['CH8-08'],
      witnessedConstantineShieldOldTang: ['CH8-08'],
      recordedOldTangLateBrotherRecall: ['CH8-09'],
      nortonAwakenedAfterConstantineDeath: ['CH8-09'],
      requiredKuyimenSafetyReview: ['CH8-10-RESULT'],
      completedKuyimenTrainingPeriod: ['CH9-01'],
      completedChapterSix: ['CH6-09-NAMES','CH6-09-CAUSE','CH6-09-SILENT'],
      completedChapterSeven: ['CH7-08'],
      completedChapterEight: ['CH8-10-RESULT'],
      completedChapterNine: ['CH9-08'],
    };
    for (const [key, nodes] of Object.entries(fixed)) expect(writers(key), key).toEqual(nodes);
    expect(story.nodes['CH6-05-RESULT'].entryEffects).toContainEqual({ type: 'flag', key: 'chapterFiveRewardPending3E', value: false });
    expect(story.nodes['CH9-06'].choices.find(choice => choice.id === 'ch9-06-nonlethal')?.conditions).toEqual([
      { type: 'flag', key: 'preservedOldTangTrust', value: true },
    ]);
  });

  it('条件选项按 AND/OR 变体过滤，自由输入不能绕过关闭条件', () => {
    const state = startGame(story);
    state.currentNodeId = 'CH6-04';
    state.status = 'choice';
    state.flags = { sawLittleDevilAtStation: true, noticedLittleDevilEyes: false, answeredExchangeWhisper: false };
    expect(availableChoices(story, state).map(choice => choice.id)).toContain('ch6-04-station');
    expect(resolveInput(story, state, '车站见过')).toEqual({ kind: 'matched', choiceId: 'ch6-04-station' });
    state.flags = { sawLittleDevilAtStation: false, noticedLittleDevilEyes: false, answeredExchangeWhisper: false };
    expect(resolveInput(story, state, '车站见过').kind).toBe('unmatched');

    state.currentNodeId = 'CH6-05';
    state.flags = { readParentsLetter: false, askedPriorityParents: true };
    expect(resolveInput(story, state, '追问父母档案')).toEqual({ kind: 'matched', choiceId: expect.any(String) });
    state.flags = { readParentsLetter: false, askedPriorityParents: false };
    expect(resolveInput(story, state, '追问父母档案').kind).toBe('unmatched');

    state.currentNodeId = 'CH8-05';
    state.flags = { dreamFocusName: false };
    expect(resolveInput(story, state, '叫他康斯坦丁').kind).toBe('unmatched');
    state.flags = { dreamFocusName: true };
    expect(resolveInput(story, state, '叫他康斯坦丁')).toEqual({ kind: 'matched', choiceId: 'ch8-05-name' });

    state.currentNodeId = 'CH9-06';
    state.flags = { preservedOldTangTrust: false, preservedOldTangInvasionRecord: false, preservedOldTangHumanMessage: false };
    expect(resolveInput(story, state, '申请非致命协议').kind).toBe('unmatched');
    state.flags = { preservedOldTangTrust: false, preservedOldTangInvasionRecord: true, preservedOldTangHumanMessage: false };
    expect(resolveInput(story, state, '申请非致命协议')).toEqual({ kind: 'matched', choiceId: expect.stringContaining('ch9-06-nonlethal') });
  });

  it('从各章入口遍历所有合法选择可达阶段终点并保留四个检查点', () => {
    const conditionKeys = [...new Set(Object.values(story.nodes).flatMap(node => [
      ...(node.autoNextRules ?? []).flatMap(rule => rule.conditions),
      ...node.choices.flatMap(choice => [...(choice.conditions ?? []), ...(choice.nextNodeRules ?? []).flatMap(rule => rule.conditions)]),
    ]).map(condition => condition.key))];
    const queue = [{ state: startGame(story), choices: [] as string[] }];
    const visited = new Set<string>();
    let completed = 0;
    while (queue.length) {
      const item = queue.shift()!;
      const key = `${item.state.currentNodeId}:${conditionKeys.map(flag => Number(item.state.flags[flag] === true)).join('')}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (item.state.status === 'stageEnd') {
        completed++;
        expect(item.state.currentNodeId).toBe('CH9-08');
        expect(item.state.checkpoints.map(checkpoint => checkpoint.id)).toEqual(['CP-CH6-END', 'CP-CH7-END', 'CP-CH8-END', 'CP-CH9-END']);
        continue;
      }
      const options = availableChoices(story, item.state);
      expect(options.length, item.state.currentNodeId).toBeGreaterThan(0);
      for (const option of options) queue.push({
        state: choose(story, item.state, item.state.currentNodeId, option.id),
        choices: [...item.choices, `${item.state.currentNodeId}/${option.id}`],
      });
    }
    expect(visited.size).toBeGreaterThan(60);
    expect(completed).toBeGreaterThan(0);
  });

  it('四个检查点可回退且不会把后续章节内容重复写入', () => {
    let state = startGame(story);
    for (const [nodeId, choiceId] of [
      ['CH6-01', 'ch6-01-memorize'], ['CH6-03', 'ch6-03-memory'], ['CH6-04', 'ch6-04-draw'],
      ['CH6-05', 'ch6-05-ninth'], ['CH6-07', 'ch6-07-rescue'], ['CH6-09', 'ch6-09-names'],
      ['CH7-02', 'ch7-02-lionheart'], ['CH7-04', 'ch7-04-accept'], ['CH7-06', 'ch7-06-go'], ['CH7-07', 'ch7-07-wish'],
      ['CH8-01', 'ch8-01-trust'], ['CH8-03', 'ch8-03-obey'], ['CH8-05', 'ch8-05-ask'], ['CH8-07', 'ch8-07-offset'], ['CH8-10', 'ch8-10-brother'],
      ['CH9-02', 'ch9-02-message'], ['CH9-04', 'ch9-04-prepare'], ['CH9-05', 'ch9-05-backup'], ['CH9-06', 'ch9-06-nonlethal'], ['CH9-07', 'ch9-07-restraint'],
    ] as const) state = choose(story, state, nodeId, choiceId);
    expect(state.status).toBe('stageEnd');
    const before = state.history.length;
    const restored = restoreCheckpoint(story, state, 'CP-CH8-END');
    expect(restored.currentNodeId).toBe('CH9-02');
    expect(restored.history.length).toBeLessThan(before);
    expect(restored.checkpoints.map(checkpoint => checkpoint.id)).toEqual(['CP-CH6-END', 'CP-CH7-END', 'CP-CH8-END']);
  });
});
