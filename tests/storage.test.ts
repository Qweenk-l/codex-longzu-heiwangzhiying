import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { choose, startGame } from '../src/engine/engine';
import { exportGame, importGame, loadGame, saveGame } from '../src/storage/repository';
import type { Story } from '../src/engine/types';

const story:Story={id:'storage-test',contentVersion:'1',entryNodeId:'a',chapters:[],endings:{},nodes:{
  a:{id:'a',title:'开始',chapter:0,content:'开始',choices:[{id:'go',label:'往前',keywords:[],effects:[{type:'flag',key:'seen',value:true}],nextNodeId:'b'}],checkpointId:'cp'},
  b:{id:'b',title:'结束',chapter:0,content:'完',choices:[],stageEnd:true},
}};
describe('save boundaries',()=>{
  it('round trips through actual IndexedDB API with replay validation',async()=>{
    const state=choose(story,startGame(story),'a','go');
    await saveGame(story,state);
    expect(await loadGame(story)).toEqual(state);
    expect(importGame(story,exportGame(story,state))).toEqual(state);
  });
  it('rejects modified state, versions and invalid choices without replacing a good save',async()=>{
    const state=startGame(story); await saveGame(story,state);
    const bad=JSON.parse(exportGame(story,state)); bad.session.flags.seen=true;
    expect(()=>importGame(story,JSON.stringify(bad))).toThrow();
    bad.session.flags={}; bad.contentVersion='old';
    expect(()=>importGame(story,JSON.stringify(bad))).toThrow(/版本/);
    expect(()=>importGame(story,'{oops')).toThrow();
    expect(await loadGame(story)).toEqual(state);
  });
  it('does not persist or export chapter-test progress',async()=>{
    const test={...startGame(story),mode:'test' as const,testChapter:0};
    await expect(saveGame(story,test)).rejects.toThrow(/测试/);
    expect(()=>exportGame(story,test)).toThrow(/测试/);
  });
});
