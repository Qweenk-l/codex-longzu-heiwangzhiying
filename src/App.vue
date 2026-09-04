<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import ReaderView from './components/ReaderView.vue';
import rawStory from './content/stage-one.json';
import type { Session, Story } from './engine/types';
import { availableChoices, choose, resolveInput, restoreCheckpoint, startChapterTest, startGame } from './engine/engine';
import { exportGame, importGame, loadGame, saveGame } from './storage/repository';

const story = rawStory as Story;
const normal = shallowRef<Session | null>(null);
const session = shallowRef<Session | null>(null);
const loadFailed = ref(false);
const inReader = ref(false);
const busy = ref(true);
const error = ref('');
const inputMessage = ref('');
const saved = ref(false);
const saveStatus = ref('正在读取存档…');
const readerKey = ref(0);
const fileInput = ref<HTMLInputElement>();
const settingsDialog = ref<HTMLDialogElement>();
const checkpointsDialog = ref<HTMLDialogElement>();
const confirmDialog = ref<HTMLDialogElement>();
const confirmTitle = ref('');
const confirmText = ref('');
let confirmedAction: (() => void | Promise<void>) | undefined;
const theme = ref<'light' | 'dark'>('light');
const fontSize = ref(18);
const choices = computed(() => session.value ? availableChoices(story, session.value) : []);
const chapterTitle = computed(() => session.value ? story.chapters.find(item => item.chapter === (session.value?.mode === 'test' ? session.value.testChapter : story.nodes[session.value!.currentNodeId].chapter))?.title : '序章至第二章 · 阶段试玩');
const checkpoints = computed(() => session.value?.checkpoints.filter(point => session.value?.mode !== 'test' || story.nodes[point.nodeId].chapter === session.value.testChapter) ?? []);

function confirmAction(title: string, message: string, action: () => void | Promise<void>) {
  confirmTitle.value = title;
  confirmText.value = message;
  confirmedAction = action;
  confirmDialog.value?.showModal();
}
async function acceptConfirmation() {
  const action = confirmedAction;
  confirmedAction = undefined;
  confirmDialog.value?.close();
  await action?.();
}
function showError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '操作未完成，请重试。';
}
async function persist(state: Session): Promise<boolean> {
  saveStatus.value = '正在保存…';
  saved.value = false;
  try {
    await saveGame(story, state);
    loadFailed.value = false;
    saved.value = true;
    saveStatus.value = '已自动保存';
    return true;
  } catch {
    saveStatus.value = '未保存';
    error.value = '本地保存失败。可以重试保存，或导出进度文件保全当前路线。';
    return false;
  }
}
async function applyState(state: Session, replace = false) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  inputMessage.value = '';
  try {
    if (state.mode === 'normal') {
      await persist(state);
      normal.value = state;
    }
    if (replace) readerKey.value += 1;
    session.value = state;
    inReader.value = true;
  } finally { busy.value = false; }
}
function begin() {
  if (busy.value) return;
  const run = () => { try { return applyState(startGame(story), true); } catch (cause) { showError(cause); } };
  if (normal.value || loadFailed.value) confirmAction('开始新的游戏？', loadFailed.value ? '现有存档无法读取，开始新游戏可能覆盖它。确认要用新的进度替换吗？' : '这会覆盖当前正式进度。你可以先取消并导出存档，保留现有路线。', run);
  else void run();
}
function resume() {
  if (!normal.value || busy.value) return;
  session.value = normal.value;
  readerKey.value += 1;
  inReader.value = true;
  error.value = '';
}
function testChapter(chapter: number) {
  if (busy.value) return;
  try { void applyState(startChapterTest(story, chapter), true); } catch (cause) { showError(cause); }
}
function takeChoice(nodeId: string, choiceId: string, input?: string) {
  if (busy.value || !session.value) return;
  try { void applyState(choose(story, session.value, nodeId, choiceId, input)); } catch (cause) { showError(cause); }
}
function submitInput(nodeId: string, text: string) {
  if (busy.value || !session.value) return;
  if (nodeId !== session.value.currentNodeId) { inputMessage.value = '剧情已经更新，请使用当前行动。'; return; }
  try {
    const result = resolveInput(story, session.value, text);
    if (result.kind === 'matched') takeChoice(nodeId, result.choiceId, text);
    else inputMessage.value = result.message;
  } catch (cause) { showError(cause); }
}
function requestRestore(id: string) {
  if (!session.value || busy.value) return;
  checkpointsDialog.value?.close();
  confirmAction('回到这个检查点？', '检查点之后的选择、正文和后续检查点将被删除。重走路线后会保存新的进度。', () => {
    if (!session.value) return;
    try { return applyState(restoreCheckpoint(story, session.value, id), true); } catch (cause) { showError(cause); }
  });
}
function returnToDecision() {
  const checkpoint = session.value?.checkpoints.slice().reverse().find(item => story.nodes[item.nodeId].chapter === 2);
  if (checkpoint) requestRestore(checkpoint.id);
  else error.value = '当前会话没有可用的第二章检查点，请返回目录重开本章。';
}
function toMenu() {
  if (busy.value) return;
  inReader.value = false;
  inputMessage.value = '';
}
async function retrySave() {
  if (busy.value || !normal.value) return;
  busy.value = true;
  error.value = '';
  try { await persist(normal.value); } finally { busy.value = false; }
}
function downloadSave() {
  if (!normal.value || busy.value) return;
  try {
    const blob = new Blob([exportGame(story, normal.value)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '龙族-黑王之影-正式存档.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) { showError(cause); }
}
async function readImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file || busy.value) return;
  busy.value = true;
  error.value = '';
  let imported: Session;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('存档文件过大，请选择本游戏导出的存档。');
    imported = importGame(story, await file.text());
  } catch (cause) { showError(cause); return; }
  finally { busy.value = false; }
  confirmAction('导入这份正式存档？', normal.value || loadFailed.value ? '文件已通过校验。导入将覆盖当前正式存档，请确认已保留所需的旧文件。' : '文件已通过校验。确认后将保存为正式进度并打开阅读页面。', async () => {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    const previousSaved = saved.value;
    const previousStatus = saveStatus.value;
    try {
      if (await persist(imported)) {
        normal.value = imported;
        session.value = imported;
        readerKey.value += 1;
        inReader.value = true;
      } else {
        saved.value = previousSaved;
        saveStatus.value = previousStatus;
        error.value = '导入保存失败，原有正式进度保持不变。请检查浏览器存储后重新导入。';
      }
    } finally { busy.value = false; }
  });
}
function updateViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`);
  document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
}
watch([theme, fontSize], () => {
  try { localStorage.setItem('black-king-reading-settings', JSON.stringify({ theme: theme.value, fontSize: fontSize.value })); }
  catch { error.value = '阅读设置暂时无法保存，当前页面仍可使用。'; }
});
onMounted(async () => {
  updateViewport();
  window.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  try {
    const preferences = JSON.parse(localStorage.getItem('black-king-reading-settings') || '{}');
    if (preferences.theme === 'dark' || preferences.theme === 'light') theme.value = preferences.theme;
    if ([16, 18, 20].includes(preferences.fontSize)) fontSize.value = preferences.fontSize;
  } catch { /* A damaged preference never blocks reading. */ }
  try {
    normal.value = await loadGame(story);
    saved.value = Boolean(normal.value);
    saveStatus.value = normal.value ? '已读取正式进度' : '尚无正式存档';
  } catch {
    loadFailed.value = true;
    error.value = '无法读取本地存档。你仍可开始游戏；保存失败时请导出进度文件。';
    saveStatus.value = '存档读取失败';
  } finally { busy.value = false; }
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport);
  window.visualViewport?.removeEventListener('resize', updateViewport);
  window.visualViewport?.removeEventListener('scroll', updateViewport);
});
</script>

<template>
  <div class="app-shell" :data-theme="theme" :style="{ '--reader-font-size': `${fontSize}px` }">
    <header class="topbar">
      <div class="topbar-title"><span class="game-name">龙族：黑王之影</span><h1>{{ chapterTitle }}</h1></div>
      <nav aria-label="阅读菜单">
        <span v-if="inReader && session?.mode === 'test'" class="test-badge">章节测试</span>
        <button v-if="inReader" :disabled="busy" @click="toMenu">目录</button>
        <button v-if="inReader" :disabled="busy || !checkpoints.length" @click="checkpointsDialog?.showModal()">回退</button>
        <button @click="settingsDialog?.showModal()">设置</button>
      </nav>
    </header>
    <div class="statusbar" role="status">
      <span>{{ inReader && session?.mode === 'test' ? '测试进度不写入正式存档' : saveStatus }}</span>
      <button v-if="normal && !saved && !(inReader && session?.mode === 'test')" :disabled="busy" @click="retrySave">重试保存</button>
    </div>
    <div v-if="error" class="error-banner" role="alert"><span>{{ error }}</span><button aria-label="关闭提示" @click="error = ''">关闭</button></div>
    <ReaderView v-if="inReader && session" :key="readerKey" :story="story" :session="session" :choices="choices" :busy="busy" :input-message="inputMessage" @choose="takeChoice" @input="submitInput" @menu="toMenu" @restart="testChapter(session.testChapter!)" @return-to-decision="returnToDecision" />
    <main v-else class="menu-region">
      <div class="menu-content">
        <p class="eyebrow">固定路明非 · 第一季阶段试玩</p>
        <h2>龙族：黑王之影</h2>
        <p class="intro">从白帝城的一场梦，走向卡塞尔之门。</p>
        <p class="muted">本次可游玩序章、第一章和第二章。故事按预写分支推进，当前版本不接入 AI。</p>
        <div class="menu-actions">
          <button class="primary-button" :disabled="busy" @click="begin">开始游戏</button>
          <button :disabled="busy || !normal" @click="resume">继续游戏</button>
        </div>
        <section class="chapter-tests" aria-labelledby="test-heading">
          <h3 id="test-heading">章节测试</h3>
          <p class="muted">从预设前情进入指定章节，不影响正式进度。</p>
          <div class="chapter-buttons"><button v-for="chapter in story.chapters" :key="chapter.chapter" :disabled="busy" @click="testChapter(chapter.chapter)">{{ chapter.title }}</button></div>
        </section>
        <div class="save-tools"><button :disabled="busy || !normal" @click="downloadSave">导出正式存档</button><button :disabled="busy" @click="fileInput?.click()">导入存档</button></div>
        <p class="storage-note">进度保存在当前浏览器。换设备或清理浏览器前，请先导出存档。</p>
      </div>
    </main>
    <input ref="fileInput" class="file-input" type="file" accept=".json,application/json" aria-label="选择存档文件" @change="readImport" />
    <dialog ref="settingsDialog" aria-labelledby="settings-title">
      <form method="dialog" class="dialog-heading"><h2 id="settings-title">阅读设置</h2><button>关闭</button></form>
      <fieldset><legend>正文字号</legend><div class="setting-options"><label v-for="size in [16, 18, 20]" :key="size"><input v-model="fontSize" type="radio" :value="size" name="font-size" />{{ size }} px</label></div></fieldset>
      <fieldset><legend>主题</legend><div class="setting-options"><label><input v-model="theme" type="radio" value="light" name="theme" />明亮</label><label><input v-model="theme" type="radio" value="dark" name="theme" />深色</label></div></fieldset>
      <p class="muted">设置仅改变阅读显示，不影响剧情进度。</p>
    </dialog>
    <dialog ref="checkpointsDialog" aria-labelledby="checkpoints-title">
      <form method="dialog" class="dialog-heading"><h2 id="checkpoints-title">回到检查点</h2><button>关闭</button></form>
      <p>选择已经到达的位置，重新探索之后的路线。</p>
      <div class="checkpoint-list"><button v-for="(point, index) in checkpoints" :key="point.id" :disabled="busy" @click="requestRestore(point.id)">{{ index + 1 }}. {{ story.chapters.find(chapter => chapter.chapter === story.nodes[point.nodeId].chapter)?.title }} · {{ story.nodes[point.nodeId].title }}</button></div>
    </dialog>
    <dialog ref="confirmDialog" aria-labelledby="confirm-title" aria-describedby="confirm-description">
      <h2 id="confirm-title">{{ confirmTitle }}</h2><p id="confirm-description">{{ confirmText }}</p>
      <div class="confirm-actions"><button autofocus @click="confirmDialog?.close()">取消</button><button class="primary-button" :disabled="busy" @click="acceptConfirmation">确认</button></div>
    </dialog>
  </div>
</template>
