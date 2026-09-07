import { buildChaptersSixNine } from './build-chapters-six-nine.mjs';
import { buildChaptersTenThirteen } from './build-chapters-ten-thirteen.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildChaptersThreeFive } from './build-chapters-three-five.mjs';

// Only the checked-in snapshots are read; the original reference files stay untouched.
const source = readFileSync(new URL('../content-source/v0.4B.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const baseline = JSON.parse(readFileSync(new URL('../content-source/baseline-v0.7C.json', import.meta.url), 'utf8'));
const clean = text => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
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
    const feedback = clean(meta.match(/^   - 回响：(.+(?:\n {5}\S.*)*)/m)?.[1] ?? '').replace(/\n {5}/g, '\n\n');
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

// The September review adds conditional prose before the existing player decisions.
// Keep the original choice node IDs and make the new prose automatic nodes.
const corridorMarker = '\n\n酒店走廊的镜子';
const corridorStart = nodes['CH2-03'].content.indexOf(corridorMarker);
if (corridorStart < 0) throw new Error('Missing CH2-03 corridor boundary');
const corridorContent = nodes['CH2-03'].content.slice(corridorStart).trim();
nodes['CH2-03'].content = nodes['CH2-03'].content.slice(0, corridorStart).trim();
const corridorId = 'CH2-03-CORRIDOR';
nodes[corridorId] = {
  id: corridorId,
  chapter: 2,
  title: nodes['CH2-03'].title,
  content: corridorContent,
  choices: [],
  autoNextNodeId: 'CH2-04',
};

const hiddenInterestBody = clean(subsection(sections['CH2-03'].body, '系统处理'));
const hiddenInterestText = hiddenInterestBody.match(/仅当 hidInterestFromFamily = true 时显示：“([^”]+)”/)?.[1];
if (!hiddenInterestText) throw new Error('Missing CH2-03 hidden-interest echo');
const hiddenInterestId = 'CH2-03-HIDDEN-INTEREST';
nodes[hiddenInterestId] = {
  id: hiddenInterestId,
  chapter: 2,
  title: nodes['CH2-03'].title,
  content: hiddenInterestText,
  choices: [],
  autoNextNodeId: corridorId,
};
nodes['CH2-03'].autoNextNodeId = corridorId;
nodes['CH2-03'].autoNextRules = [rule('hidInterestFromFamily', hiddenInterestId)];

const contactEchoBody = clean(subsection(sections['CH2-06'].body, '条件短结果（展示层）'));
const contactEchoes = Object.fromEntries([...contactEchoBody.matchAll(/^- 条件（后台）：(\w+) = true。展示文字：(.+)$/gm)]
  .map(([, key, content]) => [key, content]));
for (const key of ['askedChen', 'askedSu']) {
  if (!contactEchoes[key]) throw new Error(`Missing CH2-06 contact echo: ${key}`);
}
const chenEchoId = 'CH2-06-ECHO-CHEN';
const suEchoId = 'CH2-06-ECHO-SU';
nodes[chenEchoId] = { id: chenEchoId, chapter: 2, title: nodes['CH2-06'].title, content: contactEchoes.askedChen, choices: [], autoNextNodeId: 'CH2-06' };
nodes[suEchoId] = { id: suEchoId, chapter: 2, title: nodes['CH2-06'].title, content: contactEchoes.askedSu, choices: [], autoNextNodeId: 'CH2-06' };
nodes[chenEchoId].autoNextRules = [rule('askedSu', suEchoId)];
const contactIntroId = 'CH2-06-INTRO';
nodes[contactIntroId] = {
  id: contactIntroId,
  chapter: 2,
  title: nodes['CH2-06'].title,
  content: nodes['CH2-06'].content,
  choices: [],
  autoNextNodeId: 'CH2-06',
};
nodes['CH2-06'].content = '';
nodes[contactIntroId].autoNextRules = [rule('askedChen', chenEchoId), rule('askedSu', suEchoId)];
nodes['CH2-05'].autoNextNodeId = contactIntroId;

nodes['CH2-08-CANON-KNOWN'] = { ...structuredClone(nodes['CH2-08-CANON']), id: 'CH2-08-CANON-KNOWN', content: nodes['CH2-08-CANON'].content.replace('你举着那个字母，直到手臂发酸才明白，所有人或许都知道安排，只有你和苏晓樯不知道。你不是故事里迟到的男主角，只是告白布景缺少的一块。', '你举着那个字母，直到手臂发酸。你明知道这是赵孟华准备的告白，却还是站在了这里。你不是故事里迟到的男主角，只是告白布景缺少的一块。') };
nodes['CH2-07'].choices[0].nextNodeRules = [rule('confrontedSetup', 'CH2-08-CANON-KNOWN')];
nodes['CH2-07'].choices[1].nextNodeId = 'CH2-08-DIGNITY-UNCERTAIN';
nodes['CH2-07'].choices[1].nextNodeRules = [rule('confrontedSetup', 'CH2-08-DIGNITY-KNOWN')];
nodes['CH2-07'].choices[2].nextNodeId = 'CH2-08-DIGNITY-SILENT';
for (const c of nodes['CH2-07'].choices.slice(0, 2)) c.effects.push(flag('dignityStyleSilentExit', false));
for (const c of nodes['CH2-06'].choices.filter(c => c.id !== 'confront-setup')) c.effects.push(flag('confrontedSetup', false));

for (const [id, checkpointId] of Object.entries({ 'PRO-03': 'CP-PRO-END', 'CH1-12': 'CP-CH1-END', 'CH2-11': 'CP-CH2-DECISION', 'CH2-12': 'CP-CH2-END' })) nodes[id].checkpointId = checkpointId;
nodes['CH2-ALT-END'].endingId = 'trialAlternate';
nodes['CH2-12'].autoNextNodeId = 'CH3-01';
nodes['CH2-12'].content = nodes['CH2-12'].content.replace('几个小时前，你还站在别人告白的字母里', '几个小时前，你还困在那场告白的喧闹里');
Object.assign(nodes, buildChaptersThreeFive(baseline).nodes);

const prefixOne = [{ nodeId: 'PRO-01', choiceId: 'remember-name' }];
const prefixTwo = [...prefixOne, ...[
  ['CH1-01', 'self-mock'], ['CH1-02', 'direct-confirm'], ['CH1-04', 'commit-passive'], ['CH1-05', 'nono-challenge'],
  ['CH1-06-NO-OLDTANG', 'interview-honest'], ['CH1-07-UNKNOWN', 'unknown-comfort-chen'], ['CH1-09', 'alien-loneliness'],
  ['CH1-10', 'power-instinctive'], ['CH1-11', 'admit-unknown'],
].map(([nodeId, choiceId]) => ({ nodeId, choiceId }))];
const route = steps => steps.map(([nodeId, choiceId]) => ({ nodeId, choiceId }));
const prefixThree = [...prefixTwo, ...route([
  ['CH2-01', 'admission-disbelief'], ['CH2-02', 'ask-why-me'], ['CH2-04', 'accept-tissue'],
  ['CH2-06', 'look-chen'], ['CH2-07', 'accept-letter'], ['CH2-10', 'thank-nono'], ['CH2-11', 'motive-escape'],
])];
const prefixFour = [...prefixThree, ...route([
  ['CH3-02', 'ch3-02-verify'], ['CH3-03', 'ch3-03-share'], ['CH3-04', 'ch3-04-eyes'],
  ['CH3-06', 'ch3-06-mock'], ['CH3-07', 'ch3-07-listen'],
])];
const prefixFive = [...prefixFour, ...route([
  ['CH4-01', 'consequence'], ['CH4-02', 'doubt'], ['CH4-03', 'ch4-prioritize-dragon-evidence'],
  ['CH4-05', 'ch4-focus-black-dragon'], ['CH4-07', 'check'], ['CH4-08', 'retreat'], ['CH4-09', 'pass'],
])];
Object.assign(nodes, buildChaptersSixNine(baseline).nodes);
delete nodes['CH5-14'].stageEnd;
nodes['CH5-14'].autoNextNodeId = 'CH6-01';
const prefixSix = [...prefixFive, ...route([
  ['CH5-01','ch5-01-hide'], ['CH5-02','ch5-02-routes'], ['CH5-05','ch5-05-trust'],
  ['CH5-07','ch5-07-helpless'], ['CH5-09','ch5-09-understand'], ['CH5-11','ch5-11-anger'], ['CH5-13','ch5-13-reject'],
])];
const prefixSeven = [...prefixSix, ...route([
  ['CH6-01','ch6-01-memorize'], ['CH6-03','ch6-03-cuff'], ['CH6-04','ch6-04-draw'],
  ['CH6-05','ch6-05-ninth'], ['CH6-07','ch6-07-rescue'], ['CH6-09','ch6-09-names'],
])];
const prefixEight = [...prefixSeven, ...route([
  ['CH7-02','ch7-02-studentunion'], ['CH7-04','ch7-04-admit'], ['CH7-06','ch7-06-go'], ['CH7-07','ch7-07-wish'],
])];
const prefixNine = [...prefixEight, ...route([
  ['CH8-01','ch8-01-trust'], ['CH8-03','ch8-03-obey'], ['CH8-05','ch8-05-ask'],
  ['CH8-07','ch8-07-offset'], ['CH8-10','ch8-10-brother'],
])];
Object.assign(nodes, buildChaptersTenThirteen(baseline).nodes);
delete nodes['CH9-08'].stageEnd;
nodes['CH9-08'].autoNextNodeId = 'CH10-01';
// Resolve the authored decisions to their actual owners after conditional
// prose is split into automatic nodes. Never fabricate prerequisite flags.
const extendPrefix = (prefix, ids) => [...prefix, ...ids.map(choiceId => {
  const owners = Object.values(nodes).filter(node => node.choices.some(choice => choice.id === choiceId));
  if (owners.length !== 1) throw new Error(`Ambiguous canonical decision ${choiceId}`);
  return { nodeId: owners[0].id, choiceId };
})];
const prefixTen = extendPrefix(prefixNine, ['ch9-02-message', 'ch9-04-prepare', 'ch9-05-backup', 'ch9-06-lethal']);
const prefixEleven = extendPrefix(prefixTen, [
  'ch10-01-route', 'ch10-03-blood', 'ch10-04-formation', 'ch10-05-brother',
  'ch10-06-save', 'ch10-07-record', 'ch10-09-name',
]);
const prefixTwelve = extendPrefix(prefixEleven, ['ch11-04-report', 'ch11-05-cause', 'ch11-06-nono', 'ch11-07-confirm']);
const prefixThirteen = extendPrefix(prefixTwelve, ['ch12-01-check', 'ch12-03-hold', 'ch12-04-norton', 'ch12-05-lethal', 'ch12-06-lethal']);
const story = {
  id: 'longzu-black-king-shadow-stage-one', contentVersion: 'v0.7C-season-one.20260906.1', entryNodeId: 'PRO-01',
  chapters: [
    { chapter: 0, title: '序章《白帝城·梦醒》', entryNodeId: 'PRO-01', prerequisiteSummary: '从黑暗中的一声呼唤开始。', canonicalPrefix: [] },
    { chapter: 1, title: '第一章《卡塞尔之门》', entryNodeId: 'CH1-01', prerequisiteSummary: '白帝城的梦留下了一个名字。镜头转向你和老唐的星际对局，婶婶催你出门取信。', canonicalPrefix: prefixOne },
    { chapter: 2, title: '第二章《隐藏的选择项》', entryNodeId: 'CH2-01', prerequisiteSummary: '你收到卡塞尔的邀请，带着 N96 回家，由叔叔联系教授。经历陌生猫头像的约战和一场不到九十秒的面试后，你以为自己又失败了。', canonicalPrefix: prefixTwo },
    { chapter: 3, title: '第三章《没有时刻表的列车》', entryNodeId: 'CH3-01', prerequisiteSummary: '你读过父母的信，在电影院经历告白风波后接受诺诺的帮助，并决定前往卡塞尔。三周的入学准备结束，你独自飞抵芝加哥。', canonicalPrefix: prefixThree },
    { chapter: 4, title: '第四章《屠龙学院》', entryNodeId: 'CH4-01', prerequisiteSummary: '你在车站核实车次，与芬格尔分享食物，遇见金色眼睛的神秘男孩。列车到来后你得知自己被评为S级，登车听古德里安说明学院的使命。', canonicalPrefix: prefixFour },
    { chapter: 5, title: '第五章《自由一日》', entryNodeId: 'CH5-01', prerequisiteSummary: '你听过3E考试和龙类真相，经历黑龙幻象，并亲眼见过龙鳞与苏醒的红龙幼崽。校园忽然响起枪声，两位教授在你面前倒下；你仍把眼前的一切当成真实危机。', canonicalPrefix: prefixFive },
    { chapter: 6, title: '第六章《龙文回响》', entryNodeId: 'CH6-01', prerequisiteSummary: '自由一日结束，你已知道训练弹的真相，三枪带来的奖励仍待3E考试确认。芬格尔与你回到宿舍，第二天九点将参加考试。', canonicalPrefix: prefixSix },
    { chapter: 7, title: '第七章《安珀馆的星与花》', entryNodeId: 'CH7-01', prerequisiteSummary: '你通过3E，确认自由一日奖励。在图书馆协助打开青铜城地图后，仍目睹叶胜与酒德亚纪牺牲；你在悼念时把他们的名字写在同一条白布上。', canonicalPrefix: prefixSeven },
    { chapter: 8, title: '第八章《龙穴警报》', entryNodeId: 'CH8-01', prerequisiteSummary: '你接受学生会邀请，与零共舞。警报打断晚宴，你按诺诺指引驾车离开交火区，在山顶祝她生日快乐。回到车旁，持枪的老唐突然出现在后座。', canonicalPrefix: prefixEight },
    { chapter: 9, title: '第九章《夔门再临》', entryNodeId: 'CH9-01', prerequisiteSummary: '你保留对老唐的信任，服从诺诺分工，在钟楼偏开贤者之石的准星。康斯坦丁仍因护兄而死，老唐随后觉醒为诺顿。你保存护兄影像，并提出下一次行动必须审查撤离、通讯与处置方案。', canonicalPrefix: prefixNine },
    { chapter: 10, title: '第十章《青铜城下潜》', entryNodeId: 'CH10-01', prerequisiteSummary: '你保留了老唐的人类消息，完成应急撤离与独立通讯准备，接受任务的致命处置预案。摩尼亚赫号抵达夔门，你与诺诺准备下潜。', canonicalPrefix: prefixTen },
    { chapter: 11, title: '第十一章《龙王复仇》', entryNodeId: 'CH11-01', prerequisiteSummary: '你与诺诺进入青铜城，记录双生王座与铸造台位置，在最低通道找到叶胜和未知金属匣。你们已携任务物件返回摩尼亚赫号，叶胜留在城内。', canonicalPrefix: prefixEleven },
    { chapter: 12, title: '第十二章《七宗罪》', entryNodeId: 'CH12-01', prerequisiteSummary: '诺顿袭击摩尼亚赫号，诺诺重伤。常规抢救失败后，你明确确认与路鸣泽交易，永久支付四分之一生命；诺诺暂时保住生命体征，金属匣仍在甲板上。', canonicalPrefix: prefixTwelve },
    { chapter: 13, title: '第十三章《余烬》', entryNodeId: 'CH13-01', prerequisiteSummary: '你选择以致命解法解除诺顿威胁，岸上备用狙击线击破核心，老唐没有回来。诺诺已进入转运与恢复，七宗罪封存；本章沿用原著余烬结果，不重新判定。', canonicalPrefix: prefixThirteen },
  ],
  nodes,
  endings: { trialAlternate: { title: '普通人生·暂时结局', description: '你暂时没有接受卡塞尔的邀请。可以回到决定前重新选择，或结束本次试玩。' } },
};
for (const node of Object.values(nodes)) {
  if (typeof node.content !== 'string' || (!node.choices.length && !node.autoNextNodeId && !node.autoNextRules?.length && !node.endingId && !node.stageEnd)) throw new Error(`Incomplete node ${node.id}`);
  const refs = [node.autoNextNodeId, ...(node.autoNextRules ?? []).map(r => r.nextNodeId), ...node.choices.flatMap(c => [c.nextNodeId, ...(c.nextNodeRules ?? []).map(r => r.nextNodeId)])].filter(Boolean);
  for (const ref of refs) if (!nodes[ref]) throw new Error(`Dangling reference ${node.id} -> ${ref}`);
}
writeFileSync(new URL('../src/content/stage-one.json', import.meta.url), JSON.stringify(story, null, 2) + '\n');
writeFileSync(new URL('../content-source/state-mapping.json', import.meta.url), JSON.stringify({ sourceSha256: createHash('sha256').update(source).digest('hex'), enums, numericEvents, editorialFeedback }, null, 2) + '\n');
console.log(`Built ${Object.keys(nodes).length} nodes, ${Object.values(nodes).reduce((n, node) => n + node.choices.length, 0)} stored choices.`);
