import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { choose, startGame } from '../src/engine/engine';
import { exportGame, importGame, loadGame, saveGame } from '../src/storage/repository';
import type { Story } from '../src/engine/types';
import { readFileSync } from 'node:fs';

const story:Story={id:'storage-test',contentVersion:'1',entryNodeId:'a',chapters:[],endings:{},nodes:{
  a:{id:'a',title:'开始',chapter:0,content:'开始',choices:[{id:'go',label:'往前',keywords:[],effects:[{type:'flag',key:'seen',value:true}],nextNodeId:'b'}],checkpointId:'cp'},
  b:{id:'b',title:'结束',chapter:0,content:'完',choices:[],stageEnd:true},
}};
describe('save boundaries',()=>{
  it('upgrades only the approved knock paragraph in an existing .1 save', async()=>{
    const current:Story=JSON.parse(readFileSync(new URL('../src/content/stage-one.json',import.meta.url),'utf8'));
    const old=readFileSync(new URL('./fixtures/before-knock-save.json',import.meta.url),'utf8');
    const result=importGame(current,old);
    expect(result.currentNodeId).toBe('CH1-01');
    expect(result.contentVersion).toBe(current.contentVersion);
    expect(result.history.filter(h=>h.nodeId==='CH1-01')[0].text).toMatch(/^门外，婶婶的敲门声/);
    expect(result.flags).toEqual(JSON.parse(old).session.flags);
    expect(result.choices).toEqual(JSON.parse(old).session.choices);
    await saveGame(current,result);
    expect(await loadGame(current)).toEqual(result);
    const altered=JSON.parse(old);
    altered.session.history.find((h:{nodeId:string})=>h.nodeId==='CH1-01').text='伪造正文';
    expect(()=>importGame(current,JSON.stringify(altered))).toThrow();
  });
  it('upgrades approved wording in .1 and .2 saves without changing choices or accepting tampered prose',async()=>{
    const current:Story=JSON.parse(readFileSync(new URL('../src/content/stage-one.json',import.meta.url),'utf8'));
    const old=JSON.parse(readFileSync(new URL('./fixtures/before-wording-save.json',import.meta.url),'utf8'));
    for (const version of ['v0.4B-stage-one.1','v0.4B-stage-one.2']) {
      const file=structuredClone(old);
      file.contentVersion=file.session.contentVersion=version;
      if (version.endsWith('.1')) {
        const opening=file.session.history.find((h:{nodeId:string})=>h.nodeId==='CH1-01');
        opening.text=opening.text.replace(/^窗外，婶婶在敲门。\n\n/,'');
      }
      const result=importGame(current,JSON.stringify(file));
      expect(result.currentNodeId).toBe('CH2-10');
      expect(result.choices).toEqual(old.session.choices);
      expect(result.flags).toEqual(old.session.flags);
      expect(result.checkpoints).toEqual(old.session.checkpoints);
      for (const id of ['CH1-02','CH2-08-DIGNITY-KNOWN']) {
        expect(result.history.find(h=>h.nodeId===id)?.text).toBe(current.nodes[id].content);
        const altered=structuredClone(file);
        altered.session.history.find((h:{nodeId:string})=>h.nodeId===id).text+='伪造正文';
        expect(()=>importGame(current,JSON.stringify(altered))).toThrow();
      }
      await saveGame(current,result);
      expect(await loadGame(current)).toEqual(result);
    }
  });
  it('upgrades the old Tang transition from .1, .2 and .3 while preserving progress',async()=>{
    const current:Story=JSON.parse(readFileSync(new URL('../src/content/stage-one.json',import.meta.url),'utf8'));
    const old=JSON.parse(readFileSync(new URL('./fixtures/before-old-tang-transition-save.json',import.meta.url),'utf8'));
    for (const version of ['v0.4B-stage-one.1','v0.4B-stage-one.2','v0.4B-stage-one.3']) {
      const file=structuredClone(old);
      file.contentVersion=file.session.contentVersion=version;
      if (version!== 'v0.4B-stage-one.3') {
        const letter=file.session.history.find((h:{nodeId:string})=>h.nodeId==='CH1-02');
        letter.text=letter.text.replace('而是：现在的骗子','你第一反应是：现在的骗子');
      }
      if (version.endsWith('.1')) {
        const opening=file.session.history.find((h:{nodeId:string})=>h.nodeId==='CH1-01');
        opening.text=opening.text.replace(/^窗外，婶婶在敲门。\n\n/,'');
      }
      const result=importGame(current,JSON.stringify(file));
      expect(result.currentNodeId).toBe('CH1-04');
      expect(result.flags).toEqual(old.session.flags);
      expect(result.choices).toEqual(old.session.choices);
      expect(result.checkpoints).toEqual(old.session.checkpoints);
      expect(result.history.find(h=>h.nodeId==='CH1-03-OLDTANG')?.text).toBe(current.nodes['CH1-03-OLDTANG'].content);
      await saveGame(current,result);
      expect(await loadGame(current)).toEqual(result);
      file.session.history.find((h:{nodeId:string})=>h.nodeId==='CH1-03-OLDTANG').text+='伪造正文';
      expect(()=>importGame(current,JSON.stringify(file))).toThrow();
    }
  });
  it('upgrades .4 story and choice feedback together without changing checkpoints',async()=>{
    const current:Story=JSON.parse(readFileSync(new URL('../src/content/stage-one.json',import.meta.url),'utf8'));
    const old=JSON.parse(readFileSync(new URL('./fixtures/before-final-comments-save.json',import.meta.url),'utf8'));
    const result=importGame(current,JSON.stringify(old));
    expect(result.flags).toEqual(old.session.flags);
    expect(result.choices).toEqual(old.session.choices);
    expect(result.checkpoints).toEqual(old.session.checkpoints);
    expect(result.history).toHaveLength(old.session.history.length);
    expect(result.history.find(h=>h.kind==='feedback' && h.nodeId==='CH1-07-UNKNOWN')?.text.split('\n\n')).toHaveLength(3);
    expect(result.history.find(h=>h.nodeId==='CH2-08-DIGNITY-KNOWN')?.text).toContain('别拉我来凑数');
    await saveGame(current,result);
    expect(await loadGame(current)).toEqual(result);
    old.session.history.find((h:{kind:string;nodeId:string})=>h.kind==='feedback' && h.nodeId==='CH1-07-UNKNOWN').text+='伪造';
    expect(()=>importGame(current,JSON.stringify(old))).toThrow();
  });
  it('validates a chapter-two terminal save before continuing into chapter three',async()=>{
    const current:Story=JSON.parse(readFileSync(new URL('../src/content/stage-one.json',import.meta.url),'utf8'));
    const old=JSON.parse(readFileSync(new URL('./fixtures/before-chapters-three-five-save.json',import.meta.url),'utf8'));
    const result=importGame(current,JSON.stringify(old));
    expect(result.currentNodeId).toBe('CH3-02');
    expect(result.status).toBe('choice');
    expect(result.choices).toEqual(old.session.choices);
    expect(result.history.filter(h=>h.kind==='story').slice(-3).map(h=>h.nodeId)).toEqual(['CH2-12','CH3-01','CH3-02']);
    expect(result.flags.arrivedChicago).toBe(true);
    expect(result.flags.learnedAboutFriggaRounds).not.toBe(true);
    expect(result.checkpoints.map(c=>c.id)).toEqual(old.session.checkpoints.map((c:{id:string})=>c.id));
    await saveGame(current,result);
    expect(await loadGame(current)).toEqual(result);
    old.session.flags.learnedAboutFriggaRounds=true;
    expect(()=>importGame(current,JSON.stringify(old))).toThrow();
  });
  it('upgrades the approved Fingel prose while rejecting altered old history',async()=>{
    const current:Story=JSON.parse(readFileSync(new URL('../src/content/stage-one.json',import.meta.url),'utf8'));
    const previous:Story=structuredClone(current);
    previous.contentVersion='v0.5D-stage-two.1';
    previous.nodes['CH3-03'].content=previous.nodes['CH3-03'].content.replace("芬格尔把那张五美元抻平，郑重地放在膝盖上。\n\n芬格尔：师弟，你出二十，我出五，咱们先凑着等车。至于你那个三明治……能不能分师兄一半？我也不白吃，看行李、认路，进了学院还能告诉你哪些坑千万别踩。\n\n你：都是你踩过的？\n\n芬格尔：八年。总不能一点收获都没有吧。\n\n他说得很坦然，目光却又往三明治上飘了一下。\n\n你低头看了看手里的午饭。刚才它还只是个三明治，现在已经有人愿意拿八年的大学经验来换半个了。","芬格尔：师弟，商量一下。你的食物分我一半，我们把二十五美元合在一起撑到列车来；我负责看行李、找插座和提供八年级生存情报。\n\n你终于明白，这二十五美元不是系统自动合并的队伍资产，而是一个饿了两天的人正在向你发起合伙申请。");
    let state=startGame(previous);
    for(const step of previous.chapters[3].canonicalPrefix) state=choose(previous,state,step.nodeId,step.choiceId);
    state=choose(previous,state,'CH3-02','ch3-02-verify');
    const file=JSON.parse(exportGame(previous,state));
    expect(state.history.find(h=>h.nodeId==='CH3-03')?.text).toContain('合伙申请');
    const upgraded=importGame(current,JSON.stringify(file));
    expect(upgraded.history.find(h=>h.nodeId==='CH3-03')?.text).toContain('八年的大学经验来换半个');
    expect(upgraded.choices).toEqual(state.choices);
    expect(upgraded.flags).toEqual(state.flags);
    expect(upgraded.checkpoints).toEqual(state.checkpoints);
    await saveGame(current,upgraded);
    expect(await loadGame(current)).toEqual(upgraded);
    file.session.history.find((h:{nodeId:string})=>h.nodeId==='CH3-03').text+='伪造';
    expect(()=>importGame(current,JSON.stringify(file))).toThrow();
  });
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
