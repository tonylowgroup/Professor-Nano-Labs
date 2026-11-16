/* 14 Bravais Lattices viewer: the companion notebook's own script, unchanged except
   that it reads DATA from data.js and uses bv- class names. No libraries needed. */
(function(){
'use strict';
const DATA=window.BRAVAIS_DATA;
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LM=Object.fromEntries(DATA.lattices.map(l=>[l.code,l])), MM=Object.fromEntries(DATA.materials.map(m=>[m.id,m]));
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), mul=(a,t)=>a.map(v=>v*t), norm=a=>Math.hypot(...a);
const matvec=(f,M)=>[0,1,2].map(j=>f.reduce((s,v,i)=>s+v*M[i][j],0));
const det=M=>M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])-M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])+M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0]);
const inv=M=>{const d=det(M);return [[M[1][1]*M[2][2]-M[1][2]*M[2][1],M[0][2]*M[2][1]-M[0][1]*M[2][2],M[0][1]*M[1][2]-M[0][2]*M[1][1]],[M[1][2]*M[2][0]-M[1][0]*M[2][2],M[0][0]*M[2][2]-M[0][2]*M[2][0],M[0][2]*M[1][0]-M[0][0]*M[1][2]],[M[1][0]*M[2][1]-M[1][1]*M[2][0],M[0][1]*M[2][0]-M[0][0]*M[2][1],M[0][0]*M[1][1]-M[0][1]*M[1][0]]].map(r=>r.map(v=>v/d));};
const wrap=f=>f.map(v=>{let w=((v%1)+1)%1;return Math.abs(w-1)<1e-7||Math.abs(w)<1e-7?0:+w.toFixed(8)});
const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const edges=[];for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(corners[i].filter((v,k)=>v!==corners[j][k]).length===1)edges.push([i,j]);
const state={code:'cF',material:'silicon',mode:'real',cell:'conventional',repeat:1,yaw:.62,pitch:.42,zoom:1,spin:true,speed:12,size:.62,boundary:true,wire:true,axes:true,labels:false,neighbors:false};
let model=null,atoms=[],segments=[],axisTips=[],center=[0,0,0],extent=1,dmin=1,picks=[],dirty=true,lastTime=0;
const canvas=$('scene'),ctx=canvas.getContext('2d');let W=600,H=520,DPR=1;
const palette=['#2671b0','#e6a13b','#40a492','#9c6ac4','#dd6c65','#6d8292'];
function colorFor(e){if(e==='L')return '#526c81';const elems=model?model.elements:['A','B'];return palette[Math.max(0,elems.indexOf(e))%palette.length];}
function formula(f){return esc(f).replace(/(\d+)/g,'<sub>$1</sub>');}
function idealModel(l,mode){
 let prim=[{element:mode==='lattice'?'L':'A',f:[0,0,0]}];
 if(mode==='two')prim.push({element:'B',f:[.23,.31,.37]});
 let sites=[];for(const s of prim){const fc=matvec(s.f,l.transform);for(const c of l.centers)sites.push({element:s.element,f:wrap(add(fc,c))});}
 return {id:mode,code:l.code,name:mode==='lattice'?'Bravais lattice points':mode==='one'?'Ideal one-atom crystal':'Hypothetical two-atom crystal',formula:mode==='two'?'A + B':'A',spacegroup:'Not assigned to a hypothetical decoration',spacegroup_number:null,n_basis:prim.length,n_species:prim.length,n_conventional:sites.length,parameters:l.parameters,conventional_matrix:l.matrix,primitive_matrix:l.primitive_matrix,sites:sites,primitive_sites:prim,phase:'Teaching geometry — not a measured material.',application:'Use this model to isolate the geometric lattice + basis construction. It is not a claim that a real element or compound has this exact structure.',tag:mode==='lattice'?'Geometry only':'Hypothetical teaching model',note:mode==='two'?'Two distinct model atoms at primitive fractional positions (0,0,0) and (0.23,0.31,0.37). An arbitrary decoration can reduce crystal point symmetry. No material identity, stability or space group is asserted.':mode==='one'?'Exactly one model atom is attached to each Bravais point. This demonstrates geometry without assigning an unverified real-material name.':'Lattice points have no chemical identity. Centering points are part of the translation lattice, not extra basis atoms.',metric_note:'Arbitrary representative dimensions in model length units.',sources:DATA.lattice_sources,ideal:true};
}
function populateMaterials(){const l=LM[state.code];$('material').innerHTML=[...l.materials,...l.bonus_materials].map(id=>`<option value="${id}">${esc(MM[id].name)} · ${MM[id].n_basis} basis atom${MM[id].n_basis===1?'':'s'}${MM[id].bonus?' · bonus':''}</option>`).join('');if(![...l.materials,...l.bonus_materials].includes(state.material))state.material=l.materials[0];$('material').value=state.material;$('material').disabled=state.mode!=='real';}
function makeAtoms(sites,M,n,boundary){const list=[];for(const s of sites){const arrays=s.f.map(v=>{const a=[];for(let i=0;i<n;i++)a.push(v+i);if(boundary&&Math.abs(v)<1e-7)a.push(n);return a;});for(const x of arrays[0])for(const y of arrays[1])for(const z of arrays[2]){const f=[x,y,z];list.push({element:s.element,f:f,p:matvec(f,M)});}}return list;}
function splitLine(a,b,color,width,dash=false){for(let i=0;i<12;i++)segments.push({kind:'line',a:add(a,mul(sub(b,a),i/12)),b:add(a,mul(sub(b,a),(i+1)/12)),color,width,dash});}
function rebuild(){
 const l=LM[state.code];model=state.mode==='real'?MM[state.material]:idealModel(l,state.mode);model.elements=[...new Set(model.sites.map(s=>s.element))];
 const M=model[state.cell+'_matrix'],sites=state.cell==='primitive'?model.primitive_sites:model.sites,n=state.repeat;
 atoms=makeAtoms(sites,M,n,state.boundary);segments=[];axisTips=[];
 const worldcorners=corners.map(f=>matvec(mul(f,n),M));center=mul(worldcorners.reduce(add,[0,0,0]),1/8);extent=Math.max(...worldcorners.map(p=>norm(sub(p,center))));
 dmin=model.nearest_neighbor||Math.min(...M.map(norm))*.7;
 if(model.ideal){dmin=Infinity;const sample=makeAtoms(sites,M,2,false);for(let i=0;i<sample.length;i++)for(let j=i+1;j<sample.length;j++)dmin=Math.min(dmin,norm(sub(sample[i].p,sample[j].p)));if(!Number.isFinite(dmin))dmin=Math.min(...M.map(norm));}
 if(state.wire){for(let a=0;a<n;a++)for(let b=0;b<n;b++)for(let c=0;c<n;c++){const off=[a,b,c],pts=corners.map(f=>matvec(add(f,off),M));for(const [i,j]of edges)splitLine(pts[i],pts[j],n===1?'#768b9c':'#acbbc6',n===1?1.4:.8);}}
 if(state.neighbors){const lim=dmin*1.12;for(let i=0;i<atoms.length;i++)for(let j=i+1;j<atoms.length;j++){const d=norm(sub(atoms[i].p,atoms[j].p));if(d>.01&&d<lim)splitLine(atoms[i].p,atoms[j].p,'#bccbd4',1);}}
 if(state.axes){const zero=[0,0,0],names=state.cell==='primitive'?['a₁','a₂','a₃']:['a','b','c'];M.forEach((v,i)=>{splitLine(zero,mul(v,1.08),['#2671b0','#168274','#b8751e'][i],2.2);axisTips.push({p:mul(v,1.15),label:names[i],color:['#2671b0','#168274','#b8751e'][i]});});}
 updateInfo();dirty=true;window.__crystalReady=true;
}
function coordinateRows(){return state.cell==='primitive'?model.primitive_sites:model.sites;}
function updateInfo(){
 const l=LM[state.code],m=model,baseLabel=state.mode==='lattice'?'points / primitive cell':'atoms / primitive basis';
 $('viewTitle').textContent=m.name;$('codePill').textContent=state.code;
 $('legend').innerHTML=m.elements.map(e=>`<span><span class="bv-swatch" style="background:${colorFor(e)}"></span>${esc(e==='L'?'Lattice point':e)}</span>`).join('');
 $('renderCount').textContent=`${atoms.length} displayed ${state.mode==='lattice'?'points':'atom images'}${state.boundary?' · boundary copies included':''}`;
 const isWarn=/reference|precursor/i.test(m.tag)||m.ideal;
 $('info').innerHTML=`<span class="tag ${isWarn?'warn':''}">${esc(m.tag)}</span><h2 class="materialname">${esc(m.name)}</h2><div class="formula">${formula(m.formula)} · ${esc(l.name)}</div><div class="counts"><div class="count first"><strong>${m.n_basis}</strong><span>${baseLabel}</span></div><div class="count"><strong>${m.n_conventional}</strong><span>${state.mode==='lattice'?'points':'atoms'} / conventional cell</span></div><div class="count"><strong>${state.mode==='lattice'?'—':m.n_species}</strong><span>chemical species${m.ideal?' (model)':''}</span></div></div><div class="counts-note">Cell counts use periodic sharing, not the number of spheres visible on the boundary.</div><div class="detailsline"><b>Phase / conditions:</b> ${esc(m.phase)}</div>${!m.ideal?`<div class="detailsline"><b>Space group:</b> ${esc(m.spacegroup)} · No. ${m.spacegroup_number}</div>`:''}<h3 style="margin-top:15px">${m.ideal?'Learning purpose':'Application / relevance'}</h3><p>${esc(m.application)}</p><div class="keynote">${esc(m.note)}</div><details><summary>Geometry provenance &amp; source links</summary><p class="metric">${esc(m.metric_note)}</p><div class="sources">${m.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener"><span class="kind">${esc(s.kind)}</span>${esc(s.title)} ↗</a>`).join('')}</div></details>`;
 $('coordinateHeading').textContent=`${state.cell==='primitive'?'Primitive-basis':'Conventional-cell'} fractional coordinates`;
 $('coordinateNote').innerHTML=state.cell==='primitive'?'r = u a₁ + v a₂ + w a₃. These are <b>primitive-vector coordinates</b>, not conventional cubic coordinates.':'r = u a + v b + w c. All symmetry-expanded sites are listed once in the half-open conventional cell, 0 ≤ u,v,w &lt; 1.';
 $('coords').innerHTML=coordinateRows().map((s,i)=>`<tr><td>${esc(s.element==='L'?'Point':s.element)} ${i+1}</td>${s.f.map(v=>`<td class="num">${v.toFixed(5)}</td>`).join('')}</tr>`).join('');
 const units=m.ideal?'model units':'Å',p=m.parameters;
 const matrix=m[state.cell+'_matrix'];
 $('geometry').innerHTML=`<p>${esc(l.note)}</p><div class="detailsline"><b>Conventional parameters:</b><br>a = ${p[0].toFixed(4)}, b = ${p[1].toFixed(4)}, c = ${p[2].toFixed(4)} ${units}<br>α = ${p[3].toFixed(2)}°, β = ${p[4].toFixed(2)}°, γ = ${p[5].toFixed(2)}°</div><p class="metric">Rows below are the displayed cell vectors in Cartesian coordinates (${units}).</p><div class="bv-matrix">${matrix.map(r=>'[ '+r.map(v=>v.toFixed(5).padStart(10)).join(' ')+' ]').join('\n')}</div><div class="detailsline"><b>V conventional / V primitive = ${l.centers.length}</b><br>${m.n_conventional} ${state.mode==='lattice'?'points':'atoms'} / ${l.centers.length} lattice point${l.centers.length===1?'':'s'} = ${m.n_basis} ${state.mode==='lattice'?'point per primitive cell':'atoms per primitive basis'}.</div><p class="metric">${state.boundary?'Boundary copies complete the cell outline; do not count every visible sphere as a whole atom of the cell.':'Boundary copies are off: the plot uses a half-open crop, making its atom count match the repeated-cell count.'} ${state.neighbors?'Lines join atoms within 1.12 × the shortest periodic distance; they are NOT a chemical bond model.':''}</p>`;
}
function rotate(v,yaw=state.yaw,pitch=state.pitch){const ca=Math.cos(yaw),sa=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);const x=ca*v[0]-sa*v[1],z0=sa*v[0]+ca*v[1];return[x,cp*v[2]+sp*z0,sp*v[2]-cp*z0];}
function project(p){const v=rotate(sub(p,center)),scale=.37*Math.min(W,H)/Math.max(.1,extent)*state.zoom;return{x:W/2+v[0]*scale,y:H/2-v[1]*scale,z:v[2],scale};}
function shade(hex,amount){const n=parseInt(hex.slice(1),16),t=amount>0?255:0,f=Math.abs(amount);return `rgb(${[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(t-v)*f)).join(',')})`;}
function draw(){
 ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
 const items=segments.map(l=>{const a=project(l.a),b=project(l.b);return{...l,pa:a,pb:b,z:(a.z+b.z)/2};});
 const radius=dmin*.29*state.size;for(const a of atoms){const p=project(a.p);items.push({kind:'atom',...a,pr:p,z:p.z,r:Math.max(1.6,radius*p.scale)});}items.sort((a,b)=>a.z-b.z);picks=[];
 for(const it of items){if(it.kind==='line'){ctx.beginPath();ctx.moveTo(it.pa.x,it.pa.y);ctx.lineTo(it.pb.x,it.pb.y);ctx.strokeStyle=it.color;ctx.lineWidth=it.width;ctx.stroke();continue;}
 const x=it.pr.x,y=it.pr.y,r=it.r,c=colorFor(it.element);if(x<-r||y<-r||x>W+r||y>H+r)continue;
 const grad=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.07,x,y,r);grad.addColorStop(0,shade(c,.72));grad.addColorStop(.45,c);grad.addColorStop(1,shade(c,-.32));ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle=shade(c,-.25);ctx.lineWidth=.55;ctx.stroke();
 if(state.labels&&atoms.length<450&&it.element!=='L'){ctx.font=`600 ${Math.max(10,Math.min(14,r*.8))}px -apple-system,Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(it.element,x,y);}
 picks.push({x,y,r:Math.max(r,5),atom:it});}
 if(state.axes){for(const tip of axisTips){const p=project(tip.p);ctx.font='italic 700 17px Georgia';ctx.fillStyle=tip.color;ctx.textAlign='center';ctx.fillText(tip.label,p.x,p.y);}}
 // Mini orientation triad anchored to the canvas, independent of zoom.
 const origin=[45,H-40];['x','y','z'].forEach((s,i)=>{const unit=[0,0,0];unit[i]=1;const v=rotate(unit);ctx.strokeStyle=['#2671b0','#168274','#b8751e'][i];ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(...origin);ctx.lineTo(origin[0]+v[0]*25,origin[1]-v[1]*25);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.font='11px Arial';ctx.fillText(s,origin[0]+v[0]*34,origin[1]-v[1]*34);});
 ctx.fillStyle='#81939f';ctx.textAlign='right';ctx.font='11px Arial';ctx.fillText(`${state.cell} cell · ${state.repeat} × ${state.repeat} × ${state.repeat}`,W-14,H-15);dirty=false;
}
function resize(){const r=$('stagewrap').getBoundingClientRect();W=Math.max(250,r.width);H=r.height;DPR=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);dirty=true;}
function tick(time){const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;if(state.spin&&!document.hidden){state.yaw+=dt*state.speed*Math.PI/180;dirty=true;}if(dirty)draw();requestAnimationFrame(tick);}
function selectLattice(code){state.code=code;document.querySelectorAll('.tile').forEach(b=>{const active=b.dataset.code===code;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});populateMaterials();rebuild();renderThumbnails();}
function jump(id){const m=MM[id];state.mode='real';$('mode').value='real';state.material=id;selectLattice(m.code);}
function setSpin(v){state.spin=v;$('spin').textContent=v?'Pause rotation':'Play rotation';$('spin').setAttribute('aria-pressed',String(v));}
function renderThumbnails(){for(const l of DATA.lattices){const c=document.querySelector(`[data-code="${l.code}"] canvas`),r=c.getBoundingClientRect();if(!r.width)continue;const d=Math.min(devicePixelRatio||1,2);c.width=r.width*d;c.height=r.height*d;const q=c.getContext('2d');q.scale(d,d);const pts=corners.map(f=>matvec(f,l.matrix)),cen=mul(pts.reduce(add,[0,0,0]),1/8),ex=Math.max(...pts.map(p=>norm(sub(p,cen)))),sc=Math.min(r.width*.32,r.height*.40)/ex;const proj=p=>{const v=rotate(sub(p,cen),.58,.37);return[r.width/2+v[0]*sc,r.height/2-v[1]*sc,v[2]]};q.strokeStyle=l.code===state.code?'#97bfd4':'#8ca5b6';q.lineWidth=.85;for(const [i,j]of edges){q.beginPath();q.moveTo(...proj(pts[i]).slice(0,2));q.lineTo(...proj(pts[j]).slice(0,2));q.stroke();}const ss=l.centers.map(f=>({element:'L',f}));const ap=makeAtoms(ss,l.matrix,1,true).map(a=>proj(a.p)).sort((a,b)=>a[2]-b[2]);for(const p of ap){q.beginPath();q.arc(p[0],p[1],2.2,0,2*Math.PI);q.fillStyle=l.code===state.code?'#c5e7e9':'#2671b0';q.fill();}}}
function download(name,text,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('atlas').innerHTML=DATA.lattices.map(l=>`<button class="tile" data-code="${l.code}" title="${esc(l.name)}" aria-label="${esc(l.name)}"><canvas aria-hidden="true"></canvas><span class="code">${l.code}</span><span class="sys">${esc(l.system)}</span><span class="ctype">${esc({P:'primitive',C:'base-centered',I:'body-centered',F:'face-centered',R:'rhombohedral'}[l.centering])}</span></button>`).join('');
$('atlas').addEventListener('click',e=>{const b=e.target.closest('[data-code]');if(b)selectLattice(b.dataset.code);});
$('mode').addEventListener('change',e=>{state.mode=e.target.value;populateMaterials();rebuild();});$('material').addEventListener('change',e=>{state.material=e.target.value;rebuild();});
$('spin').addEventListener('click',()=>setSpin(!state.spin));$('speed').addEventListener('input',e=>state.speed=+e.target.value);
$('zoom').addEventListener('input',e=>{state.zoom=+e.target.value/100;dirty=true;});$('size').addEventListener('input',e=>{state.size=+e.target.value/100;dirty=true;});
$('reset').addEventListener('click',()=>{state.yaw=.62;state.pitch=.42;state.zoom=1;$('zoom').value=100;dirty=true;});$('top').addEventListener('click',()=>{setSpin(false);state.yaw=0;state.pitch=Math.PI/2;dirty=true;});$('front').addEventListener('click',()=>{setSpin(false);state.yaw=0;state.pitch=0;dirty=true;});
$('cell').addEventListener('change',e=>{state.cell=e.target.value;rebuild();});$('repeat').addEventListener('change',e=>{state.repeat=+e.target.value;rebuild();});
for(const key of ['wire','axes','labels','boundary','neighbors'])$(key).addEventListener('change',e=>{state[key]=e.target.checked;rebuild();});
$('next').addEventListener('click',()=>{const i=DATA.materials.findIndex(m=>m.id===state.material);jump(DATA.materials[(i+1)%DATA.materials.length].id);});document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>jump(b.dataset.jump)));
let drag=null;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};setSpin(false);canvas.classList.add('dragging');$('tooltip').style.display='none';});
canvas.addEventListener('pointerup',e=>{drag=null;canvas.classList.remove('dragging');});canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging');});
canvas.addEventListener('pointerleave',()=>{$('tooltip').style.display='none';});
canvas.addEventListener('pointermove',e=>{if(drag){state.yaw+=(e.clientX-drag.x)*.009;state.pitch=Math.max(-1.5,Math.min(1.5,state.pitch+(e.clientY-drag.y)*.009));drag={x:e.clientX,y:e.clientY};dirty=true;return;}const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let hit=null;for(let i=picks.length-1;i>=0;i--){const p=picks[i];if(Math.hypot(x-p.x,y-p.y)<=p.r){hit=p;break;}}const t=$('tooltip');if(!hit){t.style.display='none';return;}const a=hit.atom;t.innerHTML=`<b>${esc(a.element==='L'?'Lattice point':a.element)}</b><br>${state.cell} fractional:<br>(${a.f.map(v=>v.toFixed(4)).join(', ')})`;t.style.display='block';t.style.left=Math.min(x+14,W-220)+'px';t.style.top=Math.max(30,Math.min(y+14,H-90))+'px';});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.45,Math.min(2,state.zoom*Math.exp(-e.deltaY*.001)));$('zoom').value=state.zoom*100;dirty=true;},{passive:false});
canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)){e.preventDefault();if(e.key===' ')setSpin(!state.spin);else{setSpin(false);if(e.key==='ArrowLeft')state.yaw-=.12;if(e.key==='ArrowRight')state.yaw+=.12;if(e.key==='ArrowUp')state.pitch+=.12;if(e.key==='ArrowDown')state.pitch-=.12;dirty=true;}}});
$('exportJSON').addEventListener('click',()=>download(`${model.id}_${state.cell}.json`,JSON.stringify({material:model.name,formula:model.formula,bravais:state.code,cell:state.cell,units:model.ideal?'model length units':'angstrom',matrix:model[state.cell+'_matrix'],sites:coordinateRows(),n_basis:model.n_basis,phase:model.phase,provenance:model.metric_note,sources:model.sources},null,2),'application/json'));
$('exportXYZ').addEventListener('click',()=>download(`${model.id}_${state.repeat}cells.xyz`,`${atoms.length}\n${model.name}; ${state.cell}; boundary copies=${state.boundary}; units=${model.ideal?'model':'angstrom'}; not a nanoparticle model\n`+atoms.map(a=>`${a.element==='L'?'X':a.element} ${a.p.map(v=>v.toFixed(7)).join(' ')}`).join('\n')+'\n','text/plain'));
$('savePNG').addEventListener('click',()=>{draw();const a=document.createElement('a');a.download=`${model.id}_view.png`;a.href=canvas.toDataURL('image/png');a.click();});
$('indexRows').innerHTML=DATA.lattices.map(l=>{const ms=l.materials.map(id=>MM[id]);return `<tr><td><b>${l.code}</b><br>${l.name}</td>${ms.map(m=>`<td><a href="#" data-mat="${m.id}">${esc(m.name)}</a> <b>(${m.n_basis})</b><br>${esc(m.tag)}</td>`).join('')}${ms.length<2?'<td>—</td>':''}<td>${l.exact_pair?'Yes':'No — actual bases shown'}</td></tr>`}).join('');$('indexRows').addEventListener('click',e=>{const a=e.target.closest('[data-mat]');if(a){e.preventDefault();jump(a.dataset.mat);$('mode').scrollIntoView({behavior:'smooth',block:'start'});}});
$('generalSources').innerHTML=DATA.lattice_sources.map(s=>`<a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.title)}</a>`).join(' · ');
// Read-only diagnostics support notebook/browser validation; no server is used.
window.crystalDiagnostics=()=>({state:{...state},material:model.id,n_basis:model.n_basis,n_conventional:model.n_conventional,n_species:model.n_species,displayed_atoms:atoms.length,selected_sites:coordinateRows().length,segments:segments.length,finite:atoms.every(a=>a.p.every(Number.isFinite)),coordinates:atoms.map(a=>({element:a.element,f:a.f,p:a.p}))});
window.crystalSelect=jump;
new ResizeObserver(()=>{resize();renderThumbnails();}).observe($('stagewrap'));window.addEventListener('resize',renderThumbnails);
selectLattice(state.code);resize();requestAnimationFrame(()=>{renderThumbnails();requestAnimationFrame(tick);});
})();
