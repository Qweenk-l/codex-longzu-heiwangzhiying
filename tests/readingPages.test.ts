import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Story } from '../src/engine/types';
import { choose, restoreCheckpoint, startChapterTest, startGame } from '../src/engine/engine';
import { readingPages } from '../src/readingPages';

const story: Story = JSON.parse(readFileSync(new URL('../src/content/stage-one.json', import.meta.url), 'utf8'));
describe('完整阅读页面', () => {
  it('按真实选择分隔页面，保留结果、自动承接与下一场正文', () => {
    const first = startGame(story);
    const next = choose(story, first, 'PRO-01', 'remember-name');
    const pages = readingPages(story, next);
    expect(pages).toHaveLength(2);
    expect(pages[0].entries).toEqual(first.history);
    expect(pages[1].entries.map(e => e.nodeId)).toEqual(['PRO-01', 'PRO-03', 'CH1-01']);
    expect(pages[1].entries[0].kind).toBe('choice');
    expect(pages[1].entries.some(e => e.text.includes('这不是你的梦'))).toBe(false);
    expect(pages[1].nodeId).toBe('CH1-01');
    expect(readingPages(story, JSON.parse(JSON.stringify(next)))).toEqual(pages);
  });
  it('章节测试不显示前情页面，回退后不再保留未来页面', () => {
    const test = startChapterTest(story, 2);
    expect(readingPages(story, test)).toHaveLength(1);
    expect(readingPages(story, test)[0].entries.every(e => story.nodes[e.nodeId].chapter === 2)).toBe(true);
    let next = choose(story, startGame(story), 'PRO-01', 'remember-name');
    next = choose(story, next, 'CH1-01', 'self-mock');
    expect(readingPages(story, next)).toHaveLength(3);
    const restored = restoreCheckpoint(story, next, 'CP-PRO-END');
    expect(readingPages(story, restored)).toHaveLength(2);
    expect(readingPages(story, restored).at(-1)?.nodeId).toBe('CH1-01');
  });
});
