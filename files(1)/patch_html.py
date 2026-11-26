import sys, os, re
spec_path, thresh, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
default_html = 'GayHeistFinal.html' if os.path.exists('GayHeistFinal.html') else '../GayHeistFinal.html'
SRC_HTML = sys.argv[4] if len(sys.argv) > 4 else default_html
src = open(SRC_HTML, encoding='utf-8').read()
spec = open(spec_path).read().strip()

def rep(old, new, count=1):
    global src
    assert src.count(old) == count, (old[:60], src.count(old))
    src = src.replace(old, new)

# ---------- 1. CSS ----------
css_start = src.index("  /* Captcha placeholder module */")
css_end = src.index("</style>", css_start)
new_css = """  /* Captcha module */
  .captcha-panel {
    display: none;
    margin-top: 18px;
    margin-bottom: 18px;
    padding: 18px 16px 14px;
    background: var(--paper-raised);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: var(--shadow-out);
  }
  .captcha-panel.show { display: block; }
  .captcha-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .captcha-diff { font-weight: 700; letter-spacing: .08em; color: var(--ink); }
  .captcha-conf { font-size: 12px; color: var(--ink-soft); letter-spacing: .04em; }
  .captcha-conf.low { color: #b7791f; font-weight: 700; }
  .cap-cells { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 14px 0 10px; }
  .cap-cell { display: flex; flex-direction: column; align-items: center; min-width: 40px; padding: 6px 6px 5px;
    border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  .cap-cell.low { border-color: #b7791f; box-shadow: 0 0 0 1px #b7791f inset; }
  .cap-ch { font-family: 'Courier New', monospace; font-size: 30px; font-weight: 700; line-height: 1.1; color: var(--ink); }
  .cap-alts { display: flex; gap: 4px; margin-top: 4px; }
  .cap-alt { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; color: var(--ink-soft); background: transparent;
    border: 1px dashed var(--line); border-radius: 8px; padding: 1px 6px; cursor: pointer; }
  .cap-alt:hover, .cap-alt:focus-visible { color: var(--ink); border-style: solid; }
  .cap-pct { font-size: 10px; color: var(--ink-soft); margin-top: 2px; }
  .cap-note { margin: 4px 0 0; color: var(--ink-soft); font-size: 12.5px; line-height: 1.45; text-align: center; }

"""
src = src[:css_start] + new_css + src[css_end:]

# ---------- 2. Panel HTML ----------
p_start = src.index("  <!-- Captcha Empty Placeholder -->")
p_end = src.index('<div class="stamps" id="stamps">')
panel = """  <!-- Captcha module -->
  <div class="captcha-panel" id="captchaPanel">
    <div class="captcha-head">
      <div class="stamp-label">CAPTCHA &middot; <span class="captcha-diff" id="captchaDiff">—</span></div>
      <div class="captcha-conf" id="captchaConf"></div>
    </div>
    <div class="cap-cells" id="captchaCells" aria-live="polite"></div>
    <p class="cap-note" id="captchaNote">Paste, drop or upload the captcha image (the whole image, nothing cropped). Tap a small alternative under a character to swap it &mdash; the corrected answer is copied.</p>
  </div>

"""
src = src[:p_start] + panel + src[p_end:]

# ---------- 3. CaptchaVision model + code (inserted before CaesarVision) ----------
cv_js = r"""/* CaptchaVision: small CNN + per-slot classifier for the game's captcha (plain JS, weights embedded, no libraries) */
(function(global){
'use strict';
const SPEC = __SPEC__;
const SIZES={4:[180,29],6:[217,28],8:[271,27]}, R=7, WIN=15, NATIVE=[[360,4],[434,6],[542,8]], DIFF={4:'EASY',6:'MID',8:'HARD'};
let MODEL=null;
function b64f16(s){const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  const h=new Uint16Array(u.buffer),f=new Float32Array(h.length);
  for(let i=0;i<h.length;i++){const x=h[i],sg=(x&0x8000)?-1:1,e=(x>>10)&31,m=x&1023;
    f[i]=e===0?sg*Math.pow(2,-14)*(m/1024):e===31?0:sg*Math.pow(2,e-15)*(1+m/1024);}return f;}
function load(){const dec=l=>({...l,w:b64f16(l.w),b:b64f16(l.b)});
  return {charset:SPEC.charset,conv2d:SPEC.conv2d.map(dec),dense:SPEC.dense.map(dec),conv1d:SPEC.conv1d.map(dec),head:SPEC.head.map(dec)};}
function pad(n,k,s){const out=Math.ceil(n/s),tot=Math.max((out-1)*s+k-n,0);return{out,pad:tot>>1};}
function conv2d(x,H,W,C,L){
  const{k,cout,sy,sx,w,b}=L,py=pad(H,k,sy),px=pad(W,k,sx),oH=py.out,oW=px.out,y=new Float32Array(oH*oW*cout);
  for(let oy=0;oy<oH;oy++)for(let ox=0;ox<oW;ox++){const base=(oy*oW+ox)*cout;for(let c=0;c<cout;c++)y[base+c]=b[c];
    for(let ky=0;ky<k;ky++){const iy=oy*sy+ky-py.pad;if(iy<0||iy>=H)continue;
      for(let kx=0;kx<k;kx++){const ix=ox*sx+kx-px.pad;if(ix<0||ix>=W)continue;const ib=(iy*W+ix)*C,wb=(ky*k+kx)*C*cout;
        for(let ci=0;ci<C;ci++){const v=x[ib+ci];if(v===0)continue;const wo=wb+ci*cout;for(let c=0;c<cout;c++)y[base+c]+=v*w[wo+c];}}}
    for(let c=0;c<cout;c++){const v=y[base+c];y[base+c]=v>0?v:0;}}
  return{y,H:oH,W:oW,C:cout};}
function dense(x,rows,L,relu){const{nin,nout,w,b}=L,y=new Float32Array(rows*nout);
  for(let r=0;r<rows;r++)for(let o=0;o<nout;o++){let s=b[o];for(let i=0;i<nin;i++)s+=x[r*nin+i]*w[i*nout+o];y[r*nout+o]=relu&&s<0?0:s;}return y;}
function forward(m,img,H,W,N){
  let a={y:img,H,W,C:3};for(const L of m.conv2d)a=conv2d(a.y,a.H,a.W,a.C,L);
  const T=a.W,F=a.H*a.C,seq=new Float32Array(T*F);
  for(let t=0;t<T;t++)for(let h=0;h<a.H;h++)for(let c=0;c<a.C;c++)seq[t*F+h*a.C+c]=a.y[(h*a.W+t)*a.C+c];
  let cur=dense(seq,T,m.dense[0],true),ch=m.dense[0].nout;
  for(const L of m.conv1d){const nx=new Float32Array(T*L.cout),pd=pad(T,L.k,1).pad;
    for(let t=0;t<T;t++)for(let co=0;co<L.cout;co++){let s=L.b[co];
      for(let kk=0;kk<L.k;kk++){const tt=t+kk-pd;if(tt<0||tt>=T)continue;for(let ci=0;ci<L.cin;ci++)s+=cur[tt*ch+ci]*L.w[(kk*L.cin+ci)*L.cout+co];}
      nx[t*L.cout+co]=s>0?s:0;}cur=nx;ch=L.cout;}
  const[Wq,sw]=SIZES[N],x0=(Wq-N*sw)/2,win=new Float32Array(N*WIN*ch);
  for(let i=0;i<N;i++){const c=Math.round((x0+sw*(i+.5)-1.5)/4);
    for(let j=0;j<WIN;j++){const t=c+j-R;if(t<0||t>=T)continue;win.set(cur.subarray(t*ch,t*ch+ch),(i*WIN+j)*ch);}}
  const h1=dense(win,N,m.head[0],true),lg=dense(h1,N,m.head[1],false),K=m.head[1].nout,probs=[];
  for(let i=0;i<N;i++){let mx=-1e9;for(let k=0;k<K;k++)mx=Math.max(mx,lg[i*K+k]);let s=0;const p=new Float32Array(K);
    for(let k=0;k<K;k++){p[k]=Math.exp(lg[i*K+k]-mx);s+=p[k];}for(let k=0;k<K;k++)p[k]/=s;probs.push(p);}
  return probs;}
/* canvas / image -> native 210px-high frame -> exact 2x2 box average -> 105 x W/2 float RGB */
function prep(src){
  const sw=src.naturalWidth||src.width, sh=src.naturalHeight||src.height, w210=sw*210/sh;
  let best=NATIVE[0],bd=1e9;for(const c of NATIVE){const d=Math.abs(w210-c[0]);if(d<bd){bd=d;best=c;}}
  const Wt=best[0],N=best[1],cv=document.createElement('canvas');cv.width=Wt;cv.height=210;
  const cx=cv.getContext('2d',{willReadFrequently:true});cx.fillStyle='#fff';cx.fillRect(0,0,Wt,210);
  cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(src,0,0,Wt,210);
  const d=cx.getImageData(0,0,Wt,210).data,Wh=Wt/2,out=new Float32Array(105*Wh*3);
  for(let y=0;y<105;y++)for(let x=0;x<Wh;x++)for(let c=0;c<3;c++){
    const i0=((2*y)*Wt+2*x)*4+c,i2=i0+Wt*4;out[(y*Wh+x)*3+c]=(d[i0]+d[i0+4]+d[i2]+d[i2+4])/1020;}
  return{img:out,W:Wh,N,off:bd/Wt};}
function recognize(src){
  if(!MODEL)MODEL=load();
  const p=prep(src),probs=forward(MODEL,p.img,105,p.W,p.N),cs=MODEL.charset;
  let text='',minP=1,logSum=0;const slots=[];
  for(const pr of probs){
    const idx=[...pr.keys()].sort((a,b)=>pr[b]-pr[a]);
    const top=idx.slice(0,4).map(i=>[cs[i],pr[i]]);
    text+=top[0][0];minP=Math.min(minP,top[0][1]);logSum+=Math.log(Math.max(top[0][1],1e-6));
    slots.push({ch:top[0][0],p:top[0][1],alts:top.slice(1)});}
  const conf=Math.exp(logSum);  // probability the whole string is right, if slots were independent
  return{text,n:p.N,diff:DIFF[p.N],slots,minP,confidence:conf,sizeOff:p.off};}
global.CaptchaVision={recognize,THRESH:__THRESH__};
})(typeof window==='undefined'?globalThis:window);


"""
cv_js = cv_js.replace('__SPEC__', spec).replace('__THRESH__', thresh)
marker = "/* CaesarVision: Offline Serif Latin OCR for Caesar Cipher */"
assert src.count(marker) == 1
src = src.replace(marker, cv_js + marker)

# ---------- 4. text decode for captcha ----------
rep("""    if(type==='captcha') {
      return fail('Captcha solver module is not yet implemented.');
    }""", """    if(type==='captcha') {
      const t=text.replace(/[\\s*`]+/g,'');
      if(!t) return fail('Add an image or type the captcha characters first.');
      if(!/^[A-Za-z0-9]{1,12}$/.test(t)) return fail('Captcha characters are letters and digits only (case-sensitive).');
      text=t; output=t; trace=['Captcha: '+t+' (case-sensitive)']; return good();
    }""")

# ---------- 5. image recognition for captcha ----------
rep("""  function recognize(sample,mode='all',opts={}) {
    if(!sample.bounds""", """  function recognize(sample,mode='all',opts={}) {
    if(mode==='captcha'){
      const srcCanvas=(opts&&opts.canvas)||sample.canvas;
      if(!global.CaptchaVision||!srcCanvas) return {ok:false,error:'The captcha reader is unavailable.',candidates:[]};
      const r=global.CaptchaVision.recognize(srcCanvas);
      global.__captchaInfo=r;
      const review=r.confidence<global.CaptchaVision.THRESH||r.sizeOff>0.06;
      return {ok:true,type:'captcha',output:r.text,normalized:r.text,reading:r.text,confidence:r.confidence,
        trace:['Captcha '+r.diff+' ('+r.n+' characters): '+r.text],needsReview:review,candidates:[],conflicting:[],boxes:[]};
    }
    if(!sample.bounds""")

# ---------- 6. descriptions / specs / UI toggles ----------
rep("captcha:'Captcha module placeholder'", "captcha:'Captcha · 4, 6 or 8 characters · case-sensitive · paste the whole captcha image'")
old_desc = re.search(r"    captcha: \['<b>Captcha module</b> placeholder\..*?\],\n", src).group(0)
src = src.replace(old_desc, "    captcha: ['Read the <b>captcha</b> (4, 6 or 8 case-sensitive characters). Uncertain characters are outlined; tap a small alternative under a character to swap it, or edit the text below.', 'DETECTED CHARACTERS — tap an alternative to correct it', 'aB3k', 'aB3k', 'Captcha: type the characters exactly (letters and digits, case-sensitive).'],\n")
rep("if (stamps) stamps.style.display = (isMap || isCaptcha) ? 'none' : '';", "if (stamps) stamps.style.display = isMap ? 'none' : '';")

# ---------- 7. cells renderer, wired into renderResult ----------
rep("""      } else if (effectiveType === 'colortext'){
        renderColorTextGroups();
      } else {""", """      } else if (effectiveType === 'colortext'){
        renderColorTextGroups();
      } else if (effectiveType === 'captcha'){
        cellsWrap.innerHTML = '';
        results.classList.remove('show');
        renderCaptchaCells(norm, result);
      } else {""")
rep("  function renderResult(result, { manual = false, autoCopy = true, syncCells = true } = {}){", r"""  const captchaCellsEl = el('captchaCells'), captchaDiffEl = el('captchaDiff'), captchaConfEl = el('captchaConf');
  function renderCaptchaCells(text, result){
    if (!captchaCellsEl) return;
    const info = window.__captchaInfo, slots = info && info.slots && info.slots.length === text.length ? info.slots : null;
    captchaCellsEl.innerHTML = '';
    if (captchaDiffEl) captchaDiffEl.textContent = info ? info.diff + ' · ' + info.n : '—';
    [...text].forEach((ch, i) => {
      const s = slots ? slots[i] : null, cell = document.createElement('div');
      cell.className = 'cap-cell' + (s && ch === s.ch && s.p < 0.6 ? ' low' : '');
      const big = document.createElement('div'); big.className = 'cap-ch'; big.textContent = ch; cell.appendChild(big);
      if (s){
        const alts = document.createElement('div'); alts.className = 'cap-alts';
        const options = [[s.ch, s.p], ...s.alts].filter(a => a[0] !== ch).slice(0, 3);
        options.forEach(([a]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'cap-alt'; b.textContent = a;
          b.setAttribute('aria-label', 'Use ' + a + ' for character ' + (i + 1));
          b.addEventListener('click', () => { rawInput.value = text.slice(0, i) + a + text.slice(i + 1); decodeReading(); });
          alts.appendChild(b);
        });
        cell.appendChild(alts);
        const pct = document.createElement('div'); pct.className = 'cap-pct';
        pct.textContent = ch === s.ch ? Math.round(s.p * 100) + '%' : 'edited'; cell.appendChild(pct);
      }
      captchaCellsEl.appendChild(cell);
    });
    if (captchaConfEl){
      const low = !!(result && result.needsReview);
      captchaConfEl.className = 'captcha-conf' + (low ? ' low' : '');
      captchaConfEl.textContent = !info ? '' : (result && result.confidence === 1 && !slots) ? '' :
        (low ? 'CHECK — not copied automatically · ' : '') + 'confidence ' + Math.round(((result && result.confidence) || 0) * 100) + '%';
    }
  }

  function renderResult(result, { manual = false, autoCopy = true, syncCells = true } = {}){""")

# ---------- 8. changelog + version ----------
rep('SCOUT + LOCKSMITH + VANGUARD · v1.22', 'SCOUT + LOCKSMITH + VANGUARD · v1.23')
rep('<ul class="changelog-list" id="changelogList" hidden>\n', '<ul class="changelog-list" id="changelogList" hidden>\n      <li><span class="changelog-version">v1.23</span><span class="changelog-text"><strong>Captcha:</strong> the Captcha tab now reads the game captcha (4 / 6 / 8 characters, case-sensitive) with a small neural net that runs entirely in the page. Uncertain characters are outlined and offer tap-to-swap alternatives; low-confidence readings are not auto-copied.</span></li>\n')

open(out_path, 'w', encoding='utf-8').write(src)
print('written', out_path, len(src) / 1e6, 'MB')
