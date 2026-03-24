// ════════════════════════════════════════════════
//  GLOBAL STATE (must be before IIFEs)
// ════════════════════════════════════════════════
let simData={},currentStage=-1,simRunning=false;
let modMode='ask',lcMode='nrzl';
const STAGES=7;
const stageNames=['Input','Line Coding','Modulation','Multiplexing','Channel','Transport','Receiver'];

// ════════════════════════════════════════════════
//  PARTICLE BACKGROUND
// ════════════════════════════════════════════════
(function initParticles(){
  const c=document.getElementById('particleBg'),ctx=c.getContext('2d');
  let particles=[];
  function resize(){c.width=window.innerWidth;c.height=window.innerHeight}
  resize(); window.addEventListener('resize',resize);
  class P{
    constructor(){this.reset()}
    reset(){
      this.x=Math.random()*c.width;this.y=Math.random()*c.height;
      this.vx=(Math.random()-0.5)*0.3;this.vy=-Math.random()*0.5-0.1;
      this.char=Math.random()>0.5?'1':'0';
      this.size=Math.random()*10+8;this.alpha=Math.random()*0.08+0.02;
      this.life=Math.random()*400+200;this.age=0;
    }
    update(){
      this.x+=this.vx;this.y+=this.vy;this.age++;
      if(this.age>this.life||this.y<-20||this.x<-20||this.x>c.width+20)this.reset();
    }
    draw(){
      const fade=1-this.age/this.life;
      ctx.globalAlpha=this.alpha*fade;
      ctx.font=`${this.size}px JetBrains Mono,monospace`;
      ctx.fillStyle=this.char==='1'?'#e85d26':'#2563eb';
      ctx.fillText(this.char,this.x,this.y);
    }
  }
  for(let i=0;i<60;i++)particles.push(new P());
  function animate(){
    ctx.clearRect(0,0,c.width,c.height);
    particles.forEach(p=>{p.update();p.draw()});
    ctx.globalAlpha=1;
    requestAnimationFrame(animate);
  }
  animate();
})();

// ════════════════════════════════════════════════
//  LIVE SIGNAL ANIMATION
// ════════════════════════════════════════════════
(function initLiveSignal(){
  const c=document.getElementById('liveSigCanvas'),ctx=c.getContext('2d');
  let phase=0;
  function draw(){
    const W=c.offsetWidth||400;c.width=W;const H=c.height;
    ctx.clearRect(0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0,'#e85d26');grad.addColorStop(0.5,'#9333ea');grad.addColorStop(1,'#2563eb');
    ctx.strokeStyle=grad;ctx.lineWidth=2;ctx.shadowBlur=4;ctx.shadowColor='rgba(232,93,38,0.2)';
    ctx.beginPath();
    // Use simulation data to shape the wave if available
    const amp=simRunning?18:10;
    const complexity=simRunning?3:1;
    for(let x=0;x<W;x++){
      const t=x/W*Math.PI*8+phase;
      let y=H/2+Math.sin(t)*amp;
      if(complexity>1) y+=Math.sin(t*2.3+phase*0.7)*8+Math.sin(t*0.5+phase*1.3)*5;
      x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();ctx.shadowBlur=0;
    phase+=0.04;
    requestAnimationFrame(draw);
  }
  draw();
  // Functional throughput and signal info
  setInterval(()=>{
    if(simRunning&&simData.bits){
      // Calculate real throughput: bits / simulated transmission time
      // Manchester/Diff.Manchester double the signal rate, AMI/MLT-3 use multi-level
      const encodingOverhead={nrzl:1,nrzi:1,manchester:2,diffmanchester:2,ami:1,mlt3:0.67};
      const overhead=encodingOverhead[simData.lc||'nrzl']||1;
      const totalBits=simData.bits.length;
      const signalRate=Math.round(totalBits*overhead*1000/totalBits); // baud
      const effectiveBPS=Math.round(totalBits/overhead);
      const corrupted=simData.corrupted||0;
      const goodput=Math.round(effectiveBPS*(1-corrupted/totalBits));
      document.getElementById('liveThroughput').textContent=goodput+' bps';
      // Show carrier freq based on modulation
      const freqMap={ask:'1.0',fsk:'0.5 / 1.3',psk:'1.0',bpsk:'1.0'};
      document.getElementById('liveFreq').textContent=(freqMap[modMode||'ask']||'1.0')+' kHz';
    }else{
      document.getElementById('liveThroughput').textContent='0 bps';
      document.getElementById('liveFreq').textContent='— kHz';
    }
  },200);
})();


document.getElementById('noiseSlider').addEventListener('input',function(){
  document.getElementById('noiseVal').textContent=this.value+'%';
});

// ════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════
function charToBin(c){return c.charCodeAt(0).toString(2).padStart(8,'0')}
function binToChar(b){return String.fromCharCode(parseInt(b,2))}
function textToBinary(t){return t.split('').map(charToBin).join('')}
function binaryToText(bits){
  let r='';for(let i=0;i<bits.length;i+=8){const b=bits.slice(i,i+8);if(b.length===8)r+=binToChar(b)}return r;
}
function formatBits(bits){
  return bits.split('').map(b=>`<span class="bit-${b}">${b}</span>`).join('');
}
function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// ════════════════════════════════════════════════
//  START / RESET
// ════════════════════════════════════════════════
function startSim(){
  const text=document.getElementById('userInput').value.trim();
  if(!text){alert('Please enter some text!');return}
  const noise=parseInt(document.getElementById('noiseSlider').value);
  const delay=document.getElementById('delayToggle').checked;
  const lc=document.getElementById('lineCodeSel').value;
  const bits=textToBinary(text);
  const u2bits=textToBinary('XY'.slice(0,text.length>1?2:1));
  const u3bits=textToBinary('AB'.slice(0,text.length>1?2:1));
  const rxBits=applyNoise(bits,noise);
  let corrupted=0;for(let i=0;i<bits.length;i++)if(bits[i]!==rxBits[i])corrupted++;

  simData={text,bits,lc,noise,delay,u2bits,u3bits,rxBits,
    tdmMerged:buildTDM(bits,u2bits,u3bits),
    packets:buildPackets(bits,noise),
    decodedText:binaryToText(rxBits),corrupted
  };
  simRunning=true;
  // Update stats with animation
  animateCounter('statBits',bits.length);
  animateCounter('statPackets',simData.packets.filter(p=>!p.retx).length);
  animateCounter('statErrors',corrupted);
  document.getElementById('statBER').textContent=(corrupted/bits.length*100).toFixed(1)+'%';
  goStage(0);
  setStatus('Simulation running','Stage 1 / 7');
}

function animateCounter(id,target){
  const el=document.getElementById(id);let v=0;
  const step=Math.max(1,Math.floor(target/30));
  const iv=setInterval(()=>{v=Math.min(v+step,target);el.textContent=v;if(v>=target)clearInterval(iv)},30);
}

function resetSim(){
  simRunning=false;currentStage=-1;simData={};
  document.querySelectorAll('.stage-section').forEach(s=>s.classList.remove('visible'));
  document.querySelectorAll('.pipe-block').forEach(b=>b.classList.remove('active','done'));
  ['statBits','statPackets','statErrors'].forEach(id=>document.getElementById(id).textContent='0');
  document.getElementById('statBER').textContent='0%';
  setStatus('Ready — enter text and click Run Simulation','');
}

function setStatus(msg,step){
  document.getElementById('statusText').textContent=msg;
  document.getElementById('statusStep').textContent=step;
}

function goStage(n){
  if(!simRunning&&n>0){alert('Run the simulation first!');return}
  document.querySelectorAll('.stage-section').forEach(s=>s.classList.remove('visible'));
  document.querySelectorAll('.pipe-block').forEach((b,i)=>{
    b.classList.remove('active');
    if(i<n)b.classList.add('done');else b.classList.remove('done');
  });
  if(n>=0&&n<STAGES){
    document.getElementById(`s${n}`).classList.add('visible');
    document.getElementById(`pb${n}`).classList.add('active');
    currentStage=n;
    renderStage(n);
    setStatus(`Stage ${n+1} of ${STAGES} — ${stageNames[n]}`,`Step ${n+1}/7`);
  }
  window.scrollTo({top:80,behavior:'smooth'});
}

// ════════════════════════════════════════════════
//  RENDER STAGES
// ════════════════════════════════════════════════
function renderStage(n){
  if(!simRunning)return;
  [renderInput,renderLineCoding,renderModulation,renderMux,renderChannel,renderTransport,renderReceiver][n]();
}

// ── STAGE 0: INPUT ──
function renderInput(){
  const{text,bits}=simData;
  document.getElementById('s0-text').textContent=text;
  const wrap=document.getElementById('s0-chars');wrap.innerHTML='';
  for(let c of text){
    const b=charToBin(c);
    const row=document.createElement('div');row.className='data-row';
    row.innerHTML=`<div class="data-label" style="font-size:18px;font-weight:700;color:var(--accent)">'${c}'</div>
      <div class="data-bits">ASCII ${c.charCodeAt(0)} → ${formatBits(b)}</div>`;
    wrap.appendChild(row);
  }
  document.getElementById('s0-bits').innerHTML=formatBits(bits);
}

// ── STAGE 1: LINE CODING ──
function setLC(mode,el){
  lcMode=mode;
  document.querySelectorAll('#s1 .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');renderLineCoding();
}
function renderLineCoding(){
  const{bits}=simData;
  document.getElementById('s1-bits').innerHTML=formatBits(bits);
  const descs={
    nrzl:'NRZ-L: High voltage = 1, Low voltage = 0. Simple but no self-clocking.',
    nrzi:'NRZ-I: Transition at start of bit = 1, No transition = 0. Differential encoding.',
    manchester:'Manchester (IEEE 802.3): 1 = High→Low transition, 0 = Low→High transition. Self-clocking.',
    diffmanchester:'Differential Manchester: Transition always at mid-bit (clock). Transition at start = 0, No transition at start = 1.',
    ami:'AMI (Alternate Mark Inversion): 0 = zero voltage, 1 = alternating +V/−V. DC balanced.',
    mlt3:'MLT-3: Three levels (+V, 0, −V). Transition on 1, cycles through levels. Used in 100BASE-TX.'
  };
  document.getElementById('s1-scheme-label').textContent=descs[lcMode]||'';
  drawWaveform('lcCanvas',bits,lcMode);
}
function drawWaveform(id,bits,mode){
  const canvas=document.getElementById(id),ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||700;canvas.width=W;const H=canvas.height;
  ctx.clearRect(0,0,W,H);
  // Light bg
  ctx.fillStyle='#f6f4f0';ctx.fillRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(0,0,0,0.06)';ctx.lineWidth=1;
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  // Level lines
  const is3Level=(mode==='ami'||mode==='mlt3');
  const high=H*0.15,mid=H*0.5,low=H*0.85;
  if(is3Level){
    [high,mid,low].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()});
  }else{
    ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
  }
  const show=bits.slice(0,Math.min(bits.length,32)),bw=W/show.length;
  const h2=H*0.2,l2=H*0.8; // 2-level positions

  ctx.strokeStyle='#2563eb';ctx.lineWidth=2.5;ctx.beginPath();
  if(mode==='nrzl'){
    let prev=null;
    show.split('').forEach((b,i)=>{
      const y=b==='1'?h2:l2,x=i*bw;
      if(prev!==null&&prev!==b){ctx.lineTo(x,prev==='1'?h2:l2);ctx.lineTo(x,y)}
      else if(i===0)ctx.moveTo(x,y);
      ctx.lineTo(x+bw,y);prev=b;
    });
  }else if(mode==='nrzi'){
    let level=l2; // start low
    show.split('').forEach((b,i)=>{
      const x=i*bw;
      if(b==='1') level=(level===h2)?l2:h2; // transition on 1
      if(i===0)ctx.moveTo(x,level); else{ctx.lineTo(x,level)}
      ctx.lineTo(x+bw,level);
    });
  }else if(mode==='manchester'){
    show.split('').forEach((b,i)=>{
      const x=i*bw,m=x+bw/2;
      if(b==='1'){
        i>0?ctx.lineTo(x,h2):ctx.moveTo(x,h2);
        ctx.lineTo(m,h2);ctx.lineTo(m,l2);ctx.lineTo(x+bw,l2);
      }else{
        i>0?ctx.lineTo(x,l2):ctx.moveTo(x,l2);
        ctx.lineTo(m,l2);ctx.lineTo(m,h2);ctx.lineTo(x+bw,h2);
      }
    });
  }else if(mode==='diffmanchester'){
    let lastEnd=l2;
    show.split('').forEach((b,i)=>{
      const x=i*bw,m=x+bw/2;
      let startLevel=lastEnd;
      if(b==='0') startLevel=(lastEnd===h2)?l2:h2; // transition at start for 0
      // no start transition for 1
      if(i===0)ctx.moveTo(x,startLevel); else ctx.lineTo(x,startLevel);
      // mid-bit transition always
      const midLevel=(startLevel===h2)?l2:h2;
      ctx.lineTo(m,startLevel);ctx.lineTo(m,midLevel);ctx.lineTo(x+bw,midLevel);
      lastEnd=midLevel;
    });
  }else if(mode==='ami'){
    let lastPolarity=1; // +1 or -1, alternates for 1-bits
    show.split('').forEach((b,i)=>{
      const x=i*bw;
      if(b==='0'){
        if(i===0)ctx.moveTo(x,mid); else ctx.lineTo(x,mid);
        ctx.lineTo(x+bw,mid);
      }else{
        const y=lastPolarity===1?high:low;
        lastPolarity*=-1;
        if(i===0)ctx.moveTo(x,mid); else ctx.lineTo(x,mid);
        ctx.lineTo(x,y);ctx.lineTo(x+bw,y);ctx.lineTo(x+bw,mid);
      }
    });
  }else if(mode==='mlt3'){
    const levels=[mid,high,mid,low]; // cycle: 0, +V, 0, -V
    let li=0;
    show.split('').forEach((b,i)=>{
      const x=i*bw;
      if(b==='1') li=(li+1)%4;
      const y=levels[li];
      if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      ctx.lineTo(x+bw,y);
    });
  }
  ctx.stroke();
  // Bit labels
  ctx.fillStyle='#6b6860';ctx.font='10px JetBrains Mono,monospace';ctx.textAlign='center';
  show.split('').forEach((b,i)=>ctx.fillText(b,i*bw+bw/2,H-4));
  // Level labels
  ctx.textAlign='left';ctx.font='9px JetBrains Mono,monospace';ctx.fillStyle='#aaa';
  if(is3Level){ctx.fillText('+V',2,high+3);ctx.fillText('0',2,mid+3);ctx.fillText('−V',2,low+3)}
  else{ctx.fillText('HIGH',2,h2+3);ctx.fillText('LOW',2,l2+3)}
}

// ── STAGE 2: MODULATION ──
function setMod(mode,el){
  modMode=mode;
  document.querySelectorAll('#s2 .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');renderModulation();
}
const modInfo={
  ask:{
    title:'📡 Modulation — ASK (Amplitude Shift Keying)',
    desc:'ASK varies the amplitude of the carrier. Binary 1 = full amplitude; binary 0 = zero/low amplitude. Simple but susceptible to noise.',
    info:'<strong>ASK:</strong><br>Bit = 1 → carrier at full amplitude<br>Bit = 0 → carrier suppressed<br><br>Amplitude changes, frequency stays constant.',
    label:'ASK Modulated Output'
  },
  fsk:{
    title:'📡 Modulation — FSK (Frequency Shift Keying)',
    desc:'FSK uses two different carrier frequencies. Binary 1 = high frequency; binary 0 = low frequency. More noise-resistant than ASK.',
    info:'<strong>FSK:</strong><br>Bit = 1 → high frequency carrier<br>Bit = 0 → low frequency carrier<br><br>Frequency changes, amplitude stays constant.',
    label:'FSK Modulated Output'
  },
  psk:{
    title:'📡 Modulation — PSK (Phase Shift Keying)',
    desc:'PSK changes the phase of the carrier. Binary 1 = 0° phase; binary 0 = 180° phase shift. Good noise immunity and bandwidth efficiency.',
    info:'<strong>PSK:</strong><br>Bit = 1 → carrier at 0° phase<br>Bit = 0 → carrier at 180° phase<br><br>Phase changes, amplitude & frequency constant.',
    label:'PSK Modulated Output'
  },
  bpsk:{
    title:'📡 Modulation — BPSK (Binary Phase Shift Keying)',
    desc:'BPSK is the simplest form of PSK. It uses two phases (0° and 180°) to represent binary data. Widely used in CDMA, Wi-Fi, and satellite communication.',
    info:'<strong>BPSK Constellation:</strong><br>Bit = 1 → phase = 0° (point at +1)<br>Bit = 0 → phase = 180° (point at −1)<br><br>Most robust PSK variant. 1 bit per symbol.',
    label:'BPSK Modulated Output'
  }
};
['modAmp','modFreq','modPhase'].forEach(id=>{
  document.getElementById(id).addEventListener('input',function(){
    const val=this.value;
    document.getElementById(id+'Val').textContent=id==='modPhase'?val+'°':(id==='modFreq'?val+' Hz':val);
    renderModulation();
  });
});

function renderModulation(){
  const{bits}=simData;if(!bits)return;
  const b16=bits.slice(0,16);
  document.getElementById('s2-bits').innerHTML=formatBits(b16)+(bits.length>16?'…':'');
  const m=modInfo[modMode];
  document.getElementById('s2-title').textContent=m.title;
  document.getElementById('s2-desc').textContent=m.desc;
  document.getElementById('s2-info').innerHTML=m.info;
  document.getElementById('s2-canvas-label').textContent=m.label;

  const amp=parseFloat(document.getElementById('modAmp').value);
  const freq=parseFloat(document.getElementById('modFreq').value);
  const phase=parseFloat(document.getElementById('modPhase').value)*Math.PI/180;

  drawCarrier('carrierCanvas',amp,freq,phase,b16.length);
  drawModulated('modCanvas',b16,modMode,amp,freq,phase);
}
function drawCarrier(id,amp,freq,phase,numBits){
  const c=document.getElementById(id),ctx=c.getContext('2d');
  const W=c.offsetWidth||700;c.width=W;const H=c.height;
  ctx.fillStyle='#f6f4f0';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#9333ea';ctx.lineWidth=1.5;ctx.beginPath();
  for(let x=0;x<=W;x++){
    const time=(x/W)*numBits;
    const y=H/2-(H*amp)*Math.sin(2*Math.PI*freq*time+phase);
    x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();
}
function drawModulated(id,bits,mode,amp,freq,phase){
  const c=document.getElementById(id),ctx=c.getContext('2d');
  const W=c.offsetWidth||700;c.width=W;const H=c.height;
  ctx.fillStyle='#f6f4f0';ctx.fillRect(0,0,W,H);
  const bw=W/bits.length;ctx.lineWidth=1.5;
  const colors={ask:'#e85d26',fsk:'#2563eb',psk:'#9333ea',bpsk:'#16a34a'};
  const color=colors[mode]||'#e85d26';
  const colorFade={ask:'#ccc',fsk:'#93c5fd',psk:'#d8b4fe',bpsk:'#86efac'};
  const fade=colorFade[mode]||'#ccc';

  bits.split('').forEach((b,i)=>{
    ctx.beginPath();
    if(mode==='ask'){
      ctx.strokeStyle=b==='1'?color:fade;
      for(let s=0;s<=50;s++){
        const t=s/50,x=i*bw+t*bw,time=i+t;
        const a=b==='1'?amp:0.05;
        const y=H/2-H*a*Math.sin(2*Math.PI*freq*time+phase);
        s===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
    }else if(mode==='fsk'){
      ctx.strokeStyle=b==='1'?color:fade;
      const f=b==='1'?freq*1.6:freq*0.4;
      for(let s=0;s<=60;s++){
        const t=s/60,x=i*bw+t*bw;
        const y=H/2-H*amp*Math.sin(2*Math.PI*f*t+phase);
        s===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
    }else if(mode==='psk'||mode==='bpsk'){
      ctx.strokeStyle=b==='1'?color:fade;
      const pShift=b==='1'?0:Math.PI;
      for(let s=0;s<=60;s++){
        const t=s/60,x=i*bw+t*bw,time=i+t;
        const y=H/2-H*amp*Math.sin(2*Math.PI*freq*time+phase+pShift);
        s===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
    }
    ctx.stroke();
  });
  ctx.fillStyle='#6b6860';ctx.font='10px JetBrains Mono,monospace';ctx.textAlign='center';
  bits.split('').forEach((b,i)=>ctx.fillText(b,i*bw+bw/2,H-4));
  ctx.strokeStyle='rgba(0,0,0,0.06)';ctx.lineWidth=1;
  bits.split('').forEach((_,i)=>{if(i>0){ctx.beginPath();ctx.moveTo(i*bw,0);ctx.lineTo(i*bw,H);ctx.stroke()}});
}

// ── STAGE 3: TDM ──
function buildTDM(u1,u2,u3){
  const maxL=Math.max(u1.length,u2.length,u3.length);let m='';
  for(let i=0;i<maxL;i++){m+=(i<u1.length?u1[i]:'0')+(i<u2.length?u2[i]:'0')+(i<u3.length?u3[i]:'0')}
  return m;
}
function renderMux(){
  const{bits:u1,u2bits:u2,u3bits:u3,tdmMerged}=simData;
  const wrap=document.getElementById('tdm-grid-wrap');wrap.innerHTML='';
  const slots=Math.min(12,Math.max(u1.length,u2.length,u3.length));
  const grid=document.createElement('div');grid.className='tdm-grid';
  grid.style.gridTemplateColumns=`80px repeat(${slots},1fr)`;
  const addCell=(cls,text)=>{const c=document.createElement('div');c.className='tdm-cell '+cls;c.textContent=text;grid.appendChild(c)};
  ['', ...Array.from({length:slots},(_,i)=>`t${i+1}`)].forEach((h,i)=>addCell(i===0?'tdm-label':'tdm-merged',i===0?'Frame →':h));
  ['User 1',...u1.slice(0,slots).split('')].forEach((v,i)=>addCell(i===0?'tdm-label':'tdm-u1',v));
  ['User 2',...u2.slice(0,slots).padEnd(slots,'0').split('')].forEach((v,i)=>addCell(i===0?'tdm-label':'tdm-u2',v));
  ['User 3',...u3.slice(0,slots).padEnd(slots,'0').split('')].forEach((v,i)=>addCell(i===0?'tdm-label':'tdm-u3',v));
  wrap.appendChild(grid);

  const el=document.getElementById('s3-merged');
  const sl=Math.min(tdmMerged.length,48);let html='';
  const clsMap=['tdm-u1','tdm-u2','tdm-u3'];
  for(let i=0;i<sl;i++){
    html+=`<span style="border-radius:3px;padding:1px 3px;margin:0 1px" class="${clsMap[i%3]}">${tdmMerged[i]||''}</span>`;
    if((i+1)%3===0&&i+1<sl)html+=' ';
  }
  el.innerHTML=html;
}

// ── STAGE 4: CHANNEL ──
function applyNoise(bits,pct){
  return bits.split('').map(b=>Math.random()*100<pct?(b==='0'?'1':'0'):b).join('');
}
function renderChannel(){
  const{bits,rxBits,noise}=simData;
  document.getElementById('s4-tx').innerHTML=formatBits(bits.slice(0,64))+(bits.length>64?'…':'');
  drawChannelTimeline('channelCanvas',bits.slice(0,64),rxBits.slice(0,64));
  const el=document.getElementById('s4-rx');const show=Math.min(bits.length,64);let html='';
  for(let i=0;i<show;i++){
    html+=bits[i]!==rxBits[i]?`<span class="bit-corrupt">${rxBits[i]}</span>`:`<span class="bit-${rxBits[i]}">${rxBits[i]}</span>`;
    if((i+1)%8===0)html+=' ';
  }
  if(bits.length>64)html+='…';el.innerHTML=html;
  let c=0;for(let i=0;i<bits.length;i++)if(bits[i]!==rxBits[i])c++;
  document.getElementById('s4-stats').textContent=`${c} bit(s) corrupted of ${bits.length} | BER: ${(c/bits.length*100).toFixed(1)}% | Noise: ${noise}%`;
}
function drawChannelTimeline(id,tx,rx){
  const c=document.getElementById(id),ctx=c.getContext('2d');
  const W=c.offsetWidth||700;c.width=W;const H=c.height;
  ctx.fillStyle='#f6f4f0';ctx.fillRect(0,0,W,H);
  const n=Math.min(tx.length,64),bw=W/n;
  ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='center';
  for(let i=0;i<n;i++){
    const bad=tx[i]!==rx[i];
    ctx.fillStyle=bad?'#fef2f2':'#f0fdf4';ctx.fillRect(i*bw,8,bw-1,28);
    ctx.fillStyle=bad?'#dc2626':'#16a34a';ctx.fillText(tx[i],i*bw+bw/2,26);
  }
  ctx.fillStyle='#aaa';ctx.font='10px sans-serif';
  ctx.textAlign='left';ctx.fillText('TX',4,26);ctx.fillText('RX',4,66);
  for(let i=0;i<n;i++){
    const bad=tx[i]!==rx[i];
    ctx.fillStyle=bad?'#fee2e2':'#f6f4f0';ctx.fillRect(i*bw,46,bw-1,28);
    ctx.fillStyle=bad?'#dc2626':'#6b6860';
    ctx.font=bad?'bold 9px JetBrains Mono,monospace':'9px JetBrains Mono,monospace';
    ctx.fillText(rx[i],i*bw+bw/2,64);
  }
}

// ── STAGE 5: TRANSPORT ──
function buildPackets(bits,noise){
  const pkts=[];
  for(let i=0;i<bits.length;i+=8){
    const seq=Math.floor(i/8)+1,data=bits.slice(i,i+8),lost=Math.random()*100<noise/3;
    pkts.push({seq,data,lost,retx:false});
  }
  const final=[];
  for(const p of pkts){final.push(p);if(p.lost)final.push({seq:p.seq,data:p.data,lost:false,retx:true})}
  return final;
}
function renderTransport(){animateHandshake();renderPacketTable();animatePackets()}
function animateHandshake(){
  ['hs0','hs1','hs2','hs3'].forEach((id,i)=>{
    document.getElementById(id).classList.remove('active');
    setTimeout(()=>document.getElementById(id).classList.add('active'),i*500);
  });
}
function renderPacketTable(){
  const{packets}=simData;
  document.getElementById('pktTable').innerHTML=packets.map(p=>{
    const cls=p.lost?'color:#dc2626':p.retx?'color:#9333ea':'color:#16a34a';
    const flag=p.lost?'✗ LOST':p.retx?'↺ RETX':'✓ ACK';
    return `<span style="display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:5px 10px;margin:3px;${cls};font-size:11px">PKT#${p.seq} ${flag}</span>`;
  }).join('');
}
function animatePackets(){
  const area=document.getElementById('packetArea'),track=document.getElementById('pktTrack');
  area.querySelectorAll('.packet-dot').forEach(d=>d.remove());
  const{packets}=simData,trackW=track.offsetWidth||400;
  packets.forEach((p,idx)=>{
    setTimeout(()=>{
      const dot=document.createElement('div');
      dot.className='packet-dot '+(p.lost?'pkt-lost':p.retx?'pkt-retx':'pkt-ok');
      dot.textContent=`PKT${p.seq}`;dot.style.left='0px';track.appendChild(dot);
      const dur=800,start=Date.now(),targetL=p.lost?trackW*0.5:trackW-48;
      (function anim(){
        const t=Math.min((Date.now()-start)/dur,1);
        const ease=t<0.5?2*t*t:(1-Math.pow(-2*t+2,2)/2);
        dot.style.left=(ease*targetL)+'px';
        if(t<1)requestAnimationFrame(anim);
        else if(p.lost)setTimeout(()=>dot.style.opacity='0.3',200);
      })();
    },idx*600);
  });
}

// ── STAGE 6: RECEIVER ──
function renderReceiver(){
  const{bits,rxBits,text,decodedText}=simData;
  document.getElementById('s6-bits').innerHTML=formatBits(rxBits.slice(0,64))+(rxBits.length>64?'…':'');
  document.getElementById('s6-steps').innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      ${['① Demultiplex','② Demodulate','③ Decode Line Coding','④ Binary → ASCII'].map((s,i)=>`
        <div style="background:var(--bg);border:1px solid var(--border);
        border-radius:10px;padding:10px 16px;font-family:var(--mono);font-size:12px;
        opacity:0;animation:slideIn 0.4s ${i*0.2}s forwards;color:var(--text2)">${s}</div>`).join('')}
    </div>`;
  const match=text===decodedText;
  document.getElementById('compareRow').innerHTML=`
    <div class="compare-box"><h4>Original Input</h4>
      <div class="compare-text" style="color:var(--accent)">${escHtml(text)}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text2);margin-top:8px">${bits.length} bits</div></div>
    <div class="compare-box"><h4>Reconstructed Output</h4>
      <div class="compare-text" style="color:${match?'var(--green)':'var(--red)'}">${escHtml(decodedText)}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text2);margin-top:8px">${rxBits.length} bits received</div></div>
    <div style="grid-column:1/-1"><div class="match-badge ${match?'match-ok':'match-err'}">
      ${match?'✓ PERFECT RECONSTRUCTION — Data integrity maintained!':'⚠ ERRORS DETECTED — Noise corrupted some bits. TCP would retransmit.'}
    </div></div>`;
}
