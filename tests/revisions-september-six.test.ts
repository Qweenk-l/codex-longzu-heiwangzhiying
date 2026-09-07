import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import rawStory from '../src/content/stage-one.json';
import type { Story } from '../src/engine/types';
import { startGame } from '../src/engine/engine';

const story = rawStory as Story;
const baseline = JSON.parse(readFileSync(new URL('../content-source/baseline-v0.7C.json', import.meta.url), 'utf8'));
type BaselineChoice = { id: string };
type BaselineNode = { id: string; choices: BaselineChoice[] };
const baselineNodes = baseline.nodes as BaselineNode[];
const auditRoot = '../../01-剧情文档/03-审阅与原始批注/2026-09-06-修订审阅版/';
const auditFiles = {
  v04B: new URL(`${auditRoot}龙族试玩前三章剧情设计稿-v0.4B-2026-09-06修订审阅版.md`, import.meta.url),
  v05D: new URL(`${auditRoot}龙族试玩第三至第五章剧情与玩法设计稿-v0.5D-衔接修订标注版-2026-09-06修订审阅版.md`, import.meta.url),
  v07C: new URL(`${auditRoot}龙族试玩第一季第六至第九章剧情与玩法设计稿-v0.7C-修订标注版-2026-09-06修订审阅版.md`, import.meta.url),
};

const text = (id: string) => {
  const node = story.nodes[id];
  return node ? [node.content, ...node.choices.flatMap(choice => [choice.label, choice.feedback ?? ''])].join('\n') : '';
};
const sessionAt = (entryNodeId: string, effects: { key: string; value: boolean }[]) => {
  const local = structuredClone(story);
  local.entryNodeId = entryNodeId;
  local.nodes[entryNodeId].entryEffects = [
    ...(local.nodes[entryNodeId].entryEffects ?? []),
    ...effects.map(effect => ({ type: 'flag' as const, ...effect })),
  ];
  return startGame(local);
};
const storyHistory = (entryNodeId: string, effects: { key: string; value: boolean }[]) =>
  sessionAt(entryNodeId, effects).history.filter(item => item.kind === 'story');
const historyNodes = (entryNodeId: string, effects: { key: string; value: boolean }[]) =>
  storyHistory(entryNodeId, effects).map(item => item.nodeId);

describe('2026-09-06 前九章修订接入', () => {
  it('三份 content-source 与获批 9 月 6 日 Markdown 副本逐字节一致', () => {
    const pairs = [
      ['../content-source/v0.4B.md', auditFiles.v04B],
      ['../content-source/v0.5D.md', auditFiles.v05D],
      ['../content-source/v0.7C-ch6-ch9.md', auditFiles.v07C],
    ] as const;
    for (const [snapshotPath, auditPath] of pairs) {
      expect(readFileSync(new URL(snapshotPath, import.meta.url)).equals(readFileSync(auditPath)), snapshotPath).toBe(true);
    }
  });

  it('36 项修订逐项进入玩家正文或条件回响', () => {
    const revisions: Array<[string, string, string]> = [
      ['R04-01', 'CH1-03-CHEN', '你向陈雯雯道谢，收起手机。回到家，你把信和 N96 放到叔叔面前'],
      ['R04-02', 'CH1-03-SU', '你回了个“收到”，把手机收进包里。回家后，你把信和 N96 摆到叔叔面前'],
      ['R04-03', 'CH1-04', '邀请信写的是你的名字，客厅里最像旁听生的人却也是你。'],
      ['R04-04', 'CH1-09', '你攥着裤缝，把练过的英文自我介绍从头想了一遍'],
      ['R04-05', 'CH1-12', '陈雯雯笑了一下，低头把材料装回袋里。你也跟着笑'],
      ['R04-06', 'CH1-12', '你盯着楼层数字往下跳，已经开始想回家后该怎么解释这九十秒。'],
      ['R04-07', 'CH2-03', '你读到最后，又把最后几行看了一遍。纸角被手指捏出一道新折痕'],
      ['R04-08', 'CH2-03-HIDDEN-INTEREST', '你把信塞进口袋，又隔着衣料按了一下。收到邀请那天，你也这样摸过那部手机'],
      ['R04-09', 'CH2-06-ECHO-CHEN', '你想起她在消息里说“至少说明他们愿意见你”。'],
      ['R04-10', 'CH2-08-DIGNITY-KNOWN', '掌声还是响了。你站在灯照不到的地方，手里空着'],
      ['R04-11', 'CH2-10', '忙着找你、借衣服，还得赶在散场前到。油表没来得及排上号。'],
      ['R04-12', 'CH2-12', '几个小时前，你还在那间放映厅里，找不到一句合适的话'],
      ['R05-01', 'CH3-03', '他先盯上你手里的三明治，再看向你的车票'],
      ['R05-02', 'CH3-06', '刚刚吃掉半个三明治，忽然得知那半个三明治价值三万六千美元。'],
      ['R05-03', 'CH4-04-PARENTS', '他搓了搓手，低头看了一眼文件夹。你等着，连芬格尔也没有插话。'],
      ['R05-04', 'CH4-07-RESULT', '富山已经从窗台的固定架上取下鳞片，举到灯光下。'],
      ['R05-05', 'CH5-06', '你张了张嘴，想叫她再骂你一句，叫你别发呆、别碍事，什么都行。'],
      ['R05-06', 'CH5-07-RESULT', '她怎么能就这么躺着？你想爬过去，膝盖却使不上力。'],
      ['R05-07', 'CH5-08', '准星晃了一下，又停住。高中军训时靶心在准星中央的样子忽然清楚起来'],
      ['R05-08', 'CH5-09', '你明明不想向他们开枪，准星却在两人之间缓慢移动'],
      ['R05-09', 'CH5-11', '你想笑，嘴角动了一下，胸口却堵得厉害：“这种事……就不能提前告诉我吗？”'],
      ['R07A-01', 'CH6-06', '低得几乎被电流吞掉。你盯着那两个名字，想起丽晶酒店里叶胜推开门'],
      ['R07A-02', 'CH6-09', '自由一日以后，古德里安从地上坐了起来，校医说诺诺胸前的红色只是炼金药剂。'],
      ['R07A-03', 'CH7-02', '你把安珀馆请柬翻到背面，公开晚宴的时间印在那里。'],
      ['R07A-04', 'CH7-04-RESULT', '她朝舞池看了一眼，随后抬杯喝酒。你还没来得及看清'],
      ['R07A-05', 'CH7-07', '她说完便仰起脸，下一簇烟花正好升起来。'],
      ['R07A-06', 'CH8-10', '这段影像留下的是弟弟为什么替他挡枪，手机里留下的是老唐平时怎么过日子。'],
      ['R07A-07', 'CH8-10-RESULT', '写到“申请人”时，笔尖在自己的名字上停了一下。'],
      ['R07A-08', 'CH9-01', '今天喝进去的水，能算游泳馆请客吗？'],
      ['R07A-09', 'CH9-01', '下一次面罩进水，你还是呛了一口，手却已经先摸到了阀门。'],
      ['R07A-10', 'CH9-02', '我们只有一份恢复数据。以后真要叫他认出你，原话总比咱们替他编一句管用；时间戳还能说明，他是在进学院以前写的。'],
      ['R07A-11', 'CH9-06', '我知道你想把他带回来。可船上还有别人。'],
      ['R07A-12', 'CH9-06', '你们一起经历过什么，他留下过什么，得有不同的事情互相印证。'],
      ['R07A-13', 'CH9-06-CHECK', '仅确认身份，现有歼灭规则不变。'],
      ['R07A-14', 'CH9-07', '两份载荷单推到你面前，自己握着确认笔：“说你的选择。装哪一份，由我签字负责。”'],
      ['R07A-15', 'CH9-07-WEAPONS', '容纳位置还空着。之后若找不到能替代它的办法'],
    ];
    expect(revisions).toHaveLength(36);
    for (const [revision, nodeId, expected] of revisions) expect(text(nodeId), revision).toContain(expected);
    expect(text('CH2-06-ECHO-SU')).toContain('小天女这次连一句挑剔都没有。');
  });

  it('R04-08/R04-09 条件正文按已有旗标顺序显示，条件为假时不泄露', () => {
    const hiddenTrueHistory = storyHistory('CH2-03', [{ key: 'hidInterestFromFamily', value: true }]);
    const hiddenFalseHistory = storyHistory('CH2-03', []);
    const hiddenTrue = hiddenTrueHistory.map(item => item.nodeId);
    const hiddenFalse = hiddenFalseHistory.map(item => item.nodeId);
    expect(hiddenTrue).toContain('CH2-03-HIDDEN-INTEREST');
    expect(hiddenFalse).not.toContain('CH2-03-HIDDEN-INTEREST');
    expect(hiddenTrueHistory.findIndex(item => item.nodeId === 'CH2-03-HIDDEN-INTEREST'))
      .toBeLessThan(hiddenTrueHistory.findIndex(item => item.nodeId === 'CH2-03-CORRIDOR'));
    expect(hiddenTrueHistory.find(item => item.nodeId === 'CH2-03-HIDDEN-INTEREST')?.text)
      .toContain('你把信塞进口袋，又隔着衣料按了一下。');

    const bothHistory = storyHistory('CH2-05', [
      { key: 'askedChen', value: true },
      { key: 'askedSu', value: true },
    ]);
    const both = bothHistory.map(item => item.nodeId);
    const chenOnly = historyNodes('CH2-05', [{ key: 'askedChen', value: true }]);
    const suOnly = historyNodes('CH2-05', [{ key: 'askedSu', value: true }]);
    const neither = historyNodes('CH2-05', []);
    expect(both.indexOf('CH2-06-INTRO')).toBeLessThan(both.indexOf('CH2-06-ECHO-CHEN'));
    expect(both.indexOf('CH2-06-ECHO-CHEN')).toBeLessThan(both.indexOf('CH2-06-ECHO-SU'));
    const introTextIndex = bothHistory.findIndex(item => item.text.includes('文学社包下的小放映厅比平时亮。'));
    const chenTextIndex = bothHistory.findIndex(item => item.text.includes('你想起她在消息里说'));
    const suTextIndex = bothHistory.findIndex(item => item.text.includes('小天女这次连一句挑剔都没有。'));
    expect(introTextIndex).toBeGreaterThanOrEqual(0);
    expect(introTextIndex).toBeLessThan(chenTextIndex);
    expect(chenTextIndex).toBeLessThan(suTextIndex);
    expect(sessionAt('CH2-05', [
      { key: 'askedChen', value: true },
      { key: 'askedSu', value: true },
    ]).currentNodeId).toBe('CH2-06');
    expect(chenOnly).toContain('CH2-06-ECHO-CHEN');
    expect(chenOnly).not.toContain('CH2-06-ECHO-SU');
    expect(suOnly).not.toContain('CH2-06-ECHO-CHEN');
    expect(suOnly).toContain('CH2-06-ECHO-SU');
    expect(neither).not.toContain('CH2-06-ECHO-CHEN');
    expect(neither).not.toContain('CH2-06-ECHO-SU');
  });

  it('保留基线中的既有选择 ID，R04-09 最终选择仍在 CH2-06', () => {
    expect(story.nodes['CH2-06'].choices.map(choice => choice.id)).toEqual(
      baselineNodes.find(node => node.id === 'CH2-06')?.choices.map(choice => choice.id),
    );
    for (const id of ['CH1-03-CHEN', 'CH3-03', 'CH5-09', 'CH7-02', 'CH8-10', 'CH9-07']) {
      const old = baselineNodes.find(node => node.id === id);
      const current = story.nodes[id];
      for (const choice of old?.choices ?? []) expect(current?.choices.map(item => item.id), id).toContain(choice.id);
    }
  });

  it('玩家可见输出不含审阅标记、条件说明或后台处理文字', () => {
    const output = JSON.stringify(story);
    expect(output).not.toMatch(/2026-09-06|R04-|R05-|R07A-|红字修订|~~|<!--|显示条件|系统处理|后台条件/);
  });
});
