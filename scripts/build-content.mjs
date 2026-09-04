import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Only the checked-in snapshots are read; the original reference files stay untouched.
const source = readFileSync(new URL('../content-source/v0.4B.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const baseline = JSON.parse(readFileSync(new URL('../content-source/baseline-v0.7C.json', import.meta.url), 'utf8'));
const clean = text => text.replace(/\*\*/g, '').replace(/`/g, '').trim();
const sections = Object.fromEntries([...source.matchAll(/^## ((?:PRO|CH[12])-\S+?)｜([^\n]+)\n([\s\S]*?)(?=^## |^# |$(?![\s\S]))/gm)].map(m => [m[1], { title: m[2], body: m[3] }]));
const subsection = (body, heading) => {
  const marker = `### ${heading}`;
  const start = body.indexOf(marker);
  if (start < 0) throw new Error(`Missing source section: ${heading}`);
  return body.slice(body.indexOf('\n', start) + 1).split(/^### /m)[0].trim();
};
const prose = body => clean(subsection(body, '玩家可见正文'));
const variant = (body, id) => clean(subsection(body, id).split('\n').filter(line => !line.startsWith('- 显示条件')).join('\n'));
const flag = (key, value = true) => ({ type: 'flag', key, value });
const rule = (key, nextNodeId) => ({ conditions: [flag(key)], nextNodeId });

const enums = {
  dreamFocus: { name: 'dreamFocusName', silhouette: 'dreamFocusSilhouette', flame: 'dreamFocusFlame' },
  openingTone: { selfMock: 'openingToneSelfMock', avoidance: 'openingToneAvoidance', indirectProbe: 'openingToneIndirectProbe' },
  invitationRoute: { hiddenInterest: 'invitationHidden', verify: 'invitationVerify', directConfirm: 'invitationDirect' },
  verificationContact: { oldTang: 'verificationOldTang', chenWenwen: 'verificationChen', suXiaoqiang: 'verificationSu' },
  interviewCommitment: { explicit: 'interviewCommitmentExplicit', questioning: 'interviewCommitmentQuestioning', passive: 'interviewCommitmentPassive' },
  nonoFirstReaction: { probe: 'nonoReactionProbe', challenge: 'nonoReactionChallenge', guarded: 'nonoReactionGuarded' },
  interviewTone: { prepared: 'interviewTonePrepared', honest: 'interviewToneHonest', deflecting: 'interviewToneDeflecting' },
  alienAnswer: { canonLoneliness: 'alienAnswerLoneliness', skeptical: 'alienAnswerSkeptical', probing: 'alienAnswerProbing' },
  powerAnswer: { canonInstinct: 'powerAnswerInstinctive', cautiousHope: 'powerAnswerHopeful', probingAnomaly: 'powerAnswerProbing' },
  thirdAnswer: { canonUnknown: 'thirdAnswerAdmittedUnknown', questionedPurpose: 'thirdAnswerQuestionedPurpose' },
  admissionReaction: { disbelief: 'admissionReactionDisbelief', relief: 'admissionReactionRelief', cautious: 'admissionReactionCautious' },
  admissionQuestion: { whyMe: 'admissionQuestionWhyMe', decisionDeadline: 'admissionQuestionDecisionDeadline', practical: 'admissionQuestionPractical' },
  nonoRevealReaction: { guarded: 'nonoRevealGuarded', probing: 'nonoRevealProbing', acceptsHelp: 'nonoRevealAcceptsHelp' },
  literatureOutcome: { canon: 'literatureOutcomeCanon', dignity: 'literatureOutcomeDignity' },
  dignityStyle: { silentExit: 'dignityStyleSilentExit' },
  nonoRescueMode: { public: 'nonoRescuePublic', outside: 'nonoRescueOutside' },
  nonoRoadsideQuestion: { foreknowledge: 'nonoRoadsideForeknowledge', gratitude: 'nonoRoadsideGratitude', selfRescue: 'nonoRoadsideSelfRescue', cassellProbe: 'nonoRoadsideCassellProbe' },
  cassellMotive: { escapeOldLife: 'motiveEscapeOldLife', findParents: 'motiveFindParents', seekHiddenWorld: 'motiveSeekHiddenWorld', declinedForNow: 'motiveDeclinedForNow' },
};

// Distinct events preserve each authored numeric contribution without introducing a numeric engine.
const numericEvents = {
  'CH2-03:oldLifeAttachment': 'oldLifeAttachmentRaisedByParentsLetter',
  'CH2-08-CANON:oldLifeAttachment': 'oldLifeAttachmentLoweredByConfession',
  'CH2-08-DIGNITY:oldLifeAttachment': 'oldLifeAttachmentLoweredByConfession',
  'CH2-09-CANON:nonoTrust': 'nonoTrustRaisedByPublicRescue',
  'CH2-09-DIGNITY:nonoRespect': 'nonoRespectRaisedByOutsidePickup',
  'CH2-10:thank-nono:nonoTrust': 'nonoTrustRaised',
  'CH2-10:self-rescue:nonoRespect': 'nonoRespectRaisedBySelfRescue',
};
function effects(text, context) {
  return [...clean(text).matchAll(/([a-zA-Z]\w*)\s*(\+=|-=|=)\s*([a-zA-Z]\w*|\d+)/g)].flatMap(([, key, op, value]) => {
    if (op !== '=') {
      const event = numericEvents[`${context}:${key}`];
      if (!event) throw new Error(`Unmapped numeric event ${context}:${key}`);
      return [flag(event)];
    }
    if (value === 'true' || value === 'false') return [flag(key, value === 'true')];
    if (!enums[key]?.[value]) throw new Error(`Unmapped state ${key}=${value}`);
    return Object.values(enums[key]).map(candidate => flag(candidate, candidate === enums[key][value]));
  });
}

const choiceIds = {
  'CH1-01': ['self-mock', 'avoidance', 'indirect-probe'],
  'CH1-07-KNOWN': ['known-comfort-chen', 'known-ask-su', 'known-observe-pattern'],
  'CH1-07-UNKNOWN': ['unknown-comfort-chen', 'unknown-ask-su', 'unknown-observe-pattern'],
  'CH1-09': ['alien-loneliness', 'alien-skeptical', 'alien-probing'],
  'CH1-11': ['admit-unknown', 'question-purpose'],
  'CH2-10': ['ask-nono-foreknowledge', 'thank-nono', 'self-rescue', 'probe-cassell'],
};
const editorialFeedback = {
  '古德里安只回答“材料让我们认为你值得见面”，不泄露血统。': '古德里安只回答“材料让我们认为你值得见面”。',
  '陈雯雯点头道谢，不扩大感情表现。': '陈雯雯点头道谢。',
  '古德里安说学院认为你的潜力不能用普通成绩衡量，但不透露血统等级。': '古德里安说学院认为你的潜力不能用普通成绩衡量。',
};
function choices(body, old, id) {
  const block = subsection(body, body.includes('### 两个变体的共同选项') ? '两个变体的共同选项' : '可见选项');
  const blocks = [...block.matchAll(/^\d+\. \*\*(.+?)\*\*\n([\s\S]*?)(?=^\d+\. |^\*\*|$(?![\s\S]))/gm)];
  return blocks.map(([, label, meta], index) => {
    const choiceId = choiceIds[id]?.[index] ?? old.choices[index]?.id;
    if (!choiceId) throw new Error(`Missing choice id ${id}/${index}`);
    const field = name => clean(meta.match(new RegExp(`^   - ${name}：(.+)$`, 'm'))?.[1] ?? '');
    const effectText = field('写入');
    const next = field('后继').replace(/。$/, '') || old.choices.find(c => c.id === choiceId)?.nextNodeId || old.choices[0]?.nextNodeId;
    const item = { id: choiceId, label: clean(label), keywords: field('自由输入根?').split('、').map(clean).filter(Boolean), effects: effects(effectText, `${id}:${choiceId}`), nextNodeId: next };
    const condition = field('显示条件') || field('条件');
    if (condition) item.conditions = [...condition.matchAll(/(\w+) = (\w+)/g)].map(([, key, value]) => value === 'true' ? flag(key) : flag(enums[key]?.[value] ?? key, value !== 'false'));
    const feedback = field('回响');
    if (feedback) item.feedback = editorialFeedback[feedback] ?? feedback;
    const common = body.match(/^\*\*共同写入：\*\*\s*(.+)$/m)?.[1];
    if (common) item.effects.push(...effects(common, id));
    return item;
  });
}

const nodes = {};
for (const old of baseline.nodes.filter(n => /^(PRO|CH[12])-/.test(n.id))) {
  if (['PRO-02', 'CH1-06', 'CH1-07-KNOWN', 'CH1-07-UNKNOWN', 'CH2-08-DIGNITY'].includes(old.id)) continue;
  const section = sections[old.id];
  const node = { id: old.id, chapter: old.id.startsWith('PRO') ? 0 : Number(old.id[2]), title: section.title, content: prose(section.body), choices: [] };
  if (old.choices.length) node.choices = choices(section.body, old, old.id);
  if (old.autoNextNodeId) node.autoNextNodeId = old.autoNextNodeId;
  const writes = [...section.body.matchAll(/^- (?:写入|进入本节点时写入)：(.+)$/gm)].map(m => m[1]).join('、');
  node.entryEffects = effects(writes, old.id);
  nodes[node.id] = node;
}

const pro = sections['PRO-01'].body;
nodes['PRO-01'].content += '\n\n' + clean(subsection(pro, '系统处理').split('\n').filter(line => !line.startsWith('- ')).join('\n'));
nodes['PRO-01'].choices = choices(pro, baseline.nodes.find(n => n.id === 'PRO-02'), 'PRO-01');
nodes['PRO-01'].entryEffects = [flag('sawWhiteCityDream')];
delete nodes['PRO-01'].autoNextNodeId;

for (const id of ['CH1-06-OLDTANG', 'CH1-06-NO-OLDTANG']) {
  const body = sections['CH1-06'].body;
  nodes[id] = { id, chapter: 1, title: id.endsWith('NO-OLDTANG') ? '自己准备' : '有人替你准备', content: variant(body, id), choices: choices(body, baseline.nodes.find(n => n.id === 'CH1-06'), 'CH1-06') };
  for (const c of nodes[id].choices) {
    c.nextNodeId = 'CH1-07-UNKNOWN';
    c.nextNodeRules = [rule('askedChen', 'CH1-07-KNOWN'), rule('askedSu', 'CH1-07-KNOWN')];
  }
}
for (const c of nodes['CH1-05'].choices) {
  c.nextNodeId = 'CH1-06-NO-OLDTANG';
  c.nextNodeRules = [rule('askedOldTang', 'CH1-06-OLDTANG')];
}
for (const suffix of ['KNOWN', 'UNKNOWN']) {
  const id = `CH1-07-${suffix}`;
  const body = sections['CH1-07'].body;
  nodes[id] = { id, chapter: 1, title: '十七把椅子', content: variant(body, id) + '\n\n' + clean(subsection(body, '两个变体的共同正文')), choices: choices(body, baseline.nodes.find(n => n.id === id), id), entryEffects: [flag('recognizedRecruitmentBatch')] };
}
for (const c of nodes['CH1-11'].choices) {
  c.feedback += '\n\n' + clean(subsection(sections['CH1-11'].body, '共同回响').split(/^\*\*后继/m)[0]);
}

for (const suffix of ['KNOWN', 'UNCERTAIN', 'SILENT']) {
  const id = `CH2-08-DIGNITY-${suffix}`;
  const body = sections['CH2-08-DIGNITY'].body;
  const common = clean(subsection(body, '三个变体的共同正文')).replace('直到屏幕上的句子亮起，你才彻底看懂这场安排。', '屏幕上的句子亮起，那场安排也彻底摆到了所有人面前。');
  nodes[id] = { id, chapter: 2, title: '让句子缺一个字母', content: variant(body, id) + '\n\n' + common, choices: [], autoNextNodeId: 'CH2-09-DIGNITY', entryEffects: effects('publicHumiliation = false、protectedDignity = true、oldLifeAttachment -= 1', 'CH2-08-DIGNITY') };
}
nodes['CH2-08-CANON-KNOWN'] = { ...structuredClone(nodes['CH2-08-CANON']), id: 'CH2-08-CANON-KNOWN', content: nodes['CH2-08-CANON'].content.replace('你举着那个字母，直到手臂发酸才明白，所有人或许都知道安排，只有你和苏晓樯不知道。你不是故事里迟到的男主角，只是告白布景缺少的一块。', '你举着那个字母，直到手臂发酸。你明知道这是赵孟华准备的告白，却还是站在了这里。你不是故事里迟到的男主角，只是告白布景缺少的一块。') };
nodes['CH2-07'].choices[0].nextNodeRules = [rule('confrontedSetup', 'CH2-08-CANON-KNOWN')];
nodes['CH2-07'].choices[1].nextNodeId = 'CH2-08-DIGNITY-UNCERTAIN';
nodes['CH2-07'].choices[1].nextNodeRules = [rule('confrontedSetup', 'CH2-08-DIGNITY-KNOWN')];
nodes['CH2-07'].choices[2].nextNodeId = 'CH2-08-DIGNITY-SILENT';
for (const c of nodes['CH2-07'].choices.slice(0, 2)) c.effects.push(flag('dignityStyleSilentExit', false));
for (const c of nodes['CH2-06'].choices.filter(c => c.id !== 'confront-setup')) c.effects.push(flag('confrontedSetup', false));

for (const [id, checkpointId] of Object.entries({ 'PRO-03': 'CP-PRO-END', 'CH1-12': 'CP-CH1-END', 'CH2-11': 'CP-CH2-DECISION', 'CH2-12': 'CP-CH2-END' })) nodes[id].checkpointId = checkpointId;
nodes['CH2-ALT-END'].endingId = 'trialAlternate';
nodes['CH2-12'].stageEnd = true;
delete nodes['CH2-12'].autoNextNodeId;
nodes['CH2-12'].content = nodes['CH2-12'].content.replace('几个小时前，你还站在别人告白的字母里', '几个小时前，你还困在那场告白的喧闹里') + '\n\n下一章《没有时刻表的列车》';

const prefixOne = [{ nodeId: 'PRO-01', choiceId: 'remember-name' }];
const prefixTwo = [...prefixOne, ...[
  ['CH1-01', 'self-mock'], ['CH1-02', 'direct-confirm'], ['CH1-04', 'commit-passive'], ['CH1-05', 'nono-challenge'],
  ['CH1-06-NO-OLDTANG', 'interview-honest'], ['CH1-07-UNKNOWN', 'unknown-comfort-chen'], ['CH1-09', 'alien-loneliness'],
  ['CH1-10', 'power-instinctive'], ['CH1-11', 'admit-unknown'],
].map(([nodeId, choiceId]) => ({ nodeId, choiceId }))];
const story = {
  id: 'longzu-black-king-shadow-stage-one', contentVersion: 'v0.4B-stage-one.1', entryNodeId: 'PRO-01',
  chapters: [
    { chapter: 0, title: '序章《白帝城·梦醒》', entryNodeId: 'PRO-01', prerequisiteSummary: '从黑暗中的一声呼唤开始。', canonicalPrefix: [] },
    { chapter: 1, title: '第一章《卡塞尔之门》', entryNodeId: 'CH1-01', prerequisiteSummary: '白帝城的梦留下了一个名字。镜头转向你和老唐的星际对局，婶婶催你出门取信。', canonicalPrefix: prefixOne },
    { chapter: 2, title: '第二章《隐藏的选择项》', entryNodeId: 'CH2-01', prerequisiteSummary: '你收到卡塞尔的邀请，带着 N96 回家，由叔叔联系教授。经历陌生猫头像的约战和一场不到九十秒的面试后，你以为自己又失败了。', canonicalPrefix: prefixTwo },
  ],
  nodes,
  endings: { trialAlternate: { title: '普通人生·暂时结局', description: '你暂时没有接受卡塞尔的邀请。可以回到决定前重新选择，或结束本次试玩。' } },
};
for (const node of Object.values(nodes)) {
  if (!node.content || (!node.choices.length && !node.autoNextNodeId && !node.endingId && !node.stageEnd)) throw new Error(`Incomplete node ${node.id}`);
  const refs = [node.autoNextNodeId, ...(node.autoNextRules ?? []).map(r => r.nextNodeId), ...node.choices.flatMap(c => [c.nextNodeId, ...(c.nextNodeRules ?? []).map(r => r.nextNodeId)])].filter(Boolean);
  for (const ref of refs) if (!nodes[ref]) throw new Error(`Dangling reference ${node.id} -> ${ref}`);
}
writeFileSync(new URL('../src/content/stage-one.json', import.meta.url), JSON.stringify(story, null, 2) + '\n');
writeFileSync(new URL('../content-source/state-mapping.json', import.meta.url), JSON.stringify({ sourceSha256: createHash('sha256').update(source).digest('hex'), enums, numericEvents, editorialFeedback }, null, 2) + '\n');
console.log(`Built ${Object.keys(nodes).length} nodes, ${Object.values(nodes).reduce((n, node) => n + node.choices.length, 0)} stored choices.`);
