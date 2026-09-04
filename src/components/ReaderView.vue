<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { Choice, Session, Story } from '../engine/types';
import SafeText from './SafeText.vue';

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
const latestPending = ref(false);
let latestIndex = 0;
const chapter = computed(() => props.story.chapters.find(item => item.chapter === (props.session.mode === 'test' ? props.session.testChapter : props.story.nodes[props.session.currentNodeId].chapter)));
const ending = computed(() => props.session.endingId ? props.story.endings[props.session.endingId] : undefined);
const visibleHistory = computed(() => historyFor(props.session));
function historyFor(state: Session) {
  return state.history.filter(entry => state.mode !== 'test' || props.story.nodes[entry.nodeId].chapter === state.testChapter);
}
function lastStoryIndex(state: Session) {
  const history = historyFor(state);
  for (let index = history.length - 1; index >= 0; index--) if (history[index].kind === 'story') return index;
  return 0;
}

function scrollToEntry(index: number) {
  const container = body.value;
  const target = container?.querySelector<HTMLElement>(`[data-entry-index="${index}"]`);
  if (container && target) container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - 24;
}
function goLatest() {
  scrollToEntry(latestIndex);
  latestPending.value = false;
}
function onBodyScroll() {
  const container = body.value;
  if (container && container.scrollHeight - container.clientHeight - container.scrollTop < 40) latestPending.value = false;
}
watch(() => props.session, async (current, previous) => {
  const container = body.value;
  const nearBottom = !container || container.scrollHeight - container.clientHeight - container.scrollTop < 80;
  const oldPosition = container?.scrollTop ?? 0;
  const history = historyFor(current);
  const previousLength = historyFor(previous).length;
  const appended = history.length > previousLength;
  latestIndex = appended
    ? Math.max(previousLength, history.findIndex((entry, index) => index >= previousLength && entry.kind !== 'choice'))
    : lastStoryIndex(current);
  input.value = '';
  inputOpen.value = false;
  await nextTick();
  if (actions.value) actions.value.scrollTop = 0;
  if (nearBottom || !appended) { goLatest(); }
  else {
    if (body.value) body.value.scrollTop = oldPosition;
    latestPending.value = true;
  }
});
onMounted(() => {
  latestIndex = lastStoryIndex(props.session);
  // New games begin at the beginning; resumed routes open at their latest scene.
  if (props.session.mode === 'normal' && props.session.choices.length > 0) scrollToEntry(latestIndex);
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
    <section ref="body" class="story-region" tabindex="0" aria-label="正文阅读区" @scroll="onBodyScroll">
      <div class="reading-column">
        <aside v-if="session.mode === 'test'" class="test-context">
          <strong>章节测试 · {{ chapter?.title }}</strong>
          <p>{{ chapter?.prerequisiteSummary || '从本章开头开始，无前置经历。' }}</p>
          <p>本章结束后停止，正式进度保持不变。</p>
        </aside>
        <article v-for="(entry, index) in visibleHistory" :key="entry.id" :data-entry-index="index" :class="['history-entry', `entry-${entry.kind}`]">
          <h2 v-if="entry.kind === 'story' && (index === 0 || story.nodes[entry.nodeId].chapter !== story.nodes[visibleHistory[index - 1].nodeId].chapter)" class="chapter-heading">{{ story.chapters.find(item => item.chapter === story.nodes[entry.nodeId].chapter)?.title }}</h2>
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
        <button v-if="latestPending" class="latest-button" @click="goLatest">回到最新位置</button>
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
</template>
