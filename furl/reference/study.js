/* Shared projection renderer. Each mount owns its controls and call focus. */
function mountFurlStudy(root, initialStudy) {
 const program=root.querySelector('[data-ui="program"]');
 const state={study:'lets',comb:true,bindings:true,expressions:true,values:true,indentation:true,parameterMark:true,grid:false,rowHeight:22,blockEdge:true,patternBlock:false,nameAtTop:true,extendParameter:false,sharedStem:true,helperVersion:'before',samples:{matches:'some',combined:'some',recursion:'c0'},open:{}};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const {studies,helperBefore,helperAfter,callFrames,callById}=createFurlFixtures();
 const index=new Map();
 function stamp(n,path){if(!n.id)n.id=path;if(n.defs)n.defs.forEach((d,i)=>stamp(d.exp,n.id+'.binding.'+i));if(n.out)stamp(n.out,n.id+'.tail');if(n.branches)n.branches.forEach((b,i)=>{b.id=n.id+'.branch.'+i;b.defs.forEach((d,j)=>stamp(d.exp,b.id+'.binding.'+j));stamp(b.out,b.id+'.tail');});}
 [...Object.values(studies).map(s=>s.node),helperAfter].forEach((n,i)=>stamp(n,'study.'+i));
 function visit(n,fn){if(n.kind==='atom')return;fn(n);if(n.defs)n.defs.forEach(d=>visit(d.exp,fn));if(n.out)visit(n.out,fn);if(n.branches)n.branches.forEach(b=>{b.defs.forEach(d=>visit(d.exp,fn));visit(b.out,fn);});}
 [...Object.values(studies).map(s=>s.node),helperAfter].forEach(n=>visit(n,k=>{index.set(k.id,k);state.open[k.id]=true;}));
 function current(){return state.study==='helper'?{...studies.helper,node:state.helperVersion==='before'?helperBefore:helperAfter}:studies[state.study];}
 let renderSample='';
 function sample(){return renderSample||state.samples[state.study]||'default';}
 function val(v,active=true){if(!active)return '';if(state.study==='traces'&&!renderSample)return ['some','none'].map(k=>typeof v==='object'&&v!==null?(v[k]||''):String(v??''));return typeof v==='object'&&v!==null?(v[sample()]||''):String(v??'');}
 function atomText(n){if(n.id==='match-input')return sample()==='none'?'None':'Some 7';if(n.id==='format-call')return sample()==='none'?'format "px" None':'format "px" (Some 7)';return n.text;}
 function selectedBranch(b){return state.study==='traces'&&!renderSample?true:Array.isArray(b.active)?b.active.includes(sample()):b.active===sample();}
 function result(n,active=true){if(!active)return '';if(n.kind==='atom')return val(n.v);if(n.kind==='fun')return 'fn';if(n.kind==='match'){if(state.study==='traces'&&!renderSample)return n.branches.map(b=>{renderSample=b.active;const r=result(b.out,true);renderSample='';return r;});const b=n.branches.find(selectedBranch);return b?result(b.out,true):'';}return result(n.out,true);}
 function sourceBody(defs,out){
  let lines=[];
  for(const d of defs){const e=source(d.exp),prefix=d.recursive?'let rec ':'let ';if(e.length===1)lines.push(prefix+d.name+' = '+e[0]+' in');else{lines.push(prefix+d.name+' =');lines.push(...e.map(l=>'  '+l));lines.push('in');}}
  return lines.concat(source(out));
 }
 function source(n){
  if(n.kind==='atom')return [atomText(n)];
  if(n.kind==='fun')return ['fun '+n.params.map(p=>p.name).join(' ')+' ->',...sourceBody(n.defs,n.out).map(l=>'  '+l)];
  if(n.kind==='let')return sourceBody(n.defs,n.out);
  const lines=['match '+n.scrut+' with'];
  n.branches.forEach(b=>{lines.push('| '+b.pat+' ->');lines.push(...sourceBody(b.defs,b.out).map(l=>'  '+l));});
  return lines;
 }
 function colorCode(text){return esc(text).replace(/\b(let|in|fun|match|with|rec)\b/g,'<span class="kw">$1</span>');}
 let ch=8.4,row=22,available=100,layout;
 // Syntax identity, branch placement, and call identity are independent of paint.
 // All rows consume this one plan; no row chooses its own column widths.
 const laneSpans=new WeakMap();
 function spanOf(n){if(laneSpans.has(n))return laneSpans.get(n);let span=1;if(n.kind==='match')span=n.branches.reduce((s,b)=>s+bodySpan(b),0);else if(n.kind!=='atom')span=Math.max(1,...n.defs.map(d=>spanOf(d.exp)),spanOf(n.out));laneSpans.set(n,span);return span;}
 function bodySpan(b){return Math.max(1,...b.defs.map(d=>spanOf(d.exp)),spanOf(b.out));}
 function patternRequirement(n,name,depth=0,arity=0){
  let width=name.length+depth+(arity?1+arity:0);if(n.kind==='atom')return width;
  if(n.kind==='match'){for(const b of n.branches){width=Math.max(width,b.pat.length+depth+1,...b.defs.map(d=>patternRequirement(d.exp,d.name,depth+1)),patternRequirement(b.out,name,depth,arity));}return width;}
  const childDepth=n===current().node?depth:depth+1;
  return Math.max(width,...(n.params||[]).map(p=>p.name.length+childDepth),...n.defs.map(d=>patternRequirement(d.exp,d.name,childDepth)),patternRequirement(n.out,name,depth,n.kind==='fun'?n.params.length:arity));
 }
 function makeLayout(n){
  const placements=new WeakMap();
  function place(node,lane){placements.set(node,{lane,span:spanOf(node)});if(node.kind==='match'){let next=lane;for(const b of node.branches){const p={lane:next,span:bodySpan(b)};placements.set(b,p);b.defs.forEach(d=>place(d.exp,next));place(b.out,next);next+=p.span;}}else if(node.kind!=='atom'){node.defs.forEach(d=>place(d.exp,lane));place(node.out,lane);}}
  place(n,0);
  const count=[state.bindings,state.expressions,state.values].filter(Boolean).length;
  const logicalLanes=spanOf(n),gap=5,minimum=count===3?34:count===2?24:16;
  const stacked=logicalLanes>1&&available<logicalLanes*minimum+(logicalLanes-1)*gap;
  const paintLanes=stacked?1:logicalLanes,budget=Math.floor((available-gap*(paintLanes-1))/paintLanes);
  const space=budget-2*Math.max(0,count-1);
  const requiredName=patternRequirement(n,current().name);
  let nw=state.bindings?Math.min(14,Math.max(6,requiredName,Math.floor(space*.28))):0;
  let vw=state.values?Math.min(14,Math.max(6,Math.floor(space*.27))):0;
  let ew=state.expressions?Math.min(34,Math.max(4,space-nw-vw)):0;
  if(count===1){if(state.bindings)nw=Math.min(14,space);if(state.expressions)ew=Math.min(76,space);if(state.values)vw=Math.min(28,space);}
  const columns={};let cursor=0;
  for(const [role,width] of [['name',nw],['expression',ew],['value',vw]])if(width){columns[role]={offset:cursor,width};cursor+=width+2;}
  const laneWidth=count?cursor-2:Math.min(22,budget);
  return {placements,columns,stacked,logicalLanes,paintLanes,laneWidth,gap,pitch:laneWidth+gap,total:paintLanes*laneWidth+(paintLanes-1)*gap};
 }
 function regionWidth(pos){return layout.stacked?layout.laneWidth:pos.span*layout.laneWidth+(pos.span-1)*layout.gap;}
 function paintLane(lane){return layout.stacked?0:lane;}
 function traceLane(key){
  function seek(n){if(n.kind==='match'){const b=n.branches.find(b=>Array.isArray(b.active)?b.active.includes(key):b.active===key);if(b)return layout.placements.get(b).lane;}if(n.kind!=='atom'){for(const d of n.defs||[]){const found=seek(d.exp);if(found!==null)return found;}if(n.out)return seek(n.out);}return null;}
  return seek(current().node)??0;
 }
 function valueHTML(value,options){let html=value==='fn'||value==='<function>'?'<span class="fn-value" aria-label="function value">fn</span>':esc(value);if(options.stepInto&&value!=='')html='<button class="sample-link" type="button" data-call="'+options.stepInto+'" data-tooltip="Step into sum '+esc(callById.get(options.stepInto).args)+'" aria-label="Step into sum '+esc(callById.get(options.stepInto).args)+'">'+html+'</button>';return html;}
 function line(name,exp,value,depth,pos,options={}){
  const classes=['line',options.terminal?'return':'',options.pattern?'pattern':'',options.raw?'raw':'',options.raw&&state.patternBlock?'pattern-block':'',options.outside?'outside-focus':''].filter(Boolean).join(' ');
  const slot=(role,lane=pos.lane)=>{const c=layout.columns[role],start=(paintLane(lane)-paintLane(pos.lane))*layout.pitch+c.offset;return ' data-role="'+role+'" data-lane="'+lane+'" data-column="'+(paintLane(lane)*layout.pitch+c.offset)+'" style="grid-column:1;width:'+c.width+'ch;margin-left:'+start+'ch"';};
  const nameHTML=esc(name)+(options.arity?' <span class="arity">'+'·'.repeat(options.arity)+'</span>':'');
  let fields='';
  if(state.bindings)fields+='<div class="field name'+(options.echoName?' echo':'')+'"'+slot('name')+(options.echoName?' data-tooltip="Same result binding, repeated across branches"':'')+'><span>'+nameHTML+'</span></div>';
  if(state.expressions)fields+='<pre class="field expression'+(options.echoExpression?' echo':'')+'"'+slot('expression')+(options.echoExpression?' data-tooltip="Same match input, repeated across branches"':'')+'>'+(exp===null?'<span class="dot" aria-label="function parameter">·</span>':colorCode(exp))+'</pre>';
  if(state.values){
   const entries=Array.isArray(value)?value.map((v,i)=>({value:v,key:i?'none':'some',lane:traceLane(i?'none':'some')})):[{value,key:sample(),lane:pos.span>1?traceLane(sample()):pos.lane}];
   const groups=new Map();for(const entry of entries){const key=paintLane(entry.lane);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);}
   for(const group of groups.values())fields+='<div class="field value"'+slot('value',group[0].lane)+'><span class="trace-values">'+group.map(e=>'<span data-trace="'+e.key+'">'+valueHTML(e.value,options)+'</span>').join('')+'</span></div>';
  }
  const minLines=options.raw&&state.expressions?Math.max(1,String(exp).split('\n').length):1;
  const blockWidth=state.bindings?Math.max(1,Math.min(name.length,layout.columns.name.width-(state.indentation?depth:0))):0;
  const decoration=(state.bindings?'<div class="indent-strip" aria-hidden="true"></div>':'')+(options.raw&&state.patternBlock&&state.bindings&&state.expressions?'<div class="name-block" aria-hidden="true" style="--name-block-width:'+blockWidth+'ch"></div>':'');
  return '<div class="'+classes+'" data-node="'+esc(options.nodeId||'')+'" data-band-lane="'+pos.lane+'" style="--depth:'+depth+';--grid-chars:'+regionWidth(pos)+';min-height:calc('+minLines+' * var(--row))"'+(options.param?' data-parameter="true"':'')+(options.outside?' data-tooltip="This outer call is outside the focused recursive call"':'')+'>'+decoration+'<div class="fields">'+fields+'</div></div>';
 }
 const frames=[];
 function renderNode(n,name,depth,pos,active=true,terminal=false,arity=0,laneBase=0,railLevel=0,echoName=false){
  const outside=(n.id==='run-answer'||n.id==='recursion-root')&&sample()!=='c0';
  const stepInto=n.id==='recursive-step'&&active?callById.get(sample())?.child:null;
  if(n.kind==='atom')return line(name,atomText(n),val(n.v,active&&!outside),depth,pos,{nodeId:n.id,terminal,arity,echoName,outside,stepInto});
  const expanded=state.open[n.id];
  frames.push({n,name,depth,laneBase,expanded,railLevel});
  const attrs=' class="scope" data-scope="'+n.id+'" data-kind="'+n.kind+'" data-expanded="'+expanded+'" data-depth="'+depth+'" data-lane-base="'+laneBase+'"';
  if(!expanded)return '<div'+attrs+'>'+line(name,source(n).join('\n'),result(n,active&&!outside),depth,pos,{nodeId:n.id,terminal,arity,raw:true,echoName,outside})+'</div>';
  if(n.kind==='match'){
   const stacked=layout.stacked;
   const branches=n.branches.map((b,i)=>{
    const savedSample=renderSample;if(state.study==='traces')renderSample=b.active;
    const on=active&&selectedBranch(b),bp=layout.placements.get(b),bd=depth+1;
    const branchRailBase=stacked?laneBase:railLevel;
    const defs=b.defs.map(d=>renderNode(d.exp,d.name,bd,bp,on,false,0,branchRailBase,railLevel+1)).join('');
    const html='<div class="branch" data-branch="'+i+'" data-branch-lane="'+bp.lane+'"'+(state.study==='traces'?' data-trace="'+b.active+'"':'')+'><div class="branch-content">'+line(b.pat,n.scrut,val(b.matched,on),bd,bp,{nodeId:b.id+'.pattern',pattern:true,echoExpression:i>0})+defs+'</div><div class="branch-fill">'+(state.bindings?'<div class="indent-strip" style="--depth:'+bd+'" aria-hidden="true"></div>':'')+'</div><div class="tail">'+renderNode(b.out,name,depth,bp,on,true,arity,branchRailBase,railLevel+1,i>0)+'</div></div>';
    renderSample=savedSample;return html;
   }).join('');
   const columns=stacked?layout.laneWidth+'ch':n.branches.map(b=>regionWidth(layout.placements.get(b))+'ch').join(' ');
   return '<div'+attrs+'><div class="branches '+(stacked?'stacked':'')+'" style="grid-template-columns:'+columns+'" data-match="'+n.id+'">'+branches+'</div></div>';
  }
  const childDepth=n.id===current().node.id?depth:depth+1;
  let content='';
  if(n.kind==='fun')content+='<div class="parameters">'+n.params.map((p,i)=>line(p.name,null,val(p.v,active),childDepth,pos,{nodeId:n.id+'.parameter.'+i,param:true})).join('')+'</div>';
  content+=n.defs.map(d=>renderNode(d.exp,d.name,childDepth,pos,active,false,0,laneBase,railLevel+1)).join('');
  content+=renderNode(n.out,name,depth,pos,active,true,n.kind==='fun'?n.params.length:arity,laneBase,railLevel+1);
  return '<div'+attrs+'>'+content+'</div>';
 }
 function getDimensions(){
  const measure=document.createElement('span');measure.textContent='0000000000';measure.style.cssText='position:absolute;visibility:hidden;white-space:pre;';program.appendChild(measure);ch=measure.getBoundingClientRect().width/10;measure.remove();
  const cs=getComputedStyle(program);row=parseFloat(cs.lineHeight);available=Math.floor((program.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight))/ch);
 }
 let drawQueued=false;
 function queueDraw(){if(drawQueued)return;drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;drawCombs();});}
 function drawCombs(){
  program.querySelectorAll('.comb-layer,.rail').forEach(el=>el.remove());
  const pr=program.getBoundingClientRect(),pitch=ch;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('comb-layer');svg.setAttribute('width',String(pr.width));svg.setAttribute('height',String(pr.height));svg.setAttribute('aria-hidden','true');
  let drawingScope='';
  const path=(d,kind,part='')=>{const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);p.setAttribute('class',kind==='match'?'case-path':kind==='block'?'block-path':kind==='divider'?'divider-path':'scope-path');p.dataset.scope=drawingScope;p.dataset.part=part;svg.appendChild(p);};
  if(state.blockEdge&&state.expressions){
   for(const field of program.querySelectorAll('.expression')){
    const r=field.getBoundingClientRect();if(r.height<row*1.5)continue;
    const bx=r.left-pr.left-ch,by=r.top-pr.top,be=r.bottom-pr.top;
    path('M '+(bx+ch*.5)+' '+by+' H '+bx+' V '+be,'block');
   }
  }
  if(!state.comb){program.appendChild(svg);return;}
  const scopeX=(element,f)=>element.getBoundingClientRect().left-pr.left-4*ch+(f.railLevel-f.laneBase)*pitch;
  for(const frame of frames){
   drawingScope=frame.n.id;
   const el=program.querySelector('[data-scope="'+frame.n.id+'"]');if(!el)continue;
   const r=el.getBoundingClientRect();
   const relDepth=frame.railLevel-frame.laneBase;
   const x=scopeX(el,frame);
   const y=r.top-pr.top,end=r.bottom-pr.top;
   let buttonX=x-pitch*.5,buttonY=y,buttonHeight=Math.max(row,end-y),buttonWidth=pitch;
   if(frame.expanded){
    if(frame.n.kind==='match'){
     const group=el.querySelector(':scope > .branches');const bs=[...group.children];
     const stacked=group.classList.contains('stacked');
     const parent=el.parentElement.closest('.scope');
     const parentFrame=parent&&frames.find(f=>f.n.id===parent.dataset.scope);
     const shared=state.sharedStem&&parentFrame;
     const stem=shared?scopeX(parent,parentFrame):x;
     const gy=group.getBoundingClientRect().top-pr.top;
     const curl=ch*.75;
     const parentParams=parentFrame?.n.kind==='fun'?parent.querySelector(':scope > .parameters'):null;
     const meetsParameter=state.parameterMark&&parentParams&&Math.abs(parentParams.getBoundingClientRect().bottom-pr.top-gy)<.1;
     group.dataset.junction=meetsParameter?'parameter':'curved';
     const bridgeStart=(by,touch)=>touch?'M '+(shared?stem+pitch*.75:stem)+' '+by:'M '+stem+' '+(by-curl)+' C '+stem+' '+by+' '+(stem+curl)+' '+by+' '+(stem+2*curl)+' '+by;
     if(stacked){
      for(const [i,b] of bs.entries()){const br=b.getBoundingClientRect(),by=br.top-pr.top,bx=br.left-pr.left-ch,touch=i===0&&meetsParameter;path(bridgeStart(by,touch)+' H '+bx,'match','bridge');if(!shared)path('M '+stem+' '+(touch?by:by-curl)+' V '+(br.bottom-pr.top-curl)+' Q '+stem+' '+(br.bottom-pr.top)+' '+(stem+curl)+' '+(br.bottom-pr.top),'match','branch-stem');}
     }else{
      const anchors=bs.map(b=>b.getBoundingClientRect().left-pr.left-2*ch);
      const last=anchors[anchors.length-1];
      path(bridgeStart(gy,meetsParameter)+' H '+(last-curl)+' Q '+last+' '+gy+' '+last+' '+(gy+curl),'match','bridge');
      bs.forEach((b,i)=>{if(i===0&&shared)return;const br=b.getBoundingClientRect(),bottom=br.bottom-pr.top;const bx=i===0?stem:anchors[i],startY=i?gy+curl:meetsParameter?gy:gy-curl;path('M '+bx+' '+startY+' V '+(bottom-curl)+' Q '+bx+' '+bottom+' '+(bx+curl)+' '+bottom,'match','branch-stem');});
     }
     buttonX=stem+pitch*.5;buttonY=gy-5;buttonHeight=10;buttonWidth=Math.max(pitch,(stacked?r.left-pr.left-ch:bs[bs.length-1].getBoundingClientRect().left-pr.left-2*ch)-buttonX);
    }else{
     path('M '+(x+pitch*.5)+' '+y+' Q '+x+' '+y+' '+x+' '+(y+pitch*.5)+' V '+end,frame.n.kind);
     const params=el.querySelector(':scope > .parameters');
     if(params&&state.parameterMark){
      const py=params.getBoundingClientRect().bottom-pr.top;
      const childMatch=el.querySelector(':scope > .scope[data-kind="match"][data-expanded="true"] > .branches');
      const joinedMatch=childMatch&&Math.abs(childMatch.getBoundingClientRect().top-pr.top-py)<.1;
      const markEnd=x+pitch*(joinedMatch&&!state.sharedStem?1:.75);
      path('M '+x+' '+py+' H '+markEnd,'fun','parameter');
      if(state.extendParameter&&!joinedMatch){const field=params.querySelector('.expression')||params.querySelector('.name');if(field)path('M '+(x+pitch)+' '+py+' H '+(field.getBoundingClientRect().right-pr.left),'divider');}
     }
    }
   }
   const b=document.createElement('button');b.type='button';b.className='rail'+(frame.n.kind==='match'?' case-rail':'');b.dataset.target=frame.n.id;
   b.style.left=buttonX+'px';b.style.top=buttonY+'px';b.style.width=buttonWidth+'px';b.style.height=buttonHeight+'px';
   const kind=frame.n.kind==='fun'?'function':frame.n.kind==='match'?'match':'let block';
   const label=(frame.expanded?'Unfurl ':'Furl ')+kind+' '+frame.name;
   b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(frame.expanded));
   b.setAttribute('data-tooltip',label);
   if(!frame.expanded)b.innerHTML='<span class="plus" aria-hidden="true">+</span>';
   b.addEventListener('mouseenter',()=>{el.classList.add('focus-scope');root.querySelector('[data-ui="interaction"]').textContent=label;});
   b.addEventListener('mouseleave',()=>{el.classList.remove('focus-scope');root.querySelector('[data-ui="interaction"]').textContent=interactionHint();});
   b.addEventListener('click',()=>{state.open[frame.n.id]=!state.open[frame.n.id];renderProgram(frame.n.id);root.querySelector('[data-ui="announcement"]').textContent=label;});
   program.appendChild(b);
  }
  program.appendChild(svg);
 }
 function interactionHint(){return state.comb?'Click a comb or match bridge to unfurl; click + to furl.':'Comb hidden · use Furl all or Unfurl all to change the view.';}
 function renderProgram(focusId=''){
  root.style.setProperty('--indent',state.indentation?1:0);root.style.setProperty('--row',state.rowHeight+'px');program.dataset.grid=String(state.grid);program.dataset.nameTop=String(state.nameAtTop);
  getDimensions();frames.length=0;
  const c=current();layout=makeLayout(c.node);program.dataset.laneCount=String(layout.logicalLanes);program.dataset.stacked=String(layout.stacked);program.innerHTML='<div class="content-grid" style="width:'+layout.total+'ch">'+renderNode(c.node,c.name,0,layout.placements.get(c.node))+'</div>';
  root.querySelectorAll('[data-attr]').forEach(b=>b.setAttribute('aria-pressed',String(state[b.dataset.attr])));
  root.querySelector('[data-ui="indent"]').checked=state.indentation;root.querySelector('[data-ui="params"]').checked=state.parameterMark;root.querySelector('[data-ui="grid"]').checked=state.grid;
  root.querySelector('[data-ui="block"]').checked=state.blockEdge;root.querySelector('[data-ui="pattern-block"]').checked=state.patternBlock;root.querySelector('[data-ui="name-top"]').checked=state.nameAtTop;root.querySelector('[data-ui="extend"]').checked=state.extendParameter;root.querySelector('[data-ui="shared"]').checked=state.sharedStem;
  root.querySelector('[data-ui="params"]').disabled=!state.comb;root.querySelector('[data-ui="extend"]').disabled=!state.comb||!state.parameterMark;root.querySelector('[data-ui="shared"]').disabled=!state.comb;
  root.querySelector('[data-ui="interaction"]').textContent=interactionHint();
  queueDraw();
  if(focusId)requestAnimationFrame(()=>{const b=program.querySelector('[data-target="'+focusId+'"]');if(b)b.focus({preventScroll:true});});
 }
 function renderContext(){
  const mount=root.querySelector('[data-ui="context"]');
  if(state.study==='lets')mount.innerHTML='';
  if(state.study==='functions')mount.innerHTML='<span>Trace</span><code>scale 3 → apply 4</code>';
  if(state.study==='matches')mount.innerHTML='<label for="'+root.id+'-sample">input</label><select id="'+root.id+'-sample" data-ui="sample"><option value="some">Some 7</option><option value="none">None</option></select>';
  if(state.study==='combined')mount.innerHTML='<label for="'+root.id+'-sample">Trace</label><select id="'+root.id+'-sample" data-ui="sample"><option value="some">format "px" (Some 7)</option><option value="none">format "px" None</option></select>';
  if(state.study==='recursion'){
   const call=callById.get(sample()),i=callFrames.indexOf(call);
   mount.innerHTML='<span class="run-context">Run <code>sum [2,4,6] → 12</code></span><div class="call-navigation" aria-label="Navigate call samples"><span>Focused call</span><button class="plain" type="button" data-call="'+(callFrames[i-1]?.id||'')+'" aria-label="Previous call sample"'+(i===0?' disabled':'')+'>◀</button><span class="call-count">'+(i+1)+' / '+callFrames.length+'</span><button class="plain" type="button" data-call="'+(callFrames[i+1]?.id||'')+'" aria-label="Next call sample"'+(i===callFrames.length-1?' disabled':'')+'>▶</button><code>sum '+call.args+' → '+call.value+'</code>'+(call.parent?'<span>from <code>sum '+callById.get(call.parent).args+'</code></span>':'')+'</div>';
  }
  if(state.study==='traces')mount.innerHTML='<span>Two calls</span><code>format "px" (Some 7)</code><code>format "px" None</code>';
  if(state.study==='helper')mount.innerHTML='<span>Trace</span><code>through (0,0) (3,4)</code><div class="versions" aria-label="Refactoring state"><button class="version" data-version="before" aria-pressed="'+(state.helperVersion==='before')+'" type="button">Before</button><button class="version" data-version="after" aria-pressed="'+(state.helperVersion==='after')+'" type="button">After extraction</button></div>';
  const picker=mount.querySelector('[data-ui="sample"]');if(picker){picker.value=sample();picker.addEventListener('change',()=>{state.samples[state.study]=picker.value;renderProgram();});}
  mount.querySelectorAll('[data-call]').forEach(b=>b.addEventListener('click',()=>selectCall(b.dataset.call)));
  mount.querySelectorAll('[data-version]').forEach(b=>b.addEventListener('click',()=>{state.helperVersion=b.dataset.version;renderContext();renderProgram();}));
 }
 function selectCall(id){if(!callById.has(id))return;state.samples.recursion=id;renderContext();renderProgram();const c=callById.get(id);root.querySelector('[data-ui="announcement"]').textContent='Focused call sum '+c.args+', result '+c.value;}
 function chooseStudy(id){state.study=id;root.querySelectorAll('[data-study]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.study===id)));if(root.querySelector('.studies'))root.querySelector('[data-ui="study-panel"]').setAttribute('aria-labelledby',root.id+'-tab-'+id);root.querySelector('[data-ui="filename"]').textContent=current().file;renderContext();renderProgram();}
 root.querySelectorAll('[data-study]').forEach(b=>b.addEventListener('click',()=>chooseStudy(b.dataset.study)));
 root.querySelectorAll('[data-all]').forEach(b=>b.addEventListener('click',()=>{visit(current().node,n=>{state.open[n.id]=b.dataset.all==='true';});renderProgram();root.querySelector('[data-ui="announcement"]').textContent=b.dataset.all==='true'?'All scopes furled':'All scopes unfurled to code';}));
 root.querySelectorAll('[data-attr]').forEach(b=>b.addEventListener('click',()=>{state[b.dataset.attr]=!state[b.dataset.attr];renderProgram();}));
 root.querySelector('[data-ui="indent"]').addEventListener('change',e=>{state.indentation=e.target.checked;renderProgram();});
 root.querySelector('[data-ui="params"]').addEventListener('change',e=>{state.parameterMark=e.target.checked;renderProgram();});
 root.querySelector('[data-ui="grid"]').addEventListener('change',e=>{state.grid=e.target.checked;renderProgram();});
 for(const [id,key] of [['fg-block','blockEdge'],['fg-pattern-block','patternBlock'],['fg-name-top','nameAtTop'],['fg-extend','extendParameter'],['fg-shared','sharedStem']])root.querySelector('[data-ui="'+id.replace('fg-','')+'"]').addEventListener('change',e=>{state[key]=e.target.checked;renderProgram();});
 program.addEventListener('click',e=>{const b=e.target.closest('[data-call]');if(b)selectCall(b.dataset.call);});
 root.querySelector('[data-ui="context"]').addEventListener('keydown',e=>{if(state.study!=='recursion'||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=callFrames.findIndex(c=>c.id===sample());const next=callFrames[i+(e.key==='ArrowRight'?1:-1)];if(next){selectCall(next.id);root.querySelector('.call-navigation button:not(:disabled)')?.focus();}});
 let lastWidth=0;
 const resize=new ResizeObserver(()=>{const width=Math.round(program.getBoundingClientRect().width);if(width!==lastWidth){lastWidth=width;renderProgram();}});resize.observe(program);
 chooseStudy(initialStudy);
}
