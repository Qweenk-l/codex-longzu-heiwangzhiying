import { describe, expect, it } from 'vitest';
import { availableChoices, choose, resolveInput, restoreCheckpoint, startGame, startChapterTest } from '../src/engine/engine';
import type { Story } from '../src/engine/types';

export const fixture: Story = {
  id: 'test-story', contentVersion: '1', entryNodeId: 'a',
  chapters: [{ chapter: 0, title: '序章', entryNodeId: 'a', prerequisiteSummary: '', canonicalPrefix: [] },
    { chapter: 1, title: '第一章', entryNodeId: 'c', prerequisiteSummary: '已做出选择', canonicalPrefix: [{nodeId:'a',choiceId:'go'}] }],
  endings: { stop: { title: '结束', description: '' } },
  nodes: {
    a: { id: 'a', title: '开端', chapter: 0, content: '第一段', checkpointId: 'cp-a', choices: [
      {id:'go',label:'询问老唐',keywords:['老唐','询问'],effects:[{type:'flag',key:'knows',value:true}],feedback:'知道了。',nextNodeId:'bad',nextNodeRules:[
        {conditions:[{type:'flag',key:'knows'}],nextNodeId:'b'}, {conditions:[],nextNodeId:'bad'}]},
      {id:'su',label:'询问苏晓樯',keywords:['苏晓樯','询问'],effects:[],nextNodeId:'bad'},
      {id:'hidden',label:'隐藏选项',keywords:['隐藏'],conditions:[{type:'flag',key:'secret'}],effects:[],nextNodeId:'bad'}]},
    b: {id:'b', title:'承接', chapter:0, content:'自动承接', choices:[], autoNextNodeId:'c', checkpointId:'cp-b'},
    c: {id:'c', title:'新章', chapter:1, content:'下章开始', choices:[{id:'finish',label:'结束',keywords:[],effects:[],nextNodeId:'end'}]},
    end: {id:'end',title:'结束',chapter:1,content:'结尾',choices:[],endingId:'stop',checkpointId:'must-not-replace'},
    bad: {id:'bad',title:'阶段完成',chapter:0,content:'其他路线',choices:[],stageEnd:true},
  },
};

describe('narrative engine', () => {
  it('applies choice effects before first matching rule, appends feedback and all automatic text', () => {
    const before = startGame(fixture);
    const after = choose(fixture,before,'a','go');
    expect(before.flags.knows).toBeUndefined();
    expect(after.currentNodeId).toBe('c');
    expect(after.history.map(x=>x.text)).toEqual(['第一段','询问老唐','知道了。','自动承接','下章开始']);
    expect(after.flags.knows).toBe(true);
  });
  it('blocks hidden and stale actions without mutating original state', () => {
    const state=startGame(fixture);
    expect(availableChoices(fixture,state).map(c=>c.id)).toEqual(['go','su']);
    expect(()=>choose(fixture,state,'a','hidden')).toThrow();
    expect(()=>choose(fixture,state,'old','go')).toThrow();
    expect(state.choices).toHaveLength(0);
  });
  it('restores checkpoint including flags and truncates future history and checkpoints', () => {
    const state=choose(fixture,startGame(fixture),'a','go');
    const end=choose(fixture,state,'c','finish');
    expect(end.checkpoints.map(c=>c.id)).toEqual(['cp-a','cp-b']);
    const rollback=restoreCheckpoint(fixture,end,'cp-a');
    expect(rollback).toEqual(startGame(fixture));
    expect(choose(fixture,rollback,'a','su').flags.knows).toBeUndefined();
  });
  it('restores an automatic checkpoint without appending its body twice',()=>{
    const state=choose(fixture,startGame(fixture),'a','go');
    expect(restoreCheckpoint(fixture,state,'cp-b').history).toEqual(state.history);
  });
  it('rejects automatic cycles and missing targets atomically',()=>{
    const cycle=structuredClone(fixture); cycle.nodes.b.autoNextNodeId='b';
    expect(()=>choose(cycle,startGame(cycle),'a','go')).toThrow(/循环/);
    const missing=structuredClone(fixture); missing.nodes.b.autoNextNodeId='missing';
    expect(()=>choose(missing,startGame(missing),'a','go')).toThrow(/节点/);
  });
  it('exact label wins, ambiguous and hidden or negated keywords do not execute',()=>{
    const s=startGame(fixture);
    expect(resolveInput(fixture,s,'询问老唐')).toEqual({kind:'matched',choiceId:'go'});
    expect(resolveInput(fixture,s,'询问').kind).toBe('ambiguous');
    expect(resolveInput(fixture,s,'隐藏').kind).toBe('unmatched');
    expect(resolveInput(fixture,s,'不要问老唐').kind).toBe('unmatched');
    expect(resolveInput(fixture,s,'我没打算找老唐').kind).toBe('unmatched');
    expect(resolveInput(fixture,s,'老唐和苏晓樯').kind).toBe('ambiguous');
  });
  it('chapter test replays legal prehistory and stops before next chapter',()=>{
    const test=startChapterTest(fixture,0);
    const end=choose(fixture,test,'a','go');
    expect(end.mode).toBe('test'); expect(end.currentNodeId).toBe('b'); expect(end.status).toBe('stageEnd');
    expect(end.history.some(x=>x.nodeId==='c')).toBe(false);
    const chapter1=startChapterTest(fixture,1);
    expect(chapter1.currentNodeId).toBe('c'); expect(chapter1.flags.knows).toBe(true);
    expect(chapter1.mode).toBe('test');
  });
});
