/* =====================================================================
   Tracker view — a ScreamTracker-style pattern grid. Each voice is a
   column; rows are sixteenth-steps. The view scrolls CONTINUOUSLY through
   a multi-bar buffer (past + lookahead, from PB.caps) past a centered
   playhead, at tempo. Draggable window; columns add/remove voices + M/S.
   ===================================================================== */
(function(){
  const VOICE_TYPES=["drums","bass","lead","pad"];
  const COLCLS={drums:"d",bass:"b",lead:"l",pad:"p"};

  const panel=document.createElement("div"); panel.id="tracker";
  panel.innerHTML=`
    <div class="trk__head" id="trkHead">
      <span class="trk__title">TRACKER</span>
      <span class="trk__sec" id="trkSec">—</span>
      <span class="trk__add">+
        <button data-add="drums">DR</button><button data-add="bass">BA</button>
        <button data-add="lead">LE</button><button data-add="pad">PA</button>
      </span>
      <span class="trk__min" id="trkMin">▾</span>
    </div>
    <div class="trk__grid" id="trkGrid"></div>`;
  document.body.appendChild(panel);

  const grid=document.getElementById("trkGrid");
  let sig="", cols=[], rowH=19, playRow=null;

  const voiceNodes=()=>PB.nodes.filter(n=>VOICE_TYPES.includes(n.type));
  const capsOrder=()=>PB.caps.map(e=>e.absBar);

  // bin a voice's absolute-time events onto this master bar's 16 steps
  function binBar(nodeId,e){
    const out=new Array(16).fill(""); const evs=PB.events&&PB.events[nodeId]; if(!evs) return out;
    const step=e.spb/4;
    for(let i=evs.length-1;i>=0;i--){ const rel=evs[i].t-e.t;
      if(rel<-step*0.5) break;            // events are time-ordered; older than this bar -> stop
      if(rel>=e.bar) continue;            // not yet in this bar
      let r=Math.round(rel/step); if(r<0)r=0; if(r>15)r=15;
      if(evs[i].drum){ if(!out[r])out[r]=""; if(!out[r].includes(evs[i].g)) out[r]=(out[r]+evs[i].g).slice(0,4); }
      else if(!out[r]) out[r]=evs[i].g;
    }
    return out;
  }

  // rebuild the whole table when columns or the set of buffered bars changes
  function build(){
    cols=voiceNodes();
    let h='<table class="trk__t"><thead><tr><th class="trk__rn">#</th>';
    cols.forEach((n,ci)=>{ h+=`<th class="trk__ch trk__ch--${COLCLS[n.type]}">
      <div class="trk__cn">${n.type}</div>
      <div class="trk__cb"><button data-m="${ci}" class="${n.muted?'on':''}" title="mute">M</button>
      <button data-s="${ci}" class="${n.solo?'on':''}" title="solo">S</button>
      <button data-x="${ci}" title="remove">✕</button></div></th>`; });
    h+="</tr></thead><tbody>";
    for(const e of PB.caps){
      const binned=cols.map(col=>binBar(col.id,e));
      for(let r=0;r<16;r++){
        h+=`<tr data-abs="${e.absBar}" data-step="${r}" class="${r%4===0?'beat ':''}${e.absBar%2?'odd':''}">`+
           `<td class="trk__rn">${String(r).padStart(2,"0")}</td>`;
        for(let c=0;c<cols.length;c++) h+=`<td class="trk__cell">${binned[c][r]||""}</td>`;
        h+="</tr>";
      }
    }
    h+="</tbody></table>";
    grid.innerHTML=h;
    grid.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{ const n=cols[+b.dataset.m]; n.muted=!n.muted; b.classList.toggle("on",n.muted); });
    grid.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{ const n=cols[+b.dataset.s]; n.solo=!n.solo; b.classList.toggle("on",n.solo); });
    grid.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{ PB.app.removeNode(cols[+b.dataset.x]); sig=""; });
    const first=grid.querySelector("tbody tr"); if(first) rowH=first.offsetHeight||19;
    playRow=null;
  }

  function addVoice(type){
    const f=t=>PB.nodes.find(n=>n.type===t);
    const clk=f("clock"),ch=f("chords"),sc=f("scale"),mo=f("motif"),out=f("output");
    const n=PB.app.addNode(type, 430+Math.random()*70, 470+Math.random()*50);
    if(clk) PB.app.addEdge(clk.id,"clock",n.id,"clock");
    if(ch&&type!=="drums") PB.app.addEdge(ch.id,"chords",n.id,"chords");
    if(sc&&type==="lead") PB.app.addEdge(sc.id,"scale",n.id,"scale");
    if(mo&&type==="lead") PB.app.addEdge(mo.id,"motif",n.id,"motif");
    if(out) PB.app.addEdge(n.id,"out",out.id,"in");
    PB.app.drawWires(); sig="";
  }
  panel.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>addVoice(b.dataset.add));
  document.getElementById("trkMin").onclick=()=>{ panel.classList.toggle("min"); document.getElementById("trkMin").textContent=panel.classList.contains("min")?"▴":"▾"; };

  // ---- draggable window (like the nodes) ----
  const head=document.getElementById("trkHead");
  head.addEventListener("pointerdown",e=>{
    if(e.target.closest("button,.trk__min")) return;
    e.preventDefault(); const r=panel.getBoundingClientRect();
    panel.style.left=r.left+"px"; panel.style.top=r.top+"px"; panel.style.right="auto"; panel.style.bottom="auto";
    const sx=e.clientX, sy=e.clientY, ox=r.left, oy=r.top;
    const mv=ev=>{ panel.style.left=(ox+ev.clientX-sx)+"px"; panel.style.top=(oy+ev.clientY-sy)+"px"; };
    const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); };
    window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
  });

  function currentEntry(){
    if(!PB.ctx||!PB.caps.length) return null; const now=PB.ctx.currentTime;
    for(const e of PB.caps) if(now>=e.t && now<e.t+e.bar) return e;
    return PB.caps[PB.caps.length-1];
  }

  function tick(){
    const s=voiceNodes().map(n=>n.id+(n.muted?"m":"")+(n.solo?"s":"")).join(",")+"|"+capsOrder().join(",");
    if(s!==sig){ sig=s; build(); }
    const e=currentEntry();
    document.getElementById("trkSec").textContent = !PB.running ? "stopped" : (e?e.sec:"");
    if(e){
      const idx=PB.caps.indexOf(e);
      let f=0; if(PB.running && PB.ctx){ const now=PB.ctx.currentTime; if(now>=e.t&&now<e.t+e.bar) f=(now-e.t)/(e.spb/4); }
      // smooth scroll: keep the playing row centered in the viewport
      const rowFloat=idx*16+f;
      const target=rowFloat*rowH - (grid.clientHeight-rowH)/2;
      grid.scrollTop=Math.max(0,target);
      // move highlight
      const stepRow = grid.querySelector(`tbody tr[data-abs="${e.absBar}"][data-step="${Math.min(15,Math.floor(f))}"]`);
      if(stepRow!==playRow){ if(playRow) playRow.classList.remove("play"); if(PB.running&&stepRow) stepRow.classList.add("play"); playRow=PB.running?stepRow:null; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
