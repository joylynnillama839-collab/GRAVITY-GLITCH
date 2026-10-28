
(() => {
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const menuScreen=$('menuScreen'), pauseScreen=$('pauseScreen'), resultScreen=$('resultScreen');
const worldLabel=$('worldLabel'), levelLabel=$('levelLabel'), statusText=$('statusText');
const W=960,H=540, FLOOR=470;
let world=1, level=1, deaths=0, lives=5, lastDeathReason='Fell into the void', playing=false, paused=false, ended=false, raf=0, last=0;
let camera=0, worldTime=0, particles=[], platforms=[], spikes=[], movers=[], checkpoints=[], coyoteTimer=0, jumpBuffer=0, screenShake=0;
let keys={left:false,right:false,jump:false}, jumpQueued=false, audioCtx=null, master=null, musicGain=null, musicTimer=null, musicOn=true, musicStep=0;
const worldNames=['THE FORGOTTEN GATE','SHADOW DISTRICT','THE FRACTURED VOID','ABYSS PROTOCOL','THE FINAL PARADOX'];
const player={x:60,y:400,w:25,h:34,vx:0,vy:0,onGround:false,spawnX:60,spawnY:400,checkpoint:0};
const gravity=1800;
const unlocked=()=>Math.max(1,Number(localStorage.getItem('gravity-glitch-world')||1));

function resize(){
 const r=canvas.getBoundingClientRect();
 const dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(r.width*dpr);
 canvas.height=Math.round(r.height*dpr);
 ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
}
window.addEventListener('resize',resize);
resize();

function audioStart(){
 if(!audioCtx){
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  master=audioCtx.createGain();
  master.gain.value=.55;
  master.connect(audioCtx.destination);
  musicGain=audioCtx.createGain();
  musicGain.gain.value=musicOn?.22:0;
  musicGain.connect(master);
 }
 if(audioCtx.state==='suspended') audioCtx.resume();
}
function tone(freq,dur,type='sine',vol=.1,when=0,detune=0,dest=master){
 if(!audioCtx)return;
 const t=audioCtx.currentTime+when;
 const o=audioCtx.createOscillator(),g=audioCtx.createGain();
 o.type=type;
 o.frequency.setValueAtTime(freq,t);
 o.detune.setValueAtTime(detune,t);
 g.gain.setValueAtTime(.0001,t);
 g.gain.exponentialRampToValueAtTime(Math.max(.001,vol),t+.025);
 g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 o.connect(g);g.connect(dest);
 o.start(t);o.stop(t+dur+.04);
}
function startMusic(){
 if(!audioCtx||musicTimer)return;
 const notes=[55,82.41,65.41,98,73.42,110,65.41,87.31];
 musicTimer=setInterval(()=>{
  if(!playing||paused||!musicOn)return;
  const n=notes[musicStep++%notes.length];
  tone(n,1.4,'triangle',.12,0,0,musicGain);
  if(musicStep%4===0)tone(n*2,.8,'sine',.045,.18,0,musicGain);
  if(musicStep%8===0)tone(42,1.2,'sawtooth',.045,0,0,musicGain);
 },850);
}
function stopMusic(){
 if(musicTimer){clearInterval(musicTimer);musicTimer=null}
}
function soundStart(){
 audioStart();
 [110,164.8,220,329.6,440].forEach((n,i)=>tone(n,.7,'sawtooth',.07,i*.13,0,master));
}
function soundJump(){
 tone(220,.09,'square',.035);
 tone(360,.12,'triangle',.025,.03);
}
function soundDeath(){
 audioStart();
 [260,180,110,65].forEach((n,i)=>tone(n,.35,'sawtooth',.09,i*.09,-15));
}
function soundWin(){
 audioStart();
 [220,277,330,440,554].forEach((n,i)=>tone(n,.4,'triangle',.08,i*.1));
}
function toggleMusic(){
 musicOn=!musicOn;
 if(musicGain)musicGain.gain.setTargetAtTime(musicOn?.22:0,audioCtx.currentTime,.08);
 $('musicBtn').textContent=musicOn?'♫ MUSIC ON':'♫ MUSIC OFF';
 if(musicOn)startMusic();
}
$('musicBtn').addEventListener('click',()=>{audioStart();toggleMusic()});

function rand(a,b){return a+Math.random()*(b-a)}

function makeLevel(){
 platforms=[];spikes=[];movers=[];checkpoints=[];particles=[];camera=0;worldTime=0;

 // Each world teaches a skill before combining harder obstacles.
 const layouts=[
  [{gap:65,w:205,y:445,hazard:'none'},{gap:72,w:190,y:425,hazard:'spike'},{gap:70,w:205,y:445,hazard:'none'},{gap:78,w:180,y:410,hazard:'spike'},{gap:70,w:220,y:440,hazard:'none'}],
  [{gap:70,w:195,y:440,hazard:'spike'},{gap:82,w:175,y:410,hazard:'spike'},{gap:72,w:205,y:435,hazard:'none'},{gap:88,w:170,y:400,hazard:'spike'},{gap:75,w:210,y:440,hazard:'none'}],
  [{gap:75,w:205,y:435,hazard:'spike'},{gap:85,w:200,y:410,hazard:'mover'},{gap:75,w:180,y:435,hazard:'none'},{gap:90,w:195,y:400,hazard:'mover'},{gap:75,w:220,y:440,hazard:'spike'}],
  [{gap:88,w:175,y:415,hazard:'spike'},{gap:95,w:160,y:390,hazard:'mover'},{gap:82,w:180,y:425,hazard:'spike'},{gap:100,w:155,y:385,hazard:'mover'},{gap:85,w:185,y:420,hazard:'spike'}],
  [{gap:90,w:170,y:405,hazard:'mover'},{gap:100,w:155,y:380,hazard:'spike'},{gap:90,w:165,y:415,hazard:'mover'},{gap:105,w:150,y:375,hazard:'spike'},{gap:90,w:180,y:410,hazard:'mover'}]
 ];

 const patternIndex=Math.min(4,world-1);
 const difficulty=(world-1)*.12+(level-1)*.035;
 const length=3300+world*380+level*190;
 platforms.push({x:0,y:FLOOR,w:420,h:70});

 let x=420, segment=0;
 const pattern=layouts[patternIndex];

 while(x<length-500){
  const item=pattern[segment%pattern.length];
  const gap=item.gap+Math.round(difficulty*20);
  const width=Math.max(125,item.w-Math.round(difficulty*14));
  const y=Math.min(450,item.y+Math.round((level%2===0?8:0)));

  x+=gap;
  platforms.push({x,y,w:width,h:24});

  if(item.hazard==='spike'||(item.hazard==='mover'&&world>=3)){
   const spikeW=Math.min(38,Math.max(24,width*.19));
   spikes.push({x:x+width*.55,y:y-18,w:spikeW,h:18});
  }

  if(item.hazard==='mover'&&world>=2){
   movers.push({
    x:x+width+14,baseY:y-72,w:32,h:18,
    amp:world>=4?58:38,
    speed:1.25+world*.13,
    phase:segment*.9+level*.3
   });
  }

  // A checkpoint appears after every second platform.
  if(segment>0&&segment%2===1&&x<length-650){
   checkpoints.push({x:x+width*.35,y:y-38,platformY:y,active:false});
  }

  x+=width;
  segment++;
 }

 platforms.push({x:length-250,y:FLOOR,w:330,h:70});
 spikes=spikes.filter(s=>s.x>180&&s.x<length-280);
 movers=movers.filter(m=>m.x>260&&m.x<length-260);
 checkpoints=checkpoints.filter(c=>c.x>550&&c.x<length-500);
 return length;
}

let levelLength=0, goalX=0;

function setupLevel(){
 levelLength=makeLevel();
 goalX=levelLength-115;
 player.x=60;
 player.y=FLOOR-player.h;
 player.vx=0;player.vy=0;
 player.spawnX=60;
 player.spawnY=FLOOR-player.h;
 player.checkpoint=0;
 updateLabels();
}
function updateLabels(){
 worldLabel.textContent=`WORLD ${world} · ${worldNames[world-1]}`;
 levelLabel.textContent=`LEVEL ${level} / 5 · LIVES ${lives}`;
}
function beginGame(){
 audioStart();soundStart();
 menuScreen.classList.add('hidden');
 pauseScreen.classList.add('hidden');
 resultScreen.classList.add('hidden');
 world=1;level=1;deaths=0;lives=5;
 playing=true;paused=false;ended=false;
 setupLevel();
 statusText.textContent='GOAL: REACH THE EXIT PORTAL · AVOID HAZARDS';
 startMusic();
 if(!raf){last=performance.now();raf=requestAnimationFrame(loop)}
}
function showResult(title,text,win=false){
 playing=false;ended=true;
 resultScreen.classList.remove('hidden');
 $('resultTitle').textContent=title;
 $('resultText').textContent=text;
 $('resultEyebrow').textContent=win?'WORLD CLEAR':'RUN ENDED';
 $('continueBtn').textContent=win?(world===5&&level===5?'PLAY AGAIN':'NEXT LEVEL'):'TRY AGAIN';
 statusText.textContent=win?'GATE OPENED':'VOID CLAIMED';
}
function die(reason='You missed a safe landing.'){
 if(!playing)return;
 deaths++;lives--;lastDeathReason=reason;screenShake=10;
 for(let i=0;i<18;i++){
  particles.push({
   x:player.x+player.w/2,y:player.y+player.h/2,
   vx:rand(-170,170),vy:rand(-180,100),
   life:rand(.25,.65),r:rand(2,4),kind:'spark'
  });
 }
 soundDeath();updateLabels();
 if(lives<=0){
  showResult('RUN OVER',`WHY YOU FELL: ${reason}\nYou used all 5 lives on this level. Try a different jump timing.`,false);
  $('continueBtn').textContent='RESTART LEVEL';
 }else{
  showResult('YOU FELL',`WHY YOU FELL: ${reason}\nLives left: ${lives}/5 · Total falls this run: ${deaths}.
TIP: Slow down near unfamiliar platforms.`,false);
  $('continueBtn').textContent='TRY AGAIN';
 }
}
function winLevel(){
 if(!playing)return;
 soundWin();
 if(level<5){
  showResult('LEVEL CLEARED',`Level ${level} complete. The next trial is waiting.`,true);
 }else if(world<5){
  showResult('WORLD CLEARED',`${worldNames[world-1]} conquered. A new world has opened.`,true);
 }else{
  showResult('VOID CONQUERED','All 25 levels cleared. You escaped the paradox.',true);
 }
}
function continueGame(){
 resultScreen.classList.add('hidden');
 ended=false;

 if(playing===false&&['TRY AGAIN','RESTART LEVEL'].includes($('continueBtn').textContent)){
  if($('continueBtn').textContent==='RESTART LEVEL'){
   lives=5;setupLevel();
  }else{
   player.x=player.spawnX;player.y=player.spawnY;
   player.vx=0;player.vy=0;player.onGround=false;
   camera=Math.max(0,Math.min(levelLength-W,player.x-W*.32));
   worldTime=0;
  }
  playing=true;
  statusText.textContent='GOAL: REACH THE EXIT · AVOID GAPS, SPIKES, AND MOVERS';
  updateLabels();
  return;
 }

 if(level<5)level++;
 else if(world<5){
  world++;level=1;
  localStorage.setItem('gravity-glitch-world',String(Math.max(unlocked(),world)));
 }else{
  world=1;level=1;deaths=0;
 }
 lives=5;playing=true;paused=false;
 setupLevel();
 statusText.textContent='NEW LEVEL · LEARN THE PATTERN, THEN TIME YOUR JUMPS';
 startMusic();
}
function pause(){
 if(!playing)return;
 paused=true;playing=false;
 pauseScreen.classList.remove('hidden');
 statusText.textContent='PAUSED';
}
function resume(){
 paused=false;playing=true;
 pauseScreen.classList.add('hidden');
 statusText.textContent='FIND THE EXIT';
 startMusic();
}
function menu(){
 playing=false;paused=false;ended=false;
 menuScreen.classList.remove('hidden');
 pauseScreen.classList.add('hidden');
 resultScreen.classList.add('hidden');
 statusText.textContent='READY WHEN YOU ARE';
 stopMusic();
}

$('startBtn').addEventListener('click',beginGame);
$('continueBtn').addEventListener('click',continueGame);
$('pauseBtn').addEventListener('click',pause);
$('resumeBtn').addEventListener('click',resume);
$('menuBtn').addEventListener('click',menu);
$('resultMenuBtn').addEventListener('click',menu);

window.addEventListener('keydown',e=>{
 if(['ArrowLeft','ArrowRight','ArrowUp',' ','Escape'].includes(e.key))e.preventDefault();
 if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=true;
 if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=true;
 if(e.key===' '||e.key==='ArrowUp'||e.key.toLowerCase()==='w'){
  if(!keys.jump)jumpQueued=true;
  keys.jump=true;
 }
 if(e.key==='Escape'){
  if(playing)pause();
  else if(paused)resume();
 }
});
window.addEventListener('keyup',e=>{
 if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=false;
 if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=false;
 if(e.key===' '||e.key==='ArrowUp'||e.key.toLowerCase()==='w')keys.jump=false;
});

function bindHold(id,key){
 const el=$(id);
 const on=e=>{
  e.preventDefault();
  keys[key]=true;
  if(key==='jump')jumpQueued=true;
 };
 const off=e=>{e.preventDefault();keys[key]=false};
 el.addEventListener('pointerdown',on);
 ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,off));
}
bindHold('leftBtn','left');
bindHold('rightBtn','right');
bindHold('jumpBtn','jump');

function rectHit(a,b){
 return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}


function update(dt){
 worldTime+=dt;
 const accel=2300,max=300+world*10;

 if(keys.left)player.vx-=accel*dt;
 if(keys.right)player.vx+=accel*dt;
 if(!keys.left&&!keys.right)player.vx*=Math.pow(.00008,dt);
 player.vx=Math.max(-max,Math.min(max,player.vx));

 if(jumpQueued)jumpBuffer=.13;
 else jumpBuffer=Math.max(0,jumpBuffer-dt);

 if(player.onGround)coyoteTimer=.11;
 else coyoteTimer=Math.max(0,coyoteTimer-dt);

 // Jump buffering and coyote time make jumping more forgiving.
 if(jumpBuffer>0&&coyoteTimer>0){
  player.vy=-625;player.onGround=false;
  coyoteTimer=0;jumpBuffer=0;
  soundJump();
  for(let i=0;i<7;i++){
   particles.push({
    x:player.x+player.w/2,y:player.y+player.h,
    vx:rand(-65,65),vy:rand(-100,-25),
    life:rand(.18,.42),r:rand(2,4),kind:'spark'
   });
  }
 }
 jumpQueued=false;

 player.x+=player.vx*dt;
 player.x=Math.max(0,Math.min(levelLength-player.w,player.x));

 player.vy+=gravity*dt;
 const oldBottom=player.y+player.h;
 player.y+=player.vy*dt;
 player.onGround=false;

 // Land on a platform when falling across its top surface.
 if(player.vy>=0){
  let landing=null;
  for(const p of platforms){
   const overlaps=player.x+player.w>p.x+3&&player.x<p.x+p.w-3;
   const crossed=oldBottom<=p.y+2&&player.y+player.h>=p.y;
   if(overlaps&&crossed&&(!landing||p.y<landing.y))landing=p;
  }
  if(landing){
   const impact=player.vy;
   player.y=landing.y-player.h;
   player.vy=0;player.onGround=true;
   if(impact>260){
    for(let i=0;i<5;i++){
     particles.push({
      x:player.x+player.w/2,y:landing.y,
      vx:rand(-55,55),vy:rand(-70,-10),
      life:rand(.16,.34),r:rand(1.5,3),kind:'spark'
     });
    }
   }
  }
 }

 // Releasing jump early shortens the jump.
 if(!keys.jump&&player.vy< -160)player.vy+=2100*dt;

 // Spike collision.
 for(const s of spikes){
  if(rectHit(player,{x:s.x+4,y:s.y+5,w:s.w-8,h:s.h-4})){
   die('You landed on the glowing spikes. Aim for the clear part of the platform.');
   return;
  }
 }

 // Moving hazard collision.
 for(const m of movers){
  const my=m.baseY+Math.sin(worldTime*m.speed+m.phase)*m.amp;
  if(rectHit(player,{x:m.x,y:my,w:m.w,h:m.h})){
   die('A moving neon hazard hit you. Wait for its pattern, then jump through.');
   return;
  }
 }

 // Checkpoint activation.
 for(const c of checkpoints){
  if(player.x+player.w>c.x&&player.x<c.x+22&&
     Math.abs((player.y+player.h)-c.platformY)<3&&
     player.onGround&&!c.active){
   c.active=true;
   player.spawnX=c.x;
   player.spawnY=c.platformY-player.h;
   player.checkpoint=c.x;
   statusText.textContent='CHECKPOINT SAVED';
   tone(660,.15,'sine',.08);
  }
 }

 if(player.y>H+100){
  die('You missed the platform and fell into the gap. Start your jump closer to the edge.');
  return;
 }
 if(player.x+player.w>=goalX)winLevel();

 camera=Math.max(0,Math.min(levelLength-W,player.x-W*.32));

 for(let i=particles.length-1;i>=0;i--){
  const p=particles[i];
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
  if(p.life<=0)particles.splice(i,1);
 }
 if(Math.random()<.5){
  particles.push({
   x:camera+rand(0,W),y:rand(20,H),
   vx:rand(-6,6),vy:rand(-18,-3),
   life:rand(.5,1.5),r:rand(1,2.5)
  });
 }
}

function drawBackground(){
 const palettes=[
  ['#090513','#1a0b2a','#090610'],
  ['#080a19','#111b3b','#070914'],
  ['#100719','#29103a','#080510'],
  ['#061218','#102b35','#050a10'],
  ['#140714','#35102c','#08040b']
 ];
 const pal=palettes[(world-1)%palettes.length];
 const grad=ctx.createLinearGradient(0,0,0,H);
 grad.addColorStop(0,pal[0]);
 grad.addColorStop(.55,pal[1]);
 grad.addColorStop(1,pal[2]);
 ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);

 // Stars.
 for(let i=0;i<100;i++){
  let x=((i*137.3-camera*.08)%W+W)%W;
  let y=(i*71.7)%360;
  ctx.fillStyle=i%4===0?'#e9b7ff':'#75459b';
  ctx.globalAlpha=.2+((i%5)/10);
  ctx.fillRect(x,y,1.5,1.5);
 }
 ctx.globalAlpha=1;

 // Distant silhouettes.
 for(let layer=0;layer<3;layer++){
  ctx.fillStyle=['#160c25','#11091d','#0c0715'][layer];
  ctx.beginPath();ctx.moveTo(0,H);
  for(let x=-60;x<=W+60;x+=60){
   const y=290+layer*45+
    Math.sin((x+camera*.12)/(80+layer*20))*35+(x%3)*5;
   ctx.lineTo(x,y);
  }
  ctx.lineTo(W,H);ctx.closePath();ctx.fill();
 }

 ctx.strokeStyle='#6b21a8';ctx.globalAlpha=.13;
 for(let y=120;y<H;y+=55){
  ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
 }
 for(let x=0;x<W;x+=70){
  ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
 }
 ctx.globalAlpha=1;

 // Subtle glitch lights.
 ctx.globalAlpha=.09;
 ctx.fillStyle=world%2?'#d946ef':'#22d3ee';
 for(let i=0;i<5;i++){
  const gx=((i*191+worldTime*(18+i*3)-camera*.03)%(W+100)+W+100)%(W+100)-50;
  const gy=70+((i*83+world*29)%280);
  ctx.fillRect(gx,gy,rand(18,52),1.5);
 }
 ctx.globalAlpha=1;
}

function drawPlatform(p){
 const x=p.x-camera;
 if(x+p.w<0||x>W)return;
 ctx.fillStyle='#171023';ctx.fillRect(x,p.y,p.w,p.h);
 ctx.fillStyle='#8b5cf6';ctx.shadowColor='#a855f7';ctx.shadowBlur=13;
 ctx.fillRect(x,p.y,p.w,3);
 ctx.shadowBlur=0;ctx.fillStyle='#2e1745';
 for(let k=10;k<p.w;k+=28)ctx.fillRect(x+k,p.y+8,12,2);
}

function draw(){
 drawBackground();
 ctx.save();

 if(screenShake>0){
  ctx.translate(rand(-screenShake,screenShake),rand(-screenShake*.5,screenShake*.5));
  screenShake=Math.max(0,screenShake-.7);
 }
 ctx.translate(-camera,0);

 for(const p of platforms)drawPlatform(p);

 // Glowing spikes.
 for(const s of spikes){
  ctx.fillStyle='#d946ef';ctx.shadowColor='#c026d3';ctx.shadowBlur=10;
  for(let x=s.x;x<s.x+s.w;x+=14){
   ctx.beginPath();
   ctx.moveTo(x,s.y+s.h);
   ctx.lineTo(x+7,s.y);
   ctx.lineTo(x+14,s.y+s.h);
   ctx.fill();
  }
  ctx.shadowBlur=0;
 }

 // Moving hazards.
 for(const m of movers){
  const y=m.baseY+Math.sin(worldTime*m.speed+m.phase)*m.amp;
  ctx.fillStyle='#f0abfc';ctx.shadowColor='#d946ef';ctx.shadowBlur=18;
  ctx.fillRect(m.x,y,m.w,m.h);
  ctx.fillStyle='#2e1040';
  ctx.fillRect(m.x+5,y+5,m.w-10,m.h-10);
  ctx.shadowBlur=0;
 }

 // Checkpoints.
 for(const c of checkpoints){
  ctx.fillStyle=c.active?'#d8b4fe':'#5b21b6';
  ctx.fillRect(c.x,c.platformY-40,5,40);
  ctx.beginPath();
  ctx.moveTo(c.x+5,c.platformY-39);
  ctx.lineTo(c.x+29,c.platformY-31);
  ctx.lineTo(c.x+5,c.platformY-22);
  ctx.fill();
 }

 // Exit portal.
 const gx=goalX,gy=FLOOR-76;
 ctx.save();ctx.translate(gx,gy);
 ctx.strokeStyle='#e879f9';ctx.lineWidth=4;
 ctx.shadowColor='#c026d3';ctx.shadowBlur=22;
 ctx.beginPath();ctx.ellipse(0,36,24,38,0,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#a855f733';
 ctx.beginPath();ctx.ellipse(0,36,17,30,0,0,Math.PI*2);ctx.fill();
 ctx.restore();ctx.shadowBlur=0;

 // NOVA, the original neon courier character.
 const px=player.x,py=player.y;
 const run=Math.abs(player.vx)>25&&player.onGround;
 const stride=run?Math.sin(worldTime*17)*3:0;
 const bob=player.onGround?Math.sin(worldTime*8)*.55:Math.sin(worldTime*10)*.9;
 const facing=player.vx< -8?-1:1;

 ctx.save();
 ctx.translate(px+player.w/2,py+bob);
 ctx.scale(facing,1);

 // Ground glow.
 ctx.globalAlpha=.22;ctx.fillStyle='#67e8f9';
 ctx.beginPath();ctx.ellipse(0,player.h-1,14,3,0,0,Math.PI*2);ctx.fill();
 ctx.globalAlpha=1;

 // Speed trail.
 if(Math.abs(player.vx)>70){
  ctx.globalAlpha=.3;
  for(let i=0;i<3;i++){
   ctx.strokeStyle=i%2?'#c084fc':'#67e8f9';
   ctx.lineWidth=2;ctx.beginPath();
   ctx.moveTo(-8-i*4,10+i*5);
   ctx.lineTo(-15-i*5,10+i*5);
   ctx.stroke();
  }
  ctx.globalAlpha=1;
 }

 // Energy scarf.
 ctx.fillStyle='#7c3aed';
 ctx.beginPath();ctx.moveTo(-7,18);
 ctx.quadraticCurveTo(-18,18+stride,-17,25+stride);
 ctx.lineTo(-5,23);ctx.closePath();ctx.fill();

 ctx.fillStyle='#c084fc';
 ctx.beginPath();ctx.moveTo(-8,20);
 ctx.lineTo(-20,23+stride);ctx.lineTo(-11,26);
 ctx.closePath();ctx.fill();

 // Hood and fins.
 ctx.shadowColor='#a855f7';ctx.shadowBlur=12;ctx.fillStyle='#4c1d95';
 ctx.beginPath();ctx.moveTo(-10,9);ctx.lineTo(-12,-2);
 ctx.lineTo(-3,3);ctx.lineTo(4,1);ctx.lineTo(12,-4);
 ctx.lineTo(11,9);ctx.closePath();ctx.fill();

 ctx.fillStyle='#a855f7';
 ctx.beginPath();ctx.moveTo(-10,4);ctx.lineTo(-11,-1);ctx.lineTo(-5,4);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.moveTo(5,3);ctx.lineTo(11,-2);ctx.lineTo(9,6);ctx.closePath();ctx.fill();

 // Faceplate and glowing eyes.
 ctx.shadowBlur=0;ctx.fillStyle='#170d29';
 ctx.beginPath();ctx.moveTo(-10,8);
 ctx.quadraticCurveTo(-8,2,0,3);
 ctx.quadraticCurveTo(10,3,10,10);
 ctx.lineTo(7,17);ctx.lineTo(-7,17);ctx.closePath();ctx.fill();

 ctx.fillStyle='#67e8f9';ctx.shadowColor='#22d3ee';ctx.shadowBlur=8;
 ctx.fillRect(-6,8,4,3);ctx.fillRect(3,8,4,3);
 ctx.shadowBlur=0;

 // Armored jacket and energy core.
 ctx.fillStyle='#31104f';
 ctx.beginPath();ctx.moveTo(-8,16);ctx.lineTo(8,16);
 ctx.lineTo(10,27);ctx.lineTo(5,30);ctx.lineTo(2,25);
 ctx.lineTo(-3,25);ctx.lineTo(-6,30);ctx.lineTo(-11,27);
 ctx.closePath();ctx.fill();

 ctx.fillStyle='#a855f7';
 ctx.beginPath();ctx.moveTo(-7,17);ctx.lineTo(6,17);
 ctx.lineTo(8,25);ctx.lineTo(3,26);ctx.lineTo(0,22);
 ctx.lineTo(-4,26);ctx.lineTo(-8,24);ctx.closePath();ctx.fill();

 ctx.fillStyle='#e0f2fe';ctx.shadowColor='#67e8f9';ctx.shadowBlur=9;
 ctx.beginPath();ctx.moveTo(0,18);ctx.lineTo(3,21);
 ctx.lineTo(0,24);ctx.lineTo(-3,21);ctx.closePath();ctx.fill();
 ctx.shadowBlur=0;

 // Arms, legs, and glowing boots.
 ctx.strokeStyle='#c4b5fd';ctx.lineWidth=3;ctx.beginPath();
 ctx.moveTo(-7,18);ctx.lineTo(-11,23+stride*.25);
 ctx.moveTo(7,18);ctx.lineTo(11,22-stride*.25);ctx.stroke();

 ctx.fillStyle='#6d28d9';
 ctx.fillRect(-7,26+Math.max(0,stride),5,6);
 ctx.fillRect(2,26+Math.max(0,-stride),5,6);

 ctx.fillStyle='#67e8f9';
 ctx.fillRect(-8,31+Math.max(0,stride),7,2);
 ctx.fillRect(1,31+Math.max(0,-stride),7,2);

 // Running sparks.
 if(run&&Math.random()<.25){
  particles.push({
   x:player.x+player.w/2-rand(5,12),y:player.y+player.h-1,
   vx:rand(-25,10),vy:rand(-25,5),life:.25,r:2,kind:'spark'
  });
 }
 ctx.restore();
 ctx.restore();

 // Particles.
 for(const p of particles){
  ctx.globalAlpha=Math.min(1,Math.max(0,p.life*2));
  ctx.fillStyle=p.kind==='spark'?'#67e8f9':'#c084fc';
  ctx.shadowColor=ctx.fillStyle;
  ctx.shadowBlur=p.kind==='spark'?8:0;
  ctx.fillRect(p.x,p.y,p.r,p.r);
 }
 ctx.shadowBlur=0;ctx.globalAlpha=1;
 ctx.restore();

 // Progress bar and HUD.
 const progress=Math.min(1,player.x/goalX);
 ctx.fillStyle='#251333';ctx.fillRect(22,20,W-44,4);
 ctx.fillStyle='#c084fc';ctx.shadowColor='#c084fc';ctx.shadowBlur=8;
 ctx.fillRect(22,20,(W-44)*progress,4);ctx.shadowBlur=0;

 ctx.fillStyle='#d9c6ed';ctx.font='700 13px Orbitron';
 ctx.fillText(`W${world}  /  L${level}`,24,43);

 ctx.textAlign='right';ctx.fillStyle='#a891bd';
 ctx.font='600 12px Rajdhani';
 ctx.fillText(`FALLS ${deaths} · LIVES ${lives}`,W-24,43);
 ctx.textAlign='left';
}

function loop(now){
 raf=0;
 const dt=Math.min(.032,(now-last)/1000||.016);
 last=now;
 if(playing&&!paused)update(dt);
 draw();
 raf=requestAnimationFrame(loop);
}

// Keep the background animated while the menu is visible.
if(!raf){
 last=performance.now();
 raf=requestAnimationFrame(loop);
}
})();
