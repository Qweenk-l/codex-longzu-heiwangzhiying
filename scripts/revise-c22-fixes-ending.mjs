function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected one C22-FIX match for ${label}, found ${count}`);
  return text.replace(from, to);
}

// Approved F02/F03/F05 runtime copy corrections; source manuscripts stay intact.
export function applyC22FixesEnding(nodes) {
  const replaceContent = (id, from, to) => {
    nodes[id].content = replaceOnce(nodes[id].content, from, to, id);
  };

  replaceContent('CH11-02',
    '那张脸上有你见过的恐惧：在冰窖里不合时宜地后退，在游戏输了以后假装网络延迟，在你问他有没有想过回家时突然沉默。下一刻，黄金瞳把这些表情压进更深处，龙王的声音从江面上升起。',
    '你认得那张脸上的恐惧。布加迪后座上，他握枪的手一直在抖；到了泳池，嘴上还在开玩笑，手指却始终抓着你的袖口。下一刻，黄金瞳亮起，熟悉的神情被压进更深处，龙王的声音从江面上升起。');
  const oldTang = nodes['CH11-05-CHOICE'].choices.find(c => c.id === 'ch11-05-oldtang');
  oldTang.label = replaceOnce(oldTang.label, '问岸上的老唐还能不能听见', '问老唐还能不能听见你', 'CH11-05 question');
  oldTang.keywords = oldTang.keywords.map(word => word === '问岸上老唐' ? '老唐还能听见吗' : word);

  replaceContent('CH10-06-CONDITION-1-TEXT-1',
    '你把这段内部回响存到康斯坦丁护住哥哥的影像旁边。两个文件没有互相解释，却在时间轴上第一次靠近；你听见“哥哥”时，脑中闪过的不是怪物，而是那双挡在火焰前的翅膀。',
    '你听见“哥哥”时，想起那段护兄影像里替老唐挡住枪火的翅膀。回声仍在继续，你的手指停在录音键旁。');
  replaceContent('CH10-06-CONDITION-1-TEXT-2',
    '你只记录了陌生的回声和房间方位。录音里没有人名，',
    '你听见的回声里没有人名，');
  const record = nodes['CH10-06-CHOICE'].choices.find(c => c.id === 'ch10-06-record');
  record.label = replaceOnce(record.label, '要求船上保留原始频段，并继续寻找出口', '开启备用记录器，继续寻找出口', 'CH10-06 recording');
  record.keywords = ['保留频段', '开启备用录音', '带回船上', '继续找出口'];
  replaceContent('CH10-06-SAVE',
    '你关闭了自己的麦克风。',
    '你关掉通话麦克风，没有出声。随身记录器把那声呼唤单独存了下来。');
  replaceContent('CH10-06-RECORD',
    '备用记录器亮起红灯，开始保存未经降噪的声音。',
    '你启动随身的备用记录器，保存未经降噪的声音，准备返回船上后交给任务组复核。');

  replaceContent('CH12-03',
    '诺诺躺在担架上，示意你先按住匣盖。',
    '路鸣泽的声音在你耳边响起，只有你听得见。\n\n路鸣泽：那把松动的短刀，叫贪婪。\n\n诺诺躺在担架上，示意你先按住匣盖。');
  return nodes;
}
