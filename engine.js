/* =====================================================================
   Patchbay audio engine — a graph-driven, LIVE-routed reimagining of the
   Sounds Smashing synth. Each voice is a node; wiring = real Web Audio
   connections; each voice exposes a STYLE dropdown with several algorithms
   so the once-monotonic bass (and everything else) can be played with.

   Shared state + the node/edge model live on window.PB (see app.js).
   This file owns: AudioContext, the scheduler, and the voice synths.
   ===================================================================== */
window.PB = window.PB || {};
PB.nodes = PB.nodes || [];
PB.edges = PB.edges || [];

// ---- capture: record note events with ABSOLUTE time so the tracker can
//      bin any voice (even one on a different clock) onto the master grid.
PB.caps = [];          // master-bar ring for the tracker grid: {absBar,t,bar,spb,sec}
PB.events = {};        // nodeId -> [{t, g, drum}] absolute-time events
PB.track = true;
PB._capId = null;      // node currently emitting (set per voice bar in tick)
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function freqToName(f){
  if(!isFinite(f)||f<=0) return "";
  const m=Math.round(69+12*Math.log2(f/440));
  const n=NOTE_NAMES[((m%12)+12)%12]; return (n.length<2?n+"-":n)+(Math.floor(m/12)-1);
}
function capNote(t,name){ if(!PB.track||!PB._capId) return; (PB.events[PB._capId]||(PB.events[PB._capId]=[])).push({t,g:name,drum:false}); }
function capDrum(t,g){ if(!PB.track||!PB._capId) return; (PB.events[PB._capId]||(PB.events[PB._capId]=[])).push({t,g,drum:true}); }

// ---- musical clock --------------------------------------------------
PB.clock = { bpm:120, spb:.5, bar:2, halfBeat:.25, swing:0, arrange:"evolve" };
function recalcClock(){
  const c = PB.nodes.find(n=>n.type==="clock");
  const p = c ? c.params : {bpm:120,swing:0,arrange:"evolve"};
  PB.clock.bpm = p.bpm||120;
  PB.clock.spb = 60/PB.clock.bpm;
  PB.clock.bar = PB.clock.spb*4;
  PB.clock.halfBeat = PB.clock.spb/2;
  PB.clock.swing = p.swing||0;
  PB.clock.arrange = p.arrange||"evolve";
}

// ---- shared pattern/timbre tables (from the original engine) ---------
const SECT_BARS = 8;
const DENSITY = {
  sparse:{kicks:[0],snares:[8],hats:[0,4,8,12],lastBarSnare:null},
  normal:{kicks:[0,8],snares:[4,12],hats:[0,2,4,6,8,10,12,14],lastBarSnare:14},
  dense:{kicks:[0,4,8,12],snares:[4,6,12,14],hats:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],lastBarSnare:14},
};
const NAMED_DRUMS = {
  "rock-backbeat":{kicks:[0,8],snares:[4,12],hats:[0,2,4,6,8,10,12,14],lastBarSnare:14},
  "disco-four-on-floor":{kicks:[0,4,8,12],snares:[4,12],hats:[0,2,4,6,8,10,12,14],lastBarSnare:null},
  breakbeat:{kicks:[0,7],snares:[4,12,14],hats:[0,2,4,6,8,10,12,14],lastBarSnare:10},
  shuffle:{kicks:[0,8],snares:[4,12],hats:[0,2,4,6,8,10,12,14],lastBarSnare:14},
  samba:{kicks:[0,6,8,14],snares:[3,11],hats:[0,4,8,12],lastBarSnare:null},
  "trap-rolls":{kicks:[0,6,8],snares:[4,12],hats:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],lastBarSnare:null},
  bossa:{kicks:[0,5,8,11],snares:[],hats:[0,2,4,6,8,10,12,14],lastBarSnare:null},
  motorik:{kicks:[0,4,8,12],snares:[4,12],hats:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],lastBarSnare:null},
  "half-time":{kicks:[0],snares:[8],hats:[0,2,4,6,8,10,12,14],lastBarSnare:null},
  dembow:{kicks:[0,6,8,14],snares:[4,12],hats:[0,2,4,6,8,10,12,14],lastBarSnare:null},
};
const BUSY = {
  chunky:{bar0:[0,1,2,3,4,6,8,10,12,14],bar1:[0,2,4,6,8,10,12,13,14,15]},
  galloping:{bar0:[0,1,4,5,8,9,10,12,13,15],bar1:[0,1,4,5,8,9,12,13,14,15]},
  syncopated:{bar0:[0,3,4,7,8,11,12,13,14,15],bar1:[0,3,4,7,8,9,11,12,14,15]},
  flurry:{bar0:[0,1,2,3,4,5,8,10,12,14],bar1:[0,2,3,4,5,8,10,11,13,15]},
  driving:{bar0:[0,2,3,4,6,8,10,11,12,14],bar1:[0,2,4,6,7,8,10,12,14,15]},
};
const KITS = {
  default:{kickPitch:120,kickEnd:45,kickDecay:.1,snareFreq:1800,snareDecay:.09,hatHpf:7e3,hatDecay:.025},
  lofi:{kickPitch:90,kickEnd:35,kickDecay:.18,snareFreq:1200,snareDecay:.07,hatHpf:5e3,hatDecay:.02},
  punchy:{kickPitch:150,kickEnd:50,kickDecay:.07,snareFreq:2200,snareDecay:.06,hatHpf:9e3,hatDecay:.018},
  acoustic:{kickPitch:90,kickEnd:50,kickDecay:.2,snareFreq:2e3,snareDecay:.12,hatHpf:7500,hatDecay:.04},
  "808":{kickPitch:80,kickEnd:30,kickDecay:.3,snareFreq:2500,snareDecay:.04,hatHpf:9e3,hatDecay:.012},
  distorted:{kickPitch:110,kickEnd:40,kickDecay:.13,snareFreq:1500,snareDecay:.1,hatHpf:6e3,hatDecay:.022},
};
// the 8-section arrangement: kind + busy/poly flags
const SECTION_DEFS = [
  {name:"tonal", kind:"tonal"},               {name:"var", kind:"var"},
  {name:"poly", kind:"var", poly:true},       {name:"build", kind:"build"},
  {name:"tonal+",kind:"tonal", busy:true},    {name:"var+", kind:"var", busy:true},
  {name:"poly+", kind:"var", poly:true,busy:true}, {name:"build+",kind:"build",busy:true},
];

const SECTION_BY_NAME = {}; SECTION_DEFS.forEach(d=>SECTION_BY_NAME[d.name]=d);
const DEFAULT_ARRANGE = SECTION_DEFS.map(d=>d.name);

// ---- helpers --------------------------------------------------------
const C = () => PB.ctx;
const clamp01 = x => Math.max(0,Math.min(1,x));
function chordTones(c){ const a=[c.r,c.t,c.f,c.o]; if(typeof c.s==="number") a.push(c.s); return a; }
function chordPlan(chords){
  const out=[]; let bAt=0;
  for(let i=0;i<chords.length;i++){
    const b=chords[i], n=(typeof b.bars==="number"&&b.bars>0)?b.bars:2;
    out.push({chordIdx:i,chord:b,startBar:bAt,bars:n}); bAt+=n; if(bAt>=SECT_BARS) break;
  }
  return out;
}
function blockAt(chords,bInSec){
  for(const blk of chordPlan(chords))
    if(bInSec>=blk.startBar && bInSec<blk.startBar+blk.bars) return blk;
  return null;
}
function pickRow(arr,idx){ return arr ? (Array.isArray(arr[0]) ? arr[idx%arr.length] : arr) : null; }
function motifPool(chord,scale,mode){
  if(mode==="scale" && Array.isArray(scale) && scale.length) return scale;
  return chordTones(chord);
}
function swingOff(step,spb,amt){
  if(!amt||amt<=0||step%4!==2) return 0;
  return Math.max(0,Math.min(100,amt))/100*(spb/6);
}

// ---- low-level voices (oscillator / noise + envelope) ---------------
// All connect into `out` (a node's audioOut gain) so routing is live.
function osc(out,freq,t,dur,wave,gain,shape){
  if(gain<=1e-6||!isFinite(freq)||freq<=0) return;
  const ctx=C(), o=ctx.createOscillator(), g=ctx.createGain();
  o.type=wave; o.frequency.value=freq;
  g.gain.setValueAtTime(1e-4,t);
  if(shape==="pluck"){ g.gain.linearRampToValueAtTime(gain,t+.004); g.gain.exponentialRampToValueAtTime(1e-4,t+dur); }
  else if(shape==="pad"){ g.gain.linearRampToValueAtTime(gain,t+.4); g.gain.setValueAtTime(gain,t+Math.max(.4,dur-.4)); g.gain.exponentialRampToValueAtTime(1e-4,t+dur); }
  else { g.gain.linearRampToValueAtTime(gain,t+.006); g.gain.exponentialRampToValueAtTime(gain*.4,t+dur*.5); g.gain.exponentialRampToValueAtTime(1e-4,t+dur); }
  o.connect(g).connect(out); o.start(t); o.stop(t+dur+.05);
  capNote(t,freqToName(freq));
}
function noiseBuf(dur){
  const ctx=C(), b=ctx.createBuffer(1,Math.max(1,Math.floor(ctx.sampleRate*dur)),ctx.sampleRate);
  const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b;
}
function kick(out,t,amp,kit){
  const ctx=C(), o=ctx.createOscillator(), g=ctx.createGain(); o.type="triangle";
  o.frequency.setValueAtTime(kit.kickPitch,t); o.frequency.exponentialRampToValueAtTime(kit.kickEnd,t+.06);
  g.gain.setValueAtTime(1e-4,t); g.gain.linearRampToValueAtTime(amp,t+.003); g.gain.exponentialRampToValueAtTime(1e-4,t+kit.kickDecay);
  o.connect(g).connect(out); o.start(t); o.stop(t+kit.kickDecay+.02);
  capDrum(t,"K");
}
function snare(out,t,amp,kit){
  const ctx=C(), s=ctx.createBufferSource(); s.buffer=noiseBuf(Math.max(.05,kit.snareDecay+.02));
  const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=kit.snareFreq; bp.Q.value=1;
  const g=ctx.createGain(); g.gain.setValueAtTime(1e-4,t); g.gain.linearRampToValueAtTime(amp,t+.002); g.gain.exponentialRampToValueAtTime(1e-4,t+kit.snareDecay);
  s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t+kit.snareDecay+.05);
  capDrum(t,"S");
}
function hat(out,t,amp,kit,open){
  const ctx=C(), dur=open?.22:.03, s=ctx.createBufferSource(); s.buffer=noiseBuf(dur);
  const hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=open?Math.max(4e3,kit.hatHpf-1500):kit.hatHpf;
  const dec=open?.18:kit.hatDecay, g=ctx.createGain();
  g.gain.setValueAtTime(1e-4,t); g.gain.linearRampToValueAtTime(amp,t+.001); g.gain.exponentialRampToValueAtTime(1e-4,t+dec);
  s.connect(hp).connect(g).connect(out); s.start(t); s.stop(t+Math.max(dur,dec));
  capDrum(t,open?"o":"h");
}
function clap(out,t,amp){
  const ctx=C(), offs=[0,.012,.024,.038];
  for(let b=0;b<offs.length;b++){
    const s=ctx.createBufferSource(); s.buffer=noiseBuf(.04);
    const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1500; bp.Q.value=2;
    const g=ctx.createGain(), a=amp*(b===offs.length-1?1:.6);
    g.gain.setValueAtTime(1e-4,t+offs[b]); g.gain.linearRampToValueAtTime(a,t+offs[b]+.002); g.gain.exponentialRampToValueAtTime(1e-4,t+offs[b]+.045);
    s.connect(bp).connect(g).connect(out); s.start(t+offs[b]); s.stop(t+offs[b]+.04);
  }
  capDrum(t,"C");
}
function tom(out,t,freq,amp){
  const ctx=C(), o=ctx.createOscillator(), g=ctx.createGain(); o.type="triangle";
  o.frequency.setValueAtTime(freq*1.6,t); o.frequency.exponentialRampToValueAtTime(freq,t+.08);
  g.gain.setValueAtTime(1e-4,t); g.gain.linearRampToValueAtTime(amp,t+.003); g.gain.exponentialRampToValueAtTime(1e-4,t+.16);
  o.connect(g).connect(out); o.start(t); o.stop(t+.18);
  capDrum(t,"T");
}

// =====================================================================
//  DRUMS — density / named-pattern / kit, with section fills
// =====================================================================
function emitDrums(out,t,bInSec,sec,p,env){
  const kit=KITS[p.kit]||KITS.default, spb=env.spb, six=spb/4;
  if(sec.kind==="build" && bInSec===SECT_BARS-1){          // build turnaround
    for(let n=0;n<8;n++) snare(out,t+n*(spb/4),.42*p.gain,kit);
    const toms=[200,160,120,80]; for(let n=0;n<4;n++) tom(out,t+n*(spb/2),toms[n],.5*p.gain);
    return;
  }
  const lastSect=bInSec===SECT_BARS-1, midSect=bInSec===SECT_BARS/2-1;
  if(lastSect && sec.kind!=="build"){                       // end-of-section fill
    kick(out,t,.55*p.gain,kit); snare(out,t,.3*p.gain,kit); snare(out,t+spb,.4*p.gain,kit);
    const ramp=[70,80,95,110,130,150,175,200];
    for(let i=0;i<8;i++) tom(out,t+2*spb+i*(spb/4),ramp[i],.45*p.gain);
    return;
  }
  const grid = NAMED_DRUMS[p.pattern] || DENSITY[p.density] || DENSITY.normal;
  for(const s of grid.kicks) kick(out,t+s*six,(s===0?.55:.5)*p.gain,kit);
  for(const s of grid.snares) snare(out,t+s*six,.4*p.gain,kit);
  for(const s of grid.hats) hat(out,t+s*six,.1*p.gain,kit,false);
  if(midSect) for(let a=0;a<4;a++) snare(out,t+3*spb+a*(spb/4),.3*p.gain,kit);
  if(p.clap) for(const s of grid.snares) clap(out,t+s*six,.32*p.gain);
  if(p.openHat) for(const s of [2,6,10,14]) hat(out,t+s*six,.09*p.gain,kit,true);
}

// =====================================================================
//  BASS — the headliner: 8 style algorithms instead of one root note
// =====================================================================
const BASS_STYLES = ["sustain","pulse","walking","octaves","arp","offbeat","driving","sub"];
function emitBass(out,t,chord,bInSec,sec,p,env){
  const spb=env.spb, bar=env.bar, q=chordTones(chord);
  const div=(chord.r>200?4:2)/Math.pow(2,p.octave||0);   // octave knob shifts up/down
  const w=p.wave||"square", gain=.2*p.gain, lo=f=>f/div;
  const N=(f,tt,d,sh)=>osc(out,lo(f),tt,d,w,gain,sh);
  switch(p.style){
    case "sustain": N(q[0],t,bar*.95,"sustain"); break;
    case "pulse":   for(let b=0;b<4;b++) N(q[0],t+b*spb,spb*.6,"pluck"); break;
    case "octaves": for(let i=0;i<8;i++){ const f=(i%2===0)?q[0]:q[0]*2; N(f,t+i*(spb/2),spb*.45,"pluck"); } break;
    case "walking":{ const seq=[q[0],q[1],q[2],q[3],q[3],q[2],q[1],q[0]];
      for(let i=0;i<8;i++) N(seq[i],t+i*(spb/2),spb*.5,"sustain"); break; }
    case "arp":{ const seq=[q[0],q[1],q[2],q[3],q[2],q[1],q[2],q[3]];
      for(let i=0;i<8;i++) N(seq[i],t+i*(spb/2),spb*.4,"pluck"); break; }
    case "offbeat": for(let b=0;b<4;b++) N(q[0],t+b*spb+spb/2,spb*.4,"pluck"); break;
    case "driving":{ const pass=[q[0],q[0],q[0],q[2],q[0],q[0],q[2],q[1]];
      for(let i=0;i<8;i++) N(pass[i],t+i*(spb/2),spb*.42,"pluck"); break; }
    case "sub": { const o=C().createOscillator(),g=C().createGain(); o.type="sine"; o.frequency.value=lo(q[0])/2;
      g.gain.setValueAtTime(1e-4,t); g.gain.linearRampToValueAtTime(gain*1.4,t+.05); g.gain.setValueAtTime(gain*1.4,t+bar-.1); g.gain.exponentialRampToValueAtTime(1e-4,t+bar);
      o.connect(g).connect(out); o.start(t); o.stop(t+bar+.05); capNote(t,freqToName(lo(q[0])/2)); break; }
    default: N(q[0],t,bar*.9,"sustain");
  }
}

// =====================================================================
//  LEAD — motif / arp / walk styles, busy 16th grids, octave
// =====================================================================
const LEAD_STYLES = ["motif","arp","walk","stab"];
function emitLead(out,t,chord,bInSec,e,sec,scale,motif,p,env){
  const spb=env.spb, bar=env.bar, hb=env.halfBeat, sw=env.swing;
  const wave=p.wave||"square", mult=Math.pow(2,p.octave||0)*(sec.poly?2:1);
  const pool=motifPool(chord,scale,p.mode);
  const q=chordTones(chord), DET=Math.pow(2,-1/24), lastNote=chord.t*DET;
  const G=.1*p.gain;
  const lay=(freqs,steps)=>{ const six=bar/16;
    for(let i=0;i<steps.length;i++){ const nx=(i+1<steps.length?steps[i+1]:16);
      osc(out,freqs[i]*mult,t+steps[i]*six+swingOff(steps[i],spb,sw),(nx-steps[i])*six*.85,wave,G); } };
  const eighths=(seq)=>{ for(let n=0;n<8;n++) osc(out,seq[n]*mult,t+n*hb+swingOff(n*2,spb,sw),hb*.85,wave,G); };

  if(p.style==="arp"){                       // climbing arpeggio, ignores motif
    const seq=[q[0],q[1],q[2],q[3],q[2%q.length],q[3%q.length],q[1],q[2]];
    eighths(seq); return;
  }
  if(p.style==="walk"){                       // pseudo-random scale walk (seeded by bar)
    const sc=Array.isArray(scale)&&scale.length?scale:pool; let idx=(bInSec*3)%sc.length;
    const seq=[]; for(let n=0;n<8;n++){ seq.push(sc[idx]); idx=(idx+((n+bInSec)%2?2:-1)+sc.length)%sc.length; }
    eighths(seq); return;
  }
  if(p.style==="stab"){                        // one held chord-tone hit per bar
    osc(out,q[0]*mult,t,spb*.9,wave,G*1.4,"pad"); osc(out,q[2]*mult,t,spb*.9,wave,G*1.1,"pad"); return;
  }
  // ---- default: motif (faithful to the original 3-section behaviour) ----
  const C2=blockChordIdx(chord);             // for per-chord motif rows
  if(sec.kind==="tonal"){
    const row=pickRow(motif&&motif.leadMotif,C2)||[0,1,2,3,2,1,0,1];
    if(sec.busy){ const grid=BUSY[(motif&&motif.busyRhythm)||"chunky"], steps=e===0?grid.bar0:grid.bar1;
      lay((pickRow(motif&&motif.leadMotifBusy,C2)||[0,1,2,3,3,2,1,0,1,2]).map(i=>pool[i]),steps); }
    else eighths(row.map(i=>pool[i]));
  } else if(sec.kind==="var"){
    const rv=pickRow(motif&&motif.leadMotifVar,C2), rvb=pickRow(motif&&motif.leadMotifVarBusy,C2);
    if(sec.busy){ const grid=BUSY[(motif&&motif.busyRhythm)||"chunky"], steps=e===0?grid.bar0:grid.bar1;
      let f= rvb?rvb.map(i=>pool[i]): e===0?[q[0],q[1],q[2],q[3],q[1],q[2],q[1],q[0],q[1],q[2]]:[q[0],q[1],q[2],q[3],q[2],q[1],q[0],q[1],q[2],lastNote];
      if(e===1) f[f.length-1]=lastNote; lay(f,steps); }
    else { let seq= rv?rv.map(i=>pool[i]): e===0?[q[0],q[1],q[2],q[3],q[2],q[1],q[0],q[1]]:[q[0],q[1],q[2],q[3],q[2],q[1],q[0],lastNote];
      if(rv&&e===1) seq[seq.length-1]=lastNote; eighths(seq); }
  } else {                                     // build
    const rb=pickRow(motif&&motif.leadMotifBuild,C2), rbb=pickRow(motif&&motif.leadMotifBuildBusy,C2);
    let seq= rb?rb.map(i=>pool[i]): e===0?[q[0],q[1],q[2],q[3],q[2],q[1],q[0],q[1]]:[q[0],q[1],q[2],q[3],q[2],q[1],q[0],lastNote];
    if(rb&&e===1) seq[seq.length-1]=lastNote;
    if(bInSec===SECT_BARS-1){ for(let n=0;n<4;n++) osc(out,seq[n]*mult,t+n*hb+swingOff(n*2,spb,sw),hb*.85,wave,G); return; }
    if(sec.busy){ const grid=BUSY[(motif&&motif.busyRhythm)||"chunky"], steps=e===0?grid.bar0:grid.bar1;
      let f= rbb?rbb.map(i=>pool[i]): e===0?[q[0],q[1],q[2],q[3],q[1],q[2],q[1],q[0],q[1],q[2]]:[q[0],q[1],q[2],q[3],q[2],q[1],q[0],q[1],q[2],lastNote];
      if(e===1) f[f.length-1]=lastNote; lay(f,steps); }
    else eighths(seq);
  }
}
// motif rows are indexed per chord; we tag each chord object with its index in chordPlan
function blockChordIdx(chord){ return chord.__idx||0; }

// =====================================================================
//  PAD — sustained / swell / pulse / stab
// =====================================================================
const PAD_STYLES = ["sustain","swell","pulse","stab"];
function emitPad(out,t,chord,e,blockBars,sec,p,env){
  if(e!==0) return;                            // pads land on the first bar of a chord block
  const bar=env.bar, spb=env.spb, dur=blockBars*bar-.05, G=.06*p.gain, tones=chordTones(chord);
  if(p.style==="pulse"){ for(let b=0;b<blockBars*4;b++) for(const f of tones.slice(0,3)) osc(out,f,t+b*spb,spb*.5,"triangle",G,"pluck"); return; }
  if(p.style==="stab"){ for(const f of tones.slice(0,3)) osc(out,f,t,spb*.6,"triangle",G*1.4,"pluck"); return; }
  const shape = p.style==="swell" ? "pad" : "pad"; // both swell-ish; swell uses longer attack via osc 'pad'
  for(const f of tones) osc(out,f,t,dur,"triangle",G,shape);
}

// =====================================================================
//  Scheduler — bar-by-bar, resolves each voice's graph inputs live
// =====================================================================
function inputSrc(node,port){
  const e = PB.edges.find(ed=>ed.to===node.id && ed.toPort===port);
  return e ? PB.nodes.find(n=>n.id===e.from) : null;
}
function tagChords(chords){ return chords.map((c,i)=>Object.assign({},c,{__idx:i})); }

// resolve a voice's section: from a wired Arrange node, else the global clock
function sectionFor(node,absBar,gsec){
  const src=inputSrc(node,"arrange");
  if(src){ const steps=(src.params.steps&&src.params.steps.length)?src.params.steps:DEFAULT_ARRANGE;
    const def=SECTION_BY_NAME[steps[Math.floor(absBar/SECT_BARS)%steps.length]]||SECTION_DEFS[0];
    return {sec:def,bInSec:absBar%SECT_BARS}; }
  return {sec:gsec,bInSec:absBar%SECT_BARS};
}

function gsecFor(ab){ return PB.clock.arrange==="evolve" ? SECTION_DEFS[Math.floor(ab/SECT_BARS)%8] : {name:"loop",kind:"var"}; }

// emit ONE bar of a single voice at its own tempo (env), capturing events
function emitVoiceBar(node,t,barIdx,env){
  const gsec=gsecFor(barIdx);
  PB._capId = PB.track ? node.id : null;
  try{
    const {sec,bInSec}=sectionFor(node,barIdx,gsec);
    if(node.type==="drums"){ emitDrums(node.audioOut,t,bInSec,sec,node.params,env); return; }
    const chSrc=inputSrc(node,"chords");
    const chords = chSrc ? tagChords(chSrc.params.chords||[]) : null;
    if(!chords||!chords.length) return;        // pitched voices need a chord source
    const blk=blockAt(chords,bInSec); if(!blk) return;
    const chord=Object.assign({},blk.chord,{__idx:blk.chordIdx}), e=bInSec-blk.startBar;
    if(node.type==="bass") emitBass(node.audioOut,t,chord,bInSec,sec,node.params,env);
    else if(node.type==="pad"){ if(sec.kind!=="tonal") emitPad(node.audioOut,t,chord,e,blk.bars,sec,node.params,env); }
    else { const scSrc=inputSrc(node,"scale"), moSrc=inputSrc(node,"motif");
      emitLead(node.audioOut,t,chord,bInSec,e,sec,scSrc?scSrc.params.scaleHz:null,moSrc?moSrc.params:null,node.params,env); }
  }catch(err){ console.warn("voice",node.type,err); } finally { PB._capId=null; }
}

// Per-voice timelines: each voice runs at ITS connected clock's tempo, so
// multiple clocks produce true polytempo. A master timeline (primary clock)
// drives the tracker grid + global section + section label.
function tick(){
  if(!PB.running) return;
  const ctx=PB.ctx, now=ctx.currentTime, LA=1.5, env0=PB.clock, mbar=env0.bar;
  while(PB.master.cursor < now + mbar*LA){
    if(PB.track){ PB.caps.push({absBar:PB.master.absBar,t:PB.master.cursor,bar:mbar,spb:env0.spb,sec:gsecFor(PB.master.absBar).name});
      if(PB.caps.length>12) PB.caps.shift(); }
    if(PB.onBar) PB.onBar(PB.master.absBar);
    PB.master.cursor+=mbar; PB.master.absBar++;
  }
  const anySolo=PB.nodes.some(n=>n.solo);
  for(const node of PB.nodes){
    const clk=inputSrc(node,"clock"); if(!clk) continue;     // no clock -> idle
    const vbpm=clk.params.bpm||120, vbar=60/vbpm*4, vspb=60/vbpm;
    if(node.cursor==null){ node.cursor=PB.t0||now; node.barIdx=0; }
    if(node.type==="select"){
      while(node.cursor<now+vbar*LA){ if(PB.app&&PB.app.advanceSelect) PB.app.advanceSelect(node,node.barIdx); node.cursor+=vbar; node.barIdx++; }
      continue;
    }
    if(!node.audioOut) continue;
    if(node.muted || (anySolo && !node.solo)){               // keep phase, emit nothing
      while(node.cursor<now+vbar*LA){ node.cursor+=vbar; node.barIdx++; } continue; }
    const env={spb:vspb,bar:vbar,halfBeat:vspb/2,swing:clk.params.swing||0};
    while(node.cursor<now+vbar*LA){ emitVoiceBar(node,node.cursor,node.barIdx,env); node.cursor+=vbar; node.barIdx++; }
  }
  for(const k in PB.events){ const a=PB.events[k]; if(a.length>500) a.splice(0,a.length-500); }  // trim
  PB.timer=setTimeout(tick, Math.max(40, mbar*0.5*1000));
}

// =====================================================================
//  Modulation — LFO / Constant nodes drive "mod" input ports on targets
// =====================================================================
function modValue(src,now){
  if(src.type==="const") return clamp01(src.params.value);
  const p=src.params, period=Math.max(.05,(p.rate||1)*PB.clock.bar), ph=((now/period)%1+1)%1;
  let bip;
  switch(p.shape){
    case "triangle": bip = ph<.5 ? ph*4-1 : 3-ph*4; break;
    case "saw":      bip = ph*2-1; break;
    case "square":   bip = ph<.5 ? 1 : -1; break;
    case "s&h":      { const seed=Math.floor(now/period); const r=Math.sin(seed*127.13)*43758.5453; bip=(r-Math.floor(r))*2-1; break; }
    default:         bip = Math.sin(ph*2*Math.PI);     // sine
  }
  return clamp01((p.offset!=null?p.offset:.5) + .5*(p.depth!=null?p.depth:1)*bip);
}
function applyMod(node,key,v01){
  const A=PB.app; if(!A) return; const def=A.NODE_DEFS[node.type]; if(!def) return;
  const c=def.controls && def.controls.find(c=>c.k===key); if(!c) return;
  const mapped=c.min + v01*(c.max-c.min);
  if(def.audio==="voice" && key==="gain"){ if(node.audioOut) node.audioOut.gain.value=mapped; return; }
  if(A.setParam) A.setParam(node,key,mapped);
  if(A.reflect) A.reflect(node,key,mapped,c.unit);
}
function modLoop(){
  const now = PB.ctx ? PB.ctx.currentTime : performance.now()/1000;
  for(const e of PB.edges){
    if(e.type!=="mod") continue;
    const s=PB.nodes.find(n=>n.id===e.from), t=PB.nodes.find(n=>n.id===e.to);
    if(s&&t) applyMod(t,e.toPort,modValue(s,now));
  }
  requestAnimationFrame(modLoop);
}
requestAnimationFrame(modLoop);

PB.engine = { recalcClock, BASS_STYLES, LEAD_STYLES, PAD_STYLES,
  DENSITY, NAMED_DRUMS, BUSY, KITS, SECTION_DEFS, DEFAULT_ARRANGE, freqToName, tick };
