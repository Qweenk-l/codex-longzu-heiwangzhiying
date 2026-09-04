import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import rawStory from '../src/content/stage-one.json' with { type: 'json' };
import type { Session, Story } from '../src/engine/types';
import { availableChoices, choose, restoreCheckpoint, startGame } from '../src/engine/engine';
const story = rawStory as Story;
async function clickChoice(page: Page, state: Session, id?: string): Promise<Session> {
  const choice = availableChoices(story, state).find(c => c.id === id) ?? availableChoices(story, state)[0];
  expect(choice).toBeTruthy();
  await page.getByRole('region', {name:'行动区',exact:true}).getByRole('button',{name:choice.label,exact:true}).click();
  const next = choose(story, state, state.currentNodeId, choice.id);
  await expect(page.locator('.statusbar')).toContainText('已自动保存');
  if(next.status==='choice') await expect(page.locator('.choice-button').first()).toHaveText(availableChoices(story,next)[0].label);
  return next;
}
async function geometry(page:Page) {
  return page.evaluate(()=>{
    const body=document.querySelector('.story-region') as HTMLElement;
    const actions=document.querySelector('.action-region') as HTMLElement;
    return {body:body.getBoundingClientRect().height,actions:actions.getBoundingClientRect().height,
      windowScroll:window.scrollY, width:document.documentElement.scrollWidth, viewport:window.innerWidth,
      bodyTop:body.scrollTop, actionTop:actions.scrollTop};
  });
}
async function assertSplit(page:Page) {
  const g=await geometry(page);
  expect(Math.abs(g.body/(g.body+g.actions)-.7)).toBeLessThan(.005);
  expect(g.windowScroll).toBe(0); expect(g.width).toBeLessThanOrEqual(g.viewport);
  return g;
}
test('fixed reading areas, safe free input, saved progress and isolated chapter tests',async({page},info)=>{
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/'); await page.getByRole('button',{name:'开始游戏',exact:true}).click();
  await expect(page.locator('.story-region')).toContainText('这不是你的梦');
  const initial=await assertSplit(page);
  await page.locator('.story-region').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  let g=await geometry(page); expect(g.bodyTop).toBeGreaterThan(0); expect(g.actionTop).toBe(0);
  await page.locator('.action-region').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const after=await geometry(page); expect(after.bodyTop).toBe(g.bodyTop); expect(after.actions).toBe(initial.actions);
  await page.getByRole('button',{name:'用文字表达行动'}).click();
  await page.getByLabel('你想怎么做？').fill('买一艘宇宙飞船');
  await page.getByRole('button',{name:'提交行动',exact:true}).click();
  await expect(page.locator('.input-feedback')).toContainText('没有匹配');
  await expect(page.locator('.choice-button')).toHaveCount(3);
  await page.getByRole('button',{name:'收起文字输入'}).click();
  let state=startGame(story); state=await clickChoice(page,state,'remember-name');
  await page.reload(); await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  await expect(page.locator('.choice-button').first()).toHaveText(availableChoices(story,state)[0].label);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('radio',{name:'20 px',exact:true}).check();
  await page.getByRole('radio',{name:'深色',exact:true}).check();
  await page.getByRole('dialog',{name:'阅读设置'}).getByRole('button',{name:'关闭',exact:true}).click();
  await assertSplit(page); await expect(page.locator('.story-region')).toHaveCSS('font-size','20px');
  await expect(page.locator('.choice-button').first()).toHaveCSS('background-color','rgb(36, 40, 38)');
  await page.screenshot({path:info.outputPath('reading-dark-20px.png'),fullPage:true});
  await page.getByRole('button',{name:'目录',exact:true}).click();
  await page.getByRole('button',{name:story.chapters[2].title,exact:true}).click();
  await expect(page.locator('.test-context')).toContainText('叔叔联系教授');
  await expect(page.locator('.statusbar')).toContainText('测试进度不写入正式存档');
  await page.locator('.choice-button').first().click();
  await page.getByRole('button',{name:'目录',exact:true}).click();
  await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  await expect(page.locator('.choice-button').first()).toHaveText(availableChoices(story,state)[0].label);
  expect(errors).toEqual([]);
});

test('each choice opens a complete new page, history is read-only and survives reload',async({page},info)=>{
  await page.goto('/'); await page.getByRole('button',{name:'开始游戏',exact:true}).click();
  let state=startGame(story);
  const firstPage=await page.locator('.story-region .history-entry').allTextContents();
  await page.locator('.story-region').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  state=await clickChoice(page,state,'remember-name');
  await expect(page.locator('.story-region')).not.toContainText('这不是你的梦');
  await expect(page.locator('.story-region')).toContainText(story.nodes['PRO-03'].content.split('\n')[0]);
  await expect(page.locator('.story-region')).toContainText(story.nodes['CH1-01'].content.split('\n')[0]);
  expect((await geometry(page)).bodyTop).toBe(0);
  const label=availableChoices(story,state)[0].label;
  const mergedPage=await page.locator('.story-region .history-entry').allTextContents();
  await page.locator('.story-region').evaluate(el=>{el.scrollTop=100;});
  const prior=await geometry(page);
  await page.getByRole('button',{name:'剧情记录',exact:true}).click();
  const records=page.getByRole('dialog',{name:'剧情记录',exact:true});
  expect(await records.locator('.history-entry').allTextContents()).toEqual(firstPage);
  await records.getByRole('button',{name:'下一段',exact:true}).click();
  await expect(records).toContainText('当前页');
  expect(await records.locator('.history-entry').allTextContents()).toEqual(mergedPage);
  await records.getByRole('button',{name:'关闭记录'}).click();
  expect((await geometry(page)).bodyTop).toBe(prior.bodyTop);
  await expect(page.locator('.choice-button').first()).toHaveText(label);
  await page.reload(); await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  expect(await page.locator('.story-region .history-entry').allTextContents()).toEqual(mergedPage);
  expect((await geometry(page)).bodyTop).toBe(0);
  await expect(page.getByRole('button',{name:'继续',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('merged-reading-page.png'),fullPage:true});
  await page.setViewportSize({width:375,height:430});
  await page.getByRole('button',{name:'用文字表达行动'}).click();
  await page.getByLabel('你想怎么做？').fill('不知道');
  await assertSplit(page);
  const rect=await page.getByLabel('你想怎么做？').boundingBox();
  expect(rect!.y).toBeGreaterThan(0);
  expect(rect!.y+rect!.height).toBeLessThanOrEqual(430);
});

test('temporary ending, rollback, approved known-confession variant, stage boundary and import',async({page},info)=>{
  await page.goto('/'); await page.getByRole('button',{name:'开始游戏',exact:true}).click();
  let state=startGame(story);
  for(const step of story.chapters[2].canonicalPrefix) state=await clickChoice(page,state,step.choiceId);
  while(state.currentNodeId!=='CH2-06') state=await clickChoice(page,state);
  state=await clickChoice(page,state,'confront-setup');
  state=await clickChoice(page,state,'accept-letter');
  await expect(page.locator('.story-region')).toContainText('你明知道这是赵孟华准备的告白，却还是站在了这里');
  while(state.currentNodeId!=='CH2-11') state=await clickChoice(page,state);
  const before=await assertSplit(page); await expect(page.locator('.choice-button')).toHaveCount(4);
  const decline=availableChoices(story,state).find(c=>/decline/.test(c.id)); expect(decline).toBeTruthy();
  state=await clickChoice(page,state,decline!.id);
  await expect(page.locator('.action-region')).toContainText('这条路线暂时结束');
  expect((await assertSplit(page)).actions).toBe(before.actions);
  await page.getByRole('button',{name:'回到第二章决策前'}).click();
  await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'回到这个检查点？'})}).getByRole('button',{name:'确认',exact:true}).click();
  state=restoreCheckpoint(story,state,'CP-CH2-DECISION');
  await expect(page.locator('.choice-button')).toHaveCount(4);
  state=await clickChoice(page,state);
  await expect(page.locator('.action-region')).toContainText('已到达第二章试玩终点');
  await expect(page.locator('.story-region')).toContainText('几个小时前，你还困在那场告白的喧闹里');
  await assertSplit(page); await page.screenshot({path:info.outputPath('stage-end.png'),fullPage:true});
  await page.getByRole('button',{name:'目录',exact:true}).click();
  const downloadPromise=page.waitForEvent('download'); await page.getByRole('button',{name:'导出正式存档'}).click();
  const download=await downloadPromise; const saved=await readFile((await download.path())!,'utf8');
  expect(JSON.parse(saved).session.currentNodeId).toBe('CH2-12');
  await page.locator('input[type=file]').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.getByRole('alert')).toContainText('无法读取存档文件');
  await page.locator('input[type=file]').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(saved)});
  await expect(page.getByRole('dialog',{name:'导入这份正式存档？'})).toBeVisible();
  await page.getByRole('dialog',{name:'导入这份正式存档？'}).getByRole('button',{name:'确认',exact:true}).click();
  await expect(page.locator('.action-region')).toContainText('已到达第二章试玩终点');
});
