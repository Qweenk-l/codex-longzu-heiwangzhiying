import { choose, startGame } from '../engine/engine';
import type { Session, Story } from '../engine/types';

const DATABASE = 'black-king-shadow';
const STORE = 'sessions';
const MAX_BYTES = 10 * 1024 * 1024;
interface SaveFile { formatVersion: 1; projectId: string; contentVersion: string; session: Session }

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function validate(story: Story, value: unknown): Session {
  if (!object(value) || value.projectId !== story.id) throw new Error('这不是《龙族：黑王之影》的有效存档。');
  const beforeKnockEdit = story.id === 'longzu-black-king-shadow-stage-one'
    && story.contentVersion === 'v0.4B-stage-one.2' && value.contentVersion === 'v0.4B-stage-one.1';
  if (value.formatVersion !== 1 || (value.contentVersion !== story.contentVersion && !beforeKnockEdit)) throw new Error('存档版本与当前剧情不一致，原进度已保留。');
  if (!object(value.session) || value.session.mode !== 'normal') throw new Error('章节测试不能作为正式存档。');
  let session: Record<string, unknown> = value.session;
  if (beforeKnockEdit) {
    if (session.contentVersion !== 'v0.4B-stage-one.1') throw new Error('存档版本记录不一致。');
    session = structuredClone(session);
    const currentText = story.nodes['CH1-01'].content;
    const originalText = currentText.replace(/^窗外，婶婶在敲门。\n\n/, '');
    if (Array.isArray(session.history)) {
      for (const entry of session.history) {
        if (object(entry) && entry.kind === 'story' && entry.nodeId === 'CH1-01' && entry.text === originalText) entry.text = currentText;
      }
    }
    session.contentVersion = story.contentVersion;
  }
  if (!Array.isArray(session.choices) || session.choices.length > 1000) throw new Error('存档中的选择记录无效。');
  let replay = startGame(story);
  try {
    for (const step of session.choices) {
      if (!object(step) || typeof step.nodeId !== 'string' || typeof step.choiceId !== 'string'
        || (step.input !== undefined && (typeof step.input !== 'string' || step.input.length > 500))) throw new Error();
      replay = choose(story, replay, step.nodeId, step.choiceId, step.input as string | undefined);
    }
    // Saved flags/history/checkpoints must all be explained by the actual legal choices.
    if (stable(replay) !== stable(session)) throw new Error();
  } catch {
    throw new Error('存档剧情记录不一致，未覆盖当前进度。');
  }
  return replay;
}
export function importGame(story: Story, text: string): Session {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('存档文件过大，请选择 10 MB 以内的存档。');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('无法读取存档文件，请选择导出的 JSON 存档。'); }
  return validate(story, parsed);
}
function envelope(story: Story, session: Session): SaveFile {
  return { formatVersion: 1, projectId: story.id, contentVersion: story.contentVersion, session };
}
export function exportGame(story: Story, session: Session): string {
  const file = envelope(story, session);
  validate(story, file);
  return JSON.stringify(file, null, 2);
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器无法使用本地存档。')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地存档，请检查浏览器的存储权限。'));
    request.onblocked = () => reject(new Error('存档正被其他页面占用，请关闭其他游戏页面后重试。'));
  });
}
export async function loadGame(story: Story): Promise<Session | null> {
  const db = await openDatabase();
  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(story.id);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(new Error('读取存档失败，请重试。'));
      tx.onerror = () => reject(new Error('读取存档失败，请重试。'));
    });
    return result === undefined ? null : validate(story, result);
  } finally { db.close(); }
}
export async function saveGame(story: Story, session: Session): Promise<void> {
  const file = envelope(story, session);
  validate(story, file);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, story.id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error('自动存档失败，原存档仍保留；请导出当前进度。'));
      tx.onerror = () => reject(new Error('自动存档失败，请检查存储空间或导出当前进度。'));
    });
  } finally { db.close(); }
}
