export interface Condition { type: 'flag'; key: string; value?: boolean }
export interface Effect { type: 'flag'; key: string; value: boolean }
export interface Rule { conditions: Condition[]; nextNodeId: string }
export interface Choice {
  id: string; label: string; keywords: string[]; effects: Effect[];
  conditions?: Condition[]; nextNodeId: string; nextNodeRules?: Rule[]; feedback?: string;
}
export interface StoryNode {
  id: string; chapter: number; title: string; content: string; choices: Choice[];
  entryEffects?: Effect[]; autoNextNodeId?: string; autoNextRules?: Rule[];
  checkpointId?: string; endingId?: string; stageEnd?: boolean;
}
export interface RouteChoice { nodeId: string; choiceId: string }
export interface Chapter {
  chapter: number; title: string; entryNodeId: string;
  prerequisiteSummary: string; canonicalPrefix: RouteChoice[];
}
export interface Story {
  id: string; contentVersion: string; entryNodeId: string;
  chapters: Chapter[]; nodes: Record<string, StoryNode>;
  endings: Record<string, { title: string; description: string }>;
}
export interface HistoryEntry {
  id: number; nodeId: string; text: string; kind: 'story' | 'choice' | 'feedback';
}
export interface ChoiceRecord extends RouteChoice { input?: string }
export interface Checkpoint {
  id: string; nodeId: string; flags: Record<string, boolean>;
  historyLength: number; choiceLength: number;
}
export interface Session {
  formatVersion: 1; projectId: string; contentVersion: string;
  mode: 'normal' | 'test'; testChapter?: number;
  currentNodeId: string; flags: Record<string, boolean>;
  history: HistoryEntry[]; choices: ChoiceRecord[]; checkpoints: Checkpoint[];
  status: 'choice' | 'ending' | 'stageEnd'; endingId?: string;
}
export type InputResult = { kind: 'matched'; choiceId: string } | { kind: 'ambiguous' | 'unmatched'; message: string };
