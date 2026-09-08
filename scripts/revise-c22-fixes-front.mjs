function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected one C22-FIX match for ${label}, found ${count}`);
  return text.replace(from, to);
}

function replaceKeywordOnce(keywords, from, to, label) {
  const count = keywords.filter(keyword => keyword === from).length;
  if (count !== 1) throw new Error(`Expected one C22-FIX keyword match for ${label}, found ${count}`);
  return keywords.map(keyword => keyword === from ? to : keyword);
}

function nodeAt(nodes, id) {
  const node = nodes[id];
  if (!node) throw new Error(`Missing C22-FIX node: ${id}`);
  if (node.chapter > 9) throw new Error(`C22-FIX front revision escaped chapter nine: ${id}`);
  return node;
}

function choiceAt(nodes, nodeId, choiceId) {
  const choice = nodeAt(nodes, nodeId).choices.find(item => item.id === choiceId);
  if (!choice) throw new Error(`Missing C22-FIX choice: ${nodeId}/${choiceId}`);
  return choice;
}

// Approved C22-FIX runtime copy corrections for the prologue through Chapter 9.
// Reviewed manuscripts and content-source snapshots remain unchanged.
export function applyC22FixesFront(nodes) {
  for (const nodeId of ['CH8-03', 'CH8-03-DISARMED']) {
    const report = choiceAt(nodes, nodeId, 'ch8-03-report');
    report.label = replaceOnce(report.label,
      '先把康斯坦丁方位报给校园防线',
      '先把燃烧少年的方位报给校园防线',
      `${nodeId} ch8-03-report label`);
  }

  nodeAt(nodes, 'CH8-04').content = replaceOnce(nodeAt(nodes, 'CH8-04').content,
    '只要撑过搜索窗口，康斯坦丁可能失去方向。',
    '只要撑过搜索窗口，那个燃烧的少年可能失去方向。',
    'CH8-04 recognition boundary');

  const trainQuestion = choiceAt(nodes, 'CH3-03', 'ch3-03-ask');
  trainQuestion.label = replaceOnce(trainQuestion.label,
    '先问清楚他为什么等了两天',
    '先问清楚，这趟列车以前也这样不定时发车吗？',
    'CH3-03 ch3-03-ask label');
  trainQuestion.keywords = replaceKeywordOnce(trainQuestion.keywords,
    '等了两天',
    '列车不定时',
    'CH3-03 ch3-03-ask keywords');

  nodeAt(nodes, 'CH3-03').content = replaceOnce(nodeAt(nodes, 'CH3-03').content,
    '你低头看了看手里的午饭。刚才它还只是个三明治，',
    '你低头看了看手里的三明治。刚才它还只是用来填饱肚子的，',
    'CH3-03 sandwich wording');

  nodeAt(nodes, 'CH6-01').content = replaceOnce(nodeAt(nodes, 'CH6-01').content,
    '他们低估了一个留级八年的人对教育事业的感情。你怀疑这仍然是一门生意',
    '他们低估了一个读了八年的人对教育事业的感情。\n\n你怀疑这仍然是一门生意',
    'CH6-01 education paragraph');
  nodeAt(nodes, 'CH6-05').content = replaceOnce(nodeAt(nodes, 'CH6-05').content,
    '那张陌生图形躺在纸上，墨迹已经干了。',
    '那张陌生图形躺在纸上，铅笔的线条清晰可辨。',
    'CH6-05 drawing medium');
  nodeAt(nodes, 'CH9-06').content = replaceOnce(nodeAt(nodes, 'CH9-06').content,
    '诺诺：认你有什么证据证明他还在，分离以后拿什么关住龙王，失败时谁承担后果。',
    '诺诺：你得拿出证据，证明他还在。分离以后拿什么关住龙王，失败时谁承担后果，也都得说清楚。',
    'CH9-06 evidence requirements');
  nodeAt(nodes, 'CH7-07').content = replaceOnce(nodeAt(nodes, 'CH7-07').content,
    '穿着袜子踩过湿草',
    '赤脚踩过湿草',
    'CH7-07 barefoot wording');

  return nodes;
}
