<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Choice, Session, Story } from '../engine/types';
import SafeText from './SafeText.vue';
import { readingPages } from '../readingPages';

const props = defineProps<{ story: Story; session: Session; choices: Choice[]; busy: boolean; inputMessage: string }>();
const emit = defineEmits<{
  choose: [nodeId: string, choiceId: string];
  input: [nodeId: string, text: string];
  menu: []; restart: []; returnToDecision: [];
}>();
const body = ref<HTMLElement>();
const actions = ref<HTMLElement>();
const inputOpen = ref(false);
const input = ref('');
const historyDialog = ref<HTMLDialogElement>();
const historyIndex = ref(0);
const pages = computed(() => readingPages(props.story, props.session));
const currentPage = computed(() => pages.value[pages.value.length - 1]);
const recordedPage = computed(() => pages.value[historyIndex.value]);
const chapter = computed(() => props.story.chapters.find(item => item.chapter === (props.session.mode === 'test' ? props.session.testChapter : props.story.nodes[props.session.currentNodeId].chapter)));
const ending = computed(() => props.session.endingId ? props.story.endings[props.session.endingId] : undefined);
const visibleHistory = computed(() => currentPage.value?.entries ?? []);
function openHistory() {
  historyIndex.value = Math.max(0, pages.value.length - 2);
  historyDialog.value?.showModal();
  if (historyDialog.value) historyDialog.value.scrollTop = 0;
}
async function browseHistory(index: number) {
  historyIndex.value = index;
  await nextTick();
  if (historyDialog.value) historyDialog.value.scrollTop = 0;
}
defineExpose({ openHistory });
watch(() => props.session, async () => {
  input.value = '';
  inputOpen.value = false;
  await nextTick();
  if (actions.value) actions.value.scrollTop = 0;
  if (body.value) body.value.scrollTop = 0;
});
function submit() {
  if (!props.busy && input.value.trim()) emit('input', props.session.currentNodeId, input.value);
}
async function keepInputVisible(event: FocusEvent) {
  const field = event.target as HTMLTextAreaElement;
  await nextTick();
  const container = actions.value;
  if (!container) return;
  const frame = container.getBoundingClientRect();
  const rect = field.getBoundingClientRect();
  if (rect.bottom > frame.bottom - 8) container.scrollTop += rect.bottom - frame.bottom + 8;
  else if (rect.top < frame.top + 8) container.scrollTop -= frame.top + 8 - rect.top;
}
</script>

<template>
  <main class="reader-main" aria-label="剧情阅读">
    <section ref="body" class="story-region" tabindex="0" aria-label="正文阅读区">
      <div class="reading-column">
        <aside v-if="session.mode === 'test'" class="test-context">
          <strong>章节测试 · {{ chapter?.title }}</strong>
          <p>{{ chapter?.prerequisiteSummary || '从本章开头开始，无前置经历。' }}</p>
          <p>本章结束后停止，正式进度保持不变。</p>
        </aside>
        <article v-for="(entry, index) in visibleHistory" :key="entry.id" :data-entry-index="index" :class="['history-entry', `entry-${entry.kind}`]">
          <span v-if="entry.kind === 'choice'" class="choice-caption">你的选择</span>
          <SafeText :text="entry.text" />
        </article>
        <div v-if="session.status === 'stageEnd'" class="end-note">
          <h2>{{ session.mode === 'test' ? '本章测试完成' : '当前试玩完成' }}</h2>
          <p>{{ session.mode === 'test' ? '你已走到本章测试终点，可以重开本章或返回目录。' : '本次试玩开放至第二章，后续章节尚未开放。第一季故事仍在继续。' }}</p>
        </div>
        <div v-if="session.status === 'ending'" class="end-note">
          <h2>{{ ending?.title || '本段旅程暂告一段落' }}</h2>
          <p>{{ ending?.description }}</p>
          <p>这是当前路线的临时结局，第一季尚未完成。</p>
        </div>
      </div>
    </section>
    <section ref="actions" class="action-region" aria-label="行动区" tabindex="0">
      <div class="action-column">
        <template v-if="session.status === 'choice'">
          <div class="action-heading"><h2>你的行动</h2><span>选择一项，故事继续</span></div>
          <div class="choice-list">
            <button v-for="choice in choices" :key="`${session.currentNodeId}:${choice.id}`" class="choice-button" :disabled="busy" @click="emit('choose', session.currentNodeId, choice.id)">{{ choice.label }}</button>
          </div>
          <button class="text-toggle" :aria-expanded="inputOpen" aria-controls="action-input" :disabled="busy" @click="inputOpen = !inputOpen">{{ inputOpen ? '收起文字输入' : '用文字表达行动' }}</button>
          <form v-if="inputOpen" id="action-input" class="input-form" @submit.prevent="submit">
            <label for="action-text">你想怎么做？</label>
            <p id="input-help" class="muted">文字只匹配当前可选行动，不会生成新的剧情。</p>
            <textarea id="action-text" v-model="input" rows="2" maxlength="500" aria-describedby="input-help input-feedback" :disabled="busy" @focus="keepInputVisible" />
            <button type="submit" :disabled="busy || !input.trim()">提交行动</button>
          </form>
          <p v-if="inputMessage" id="input-feedback" class="input-feedback" role="status">{{ inputMessage }}</p>
        </template>
        <template v-else>
          <h2>{{ session.status === 'ending' ? '这条路线暂时结束' : session.mode === 'test' ? '本章测试完成' : '已到达第二章试玩终点' }}</h2>
          <button v-if="session.status === 'ending'" :disabled="busy" @click="emit('returnToDecision')">回到第二章决策前</button>
          <button v-if="session.mode === 'test'" :disabled="busy" @click="emit('restart')">重开本章测试</button>
          <button :disabled="busy" @click="emit('menu')">返回目录</button>
        </template>
      </div>
    </section>
  </main>
  <dialog ref="historyDialog" class="history-dialog" aria-labelledby="history-title" aria-describedby="history-description">
    <form method="dialog" class="dialog-heading"><h2 id="history-title">剧情记录</h2><button>关闭记录</button></form>
    <p id="history-description" class="muted">回看已经读过的完整页面，不撤销选择或改变当前进度。</p>
    <nav class="history-navigation" aria-label="记录翻页">
      <button :disabled="historyIndex === 0" @click="browseHistory(historyIndex - 1)">上一段</button>
      <span role="status">第 {{ historyIndex + 1 }} / {{ pages.length }} 段{{ historyIndex === pages.length - 1 ? ' · 当前页' : '' }}</span>
      <button :disabled="historyIndex >= pages.length - 1" @click="browseHistory(historyIndex + 1)">下一段</button>
    </nav>
    <div v-if="recordedPage" class="history-page" :class="{ 'is-current': historyIndex === pages.length - 1 }">
      <article v-for="(entry, index) in recordedPage.entries" :key="entry.id" :class="['history-entry', `entry-${entry.kind}`]">
        <span v-if="entry.kind === 'choice'" class="choice-caption">你的选择</span>
        <SafeText :text="entry.text" />
      </article>
    </div>
  </dialog>
</template>
