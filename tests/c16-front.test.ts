import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Story } from '../src/engine/types';
import { availableChoices, choose, startGame } from '../src/engine/engine';

// @ts-expect-error runtime-only revision module has no declaration file
const { applyC16Front } = await import('../scripts/revise-c16-front.mjs');
const source = JSON.parse(readFileSync(new URL('../content-source/legacy-season-one.20260906.1.json', import.meta.url), 'utf8')) as Story;
const sourceNodes = structuredClone(source.nodes);
const nodes = structuredClone(source.nodes);
applyC16Front(nodes);
const story: Story = { ...source, nodes };

const choice = (nodeId: string, choiceId: string) => story.nodes[nodeId].choices.find(item => item.id === choiceId)!;
const effectKeys = (nodeId: string, choiceId: string) => choice(nodeId, choiceId).effects.map(effect => effect.key);
const storyText = (state: ReturnType<typeof startGame>) => state.history.map(entry => entry.text).join('\n');
const startAt = (entryNodeId: string, flags: Record<string, boolean> = {}) => {
  const local = structuredClone(story);
  local.entryNodeId = entryNodeId;
  const state = startGame(local);
  state.flags = { ...state.flags, ...flags };
  return { local, state };
};

describe('C16 前九章运行副本修订', () => {
  it('修正 CH1 承接、保留选择 ID 与旗标，并让沉默路线对应沉默动作', () => {
    const avoidance = choice('CH1-01', 'avoidance');
    expect(avoidance.label).toBe('“再开一盘。反正拒信不会长腿跑掉。”');
    expect(avoidance.feedback).toContain('婶婶');
    expect(avoidance.feedback).toContain('出门');

    const indirect = choice('CH1-01', 'indirect-probe');
    expect(indirect.feedback).toContain('老唐');
    expect(indirect.feedback).toContain('不在招生办上班');
    expect(indirect.feedback).toContain('真有问题回来再说。\n\n婶婶');
    expect(indirect.feedback).toContain('出门');
    expect(indirect.nextNodeId).toBe(sourceNodes['CH1-01'].choices.find(item => item.id === indirect.id)?.nextNodeId);
    expect(indirect.effects).toEqual(sourceNodes['CH1-01'].choices.find(item => item.id === indirect.id)?.effects);

    const silent = story.nodes['CH2-08-DIGNITY-SILENT'].content;
    expect(silent).not.toContain('刚才那句拒绝只花了一口气');
    expect(silent).toContain('你没有说话，走到门口时');
  });

  it('合并 CH6 递笔动作，清理 CH8 编辑说明，并修正同类前九章行文', () => {
    const ch6 = story.nodes['CH6-01'].content;
    expect(ch6.match(/笔塞/g)).toHaveLength(1);
    expect(ch6).not.toContain('芬格尔把笔塞进你手里');

    const ch8 = story.nodes['CH8-03-RESULT'].content;
    expect(ch8).not.toContain('不进入后续泳池段落');
    expect(ch8).toContain('诺诺留在外侧与恺撒的防线汇合。');
    expect(ch8).toContain('你、老唐和芬格尔沿服务梯抵达室内泳池。');

    expect(story.nodes['CH1-10'].content).toContain('门外有人拖动行李箱');
    expect(story.nodes['CH1-10'].content).not.toContain('窗外有人拖动行李箱');
    expect(story.nodes['CH2-03-HIDDEN-INTEREST'].content).toContain('收到邀请那天，你也这样摸过那部手机');
    expect(story.nodes['CH3-04-RESULT'].content).toContain('男孩没有解释交换的内容');
    expect(story.nodes['CH3-04-RESULT'].content).not.toContain('无论你如何回应');
    expect(story.nodes['CH5-13'].content).toContain('校规上白纸黑字。你要真拿它去追人，挨揍的时候可别报我的名字。');
    expect(story.nodes['CH5-13'].content).not.toContain('不能假装它原本写成“双方先同意”');
    expect(story.nodes['CH5-13-RELATION'].content).toContain('赢了比赛就够了，别把人家的感情也算进奖品');
    expect(story.nodes['CH5-13-RELATION'].content).not.toContain('今天的枪声不会自动把任何人的感情改写');
  });

  it('CH7-08 按 askedOldTang 分流，未求助路线不补写面试建议且不改变既有 owner ID', () => {
    for (const [nodeId, original] of Object.entries(sourceNodes)) {
      if (original.chapter > 9) continue;
      expect(story.nodes[nodeId].choices.map(item => item.id), nodeId)
        .toEqual(original.choices.map(item => item.id));
    }

    const unasked = startAt('CH7-08').state;
    expect(unasked.history.some(entry => entry.nodeId === 'CH7-08-NO-OLDTANG')).toBe(true);
    expect(storyText(unasked).split('隔着太平洋在星际地图上互相拆家')).toHaveLength(2);
    expect(storyText(unasked).split(sourceNodes['CH7-08'].content.split('\n\n')[0])).toHaveLength(2);
    expect(storyText(unasked)).not.toContain('面试前他教你怎样在听不懂英语时保持微笑');

    const askedStory = structuredClone(story);
    askedStory.entryNodeId = 'CH7-08';
    askedStory.nodes['CH7-08'].entryEffects = [
      ...(askedStory.nodes['CH7-08'].entryEffects ?? []),
      { type: 'flag', key: 'askedOldTang', value: true },
    ];
    const asked = startGame(askedStory);
    expect(asked.history.some(entry => entry.nodeId === 'CH7-08-ASKED-OLDTANG')).toBe(true);
    expect(storyText(asked)).toContain('面试前他教你怎样在听不懂英语时保持微笑');
  });

  it('CH9 正式提交明确申请护兄影像，非致命变体沿既有证据门槛写入后续信任', () => {
    const share = choice('CH9-02', 'ch9-02-share');
    expect(share.label).toContain('申请调阅护兄影像');
    expect(story.nodes['CH9-02-SHARE'].content).toContain('要求调阅康斯坦丁护住哥哥的原始影像');
    expect(story.nodes['CH9-02-SHARE'].content).toContain('经核验的副本纳入本次任务资料');
    expect(story.nodes['CH9-02-SHARE'].entryEffects).toContainEqual({ type: 'flag', key: 'preservedBrotherEvidence', value: true });

    const shareRun = startAt('CH9-02').state;
    const shared = choose(story, shareRun, 'CH9-02', 'ch9-02-share');
    expect(shared.flags.preservedBrotherEvidence).toBe(true);

    const nonlethal = story.nodes['CH9-06'].choices.filter(item => item.id.startsWith('ch9-06-nonlethal'));
    expect(nonlethal).toHaveLength(3);
    for (const item of nonlethal) expect(item.effects).toContainEqual({ type: 'flag', key: 'preservedOldTangTrust', value: true });
    expect(story.nodes['CH9-06-NONLETHAL'].content).toContain('你：警戒不能撤');
    expect(story.nodes['CH9-06-NONLETHAL'].content).toContain('前提是其他人能撤出去');
    expect(story.nodes['CH9-06-NONLETHAL'].content).not.toContain('这是后续行动证明信任');

    const noEvidence = startAt('CH9-06').state;
    expect(availableChoices(story, noEvidence).filter(item => item.id.startsWith('ch9-06-nonlethal'))).toHaveLength(0);
    const oneEvidence = startAt('CH9-06', { preservedOldTangHumanMessage: true }).state;
    const selected = availableChoices(story, oneEvidence).find(item => item.id.startsWith('ch9-06-nonlethal'))!;
    const rescued = choose(story, oneEvidence, 'CH9-06', selected.id);
    expect(rescued.flags.requestedNonlethalDragonProtocol).toBe(true);
    expect(rescued.flags.preservedOldTangTrust).toBe(true);
  });

  it('补充任务部署职责，同时保持 CH8-10 与第十章以后节点不变', () => {
    expect(story.nodes['CH9-03'].content).toContain('楚子航：船侧近距掩护');
    expect(story.nodes['CH9-03'].content).toContain('恺撒：战斗组火力与紧急撤离指挥');
    expect(story.nodes['CH9-03'].content).toContain('零：岸上监控、替补与机动支援');
    expect(story.nodes['CH9-06'].content).toContain('那我要拿什么说服他们？');
    expect(story.nodes['CH9-06'].content).not.toContain('你：那认什么？');

    expect(story.nodes['CH8-10']).toEqual(sourceNodes['CH8-10']);
    for (const [nodeId, original] of Object.entries(sourceNodes)) {
      if (original.chapter <= 9) continue;
      expect(story.nodes[nodeId], nodeId).toEqual(original);
    }
    expect(effectKeys('CH9-02', 'ch9-02-share')).toContain('sharedOldTangDataWithExecutionBureau');
  });
});
