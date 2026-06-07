/* =====================================================================
   Rewire app — node/edge model, LIVE audio routing, spec loader, and
   the draggable node + wire UI. Audio synthesis lives in engine.js.
   ===================================================================== */

// ---- node type definitions ------------------------------------------
// audio: "voice" (has audioOut), "fx" (audioIn+audioOut), "out" (audioIn), null (data only)
const NODE_DEFS = {
  clock: { title:"CLOCK", cls:"clock", audio:null,
    ins:[{name:"swing",type:"mod"},{name:"arrange",type:"arrange"}], outs:[{name:"clock",type:"clock"}],
    params:{bpm:120,swing:0,arrange:"evolve",enabled:true},
    controls:[{k:"enabled",t:"check"},
              {k:"bpm",t:"range",min:60,max:180,step:1,unit:" bpm"},
              {k:"swing",t:"range",min:0,max:100,step:1,unit:"%"},
              {k:"arrange",t:"select",opts:["evolve","steady"]}] },
  clockmult:{ title:"MULT", cls:"clock", audio:null,
    ins:[{name:"clock",type:"clock"}], outs:[{name:"clock",type:"clock"}],
    params:{factor:0.5},
    controls:[{k:"factor",t:"select",opts:["0.0625","0.125","0.25","0.5","1","2","4","8"]}] },
  scale: { title:"SCALE", cls:"data", audio:null,
    ins:[], outs:[{name:"scale",type:"scale"}],
    params:{scaleHz:[]},
    controls:[{k:"scaleHz",t:"csv",rows:3}] },
  chords:{ title:"CHORDS", cls:"data", audio:null,
    ins:[], outs:[{name:"chords",type:"chords"}],
    params:{chords:[]},
    controls:[{k:"chords",t:"json",rows:6}] },
  motif: { title:"MOTIF", cls:"data", audio:null,
    ins:[], outs:[{name:"motif",type:"motif"}],
    params:{leadMotif:[0,1,2,3,2,1,0,1],busyRhythm:"chunky"},
    controls:[{k:"leadMotif",t:"json",rows:3},
              {k:"busyRhythm",t:"select",opts:["chunky","galloping","syncopated","flurry","driving"]}] },
  drums: { title:"DRUMS", cls:"voice", audio:"voice",
    ins:[{name:"clock",type:"clock"},{name:"arrange",type:"arrange"},{name:"gain",type:"mod"}], outs:[{name:"out",type:"audio"}],
    params:{density:"normal",pattern:"",kit:"default",fills:true,clap:false,openHat:false,gain:1},
    controls:[{k:"density",t:"select",opts:["sparse","normal","dense"]},
              {k:"pattern",t:"select",opts:["","rock-backbeat","disco-four-on-floor","breakbeat","shuffle","samba","trap-rolls","bossa","motorik","half-time","dembow"]},
              {k:"kit",t:"select",opts:["default","lofi","punchy","acoustic","808","distorted"]},
              {k:"fills",t:"check"},{k:"clap",t:"check"},{k:"openHat",t:"check"},
              {k:"gain",t:"range",min:0,max:1.5,step:.05}] },
  bass:  { title:"BASS", cls:"voice", audio:"voice",
    ins:[{name:"clock",type:"clock"},{name:"chords",type:"chords"},{name:"arrange",type:"arrange"},{name:"gain",type:"mod"}], outs:[{name:"out",type:"audio"}],
    params:{style:"walking",wave:"square",octave:0,gain:1},
    controls:[{k:"style",t:"select",opts:["sustain","pulse","walking","octaves","arp","offbeat","driving","sub"]},
              {k:"wave",t:"select",opts:["square","sawtooth","triangle","sine"]},
              {k:"octave",t:"range",min:-2,max:2,step:1},
              {k:"gain",t:"range",min:0,max:1.5,step:.05}] },
  lead:  { title:"LEAD", cls:"voice", audio:"voice",
    ins:[{name:"clock",type:"clock"},{name:"scale",type:"scale"},{name:"chords",type:"chords"},{name:"motif",type:"motif"},{name:"arrange",type:"arrange"},{name:"gain",type:"mod"}],
    outs:[{name:"out",type:"audio"}],
    params:{style:"motif",wave:"square",mode:"chord",octave:0,gain:1},
    controls:[{k:"style",t:"select",opts:["motif","arp","walk","stab"]},
              {k:"wave",t:"select",opts:["square","sawtooth","triangle","sine"]},
              {k:"mode",t:"select",opts:["chord","scale"]},
              {k:"octave",t:"range",min:-2,max:2,step:1},
              {k:"gain",t:"range",min:0,max:1.5,step:.05}] },
  pad:   { title:"PAD", cls:"voice", audio:"voice",
    ins:[{name:"clock",type:"clock"},{name:"chords",type:"chords"},{name:"arrange",type:"arrange"},{name:"gain",type:"mod"}], outs:[{name:"out",type:"audio"}],
    params:{style:"sustain",gain:1},
    controls:[{k:"style",t:"select",opts:["sustain","swell","pulse","stab"]},
              {k:"gain",t:"range",min:0,max:1.5,step:.05}] },
  reverb:{ title:"REVERB", cls:"fx", audio:"fx",
    ins:[{name:"in",type:"audio"},{name:"wetness",type:"mod"}], outs:[{name:"out",type:"audio"}],
    params:{wetness:.3},
    controls:[{k:"wetness",t:"range",min:0,max:1,step:.05}] },
  delay: { title:"DELAY", cls:"fx", audio:"fx",
    ins:[{name:"in",type:"audio"},{name:"feedback",type:"mod"}], outs:[{name:"out",type:"audio"}],
    params:{feedback:.3,time:.75},
    controls:[{k:"feedback",t:"range",min:0,max:.85,step:.05},
              {k:"time",t:"range",min:.25,max:1.5,step:.25,unit:" beat"}] },
  filter:{ title:"FILTER", cls:"fx", audio:"fx",
    ins:[{name:"in",type:"audio"},{name:"cutoff",type:"mod"},{name:"reso",type:"mod"}], outs:[{name:"out",type:"audio"}],
    params:{ftype:"lowpass",cutoff:1200,reso:4},
    controls:[{k:"ftype",t:"select",opts:["lowpass","highpass","bandpass"]},
              {k:"cutoff",t:"range",min:80,max:12000,step:20,unit:" hz"},
              {k:"reso",t:"range",min:0,max:20,step:.5}] },
  output:{ title:"OUTPUT", cls:"out", audio:"out",
    ins:[{name:"in",type:"audio"},{name:"volume",type:"mod"}], outs:[],
    params:{volume:.8},
    controls:[{k:"volume",t:"range",min:0,max:1.2,step:.05}] },
  select:{ title:"SELECT", cls:"select", audio:"select",
    ins:[{name:"clock",type:"clock"},{name:"in0",type:"audio"},{name:"in1",type:"audio"},{name:"in2",type:"audio"},{name:"in3",type:"audio"}],
    outs:[{name:"out",type:"audio"}],
    params:{active:0,every:1},
    controls:[{k:"active",t:"range",min:0,max:3,step:1},
              {k:"every",t:"range",min:1,max:8,step:1,unit:" bar"}] },
  lfo:   { title:"LFO", cls:"mod", audio:null,
    ins:[], outs:[{name:"mod",type:"mod"}],
    params:{shape:"sine",rate:1,depth:1,offset:.5},
    controls:[{k:"shape",t:"select",opts:["sine","triangle","saw","square","s&h"]},
              {k:"rate",t:"range",min:.25,max:8,step:.25,unit:" bar"},
              {k:"depth",t:"range",min:0,max:1,step:.05},
              {k:"offset",t:"range",min:0,max:1,step:.05}] },
  const: { title:"CONST", cls:"mod", audio:null,
    ins:[], outs:[{name:"mod",type:"mod"}],
    params:{value:.5},
    controls:[{k:"value",t:"range",min:0,max:1,step:.01}] },
  arrange:{ title:"ARRANGE", cls:"arrange", audio:null,
    ins:[], outs:[{name:"arrange",type:"arrange"}],
    params:{steps:["tonal","var","poly","build","tonal+","var+","poly+","build+"]},
    controls:[{k:"steps",t:"strcsv",rows:3}] },
};

PB.seq = 0;
function addNode(type,x,y,params){
  const def=NODE_DEFS[type];
  const node={ id:type+(PB.seq++), type, x, y, collapsed:false,
    params:Object.assign(JSON.parse(JSON.stringify(def.params)), params||{}) };
  PB.nodes.push(node);
  if(PB.ctx) buildAudio(node);
  renderNode(node); return node;
}
// clone a block (params/settings only, not its wiring), offset in place
function cloneNode(n){
  const c=addNode(n.type, n.x+28, n.y+28, JSON.parse(JSON.stringify(n.params)));
  if(n.collapsed){ c.collapsed=true; if(c.el){ const b=c.el.querySelector(".pb-node__body"); if(b) b.style.display="none"; const t=c.el.querySelector(".pb-node__tog"); if(t) t.textContent="▸"; } }
  drawWires(); return c;
}
function removeNode(node){
  PB.edges.filter(e=>e.from===node.id||e.to===node.id).slice().forEach(removeEdge);
  if(node.el) node.el.remove();
  PB.nodes.splice(PB.nodes.indexOf(node),1);
  drawWires();
}
function portType(type,dir,name){
  const def=NODE_DEFS[type], list=dir==="in"?def.ins:def.outs;
  const p=list.find(x=>x.name===name); return p?p.type:null;
}

// ---- edges ----------------------------------------------------------
function addEdge(from,fromPort,to,toPort){
  if(from===to) return;
  const t1=portType(node(from).type,"out",fromPort), t2=portType(node(to).type,"in",toPort);
  if(t1!==t2) return;                                  // type mismatch
  // data inputs take ONE source (drop existing); audio inputs allow fan-in (mixing)
  if(t1!=="audio") PB.edges.filter(e=>e.to===to&&e.toPort===toPort).slice().forEach(removeEdge);
  // never duplicate the exact same connection
  if(PB.edges.some(e=>e.from===from&&e.fromPort===fromPort&&e.to===to&&e.toPort===toPort)) return;
  const e={from,fromPort,to,toPort,type:t1};
  PB.edges.push(e);
  if(PB.ctx && t1==="audio") wireAudio(e);
  drawWires(); reflectPorts(); return e;
}
function removeEdge(e){
  if(e._wired) unwireAudio(e);
  PB.edges.splice(PB.edges.indexOf(e),1); drawWires(); reflectPorts();
}
// driver indicator: mark each INPUT port wired (external driver) vs hollow (built-in default)
function reflectPorts(){
  const wired=new Set(PB.edges.map(e=>e.to+"|"+e.toPort));
  document.querySelectorAll('#canvas .pb-dot[data-dir="in"]').forEach(dot=>{
    const on=wired.has(dot.dataset.id+"|"+dot.dataset.port);
    dot.classList.toggle("pb-dot--wired",on);
    const p=dot.closest(".pb-port"); if(p) p.classList.toggle("pb-port--wired",on);
    dot.title = on ? "external driver (wired)" : "built-in default — nothing wired";
  });
}
const node = id => PB.nodes.find(n=>n.id===id);

// ---- live audio routing ---------------------------------------------
function ensureCtx(){
  if(PB.ctx) return;
  const ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"});
  PB.ctx=ctx;
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-16; comp.knee.value=8; comp.ratio.value=4; comp.attack.value=.005; comp.release.value=.1;
  PB.masterBus=comp;                                  // audio bus (NOT PB.master, which is the scheduler timeline)
  PB.gate=ctx.createGain(); PB.gate.gain.value=0;
  comp.connect(PB.gate); PB.gate.connect(ctx.destination);
  PB.nodes.forEach(buildAudio);
}
function buildAudio(node){
  if(node.audioBuilt) return; const ctx=PB.ctx, def=NODE_DEFS[node.type];
  if(def.audio==="voice"){ node.audioOut=ctx.createGain(); node.audioOut.gain.value=1; }
  else if(def.audio==="select"){
    const o=ctx.createGain(); node.audioOut=o; node.audioInMap={};
    for(let k=0;k<4;k++){ const g=ctx.createGain(); g.gain.value=(k===(node.params.active|0))?1:0; g.connect(o); node.audioInMap["in"+k]=g; }
  }
  else if(def.audio==="fx"){
    const i=ctx.createGain(), o=ctx.createGain(); node.audioIn=i; node.audioOut=o; node.audioInMap={in:i};
    if(node.type==="reverb"){
      const n=Math.floor(ctx.sampleRate*2), ir=ctx.createBuffer(2,n,ctx.sampleRate);
      for(let c=0;c<2;c++){const d=ir.getChannelData(c); for(let k=0;k<n;k++) d[k]=(Math.random()*2-1)*Math.exp(-3*k/n);}
      const conv=ctx.createConvolver(); conv.buffer=ir;
      const wet=ctx.createGain(); wet.gain.value=node.params.wetness;
      i.connect(o); i.connect(conv); conv.connect(wet).connect(o); node._wet=wet;
    } else if(node.type==="filter"){
      const flt=ctx.createBiquadFilter(); flt.type=node.params.ftype||"lowpass";
      flt.frequency.value=node.params.cutoff; flt.Q.value=node.params.reso;
      i.connect(flt).connect(o); node._flt=flt;                 // fully filtered (no dry path)
    } else {
      const dly=ctx.createDelay(2); dly.delayTime.value=node.params.time*PB.clock.spb;
      const fb=ctx.createGain(); fb.gain.value=Math.min(.85,node.params.feedback);
      const wet=ctx.createGain(); wet.gain.value=1;
      i.connect(o); i.connect(dly); dly.connect(fb).connect(dly); dly.connect(wet).connect(o);
      node._dly=dly; node._fb=fb;
    }
  } else if(def.audio==="out"){
    const v=ctx.createGain(); v.gain.value=node.params.volume; v.connect(PB.masterBus); node.audioIn=v; node._vol=v; node.audioInMap={in:v};
  }
  node.audioBuilt=true;
}
const audioInOf=(b,port)=> (b.audioInMap && b.audioInMap[port]) || b.audioIn;
function wireAudio(e){
  const a=node(e.from), b=node(e.to); if(!a||!b||!a.audioOut||e._wired) return;
  const dst=audioInOf(b,e.toPort); if(dst){ a.audioOut.connect(dst); e._wired=true; }
}
function unwireAudio(e){
  const a=node(e.from), b=node(e.to); if(!a||!b||!a.audioOut||!e._wired) return;
  const dst=audioInOf(b,e.toPort); if(dst){ try{a.audioOut.disconnect(dst);}catch(x){} e._wired=false; }
}
// router: only the active input passes through
function setSelectActive(node,idx){
  if(!node.audioInMap) return; node.params.active=idx;
  for(let k=0;k<4;k++){ const g=node.audioInMap["in"+k]; if(g) g.gain.value=(k===idx?1:0); }
  reflect(node,"active",idx,"");
}
function advanceSelect(node,barIdx){ setSelectActive(node, Math.floor(barIdx/Math.max(1,node.params.every||1))%4); }

// ---- transport ------------------------------------------------------
function start(){
  ensureCtx(); PB.ctx.resume(); PB.engine.recalcClock();
  PB.nodes.forEach(buildAudio);
  PB.edges.forEach(e=>{ if(e.type==="audio") wireAudio(e); });
  PB.gate.gain.cancelScheduledValues(PB.ctx.currentTime);
  PB.gate.gain.setValueAtTime(1e-4,PB.ctx.currentTime);
  PB.gate.gain.linearRampToValueAtTime(.9,PB.ctx.currentTime+.4);
  const t0=PB.ctx.currentTime+.1; PB.t0=t0; PB.master={cursor:t0,absBar:0};
  PB.nodes.forEach(n=>{ n.cursor=null; n.barIdx=0; });   // reset per-voice timelines
  PB.running=true; PB.engine.tick();
  document.getElementById("playBtn").classList.add("on");
}
function stop(){
  PB.running=false; if(PB.timer) clearTimeout(PB.timer);
  if(PB.gate){ PB.gate.gain.cancelScheduledValues(PB.ctx.currentTime);
    PB.gate.gain.setValueAtTime(PB.gate.gain.value,PB.ctx.currentTime);
    PB.gate.gain.linearRampToValueAtTime(1e-4,PB.ctx.currentTime+.15); }
  document.getElementById("playBtn").classList.remove("on");
}

// ---- param changes (live) -------------------------------------------
function setParam(node,k,v){
  node.params[k]=v;
  if(node.type==="clock") PB.engine.recalcClock();
  if(node.type==="select"&&k==="active") setSelectActive(node,v|0);
  if(node.type==="reverb"&&node._wet) node._wet.gain.value=v*1; // wetness
  if(node.type==="delay"&&node._fb){ if(k==="feedback") node._fb.gain.value=Math.min(.85,v); if(k==="time"&&node._dly) node._dly.delayTime.value=v*PB.clock.spb; }
  if(node.type==="filter"&&node._flt){ if(k==="ftype") node._flt.type=v; if(k==="cutoff") node._flt.frequency.value=v; if(k==="reso") node._flt.Q.value=v; }
  if(node.type==="output"&&node._vol&&k==="volume") node._vol.gain.value=v;
}

// =====================================================================
//  Spec loader — build + auto-wire a graph from a track spec
// =====================================================================
const VIBES={bright:{busyRhythm:"chunky"},triumphant:{busyRhythm:"driving"},flying:{busyRhythm:"galloping"},
  dreamy:{busyRhythm:"chunky"},calm:{busyRhythm:"chunky"},mysterious:{busyRhythm:"syncopated"},
  eerie:{busyRhythm:"syncopated"},scary:{busyRhythm:"syncopated"},tense:{busyRhythm:"flurry"},
  frantic:{busyRhythm:"flurry"},mechanical:{busyRhythm:"driving"},epic:{busyRhythm:"driving"},
  playful:{busyRhythm:"galloping"},dance:{busyRhythm:"galloping"}};
const BASS_FOR_DENSITY={sparse:"sustain",medium:"pulse",normal:"walking",dense:"arp"};

function clearGraph(){
  PB.edges.slice().forEach(removeEdge);
  PB.nodes.slice().forEach(removeNode);
  PB.seq=0;
}
function loadSpec(spec){
  const wasRunning=PB.running; if(wasRunning) stop();
  clearGraph();
  const busy=spec.busyRhythm || (spec.vibe&&VIBES[spec.vibe]&&VIBES[spec.vibe].busyRhythm) || "chunky";
  const clock = addNode("clock",40,30,{bpm:spec.bpm||120,swing:spec.swing||0,arrange:"evolve"});
  const scale = addNode("scale",40,210,{scaleHz:spec.scaleHz||[]});
  const chords= addNode("chords",40,360,{chords:spec.chords||[]});
  const motif = addNode("motif",40,640,{
    leadMotif:spec.leadMotif||[0,1,2,3,2,1,0,1], busyRhythm:busy,
    leadMotifBusy:spec.leadMotifBusy, leadMotifVar:spec.leadMotifVar, leadMotifVarBusy:spec.leadMotifVarBusy,
    leadMotifBuild:spec.leadMotifBuild, leadMotifBuildBusy:spec.leadMotifBuildBusy });
  const drums= addNode("drums",380,30,{density:spec.drumDensity||"normal",pattern:spec.drumPattern||"",kit:spec.drumKit||"default",clap:!!spec.useClap,openHat:!!spec.useOpenHat});
  const bass = addNode("bass",380,230,{style:BASS_FOR_DENSITY[spec.bassDensity]||"walking",wave:"square"});
  const lead = addNode("lead",380,430,{wave:spec.leadWaveform||"square",mode:spec.motifMode||"chord"});
  const pad  = addNode("pad",380,660,{style:"sustain"});
  const rev  = addNode("reverb",720,120,{wetness:spec.reverbWetness||0});
  const dly  = addNode("delay",720,300,{feedback:spec.delayFeedback||0,time:.75});
  const out  = addNode("output",1000,300,{volume:.8});

  // data wiring
  for(const v of [drums,bass,lead,pad]) addEdge(clock.id,"clock",v.id,"clock");
  for(const v of [bass,lead,pad]) addEdge(chords.id,"chords",v.id,"chords");
  addEdge(scale.id,"scale",lead.id,"scale");
  addEdge(motif.id,"motif",lead.id,"motif");
  // audio wiring — reflect the track's fx
  addEdge(drums.id,"out",out.id,"in");
  addEdge(bass.id,"out",out.id,"in");
  const wet=spec.reverbWetness>0, fb=spec.delayFeedback>0;
  if(wet){ addEdge(lead.id,"out",rev.id,"in"); addEdge(pad.id,"out",rev.id,"in");
    if(fb){ addEdge(rev.id,"out",dly.id,"in"); addEdge(dly.id,"out",out.id,"in"); }
    else addEdge(rev.id,"out",out.id,"in"); }
  else { addEdge(lead.id,"out",out.id,"in"); addEdge(pad.id,"out",out.id,"in"); }

  PB.engine.recalcClock();
  if(wasRunning) start();
  fitView();
}

// =====================================================================
//  Patch serialization — save / load the whole graph
// =====================================================================
// The instrument is pure data: {nodes,edges,params}. Snapshot it to JSON
// (localStorage slots + file export) and rebuild via addNode/addEdge. This
// is also the canonical in/out format for the LLM-agent direction.
function serialize(){
  return { v:1, t:Date.now(),
    nodes:PB.nodes.map(n=>({ id:n.id, type:n.type, x:Math.round(n.x), y:Math.round(n.y),
      collapsed:!!n.collapsed, editMode:n.editMode, vis:n.vis, params:n.params })),
    edges:PB.edges.map(e=>({ from:e.from, fromPort:e.fromPort, to:e.to, toPort:e.toPort })) };
}
function deserialize(patch){
  if(!patch||!Array.isArray(patch.nodes)) return false;
  const wasRunning=PB.running; if(wasRunning) stop();
  clearGraph();
  const map={};                                          // saved id -> rebuilt id (PB.seq differs)
  for(const sn of patch.nodes){
    if(!NODE_DEFS[sn.type]) continue;
    const n=addNode(sn.type, sn.x||40, sn.y||40, sn.params);
    if(sn.vis) n.vis=sn.vis; if(sn.editMode) n.editMode=sn.editMode;
    map[sn.id]=n.id;
    if(sn.collapsed){ n.collapsed=true; const b=n.el&&n.el.querySelector(".pb-node__body"); if(b) b.style.display="none";
      const t=n.el&&n.el.querySelector(".pb-node__tog"); if(t) t.textContent="▸"; }
    if((sn.editMode||sn.vis)&&n.el){ const b=n.el.querySelector(".pb-node__body"); if(b) renderBody(n,b); if(n._edLbl) n._edLbl(); }
  }
  for(const se of (patch.edges||[])) if(map[se.from]&&map[se.to]) addEdge(map[se.from],se.fromPort,map[se.to],se.toPort);
  PB.engine.recalcClock();
  if(wasRunning) start();
  fitView(); return true;
}
// localStorage named slots
const PKEY="pb:patch:";
function listPatches(){ const out=[];
  for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.indexOf(PKEY)===0) out.push(k.slice(PKEY.length)); }
  return out.sort(); }
function savePatch(name){ if(!name) return false; localStorage.setItem(PKEY+name, JSON.stringify(serialize())); return true; }
function loadPatch(name){ const s=localStorage.getItem(PKEY+name); if(!s) return false;
  try{ return deserialize(JSON.parse(s)); }catch(e){ console.warn("loadPatch",e); return false; } }
function deletePatch(name){ localStorage.removeItem(PKEY+name); }
// file export / import
function exportPatch(){
  const blob=new Blob([JSON.stringify(serialize(),null,1)],{type:"application/json"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download="rewire-"+Date.now()+".json"; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importPatch(file,cb){
  const r=new FileReader();
  r.onload=()=>{ let ok=false; try{ ok=deserialize(JSON.parse(r.result)); }catch(e){ console.warn("importPatch",e); } cb&&cb(ok); };
  r.readAsText(file);
}

// =====================================================================
//  Rendering — DOM nodes + SVG wires
// =====================================================================
const canvas = () => document.getElementById("canvas");
const svg = () => document.getElementById("wires");

function renderNode(n){
  const def=NODE_DEFS[n.type];
  const el=document.createElement("div");
  el.className="pb-node pb-node--"+def.cls; el.style.left=n.x+"px"; el.style.top=n.y+"px";
  el.dataset.id=n.id;
  // header
  const head=document.createElement("div"); head.className="pb-node__head";
  head.innerHTML=`<span>${def.title}</span>`;
  if(window.PB.help) PB.help.node(head.querySelector("span"),n.type);   // node-level help on the title
  const tog=document.createElement("span"); tog.className="pb-node__tog"; tog.textContent=n.collapsed?"▸":"▾";
  tog.addEventListener("click",ev=>{ ev.stopPropagation(); n.collapsed=!n.collapsed; tog.textContent=n.collapsed?"▸":"▾"; body.style.display=n.collapsed?"none":""; drawWires(); });
  const help=document.createElement("span"); help.className="pb-node__help"; help.textContent="?"; help.title="toggle control help";
  help.addEventListener("click",ev=>{ ev.stopPropagation(); n.helpMode=!n.helpMode;
    el.classList.toggle("pb-node--help",n.helpMode); help.classList.toggle("on",n.helpMode); if(!n.helpMode&&window.PB.help) PB.help.hide(); });
  const clone=document.createElement("span"); clone.className="pb-node__clone"; clone.textContent="❐"; clone.title="clone";
  clone.addEventListener("click",ev=>{ ev.stopPropagation(); cloneNode(n); });
  const del=document.createElement("span"); del.className="pb-node__del"; del.textContent="✕";
  del.addEventListener("click",ev=>{ ev.stopPropagation(); removeNode(n); });
  head.appendChild(tog); head.appendChild(help);
  if(window.PB.visual && PB.visual.has(n.type)){               // text/visual editor toggle
    const ed=document.createElement("span"); ed.className="pb-node__edit"; ed.title="text / visual editor";
    const setLbl=()=>ed.textContent = n.editMode==="visual" ? "T" : "▦";
    ed.addEventListener("click",ev=>{ ev.stopPropagation();
      n.editMode = n.editMode==="visual" ? "text" : "visual"; setLbl(); renderBody(n,body); drawWires(); });
    head.appendChild(ed); n._edLbl=setLbl;
  }
  head.appendChild(clone); head.appendChild(del); el.appendChild(head);
  // ports row
  const prow=document.createElement("div"); prow.className="pb-node__ports";
  const incol=document.createElement("div"); incol.className="pb-ports pb-ports--in";
  const outcol=document.createElement("div"); outcol.className="pb-ports pb-ports--out";
  def.ins.forEach(p=>incol.appendChild(portEl(n,"in",p)));
  def.outs.forEach(p=>outcol.appendChild(portEl(n,"out",p)));
  prow.appendChild(incol); prow.appendChild(outcol); el.appendChild(prow);
  // body (params) — visual editor or raw controls, per node.editMode
  const body=document.createElement("div"); body.className="pb-node__body"; if(n.collapsed) body.style.display="none";
  el.appendChild(body); renderBody(n,body); if(n._edLbl) n._edLbl();

  head.addEventListener("pointerdown",e=>startDragNode(e,n,el));
  canvas().appendChild(el); n.el=el;
}
// fill a node body: visual editor when editMode==="visual" and one exists, else the raw controls
function renderBody(n,body){
  body.innerHTML="";
  if(n.editMode===undefined) n.editMode = (window.PB.visual && PB.visual.has(n.type)) ? "visual" : "text";
  if(n.editMode==="visual" && window.PB.visual && PB.visual.has(n.type)) body.appendChild(PB.visual.build(n));
  else NODE_DEFS[n.type].controls.forEach(c=>body.appendChild(controlEl(n,c)));
}
function portEl(n,dir,p){
  const w=document.createElement("div"); w.className="pb-port pb-port--"+dir;
  const dot=document.createElement("span"); dot.className="pb-dot pb-dot--"+p.type;
  dot.dataset.id=n.id; dot.dataset.port=p.name; dot.dataset.dir=dir; dot.dataset.type=p.type;
  const lbl=document.createElement("span"); lbl.className="pb-port__lbl"; lbl.textContent=p.name;
  if(dir==="in"){ w.appendChild(dot); w.appendChild(lbl); } else { w.appendChild(lbl); w.appendChild(dot); }
  dot.addEventListener("pointerdown",e=>startDragWire(e,n,dir,p));
  dot.addEventListener("dblclick",e=>{ e.stopPropagation();
    PB.edges.filter(ed=>(dir==="in"?(ed.to===n.id&&ed.toPort===p.name):(ed.from===n.id&&ed.fromPort===p.name))).slice().forEach(removeEdge); });
  return w;
}
function controlEl(n,c){
  const wrap=document.createElement("label"); wrap.className="pb-ctl";
  const span=document.createElement("span"); span.className="pb-ctl__k"; span.textContent=c.k;
  wrap.appendChild(span);
  let v=n.params[c.k];
  if(c.t==="range"){
    const out=document.createElement("span"); out.className="pb-ctl__v"; out.textContent=v+(c.unit||""); span.appendChild(out);
    const inp=document.createElement("input"); inp.type="range"; inp.min=c.min; inp.max=c.max; inp.step=c.step; inp.value=v; inp.dataset.k=c.k;
    inp.addEventListener("input",()=>{ const nv=parseFloat(inp.value); out.textContent=nv+(c.unit||""); setParam(n,c.k,nv); });
    wrap.appendChild(inp);
  } else if(c.t==="select"){
    const sel=document.createElement("select");
    c.opts.forEach(o=>{ const op=document.createElement("option"); op.value=o; op.textContent=o===""?"— none —":o; if(o===v) op.selected=true; sel.appendChild(op); });
    sel.addEventListener("change",()=>setParam(n,c.k,sel.value)); wrap.appendChild(sel);
  } else if(c.t==="check"){
    const inp=document.createElement("input"); inp.type="checkbox"; inp.checked=!!v; inp.className="pb-check";
    inp.addEventListener("change",()=>setParam(n,c.k,inp.checked)); span.appendChild(inp);
  } else if(c.t==="csv"||c.t==="json"||c.t==="strcsv"){
    const ta=document.createElement("textarea"); ta.rows=c.rows||3; ta.spellcheck=false;
    ta.value = c.t==="json" ? JSON.stringify(v) : (v||[]).join(", ");
    ta.addEventListener("change",()=>{
      try{ let parsed;
        if(c.t==="csv") parsed=ta.value.split(/[,\s]+/).filter(Boolean).map(Number);
        else if(c.t==="strcsv") parsed=ta.value.split(/[,\s]+/).filter(Boolean);
        else parsed=JSON.parse(ta.value);
        setParam(n,c.k,parsed); ta.classList.remove("bad"); }
      catch(e){ ta.classList.add("bad"); } });
    wrap.appendChild(ta);
  }
  if(window.PB.help) PB.help.ctl(wrap,n.type,c.k);
  return wrap;
}

// ---- wire drawing (SVG bezier between port dots) --------------------
function dotCenter(id,dir,port){
  const dot=canvas().querySelector(`.pb-dot[data-id="${id}"][data-port="${port}"][data-dir="${dir}"]`);
  if(!dot) return null; const r=dot.getBoundingClientRect(), cr=canvas().getBoundingClientRect();
  return {x:r.left-cr.left+canvas().scrollLeft+r.width/2, y:r.top-cr.top+canvas().scrollTop+r.height/2};
}
function bezier(a,b){ const dx=Math.max(40,Math.abs(b.x-a.x)*.5); return `M${a.x},${a.y} C${a.x+dx},${a.y} ${b.x-dx},${b.y} ${b.x},${b.y}`; }
function drawWires(){
  const s=svg(); s.setAttribute("width",canvas().scrollWidth); s.setAttribute("height",canvas().scrollHeight);
  let h="";
  for(const e of PB.edges){
    const a=dotCenter(e.from,"out",e.fromPort), b=dotCenter(e.to,"in",e.toPort); if(!a||!b) continue;
    h+=`<path class="pb-wire pb-wire--${e.type}" d="${bezier(a,b)}" data-edge="${PB.edges.indexOf(e)}"/>`;
  }
  s.innerHTML=h+(PB._temp||"");
  s.querySelectorAll(".pb-wire").forEach(p=>p.addEventListener("click",()=>{ const e=PB.edges[+p.dataset.edge]; if(e) removeEdge(e); }));
}
const drawWires_raf = ()=>requestAnimationFrame(drawWires);

// ---- dragging nodes -------------------------------------------------
function startDragNode(e,n,el){
  if(e.target.closest(".pb-node__tog,.pb-node__clone,.pb-node__del")) return;
  e.preventDefault(); const sx=e.clientX, sy=e.clientY, ox=n.x, oy=n.y;
  const mv=ev=>{ n.x=ox+(ev.clientX-sx); n.y=oy+(ev.clientY-sy); el.style.left=n.x+"px"; el.style.top=n.y+"px"; drawWires(); };
  const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); };
  window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
}
// ---- dragging wires -------------------------------------------------
function startDragWire(e,n,dir,p){
  e.preventDefault(); e.stopPropagation();
  const from = dotCenter(n.id,dir,p.name);
  const mv=ev=>{ const cr=canvas().getBoundingClientRect();
    const to={x:ev.clientX-cr.left+canvas().scrollLeft, y:ev.clientY-cr.top+canvas().scrollTop};
    const a=dir==="out"?from:to, b=dir==="out"?to:from;
    PB._temp=`<path class="pb-wire pb-wire--${p.type} pb-wire--temp" d="${bezier(a,b)}"/>`; drawWires(); };
  const up=ev=>{
    window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up);
    PB._temp=""; const tgt=document.elementFromPoint(ev.clientX,ev.clientY);
    if(tgt&&tgt.classList.contains("pb-dot")&&tgt.dataset.dir!==dir){
      if(dir==="out") addEdge(n.id,p.name,tgt.dataset.id,tgt.dataset.port);
      else addEdge(tgt.dataset.id,tgt.dataset.port,n.id,p.name);
    } else drawWires();
  };
  window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
}

// keep wires aligned to the (possibly larger) content + on scroll
function fitView(){ drawWires(); }
canvas && document.addEventListener("scroll",e=>{ if(e.target===canvas()) drawWires(); },true);
window.addEventListener("resize",drawWires);

// reflect a (modulated) value back onto a node's slider UI
function reflect(node,key,val,unit){
  if(!node.el) return; const inp=node.el.querySelector(`input[data-k="${key}"]`); if(!inp) return;
  inp.value=val; const ctl=inp.closest(".pb-ctl"), out=ctl&&ctl.querySelector(".pb-ctl__v");
  if(out) out.textContent=(Math.round(val*100)/100)+(unit||"");
}
PB.app={ addNode, removeNode, addEdge, removeEdge, loadSpec, start, stop, NODE_DEFS, clearGraph, drawWires, node, setParam, reflect, setSelectActive, advanceSelect,
  serialize, deserialize, listPatches, savePatch, loadPatch, deletePatch, exportPatch, importPatch };
