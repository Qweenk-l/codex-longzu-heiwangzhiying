const flag = (key, value = true) => ({ type: 'flag', key, value });

// C16 approved runtime corrections. The reviewed manuscripts remain unchanged.
export function applyC16Ending(nodes) {
  const replace = (id, from, to) => {
    if (!nodes[id].content.includes(from)) throw new Error(`Missing C16 text: ${id}`);
    nodes[id].content = nodes[id].content.replace(from, to);
  };
  replace('CH11-05-CONDITION-3-TEXT-1',
    '束缚组件短暂咬住一段青铜骨架，记录到一组共振频率后被高温熔毁。它证明分离思路不是幻想，却救不了眼前的诺诺。',
    '束缚组件短暂咬住一段青铜骨架，记录下一组共振频率。龙火熔坏了外层咬合齿，组件被迫脱开；固定在船侧的承载框架还在，却再也扣不住完整的龙躯。它留下了一次测量，救不了眼前的诺诺。');
  nodes['CH10-10-CONDITION-1-TEXT-1'].content = '你撑住舱门，把诺诺拉过门槛。她撞进你怀里，金属匣已经卡在舱内的固定带下。备用潜水钟按独立程序脱离城墙，带着你们一起上浮。舱内还有一组氧气可供轮换，城市的青铜门在你们脚下彻底闭合。';
  nodes['CH10-10-CONDITION-1-TEXT-2'].content = '恺撒手动维持接应窗口，潜水钟被迫在碎片流中停顿。你从舱内死死抓住诺诺的手腕，借绞盘回拉的瞬间把她拽过门槛。她和你一起摔在金属匣旁，舱门在碎片撞上来前合拢。';
  const review = nodes['CH12-05'].choices.find(c => c.id === 'ch12-05-lethal');
  review.label = '先核对致命火力与撤离底线，再决定是否尝试分离';
  review.keywords = ['核对致命火力', '确认撤离底线', '先看保底方案'];
  nodes['CH12-05-LETHAL'].content = '你先把致命火力和撤离路线逐项确认，要求接应组守住医疗舱一侧。\n\n诺诺：保底的办法不能撤。要不要试着把他带回来，你得看手里的证据和准备，再作决定。';
  nodes['CH12-05'].choices.find(c => c.id === 'ch12-05-restraint').label = '校准船侧承载框架，核对容纳位置';
  nodes['CH12-05'].choices.find(c => c.id === 'ch12-05-restraint-blueprint').label = '按青铜结构图校准容纳回路';
  replace('CH12-06-INTRO', '你握着贪婪的短刀，或者仍把手放在暴怒的剑柄上。', '金属匣就在你手边。');
  replace('CH12-08', '无论龙王死去、老唐在最后一秒回应，还是有一小点残火被封进隔离舱，这个空缺都没有改变。', '眼前的战斗已经结束，那块缺口却没有改变。');
  nodes['CH12-06-FEEDBACK-1'].content = '所有声音被压成一条通向诺顿核心的线。路鸣泽没有阻拦，只说：“你选择了一个不会向你追问的结果。”';
  nodes['CH12-06-FEEDBACK-2'].content = '你把老唐的名字再次送进火焰。龙王的攻击短暂停顿，你没有移开视线，等着那张脸上出现一点熟悉的神情。';
  const closed = nodes['CH12-03'].choices.find(c => c.id === 'ch12-03-close');
  closed.effects.push(flag('sevenSinsCaseClosed'));
  // Preserve choice owner/IDs; automatic preparation precedes each selected outcome.
  const prepare = (id, weapon) => {
    const owner = nodes[id];
    const tail = `${id}-AFTER-READY`;
    nodes[tail] = { ...structuredClone(owner), id: tail };
    owner.content = '';
    delete owner.autoNextRules;
    delete owner.entryEffects;
    const add = (suffix, content, effects) => {
      const key = `${id}-${suffix}`;
      nodes[key] = { id: key, chapter: 12, title: owner.title, content, choices: [], entryEffects: effects, autoNextNodeId: tail };
      return key;
    };
    if (weapon === 'greed') {
      const effects = [flag('greedAvailable'), flag('sevenSinsCaseClosed', false)];
      const reopen = add('REOPEN', '你重新打开金属匣，拔出那柄松动的短刀。纷乱的声音在耳边骤然收束，你强迫自己握稳刀柄。', effects);
      const held = add('DRAW', '你握住松动的刀柄，把短刀从匣中拔出。纷乱的声音在耳边骤然收束。', effects);
      const drawn = add('READY', '你握稳手里的贪婪，把刀锋转向火焰。', effects);
      owner.autoNextNodeId = held;
      owner.autoNextRules = [{ conditions: [flag('sevenSinsCaseClosed')], nextNodeId: reopen },
        { conditions: [flag('greedAvailable')], nextNodeId: drawn }];
    } else {
      const reopen = add('REOPEN', '你重新打开金属匣，把手放回暴怒的剑柄。', [flag('sevenSinsCaseClosed', false)]);
      const drawn = add('SET-ASIDE', '你把贪婪放回匣中，转而握住暴怒的剑柄。', [flag('greedAvailable', false)]);
      owner.autoNextNodeId = tail;
      owner.autoNextRules = [{ conditions: [flag('sevenSinsCaseClosed')], nextNodeId: reopen },
        { conditions: [flag('greedAvailable')], nextNodeId: drawn }];
    }
  };
  prepare('CH12-06-FEEDBACK-1', 'greed');
  prepare('CH12-06-FEEDBACK-2', 'greed');
  prepare('CH12-06-FEEDBACK-3', 'wrath');
  // The drawing choice already signals lethal intent; no second drawing is implied.
  nodes['CH12-06'].choices.find(c => c.id === 'ch12-06-lethal').label = '用贪婪锁定核心，先结束眼前攻击';
  const oxygen = nodes['CH13-01-CHOICE'].choices.find(c => c.id === 'ch13-01-boundary');
  oxygen.label = '提醒她以后救人时，也给自己留条退路';
  oxygen.keywords = ['给自己留退路', '以后先顾自己', '别再独自冒险'];
  nodes['CH13-01-BOUNDARY'].content = '你：以后再把别人推进潜水钟，记得给自己也留个位置。\n\n诺诺看了你一眼，手指在被单上轻轻敲了一下。\n\n诺诺：知道了。下回你也别在门口发呆。\n\n她说完靠回枕头，没有再把那一瞬说成轻而易举的事。';
  nodes['CH13-02-CHOICE'].choices.find(c => c.id === 'ch13-02-give').label = '把记录器交给诺诺保管';
  // A witnessed mural is not a possession of an earlier surveillance file.
  const comparison = nodes['CH10-05-BROTHER'];
  const withFootage = { ...structuredClone(comparison), id: 'CH10-05-BROTHER-FOOTAGE' };
  nodes[withFootage.id] = withFootage;
  comparison.content = '你记下两座王座的位置，旁边标注自己在学院亲眼看见康斯坦丁护住老唐的经过。两件事是否相关，还要等离水后复核。';
  nodes['CH10-05-CHOICE'].choices.find(c => c.nextNodeId === comparison.id).nextNodeRules = [
    { conditions: [flag('preservedBrotherEvidence')], nextNodeId: withFootage.id },
  ];
  const parents = nodes['CH13-06'];
  parents.content += '\n\n你又取出那封一直收着的父母来信。学院给了你新的身份，却还没有告诉你，他们现在在哪里。你在下一次会面的备忘里留下一行字：问古德里安，父母档案的申请还缺什么。\n\n写完以后，你没有把它划掉。';
}
