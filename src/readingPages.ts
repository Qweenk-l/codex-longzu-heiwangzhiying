import type { HistoryEntry, Session, Story } from './engine/types';

export interface ReadingPage {
  id: number;
  entries: HistoryEntry[];
  nodeId: string;
}

// Each choice begins a new page containing its result and the next scene.
// Keep the underlying history intact so existing saves need no conversion.
export function readingPages(story: Story, session: Session): ReadingPage[] {
  const pages: ReadingPage[] = [];
  for (const entry of session.history) {
    if (session.mode === 'test' && story.nodes[entry.nodeId].chapter !== session.testChapter) continue;
    let page = pages[pages.length - 1];
    if (!page || entry.kind === 'choice') {
      page = { id: entry.id, entries: [], nodeId: entry.nodeId };
      pages.push(page);
    }
    page.entries.push(entry);
    if (entry.kind === 'story') page.nodeId = entry.nodeId;
  }
  return pages;
}
