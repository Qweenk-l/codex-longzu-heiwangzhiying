import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Story } from '../src/engine/types';
import { availableChoices, choose, resolveInput, restoreCheckpoint, startGame } from '../src/engine/engine';

const modulePath = '../scripts/build-chapters-three-five.mjs';
const { buildChaptersThreeFive } = await import(modulePath);
const baseline = JSON.parse(readFileSync(new URL('../content-source/baseline-v0.7C.json', import.meta.url), 'utf8'));
const story: Story = { id: 'three-five-test', contentVersion: 'test', entryNodeId: 'CH3-01', chapters: [], endings: {}, ...buildChaptersThreeFive(baseline) };

describe('第三至第五章内容', () => {
  it('保留34个主节点、全部短结果与共同结果，自动抵达第五章末', () => {
    expect(Object.keys(story.nodes)).toHaveLength(94);
    for (const node of Object.values(story.nodes)) {
      expect(node.content.trim(), node.id).not.toBe('');
      expect(node.content).not.toMatch(/系统处理|写入：|自动进入|共同后继|【红字修订】|~~|\*\*/);
      expect(node.choices.every(c => !/^继续$/.test(c.label))).toBe(true);
      if (!node.choices.length && node.id !== 'CH5-14') expect(story.nodes[node.autoNextNodeId!], node.id).toBeDefined();
      for (const choice of node.choices) expect(story.nodes[choice.nextNodeId]).toBeDefined();
    }
    expect(story.nodes['CH5-14'].stageEnd).toBe(true);
  });

  it('本地快照逐段正文、全部原选项和短结果均进入输出，删除线不进入', () => {
    const source = readFileSync(new URL('../content-source/v0.5D.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    let id = '', contentId = '', lines: string[] = [];
    let mainCount = 0, commonCount = 0;
    const flush = () => {
      if (!contentId) return;
      let expected = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (contentId === 'CH5-06') expected = expected.replace('她在电影院里把你从人群中拽出来，在长途飞行中替你收拾狼狈，刚才又让你趴下', '她曾在那场告白之后出现在你面前，刚才又让你趴下');
      if (contentId === 'CH5-09') expected = expected.replace('你明明不认识他们', '你明明不想向他们开枪');
      expect(story.nodes[contentId]?.content, contentId).toBe(expected);
      lines = []; contentId = '';
    };
    for (const line of source.split('\n')) {
      if (line.startsWith('#')) {
        flush();
        const main = line.match(/^## (CH[345]-[^｜]+)｜/);
        if (main) id = main[1];
        if (line === '### 玩家可见正文') { contentId = id; mainCount++; }
        const common = line.match(/^### 共同结果 `([^`]+)`/);
        if (common) { contentId = common[1]; commonCount++; }
      } else if (contentId && !/^\s*(?:\*\*|---|>.*(?:~~|【V0\.5D))/.test(line)) {
        lines.push(line.replace(/<!--[\s\S]*?-->/g, '').replace(/^>\s*【红字修订】/, ''));
      }
    }
    flush();
    expect(mainCount).toBe(34); expect(commonCount).toBe(6);
    const labels = new Set(Object.values(story.nodes).flatMap(n => n.choices.map(c => c.label)));
    const authoredLabels = [...source.matchAll(/^\d+\. \*\*(.+?)\*\*$/gm)];
    expect(authoredLabels).toHaveLength(57);
    for (const [, label] of authoredLabels) expect(labels.has(label), label).toBe(true);
    const results = [...source.matchAll(/- 短结果 `([^`]+)`：([^\n]+)/g)];
    expect(results).toHaveLength(54);
    for (const [, resultId, sentence] of results) {
      const expected = sentence.split('自动进入')[0].replace(/[；，。]$/, '') + (sentence.includes('自动进入') ? '。' : '');
      expect(story.nodes[resultId]?.content, resultId).toBe(sentence.includes('自动进入') ? expected : sentence);
    }
    expect(story.nodes['CH5-04'].content).toContain('你先认出那头暗红长发');
    expect(story.nodes['CH5-04'].content).not.toMatch(/跨洋旅途|从座位上拖走/);
    expect(story.nodes['CH5-06'].content).toContain('她曾在那场告白之后出现在你面前，刚才又让你趴下');
    expect(story.nodes['CH5-06'].content).not.toMatch(/长途飞行|电影院里把你/);
    expect(story.nodes['CH5-09'].content).toContain('你明明不想向他们开枪');
    expect(story.nodes['CH5-09'].content).not.toContain('你明明不认识他们');
  });

  it('信息揭晓与武器链都在固定事件节点写入，父母条件只有继承旗标', () => {
    const writers = (key: string) => Object.values(story.nodes).filter(n => n.entryEffects?.some(e => e.key === key)).map(n => n.id);
    const expected: Record<string, string> = {
      sawLittleDevilAtStation: 'CH3-04-RESULT', toyamaPpkIntroduced: 'CH4-07-RESULT',
      toyamaPpkDroppedInAlley: 'CH4-10', pickedUpToyamaPpk: 'CH5-07-RESULT', pickedUpSniperRifle: 'CH5-08',
      firedFirstShotAtBlackSniper: 'CH5-08', shotCaesar: 'CH5-10', shotChuZihang: 'CH5-10',
      completedThreeShots: 'CH5-10', learnedAboutFriggaRounds: 'CH5-11', learnedSniperWasSuQian: 'CH5-13',
      learnedNonoCaesarRelationship: 'CH5-13', learnedFreedomDayRewards: 'CH5-13', chapterFiveRewardPending3E: 'CH5-14',
    };
    for (const [key, id] of Object.entries(expected)) expect(writers(key), key).toEqual([id]);
    expect(writers('learnedSRank')).toEqual(['CH3-06-MOCK', 'CH3-06-ASK', 'CH3-06-BOARD']);
    expect(story.nodes['CH4-03'].choices.find(c => c.id === 'parents')?.conditions).toEqual([{ type: 'flag', key: 'readParentsLetter', value: true }]);
    for (const n of Object.values(story.nodes)) {
      const text = [n.content, ...n.choices.map(c => c.label)].join('\n');
      const number = Number(n.id.split('-')[1]);
      if (n.chapter < 5 || number < 11) expect(text).not.toMatch(/弗里嘉|假死|不会致死/);
      if (n.chapter === 5 && number < 13) expect(text).not.toMatch(/苏茜|芬格尔/);
      for (const effect of [...(n.entryEffects ?? []), ...n.choices.flatMap(c => c.effects)]) {
        expect(effect.type).toBe('flag'); expect(typeof effect.value).toBe('boolean');
        expect(effect.key).not.toBe('readParentsLetter');
      }
    }
  });

  it('附录两处条件措辞消费早先选择，条件版本保留相同结果及效果', () => {
    for (const [id, choiceId, key, phrase] of [
      ['CH4-03', 's-rank', 'questionedSRankBasis', '继续追问 S 级'],
      ['CH4-05', 'ask', 'noticedLittleDevilEyes', '认出同一双眼睛'],
    ]) {
      const base = story.nodes[id].choices.find(c => c.id === choiceId)!;
      const state = { ...startGame(story), currentNodeId: id, flags: { [key]: true } };
      const conditional = availableChoices(story, state).find(c => c.label.includes(phrase));
      expect(conditional, id).toBeDefined();
      expect(conditional?.nextNodeId).toBe(base.nextNodeId);
      expect(conditional?.effects).toEqual(base.effects);
      expect(availableChoices(story, state).some(c => c.id === base.id)).toBe(false);
      state.flags[key] = false;
      expect(availableChoices(story, state).some(c => c.id === base.id)).toBe(true);
      expect(availableChoices(story, state).some(c => c.label.includes(phrase))).toBe(false);
    }
  });

  it('真实引擎遍历全部节点与条件选择；各分支可达第五章检查点并回退', () => {
    const conditionKeys = [...new Set(Object.values(story.nodes).flatMap(n => n.choices.flatMap(c => c.conditions ?? [])).map(c => c.key))];
    const pending = [false, true].map(readParentsLetter => { const state = startGame(story); state.flags.readParentsLetter = readParentsLetter; return state; });
    const visited = new Set<string>(), nodes = new Set<string>(), choices = new Set<string>();
    while (pending.length) {
      const state = pending.pop()!;
      state.history.filter(h => h.kind === 'story').forEach(h => nodes.add(h.nodeId));
      const stateKey = `${state.currentNodeId}:${conditionKeys.map(k => Number(state.flags[k] === true)).join('')}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);
      if (state.status === 'stageEnd') {
        expect(state.currentNodeId).toBe('CH5-14');
        expect(state.checkpoints.map(cp => cp.id)).toEqual(['CP-CH3-END', 'CP-CH4-END', 'CP-CH5-END']);
        for (const group of [
          ['askedPriorityDragonEvidence', 'askedPriorityParents', 'askedPrioritySRank'],
          ['trustedNonoCommand', 'readNonoWarning', 'lookedBackAtNonoShooter'],
          ['focusedOnNonoAfterShooting', 'reachedForToyamaPpk', 'answeredExchangeWhisper'],
          ['shoutedForDuelToStop', 'triedToLowerSniperRifle', 'triedToUnderstandGunTrance'],
          ['reactedToProfessorsAlive', 'checkedNonoAfterReveal', 'maskedReliefWithSelfMockery'],
          ['rejectedRomanceRuleReward', 'askedAboutNonoCaesarAfterBattle', 'questionedRewardsBefore3E'],
        ]) expect(group.filter(k => state.flags[k])).toHaveLength(1);
        expect(restoreCheckpoint(story, state, 'CP-CH3-END').currentNodeId).toBe('CH4-01');
        const chapterFive = restoreCheckpoint(story, state, 'CP-CH4-END');
        expect(chapterFive.currentNodeId).toBe('CH5-01');
        expect(chapterFive.flags.learnedAboutFriggaRounds).not.toBe(true);
        expect(chapterFive.flags.pickedUpToyamaPpk).not.toBe(true);
        expect(restoreCheckpoint(story, state, 'CP-CH5-END').status).toBe('stageEnd');
        continue;
      }
      for (const option of availableChoices(story, state)) {
        choices.add(`${state.currentNodeId}/${option.id}`);
        pending.push(choose(story, state, state.currentNodeId, option.id));
      }
    }
    expect(nodes.size).toBe(94);
    expect(choices.size).toBe(Object.values(story.nodes).reduce((n, node) => n + node.choices.length, 0));
  });

  it('逐选择节点验证完整标签、关键词、自然短句、两意图及关闭条件', () => {
    for (const node of Object.values(story.nodes).filter(n => n.choices.length)) {
      for (const value of [false, true]) {
        const state = { ...startGame(story), currentNodeId: node.id, flags: { readParentsLetter: value, questionedSRankBasis: value, noticedLittleDevilEyes: value } };
        const options = availableChoices(story, state);
        for (const option of options) {
          expect(resolveInput(story, state, option.label), node.id + option.id).toEqual({ kind: 'matched', choiceId: option.id });
          for (const word of option.keywords) expect(resolveInput(story, state, word), node.id + word).toEqual({ kind: 'matched', choiceId: option.id });
          const keyword = option.keywords.find(k => !/不|没|别|勿|并非|放弃|拒绝/.test(k)) ?? option.keywords[0];
          expect(resolveInput(story, state, `我想${keyword}`), node.id + keyword).toEqual({ kind: 'matched', choiceId: option.id });
          expect(resolveInput(story, state, `我不想${keyword}`).kind, node.id + keyword).toBe('unmatched');
        }
        for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
          for (const first of options[i].keywords) for (const second of options[j].keywords) {
            expect(resolveInput(story, state, `${first}，同时${second}`).kind, `${node.id}/${first}/${second}`).toBe('ambiguous');
          }
        }
        for (const word of ['问', '找', '等', '谁', '跟', '自己', '现在', '知道', '告诉', '位置', '买一颗土星']) expect(resolveInput(story, state, word).kind, node.id + word).toBe('unmatched');
        if (node.id === 'CH4-03' && !value) for (const word of ['父母和学院', '父母档案', '他们的关系']) expect(resolveInput(story, state, word).kind).toBe('unmatched');
      }
    }
  });
});
