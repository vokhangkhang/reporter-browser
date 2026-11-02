import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {loadConfig,localPath} from './lib/config.mjs';
const config=await loadConfig();

const origin=new URL(config.pm.origin).origin;
const output=localPath(config.report.pmSnapshot);
const result={collectedAt:new Date().toISOString(),method:'Playwright rendered UI only; no direct API calls',project:config.pm.project,origin,assignee:config.pm.assignee,pointField:config.pm.pointField,complete:false,sprints:[],tasks:[],errors:[]};
let browser;
const owned=[];
// Serialize writes from detail-reader tabs so a shorter JSON cannot race a longer one.
let pendingSave=Promise.resolve();
const save=()=>{
  const json=JSON.stringify(result,null,2);
  pendingSave=pendingSave.then(async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,json);});
  return pendingSave;
};
try {
  await save();
  browser=await chromium.connectOverCDP(config.chrome.cdpUrl,{timeout:20000});
  const context=browser.contexts()[0];
  if(!context)throw new Error('Chrome has no browser context.');
  const board=await context.newPage();owned.push(board);
  for(const sprint of config.pm.sprints) {
    const number=sprint.slug;
    await board.goto(`${origin}/project/${config.pm.project}/taskboard/${sprint.slug}`,{waitUntil:'domcontentloaded',timeout:45000});
    await board.waitForFunction(()=>{
      const text=document.body.innerText;
      const open=text.match(/(\d+)\s*\nopen\s*\ntasks/i),closed=text.match(/(\d+)\s*\nclosed\s*\ntasks/i);
      if(!open||!closed)return false;
      const refs=[...document.querySelectorAll('tg-card[type="task"] .card-ref')].filter(e=>/^#\d+$/.test(e.textContent.trim()));
      return refs.length===Number(open[1])+Number(closed[1]);
    },undefined,{timeout:60000});
    const snapshot=await board.evaluate(()=>{
      const headings=[...document.querySelectorAll('h2.task-colum-name[title]')];
      const statuses=Object.fromEntries(headings.map(h=>[h.className.match(/squish-status-\d+/)?.[0],h.title]));
      const text=document.body.innerText;
      return {name:document.querySelector('h1')?.innerText,url:location.href,
        openTasks:Number(text.match(/(\d+)\s*\nopen\s*\ntasks/i)[1]),closedTasks:Number(text.match(/(\d+)\s*\nclosed\s*\ntasks/i)[1]),
        cards:[...document.querySelectorAll('tg-card[type="task"]')].map(c=>({
          ref:c.querySelector('.card-ref')?.textContent.trim(),subject:c.querySelector('.card-subject')?.textContent.trim(),
          assignees:[...c.querySelectorAll('.card-user-avatar img')].map(img=>img.alt),
          status:statuses[c.closest('.taskboard-column')?.className.match(/squish-status-\d+/)?.[0]]??null,
        }))};
    });
    if(!snapshot.name || !(snapshot.name.trim()===sprint.name || snapshot.name.trim().startsWith(sprint.name+' ')))throw new Error(`Wrong sprint page for Sprint ${number}.`);
    if(new Set(snapshot.cards.map(c=>c.ref)).size!==snapshot.cards.length)throw new Error(`Sprint ${number}: duplicate task cards.`);
    if(snapshot.cards.some(c=>!/^#\d+$/.test(c.ref)||!c.status))throw new Error(`Sprint ${number}: invalid ref or unknown status.`);
    snapshot.number=number; snapshot.slug=sprint.slug;
    snapshot.mine=snapshot.cards.filter(c=>(result.assignee===null || c.assignees.includes(result.assignee)));
    result.sprints.push(snapshot);await save();
    console.log(`Sprint ${number}: ${snapshot.cards.length}/${snapshot.openTasks+snapshot.closedTasks} cards read; ${snapshot.mine.length} assigned to ${result.assignee}.`);
  }
  const unique=[...new Map(result.sprints.flatMap(s=>s.mine.map(t=>({...t,sprint:s.number}))).map(t=>[t.ref,t])).values()];
  if(unique.length!==result.sprints.reduce((sum,s)=>sum+s.mine.length,0))throw new Error('The same task occurs in multiple selected sprints. Refresh boards and retry.');
  let cursor=0;
  // Independent browser tabs share the existing browser login. These only read
  // pages and custom-field display text; they never click edit/save controls.
  await Promise.all(Array.from({length:3},async()=>{
    const page=await context.newPage();owned.push(page);
    while(cursor<unique.length) {
      const task=unique[cursor++];
      try {
        await page.goto(`${origin}/project/${config.pm.project}/task/${task.ref.slice(1)}`,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForFunction(pointField=>{
          const f=[...document.querySelectorAll('.custom-field-single')].find(e=>e.querySelector('.custom-field-name')?.textContent.trim()===pointField);
          return !!f?.querySelector('.custom-field-value');
        },config.pm.pointField,{timeout:20000});
        await page.waitForTimeout(350);
        await page.waitForFunction(ref=>document.title.includes(ref),task.ref,{timeout:10000});
        const detail=await page.evaluate(()=>{
          const fields=Object.fromEntries([...document.querySelectorAll('.custom-field-single')].map(e=>[e.querySelector('.custom-field-name')?.textContent.trim(),e.querySelector('.custom-field-value')?.textContent.trim()??null]));
          const text=document.body.innerText;
          return {url:location.href,title:document.title,fields,createdText:text.match(/Created by[^\n]*\n[^\n]+/)?.[0]??null,
            assignedText:text.match(/\nASSIGNED\n([\s\S]*?)(?:Add assigned|WATCHERS)/)?.[1].trim()??null};
        });
        const raw=detail.fields[config.pm.pointField];
        const point=typeof raw==='string'&&/^\d+(?:[.,]\d+)?$/.test(raw)?Number(raw.replace(',','.')):null;
        result.tasks.push({...task,...detail,point});
      }catch(error){result.errors.push({ref:task.ref,sprint:task.sprint,error:error.message.split('\nCall log:')[0]});}
      if((result.tasks.length+result.errors.length)%10===0)console.log(`Read ${result.tasks.length}/${unique.length} task details (${result.errors.length} errors).`);
      await save();
    }
  }));
  result.complete=result.errors.length===0&&result.tasks.length===unique.length;
  result.summary=result.sprints.map(s=>{
    const tasks=result.tasks.filter(t=>t.sprint===s.number);
    return {sprint:s.number,name:s.name,taskCount:s.mine.length,detailsRead:tasks.length,point:tasks.reduce((a,t)=>a+(t.point??0),0),missingPoint:tasks.filter(t=>t.point===null).map(t=>t.ref),
      byStatus:tasks.reduce((a,t)=>{a[t.status]??={tasks:0,point:0};a[t.status].tasks++;a[t.status].point+=t.point??0;return a;},{})};
  });
  await save();
  console.log(JSON.stringify({complete:result.complete,summary:result.summary,errors:result.errors,output},null,2));
  if(!result.complete)process.exitCode=1;
}catch(error){result.errors.push({error:error.message.split('\nCall log:')[0]});await save();console.error(result.errors.at(-1));process.exitCode=1;}
finally{
  // Close only tabs created by this run. Leave the user's browser and tabs open.
  for(const page of owned)await page.close().catch(()=>{});
  await browser?.close();
}
