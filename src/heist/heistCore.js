// Heist (cipher decoders) — the script from public/HiTestCTC.html, unchanged, wrapped so it runs
// once after HeistApp has put the page markup in place. Only one app (Heist or Bombs) runs per
// page load, so the window listeners it adds never need removing.
/* eslint-disable */
import { createCaptchaVision } from './captcha/captchaVision.js';
import { SPEC as CAPTCHA_SPEC } from './captcha/captchaSpec.js';
import { warmImageHosts, dragHasLink, isInternalDrag } from '../utils/image.js';
import { startingAutocopy, saveAutocopy } from '../core/autocopy.js';
import { SKINS, isSkin, loadSkinFont } from '../core/skins.js';
let mounted = false;
export function mountHeist() {
  if (mounted) return;
  mounted = true;

// Shared UI state read by both the decoder core and the app (replaces the old window.__* globals).
window.CipherState = { caesarShift: 0, colorFilter: 'purple', colorWordItems: [], captchaInfo: null };

(function (global) {
  'use strict';
  const names = {all:'All',morse:'Morse',a1z26:'A1Z26',binary:'Binary',sort:'Sort',braille:'Braille',chinese:'Chinese',words:'Words',caesar:'Caesar',colortext:'Color Text',captcha:'Captcha'};
  const morseCodes = ['.-','-...','-.-.','-..','.','..-.','--.','....','..','.---','-.-','.-..','--','-.','---','.--.','--.-','.-.','...','-','..-','...-','.--','-..-','-.--','--..'];
  const brailleDots = ['1','12','14','145','15','124','1245','125','24','245','13','123','134','1345','135','1234','12345','1235','234','2345','136','1236','2456','1346','13456','1356'];
  const morse = Object.fromEntries(morseCodes.map((x,i)=>[x,String.fromCharCode(65+i)]));
  const braille = Object.fromEntries(brailleDots.map((x,i)=>[String.fromCharCode(0x2800+[...x].reduce((m,n)=>m|(1<<(Number(n)-1)),0)),String.fromCharCode(65+i)]));
  const digitWords = ['zero','one','two','three','four','five','six','seven','eight','nine'];
  const specs = {
    all:'Automatically identify any of the seven puzzle types.',
    morse:'1–8 letters · dots and dashes · spaces between letters',
    a1z26:'2–5 letters · numbers 1–26 · slashes between letters',
    binary:'1–5 letters · 8-bit ASCII · spaces between bytes',
    sort:'2–10 integers · −100 to 100 · choose the order',
    braille:'1–8 letters · six-dot Braille · spaces between cells',
    chinese:'Chinese numerals · 1–99,999,999 · output without leading zeroes',
    words:'2–8 single digits · spell each digit in English, in the original order',
    caesar:'Caesar cipher · uppercase letters · set shift below (left: negative, right: positive)',
    colortext:'Color text · words printed in colors · extracts words matching the selected color',
    captcha:'Captcha · 4, 6 or 8 characters · case-sensitive · paste the whole captcha image'
  };
  function normalize(text) {
    return String(text||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[−–—‒―﹣]/g,'-').replace(/[⁄∕]/g,'/').trim();
  }
  function letterCase(text,mode){ return mode==='upper'?text.toUpperCase():mode==='lower'?text.toLowerCase():text; }
  function decodeOne(input,type,opts={}) {
    // strict = image recognition / All mode (only the unambiguous formats); typed or pasted text in a tab is lenient.
    const strict=!!opts.strict;
    let text=normalize(input), output='', tokens=[], trace=[];
    const fail=error=>({ok:false,type,error});
    let extra=null; const good=()=>({ok:true,type,output,normalized:text,trace,...(extra||{})});
    const cell=dots=>String.fromCharCode(0x2800+[...dots].reduce((m,n)=>m|(1<<(Number(n)-1)),0));
    if (!text) return fail('Add an image or enter a reading first.');
    if (type==='chinese') text=text.replace(/[。．.，,、；;！!？?\s]+/g,'');
    if (!strict && text.includes('?') && ['a1z26','binary','sort','words'].includes(type)) return fail('A "?" marks an unread digit. Replace it with the real digit and apply again.');
    if(type==='morse') {
      text=text.replace(/[·•∙●]/g,'.').replace(/…/g,'...').replace(/_/g,'-').replace(/\s*[\/|,]\s*/g,' ').replace(/\s+/g,' ').trim();
      if(!strict && /^[A-Za-z]{1,8}$/.test(text)) {
        const letters=[...text.toUpperCase()], codes=letters.map(l=>morseCodes[l.charCodeAt(0)-65]);
        output=letterCase(letters.join(''),opts.letterCase);
        text=codes.join(' '); trace=codes.map((c,i)=>`${c} → ${letters[i]}`); return good();
      }
      tokens=text.split(' ');
      if(tokens.length<1||tokens.length>8||tokens.some(t=>!morse[t])) return fail('Morse needs 1–8 valid A–Z codes, separated by / or spaces.');
      output=letterCase(tokens.map(t=>morse[t]).join(''),opts.letterCase);
      trace=tokens.map(t=>`${t} → ${morse[t]}`); return good();
    }
    if(type==='a1z26') {
      if(!strict && /^[A-Za-z]{2,5}$/.test(text)) tokens=[...text.toUpperCase()].map(c=>c.charCodeAt(0)-64);
      else {
        const ok=strict ? /^\d{1,2}(?:\s*\/\s*\d{1,2}){1,4}$/ : /^\d{1,2}(?:(?:\s*[\/,;]\s*|\s+)\d{1,2}){1,4}$/;
        if(!ok.test(text)) return fail(strict ? 'A1Z26 needs 2–5 numbers separated by slashes, such as 10 / 1 / 18.' : 'A1Z26 needs 2–5 numbers separated by / or spaces, such as 10 / 1 / 18 (or a 2–5 letter word).');
        tokens=text.split(strict ? /\s*\/\s*/ : /\s*[\/,;]\s*|\s+/).map(Number);
      }
      if(tokens.some(n=>n<1||n>26)) return fail('Every A1Z26 number must be between 1 and 26.');
      output=letterCase(tokens.map(n=>String.fromCharCode(64+n)).join(''),opts.letterCase);
      text=tokens.join(' / '); trace=tokens.map(n=>`${n} → ${String.fromCharCode(64+n)}`); return good();
    }
    if(type==='binary') {
      text=text.replace(/[\s,]+/g,' ').trim();
      if(!strict && /^[01]{8,40}$/.test(text) && text.length%8===0) text=text.match(/[01]{8}/g).join(' ');
      tokens=text.split(' ');
      if(tokens.length<1||tokens.length>5||tokens.some(t=>!/^[01]{8}$/.test(t))) return fail('Binary needs 1–5 groups of exactly eight bits, separated by spaces.');
      const letters=tokens.map(t=>String.fromCharCode(parseInt(t,2)));
      if(letters.some(t=>!/[A-Za-z]/.test(t))) return fail('Every byte must encode an ASCII letter (A–Z or a–z).');
      output=letterCase(letters.join(''),opts.letterCase);
      trace=tokens.map((t,i)=>`${t} → ${letters[i]}`); return good();
    }
    if(type==='sort') {
      text=text.replace(/[\s,;]+/g,' ').trim(); tokens=text.split(' ');
      if(tokens.length<2||tokens.length>10||tokens.some(t=>!/^[-+]?\d{1,3}$/.test(t))) return fail('Sort needs 2–10 integers between −100 and 100, separated by spaces or commas.');
      const nums=tokens.map(Number);
      if(nums.some(n=>n < -100||n > 100)) return fail('Sort values must be between −100 and 100, inclusive.');
      const sorted=[...nums].sort((a,b)=>opts.order==='desc'?b-a:a-b);
      output=sorted.join(' '); text=nums.join(' ');
      trace=[opts.order==='desc'?'Largest → smallest':'Smallest → largest',`${text} → ${output}`]; return good();
    }
    if(type==='words') {
      text=text.replace(/[\s,;]+/g,' ').trim(); tokens=text.split(' ');
      if(tokens.length<2||tokens.length>8||tokens.some(t=>!/^\d$/.test(t))) return fail('Words needs 2–8 single digits separated by spaces or commas, such as 8 7 3.');
      const nums = tokens.map(Number);
      const normalLR = nums.map(n => digitWords[n]).join(' ');
      const normalRL = [...nums].reverse().map(n => digitWords[n]).join(' ');
      const evens = nums.filter(n => n % 2 === 0);
      const evenLR = evens.map(n => digitWords[n]).join(' ');
      const evenRL = [...evens].reverse().map(n => digitWords[n]).join(' ');
      const odds = nums.filter(n => n % 2 !== 0);
      const oddLR = odds.map(n => digitWords[n]).join(' ');
      const oddRL = [...odds].reverse().map(n => digitWords[n]).join(' ');
      output = normalLR;
      trace = [
        `normal lr: ${normalLR}`,
        `normal rl: ${normalRL}`,
        `even lr: ${evenLR || '(none)'}`,
        `even rl: ${evenRL || '(none)'}`,
        `odd lr: ${oddLR || '(none)'}`,
        `odd rl: ${oddRL || '(none)'}`
      ];
      return {
        ok: true,
        type: 'words',
        output,
        normalized: text,
        trace,
        words: { normalLR, normalRL, evenLR, evenRL, oddLR, oddRL }
      };
    }
    if(type==='braille') {
      const blank='A blank Braille cell has no letter. Turn on at least one dot.';
      const dup='Each Braille dot number can appear only once in a cell.';
      if(/^(?:\[[0-6]{1,6}\]\s*){1,8}$/.test(text)) {
        const cells=text.match(/\[[0-6]{1,6}\]/g).map(c=>c.slice(1,-1));
        if(cells.some(c=>c==='0')) return fail(blank);
        if(cells.some(c=>c.includes('0')||new Set(c).size!==c.length)) return fail(dup);
        text=cells.map(cell).join(' ');
      } else if(!strict && /^[0-6]{1,6}(?:(?:\s*[\/,;]\s*|\s+)[0-6]{1,6}){0,7}$/.test(text)) {
        const groups=text.split(/\s*[\/,;]\s*|\s+/);
        if(groups.some(g=>g==='0')) return fail(blank);
        if(groups.some(g=>g.includes('0')||new Set(g).size!==g.length)) return fail(dup);
        text=groups.map(cell).join(' ');
      } else if(!strict && /^[A-Za-z]{1,8}$/.test(text)) {
        text=[...text.toUpperCase()].map(l=>cell(brailleDots[l.charCodeAt(0)-65])).join(' ');
      }
      text=text.replace(/\s+/g,' '); tokens=text.split(' ');
      if(tokens.length<1||tokens.length>8||tokens.some(t=>!braille[t])) return fail('Braille needs 1–8 A–Z cells. Type [123] [14] [24], dot numbers like 123 / 14 / 24, or a word.');
      output=letterCase(tokens.map(t=>braille[t]).join(''),opts.letterCase);
      trace=tokens.map(t=>`${t} [${brailleDots[braille[t].charCodeAt(0)-65]}] → ${braille[t]}`); return good();
    }
    if(type==='caesar') {
      if(strict && !opts.fromVision) return fail('Caesar cipher text decoding requires selecting the Caesar tab.');
      text=text.replace(/[^A-Za-z]/g,'').toUpperCase();
      if(!text) return fail('Caesar cipher needs at least 1 letter (A–Z).');
      const shift = Number(opts.caesarShift != null ? opts.caesarShift : ((typeof window !== 'undefined' && CipherState.caesarShift) || 0));
      // In this app, shift is applied as Left Shift (-shift) by default, matching stampMain
      const shifted = [...text].map(c => {
        const code = c.charCodeAt(0) - 65;
        const s = ((code - shift) % 26 + 26) % 26;
        return String.fromCharCode(65 + s);
      }).join('');
      output = letterCase(shifted, opts.letterCase);
      trace = [`Shift: -${Math.abs(shift)} (Left shift)`, `${text} → ${output}`];
      return good();
    }
    if(type==='colortext') {
      const COLORS=['green','purple','orange','red','blue','black'];
      const filt=String(opts.colorFilter||(typeof window!=='undefined'&&CipherState.colorFilter)||'purple').toLowerCase();
      const defColor=COLORS.includes(filt)?filt:'purple';
      const items=[];
      for(const t of text.replace(/[\s,;]+/g,' ').trim().split(' ').filter(Boolean)){
        const m=t.match(/^(.+?):([A-Za-z]+)$/);
        if(m){
          const c=m[2].toLowerCase();
          if(!COLORS.includes(c)) return fail('Unknown color "'+m[2]+'". Use green, purple, orange, red, blue or black.');
          items.push({word:m[1],color:c});
        } else if(strict) return fail('Color Text needs word:color pairs, such as chamber:green.');
        else items.push({word:t,color:defColor});
      }
      if(!items.length) return fail('Color Text needs at least one word.');
      // Keep skipped-word marks (and detection data) when the same reading is applied again.
      const prev=(typeof window!=='undefined'&&CipherState.colorWordItems)||[];
      items.forEach((it,i)=>{ const q=prev[i]; if(q&&q.word===it.word&&q.color===it.color){ it.excluded=!!q.excluded; if(q.row!=null){it.row=q.row;it.col=q.col;it.score=q.score;} } });
      text=items.map(i=>i.word+':'+i.color).join(' ');
      output=items.filter(i=>!i.excluded&&(filt==='all'||i.color===filt)).map(i=>i.word).join(' ');
      trace=['Color filter: '+filt,'Words in '+filt+': '+(output||'(none)')];
      extra={items};
      return good();
    }
    if(type==='captcha') {
      const t=text.replace(/[\s*`]+/g,'');
      if(!t) return fail('Add an image or type the captcha characters first.');
      if(!/^[A-Za-z0-9]{1,12}$/.test(t)) return fail('Captcha characters are letters and digits only (case-sensitive).');
      const bad = t.match(/[BCFIJKLOPSUVWXYZcgjklopqsuvwxyz0168]/g);
      if(bad) {
        const unique = [...new Set(bad)].join(', ');
        return fail('Impossible captcha character(s): ' + unique + ' (answers never contain these characters).');
      }
      text=t; output=t; trace=['Captcha: '+t+' (case-sensitive)']; return good();
    }
        if(type==='chinese') {
      if(!global.ChineseVision) return fail('Chinese recognition is unavailable.');
      const r=global.ChineseVision.decode(text);
      if(!r.ok) return fail(r.error||'Enter a Chinese numeral between 1 and 99,999,999.');
      output=r.output; text=r.normalized||text;
      trace=[`${text} → ${output}`,'Range: 1–99,999,999. Output has no leading zeroes.']; return good();
    }
    return fail('Choose a decoder mode.');
  }
  function decodeText(input,mode='all',opts={}) {
    if(mode!=='all') return {...decodeOne(input,mode,opts),alternatives:[]};
    const choices=['morse','a1z26','binary','braille','chinese','words','sort','colortext','captcha'].map(t=>decodeOne(input,t,{...opts,strict:true})).filter(r=>r.ok);
    if(choices.length===1&&choices[0].type==='captcha'&&/^[A-Z]{2,12}$/.test(String(input).trim())){
      const cz=decodeOne(input,'caesar',{...opts,strict:true,fromVision:true});
      if(cz.ok) return {...cz,alternatives:choices};
    }
    if(!choices.length) return {ok:false,error:'This reading does not match the known formats. Check the text or choose a specific tab.',alternatives:[]};
    const main=choices.find(r=>r.type==='words')||(/:/.test(String(input))&&choices.find(r=>r.type==='colortext'))||choices[0];
    return {...main,alternatives:choices.filter(r=>r!==main)};
  }

  function fromRGBA(imageData, settings={}) {
    const width=imageData.width, height=imageData.height, pixels=imageData.data;
    const gray=new Uint8Array(width*height), hist=new Uint32Array(256);
    let edgeTotal=0,edgeCount=0;
    for(let y=0,p=0;y<height;y++) for(let x=0;x<width;x++,p++) {
      const p4=p*4, al=pixels[p4+3];
      const g=al===255 ? Math.round(.2126*pixels[p4]+.7152*pixels[p4+1]+.0722*pixels[p4+2]) : Math.round((.2126*pixels[p4]+.7152*pixels[p4+1]+.0722*pixels[p4+2])*(al/255)+255*(1-al/255));
      gray[p]=g; hist[g]++;
      if(x<3||y<3||x>=width-3||y>=height-3){edgeTotal+=g;edgeCount++;}
    }
    let threshold=127;
    if(settings.threshold!=null && settings.threshold!=='auto') threshold=Number(settings.threshold);
    else {
      let sum=0; for(let i=0;i<256;i++) sum+=hist[i]*i;
      let n0=0,s0=0,best=-1;
      for(let t=0;t<255;t++){
        n0+=hist[t]; s0+=hist[t]*t;
        const n1=gray.length-n0;
        if(!n0||!n1) continue;
        const diff=s0/n0-(sum-s0)/n1, score=n0*n1*diff*diff;
        if(score>best){best=score;threshold=t;}
      }
      threshold=Math.max(20,Math.min(235,threshold));
    }
    const inverted=settings.invert===true || (settings.invert!=='normal'&&settings.invert!==false&&edgeTotal/Math.max(1,edgeCount)<127);
    const data=new Uint8Array(gray.length);
    let foregroundCount=0;
    for(let i=0;i<gray.length;i++){
      const ink=inverted?+(gray[i]>threshold):+(gray[i]<=threshold);
      data[i]=ink;
      foregroundCount+=ink;
    }
    // The flood-fill queue only ever contains foreground pixels. Puzzle images are
    // mostly background, so sizing it to ink avoids a large unnecessary allocation.
    const seen=new Uint8Array(data.length), queue=new Int32Array(foregroundCount), components=[];
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let p=0;p<data.length;p++){
      if(!data[p]||seen[p])continue;
      let head=0,tail=0,left=width,top=height,right=-1,bottom=-1,area=0,sx=0,sy=0;
      queue[tail++]=p;seen[p]=1;
      while(head<tail){
        const q=queue[head++],x=q%width,y=(q/width)|0;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);area++;sx+=x;sy+=y;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const xx=x+dx,yy=y+dy,pp=yy*width+xx;
          if(xx>=0&&xx<width&&yy>=0&&yy<height&&data[pp]&&!seen[pp]){seen[pp]=1;queue[tail++]=pp;}
        }
      }
      if(area<2){for(let i=0;i<tail;i++)data[queue[i]]=0;continue;}
      components.push({x:left,y:top,w:right-left+1,h:bottom-top+1,area,cx:(left+right)/2,cy:(top+bottom)/2,centroidX:sx/area,centroidY:sy/area});
      minX=Math.min(minX,left);minY=Math.min(minY,top);maxX=Math.max(maxX,right);maxY=Math.max(maxY,bottom);
    }
    return {width,height,data,components:components.sort((a,b)=>a.x-b.x||a.y-b.y),bounds:maxX<0?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1},threshold,inverted};
  }
  function recognize(sample,mode='all',opts={}) {
    const warn=e=>{try{console.warn('[CipherCore recognizer]',e);}catch(_){}};
    const canvasSource = (opts && opts.canvas) || sample.canvas || (typeof state !== 'undefined' ? state.canvas : null);
    if(mode==='captcha'){
      if(!global.CaptchaVision||!canvasSource) return {ok:false,error:'The captcha reader is unavailable.',candidates:[]};
      const r=global.CaptchaVision.recognize(canvasSource);
      CipherState.captchaInfo=r;
      const review=r.confidence<global.CaptchaVision.THRESH||r.sizeOff>0.06;
      return {ok:true,type:'captcha',output:r.text,normalized:r.text,reading:r.text,confidence:r.confidence,
        trace:['Captcha '+r.diff+' ('+r.n+' characters): '+r.text],needsReview:review,candidates:[],conflicting:[],boxes:[]};
    }

    const raw=[];
    const accept=(candidate,fallback)=>{
      if(!candidate||!candidate.text)return;
      const type=candidate.type||fallback||mode;
      const decoded=decodeText(candidate.text,type==='numeric'?mode:type,{...opts,strict:true,fromVision:true});
      if(decoded.ok && (mode==='all'||decoded.type===mode)) raw.push({...candidate,...decoded,reading:candidate.text,confidence:Math.max(0,Math.min(1,Number(candidate.confidence)||0)),diagnostics:candidate.diagnostics||[],boxes:candidate.boxes||[]});
    };

    // Fast-path: ColorVision runs in <3ms.
    // If a valid color-word grid is found, accept it immediately and skip all other engines.
    let colorHit=false;
    if((mode==='all'||mode==='colortext')&&global.ColorVision&&canvasSource){
      try{
        const cr=global.ColorVision.recognize(canvasSource,sample);
        const hasColorWords = cr && cr.boxes && cr.boxes.some(b => !b.label.includes('(black)'));
        if(cr&&(mode==='colortext'||((cr.confidence>=.4 || cr.minScore>=.4) && hasColorWords))){
          accept(cr,'colortext');
          colorHit=raw.some(c=>c.type==='colortext');
        }
      }catch(e){warn(e);}
    }
    if(mode==='all' && colorHit){
      raw.sort((a,b)=>b.confidence-a.confidence);
      const best=raw[0];
      return { ...best, candidates: raw, conflicting: [] };
    }

    // Captcha vision check in All mode:
    // Captchas strictly have native dimensions 360x210 (~1.71), 434x210 (~2.07), 542x210 (~2.58).
    // Fast-reject any aspect ratio outside 1.35 <= ar <= 3.0 (e.g. Morse/A1Z26/Sort strips with ar >= 3.2).
    let captchaCandidate = null;
    if(mode==='all' && global.CaptchaVision && canvasSource && !colorHit){
      try{
        const sw = canvasSource.naturalWidth || canvasSource.width;
        const sh = canvasSource.naturalHeight || canvasSource.height;
        const ar = sw / Math.max(1, sh);
        if(ar >= 1.35 && ar <= 3.0){
          const r = global.CaptchaVision.recognize(canvasSource);
          if(r && r.sizeOff <= 0.22){
            const avgCharProb = Math.pow(Math.max(1e-9, r.confidence), 1 / r.n);
            const isConfident = (r.confidence >= 0.22) || (avgCharProb >= 0.85 && (r.minP || 0) >= 0.22);
            if(isConfident){
              CipherState.captchaInfo = r;
              const review = r.confidence < global.CaptchaVision.THRESH || r.sizeOff > 0.08;
              const rankConfidence = Math.max(r.confidence, avgCharProb * 0.95);
              captchaCandidate = {
                ok: true,
                type: 'captcha',
                output: r.text,
                normalized: r.text,
                reading: r.text,
                confidence: rankConfidence,
                rawConfidence: r.confidence,
                trace: ['Captcha ' + r.diff + ' (' + r.n + ' characters): ' + r.text],
                needsReview: review,
                boxes: []
              };
              // FAST-PATH: If confident captcha detected, return immediately!
              // Saves running DotVision, CaesarVision, NumericVision, and ChineseVision.
              if(rankConfidence >= 0.70 || (r.confidence >= 0.50 && avgCharProb >= 0.90)){
                return { ...captchaCandidate, candidates: [captchaCandidate], conflicting: [] };
              }
            }
          }
        }
      }catch(e){warn(e);}
    }

    if(!sample.bounds || !sample.components.length || sample.components.length > 500){
      if(captchaCandidate){
        return { ...captchaCandidate, candidates: [captchaCandidate], conflicting: [] };
      }
      return {ok:false, error: (sample.components && sample.components.length > 500) ? 'Too many marks for a single puzzle. Crop the image to the puzzle row and try again.' : 'No readable marks found. Try a closer, higher-contrast image.', candidates:[]};
    }

    if((mode==='all'||mode==='morse'||mode==='braille')&&global.DotVision){
      try{for(const c of global.DotVision.recognize(sample,mode)||[])accept(c);}catch(e){}
    }

    if((mode==='caesar'||(mode==='all'&&!colorHit))&&global.CaesarVision){
      try{
        const cv=global.CaesarVision.recognize(sample);
        if(cv){if(mode==='all')cv.confidence=Math.max(0,cv.confidence-.05);accept(cv,'caesar');}
      }catch(e){warn(e);}
    }

    if((mode==='all'||['a1z26','binary','sort','words'].includes(mode))&&global.NumericVision){
      try{accept(global.NumericVision.recognize(sample),'numeric');}catch(e){warn(e);}
    }

    // ChineseVision Guard: Only search Chinese template glyphs if no other recognizer
    // found a high-confidence match (>= 0.85). This makes numeric, dot, and Caesar puzzles 15-30ms faster.
    const hasHighConf = raw.some(c => c.confidence >= 0.85);
    if((mode==='chinese'||(mode==='all'&&!hasHighConf))&&global.ChineseVision){
      try{accept(global.ChineseVision.recognize(sample),'chinese');}catch(e){warn(e);}
    }

    if((mode==='all') && !colorHit && captchaCandidate){
      raw.push(captchaCandidate);
      if(/[0-9a-z]/.test(captchaCandidate.output) || captchaCandidate.confidence >= 0.75){
        const filtered = raw.filter(c => c.type !== 'caesar');
        raw.length = 0;
        raw.push(...filtered);
      }
    }

    raw.sort((a,b)=>b.confidence-a.confidence);
    if(!raw.length){
      if(mode==='all' && captchaCandidate) return { ...captchaCandidate, candidates: [captchaCandidate], conflicting: [] };
      return {ok:false,error:'Could not read a valid '+(mode==='all'?'puzzle':names[mode]+' puzzle')+'. Try a clearer image, adjust contrast, or type the reading.',candidates:[]};
    }
    const best=raw[0];
    const conflicting=raw.slice(1).filter(c=>c.output!==best.output&&c.confidence>=best.confidence-.07&&c.confidence>=.72);
    const needsReview=best.confidence<.78||conflicting.length>0;
    return {...best,needsReview:best.needsReview||needsReview,candidates:raw,conflicting};
  }
  global.CipherCore={names,specs,morse,braille,brailleDots,morseCodes,digitWords,normalize,decodeOne,decodeText,fromRGBA,recognize};
})(typeof window==='undefined'?globalThis:window);


/* CaptchaVision CTC: in-browser Transformer engine — src/heist/captcha/captchaVision.js, model in captchaSpec.js */
(function(global){ global.CaptchaVision = createCaptchaVision(CAPTCHA_SPEC); })(typeof window === 'undefined' ? globalThis : window);


/* CaesarVision: Offline Serif Latin OCR for Caesar Cipher */
(function(global){
'use strict';
const TW=24, TH=32;
function pop(n){n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);return (((n+(n>>>4))&0x0F0F0F0F)*0x01010101)>>>24;}
const RAW = [["F", 0.7031, "///+////f///P///P///H+AHH+ADH+AAH+AAH+AAH+AAH+AAH+AAH//8H//8H//8H//8H//8H+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH8AAH8AAH4AAHAAA"], ["H", 0.8594, "/4A//4B//4B/f4B/P4B/P4B/H4B/H4B/H4B/H4B/H4B/H4B/H///H///H///H///H///H///H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B+HwB+HgB8GABw"], ["X", 0.9206, "/wP+/4P+f4H+P8H4P8H4H+PwH+PwD/PgD/fgB//AB/+AA/+AA/8AAf8AAf4AAP4AAP8AAf8AAf+AA/+AA//AB//AB9/gD8/gD4/wHw/wPwf4Pgf4fgP8fAP++AH/8AD/"], ["V", 0.9841, "/8D//8D//8D/f4B8P4B8P4B4H8B4H8B4H8DwD8DwD+DwD+HwB+HgB+HgB/HgB/PgA/PAA/PAA/PAA//AAf+AAf+AAf+AAP+AAP8AAP8AAP8AAH8AAH4AAH4AAD4AABwA"], ["I", 0.4219, "f//+////f///H//4D//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wD//4P//+////f///"], ["T", 0.8125, "///+////////////////wP8DAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP4AAPwAAPAA"], ["E", 0.7667, "f//+///+f///P///H///H8AHH8AAH8AAH8AAH8AAH8AAH8AAH//4H//8H//8H//8H//8H//4H8AAH8AAH8AAH8AAH8AAH8AAH8ACH+AHH///H///H///H///H///H//+"], ["W", 1.3729, "/wA//ww//g4/Ph4+Ph4+Ph88Ph88Ph88Px88Hz88Hz88Hz88Hz+8Hz+8Hz+8D//4D//4D/f4D/f4D/f4B/f4B+P4B+P4B+PwB+PwB+PwB+HwA8HwA8HwA8HwA8HwAYDg"], ["K", 0.95, "/w/8/w/8/wf4fwfgPwfgPwfAPw+APx+APx8APz8APz4AP34AP3wAP/4AP/4AP/4AP/8AP/8AP/+AP/+AP5/APx/APw/gPw/gPwfgPwfwPwfwPwP4PwH8PgD+PAD/MAA/"], ["D", 0.918, "//4A//+A///gf//wP//4P4/4P4P8P4H+P4D+P4D+P4B/P4B/P4B/P4B/P4B/P4B/P4B/P4B/P4B/P4D/P4D/P4D+P4H+P4H+P4f8P//4P//4P//wP//AP/+AH/4A"], ["M", 1.0635, "/wA//4A//4B/f4B/P8B/P8B/P8D/P+D/P+D/P+D/P+H/P/H/P/H/P/P/P/P/Pfv/Pfv/Pf//Pf+/PP+/PP+/PP+/PP8/PH8/PH8/PH8/PD4/PD4/PD4fOB4fOBwPMAAH"], ["A", 0.8571, "AH4AAP8AAP8AAP8AAP8AAf8AAf+AAf+AA//AA//AA//AB8/gB8/gB8/gD4/wD4/wD4fwDwfwH4fwH//4H//4P//4P//8P//8PgH8fAH+fAD+fAD++AD/+AB/8AA/8AAP"], ["B", 0.8226, "//+A///g///wf//4P//8P4f+P4H+P4H+P4H+P4H+P4H8P4P8P8/4P//wP//wP//4P//8P//+P4H/P4D/P4D/P4D/P4B/P4D/P4D/P4D/P4P/P//+P//+P//8P//wP//A"], ["C", 0.8478, "AH8GAPg+A/AeB+AOD8AHH4ADH4ADP4ABP4ABfwAAfwAAfwAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/4AAf4AAf4ABf8ABP8ADH+ACH/AED/wYB//wAf/gAP/A"], ["F", 0.7667, "f//+///+f///P///H///H8AHH8AAH8AAH8AAH8AAH8AAH8AAH//4H//8H//8H//8H//8H//4H8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAP+AAP+AA//4A//4A"], ["F", 0.7333, "f//+///+f///P///H///H8AHH8AAH8AAH8AAH8AAH8AAH8AAH//4H//8H//8H//8H//8H//4H8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAP+AAP+AA//4A//4A"], ["G", 0.8696, "AH4MAOAcA8A8B4AcH4AOHwAOPwAGPwAGfgACfgAA/gAB/gAA/gAA/gAA/gAA/gAA/gAA/gAA/gB//gB//gB//gB//gB//wB/fwB/fwB/P4B/H4B/H8B/D+B/A/AfAf4H"], ["J", 0.5333, "A///AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AH/4AD/4AD/4AD/8AB/+AA/+AA//Pwf/f4P//4P//4H/f4H+f4H8P4P4H8fw"], ["L", 0.7727, "P8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8ADP8ADP8AHP8AGP8AOP8AOP8AeP8A8P8B8///8"], ["N", 0.9111, "f4A/f4AeP8AMP8AIH+AIH+AID/AID/AIB/AIB/gIA/gIA/wIAf4IAf4IAP4IAP8IAH8IAH8IAH+IAD+IAB/IAB/IAB/oAA/oAA/4AAf4AAf4AAP4EAP8MAH8OAH+/AD+"], ["P", 0.8444, "//4AP4eAP4PgP4HwP4H8P4D8P4D+P4D+P4B/P4B/P4B/P4B/P4B/P4B/P4B/P4B/P4D/P4D+P4D+P4H8P4PwP+/gP48AP4AAP4AAP4AAP4AAP4AAP4AAP4AAP4AA/8AA"], ["Q", 0.8214, "AB8AAw/ABgPgDgPwHgH4PAH8PAH8fAD+fAD+/AD+/AB//AB//gB//gB//gB//gB//gA//wA+fwA+fwA8PwB8P4B8H4B4D8BwB+LgA/PAAAEAAAGAAAD/AAD+AAB+AAAc"], ["R", 0.9111, "f/4APw8APwfgPwPwPwH4PwH8PwH8PwD8PwD+PwD+PwD+PwD+PwD+PwD+PwD+PwD8PwD8PwH4PwPwP4/gPx/APw/gPwgPwfwPwfwPwP4PwP4PwH8PwH8PwH+P4D+/4H/"], ["S", 0.7021, "AfkcB8H8HwB8PwA+fwAe/wAO/wAH/wAD/wAD/wAB/8AA/+AA//wAf/8AP//gP//wH//4B//8Af/+AD//AA//AAP/wAD/YAD/YAD/cAB/eAB/PAB+PgD8PAD4OAPAMAOA"], ["U", 0.8444, "/+A/P4A8P4AYP4AAf4AAf4AAf4AAf4AAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAA/wAA/wAE/wAE/wAE/wAE/wAE/wAE/wAEfwAAfwAAf4AAP4AQH8AgD+BAA/+A"], ["Y", 0.7955, "/4AP/4AOf4AEf8AAP8AIP8AIP+AIH+AAH/AAD/AAD/AAD/ggB/ggB/wAB/wAA/wAA/6AAf4AAf8AAf8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AA/+A"], ["Z", 0.7609, "P4D/PAD/OAH/cAH+cAP8YAf8YAf4wA/4AA/wAB/wAB/gAD/gAH/AAH/AAP+AAP+AAf8AAf8AA/4AA/4AB/wAB/gAD/gBD/ADH/ADH+AHP+AHP8APf4Af/4A+///+///+"], ["O", 0.9219, "AP8AA//AB//gD//wH//4P8P8P4H8fwD+fwD+fgB+/gB+/gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB+fgB+fwD+fwD8P4H8H8P4H//4D//wB//gA//AAP8A"], ["X", 0.9206, "/wP+/4P+f4H8P8H4H8HwH+PwD+PgD/PgD/fAB//AB/+AA/+AA/8AAf8AAf4AAP4AAP8AAP8AAf+AAf+AA//AB//AB9/gD5/gD4/wHw/wHwf4Pgf4PAP8fAP+eAH/+AD/"], ["D", 0.8906, "//8A///Af//gP//wP//4P4f8P4H8P4D+P4D+P4B+P4B/P4B/P4B/P4A/P4A/P4A/P4A/P4A/P4B/P4B/P4B/P4B/P4D+P4H+P4P+P4f8P//8P//4P//wP//gP//AH/4A"], ["B", 0.8387, "///A///gf//4P//4P//8P4P8P4H8P4H8P4H8P4H8P4H8P4P8P4f4P//wP//wP//4P//4P//8P4H+P4D/P4B/P4B/P4B/P4B/P4D/P4D/P4P/P//+P//8P//4P//wH//A"], ["I", 0.4219, "f//+f///f///D//4D//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wB//wD//4P//+f///f///"], ["A", 1.0175, "AH4AAH4AAH4AAP8AAP8AAP8AAN8AAd+AAd+AAd+AAZ+AA4/AA4/AA4/ABw/ABw/gBwfgBwfgDw/gD//wD//wD//wHgPwHAPwHAP4HAH4PAH4PAH8fAH8/wf//w///w//"], ["A", 1.1034, "ADwAADwAAHwAAH4AAH4AAH4AAP8AAP8AAP8AAf8AAZ+AAZ+AAZ+AA4/AAw/AAw/ABw/ABg/gBgfgBgfgD//wD//wD//wHAPwHAH4GAH4GAH4OAH4MAD8/gP//gP//gP/"], ["B", 0.8772, "//+A///g///4H8f8H8P8H8H+H8H+H8H+H8H+H8H+H8H8H8H8H8P4H//wH//gH//AH//4H8P8H8H+H8D+H8D/H8D/H8D/H8D/H8D/H8D/H8D/H8H+H8P+///8///w///A"], ["B", 1.0172, "///A///w///4H4P8H4D8H4D8H4D+H4D+H4D+H4D8H4D8H4D8H4P4H//wH//AH//wH4P8H4H8H4D+H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4D/H4D+H4P+///8///w///A"], ["C", 0.7797, "AH/gAP/8A//+B/D/D+B/H8B/P4A/P4A+f4A8f4AAf4AA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAAf4AAf4AAf4AAP4ABP8ADH+AHD/AfB//+A//8AP/4AH/g"], ["C", 0.9333, "AH/AAf/4A//+B/A/D8AfH8APP4APPwAHfwAHfwAHfwAC/wAA/gAA/gAA/gAA/gAA/gAA/gAA/gAA/gAA/wAAfwAAfwAHfwAHPwAPP4APH8AeD8AcB/B8A//4Af/wAH/A"], ["D", 0.9474, "//8A///A///gP8fwH4P4H4H8H4H8H4D+H4D+H4D+H4D/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4D/H4D/H4D+H4D+H4D+H4H8H4H8H4P4H4P4P8/w///g//+A//4A"], ["D", 1.069, "//8A///A///gH4PwH4H4H4D8H4D8H4B+H4B+H4B+H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B/H4B+H4B+H4B+H4D8H4D8H4H4H4Pw///g///A//8A"], ["E", 0.8246, "///8///8///8H+A8H+AcH+AcH+AcH+AcH+AAH+AAH+AAH+AAH+AAH//gH//wH//wH//wH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+APH+APH+APH+APH+Af////////////"], ["E", 0.9138, "////////////H8AHH8AHH8AHH8AHH8AAH8AAH8BgH8BwH8BwH8BwH//wH//wH//wH8BwH8BwH8BwH8BgH8AAH8AAH8AAH8AAH8AAH8ADH8ADH8ADH8AD////////////"], ["F", 0.7719, "////////////H/AfH+APH+APH+AHH+AHH+AAH+AAH+AAH+AAH+AAH+AAH/AAH//4H//4H//4H/AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH/AAH/AAH/AA//8A//8A//8A"], ["F", 0.8966, "////////////H8AHH8AHH8AHH8AHH8AAH8AAH8BgH8BgH8BgH8BgH//gH//gH//gH8BgH8BgH8BgH8BgH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AA//4A//4A//4A"], ["G", 0.8983, "AH/AAf/wB//4D+H8H8D+H4B+P4B8PwB8fwB4fwAA/wAA/gAA/gAA/gAA/gAA/gAA/gAA/gf//gf//gf//gH+/wH8fwH8fwH8PwH8P4H8P4H8H8H8D+H8B//8Af/wAH/A"], ["G", 0.9833, "AH/AAf/4A//+D+B+H8AeH4AePwAOPwAOfwAGfgAGfgAG/gAA/gAA/gAA/gAA/gAA/gAA/gD//gH//gD//gA/fgA/fgA/fwA/PwA/PwA/H4A/H4A/D+B/A//+Af/4AH/A"], ["H", 1.0351, "/+f//+f//+f/P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P//8P//8P//8P//8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8/+f//+f//+f/"], ["H", 1.1724, "/+f//+f//8P/PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8P//8P//8P//8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8PwD8/8P//+f//+f/"], ["I", 0.4912, "////////////B//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//g////////////"], ["I", 0.5172, "////////////A//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//A////////////"], ["J", 0.4342, "H///H///Af/wAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAP/gAf/AA//AB/+A//8A//gA/4AA"], ["J", 0.5467, "A///A///AD/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/gAB/g4D/g8D/A+H/A//8AP/wA"], ["K", 1.0, "/+f+/+f+/+P+P4H4P4HwP4HgP4HAP4OAP4OAP4cAP4cAP44AP5wAP5wAP74AP/4AP/8AP/8AP/+AP7+AP5/AP5/AP4/gP4/gP4/wP4fwP4f4P4P4P4P8/+H//+D//+B/"], ["K", 1.1724, "/+P8/+P8/8H8PwDgPwHAPwOAPwOAPwcAPw4APxwAPxwAPzgAP3AAP/AAP/gAP/wAP/wAP/4AP38APz8APz+APx+APx/APw/APwfgPwfwPwPwPwP4PwH8/8H//+D//+B/"], ["L", 0.8246, "//wA//wA//wAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AHH+AHH+AHH+AHH+APH+APH/Af////////////"], ["L", 0.8793, "//wA//wA//wAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AHH8AHH8AHH8AHH8AH////////////"], ["M", 1.2105, "/4H//4H//4H/P4H8P4P8P8P8P8P8P8P8P8P8P8P8P8f8O+b8O+b8O+b8O+b8O+b8Of78Ofz8Ofz8Ofz8Ofz8OPz8OPj8OPj8OPj8OPj8OPj8OHj8OHD8/nH//nH//nH/"], ["M", 1.4138, "/gB//wB//wD/PwD8PwD8P4D8P4H8P4H8N4H8N4F8N8N8N8N8M8N8M8J8M+Z8M+Z8MeZ8MeR8Mfx8Mfx8MPx8MPh8MPh8MPh8MHh8MHB8MHB8MAB8MAB8/AH//AH//AH/"], ["N", 1.0175, "/wD//4D//4D/P8A8P8A4P+AYP+AYP/AYP/AYP/gYOfgYOfwYOPwYOP4YOH4YOH8YOD8YOD+YOB+YOB/YOA/4OA/4OAf4OAf4OAP4OAP4OAH4OAH4PAD4/wD4/wB4/wB4"], ["N", 1.1379, "/gB//gB//wB/HwAYH4AYH8AYH8AYH+AYH+AYH/AYF/gYE/gYEfwYEfwYEP4YEP4YEH8YEH8YED+YED+YEB/YEA/4EA/4EAf4EAf4EAP4EAP4EAH4EAD4/gD4/gB4/gB4"], ["O", 0.9153, "AP8AA//AB//gD8PwH4H4P4H4PwD8fwD8fwD+fwD+/gD+/gD//gB//gB//gB//gB//gB//gB//gB//gB//gD//gD+fwD+fwD+fwD8PwD8P4H4H4H4D8PwB//gA//AAP8A"], ["O", 1.05, "AP8AA//AB//gD8PwH4D4PwD8PwB8fgB+fgB+fgB+fgA//gA//AA//AA//AA//AA//AA//AA//AA//AA//gA/fgA/fgB+fgB+fgB+PwB8PwD8H4D4D8PwB//gA//AAP8A"], ["P", 0.8421, "//+A///w///4H+P8H+H+H+H+H+D/H+D/H+D/H+D/H+D/H+D/H+D/H+H+H+H+H+P8H+f8H//wH//gH/8AH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AA//4A//4A//4A"], ["P", 0.931, "///g///w///4H8P8H8H+H8D+H8D/H8B/H8B/H8B/H8B/H8D/H8D/H8D+H8H+H8P8H//4H//wH/+AH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AA//wA//wA//wA"], ["Q", 0.7013, "AP8AB//AD//wH4H4PwH8fwD8fwD+fwD+/gD//gB//gB//gB//gB//gB//gB//gD/fgD+fwD+fwD8PwD8P4H4H8PwB//gAf+AAH8AAH8AAH8AAD+AAD+AAB/wAA/4AAP4"], ["Q", 0.863, "AP8AA//AD+PwH4H4PwD8PwB8fgB+fgB+fgB//gA//AA//AA//AA//AA//AA//AA//gA//gA/fgB/fgB+PwB+PwD8H4D4D8PwB//gAP+AAA4AAAfAAAfwAAPwAAHwAADw"], ["R", 0.9649, "//8A///A///wP8/wH8f4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8P4H8fwH//gH/+AH/+AH//AH9/AH8/AH8/gH8fgH8fwH8fwH8P4H8P4H8P8P8H8//H///D///A/"], ["R", 1.0862, "//8A///A///gHwfgHwPwHwPwHwP4HwH4HwH4HwH4HwH4HwPwHwPwHwfgH4/AH/+AH/8AH/+AHx/AHw/AHw/gHwfgHwfgHwPwHwPwHwPwHwH4HwH4HwH4/+D//+D//+B/"], ["S", 0.6949, "AP/AA//wD//4H4f8PwH+PwD+fwD+fwD8fwD4f4AAf+AAf/gAP/4AP/+AH//gD//4B//8Af/+AH/+AA//AAP/HAH/fAD//AB//AB//gB//gB+/wD+f8H8P//4H//AB/8A"], ["S", 0.8, "A//AB//4H//8PwD8fgB8fAA8/AAc/AAc/AAM/gAA/wAA/8AA//wAf//Af//wP//4H//8D//+Af//AB//AAP/AAD/YAB/4AB/8AA/8AA/+AB+/AB+/wH8f//4H//gB//A"], ["T", 0.8947, "////////////8P8P8P8H4P8H4P8H4P8H4P8HAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AB//gB//gB//g"], ["T", 1.0, "////////////wH4HwH4HwH4HwH4HwH4DAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AA//AB//AB//A"], ["U", 0.9655, "//H///H///H/H8B4H8A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H4A4H8A4H8A4D8BwD+BwB/DgA//AAf/AAH8A"], ["U", 1.1017, "/+B//+B//+B/HwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYHwAYH4AYH4AYH4AYH4A4D8AwD8BwD/HwB//gA//AAP8A"], ["V", 0.9474, "//H///H///H/P8A8H8A4H8A4H8BwD8BwD+BwD+BwD+DwB+DgB+DgB/DgB/DgA/HAA/HAA/nAA/mAAfuAAfuAAf+AAf8AAP8AAP8AAP8AAP8AAH4AAH4AAH4AAHwAADwA"], ["V", 1.0862, "/8A//8A//8A/PwAMP4AMH4AYH4AYH4AYH8A4D8AwD8AwD+AwB+BgB+BgB+BgA/DgA/DAA/DAA/jAAfmAAfmAAfmAAP+AAP8AAP8AAP8AAH4AAH4AAH4AAD4AADwAADwA"], ["W", 1.4386, "/ww//w4//w4/fh4ePB4MPB4MPB4MPh8MPh8cPj8YPj8YHj8YHj8YHj8YHj+YHzeYH3e4H2ewD2ewD2ewD+ewD+fwD+PwD8PwD8PwB8PgB8PgB8PgB8HgB4HgB4HgA4Hg"], ["W", 1.5862, "/g4f/g4f/h4fPB4EPB4EPB8EPB8MPB8MPh8MHj8IHj8IHj8IHj+IHieYHieYHyeQD2eQD2eQD2fQD0PwD8PwD8PwD8PwB8PgB8PgB8PgB4HgB4HgB4HgA4HAA4HAA4HA"], ["X", 1.0, "f/j+f/j+f/j+H+B8D+B4D+BwB+BwB/DgB/DgA/nAA/nAAf+AAf8AAP8AAP8AAH8AAH8AAP+AAP+AAf/AAd/AA4/gA4/gBwfwDgfwDgP4HAP4PAP8PAP8/w///w///w//"], ["X", 1.069, "/+H+/+H+/+H+H4BwH8BgD8DgD+DAB+HAB/GAB/OAA/sAAf8AAf4AAf4AAP4AAP4AAH8AAH8AAH+AAP+AAd/AAd/AAY/gA4/gAwfwBwfwBgP4DgP4DAH4/wf//4f//4f/"], ["Y", 0.9825, "//H///H///H/P+B8H8A8H8A4H8A4D8BwD+BwD+BwB/DgB/DgA/DgA/nAA/nAAfmAAf+AAf+AAP8AAP8AAP8AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAP8AA//gA//gA//g"], ["Y", 1.0172, "/+B//+B//+B/P4AcH8AYH8A4D+AwD+BwB+BgB/DgB/DgA/jAA/nAAf2AAf+AAP8AAP8AAH8AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AA//gA//gA//g"], ["Z", 0.8421, "f//+f//+f//+fAf8eAf8eAf4eA/4eA/weB/wcB/gAD/gAD/AAH/AAH+AAP+AAP8AAf4AAf4AA/wAA/wAB/gAD/gAD/AHH/APH+APP+APP8APf8Aff8A/////////////"], ["Z", 0.9138, "////////////4AH+4AH+4AP84Af8YAf4AA/wAA/wAB/gAD/gAD/AAH+AAH+AAP8AAf8AAf4AA/4AA/wAB/gAD/gAD/AAH+AAH+AAP8AHP8AHf4AH/4AH////////////"], ["Q", 0.7564, "AH8AA//AD//wH//wH+P4P4H8P4D8fwD+fwB//gB//gB//gB//gB//gB//gB//gB//gB/fgB/fwB+PwD+P4D8H8H8D+f4B//wA//gAH/AAA/gAAfwAAfwAAP4AAH+AAB+"], ["O", 0.9219, "Af+AA//AD//wD//wH+f4P4H8P4H8fwD+fgD+fgB+/gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB+fgB+fwD+PwH8P4H8H8P4H//4D//wB//AAf+AAH4A"], ["E", 0.7302, "f//+///+f//+P///H///H8AHH8ACH8AAH8AAH8AAH8AAH8AAH8AAH//8H//8H//8H//8H//4H8AAH8AAH8AAH8AAH8AAH8AAH8ACH8AHH///H///H///H///H//+H//+"], ["Z", 0.7937, "P//+f//+f//+f//+f//8cA/8QA/4AA/4AB/wAB/wAD/gAD/gAH/AAH/AAP+AAf+AAf8AA/8AA/4AB/4AB/wAD/gAD/gAH/AAH/AAP/ADP///f///f//////////+///+"], ["I", 0.4219, "f//+////P//8D//wD//wD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//gD//wD//wP//8////f//+"]];
const templates = RAW.map(([char, ratio, s]) => {
  const v = atob(s), rows = new Uint32Array(TH); let count = 0;
  for (let y = 0; y < TH; y++) {
    rows[y] = (v.charCodeAt(y * 3) << 16) | (v.charCodeAt(y * 3 + 1) << 8) | v.charCodeAt(y * 3 + 2);
    count += pop(rows[y]);
  }
  return { char, ratio, rows, count };
});

// v1.24: area-averaged glyph grid (no aliasing), relative narrow-glyph threshold, splitting of
// touching letters, runner-up letters for tap-to-swap, and a floor so non-Caesar images are rejected.
// Each template as the list of its ink cells, indexed into a glyph grid padded by one empty cell on
// every side (PW wide): a ±1 shift is then a fixed index offset, and cells pushed off the edge land
// on zeros. Same sum, in the same cell order, as testing every template cell with bounds checks.
const PW = TW + 2, PH = TH + 2;
const TINK = templates.map(t => {
  const idx = [];
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if ((t.rows[y] >>> (23 - x)) & 1) idx.push((y + 1) * PW + x + 1);
  return Int32Array.from(idx);
});
const SHIFTS = [];
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) SHIFTS.push(dy * PW + dx);
const RMAX = Math.max(...templates.map(t => t.ratio));
function grid(data, w, x0, y0, gw, gh) {
  const g = new Float32Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) {
    const ya = Math.floor(ty * gh / TH), yb = Math.max(ya + 1, Math.ceil((ty + 1) * gh / TH));
    for (let tx = 0; tx < TW; tx++) {
      const xa = Math.floor(tx * gw / TW), xb = Math.max(xa + 1, Math.ceil((tx + 1) * gw / TW));
      let s = 0, n = 0;
      for (let y = ya; y < yb && y < gh; y++) { const ro = (y0 + y) * w + x0; for (let x = xa; x < xb && x < gw; x++) { s += data[ro + x]; n++; } }
      g[ty * TW + tx] = n ? s / n : 0;
    }
  }
  return g;
}
function recognize(s) {
  if (!s || !s.data || !s.width || !s.height) return null;
  const b = s.bounds; if (!b || b.h < 15 || b.w < 20) return null;
  const data = s.data, w = s.width;
  const xProj = new Int32Array(w);
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (data[y * w + x]) xProj[x]++;
  const minW = Math.max(2, Math.round(b.h * 0.1));
  let spans = [], inSpan = false, startX = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    if (xProj[x] > 0 && !inSpan) { inSpan = true; startX = x; }
    else if (xProj[x] === 0 && inSpan) { inSpan = false; if (x - startX >= minW) spans.push({ x1: startX, x2: x }); }
  }
  if (inSpan && (b.x + b.w - startX >= minW)) spans.push({ x1: startX, x2: b.x + b.w });
  if (spans.length < 1) return null;
  // vertical extent per span
  const vext = sp => { let y0 = b.y + b.h, y1 = b.y; for (let y = b.y; y < b.y + b.h; y++) for (let x = sp.x1; x < sp.x2; x++) if (data[y * w + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; } sp.y0 = y0; sp.sh = y1 - y0 + 1; };
  spans.forEach(vext);
  // split spans that are too wide to be one letter (touching / kerned serifs)
  const clean = spans.filter(sp => sp.sh > 0 && (sp.x2 - sp.x1) / sp.sh <= RMAX * 1.05).map(sp => sp.x2 - sp.x1).sort((p, q) => p - q);
  const capH = spans.map(sp => sp.sh).sort((p, q) => p - q)[spans.length >> 1];
  const typW = clean.length ? clean[clean.length >> 1] : Math.max(minW, capH * 0.7);
  const out = [];
  for (const sp of spans) {
    const sw = sp.x2 - sp.x1;
    if (sw / Math.max(1, sp.sh) <= RMAX * 1.18) { out.push(sp); continue; }
    const k = Math.max(2, Math.round(sw / typW));
    let prev = sp.x1;
    for (let i = 1; i < k; i++) {
      const ideal = sp.x1 + sw * i / k, lo = Math.max(prev + minW, Math.floor(ideal - sw / k * 0.3)), hi = Math.min(sp.x2 - minW, Math.ceil(ideal + sw / k * 0.3));
      let cut = Math.round(ideal), best = 1e9;
      for (let x = lo; x <= hi; x++) if (xProj[x] < best) { best = xProj[x]; cut = x; }
      out.push({ x1: prev, x2: cut }); prev = cut;
    }
    out.push({ x1: prev, x2: sp.x2 });
  }
  spans = out; spans.forEach(vext);
  if (spans.length < 1 || spans.length > 25) return null;

  const boxes = []; let text = '', confSum = 0, weakN = 0;
  for (const sp of spans) {
    const sw = sp.x2 - sp.x1, sh = sp.sh; if (sh < 10 || sw < 2) continue;
    const ratio = sw / sh, g = grid(data, w, sp.x1, sp.y0, sw, sh);
    let gSum = 0; for (let i = 0; i < g.length; i++) gSum += g[i];
    let brInk = 0;
    for (let y = 26; y < 32; y++) {
      for (let x = 12; x < 23; x++) {
        brInk += g[y * TW + x];
      }
    }
    brInk /= (6 * 11);
    const gp = new Float64Array(PW * PH);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) gp[(y + 1) * PW + x + 1] = g[y * TW + x];
    const per = new Map();
    templates.forEach((t, ti) => {
      const ink = TINK[ti], n = ink.length; let maxInter = 0;
      for (let k = 0; k < 9; k++) {
        const off = SHIFTS[k];
        let inter = 0;
        for (let j = 0; j < n; j++) inter += gp[ink[j] + off];
        if (inter > maxInter) maxInter = inter;
      }
      let sc = (2 * maxInter) / (gSum + t.count) - 0.22 * Math.abs(ratio - t.ratio);
      if (t.char === 'E' && brInk < 0.25) sc -= 0.30;
      if (t.char === 'F' && brInk > 0.35) sc -= 0.30;
      if (!per.has(t.char) || sc > per.get(t.char)) per.set(t.char, sc);
    });
    const rank = [...per.entries()].sort((p, q) => q[1] - p[1]);
    const [ch, sc] = rank[0], margin = rank.length > 1 ? sc - rank[1][1] : 1;
    if (sc < 0.45) return null;                    // not a Caesar letter row
    const weak = sc < 0.6 || margin < 0.04; if (weak) weakN++;
    text += ch; confSum += sc;
    const alts = rank.slice(1, 4).filter(r => r[1] >= sc - 0.12).map(r => r[0]);
    if (ch === 'E' && !alts.includes('F')) alts.push('F');
    else if (ch === 'F' && !alts.includes('E')) alts.push('E');
    boxes.push({ x: sp.x1, y: sp.y0, w: sw, h: sh, label: ch, confidence: Math.max(0, sc), weak, alts });
  }
  if (!text) return null;
  return { type: 'caesar', text, confidence: Math.max(0, confSum / boxes.length - 0.06 * weakN), boxes,
           diagnostics: ['Caesar cipher letters detected' + (weakN ? ' (' + weakN + ' uncertain)' : '')] };
}
global.CaesarVision = { recognize, version: '1.2.0' };
})(typeof window !== 'undefined' ? window : globalThis);

/* ColorVision: Heist Explorer Grid & Graph Word + Color Recognizer for Color Text Module */
(function(global){
'use strict';

const CN_GRID = 24;

function cnGrid(maskFn, x0, x1, y0, y1){
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const g = new Float32Array(CN_GRID * CN_GRID);
  for (let gy = 0; gy < CN_GRID; gy++){
    const sy0 = y0 + Math.floor(gy * bh / CN_GRID);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor((gy + 1) * bh / CN_GRID));
    for (let gx = 0; gx < CN_GRID; gx++){
      const sx0 = x0 + Math.floor(gx * bw / CN_GRID);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor((gx + 1) * bw / CN_GRID));
      let dark = 0, total = 0;
      for (let yy = sy0; yy < sy1 && yy <= y1; yy++){
        for (let xx = sx0; xx < sx1 && xx <= x1; xx++){
          total++; if (maskFn(xx, yy)) dark++;
        }
      }
      g[gy * CN_GRID + gx] = total ? dark / total : 0;
    }
  }
  return g;
}

function shMedian(arr){
  if (!arr.length) return Infinity;
  const q = arr.slice().sort((a, b) => a - b);
  return q[Math.floor(q.length / 2)];
}

function shLabelComps(mask, w, h){
  const seen = new Uint8Array(w * h), out = [];
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const s0 = y * w + x;
      if (!mask[s0] || seen[s0]) continue;
      seen[s0] = 1;
      const st = [s0];
      let x0 = x, x1 = x, y0 = y, y1 = y;
      while (st.length){
        const cur = st.pop();
        const cy = (cur / w) | 0, cx = cur - cy * w;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (let dy = -1; dy <= 1; dy++){
          for (let dx = -1; dx <= 1; dx++){
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (mask[ni] && !seen[ni]){ seen[ni] = 1; st.push(ni); }
          }
        }
      }
      out.push({ x0, x1, y0, y1 });
    }
  }
  return out;
}

function shCountHoles(c, mask, w){

  const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, W = bw + 2, H = bh + 2;
  const bg = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++){
    bg[(y + 1) * W + (x + 1)] = mask[(c.y0 + y) * w + (c.x0 + x)] ? 0 : 1;
  }
  const seen = new Uint8Array(W * H);
  let holes = 0;
  for (let sy = 0; sy < H; sy++){
    for (let sx = 0; sx < W; sx++){
      const si = sy * W + sx;
      if (!bg[si] || seen[si]) continue;
      const outside = (sx === 0 && sy === 0);
      seen[si] = 1;
      const st = [si]; let size = 0;
      while (st.length){
        const cur = st.pop(); size++;
        const cy = (cur / W) | 0, cx = cur - cy * W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (bg[ni] && !seen[ni]){ seen[ni] = 1; st.push(ni); }
        }
      }
      
  if (!outside && size >= 3) holes++;

    }
  }
  
  return holes;

}

const CO_COLORS = { black:[17,17,17], red:[220,38,38], orange:[217,119,6], green:[22,163,74], blue:[37,99,235], purple:[147,51,234] };
const CO_NAMES = Object.keys(CO_COLORS);

function coClassify(r, g, b){
  let best = null, bd = Infinity;
  for (const n of CO_NAMES){
    const c = CO_COLORS[n];
    const d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
    if (d < bd){ bd = d; best = n; }
  }
  return best;
}

const CO_ALPHA = 'abcdefghijklmnopqrstuvwxyz';

const CO_VOCAB = ["alarm", "amphitheater", "artifact", "badge", "bag", "blueprint", "bronze", "candle", "canvas", "card", "cash", "chain", "chamber", "chandelier", "chisel", "code", "coin", "collection", "copper", "corridor", "crown", "crystal", "curator", "door", "drill", "emerald", "exhibition", "floor", "gallery", "gem", "glass", "gold", "goldsmith", "guard", "guardrail", "hall", "hourglass", "jade", "jewel", "key", "lamp", "landscape", "lantern", "laser", "lock", "manuscript", "marble", "mask", "masterpiece", "mirror", "monument", "mosaic", "night", "parchment", "pearl", "pedestal", "porcelain", "pottery", "relic", "ring", "rope", "ruby", "safe", "sapphire", "sarcophagus", "sculpture", "silk", "silver", "skeleton", "spotlight", "staircase", "statue", "stone", "tapestry", "telescope", "throne", "torch", "tower", "treasure", "vase", "vault", "wall", "watchtower", "wire"];
  const CO_SAMPLES = {"a": [0.945, 1, "000000589999999400000000000000589999999400000000000069999999999999000000000899999999999999950001006999999999999999994000008999999800899999999100009999994000359999999400009999990000049999999400009999950000049999999400003333320056679999999400000000666679999999999400000066899999999999999400000699999999999999999400000999999999999999999400009999999990049999999400669999999600049999999400889999994000049999999500889999994000049999999500999999994000589999999500889999997666799999999810449999999999999999999940118999999999999799999964001499999999963469999996000033345743320033449995"], "c": [0.945, 0, "000000002222595222220000000000002222595222220000000002259999999999952000000029999999999999999500000299999999999999999950002999999997777799999990005999999970000479999995009999999900000049999995229999999700000005999999559999999700000002999999999999999400000000999995999999995000000000000000999999995000000000000000999999995000000000000000999999999400000000000000999999999700000000000000999999999900000000000000559999999970000000004950009999999999740000479995002999999999777777779995002599999999999999999952000259999999999999999520000022999999999999952000000000222599995422220000"], "d": [0.651, 1, "000000000000000033333893000000000000003899999999000000000000159999999999000000000000007899999999000000000000000699999999000000000000000599999999000000000000000299999999000000002222222299999999000016799999998899999999000399999999999999999999002999999999888999999999118999999982003699999999339999999800000299999999669999999600000299999999889999999600000299999999999999999400000299999999999999999400000299999999889999999600000299999999339999999600000299999999339999999730000299999999006999999985444499999999002699999999999999999999000299999999999999999999000013558899999999999984"], "e": [0.955, 1, "000000222247942222000000000000222247942222000000000002999999999999222000000079999999999999994200000499999997779999999420002999999977577799999940007999999920000799999952229999999900000599999994559999999700000499999995779999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999994999999999700000000000000559999999900000000000000009999999990000000047950005999999999720479999994000999999999777779999992000299999999999999999920000029999999999999999200000002799999999999722000000000002227994222000000"], "f": [0.593, 0, "000000000346999999998664000000159999999999999999000003999999998300138999000039999999980000001999000099999999940000000333000099999999940000000000000099999999940000000000222299999999962222220000999999999999999999990000666699999999986666660000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000000099999999940000000000777799999999987777700000999999999999999999900000"],
"j": [0.364, 0, "000000000000147899977300000000000003999999999971000000000008999999999994000000000002899999999960000000000000024455554100000000000000000000000000000000049999999999999999000000024444699999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999000000000000499999999999222200000000599999999997999940000001999999999993999996444458999999999610557779999999987765420000"],
"q": [0.854, 1, "000003699997201333333333000289999999964999999999004999999854898999999644049999996000049999999300189999991000008999999300499999960000004999999300799999960000003999999300999999930000003999999300999999930000003999999300999999930000003999999300999999930000003999999300899999950000003999999300499999960000004999999300199999990000007999999300049999995000039999999300004999999854898999999300000289999999964999999300000003699997203999999300000000000000003999999300000000000000003999999300000000000000003999999300000000000000003999999300000000000002778999999877000000000002999999999999"],
"z": [0.968, 0, "099999999999999999999999099999999999999999999999099999999999999999999999099600000000019999999996099600000000089999999992099600000000499999999920099600000004999999999300000000000009999999997000000000000189999999970000000000000499999999920000000000003999999999300000000000039999999994000000000000089999999970000000000000899999999800000000000004999999999200000000000029999999994000000000000299999999980000000000000699999999910000000466006999999998200000000699049999999994000000000699289999999960000000000699999999999944444444444899999999999999999999999999999999999999999999999999"],"g": [0.65, 2, "000000000000000000006900000000000000000000009930000000024444444440499920000008999999999999999900000499999999999999999500003999999911999999999000008999999000009999999300009999999000009999999700009999999000009999999400002999999843449999999000000199999998999999991000000499999999999998500000006999999998662220000000008999998888884000000000009999999999999999954000007999999999999999999800000799999999999999999992006899999999999999999999008999910000111179999999559999900000000009999999889999900000000039999996119999988888888889999951002999999999999999999200000145556889999755521000"], "h": [0.688, 0, "000000009900000000000000000999999900000000000000999999999990000000000000009999999990000000000000000999999990000000000000000999999990000000000000000999999990000000000000000999999990000000000000000999999999999999994000000999999999999999999900000999999999999999999990000999999994444499999990000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999999000999999990000099999990000499999400000049999440"], "i": [0.318, 0, "000000000022444880002200000000006688999889996622000004444499999999997755000005558899999999998877000006666688999999996666000000004499999998882200000000000011111110000000000000000000111111111111111444444455999999999988999999999999999999999999333999999999999999999999000228889999999999999999000006669999999999999999000003339999999999999999000003339999999999999999000003339999999999999999000003339999999999999999000003339999999999999999000003339999999999999999000003339999999999999999000003339999999999999999333003339999999999999999333003339999999999999966000002227799888666664411"], "k": [0.759, 0, "002777779200000000000000777999999400000000000000999999999400000000000000028999999400000000000000007999999400000000000000004999999400000000000000004999999400000000000000004999999400244444444200004999999404899999999930004999999400799999999700004999999400099999970000004999999400799999400000004999999409999992000000004999999689999810000000004999999999999700000000004999999999999840000000004999999999999990000000004999999999999996100000004999999924999999700000004999999201999999840000004999999100289999993000004999997000029999997700004999970000022999999772003766100000001166669996"], "l": [0.45, 0, "000000014669999900000000449999999999999922000000669999999999999922000001003399999999999922000000000099999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000001000069999999999922000001000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000069999999999922000000000047999999999944000000110047999999999988444444110014999999999999999997110000499999999999999991000000024555789955553110"], "m": [1.508, 0, "000446404776440046974400000446404776440046974400046999979999993799999941799999999999999999999992479999999999999999999997049999996479999994499999008999970049999940499999008999940009999900099999007999940009999900099999008999940009999900099999008999940009999900099999008999940009999900099999008999940009999900099999008999940009999900099999008999920009999900099999008999920009999900099999008999920009999900099999008999920009999900099999008999920009999900099999008999920009999900099999008999920009999900099999008999920009999900099998008999900009999400099996004998200007996000049221"], "n": [1.012, 0, "000002224702224997222000000002224702224997222000002499999999999999997200779999999999999999999920779999999999999999999970007999999997777799999994002999999992000279999997000499999970000049999997000499999970000029999997000499999970000029999997000499999970000029999997000499999970000029999997000499999970000029999997000499999970000029999997000499999970000029999999000499999970000029999999000499999970000029999999000499999970000029999999000499999970000029999999000499999970000029999999000499999970000029999997000499999940000029999994000499999920000029999970000077777000000004997000"], "o": [1.021, 1, "000000008999999970000000000000008999999970000000000002999999999999910001000079999999999999994000000799999999999999999400005999999994779999999910008999999700000899999980339999999100000199999991779999997000000089999996889999994000000089999997889999992000000069999999999999992000000039999999999999992000000049999999999999992000000049999999889999992000000079999999779999995000000089999997779999998000000089999993229999998100000289999991008999999710001799999970002999999966666999999810000399999999999999999300000039999999999999993000000002699999999999330000000000033379994333100000"], "p": [0.734, 1, "000000799704999999000000009999999999999999990000999999999999999999999000449999999999999999999810002999999970000799999970000999999940000299999990000999999940000089999996000999999940000079999997000999999940000079999999000999999940000079999997000999999940000089999996000999999940000299999992000999999940000799999990000999999997444999999930000999999999999999999400000999999999999999994000000999999999999999900000000999999940223430000000000999999940000000000000000999999920000000000000000999999810000000000000000999999700000000000000000999997000000000000000000497430000000000000000"], "r": [0.886, 0, "000033555883005589555500000033555883005589555500335599999996369999999850889999999999599999999983449999999999999999999993006999999999999999999996000999999999996446999998000899999999983105999999000699999999830003699996000699999999500000466660000699999999100000000000000699999999100000000000000699999999100000000000000699999999100000000000000699999999100000000000000699999999100000000000000699999999100000000000000699999999000000000000000699999999000000000000000699999998000000000000000699999993000000000000000699999980000000000000000699998310000000000000000199831000000000000000"], "s": [0.793, 0, "000000000000000000009940000000000000000000009940000000399999999900039990000088999999999999999990000999999999999999999990006999999999999999999993119999999998004999999993339999999980000011999994339999999993000000199994119999999999880000039990006999999999999900000000003999999999999999900000000499999999999999999900000055999999999999999960000000389999999999999995000000013399999999999999000000000015999999999999116633000000335999999999669988600000000699999999889999966640003699999998008999999986666999999993001699999999999999999940000044999999999999983310000000333356995333330000"], "t": [0.571, 0, "000000004444499000000000000044449999999400000000000049999999999400000000000499999999999400000000000049999999999400000000000049999999999400000000004499999999999944444440999999999999999999999999999999999999999999999990004499999999999944442200000049999999999400000000000049999999999400000000000049999999999400000000000049999999999400000000000049999999999400000000000049999999999400000000000049999999999400000000000049999999999400000000000049999999999400000000000049999999999900000020000009999999999944444444000004999999999999999999000004999999999999999994000002247777999997777422"], "u": [1.048, 0, "000000099940000000004994000000099940000000004994004999999940000099999999999999999940004999999999009999999940000999999999000999999940000099999999000999999940000049999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999940000009999999000499999990000099999999000099999994000999999999000099999999999999999999000099999999999999999999000009999999999940999999440000999999999400099999"], "v": [1.1, 0, "999999999999000099999999999999999999000099999999999999999990000099999999000999999900000009999900000999999900000009999900000099999990000009999000000099999990000099999000000099999990000099999000000009999990000099999000000009999999000099990000000009999999000999990000000000999999000999900000000000999999990999900000000000999999990999900000000000099999999999900000000000099999999999000000000000099999999999000000000000009999999999000000000000009999999990000000000000009999999990000000000000000999999990000000000000000999999990000000000000000999999900000000000000000099999900000000"], "w": [1.623, 0, "499999999000000000499997499999999000000000499997499999999200994000999997047999994002999000499994004999990004999000099940002999990007999900099900000999990009999900499700000999990009999900999700400999994099999940999400400099999099999940999200400099999499999974999000400099999799999999999000400049999999999999994000400049999999999999994000400049999999099999990000400049999994099999990000000009999994009999970000000009999990009999940000000009999990009999940000000004999990007999940000000004999900004999900000000000999900002999900000000000499400002999900000000000079200000499000000"], "b": [0.71, 1, "000009999900000000000000999999999900000000000000999999999900000000000000005999999900000000000000000999999900000000000000000999999900000000000000000999999900000000000000000999999909999999000000000999999999999999990000000999999999999999999000000999999999999999999950000999999900000099999990000999999900000099999999000999999900000009999999000999999900000009999999000999999900000009999999000999999900000009999999000999999900000009999999000999999900000009999999000999999900000099999990000999999955555999999950000999999999999999999900000999999999999999999000000559999999999955500000"], "x": [1.045, 0, "000999999000009999999900000999999000009999999900999999999900009999999990009999999990009999999000000099999999009999990000000099999999999999900000000009999999999999000000000000999999999999000000000000999999999990000000000000099999999900000000000000009999999900000000000000009999999900000000000000099999999990000000000000099999999990000000000000099999999999000000000000999999999999000000000009999999999999900000000009999999999999900000000099999900999999990000000999999000099999999000000999999000099999999900009999990000009999999990009999900000000999999999000990000000000000999990"], "y": [0.774, 0, "099999999900000099999990999999999999000999999999099999999990000999999990005999999900000099999000000999999990000099990000000099999990000999990000000099999995005999950000000009999999009999900000000009999999999999000000000000999999999999000000000000999999999995000000000000099999999990000000000000099999999900000000000000009999999900000000000000009999999000000000000000000999999000000000000000009999990000000000000000059999990000000000000000099999900000000000000000099999900000000000000005999999000000000000000009999990000000000000000999999990000000000000099999955000000000000000"]};
let coTemplates = null;

function getColorTemplates(){
  if (coTemplates) return coTemplates;
  const out = {};
  for (const L in CO_SAMPLES){
    const s0 = CO_SAMPLES[L];
    const grid = new Float32Array(CN_GRID * CN_GRID);
    for (let i = 0; i < grid.length; i++) grid[i] = (s0[2].charCodeAt(i) - 48) / 9;
    out[L] = [{ grid, aspect: s0[0], holes: s0[1] }];
  }
  const missing = CO_ALPHA.split('').filter(L => !out[L]);
  if (missing.length && typeof document !== 'undefined'){
    const fams = ["Alegreya","Lora","Merriweather","'Playfair Display'","'Noto Serif'","'Crimson Text'","Fraunces","Georgia",
                  "'Times New Roman'","'DejaVu Serif'","'Liberation Serif'","serif","Arial","'IBM Plex Sans'","Poppins","Verdana","'DejaVu Sans'","sans-serif"];
    const S = 200;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const tmask = new Uint8Array(S * S);
    for (const L of missing){
      out[L] = [];
      const seen = new Set();
      for (const fam of fams) for (const wt of [700, 400]){
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, S, S);
        cx.fillStyle = '#000'; cx.font = wt + ' 120px ' + fam; cx.textBaseline = 'alphabetic';
        cx.fillText(L, 30, 150);
        const d = cx.getImageData(0, 0, S, S).data;
        let x0 = S, x1 = -1, y0 = S, y1 = -1;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
          const on = d[(y * S + x) * 4] < 165;
          tmask[y * S + x] = on ? 1 : 0;
          if (on){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) continue;
        const g = cnGrid((x, y) => tmask[y * S + x] === 1, x0, x1, y0, y1);
        let key = ''; for (let i = 0; i < g.length; i += 7) key += Math.round(g[i] * 4);
        key += '|' + (x1 - x0) + 'x' + (y1 - y0);
        if (seen.has(key)) continue; seen.add(key);
        out[L].push({ grid: g, aspect: (x1 - x0 + 1) / (y1 - y0 + 1), holes: shCountHoles({ x0, x1, y0, y1 }, tmask, S) });
      }
    }
  }
  coTemplates = out;
  return out;
}

if (typeof document !== 'undefined' && document.fonts && document.fonts.load){
  const fams = ["Alegreya","Lora","Merriweather","'Playfair Display'","'Noto Serif'","'Crimson Text'","Fraunces","Georgia",
                "'Times New Roman'","'DejaVu Serif'","'Liberation Serif'","serif","Arial","'IBM Plex Sans'","Poppins","Verdana","'DejaVu Sans'","sans-serif"];
  try {
    Promise.all(fams.map(f => document.fonts.load("700 120px " + f, CO_ALPHA))).then(() => {
      coTemplates = null;
    }).catch(()=>{});
  } catch(e){}
}

function recognize(canvas, sample) {
  if (!canvas) return null;
  const srcW = canvas.naturalWidth || canvas.width || (canvas.data && (canvas.w || canvas.width));
  const srcH = canvas.naturalHeight || canvas.height || (canvas.data && (canvas.h || canvas.height));
  if (!srcW || !srcH) return null;

  const MAXDIM = 1400;
  const scale = Math.min(1, MAXDIM / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale), h = Math.round(srcH * scale);

  let data;
  if (canvas.getContext && typeof document !== 'undefined') {
    const workCv = document.createElement('canvas');
    workCv.width = w; workCv.height = h;
    const ctx = workCv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } else if (canvas.data) {
    data = canvas.data;
  } else {
    return null;
  }

  const mask = new Uint8Array(w * h);
  let inkCount = 0;
  for (let i = 0; i < w * h; i++){
    if (data[i * 4 + 3] < 40) continue;
    if (Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 170) {
      mask[i] = 1;
      inkCount++;
    }
  }
  if (inkCount < 30) return null;

  let comps = shLabelComps(mask, w, h).filter(c => (c.x1 - c.x0 + 1) >= 2 || (c.y1 - c.y0 + 1) >= 3);
  comps = comps.filter(c => (c.x1 - c.x0 + 1) < 0.95 * w || (c.y1 - c.y0 + 1) < 0.95 * h);
  if (!comps.length) return null;

  const medH = shMedian(comps.map(c => c.y1 - c.y0 + 1));
  const gap = 0.4 * medH;
  const par = comps.map((_, i) => i);
  const find = i => { while (par[i] !== i){ par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++){
    const a = comps[i], b = comps[j];
    if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) par[find(i)] = find(j);
  }
  const groups = {};
  comps.forEach((c, i) => { (groups[find(i)] = groups[find(i)] || []).push(c); });

  const templates = getColorTemplates();
  const HOLE_PENALTY = 60;
  const rawWords = Object.values(groups).map(parts => {
    parts.sort((a, b) => a.x0 - b.x0);
    const letters = [];
    parts.forEach(c => {
      const L = letters.find(l => Math.min(l.x1, c.x1) - Math.max(l.x0, c.x0) + 1 > 0.5 * Math.min(l.x1 - l.x0 + 1, c.x1 - c.x0 + 1));
      if (L){ L.x0 = Math.min(L.x0, c.x0); L.x1 = Math.max(L.x1, c.x1); L.y0 = Math.min(L.y0, c.y0); L.y1 = Math.max(L.y1, c.y1); }
      else letters.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 });
    });
    letters.sort((a, b) => a.x0 - b.x0);
    const box = { x0: Math.min(...letters.map(l => l.x0)), x1: Math.max(...letters.map(l => l.x1)),
                  y0: Math.min(...letters.map(l => l.y0)), y1: Math.max(...letters.map(l => l.y1)) };

    if ((box.x1 - box.x0 + 1) < 8 || (box.y1 - box.y0 + 1) < 8) return null;

    const rs = [], gs = [], bs = [];
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++){
      const i = y * w + x;
      if (!mask[i]) continue;
      if (Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 120){
        rs.push(data[i * 4]); gs.push(data[i * 4 + 1]); bs.push(data[i * 4 + 2]);
      }
    }
    const color = rs.length ? coClassify(shMedian(rs), shMedian(gs), shMedian(bs)) : 'black';

    const errs = letters.map(c => {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      const grid = cnGrid((x, y) => mask[y * w + x] === 1, c.x0, c.x1, c.y0, c.y1);
      const aspect = bw / bh;
      const holes = shCountHoles(c, mask, w);
      const e = {};
      for (const L in templates){
        let m = Infinity;
        for (const t of templates[L]){
          let err = 0;
          for (let i = 0; i < grid.length; i++){ const d = grid[i] - t.grid[i]; err += d * d; }
          const la = Math.log(aspect / t.aspect);
          err += 40 * la * la;
          if (t.holes !== holes) err += HOLE_PENALTY;
          if (err < m) m = err;
        }
        e[L] = m;
      }
      return e;
    });

    
    const top = errs.map(e => Object.keys(e).sort((a, b) => e[a] - e[b])[0]);
    const raw = top.join('');
    const rawTotal = errs.reduce((s0, e, i) => s0 + (e[top[i]] !== undefined ? e[top[i]] : 0), 0);
    const alts = CO_VOCAB.filter(v => v.length === raw.length && v !== raw && errs.every((e, i) => e[v[i]] !== undefined))
      .map(v => ({ v, t: errs.reduce((s0, e, i) => s0 + e[v[i]], 0) }))
      .filter(o => o.t <= rawTotal + 4).sort((a, b) => a.t - b.t).slice(0, 3);
    let cands = [raw].concat(alts.map(o => o.v));
    if (CO_VOCAB.indexOf(raw) === -1 && alts.length && alts[0].t <= rawTotal + 1.2) {
      cands = alts.map(o => o.v).concat([raw]);
    }
    // i / j / l are near-identical stems in this font ("jewel" read as "iewel"): if the read word
    // isn't a known word but swapping only those letters gives one, use the known word
    if (CO_VOCAB.indexOf(cands[0]) === -1) {
      const STEM = 'ijl';
      const twin = CO_VOCAB.find(v => v.length === raw.length && [...v].every((ch, i) => ch === raw[i] || (STEM.includes(ch) && STEM.includes(raw[i]))));
      if (twin) cands = [twin].concat(cands.filter(c => c !== twin));
    }

    const chosenWord = cands[0];
    const isVocab = CO_VOCAB.indexOf(chosenWord) !== -1;
    const avgErr = letters.length ? (rawTotal / letters.length) : 999;
    const score = Math.max(0, Math.min(1, isVocab ? 0.95 : (1 - avgErr / 3.0)));
    const weak = !isVocab || (alts.length > 0 && (alts[0].t - rawTotal) <= 1.2);
    const altWord = (cands.length > 1) ? cands[1] : '';

    const origBox = {
      x: Math.round(box.x0 / scale),
      y: Math.round(box.y0 / scale),
      w: Math.round((box.x1 - box.x0 + 1) / scale),
      h: Math.round((box.y1 - box.y0 + 1) / scale)
    };

    return {
      x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1,
      origBox,
      color,
      cands,
      word: chosenWord,
      score,
      weak,
      alt: altWord
    };
  }).filter(Boolean);

  if (rawWords.length < 2) return null;

  const wh = shMedian(rawWords.map(wd => wd.y1 - wd.y0 + 1));
  rawWords.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  rawWords.forEach(wd => {
    const cy = (wd.y0 + wd.y1) / 2;
    const row = rows.find(r => Math.abs(r.cy - cy) <= 0.6 * wh);
    if (row){ row.list.push(wd); row.cy = (row.cy * (row.list.length - 1) + cy) / row.list.length; }
    else rows.push({ cy, list: [wd] });
  });
  const sortedWords = [];
  rows.sort((a, b) => a.cy - b.cy).forEach(r => r.list.sort((a, b) => a.x0 - b.x0).forEach(wd => sortedWords.push(wd)));

  const tokens = sortedWords.map(it => it.word + ':' + it.color).join(' ');
  const boxes = sortedWords.map(it => ({
    x: it.origBox.x,
    y: it.origBox.y,
    w: it.origBox.w,
    h: it.origBox.h,
    label: it.word + ' (' + it.color + ')',
    weak: it.weak,
    alt: it.alt,
    confidence: it.score,
    cands: it.cands
  }));

  const confSum = sortedWords.reduce((acc, it) => acc + it.score, 0);

  return {
    type: 'colortext',
    text: tokens,
    confidence: Math.max(0, confSum / sortedWords.length),
    minScore: Math.min(...sortedWords.map(it => it.score)),
    boxes,
    diagnostics: ['Color text detected (' + sortedWords.length + ' words)']
  };
}

global.ColorVision = { recognize, version: '5.0.0' };
})(typeof window !== 'undefined' ? window : globalThis);


/* NumericVision: self-contained, offline glyph recognizer.
 * recognize({width,height,data,components?,bounds?}) -> null | result.
 * data is a width*height binary array (1 = foreground ink).
 * Output: {text,confidence,boxes:[{x,y,w,h,label,confidence}],diagnostics}.
 * Recognizes 0..9, slash and minus using shape templates; keeps number spacing.
 * Templates include isolated glyphs from the supplied samples plus font variants.
 */
(function(global){
'use strict';
const TW=24, TH=32, MASK=0xFFFFFF;
const RAW=[["8",0.7407,"Af/AB//wD//8D//8P//8P8P+fwD+fwD+fwD+f8P+f8P+f/P+P//8D//wB//wD//8D//8P//+f+/+/wP//wD//gB//gB//gB//gB//wB/f8P/f//+P//8P//8B//gAP8A"],["7",0.7407,"f///f///f//+f//+///8///8wAPwAAPwAAfgAA/gAA/gAB/AAB/AAD/AAD+AAD+AAD+AAP+AAP8AAP8AAf8AAfwAAfwAAfwAAfwAAfwAA/wAA/gAA/gAA/gAA/AAAQAA"],["3",0.7037,"A/8AB//gH//wH//wH//4f4P+fwH+fwH+fwH+fAH+fAH+AAP+AP/4AP/wAP/wAP/4AP/4AAf+AAH/AAH/fwD//wD//wD//wD/fwH/f4P+f//+H//4D//wD//wB//AADgA"],["6",0.6786,"AAHAAB/AAD/gAP/AAP/AA/8AB/wAD/gAH+AAH8AAf8AAf//Af//A///w///4///+/4P//wH//wD//wD//wD//wD//wD//wD//wD/f4H/f8P+H//4H//4D//wA//gAB4A"],["1",0.4231,"AAH8AB//Af//Af//P///////////Af//Af//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH/8AH/8AH/8AH/wAH+A"],["3",0.7037,"B/4AD//AH//wH//wf//w/4f4/wP4/AH+/AH4/AP4/AP4AAf4A//wA//wA//wA//4A//4AAf+AAP+AAH+/AH//AH//AH//AH+/AP+/wf+f//4f//wH//wH//wD//AAGAA"],["0",0.7778,"AP8AA//AB//gB//gH//4P8P8P4H8fwH+fwD+fwD+fwD+/wD+/wD//wD//wD//wD//wD//wD//wD//wD/fwD+fwD+fwD+fwD+f4H+P4H8P8P4H//4B//gB//gAf+AADgA"],["4",0.8148,"AA/gAB/gAB/gAB/gAD/gAD/gAH/gAP/gAP/gAe/gAe/gB+/gB8/gD4/gH4/gHw/gHw/gPw/gPg/gf///f///////////////f//+AA/gAA/gAA/gAA+AAA+AAA+AAA4A"],["2",0.7037,"AP4AB//gH//wH//wH//4f8P4f4P+/wH+/wH+/wH+/wH+/wH+fAP+AAP4AB/4AD/wAD/wAH/gAP/AB/4AD/gAH+AAH+AAH+AAf8AAf//////////+///+///+///+f//4"],["1",0.4231,"AAB/AAf/AH//AH//D///////////Af//Af//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/8AB/8AB+A"],["9",0.6786,"ABgAB//AD//wH//4H//4f8P+/4H+/wH//wD//wD//wD//wD//wD//wD//4D//8H/f///H///D//+AP/+AP/+AAP4AAP4AAfwAB/wAD/gAP/AA/8AA/8AB/wAA+AAA4AA"],["4",0.8148,"AB+AAB+AAD+AAD+AAH+AAH+AAP+AAP+AAf/gB9/gB9/gB9/gD5/gH5/gHx/gPh/gPh/gPh/gfh/g///+///////////////+f//+AB/gAB+AAB+AAB+AAB+AAB8AAB4A"],["6",0.6786,"AAHAAAfAAD/gAH/AAH/AA/8AB/wAD/gAD+AAH+AAf8AAf//Af//A///w///4///+/4P//wH//wD//wD//wD//wD//wD//wD//4D/f4H/f+P+H//+H//+D//4A//gAB4A"],["7",0.7037,"f//////////////////+///4gAH4AAPwAAfwAAfgAAfgAB/gAB/AAD/AAD/AAH/AAH/AAH8AAH8AAP8AAP4AAP4AAP4AA/4AA/4AA/4AA/wAA/wAA/gAA/gAA/gAA4AA"],["5",0.7037,"B//+D//+D//+D//+D//4D//gD4AAH4AAH4AAH4AAH4AAH5gAH//gH//wH//4fwf+fwf+GAP+AAH/AAH/eAD//AD//AD//AD//AH//wH+f4f+H//4H//wH//wD//AAPwA"],["0",0.7407,"Af+AB//gD//wD//wP//8P8P8f8D+fwD+/wD//wD//wD//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//wD//wD/fwD/fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["2",0.7037,"AP8AB//gD//wD//wH//4f8P+f4H+fwH+/wH+/wH+/wH+/wH+fAH+AAP4AAf4AD/wAD/wAH/gAP/AB/4AD/wAH/gAH/gAH+AAf8AAf//////////+///+///+///+f//4"],["3",0.7037,"A/4AD//gH//wH//wf//4f4f4fwH+/AH+/AH+fAH+fAH+AAP4AP/4A//wA//wA//4A//4AAf+AAP+AAH//AH//AH//AH//AH//wH+/4P+f//4H//4H//wH//wB//AAGAA"],["1",0.4231,"AAH/AB//Af//Af//P///////////Af//Af//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH/8AH/8AH/8AH/wAH+A"],["5",0.7037,"D//+D//+D//4D//4D//4D//gH4AAH4AAH4AAH4AAH4AAH5gAH//gf//wf//4fx/+fx/+GAP+AAH/AAH/eAH//AH//AH//AH//AH//wP+f4f+f//4H//wH//wD//AAPwA"],["2",0.7037,"AP4AB//gH//wH//wH//4f8P4f4P+fwH+/wH+/wH+/wH+/wH+fAP+AAP4AB/4AD/wAD/wAH/gAP8AB/4AD/wAH+AAH+AAH+AAf8AAf//////////+///+///+///+f//4"],["5",0.6667,"D//+D//+H//+H//+H//4H//wH4AAH4AAHwAAHwAAHwAAf4gAf//gf//4f//+fw/+fw/+EAH/AAH/AAD/+AD/+AD/+AD//gD//gD//gH//w/+f//4H//wH//wD//gAf4A"],["/",0.4815,"AAH/AAf/AAf/AAf/AAf8AB/8AB/8AB/8AH/wAH/wAH/wAH/wAH/AAf/AAf/AAf+AAf+AA/+AA/+AA/+AD/4AD/4AD/4AD/4AP/gAP/gAP/gAP+AA/+AA/+AA/+AA/4AA"],["2",0.7037,"AP4AB//gH//wH//wH//4f4P4f4P+/wH+/wH+/wH+/wH+/wH+eAP+AAf4AB/4AD/wAD/wAH/gA/8AB/4AD/gAH+AAH+AAH8AAf8AG///////+///+///+///+///+f//4"],["1",0.3846,"AAB/AA//Af//Af//P///////////Af//Af//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD/8AD/g"],["/",0.5185,"AAP8AAP/AA/8AA/8AA/8AA/8AA/4AD/4AD/4AD/gAD/gAH/gAH/gAH/gAf+AAf+AAf+AAf+AB/4AB/4AB/4AB/wAB/wAH/wAH/wAH/wAP/AAP/AAP/AAP/AA/8AA/8AA"],["2",0.7037,"AH8AB//gD//wD//wH//4H8P+f4H+f4H+fwD/fwD+fwD+fwH+HAH+AAP+AAf4AD/wAD/wAH/gAP/AA/4AB/wAD/gAD/gAH+AAf8ABf///f//////////+///+///+H//+"],["3",0.7037,"A/4AD//AH//wH//wf//4f4f4/wH+/AH+/AH+fAH4fAH4AAP4AP/4A//wA//wA//4A//4AAf+AAP+AAH//AH//AH//AH//AH//wH+/4P+f//4f//4H//wH//wD//AAGAA"],["1",0.3704,"AAADAAB/AA//AA//Af//P///////////Af//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD//AD/8AD/g"],["0",0.7407,"Af+AB//gD//wD//wP//8f8P8fwP+fwD+/wD//gD//gD//gD//gB//gB//gB//gB//gB//gB//gB//gD//gD//gD//gD/fwD+fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["/",0.4815,"AAH/AAH/AAf/AAf/AAf/AAf8AB/8AB/8AB/8AH/wAH/wAH/wAH/wAH/AAf/AAf/AAf/AAf+AA/+AA/+AA/4AD/4AD/4AD/4AD/4AP/gAP/gAP/gA/+AA/+AA/+AA/+AA"],["1",0.4231,"AAB/AAf/AH//AH//D///////////Af//Af//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/8AB/8AB/w"],["/",0.5185,"AAP8AAP/AA/8AA/8AA/8AA/8AA/4AD/4AD/4AD/gAD/gAH/gAH/gAH/gAf+AAf+AAf+AAf+AAf4AB/4AB/4AB/wAB/wAH/wAH/wAH/wAP/AAP/AAP/AAP/AA/8AA/8AA"],["1",0.4231,"AAB/AAf/AH//AH//D///////P///Af//Af//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/w"],["8",0.7778,"Af+AB//gH//4H//4P//8P4H8P4H+f4D+f4H+f8H8f8H8P+P8P//4H//gB//gH//4H//4P//8f9/+f4H+fwD//wD//wD//wB//wD/fwD+f8H+P//8H//4H//4B//gAH4A"],["1",0.4231,"AAH/AAf/AH//AH//P///////////Af//Af//AH//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/8AB/8AB+A"],["2",0.7037,"AP8AB//gD//wD//wH//4f8P+f4H+fwH+/wH+/wH+/wH+/wH+fAH+AAP+AAf4AD/wAD/wAH/gAP/AA/4AD/wAD/gAD/gAH+AAf8AAf//////////////+///+///+f//4"],["2",0.6667,"Af8AD//gH//wH//wf//4f4f+/wH+/wH//gH//gH//gH//gH++AH+AAf+AA/4AB/wAB/wAP/gAf+AB/4AD/gAH/AAH/AAf+AAf4AA///////////////////////+///4"],["2",0.7037,"AP4AB//gH//wH//wH//4f4P4f4P+/wH+/wH+/wH+/wH+/wH+fAP+AAP4AB/4AD/wAD/wAH/gA/8AB/4AD/gAH+AAH+AAH8AAf8AAf//////+///+///+///+///+f//4"],["0",0.7407,"Af+AB//gD//wD//wP//8P8P8fwP+fwD+/wD//gD//gD//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//wD//wD/fwD+fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["1",0.4074,"AAAMAAH8AB//AB//Af//P///////////Af//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH//AH/8AH/8AH/8AH/8AH/wAH+A"],["0",0.7407,"Af+AB//AD//wD//wP//8f8f8fwP+fwD+/wD//gD//gD//gD//gB//gB//gB//gB//gB//gB//gB//gB//gD//gD//gD//wD+fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["0",0.7778,"AP8AA//AB//gB//gH//4P8P8P4H8fwH+fwD+fwD+fwD+/wD//wD//wD//wD//wD//wD//wD//wD//wD/fwD+fwD+fwD+fwD+f4H+P4H8P8P4H//4B//gB//gAf+AADgA"],["1",0.4074,"AAB/AAf/AH//AH//P///////////Af//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/8AB/8AB+AABgA"],["0",0.7778,"AP8AA//AH//gH//gH//4P8P8f4H8fwH+fwD+/wD+/wD+/wD+/wD+/gD//gD//gD//gD//gD//wD+/wD+/wD+fwD+fwD+fwH+fwH8P4H8P8P4H//4B//gB//gAf+AADgA"],["0",0.7407,"Af8AB//AD//wD//wP//8f8P8fwP+fwD+/wD//gD//gD//gB//gB//gB//gB//gB//gB//gB//gB//gB//gD//gD//gD//wD+fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["0",0.7778,"AP8AA//AH//gH//gP//4P8P8f4H8fwH+fwD+/wD+/wD+/wD+/wD+/gD+/gD//gD//gD//wD+/wD+/wD+/wD+fwD+fwD+fwH+fwH8P4H8P8f4H//4B//gB//gA/+AADgA"],["0",0.7778,"AP8AA//AB//gB//gH//4P8P8f4H8fwH+fwD+/wD+/wD+/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD+fwD+fwD+fwD+f4H+P4H8P8P4H//4B//gB//gAf+AADgA"],["1",0.4231,"AAH/AAf/AH//AH//P///////////Af//Af//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/8AB/8AB+A"],["0",0.7778,"AP8AA//AH//gH//gH//4P8P8f4H8fwH+fwD+/wD+/wD+/wD+/wD//gD//gD//gD//gD//gD//wD//wD+/wD+fwD+fwD+fwH+fwH8P4H8P8P4H//4B//gB//gAf+AADgA"],["0",0.7778,"AP8AA//AB//gB//gH//4P8P8f4H8fwH+fwD+fwD+fwD+/wD+/wD//wD//wD//wD//wD//wD//wD//wD+/wD+fwD+fwD+fwD+f4H+P4H8P8P4H//4B//gB//gAf+AADgA"],["0",0.7778,"AP8AA//AB//4B//4H//8P8P8P4H+f4D+fwD+fwD/fwD/fwD/fwD//wB//wB//wB//wB//wB//wB/fwD/fwD/fwD/fwD/f4D+P4D+P4H8H8P8H//4B//gB//gAf/AABwA"],["0",0.7778,"AP8AA//AH//gH//gH//4P8P8f4H8fwH+fwD+/wD+/wD+/wD+/wD+/wD//wD//wD//wD//wD//wD+/wD+/wD+fwD+fwD+fwH+f4H8P4H8P8f4H//4B//gB//gAf+AADgA"],["0",0.7778,"AP8AA//AB//4B//4H//4P8P8P4H+f4D+fwD+fwD/fwD/fwD/fwD//wD//wD//wD//wD//wD//wD/fwD/fwD/fwD+fwD+fwD+P4D+P4H8H+P8H//4B//gB//gAf+AABwA"],["0",0.7778,"AP8AA//AB//4B//4H//4P8P8P4H+f4D+fwD+fwD/fwD/fwD//wD//wD//wD//wD//wD//wD//wD/fwD/fwD/fwD+fwD+f4D+P4H+P4H8H8P8H//4B//gB//gAf+AABwA"],["0",0.7778,"AP8AA//AB//4B//4H//4P8P8P4H+f4D+fwD+fwD/fwD/fwD/fwB/fwB//wB//wB//wB//wB/fwB/fwD/fwD/fwD+fwD+f4D+P4D+P4H8H+P8H//4B//gB//gAf/AABwA"],["0",0.7407,"Af+AA//gD//wD//wP//8P8P+f8D+fwD+/wD//wB//wB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//wD//wD/fwD/fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["1",0.4231,"AAH/AB//Af//Af//P///////////Af//Af//AH//AH//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB//AB/8AB/8AB/wAB+A"],["0",0.7407,"AP+AA//gD//wD//wP//8P+P+f8D+fwD+fwD//wB//wB//wB//gB//gB//gB//gB//gB//gB//gB//wB//wB//wB//wB/fwD/fwD+f8P+P+f8D//8B//wB//wA//AABgA"],["0",0.7778,"AP8AA//AB//gB//gH//4P8P8P4H+f4D+fwD+fwD/fwD//wD//wD//wD//wD//wD//wD//wD//wD//wD/fwD/fwD+fwD+fwD+f4H+P4H8H8P8H//4B//gB//gAf+AABwA"],["0",0.7407,"AP+AA//gD//wD//wP//8P8P+f8D+fwD+/wD//wB//wB//wB//gB//gB//gB//gB//gB//gB//gB//wB//wB//wB//wB/fwD/fwD+f8P+P+f8D//wB//gB//gA//AABgA"],["-",3.0,"////////////////////////////////////////////////////////////////////////////////////////////////////////P///P///P///P///P///P///"],["4",0.8148,"AA/gAB/gAD/gAD/gAD/gAH/gAH/gAP/gAf/gAf/gAf/gB8/gD8/gD4/gHw/gPw/gPw/gPg/gfh/gf///////////////////f//+AA/gAA/gAA/gAA+AAA+AAA8AAA4A"],["3",0.7037,"A/8AD//gH//wH//wf//4f4P+fwH+fwH+/AH+fAH+fAH+AAP4AP/4A//wA//wAP/4AP/4AAf+AAH/AAH//AH//AH//AH//AH//wH/f4P+f//+H//4D//wD//wB//AAHgA"],["3",0.7037,"A/4AD//AH//wH//wf//4f4f4/wP4/AH+/AH+/AP4/AP4AAf4AP/wA//wA//wA//4A//4AAf+AAP+AAH+/AH//AH//AH//AH+/wH+/4f+f//4f//4H//wH//wD//AAGAA"],["5",0.7037,"D//+D//+D//4D//4D//4H//gH4AAH4AAH4AAH4AAH4AAH5gAH//gf//wf//4fx/+fx/+GAP+AAH/AAH/eAH//AH//AH//AH//AH//AP+f4f+f//4H//wH//wD//AAPwA"],["-",3.0,"P///P///P///P///P///P///////////////////////////////////////////////////////////////////////////////////P///P///P///P///P///P///"],["2",0.7037,"AP8AB//gD//wD//wH//4H8P+f4H+f4H/fwH/fwH+fwH+fwH+fAH+AAP+AAf4AD/wAD/wAH/gAP/AA/4AB/wAD/gAD/gAH+AAf8AAf///f///f//////+///+f//+f//4"],["4",0.8148,"AB+AAB/gAD/gAD/gAH/gAH/gAP/gAP/gAf/gB9/gB9/gB9/gD5/gH5/gHx/gPh/gPh/gfh/gfh/g///+////////////////f//+AB/gAB+AAB+AAB+AAB+AAB8AAB4A"],["7",0.7742,"f///f//+f//+f//8///48AH4QAHwAAPwAAfgAA/gAA/AAB/AAB/AAD+AAD+AAH+AAH+AAH8AAP8AAP8AAP4AAP4AAf4AAf4AAf4AAfwAAfwAAfwAA/wAA/gAA/gAA/AA"],["-",3.6,"////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////"],["2",0.7097,"Af8AD//gH//wP//4f8/8f4P8/wP+/wH+/wH+/wH+/gH+/gH+AAP8AAf8AA/4AB/4AB/4AH/wAP+AAf8AD/wAH/gAH/AAP+AAf8AAf8AC///////////+///+///+///+"],["4",0.8438,"AA/gAA/gAB/gAD/gAD/gAH/gAP/gAP/gAf/gAe/gA+/gB8/gB8/gD4/gDw/gDw/gHg/gPg/gPA/gf///f///////////f///AA/gAA/gAA/gAA/AAA/AAA+AAA+AAA4A"],["8",0.7742,"A//AD//wH//4P//8P8P8P4H+fwD+fwD+fwH+f4H+f8P8P/f8P//4H//wD//gD//4D//4P//8f//+f8f+/wH//wD//gD//gB//gB//gB//wD/f4H+f//+P//8H//wA//A"],["0",0.8065,"AP+AA//AB//wD//4H+f4P8P8P4H8P4H+f4D+fwD+fwD/fwD//wD//wD//wD//wD//wD//wD//wD/fwD/fwD/fwD+fwD+f4D+P4H+P4H8P8P8H+f4D//4B//wA//AAP+A"],["0",0.6923,"AP/gAP/gH//4H//4H//4HwD/HwD//wAf/wAf/wAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf/wAf/wAf/wAfHwD/HwD/H//4H//4H//4AP/gAP/g"],["1",0.6154,"H/4AH/4A//4A//4A//4A/H4A/H4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4A////////////////////"],["2",0.6923,"B//gB//g///4///4///4+AD/+AD/AAAfAAAfAAAfAAAYAAAYAAD4AAD4AAD4AAfgAAfgAB8AAB8AAB8AAPgAAPgAB+AAB+AAB+AAHwAAHwAA////////////////////"],["3",0.6923,"B//gB//gH//4H//4H//4GAD/GAD/AAAfAAAfAAAfAAD4AAD4AP/gAP/gAP/gAP/4AP/4AAD/AAD/AAD/AAAfAAAfAAAfAAAfAAAf+AD/+AD////4///4///4H//gH//g"],["4",0.7692,"AA/gAA/gAD/gAD/gAD/gADPgADPgAcPgAcPgAcPgB8PgB8PgBgPgBgPgBgPgOAPgOAPg+APg+APg+APg////////////////////AAPgAAPgAAPgAAPgAAPgAAPgAAPg"],["5",0.6923,"H//4H//4H//4H//4H//4HwAAHwAAHwAAHwAAHwAAH//gH//gH//4H//4H//4GAD/GAD/AAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAf+AD/+AD////4///4///4H//gH//g"],["6",0.6923,"AP/4AP/4B///B///B///H+AYH+AYHwAAHwAAHwAA/wAA/wAA+P/g+P/g+P/g/////////wAf/wAf/wAf/wAf/wAfHwAfHwAfHwAfHwAfHwAfB///B///B///AP/gAP/g"],["7",0.6923,"////////////////////AAD4AAD4AAD4AAD4AAD4AAD4AAD4AAfgAAfgAAfgAAfgAAfgAB8AAB8AAB8AAB8AAB8AAB8AAB8AAB8AAPgAAPgAAPgAAPgAAPgAB+AAB+AA"],["8",0.6923,"B//gB//gH//4H//4H//4HwD/HwD/GAAfGAAfGAAfHwD/HwD/B//4B//4B//4B//4B//4HwD/HwD/HwD/+AAf+AAf+AAf+AAf+AAf/wD//wD/H///H///H///B//gB//g"],["9",0.6923,"B//gB//gH//4H//4H//4/wD//wD/+AAf+AAf+AAf+AAf+AAf/wD//wD//wD/H///H///B/8fB/8fB/8fAAAfAAAfAAD/AAD/AAD/GAf4GAf4H//4H//4H//4B/8AB/8A"],["/",0.4,"AAD/AAD/AAD/AAD/AADwAADwAA/wAA/wAA/wAA/wAA/wAA8AAA8AAA8AAA8AAP8AAP8AAP8AAP8AAPAAAPAAD/AAD/AAD/AAD/AAD/AADwAADwAA/wAA/wAA/wAA/wAA"],["0",0.65,"Af+AAf+AD//wD4H8D4H8PgB8PAA/PAA//AA//AA//AA//AA//AA//AAP/AAP/AAP/AAP/AAP/AAP/AA//AA//AA//AA//AA/PAA/PAA/PgB8D4H8D4H8D//wAf+AAf+A"],["1",0.6,"D/wAD/wA//wA/DwA/DwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwAADwA////////////"],["2",0.65,"D/+AD/+A///w/AHw/AHwwAB8AAB8AAB8AAA8AAA8AAB8AAB8AAB8AAB8AAHwAAHwAAfAAAfAAB/AAH+AAH+AAf4AA/gAA/gAD+AAD+AAP4AA/gAA/gAA////////////"],["3",0.65,"D/+AD/+AP//wPAH8PAH8AAB8AAA/AAA/AAA/AAA/AAB8AAH8AAH8A//AA//wA//wAAH8AAH8AAB/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAB/8AH88AH8///wD/+AD/+A"],["4",0.75,"AAfgAAfgAB/gAB/gAB/gAD/gAPvgAPvgAOPgAOPgA+PgB8PgB8PgBwPgHwPgHwPgPAPgPAPgPAPg+APg+APg////////////AAPgAAPgAAPgAAPgAAPgAAPgAAPgAAPg"],["5",0.65,"P//wP//wP//wPAAAPAAAPAAAPAAAPAAAPAAAPAAAPAAAP/+AP/+AP//wPAf8PAf8AAB8AAB8AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAB88Af88Af8///wD/+AD/+A"],["6",0.7,"AH/gAH/gB//4H8AYH8AYP4AAPgAAPgAAOAAAOAAA+AAA+H+A+H+A///4/4H4/4H4/gB8/gB8+AB8+AAc+AAc+AAf+AAc+AAcOAB8OAB8PgB8H4H4H4H4B//gAf+AAf+A"],["7",0.65,"////////////AAB8AAB8AAB8AAB8AAB8AAHwAAHwAAHwAAHwAAHwAAfAAAfAAAfAAB+AAB+AAB+AAB+AAB+AAH4AAH4AAH4AAH4AAH4AAfgAAfgAAfgAA+AAA+AAA+AA"],["8",0.65,"A//AA//AD//8P4B8P4B8/AA//AA//AA//AA//AA/PAA/P4B8P4B8A//wD//wD//wP4B8P4B8/AA//AA//AA//AAP/AAP/AAP/AA//AA//AA/P4B8P4B8D//8A//AA//A"],["9",0.65,"A/+AA/+AD//wPgHwPgHw/AB8/AA//AA//AA//AA/8AA//AA//AA//AA//AB//AB/PgH/PgH/D///A/+/A/+/AAA/AAA/AAA/AAB8AAB8AAB8PAfwPAfwP//AD/4AD/4A"],["/",0.4091,"AAAfAAD/AAD/AAD4AAD4AAD4AAf4AAfgAAfgAAfgAB/gAB/gAB/gAB8AAB8AAP8AAP8AAPgAAPgAAPgAB/gAB/gAB+AAB+AAB+AAH+AAHwAAHwAAHwAA/wAA/wAA+AAA"],["0",0.6667,"Af8AB//AD//gP8PwPgD8fgB8fAB+fAA+fAA++AA++AA++AA/+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AA/+AA++AA+fAA+fAA+fAB+fgB8PgD8P8PwD//gB//AAf8A"],["1",0.6207,"D/4A//4A//4A/n4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4Af///f///f///"],["2",0.6333,"B/4Af//g///w/wP48AD4gAD+AAA+AAA+AAA+AAA+AAA+AAA+AAD+AAD4AAH4AAPwAAPwAAfgAB/AAD8AAH4AAPwAA/gAB+AAB+AAD8AAH4AAfwAA/AAA////////////"],["3",0.6333,"D/8Af//gf//wfAP4YAD+AAA+AAA/AAAfAAAfAAAfAAA+AAA+AAD+AAP4A//wA//AA//wAAP4AAD+AAA/AAAfAAAfAAAfAAAfAAAfAAAfAAA/gAD++AP+///4///gH/8A"],["4",0.7241,"AAPgAAfgAB/gAB/gAD/gAD/gAH3gAHngAPngAeHgAcHgA8HgB4HgBwHgHwHgPgHgPgHgPAHgfAHg+AHg+AHg////////////AAHgAAHgAAHgAAHgAAHgAAHgAAHgAAHg"],["5",0.6552,"f//4f//4f//4fAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAf/4Af//gf//weAP4AAD+AAD+AAA+AAA/AAAfAAAfAAAfAAAfAAAfAAA/AAA+gAD+gAD++AP4///w///gH/4A"],["6",0.6667,"AD/gAf/8A//8B+A8DwAMPgAAfgAAfAAAfAAAfAAA+AAA+P+A+f/g///w/8P8/gB+/gA+/AA//AAf/AAf/AAf/AAf/AAffAAffAAffAA/fgA+PgB+D8P8B//wA//gAP+A"],["7",0.6552,"////////////AAA+AAA+AAA+AAD+AAD4AAH4AAHwAAHwAAPwAAPgAAPgAAfgAAfAAAfAAB/AAB8AAB8AAD8AAD4AAH4AAHwAAHwAAPwAAPgAAPgAAPgAA/gAA+AAB+AA"],["8",0.6667,"Af+AB//gP//wPwP8fgB8fAB+/AA++AA++AA++AA+fAA+fAB+fgB8PwPwD//gA//AD//wPwP8fAB+/AA++AA/+AAf+AAf+AAf+AAf+AA//AA+/AB+fwP8P//wD//gA/+A"],["9",0.7,"AP8AA//AH//gP4P4PwD4fgB8fAB8fAA+fAA+fAA+/AA+/AA+fAA/fAA/fAB/fgB/PgD/P4P/H///B/++Af4+AAA+AAA+AAB8AAB8AAB8AAD4IAH4PgfgP//AP/+AB/wA"],["/",0.3939,"AAA/AAA/AAB/AAB8AAB8AAH8AAH8AAHwAAfwAAfwAAfAAAfAAB/AAB+AAB+AAH+AAH4AAf4AAf4AAfgAA/gAA/gAA+AAA+AAD+AAD4AAD4AAP4AAPgAAPgAA/gAA/gAA"],["0",0.8462,"Af+AAf+AP//wP//wP//wP4f8P4f8/4H8/4H8/4H8/gH//gH//gH//gH//gH//gH//gH//gH//gH//gH//gH//gH//4H8/4H8/4H8P4f8P4f8P//wP//wP//wAf+AAf+A"],["1",0.6923,"H/8AH/8A//8A//8A//8A+P8A+P8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8A////////////////////"],["2",0.7692,"B//gB//g///8///8///8/g///g//wAP/wAP/wAP/AAP/AAP/AAP/AAP/AAP/AA/8AA/8AD/gAD/gAD/gAf+AAf+AB/wAB/wAB/wAP/AAP/AA////////////////////"],["3",0.7692,"B//gB//gP//8P//8P//8OAP/OAP/AAP/AAP/AAP/AAP8AAP8B//gB//gB//gB//8B//8AAP/AAP/AAP/AAB/AAB/AAB/AAB/AAB/+AP/+AP////8///8///8P//gP//g"],["4",0.8462,"AB/wAB/wAH/wAH/wAH/wAf/wAf/wD//wD//wD//wD4fwD4fwP4fwP4fwP4fw/gfw/gfw8Afw8Afw8Afw////////////////////AAfwAAfwAAfwAAfwAAfwAAfwAAfw"],["5",0.7692,"P//8P//8P//8P//8P//8P8AAP8AAP8AAP8AAP8AAP//gP//gP//8P//8P//8OAP/OAP/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/+AP/+AP////8///8///8B//gB//g"],["6",0.8462,"Af/wAf/wD//8D//8D//8P+AMP+AMP4AAP4AAP4AA//+A//+A///8///8///8/4H8/4H8/4H//4H//4H//4H//4H//4H8/4H8/4H8P4H8P4H8D//wD//wD//wAf+AAf+A"],["7",0.7692,"////////////////////AAP/AAP/AAP8AAP8AAP8AA/8AA/8AA/8AA/8AA/8AD/gAD/gAD/gAD/gAD/gAD+AAD+AAf+AAf+AAf+AAfwAAfwAB/wAB/wAB/wAB/AAB/AA"],["8",0.7692,"B//gB//gP///P///P////8P//8P//8B//8B//8B/P8P/P8P/B//8B//8B//8P//8P//8/8P//8P//8P//gB//gB//gB//gB//gB//8P//8P/P///P///P///B//gB//g"],["9",0.7692,"B//gB//gP//8P//8P//8/8P//8P//gB//gB//gB//gB//gB//gB//gB//gB//8P//8P/P///P///P///B///B///AAB/AAB/AAB/OAP8OAP8P//gP//gP//gB/+AB/+A"],["/",0.4667,"AAP/AAP/AAP4AAP4AAP4AAP4AD/4AD/4AD/4AD+AAD+AAD+AAD+AAD+AAD+AAfwAAfwAAfwAAfwAAfwAAfwAH8AAH8AAH8AAH8AAH8AAH8AAH8AA/gAA/gAA/gAA/gAA"],["0",0.85,"Af+AAf+AD//AH//wH//wH8P4fwD+fwD+fwD+fwD+fwD+/wD+/wD+/gD+/gD//gD//gD//gD//gD+/wD+/wD+fwD+fwD+fwD+fwD+fwD+H8P4H//wH//wD//AAf+AAf+A"],["1",0.7,"H/+AH/+A//+A//+A//+A+H+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+AAH+A////////////////////"],["2",0.75,"H/8AH/8A///g///4///4/B/8wAP8wAP8AAP8AAP8AAP8AAP8AAP8AAf8AAf4AAf4AB/gAB/gAD/gAP/AAP/AA/wAB/gAB/gAH+AAH+AAP8AA////////////////////"],["3",0.75,"H//AH//AP//4P//4P//4OB/8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AB/4B//gB//gB//gB//gB//4AAf8AAf8AAP/AAP/AAP/AAP/AAP/4Af8///8///8///4P/8AP/8A"],["4",0.85,"AB/wAB/wAD/wAP/wAP/wAP/wAf/wAf/wA+fwA+fwA+fwD8fwD8fwHwfwHwfwHwfwfgfwfgfw/Afw/Afw/Afw////////////////////AAfwAAfwAAfwAAfwAAfwAAfw"],["5",0.75,"P//8P//8P//8P//8P//8PwAAPwAAPwAAPwAAPwAAP//AP//4P//4P//8OAf8OAf8AAP/AAP/AAD/AAD/AAD/AAD/AAD/AAD/AAP/AAP/4Af8///4///4///gH/8AH/8A"],["6",0.75,"AP/4AP/4B//8H//8H//8P+AcP8AAP8AA/wAA/wAA/wAA/z/g/z/g///4///8///8/8P//8P//8D//wD//wD//wD//wD//wD/P8D/P8D/P8P/H//8H//8B//4AP/AAP/A"],["7",0.75,"////////////////////AAP8AAP8AAP8AAf8AAf8AAf4AB/4AB/4AB/gAD/gAD/gAD/AAD/AAD/AAP8AAP8AAP8AA/8AA/8AA/wAA/wAB/wAB/gAB/gAB/gAH+AAH+AA"],["8",0.75,"B//AB//AH//4P//8P//8/8P//wD//wD//wD//wD//wD/P8P8P8P8H//4B//gB//gP//4P//4/8P8/wD//wD//wD//wD//wD//wD//wD//8P/P//8P//8P//4B//AB//A"],["9",0.8,"Af8AAf8AD//gH//4H//4f8f8f4H8f4H8/gH//gH//gD//gH//gH/f4H/f8f/f8f/f///f///H///A/7/A/7/AAD/AAH8AAH8AAH8AAH8HA/4H//gH//gH//AD/4AD/4A"],["/",0.4545,"AAB/AAP8AAP8AAP8AAP8AAP8AA/8AA/gAA/gAA/gAD/gAD/gAD+AAD+AAD+AAD+AAfwAAfwAAfwAAfwAB/AAB/AAB/AAB/AAB/AAP8AAP8AAP8AAP8AA/gAA/gAA/gAA"],["0",0.8,"AP8AA//AD//gH//wH//4P8P8f4H8fwH+fwH+fwD+/wD+/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD+fwD+fwH+fwH+f4H8P8P8H//4H//wD//gA//AAP8A"],["1",0.7241,"H/+A//+A//+A//+A//+A//+A/P+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+AAP+Af///f///f///f///f///f///"],["2",0.7,"A/+Af//g///8///+///+/gf/4AP/gAH/gAH/AAH/AAH/AAH/AAH/AAH+AAP+AAf8AB/4AD/gAP/AAf+AA/8AB/4AH/gAP+AAP+AAf8AA////////////////////////"],["3",0.7333,"H/8Af//wf//4f//8f//8eA/+QAP+AAP+AAP+AAP+AAP+AAP8AA/8B//4B//gB//wB//4B//8AA/+AAP+AAH/AAH/AAH/AAH/AAH/gAP+8A/+///+///8///4///gP/4A"],["4",0.8276,"AB/wAD/wAD/wAH/wAP/wAP/wAP/wAf/wA/fwB+fwB8fwD8fwH4fwHwfwPwfwfgfwfgfwfAfw/Afw+Afw////////////////////AAfwAAfwAAfwAAfwAAfwAAfwAAfw"],["5",0.7586,"f//8f//8f//8f//8f//8f//8f//8fwAAfwAAfwAAf/8Af//wf//4f//8f//+fg/+fg/+YAP/AAH/AAH/AAH/AAH/AAH/gAH/4AP//g/+///+///+///8///4f//gB/8A"],["6",0.8,"AD/AAf/4A//8B//8D//8H/A8P8AEP4AAP4AAP4AAfwAAfz+Af//wf//4f//8///8/+P+/4D+f4D/f4D/f4D/f4D/f4D/P4D+P4D+P4D+P+P+H//8D//4B//wA//gAH+A"],["7",0.7586,"///////////////////////////+AAP+AAP8AAf8AAf4AAf4AA/wAA/wAB/gAB/gAB/gAD/gAD+AAH+AAH8AAP8AAP4AAf4AAfwAB/wAB/gAB/gAB/gAD/gAD/AAH/AA"],["8",0.7667,"Af/AB//wH//8P//+P//+f8H/f4D/fwD/fwD/fwD/fwD/P4D+P8H+H//8D//4A//gD//4P//8f8H+fwD/fwB//wB//wB//wB//wB/fwD/f8H/f///P//+H//8D//4Af/A"],["9",0.7667,"Af8AB//AH//wP//4P//8f4P8fwH+/wD+/wD+/wD//gD//gD//wD//wD//wH/f4P/f///P///H///D/9/A/x/AAD/AAD+AAH+AAH+IAP8PAf8P//4P//wP//gH/+AB/4A"],["/",0.4545,"AAD/AAD8AAP8AAP8AAP4AAf4AAf4AAfgAAfgAB/gAB/AAB/AAD/AAD8AAD8AAP8AAPwAA/wAA/wAA/gAB/gAB/gAB+AAB+AAH+AAH8AAH8AAP8AAPwAAPwAA/wAA/wAA"],["0",0.6923,"AP/gAP/gH+D4H+D4H+D4HwAfHwAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAfHwAfHwAfH+D4H+D4H+D4AP/gAP/g"],["1",0.5385,"Af+AAf+AH/+AH/+AH/+A4D+A4D+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+A////////"],["2",0.6923,"H//gH//g+AD4+AD4+AD4+AD4+AD4AAAfAAAfAAAfAAD4AAD4AAD4AAD4AAD4AAfgAAfgAB8AAB8AAB8AAPgAAPgAB+AHB+AHB+AHHwAHHwAH////////////////////"],["3",0.6923,"B//gB//gHwD4HwD4HwD4GAAfGAAfAAAYAAAYAAAYAAD4AAD4AP/gAP/gAP/gAAD4AAD4AAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAf+AAf+AAf+AD4+AD4+AD4H//gH//g"],["4",0.8462,"AAeAAAeAAB+AAB+AAB+AAH+AAH+AAGeAAGeAAGeAAYeAAYeAD4eAD4eAD4eADgeADgeAMAeAMAeAMAeA////////AAeAAAeAAAeAAAeAAAeAAAeAAAeAAAeAAH/8AH/8"],["5",0.6923,"H//4H//4H//4H//4H//4GAAAGAAAGAAAGAAAGAAAH//gH//gHwD4HwD4HwD4AAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAfAAAf+AAf+AAf/wD4/wD4/wD4B//gB//g"],["6",0.6923,"AP/4AP/4B+AfB+AfB+AfHwAfHwAfGAAAGAAAGAAA+P/g+P/g/+D4/+D4/+D4/wAf/wAf+AAf+AAf+AAf+AAf+AAf/wAf/wAf/wAfHwAfHwAfH+D4H+D4H+D4AP/gAP/g"],["7",0.6923,"////////////////////+AAf+AAfAAAYAAAYAAAYAAD4AAD4AADgAADgAADgAADgAADgAAcAAAcAAAcAAAcAAAcAAB8AAB8AAB8AABgAABgAAPgAAPgAAPgAAOAAAOAA"],["8",0.6923,"B//gB//gHwD4HwD4HwD4HwAfHwAfHwAfHwAfHwAfHwD4HwD4B//gB//gB//gHwD4HwD4+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAfHwD/HwD/HwD/B//gB//g"],["9",0.6923,"B//gB//gHwD4HwD4HwD4+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAfHwD/HwD/HwD/B/8fB/8fAAAfAAAfAAAfGAAYGAAYHwD4HwD4HwD4B/8AB/8A"],["0",0.65,"Af+AAf+AA4HwDgB8DgB8PgA8PAA/PAA//AA//AA//AA//AA//AA//AA//AAP/AAP/AAP/AAP/AA//AA//AA//AA//AA//AA/PAA/PAA/PgA8DgB8DgB8D4HwAf+AAf+A"],["1",0.5,"AD+AAD+AAf+AP/+AP/+A+D+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AP///P///"],["2",0.65,"D/+AD/+A/gfA8ABw8ABw8AB88AB88AB8AAB8AAB8AAB8AAB8AAB8AAB8AAHwAAHwAAHAAAHAAAeAAB+AAB+AAH4AAfgAAfgAA+AAA+AADgAPPAAPPAAP////////////"],["3",0.65,"D//AD//APgHwPAB8PAB8PAB8MAA8MAA8AAB8AAB8AAB8AAHwAAHwAf+AAAHwAAHwAAB8AAB8AAA/AAA/AAA/AAA/AAA/AAA/8AA/8AA/8AA/8AB88AB8/gHwD//AD//A"],["4",0.75,"AAfAAAfAAB/AAB/AAB/AAD/AAD/AAD/AAOfAAOfAA8fAA8fAA8fABwfAHwfAHwfAHAfAHAfAOAfA+AfA+AfA4AfA////////AAfAAAfAAAfAAAfAAAfAAAfAAP/8AP/8"],["5",0.65,"P//8P//8P//8PAAAPAAAPAAAPAAAPAAAPAAAPAAAPAAAP/+AP/+APgHwPAB8PAB8AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/8AA/8AA/8AA//AB8/AB8/gHwD/+AD/+A"],["6",0.7,"AH/gAH/gB8H8HgB8HgB8PgAcOAAAOAAA+AAA+AAA+AAA+f+A+f+A/4H4/gB4/gB4+AB8+AB8+AB8+AAc+AAc+AAf+AAc+AAc+AB8+AB8PgB8HgB4HgB4H4HgAf+AAf+A"],["7",0.65,"////////////8AAP8AAP8AA8AAA8AAA8AAB8AAB8AABwAABwAABwAAHAAAHAAAHAAAfAAAfAAAeAAAeAAAeAAB4AAB4AAB4AAHgAAHgAAHgAAfgAAfgAAeAAAeAAAeAA"],["8",0.65,"A//AA//AD4HwPgB8PgB8PAA//AA//AA/PAA/PAA/PgB8D4HwD4HwA//AD4HwD4HwPgA8PgA8/AA//AA//AA//AA//AA//AA//AA//AA//AA/PgA8PgA8D4H8A//AA//A"],["9",0.65,"A/+AA/+AD4HwPgB8PgB8/AA8/AA//AA//AA//AA//AA//AA//AA//AA//AA//AA/PgB/PgB/D4H/A/+/A/+/AAA/AAA/AAA/AAA8AAA8MAA8PABwPABwPgHAD/4AD/4A"],["/",0.4091,"AAAfAAD/AAD/AAD4AAD4AAD4AAf4AAfgAAfgAAfgAAfgAAfgAB8AAB8AAB8AAB8AAP8AAPgAAPgAAPgAB/gAB/gAB+AAB+AAB+AAH+AAHwAAHwAAHwAA/wAA/wAA+AAA"],["0",0.6667,"AP8AA//AD8PgDwDwPgB8fAB8fAA+fAA+fAA++AA++AA++AA/+AA/+AAf+AAf+AAf+AAf+AAf+AAf+AA/+AA/+AA++AA+fAA+fAA+fAA+fAB8PgB8DwDwD8PgA//AAP8A"],["1",0.5,"AD8AAP8AB/8AH/8A/z8A+D8A4D8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AAD8AP///P///"],["2",0.6333,"B/4Af//g/wPw+AH48AD48AD+4AA+AAA+AAA+AAA+AAA+AAA+AAD4AAD4AADwAAHwAAPgAAfAAAcAAB4AADwAAHgAAOAAA8AAA8AAB4APDwAPHwAPfAAP////////////"],["3",0.6667,"A/8AP//AfgfwfADweAB8cAB8cAB8AAB8AAB8AAB8AAB8AADwAADwAAfAAf+AAf/AAAfgAAD8AAB8AAA+AAA+AAA+AAA/wAA/wAA/8AA+8AA+8AB++AD8/gPwf//gB/+A"],["4",0.7667,"AAPAAAfAAB/AAB/AAD/AAHvAAHvAAOPAAOPAAcPAAcPAA4PAAwPABwPADgPADgPAHAPAOAPAOAPAcAPA4APA////////AAPAAAPAAAPAAAPAAAPAAAPAAAPAAP/+AP/+"],["5",0.6552,"H//4H//4H//4GAAAGAAAGAAAGAAAGAAAGAAAGAAAGP8AH//gH4PwHAD4GAA+AAA/AAA/AAAfAAAfAAAfAAAfAAAfAAAf8AAf8AAf8AA/+AA++AA+/AD4/wPwf//gB/8A"],["6",0.6667,"AD/gAf/8B+B8DwA8DgAcPAAcfAAAfAAAfAAAeAAA+AAA+P+A+//g/8Pw/gB8/gB+/AA+/AA//AAf/AAf+AAf+AAf/AAf/AAf/AAffAA+fAA+PgB+PgB8D8PwA//gAP+A"],["7",0.6897,"///////////+8AAe8AA+8AA+8AA8QAA8AABwAABwAADgAADgAAPgAAPAAAPAAAeAAAeAAAeAAA+AAA8AAA8AABwAABwAADgAADgAAPgAAPAAAPAAAPAAAeAAAeAAA8AA"],["8",0.6667,"Af+AB//gP8PwPgD8fAB8fAB+fAA+fAA+fAA+fAA+fAB+fAB8PgD8D8PgA//AB//ADwPwfgB8fAA++AA++AA/+AA/+AAf+AA/+AA/+AA/+AA+/AA+fgB8PwP8D//gA/+A"],["9",0.7,"AP8AA//AH4PgHwD4PgB8fAB8fAA+fAA+fAA+fAA+/AA+/AA/fAA/fAA/fAA/fAB/PgB/PwD/H4H/B/+eAf4+AAA+AAA+AAA8AAA8AAA8OAB4PAB4PADgPwPAP/+AB/4A"],["/",0.3939,"AAA/AAA/AAB/AAB8AAB8AAB8AAH8AAHwAAHwAAfwAAfAAAfAAB/AAB+AAB+AAH+AAH4AAf4AAfgAAfgAAfgAA/gAA+AAA+AAD+AAD4AAD4AAP4AAPgAAPgAA/gAA/AAA"],["0",0.8462,"Af+AAf+AP4fwP4fwP4fwP4H8P4H8/4H8/4H8/4H8/4H//4H//4H//4H//4H//4H//4H//4H//4H//4H//4H//4H//4H8/4H8/4H8P4H8P4H8P4fwP4fwP4fwAf+AAf+A"],["1",0.6923,"AP8AAP8AH/8AH/8AH/8A+P8A+P8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8A////////"],["2",0.7692,"P//gP//g+A/8+A/8+A/8+AP/+AP/AAP/AAP/AAP/AAP/AAP/AAP8AAP8AAP8AA/8AA/8AA+AAA+AAA+AAfwAAfwAB/ADB/ADB/ADPgADPgAD////////////////////"],["3",0.7692,"B//gB//g/g/8/g/8/g/8+AP/+AP/AAP/AAP/AAP/AA/8AA/8Af/gAf/gAf/gAA/8AA/8AAP/AAP/AAP/AAB/AAB/+AB/+AB/+AB/+AP/+AP//gP//gP//gP/B//gB//g"],["4",0.8462,"AB/wAB/wAH/wAH/wAH/wAf/wAf/wAZ/wAZ/wAZ/wD5/wD5/wPh/wPh/wPh/wMB/wMB/w8B/w8B/w8B/w////////AB/wAB/wAB/wAB/wAB/wAB/wAB/wAB/wAf//Af//"],["5",0.7692,"P//8P//8P//8P//8P//8OAAAOAAAOAAAOAAAOAAAP//gP//gPg/8Pg/8Pg/8AAP/AAP/AAP/AAP/AAP/AAP/AAP/+AP/+AP/+AP/+AP/+AP//g/8/g/8/g/8B//gB//g"],["6",0.8462,"Af/wAf/wD+B8D+B8D+B8P4AMP4AMP4AAP4AAP4AA///w///w/4f8/4f8/4f8/4H8/4H8/4H//4H//4H//4H//4H//4H//4H//4H/P4H8P4H8D4f8D4f8D4f8Af+AAf+A"],["7",0.7692,"////////////////////+AAf+AAf+AB8+AB8+AB8AAB8AAB8AAPgAAPgAAPgAAPgAAPgAA+AAA+AAA+AAA+AAA+AADwAADwAADwAADwAADwAAfAAAfAAAfAAAfAAAfAA"],["8",0.8462,"D/+AD/+AP4f8P4f8P4f8/4H8/4H8/4H8/4H8/4H8P4f8P4f8D/+AD/+AD/+AP4f8P4f8/4H8/4H8/4H8/4H//4H//4H//4H//4H//4H8/4H8P4f8P4f8P4f8D/+AD/+A"],["9",0.7692,"B//gB//gP8P8P8P8P8P8/8B//8B//8B//8B//8B//8B//8B//8B//8B//8B//8B//8B/P8P/P8P/P8P/B///B///AAB/AAB/AAB/OAB8OAB8PgP8PgP8PgP8B/+AB/+A"],["0",0.85,"Af+AAf+AD8PAHwPwHwPwHwD4fwD+fwD+fwD+fwD+fwD+/wD+/wD+/wD//wD//wD//wD//wD//wD//wD+/wD+fwD+fwD+fwD+fwD+fwD+HwD4HwPwHwPwD8PAAf+AAf+A"],["1",0.65,"Af+AAf+AA/+AP/+AP/+A/f+Awf+Awf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AP///P///"],["2",0.7,"H/+AH/+A/g/4+AP8+AP84AP/4AH/4AH/AAH/AAH/AAH/AAH/AAH/AAH/AAP8AAP8AAP8AAP8AA/4AD+AAD+AAH4AAfAAAfAAB8AHB8AHPgAH////////////////////"],["3",0.75,"H//AH//A/B/4+Af8+Af84AP8AAP8AAP8AAP8AAP8AAP8AAf8AAf8AB/4A//AA//AAB/4AB/4AAP8AAP/AAP/AAP/AAD/AAD/4AD/4AD/4AP/4AP84AP8/Af4H//AH//A"],["4",0.85,"AB/AAB/AAD/AAD/AAD/AAP/AAP/AAP/AAd/AAd/AA9/AAx/AAx/ADx/AHh/AHh/AHh/AHh/AfB/AcB/AcB/A8B/A////////AB/AAB/AAB/AAB/AAB/AAB/AAf/+Af/+"],["5",0.75,"P//4P//4P//4P//4P//4OAAAOAAAOAAAOAAAOAAAP/8APB/gPB/gOAf4AAP8AAP8AAP8AAP8AAP/AAP/AAP/AAP/AAP/AAP/4AP84AP84AP8+Af4+Af4/B/gH/8AH/8A"],["6",0.75,"AP/4AP/4B+A8H8AcH8AcPwAcPwAAPwAA/wAA/wAA/wAA///g///g/8P4/8D8/8D8/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/PwD/H8D8H8D8B8P4A//AA//A"],["7",0.75,"////////////////////4AA/4AA84AA84AD84AD8AAD4AAP4AAP4AAPgAAPgAAPgAAfAAAfAAAfAAB8AAB8AAB8AADwAADwAADwAADwAAPgAAPgAAPgAA+AAA+AAA+AA"],["8",0.8,"A//AA//AH8H4H4H8H4H8f4H/f4H/f4H/f4H/f4H/H4H8D8H4D8H4A//gH8H4H8H4f4D8f4D8f4D//4D//4D//4D//4D//4D//4D//4D/f4D/f4D8f4D8H8H4A//AA//A"],["9",0.8,"A/8AA/8AD8fgH4H4H4H4f4H8f4D8f4D8/4D//4D//4D//4D//4D/f4D/f4H/f4H/f4H/f4H/H8f/A/7/A/7/AAD/AAD8AAD8AAD8AAD8cAH4fAH4fAH4fgfgD/8AD/8A"],["0",0.8,"AP8AA//AD8PwH4H4P4H4PwH8fwD8fwD+fwD+fwD+/wD+/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD+fwD+fwD+fwD+fwD8PwH8P4H4H4H4D8PwA//AAP8A"],["1",0.6333,"AP8AA/8AD/8Af/8A/P8A8P8A4P8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8A////////"],["2",0.7,"H/8A///g/B/4+Af84AP+4AH/wAH/AAH/AAH/AAH/AAH/AAH/AAH/AAH+AAP+AAP8AAf4AAfgAB/AAD+AAH8AAPwAA+AAB8AHB8AHHwAHfgAH////////////////////"],["3",0.7333,"H/8A///w/h/48Af88AP+4AP+4AP+AAP+AAP+AAP+AAP+AAP8AAf8AB/4Af/gAf/gAB/4AAf8AAP+AAH/AAH/AAH/AAH/wAH/wAH/wAH/4AH/4AP+8Af+/g/8f//wB/8A"],["4",0.8,"AB/gAB/gAD/gAD/gAH/gAP/gAO/gAe/gAe/gAc/gA4/gB4/gBw/gDw/gHg/gHA/gPA/gOA/geA/g8A/g8A/g////////AA/gAA/gAA/gAA/gAA/gAA/gAA/gAf//Af//"],["5",0.7586,"P//8P//8P//8P//8P//8P//8MAAAMAAAMAAAMAAAMf8AP//gPg/wOAf8MAP8AAP+AAP+AAP+AAH/AAH/AAH/AAH/AAH/4AH/4AP+4AP+8AP88AP88Af8/h/4f//gB/8A"],["6",0.8,"AD/wAf/8A/B8D8A8D4AcH4AMP4AAPwAAPwAAfwAAfwAAfz/Af//wf+P4f8H8f4H+/4H+/4D+f4D/f4D/f4D/f4D/f4D/f4D+f4D+P4D+P4H+H4H8D8H8B+P4A//gAH+A"],["7",0.7586,"///////////////////////////+4AAe4AB84AB84AD4AAD4AAHwAAHwAAPgAAPgAAPgAAeAAAeAAA8AAA8AAB4AAB4AADwAADwAAHgAAHgAAHgAAPAAAPAAAeAAAeAA"],["8",0.8,"Af+AD//gH8P4P4P8P4H8f4H+f4H+f4H+f4H+f4H+f4H+P4H8P4H4H8PwB//AB//gH8P4P4H8fwH+fwD+/wD+/wD//wD//wD//wD//wD//wD+fwH+P4H8H8P4D//wAf+A"],["9",0.7667,"Af8AD//gH8PwP4H4f4D8fwD+fwD+/wD+/wD+/wD//wD//wD//wD//wD/fwD/fwD/f4D/P4H/H8P/D///A/5/AAB/AAB+AAB+AAB+AAD+MAD8OAH4PAHwPgfgP//AD/4A"],["0",0.6923,"B/8AB/8AH//4H//4H//4HwD4HwD4+AD4+AD4+AD4+AAf+AAf+Pgf+Pgf+Pgf+Pgf+Pgf+AAf+AAf+AAf+AAf+AAf+AD4+AD4+AD4HwD4HwD4H//4H//4H//4B/8AB/8A"],["2",0.6154,"H//AH//A/////////////AH//AH/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAH4AAH4AA/AAA/AAA/AAH4AAH4AA/AAA/AAA/AAH4AAH4AA////////////////////"],["3",0.6923,"B/8AB/8AH//4H//4H//4GAD4GAD4AAD4AAD4AAD4AAD4AAD4B//gB//gB//gB//gB//gAAD4AAD4AAD4AAAYAAAYAAAfAAAfAAAf+AD4+AD4///4///4///4H/8AH/8A"],["4",0.6923,"AAfgAAfgAB/gAB/gAB/gAP/gAP/gAOfgAOfgAOfgB+fgB+fgBwfgBwfgBwfgGAfgGAfg+Afg+Afg+Afg////////////////////AAfgAAfgAAfgAAfgAAfgAAfgAAfg"],["5",0.6154,"H///H///H///H///H///H4AAH4AAH4AAH4AAH4AAH//AH//AH//4H//4H//4HAH/HAH/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA//AH//AH////4///4///4H//AH//A"],["6",0.6923,"AP/gAP/gB//4B//4B//4H+AYH+AY/wAA/wAA/wAA+AAA+AAA+P/g+P/g+P/g///4///4/wD//wD//wD/+AAf+AAf+AAf+AAf+AAfHwD/HwD/H//4H//4H//4B//gB//g"],["7",0.6923,"///////////4///4///4AAD4AAD4AAD4AAD4AAD4AAfgAAfgAAfgAAfgAAfgAAcAAAcAAB8AAB8AAB8AAB8AAB8AAPgAAPgAAPgAAPgAAPgAB+AAB+AAB+AAB+AAB+AA"],["8",0.6923,"B//gB//gH//4H//4H//4/wD4/wD4+AD4+AD4+AD4HwD4HwD4B//gB//gB//gH//gH//gHwD4HwD4HwD4+AAf+AAf+AAf+AAf+AAf/wD//wD/H//4H//4H//4B//gB//g"],["9",0.6923,"B/8AB/8AH//4H//4H//4/wD4/wD4+AD4+AD4+AD4+AD/+AD//wD//wD//wD/H///H///B/8fB/8fB/8fAAAfAAAfAAD4AAD4AAD4GAf4GAf4H//gH//gH//gB/8AB/8A"],["/",0.5333,"AAA/AAA/AAA/AAA/AAA4AAA4AAH4AAH4AAH4AAHAAAHAAA/AAA/AAA/AAA/AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA/AAH4AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA/AAA"],["0",0.65,"Af+AAf+AD//AP4HwP4HwPgBw/AB8/AB8/AB8/AB8/AA8/AA8/AA8/Hg//f4//f4//Hg//Hg//AA//AA8/AA8/AA8/AB8/AB8/AB8/AB8PgBwP4HwP4HwD//AAf+AAf+A"],["2",0.6,"D/8AD/8A///w/AP8/AP8wAD8AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAD8AAP8AAP8AAPwAAPwAA/AAD8AAD8AAPwAA/AAA/AAD8AAD8AAPwAA/AAA/AAA////////////"],["3",0.6,"D//AD//A///w8AP88AP8AAA/AAA/AAA/AAA/AAA/AAA/AAP8AAP8A//wA//wA//wAAP8AAP8AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/8AP88AP8///wP//AP//A"],["4",0.7,"AAPgAAPgAA/gAA/gAA/gAD/gAH3gAH3gAHHgAHHgAcHgB8HgB8HgB4HgH4HgH4HgHgHgHgHgOAHg+AHg+AHg////////////AAHgAAHgAAHgAAHgAAHgAAHgAAHgAAHg"],["5",0.6,"P//8P//8P//8PAAAPAAAPAAAPAAAPAAAPAAAPAAAPAAAP/8AP/8AP//wMAP8MAP8AAD/AAD/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAD/8AP88AP8///wP/8AP/8A"],["6",0.65,"Af/AAf/AA//wD4AwD4AwPgAAPAAAPAAA/AAA/AAA/AAA8f+A8f+A8//w/4H8/4H8/gB8/gB8/AA8/AA//AA//AA//AA//AA//AA8/AA8PgB8P4H8P4H8D//wAf+AAf+A"],["7",0.6,"////////////AAA/AAA/AAA8AAD8AAD8AAD8AAD8AAPwAAPwAAPwAAPwAA/AAA/AAA/AAA/AAA8AAD8AAD8AAD8AAPwAAPwAAPwAAPwAAPwAA/AAA/AAA/AAA8AAA8AA"],["8",0.65,"A/+AA/+AP//wPgH8PgH8/AB8/AB8/AB8/AB8/AB8PAB8PgHwPgHwD//AD//AD//APgHwPgHw/AB8/AA8/AA8/AA//AA//AA//AA8/AA8/AB8PgH8PgH8P//wA/+AA/+A"],["9",0.6,"A//AA//AP//wPwD8PwD8/AA8/AA//AA/8AA/8AA/8AA/8AA/8AA//AA//AA//AA/PwD/PwD/P//PA/8PA/8PAAAPAAA/AAA/AAA/AAA/AAD8MAPwMAPwP//wD/8AD/8A"],["/",0.5909,"AAA/AAA/AAA/AAB8AAB8AAB8AABwAAHwAAHwAAHAAAfAAAfAAAeAAB+AAB+AAB4AAH4AAHgAAHgAAfgAAeAAAeAAA+AAA+AAA+AAD4AAD4AAD4AAPgAAPgAAPgAA/AAA"],["0",0.6333,"AP4AB//AD//gH4PwHwH4fAD4fAD4+AA++AA++AA++AA++AA++AA++AA++Hw/+P4/+P4/+Hw/+AA++AA++AA++AA++AA++AA++AA+fAD4fAD4HwH4H4PwD//gB//AAP4A"],["1",0.5517,"D/4A//4A//4A/H4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4A////////////"],["2",0.6,"B/8Af//g///w/gf48AD+gAB+AAB+AAB+AAB+AAB/AAB+AAB+AAB+AAD+AAD4AAHwAAfwAA/gAB+AAB8AAH4AAPgAAfAAB/AAB/AAD+AAH4AAfwAA/gAA////////////"],["3",0.6,"D/8A///g///w/gH4YAD+AAB+AAB+AAB+AAB+AAB+AAB+AAB+AAD+AAf4Af/wAf+AAf/wAAf4AAD+AAB+AAAfAAAfAAAfAAAfAAAfAAAfAAB/gAD++Af+///4///gH/8A"],["4",0.6897,"AAfgAAfgAA/gAB/gAB/gAB/gADvgAPvgAPPgAfPgAePgA8PgB8PgBwPgDwPgPgPgPgPgPAPgfAPg+APg+APg////////////AAPgAAPgAAPgAAPgAAPgAAPgAAPgAAPg"],["5",0.6207,"f//4f//4f//4fgAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAf/8Af//gf//wcAf4AAD+AAD+AAB+AAB/AAAfAAAfAAAfAAAfAAAfAAB/AAB+gAD+gAD++Af4///w///gf/8A"],["6",0.6333,"AH/gA//wB//wD8DwH4AQfwAAfAAAeAAAeAAA+AAA+AAA+H8A8//g9//w/4P4/wD4/AA+/AA++AA++AA++AA/+AA/+AA++AA++AA+fAA+fAA+fwD4H4P4D//wB//gAP8A"],["7",0.6207,"////////////AAB+AAB+AAB+AAB+AAD4AAD4AAH4AAHwAAHwAAfgAAfgAA/gAA+AAA+AAA+AAB+AAB8AAB8AAH4AAH4AAP4AAPgAAPgAAfAAAfAAAfAAB/AAB+AAB+AA"],["8",0.6333,"A/8AD//gH//wf4P4fAD4/AD++AA++AA++AA++AA++AA+fAD4fAD4H4PwD//gA/8AD//gf4P4fAD4+AA++AA++AA/+AA/+AA/+AA/+AA++AA+/AD+f4P4H//wD//gA/8A"],["9",0.6333,"AP8AB//gD//wH8H4HwD+fAA+fAA+fAAffAAf/AAf+AAf+AAf/AAffAAffAA/fAA/HwD/H4H/D//vB//PAP4fAAAfAAAfAAAeAAAeAAA+AAD+AAH4DwPwD//gD//AB/4A"],["/",0.5758,"AAAfAAAeAAA+AAA+AAD4AAD4AAHwAAHwAAPgAAPgAAfAAAfAAB8AAB8AAB4AAD4AAHwAAHwAAPgAAPgAA+AAA+AAB8AAB8AAD4AAD4AAHwAAHwAAHAAAfAAAfAAA+AAA"],["0",0.6154,"A//AA//AH//4H//4H//4/AA4/AA4/AA//AA//AA//AA//AA//AA//AA//AA/4AA/4AA//AA//AA//AA//AA//AA//AA//AA//AA//AA4/AA4H//4H//4H//4A//AA//A"],["1",0.3077,"AAA/AAA/AA//AA//AA//////////////////////AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/"],["2",0.6154,"A//AA//AH//4H//4H//4/AA//AA//AA//AA//AA/4AA/4AA/AAA/AAA/AAA/AAH4AAH4AH/AAH/AAH/AA/AAA/AAH4AAH4AAH4AA/AAA/AAA////////////////////"],["3",0.6154,"A//AA//AH//4H//4H//4/AA//AA//AA//AA//AA/AAA/AAA/AH/4AH/4AH/4AH/4AH/4AAA/AAA/AAA/AAA/AAA/4AA/4AA/4AA//AA//AA////4///4///4A//AA//A"],["4",0.6923,"AADgAADgAAf4AAf4AAf4AAf4AAf4AB/4AB/4AB/4APj4APj4B+D4B+D4B+D4BwD4BwD4HwD4HwD4HwD4////////////////////AAD4AAD4AAD4AAD4AAD4AAD4AAD4"],["5",0.6154,"H///H///H//4H//4H//4HAAAHAAA/AAA/AAA/AAA///A///A///4///4///4/AA//AA/AAA/AAA/AAA/AAA/AAA/4AA/4AA/4AA//AA//AA////4///4///4A//AA//A"],["6",0.6154,"A//AA//AH//4H//4H//4HAA/HAA//AAA/AAA/AAA/AAA/AAA///A///A///A///4///4/AA//AA//AA//AA//AA//AA//AA//AA//AA//AA/H//4H//4H//4A//AA//A"],["7",0.6154,"////////////////////AAA/AAA/AAH4AAH4AAH4AAHAAAHAAA/AAA/AAA/AAA4AAA4AAH4AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA/AAA/AAA/AAA/AAA/AAA4AAA4AA"],["8",0.6154,"A//AA//AH//4H//4H//4/AA//AA//AA//AA//AA//AA//AA/H4/4H4/4H4/4H//4H//4/AH//AH//AH//AA//AA/4AA/4AA/4AA//AA//AA////4///4///4A//AA//A"],["9",0.6154,"A//AA//AH//4H//4H//4/AA//AA/4AA/4AA/4AA/4AA/4AA//AA//AA//AA/////////A///A///A///AAA/AAA/AAA/AAA/AAA//AH4/AH4H//4H//4H//4A//AA//A"],["/",0.3846,"AAAfAAAfAAAfAAAfAAAfAAPgAAPgAAPgAAPgAAPgAAPgAAPgADwAADwAADwAADwAADwAADwAADwAADwAB8AAB8AAB8AAB8AAB8AAB8AAB8AA+AAA+AAA+AAA+AAA+AAA"],["0",0.6842,"Af+AAf+AA//AD4HwD4HwPgB8PgB8PAB8/AA8/AA8/AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA8/AA8PAB8PgB8PgB8D4HwD4HwD//AAf+AAf+A"],["1",0.3,"AAAPAAAPAAD/AAD/AAD/AA//////////////////AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/"],["2",0.6842,"Af+AAf+AD//wP4H8P4H8PgB8PgB8PAA//AA//AA/PAA/PAA/AAA8AAB8AAB8AAfwAAfwAB/AAB/AAf4AA/gAA/gAD4AAD4AAPgAAPAAAPAAA/AAA/AAA////////////"],["3",0.6842,"A/+AA/+AD//wP4HwP4HwPAB8PAB8/AB8/AB8/AB8AAB8AAB8AAHwAH/AAH/AAH/wAH/wAAH8AAH8AAA8AAA/AAA/8AA/8AA//AA8/AB8/AB8PgH8PgH8D//wA/+AA/+A"],["4",0.65,"AAHAAAHAAAHAAAfAAAfAAB/AAH/AAH/AAHnAAHnAAeHAA+HAA+HAA4HADgHADgHAPgHAPgHA/AHA8AHA8AHA////////////AAHAAAHAAAHAAAHAAAHAAAHAAAHAAAHA"],["5",0.6842,"D//8D//8D//8DgAADgAAPgAAPgAAPgAAPAAAPAAAPf+APf+AP//wP4H8P4H8PAB8PAB8AAA/AAA/AAA/AAA/AAA/AAA/AAA//AA//AB8/AB8P4HwP4HwD//wA/+AA/+A"],["6",0.6842,"Af+AAf+AA//wD+H8D+H8PgB8PgB8PgA8PAAAPAAA/AAA/AAA/f/A///w///w/4H8/4H8/gA8/gA8/AA//AA//AA//AA//AA/PAA/PgB8PgB8D4H8D4H8D//wAf+AAf+A"],["7",0.6842,"////////////AAA/AAA/AAA8AAA8AABwAAHwAAHwAAHAAAHAAAfAAAeAAAeAAB4AAB4AAB4AAB4AAH4AAHgAAHgAAfgAAfgAAeAAAeAAAeAAA+AAA+AAA+AAA4AAA4AA"],["8",0.6842,"Af+AAf+AD//wP4HwP4HwPgB8PgB8PAA8PAA8PAA8PgB8PgB8P4HwA//AA//AD//wD//wP4H8P4H8/AA8/AA//AA//AA//AA//AA//AA8/AA8P4H8P4H8D//wAf+AAf+A"],["9",0.6842,"Af+AAf+AD//AP4HwP4HwPAB8PAB8/AA8/AA8/AA8/AA//AA//AA//AB//AB/P4H/P4H/D///D///A/4/AAA/AAA/AAA8AAA8PAB8PAB8PAB8P4fwP4fwD//AA/4AA/4A"],["/",0.4,"AAA/AAA/AAA4AAH4AAH4AAH4AAHAAAHAAA/AAA/AAA/AAA4AAA4AAH4AAH4AAH4AAHAAAHAAA/AAA/AAA/AAA4AAH4AAH4AAH4AAH4AAHAAA/AAA/AAA/AAA/AAA/AAA"],["0",0.6,"AP8AB//gD//wH4f4HwD4fgB+fgB++AAe+AAe+AAf+AAf+AAf+AAf8AAP8AAP8AAP8AAP8AAP8AAP+AAf+AAf+AAf+AAfeAAeeAAefgB+fgB+HwD4H4H4D//wB//gAP8A"],["1",0.3448,"AAB/AAB/AAB/AAP/AA//AA//B///////////AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/"],["2",0.6552,"AH/AA//wD//4D8H+H4A/H4A/HwAffAAffAAPfAAPfAAPAAAfAAAfAAA+AAD+AAH4AAH4AAfwAD/gAH8AA/wAB/gAD8AAH4AAHwAAfAAAfAAAfAAAf///f///////////"],["3",0.6333,"AP8AB//gD//4H8H4HwD+fAA+fAA+fAAefAAefAAeAAAeAAA+AAD+AAf4AD/wAD/wAD/4AAD+AAA/AAAfAAAfAAAf+AAf+AAf+AAfeAAffAA/fwA+H8H+D//4B//gAP8A"],["4",0.6897,"AADgAAPgAAfgAA/gAA/gAA/gAB/gAD/gADvgAPPgAfPgAePgA8PgB8PgDwPgDgPgDgPgPgPgfAPgeAPg+APg////////////AAPgAAPgAAPgAAPgAAPgAAPgAAPgAAPg"],["5",0.6552,"H//4H//4H//4H//4HAAAHAAAHAAAfAAAfAAAfAAAeAAAeP8Af//gf//w/wP4/AD4/AD4eAA+AAA+AAA+AAAfAAAfAAAe8AAe8AA++AA+/AD4/AD4f4PwH//wD//AA/4A"],["6",0.6333,"AH8AA//gB//wD8PwHwD4fAA4fAA+eAAYeAAY+AAA+AAA+AAA+H8A8//g///w/8P4/wD4/AA++AA++AAe+AAf+AAf+AAe+AA++AA+eAA+fAA+HwD4H8P4D//wB//AAP8A"],["7",0.6786,"///////////////+///+AAA+AAA4AADwAAHwAAHgAAPAAAfAAAfAAAcAAB8AAB4AAD4AADwAAHwAAHgAAHgAAPgAAPgAAOAAA+AAA+AAA8AAB8AAB8AAB8AAB8AAB4AA"],["8",0.6667,"AP8AA//AD//wD8PwPgB8PgB8fAA8fAA+fAA+fAA8PgB8PgB8D8PwB//gA//AB//gP8PwPgB8fAA+fAA+eAAe+AAf+AAfeAAeeAAefAA+fAA+PgB8P8P8D//wB//gAf+A"],["9",0.6333,"AH8AA//gD//wH8P4HwD4fAA+fAAefAAffAAfeAAf+AAf+AAfeAAffAAffAA/HwD/H8P/D///B//PAP4fAAAfAAAfAAAfGAAeGAAefAA+HAA+HwD4D8PwD//wB//AAP4A"],["/",0.3667,"AAAPAAAPAAB/AAB8AAB8AAH8AAHwAAHwAAHwAAfwAAeAAAeAAB+AAB4AAB4AAH4AAH4AAHgAAHgAAfgAAeAAAeAAD+AAD4AAD4AAD4AAP4AAPgAAPgAA/gAA8AAA8AAA"],["0",0.6923,"AP/gAP/gB//4B//4B//4H+D/H+D/HwD/HwD/HwD/HwAfHwAf/wAf/wAf/wAf/wAf/wAfHwAfHwAfHwAfHwAfHwAfHwD/HwD/HwD/H+D/H+D/B//4B//4B//4AP/gAP/g"],["1",0.4615,"AAD/AAD/AA//AA//AA//D///D///////////////AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//"],["2",0.6154,"A//AA//A///4///4///4/4H//4H//AH//AH//AH//AA//AA/AAH/AAH/AAH/AA//AA//AH/4AH/4AH/4A/4AA/4AH/AAH/AAH/AA/4AA/4AA////////////////////"],["3",0.6154,"H//AH//A///4///4///4/4H//4H//AH//AH//AH/AAH/AAH/AH/4AH/4AH/4AH/4AH/4AAH/AAH/AAH/AAA/AAA//AA//AA//AA//4H//4H////4///4///4A//AA//A"],["4",0.6923,"AAf4AAf4AB/4AB/4AB/4AB/4AB/4AP/4AP/4AP/4B+f4B+f4B+f4B+f4B+f4Hwf4Hwf4Hwf4Hwf4Hwf4////////////////////AAf4AAf4AAf4AAf4AAf4AAf4AAf4"],["5",0.6154,"H///H///H///H///H////4AA/4AA/AAA/AAA/AAA///A///A///4///4///4/4H//4H/AAA/AAA/AAA/AAA/AAA//AH//AH//AH//4H//4H////4///4///4H//AH//A"],["6",0.6923,"AP/gAP/gB///B///B///H+D/H+D/HwAAHwAAHwAAHx/gHx/gH///H///H////+D//+D/HwAfHwAfHwAfHwAfHwAfHwAfHwAfHwAfH+D/H+D/B//4B//4B//4AP/gAP/g"],["7",0.7692,"////////////////////AAP8AAP8AAPgAAPgAAPgAA/gAA/gAA+AAA+AAA+AAD+AAD+AADwAADwAADwAAfwAAfwAAfwAAfwAAfwAAfAAAfAAAfAAAfAAAfAAB/AAB/AA"],["8",0.6923,"AP/gAP/gH//4H//4H//4H+D/H+D/HwAfHwAfHwAfHwD/HwD/B//4B//4B//4B//4B//4H+D/H+D/H+D//wAf/wAf/wAf/wAf/wAfH+D/H+D/H///H///H///AP/gAP/g"],["9",0.6923,"AP/gAP/gH//4H//4H//4H+D/H+D/HwD/HwD/HwD//wAf/wAfHwD/HwD/HwD/H+D/H+D/H///H///H///B///B///AAD/AAD/AAD/H+D/H+D/H//4H//4H//4B//gB//g"],["/",0.3846,"AAP/AAP/AAP/AAP/AAP/AAPgAAPgAAPgAAPgAAPgAD/gAD/gADwAADwAADwAADwAADwAADwAADwAADwAB/wAB/wAB8AAB8AAB8AAB8AAB8AA/8AA/8AA/8AA+AAA+AAA"],["-",1.6667,"////////////////////////////////////////////////////////////////////////////////////B///B///B///B///B///B///B///B///B///B///B///"],["0",0.6842,"Af+AAf+AD//wP//wP//wP4f8P4f8/gH8/gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gB//gH8P+f8P+f8P//wP//wD//wAf+AAf+A"],["1",0.4211,"AAH/AAH/AAH/AH//AH//////////////////////AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//"],["2",0.6842,"A/+AA/+AD//wP//8P//8/4H8/4H8/gB//gB//gB//gB//gB/AAB/AAH8AAH8AAf8AAf8AB/wAB/wAf/AA/4AA/4AD/gAD/gAP+AA/4AA/4AA////////////////////"],["3",0.6842,"A/+AA/+AD//wP//8P//8/4f8/4f8/gH8/gH8/gH8AAH8AAH8AAfwAH/AAH/AAH/wAH/wAAf8AAf8AAH/AAB/AAB//gB//gB//gB//4f8/4f8P//8P//8D//wA/+AA/+A"],["4",0.6842,"AB/wAB/wAB/wAH/wAH/wAH/wAH/wAf/wA+fwA+fwA+fwA+fwD4fwDgfwDgfwPgfwPgfw/Afw/Afw/Afw////////////////////AAfwAAfwAAfwAAfwAAfwAAfwAAfw"],["5",0.6842,"D//8D//8D//8P//8P//8P4AAP4AAPgAAPgAAPgAAPn+APn+AP//w///8///8/4H8/4H8AAB/AAB/AAB/AAB/AAB//AB//AB//gH//4f8/4f8P//8P//8D//wA/+AA/+A"],["6",0.6842,"Af/AAf/AA//wD//8D//8P4H/P4H//gAA/gAA/gAA/n/A/n/A///w///8///8/4H//4H//gB//gB//gB//gB//gB//gB//gB//gB/P+f8P+f8P//8P//8D//wAf+AAf+A"],["7",0.6842,"////////////////////AAB/AAB/AAH8AAHwAAHwAAfwAAfwAB/AAB/AAB/AAH+AAH+AAH4AAH4AAf4AAf4AAf4AAfgAAfgAA/gAA/gAA/gAA/gAA/gAA/gAA/gAA/gA"],["8",0.6842,"Af+AAf+AD//wP//8P//8/4H8/4H8/gB8/gB8/gB8PgB8PgB8P//wD//wD//wP//8P//8/4H8/4H8/gB//gB//gB//gB//gB//gB//4f//4f/P//8P//8D//wA/+AA/+A"],["9",0.6842,"A/+AA/+AD//AP//wP//w/4f8/4f8/gH8/gB//gB//AB//AB//gB//gH//gH//4f//4f/P///P///D///A/5/A/5/AAB8AAB8/gH8/4f8/4f8P//wP//wD//AA/+AA/+A"],["/",0.35,"AAAHAAAHAAB/AAB/AAB/AAB/AAP4AAP4AAP4AAP4AAP4AAOAAAOAAD+AAD+AAD+AAD+AAD+AAfwAAfwAAfwAAfwAAfwAAfwAH8AAH8AAH8AAH8AAH8AA/gAA/gAA/gAA"],["0",0.6667,"AP8AA//AB//gD//wP//8f8P8fwD+fgD+fgD+fgB+/gB+/gB+/gB//gB//gB//gB//gB//gB//gB//gB//gB//gB+fgB+fwD+fwD+fwD+f8P8P//8D//wD//gA//AAP8A"],["1",0.4286,"AAD/AAP/AAP/AD//AD//P///////////////////AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//AA//"],["2",0.6897,"Af+AB//gD//wP//8P//+P//+f8P+fwD+fgB/fgB//gB/fgB/AAB+AAD+AAP+AAf8AAf8AA/wAB/gAP/AAf+AA/wAD/gAD/AAP+AAf8AAf///f///f///////////////"],["3",0.6667,"Af8AB//AD//wP//8f//8fwP8fgD+fgD+fgD+/gD+fgD+AAP8AAP8AD/wAD/gAD/gAD/wAA/8AAP+AAD+AAB/AAB//gB//gB//gB//wD+f8P+f//+P//8D//wB//gAf+A"],["4",0.6897,"AAfgAA/wAB/wAD/wAD/wAD/wAP/wAP/wAffwA/fwA+fwB+fwB8fwDwfwDwfwPgfwPgfwfgfwfAfw+Afw////////////////////AAfwAAfwAAfwAAfwAAfwAAfwAAfw"],["5",0.6897,"D//+D//+D//+D//+D//+D//+PwAAPwAAPwAAPgAAPj+AP//gf//wf//8f//+fwP+fwP+fgD+AAB/AAB/AAB/AAB/AAB//gD+/gD+fwP+f//8f//8P//wP//wB//AAf8A"],["6",0.6667,"AP+AA//gB//wD//8D//+P8D+PwB+fwAAfwAAfgAAfgAAfgAA/j/A///w///8///+/8P+/wD+/wB//gB//gB//gB/fgB/fgB+fgB+fwD+P8P+P//8D//8B//wA//gAP+A"],["7",0.7143,"////////////////////////AAB+AAD+AAP8AAfwAAfgAA/gAA/gAA/AAB+AAD+AAD8AAP8AAP8AAPwAAPwAAfwAAfgAAfgAA/gAA/gAA/gAA/gAA/gAA/AAB/AAB/AA"],["8",0.6667,"Af8AB//AD//wP//8P//8fwD+fgB+fgB+fgB+fgB+fgB+fwD8P8P8D//wB//gD//wP//8f8P+fwD+/gB//gB//gB//gB//gB//gB//gD/f8P+f//+P//8D//wB//gAf+A"],["9",0.6667,"Af8AB//AD//gP//wf//8fwP8fgD+/gD+/gD+/gB+/gB+/gB+/gB//gD//gD/fwP/f///P///D///B/9+Afh+AAB+AAD+fgD+fgD+fgD8fwP8f//wP//wD//gB//AAf8A"],["/",0.3793,"AAB/AAB/AAH8AAH8AAH8AAH8AAHwAAfwAAfwAAfwAAeAAB+AAB+AAB+AAH4AAH4AAH4AAH4AAHgAAfgAAfgAAfgAD+AAD+AAD+AAD4AAP4AAP4AAP4AAP4AA/gAA/gAA"],["0",0.75,"AP8AAP8AAP8ABwDgBwDgHwD4HwD4HwD4GAAYGAAYGAAYGAAYGAAY+AAf+AAf+AAf+AAf+AAf+AAfGAAYGAAYGAAYGAAYGAAYHwD4HwD4HwD4BwDgBwDgAP8AAP8AAP8A"],["1",0.25,"AP8AAP8AAP8A//8A//8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8AAP8A////////////"],["2",0.5833,"H/+AH/+AH/+A/j/4/j/44AB/4AB/4AB/AAB/AAB/AAB/AAB4AAB4AAB4AAB4AAB4AAOAAAOAAAOAADwAADwAAAAAAAAAAAAAAAAAAAAAAAAAHgAHHgAH////////////"],["3",0.5833,"H/+AH/+AH/+A/gP4/gP4AAB4AAB4AAB4AAB4AAB4AAB4AAOAAAOAAf/4Af/4Af/4AAP4AAP4AAP4AAB/AAB/AAB/AAB/AAB/AAB4AAB4AAB44AB44AB4//wA//wA//wA"],["4",0.75,"AAfgAAfgAAfgAAfgAAfgAB/gAB/gAB/gAOfgAOfgAOfgAAfgAAfgBwfgBwfgBwfgGAfgGAfgGAfg4Afg4Afg////////////AAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfg"],["5",0.5833,"Af//Af//Af//H//4H//4HgAAHgAAHgAA//wA//wA//wAH/+AH/+AAAP4AAP4AAP4AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB4AAB4AAB44AP44AP4//wA//wA//wA"],["6",0.5833,"AD+AAD+AAD+AAfwAAfwAH8AAH8AAH8AA/gAA/gAA/gAA///4///4/gB//gB//gB/4AB/4AB/4AB/4AAH4AAH/gAH/gAH/gAH/gAH/gAH/gAHHgB/HgB/Af/4Af/4Af/4"],["7",0.5833,"////////////4AB/4AB/AAB4AAB4AAB4AAB4AAB4AAB4AAB4AAB4AAOAAAOAAAOAAAOAAAOAAAOAAAOAAAOAADwAADwAADwAADwAADwAADwAADwAADwAAfwAAfwAAfwA"],["8",0.5833,"H/+AH/+AH/+A/gB4/gB4/gB//gB//gB//gB4/gB4/gB4H8P4H8P4Af+AAf+AAf+AAf/4Af/4Af/4HgP/HgP//gB//gB//gB//gB//gB//gB//gB//gB/H//4H//4H//4"],["9",0.6667,"A//AA//AA//AH4A4H4A4HAA/HAA/HAA/HAA/HAA/HAA//AA//AA/H4A/H4A/H4A/H4A/H4A/H4A/A/4/A/4/AAA4AAA4AAA4AAH4AAH4AAH4AA/AAA/AAHAAAHAAAHAA"],["/",0.4167,"AAAfAAAfAAAfAAP/AAP/AAPgAAPgAAPgAAPgAAPgAAPgAD/gAD/gADwAADwAADwAADwAADwAADwAB/wAB/wAB8AAB8AAB8AAB8AAB8AAB8AA/8AA/8AA+AAA+AAA+AAA"],["0",0.6667,"A/8AA/8ADwPADwPAPADwPAD8PAD8/AA8/AA8/AA8/AA88AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA//AA8/AA8/AA8/AA8PAA8PAA8PADwDwPADwPAA/8AA/8A"],["1",0.3889,"AAOAAAOAAf+AAf+A4f+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAD+AAf+AAf+AH///H///"],["2",0.6111,"Af+AAf+AD//wD//wPgf88AH88AH8wAB8wAB8AAB8AAB8AAB8AAB8AAB8AAHwAAHwAAHwAAHwAAeAAAeAAB4AABgAABgAAGAAAGAAAYAAAYAADgADP///P///////////"],["3",0.6111,"Af+AAf+AD//wD//wMAH8wAH8wAH8AAH8AAH8AAHwAAHwAAGAAAeAAAeAAH/wAH/wAAf8AAf8AAB8AAB8AAB/AAB/AAB/AAAMAAAMAAB8AAB8AABw/4GA/4GAP/gAP/gA"],["4",0.7222,"AAHAAAHAAAHAAAHAAAfAAB/AAB/AABnAABnAAGHAAGHAAYHAA4HAA4HAAgHAAgHADAHADAHAPAHAPAHAMAHA////////////////AAHAAAHAAAHAAAHAAAHAAAHAAAHA"],["5",0.6111,"Af/8Af/8Af/8Af/8D4AADgAADgAAD4AAD4AAP/4AP/4AP/+AAB/wAB/wAAH8AAH8AAB8AAB8AAB8AAB8AAB/AAB8AAB8AAB8AAB8AAB8AAB88ABw/4eA/4eAP/gAP/gA"],["6",0.6316,"AAD8AAD8AA8AAPwAAPwAA/AAA/AAD8AAPwAAPwAAPwAAPwAA///A/w/w/w/w/AD8/AD8/AA8/AA8/AA//AA//AA//AA//AA//AA8PAA8PAA8PwA8PwA8D8DwAP8AAP8A"],["7",0.6111,"P///P///////////8AAPwAB8wAB8AAB8AAB8AAB8AAB8AAHwAAHwAAHwAAHwAAHwAAeAAAeAAAeAAAeAAAeAAB4AAB4AAB4AAB4AAB4AAB4AAHgAAHgAAHgAAHgAAHgA"],["8",0.6111,"Af+AAf+AD4H8D4H8PgB8PgB8PgB8PgB8PgB8P4B8P4B8P+HwD/+AD/+AAf+AAf+AAf/wAf/wD4f8D4f8PgH/PgB/PgB//gAP/gAPPgAPPgAPPgAPD4B8D4B8Af+AAf+A"],["9",0.5789,"Af+AAf+AD4HwPgB8PgB8/gB8/gB88AB/8AAP8AAP8AAP8AAP/gAP/gAP/gAP/gB//gB/P+H/P+H/D/5/AAB8AAB8AAH8AAH8AAHwAAeAAAeAAB4AAB4AAfgAP4AAP4AA"],["/",0.4444,"AAA/AAA/AAH4AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA/AAA/AAH4AAH4AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA/AAA/AAH4AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA/AAA"],["0",0.6429,"AP8AB+eADwDwDwDwDwDwHgB4HgB4fgB+eAAeeAAe+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAfeAAeeAAefgB+HgB4HgB4DwDwDwDwDwDwB4HgAP8A"],["1",0.4074,"AB4AAH4AD/4AD/4A//4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf4A////"],["2",0.6667,"AP4AB/+AD//gD//gHg/wcAH4cAD4YAD4gAD4AAD4AAD4AAD4AADwAADwAADgAAHgAAHgAAGAAAcAAA4AABgAABAAABAAAGAAAOAAAYAABwABDgAOH//+H//+f//4///4"],["3",0.5357,"AP8AB//gH//4OAP8OAP8IAD8wAD8wAA8AAD8AAD4AADgAAPAAAPAAAfAAD/4A//8AAf8AAD/AAA/AAAfAAAfAAAfAAAfAAAfAAAfAAAcAAAc4AA44AA4/ADg///AP/gA"],["4",0.7037,"AADgAAHgAAPgAAPgAAPgAAfgAB3gADngACHgAGHgAGHgAMHgAIHgA4HgBwHgBAHgBAHgDAHgGAHgcAHgcAHg////////////f///AAHgAAHgAAHgAAHgAAHgAAHgAAHg"],["5",0.5714,"AAADAH//Af//Af/8Af/8A4AAA4AADgAADgAAH/gAH/8AH//gH//gAf/4AA/8AAH8AAD/AAA/AAA/AAAfAAAfAAAfAAAfAAAfAAAfAAAcAAA8fAA4fAA4/gHgf/8AH/gA"],["6",0.6429,"AAB+AAfgAB8AAHgAAHgAAfAAB+AAB4AAD4AAHwAAHwAAfx+Afx+Af//wfwH4fgD4+AB++AB++AAf+AAf+AAf+AAfeAAfeAAffgAeHgAeHgAeDwB4DwB4D4DwB+HgAP8A"],["7",0.6296,"H///f///f//+f//+cAAO4AA+gAA4AAA4AAB4AAB4AAB4AABwAADwAADwAADAAAPAAAPAAAPAAAOAAAeAAAeAAAcAAAcAAB8AAB8AABwAADwAADwAADgAADgAAPgAAPgA"],["8",0.5714,"Af8AD4fgHgD4fAA8fAA8fAA8/AA8/AA8/AA8fgD4f4D4H8HgH8HgD/8AA/4AAf8AAf/AD7/gHgf4fAH8fAH8fAD88AA/8AA/8AAf/AAffAA8fAA8fAA8HgD4D8HgAf8A"],["9",0.6071,"AP8AA8PADgDwHgB4HgB4fAB+fAA+fAA//AA//AA//AA//AA//AA//AA/fgA/fgA/HwA/H8D/D/+/Afw+Afw+AAB+AAB4AAD4AAPwAAPAAAeAAB8AAB8AAPwAA+AAfgAA"],["/",0.3929,"AAAPAAB/AAB/AAB8AAB8AAH8AAH8AAHwAAfwAAfwAAeAAB+AAB+AAB+AAB4AAH4AAH4AAH4AAfgAAfgAAfgAAfgAD+AAD+AAD+AAP4AAP4AAP4AAP4AA/gAA/gAA/gAA"],["-",3.3333,"P///P///P///P///P///P///P///P///P///P///P///////////////////////////////////////////////////////////////////////////////////////"],["0",0.75,"AP8AAP8AAP8AB+fgB+fgHwD4HwD4HwD4HwD4HwD4HwD4HwD4HwD4/wD//wD//wD//wD//wD//wD/HwD4HwD4HwD4HwD4HwD4HwD4HwD4HwD4B+fgB+fgAP8AAP8AAP8A"],["1",0.5,"AP8AAP8AAP8A//8A//8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8AD/8A////////////"],["2",0.6667,"AH/AAH/AAH/AA//4A//4HA//HA//HA//AAH/AAH/AAH/AAH/AAH/AAH4AAH4AAH4AAHAAAHAAAHAAA4AAA4AAHAAAHAAAHAAA/A/A/A/A/A/H///H///////////////"],["3",0.6667,"AH/4AH/4AH/4H///H///AAH/AAH/AAH/AAH4AAH4AAH4AA/4AA/4AH//AH//AH//AA//AA//AA//AAA/AAA/AAA/AAA/AAA/HAA/HAA/HAA///A4//A4H//AH//AH//A"],["4",0.75,"AADgAADgAADgAAfgAAfgAB/gAB/gAB/gAOfgAOfgAOfgAOfgAOfgBwfgBwfgBwfgGAfgGAfgGAfgGAfgGAfg////////////////////////AAfgAAfgAAfgAAfgAAfg"],["5",0.6667,"A///A///A///A///A///A4AAA4AAA4AAA4AAA4AAA4AAH//AH//AH//4H//4H//4AA//AA//AA//AAA/AAA/AAA/AAA/AAA/HAAHHAAHHAAH//A4//A4H//AH//AH//A"],["6",0.75,"AAD4AAD4AAD4AB8AAB8AB/gAB/gAB/gAH+AAH+AAH+AAH//gH//gH+f4H+f4H+f4/wD4/wD4/wD4HwD/HwD/HwD/HwD/HwD/H+D4H+D4H+D4B+D4B+D4AP/gAP/gAP/g"],["7",0.6667,"H///H///H///H///H///H///H///H///4AA44AA44AA4AAH4AAH4AAH4AAH4AAH4AAHAAAHAAAHAAA/AAA/AAA/AAA/AAA/AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4A"],["8",0.6667,"H//AH//AH//A/AH4/AH4/AH4/AH4/AH4/4H4/4H4/4H4///A///AH//AH//AH//AH//4H//4H//4/A/4/A/4/AH//AH//AH//AH4/AH4/AH4/AH4/AH4H//AH//AH//A"],["9",0.75,"B/8AB/8AB/8AHwfgHwfgHwf4Hwf4Hwf4/wD4/wD4/wD4/wD//wD/HwD/HwD/HwD/H+f4H+f4H+f4B//4B//4AAf4AAf4AAf4AB/gAB/gAB/gAP8AAP8AHwAAHwAAHwAA"],["/",0.4167,"AAAfAAAfAAAfAAP/AAP/AAP/AAP/AAP/AD/gAD/gAD/gAD/gAD/gAD/gAD/gAD/gB/wAB/wAB/wAB/wAB/wAB/wAB/wAB/wA/8AA/8AA/8AA/8AA/8AA+AAA+AAA+AAA"],["0",0.6667,"AP8AAP8AD8PAD8PAPwPwPwP8PwP8/wP8/wP8/wP8/wP8/wP//wP//wP//wP//wP//wP//wP//wP//wP//wP//wP8/wP8/wP8/wP8PwP8PwP8PwPwD8PAD8PAAP8AAP8A"],["1",0.5556,"AA+AAA+AAf+AAf+A//+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+AAf+A////////"],["2",0.7222,"AH+AAH+AA//AA//AD//wDB/8DB/8MAf8MAf8AAH8AAH8AAH8AAHwAAHwAAfwAAfwAAfAAAfAAB+AAB+AAB4AAHgDAHgDAYADAYADA///A///D//8P//8P//8///8///8"],["3",0.7222,"AH/AAH/AA//wA//wDh/wMAf8MAf8AAf8AAf8AAfwAAfwAAfAAB/wAB/wAf/8Af/8AB/8AB/8AAH/AAH/AAB/AAB/AAB/AAB8AAB8PAB8PAB8/4BwP//AP//AD/4AD/4A"],["4",0.7222,"AAHwAAHwAAHwAAHwAAfwAB/wAB/wAH/wAH/wAefwAefwAYfwAgfwAgfwDgfwDgfwPAfwPAfwMAfwMAfw////////////////////AAfwAAfwAAfwAAfwAAfwAAfwAAfw"],["5",0.6667,"A///A///D//8D//8D//8D//wD//wDAAADAAAPAAAPAAAP/8AP//AP//A///w///wA//8A//8AAP8AAP8AAD8AAA8AAA8AAA8AAA8/AAw/AAw/wDw///A///AP/wAP/wA"],["6",0.6667,"AAA/AAA/AA/AAA/AAP8AA/wAA/wAD/AAD/AAP8AAP8AAP8AA///A///A/w/8/w/8/wP8/wP8/wP//wP//wD//wD//wD//wD//wD/PwD8PwD8PwD8D8PwD8PwA/8AA/8A"],["7",0.7222,"P///P///P//8P//8P//8P//8P//8MABwMABwwABwwABwAAHwAAHAAAHAAAfAAAfAAAfAAAfAAAeAAAeAAB+AAB+AAB+AAB4AAB4AAH4AAH4AAHgAAfgAAfgAAfgAAfgA"],["8",0.6667,"A//AA//APwPwPwPwPwD8/wD8/wD8/wD8/wD8/8D8/8D8P//wP/8AP/8AD//AD//AA//wA//wPz/8Pz/8/AP//AP//AP//AD//AD//AD8/AD8/AD8PwPwPwPwA/8AA/8A"],["9",0.6667,"A/8AA/8ADwPADwPAPwPw/wP8/wP8/wP8/wP8/wP//wP//wP//wP//wP//wP//wP/P8P/P8P/D//8D//8AAP8AA/wAA/wAA/wAA/wAD/AAD/AAPwAD/AAD/AA/AAA/AAA"],["/",0.5,"AAD/AAD/AAD/AAD/AAD4AAf4AAf4AAf4AAf4AAfgAAfgAB/gAB/gAB/gAB8AAB8AAP8AAP8AAP8AAP8AAPgAB/gAB/gAB+AAB+AAH+AAH+AAH+AAHwAAHwAA/wAA/wAA"],["0",0.6207,"AH4AAeeAB4HgD4HwH4H4H4H4H4H4fwD+fwD+fwD+/wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD/fwD+fwD+fwH+H4H4H4H4H4H4D4HwB4HgAeeAAP8A"],["1",0.5357,"AAcAAD8AA/8AH/8AH/8A//8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA/8AA//AA//AA//AB//g////"],["2",0.6429,"AP8AAf/gD//wD//wD//wH//4eA/4cAf44Af4AAH4AAH4AAH4AAH4AAH4AAfwAAfgAAfgAA+AAB8AAB4AAB4AAHgAAPABAeABAYAHBwAfD//+H//+H//+f//+///+///+"],["3",0.6207,"AP+AB//gD//wHn/4EA/4EA/4YAf4AAf4AAf4AAfwAAfwAA+AAB/gAP/wAf/4AH/+AH/+AA/+AAf/AAH/AAD/AAB/AAB/AAB+AAB++AB4/wB4/wB4/4Dw/+Hgf/8AH/gA"],["4",0.6429,"AAD4AAH4AAf4AAf4AAf4AA/4AB/4AHf4AGf4AOf4AYf4Bwf4Bwf4Bwf4Dgf4GAf4GAf4cAf44Af4////////////////////////AAf4AAf4AAf4AAf4AAf4AAf4AAf4"],["5",0.6429,"Af//B//+B//+B//+B//+B//4DgAADgAACAAAHwAAH/4AH/+AH/+AH//gf//wf//4B//4AA/+AAH+AAD+AAD+AAB+AAB+AAAeAAAYeAAY/wBw/4Dw/4Dw///gf/8AH/gA"],["6",0.6207,"AAAfAAH+AA/gAH8AAP4AAP4AAfgAB/gAD/AAD+AAH+AAf+AAf//gf//w/4f4/4H+/4H+/4H+/wH//wD//wD//wD//wD/f4D/f4D/f4D+H4D+H4D+H4D4D4HwB+HgAP8A"],["7",0.6667,"f///f///f//+f//+f//+///+///44AD4gAD4gADwgADwAAHwAAHgAAHgAAfgAAeAAAeAAA+AAA+AAA8AAB8AAB8AAB8AAB4AAH4AAH4AAPgAAPgAAPgAAPgAAfAAAfAA"],["8",0.6207,"AP+AB+fwH4H4HwD+fwD+fwD+fwD+fwD+f4D+f+D+f/D4f/nwH/+AD/+AB//gAf/wAf/wAf/4D5/+Hw/+fwf/fgH//gD//gD//gD//gD+fgD+fgD+fwD4HwH4D+fgAf8A"],["9",0.6207,"AP8AB4fgD4HwHwH4fwH4fwH4fwH+/wH+/wH+/wD//wD//wD//wD//4H/f4H/f4H/f4H/H+H/D//+B//+AAf+AAf4AAf4AA/wAA/gAB+AAH8AAH8AAP4AB/AAf4AA+AAA"],["/",0.4483,"AAB/AAB/AAB8AAH8AAH8AAH8AAHwAAfwAAfwAAfAAB/AAB/AAB+AAH+AAH+AAH4AAH4AAf4AAf4AAfgAA/gAA/gAA+AAD+AAD+AAD4AAP4AAP4AAP4AAP4AA/gAA/gAA"],["-",2.0,"///8///8///8///8///8///8////////////////////////////////////////////////////////////////////////////////////////////////////////"],["0",0.7692,"AD/gAD/gAf//Af//Af//B/B/B/B/B8B/B8B/B8B/P8B/P8B/P8B/P8B/P8B/P8B/P8B/PgB8PgB8PgB8/gP8/gP8/gP8/gP8/gP8P8/gP8/gP/+AP/+AP/+AB/wAB/wA"],["1",0.4615,"AAAPAAAPAAD/AAD/AAD/D///D///////////////AA//AA//AA/wAA/wAA/wAA/wAA/wAP/wAP/wAP/wAP/wAP/wAP/wAP/wAP/wAP8AAP8AAP8AAP8AAP8AD/8AD/8A"],["2",0.7692,"AD/8AD/8Af//Af//Af//B/B/B/B/B8AfB8AfB8AfB8B/B8B/AAB/AAB/AAB/AAP8AAP8AD/gAD/gAD/gAfwAAfwAP/AAP/AAP/AAP8AAP8AA///8///8///8///g///g"],["3",0.7692,"AD/8AD/8Af//Af//Af//B/B/B/B/B8B/B8B/B8B/AAB/AAB/AA/8AA/8AA/8AD/8AD/8AAP8AAP8AAP8AAP8AAP8/gP8/gP8/gP8/8/8/8/8P//gP//gP//gB/wAB/wA"],["4",0.7692,"AAP/AAP/AAP/AAP/AAP/AA/8AA/8AD/8AD/8AD/8AfP8AfP8B8P8B8P8B8P8B8P8B8P8PgPgPgPgPgPg///8///8///8///8///8AA/gAA/gAA+AAA+AAA+AAA+AAA+A"],["5",0.8462,"Af//Af//Af/8Af/8Af/8AeAAAeAAD4AAD4AAD4AAD/+AD/+AP//wP//wP//wP4fwP4fwAAHwAAHwAAHwAAfwAAfw/gfw/gfw/gfw/h+A/h+A//+A//+A//+AD/gAD/gA"],["6",0.7692,"AA/8AA/8Af//Af//Af//B/B/B/B/B8AAB8AAB8AAP//gP//gP//8P//8P//8P8P8P8P8PgB8PgB8PgB8PgB8PgB8/gP8/gP8/gP8P8/gP8/gP//gP//gP//gB/wAB/wA"],["7",0.7692,"P///P///P///P///P///AAP8AAP8AAPgAAPgAAPgAA/gAA/gAD+AAD+AAD+AAfwAAfwAAfAAAfAAAfAAB/AAB/AAB8AAB8AAB8AAP8AAP8AAPgAAPgAAPgAA/gAA/gAA"],["8",0.7692,"AD/8AD/8Af//Af//Af//B/B/B/B/B8AfB8AfB8AfB8B/B8B/B//8B//8B//8B//gB//gP8P8P8P8P8P8/gB8/gB8/gP8/gP8/gP8/8/8/8/8P//gP//gP//gB/wAB/wA"],["9",0.7692,"AD/gAD/gAf/8Af/8Af/8B/B/B/B/B8B/B8B/B8B/P8B/P8B/P8B/P8B/P8B/P8P/P8P/B//8B//8B//8B//8B//8AAP8AAP8AAP8/g/g/g/gP/+AP/+AP/+AB/wAB/wA"],["/",0.5385,"AAAHAAAHAAAHAAAHAAAHAAB4AAB4AAB4AAB4AAB4AAOAAAOAAAOAAAOAAAOAADwAADwAADwAADwAADwAAfwAAfwAAcAAAcAAAcAAH8AAH8AAHgAAHgAAHgAA/gAA/gAA"],["-",2.0,"D///D///D///D///D///D///D///D///D///D///D//////w///w///w///w///w///w///w///w///w///wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//wD//w"],["0",0.7895,"AB/gAB/gAP/4A//8A//8B+D8B+D8H8D/H8A/H8A/HwA/HwA/PwD8PwD8PwD8PwD8PwD8/wD8/wD8/AP8/AP4/AP4/AP4/AP4/Afg/x/g/x/gP//AP//AP/8AB/gAB/gA"],["1",0.4737,"AAD/AAD/AAf/AB//AB/////////////4///4///4AB/4AB/4AB/4AB/4AB/4AP/gAP/gAP/gAP/gAP/gAP/gAP/gAP8AAP8AB/8AB/8AB/8AB/8AB/8AB/8AH/gAH/gA"],["2",0.8421,"AD/gAD/gAH/8Af/8Af/8A/D/A/D/D8A/D8A/D8A/D4A/D4A/AAD8AAH8AAH8AAf4AAf4AA/gAA/gAH8AA/4AA/4AD/AAD/AAH8AAf4AAf4AAf//gf//g///g///g///g"],["3",0.7895,"AD/gAD/gA//8B//8B//8B+D/B+D/H8D/H8D8H8D8AAD8AAD8AAP4AD/gAD/gAD/gAD/gAB/4AB/4AAP4AAP4AAP4/AP4/AP4/Af4/x/g/x/g///A///AP/8AH/wAH/wA"],["4",0.7368,"AAH/AAH/AAP/AAP/AAP/AA//AA//AD/8AH38AH38AfH8AfH8AfH8B8H4B8H4H4P4H4P4PgP4PgP4+AP4///////////8///8///8AA/gAA/gAA/gAA/gAA/gAD+AAD+A"],["5",0.7895,"AP//AP//A///A///A///A+AAA+AAB8AAB8AAB8AAH//AH//AH//gH//4H//4P8P4P8P4AAP4AAP4AAP4AAP4AAP4+AP4+AP4/Afg/x/g/x/g///A///AP/8AH/gAH/gA"],["6",0.7895,"AB/4AB/4AP/8A///A///B/g/B/g/B8AAH8AAH8AAHx/AHx/AP//4P//4P//4P8P4P8P4PwP8PwP8/AD8/AP4/AP4/AP4/AP4/Afg/9/g/9/gP//AP//AH/8AB/gAB/gA"],["7",0.7368,"P///P///////////////AAH8AAH8AAP4AA/gAA/gAA+AAA+AAD+AAH4AAH4AAfwAAfwAB/AAB/AAB/AAH8AAH8AAH8AAH8AAP4AAP4AAP4AA/gAA/gAA/gAA/gAA/gAA"],["8",0.7895,"AD/gAD/gAP/8A//8A//8B+D/B+D/H8A/H8A8H8A8H8D8H8D8B//4A//gA//gH//4H//4P8P4P8P4/AP8/AD8/AD8/AP4/AP4/AP4/x/g/x/g///A///AP/8AB/wAB/wA"],["9",0.7895,"AD/gAD/gAP/4B//8B//8B+D8B+D8H8A8HwA/HwA/PwA8PwA8PwD8PwD8PwD8P8f8P8f8H//8H//8H//4B/v4B/v4AAP4AAP4+Afg/z/A/z/A///A///AP/wAH/gAH/gA"],["/",0.55,"AAADAAADAAAPAAAPAAAPAAB8AAB8AAB8AAHwAAHwAAHwAAeAAAeAAAeAAB4AAB4AAB4AAB4AAHgAAHgAAHgAAeAAAeAAAeAAD4AAD4AAD4AAPgAAPgAAPgAA8AAA8AAA"],["-",2.0,"///////////////////////////////////////////////////////////////////////////////////////////////////4///4///4///4///4///4///4///4"],["0",0.7333,"AB/gAH/4AP/8Af/+B//+D+D+D+D+H8B/H8B/H8B/H4B/P4B+P4D+PwD+fwD+fwD+fwD+fwH8fgH8/gH8/gH8/gP4/gP4/gPw/gPw/gfw/w/gf//gf/+AP/8AH/wAB/AA"],["1",0.5,"AAB/AAH/AAP/AD/8AD/8H//8///8///8///8///4AD/4AD/4AD/4AD/4AD/gAD/gAH/gAH/gAH/gAH+AAH+AAf+AAf+AAf+AAf+AAf4AB/4AB/4AB/4AB/4AB/4AB/wA"],["2",0.8276,"AA/wAD/8AP/+Af/+Af//Af//A/B/A+A/B+A/B8A/B8A/B8A+AAB+AAD+AAH8AAP4AAP4AAfwAB/gAD+AAP8AAfwAB/gAD+AAH8AAP4AAP//wP//wf//wf//wf//w///w"],["3",0.7333,"AB/gAP/4Af/8B//+D//+D+D/H8D/H8D+H8D+H4D+H4D+AAH8AAP4AB/4AD/gAD/wAH/4AB/4AAP8AAH8AAH8AAH8+AP4/gP4/gP4/gf4/w/w///w///gf/+AP/4AD/gA"],["4",0.7586,"AAB+AAD/AAH/AAP+AAf+AAf+AA/+AB/+AB7+ADz8AHn8APH8AfH8AeH4B8H4D4P4D4P4HwP4PwP4PgPwf//+f//+f//+///+///8AA/gAA/gAA/gAA/gAA/gAA+AAB+A"],["5",0.8276,"AP//AP/+Af/+Af/+Af/+Af/+A+AAA8AAB8AAB4AAB5+AD//gD//wD//wH//4H4P4H4P4HwH4AAH4AAH4AAH4AAHwAAPw/APw/Afg/g/gf//Af//Af/+AP/8AH/wAB/AA"],["6",0.7333,"AA/wAD/8AH/+AP/+Af//B/B/D+B/D8AAD8AAH8AAH4AAH4IAP7/gP//wP//4f//8f8P8f4H8fwH8fgH8fgH8/gH8/gH4/gP4/gP4/gfwfw/wf//gf/+AP/8AH/4AB/gA"],["7",0.7857,"P///P///f///f///f///f//+AAD8AAH4AAPwAAfgAA+AAB8AAB8AAD8AAH4AAPwAAPgAAfgAB/AAB+AAB+AAD+AAD8AAH8AAH4AAP4AAPwAAfwAAfwAAfwAAfgAA/gAA"],["8",0.7667,"AB/gAH/4AP/8Af/+A///B+A/B8A/D8A/D8A/D4A+D4A+D8B8B+D8A//wA//gB//wD//4H4H8PwD8fgD8fgD8fAD8/AD8/AH4/AH4/gH4/wfwf//wf//gP//AH/8AB/wA"],["9",0.7,"AB/gAH/4Af/+A//+A///B+B/H8A/H4A/H4A/P4A/P4A/P4A/PwB/PwB/P4D/P4H/P///P//+H//+B/7+Afz8AAH8AAH4/AH4/AH4/APg/h/g///A//+Af/8AP/4AB+AA"],["/",0.5862,"AAAPAAAOAAA+AAA4AAB4AAB4AABwAADwAADAAAPAAAOAAAeAAAcAAB8AABwAADwAADwAADgAAPgAAOAAAeAAAcAAA8AAAwAADwAADgAAHgAAHgAAHAAAfAAAcAAA8AAA"],["-",2.4,"P///P///P///P///P///P//////////////////////////////////8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8"],["0",0.75,"AB/gAB/gAB/gAPgYAPgYB+AYB+AYB+AYH+D/H+D/H+D/H+D/H+D/HwD4HwD4HwD4/wD4/wD4/wD4/wf4/wf4/wf4/wf4/wf4+Afg+Afg+AfgGB8AGB8AB/gAB/gAB/gA"],["1",0.5833,"AAB/AAB/AAB/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP/AAP4AAP4AAP4AAP4AAP4AD/4AD/4AD/4AD/4AD/4AD+AAD+AAD+AAf+AAf+AAf+AAf+AAf+A///4///4///4"],["2",0.6667,"AH/4AH/4AH/4A///A///HAH/HAH/HAH/AAH/AAH/AAH/AAH/AAH/AAH4AAH4AAH4AA/AAA/AAA/AAH4AAH4AA/AAA/AAA/AAH4A4H4A4H4A4///4///4///A///A///A"],["3",0.6667,"AH/4AH/4AH/4A/H/A/H/AAA/AAA/AAA/AAA/AAA/AAA/AAH4AAH4AH/4AH/4AH/4AA/4AA/4AA/4AAH4AAH4AAH4AAH4AAH4AAH4AAH4AAH4/A/A/A/A//4A//4A//4A"],["4",0.75,"AAAfAAAfAAAfAAD/AAD/AAf4AAf4AAf4ABj4ABj4ABj4AOf4AOf4Bwf4Bwf4Bwf4GAfgGAfgGAfg///4///4///4///4///4AB8AAB8AAB8AAB8AAB8AAP8AAP8AAP8A"],["5",0.75,"AP//AP//AP//AP/4AP/4BwAABwAABwAAB+AAB+AAB+AAB/8AB/8AAP/gAP/gAP/gAB/gAB/gAB/gAAfgAAfgAAfgAAfgAAfgAAfgAAfgAAfg+AcA+AcA//gA//gA//gA"],["6",0.75,"AAAfAAAfAAAfAAfgAAfgAP8AAP8AAP8AB/gAB/gAB/gAH/8AH/8AH+f4H+f4H+f4HwD4HwD4HwD4/wf4/wf4/wf4/wf4/wf4/wfg/wfg/wfgHwfgHwfgB/8AB/8AB/8A"],["7",0.6667,"H///H///H///H///H///4AA44AA44AA4AAH4AAH4AAH4AA/AAA/AAA4AAA4AAA4AAH4AAH4AAH4AAHAAAHAAA/AAA/AAA/AAH4AAH4AAH4AAH4AAH4AA/AAA/AAA/AAA"],["8",0.75,"AP/gAP/gAP/gB+AYB+AYB+AfB+AfB+AfB+AYB+AYB+AYB/jgB/jgAP8AAP8AAP8AB//gB//gB//gGAfgGAfg+Af4+Af4+Af4+Afg+Afg+Afg+Afg+AfgH/8AH/8AH/8A"],["9",0.75,"AP/gAP/gAP/gB+D4B+D4H+D4H+D4H+D4H+D/H+D/H+D/HwD/HwD/HwD4HwD4HwD4H+f4H+f4H+f4B//4B//4AB/gAB/gAB/gAP8AAP8AAP8AB+AAB+AA+AAA+AAA+AAA"],["/",0.5833,"AAB/AAB/AAB/AAB/AAB/AAP4AAP4AAP4AAP4AAP4AAP4AD+AAD+AAD+AAD+AAD+AAfwAAfwAAfwAAfwAAfwAH8AAH8AAH8AAH8AAH8AAH8AA/gAA/gAA/gAA/gAA/gAA"],["0",0.7222,"AAfwAAfwAH48AH48Afg8A/g/A/g/A+A/A+A/D+A/D+A/D4B/P4B/P4B/P4B/P4B/P4B/P4B/PgH8PgH8/gH8/gHw/gHwPgfwPgfwPAfAPAfAPAeADh4ADh4AA/gAA/gA"],["1",0.6111,"AAAPAAAPAH//AH//AAH/AAH8AAH8AAf8AAf8AAf8AAf8AAf8AAfwAAfwAB/wAB/wAB/wAB/wAB+AAB+AAH+AAH+AAH+AAH+AAH+AAH4AAH4AAf4AAf4AAf4A///w///w"],["2",0.7222,"AB/wAB/wAH/8AH/8Af//AgB/AgB/AAB/AAB/AAB/AAB/AAB/AAB8AAB8AAHwAAHwAAHAAAHAAAeAAAeAAB4AAHgAAHgAAeAMAeAMA4A8A4A8D//wP//wP//w///A///A"],["3",0.6667,"AA/wAA/wAP/8AP/8A8D/AwD/AwD/AAD/AAD/AAD/AAD/AAP8AA/AAA/AAP/wAP/wAA/8AA/8AAP8AAP8AAP8AAD8AAD8AAP8AAP8MAPwMAPw/APA/w8A/w8AP/AAP/AA"],["4",0.7778,"AAAfAAAfAAB8AAB8AAH8AAP8AAP8AA/4AA/4AD34AD34AHP4AcP4AcP4BgPgBgPgGA/gGA/gIA/gIA/g///4///4///4///4///4AD+AAD+AAD4AAH4AAH4AAH4AAH4A"],["5",0.7222,"AH//AH//AH//AH//Af/8AYAAAYAAA4AAA4AAA/gAA/gAD/+AD//AD//AAH/wAH/wAAfwAAfwAAHwAAHwAAHwAAHwAAHwAAHwAAHwMAHAMAHA/AeA/h4A/h4AP+AAP+AA"],["6",0.7222,"AAA/AAA/AAfwAAfwAB+AAf4AAf4AA/gAA/gAD+AAD+AAD+AAP/+AP/+AP4fAP4fA/gfw/gfw/gfw/gfw/gfw/Afw/Afw/Afw/Afw/B/A/B/A/B+APH4APH4AD/gAD/gA"],["7",0.6667,"D///D///P//8P//8P//88ADw8ADwwAPwwAPwAAPAAAPAAA/AAA8AAA8AADwAADwAAPwAAPwAAPAAAPAAA/AAA8AAA8AAD8AAD8AAPwAAPwAAPAAA/AAA/AAA8AAA8AAA"],["8",0.7222,"AB/AAB/AAfh8Afh8AeA/A+A/A+A/A+A/A+A/A/g8A/g8A/5wAf/AAf/AAH/AAH/AA//AA//ADgfwDgfwPAfw/AHw/AHw/AHw/AHw/AHw/AHw/AHAPgfAPgfAA/4AA/4A"],["9",0.7222,"AH/AAH/AAfh8Afh8A+A8D+A/D+A/D+B/D+B/P4B/P4B/P4B/P4B/P4B/D4H8D4H8D4H8D4H8A//wA//wAAfwAB/AAB/AAH+AAH+AAf4AAf4AA/gAP4AAP4AA8AAA8AAA"],["/",0.6111,"AAAPAAAPAAB/AAB/AAB8AAH8AAH8AAHwAAHwAAfwAAfwAAeAAB+AAB+AAB4AAB4AAH4AAH4AAHgAAHgAAfgAAeAAAeAAD+AAD+AAD4AAD4AAP4AAPgAAPgAA/gAA/gAA"],["0",0.6207,"AA/gAH54APgYAfgeAfAeAfAeB/AfD+AfD+B/H+B/H4B/f4B/f4B/fwD//wD//wD//wD//wD+/gH+/gH+/gH+/gH4/gf4+Afw+Afw+A/g+A/g+A/geB+AeB8AHn4AB/AA"],["1",0.6071,"AAAPAAf+AP/+AAP+AAP+AAP+AAP4AAP4AAf4AAf4AAfwAAfwAAfwAB/wAB/AAB/AAD/AAD/AAD+AAD+AAD+AAP+AAP+AAP8AAP8AAf8AAf8AAfwAAfwAA/wAD/8A///w"],["2",0.6786,"AB/gAD/wAP/4A//+A//+A4H/BwD/BAD/AAD/AAD/AAD+AAD+AAD+AAD+AAH4AAHwAAPgAAfAAAcAAB4AAB4AADwAAHgAAOAGA8AIB4AYD//4H//wH//wf//w///g///g"],["3",0.6552,"AAfwAD/4AH/+AMH/AID/AID/AwA/AAA/AAA/AAD+AAD+AAHwAAfgAD/gAP/wAB/4AB/4AAf4AAP4AAH4AAH4AAH4AAH4AAH4AAHwEAHwfAPgfAPg/wPAfwcAf/4AD+AA"],["4",0.75,"AAAHAAAfAAA/AAB+AAB+AAD+AAH+AAP8AAb8ABz8ADn8AGH4AGH4AOH4AcH4A4P4AwPgBgPgHAPgOAfgOAfgf//8f//8f//8///4AB+AAB+AAD+AAD+AAD8AAD8AAD8A"],["5",0.6786,"AD//AH//AH//AH/+AH/+AMAAAIAAA4AAA4AAB/wAB/8AB//AB//AD//gAP/gAD/wAAfwAAPwAAPwAAH4AAH4AAHwAAHwAAHwAAHwcAHg+APA/AfA/AfA/B4A//wAH+AA"],["6",0.6552,"AAAHAAD+AAP4AAfgAD/AAD/AAH4AAP4AA/wAB/gAD+AAD+AAH/8AH//gf4Pwf4Hwf4Hwf4Hw/wH4/wP4/wP4/AP4/AP4/APw/Afw/AfgeAfgeAfgfB/AHB8AH34AB/gA"],["7",0.7037,"D///D//+D//+D//+H//4H//4cADwYAHgAAHgAAPAAAPAAAfAAAcAAB8AAB4AADwAADwAAHwAAHgAAPgAAOAAA+AAA+AAB8AAB8AAD4AADwAAHwAAfAAAfAAAfAAA+AAA"],["8",0.6552,"AB/gAH/4APg+AOAfA+AfA+AfA+AfB+AfB+AfB/geB/w+A/z4A//wAP/AAH/AAH/gAH/gA//gD5/wHwfwfAP4fAP4+AH4+AH4+AH4+AHw+AHw+AHwfAPgHAPAD58AA/wA"],["9",0.6552,"AB/gAH7wAPg4A/g+B+A+B+A+D+A/D8A/D8A/H8A/H8A/H8D/H4D/H4D/H4H+D4H+D4H+D8P+B//4AP/4AAfwAB/gAB/gAD/AAH8AAP4AA/wAA/wAB+AAD8AA/wAA4AAA"],["/",0.5517,"AAA/AAD8AAD8AAD4AAH4AAH4AAHgAAfgAAfAAA/AAA/AAD8AAD8AAD4AAH4AAHgAAHgAAfgAAfAAA/AAA/AAA8AAD8AAD4AAH4AAHgAAfgAAfgAAfgAA/AAA/AAA8AAA"],["-",2.2,"P///P///P///P///P///P///P///P///P///P///P///P///P//////8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8///8"]];
function pop(n){n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);return (((n+(n>>>4))&0x0F0F0F0F)*0x01010101)>>>24;}
const templates=RAW.map(([char,ratio,s])=>{
 const v=atob(s), rows=new Uint32Array(TH);let count=0;
 for(let y=0;y<TH;y++){rows[y]=(v.charCodeAt(y*3)<<16)|(v.charCodeAt(y*3+1)<<8)|v.charCodeAt(y*3+2);count+=pop(rows[y]);}
 return {char,ratio,rows,count};
});
function bound(s){
 if(s.bounds && s.bounds.w>0 && s.bounds.h>0)return s.bounds;
 let x0=s.width,y0=s.height,x1=-1,y1=-1;
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(s.data[y*s.width+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}
function glyph(s,b){
 const rows=new Uint32Array(TH);let count=0;
 for(let j=0;j<TH;j++){
  const y=b.y+Math.min(b.h-1,Math.floor((j+.5)*b.h/TH));let row=0;
  for(let i=0;i<TW;i++){
   const x=b.x+Math.min(b.w-1,Math.floor((i+.5)*b.w/TW));
   if(s.data[y*s.width+x])row|=1<<(23-i);
  }
  rows[j]=row;count+=pop(row);
 }
 return {rows,count,ratio:b.w/b.h};
}
// Each template's rows for the three sideways shifts, with an empty row above and below, so a
// ±1 vertical shift reads a 0 instead of needing a bounds check (same overlap counts as before).
for(const t of templates){
 t.shifted=[-1,0,1].map(dx=>{
  const a=new Uint32Array(TH+2);
  for(let y=0;y<TH;y++){let r=t.rows[y];if(dx<0)r=(r<<1)&MASK;else if(dx>0)r=r>>>1;a[y+1]=r;}
  return a;
 });
}
function match(g){
 const scores={}, gr=g.rows;
 for(const t of templates){
  const ratioPenalty=.16*Math.abs(Math.log(g.ratio/t.ratio));
  if(ratioPenalty>.26)continue;
  let best=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const tr=t.shifted[dx+1], o=dy+1;
   let common=0;
   for(let y=0;y<TH;y++){
    let n=gr[y]&tr[y+o];
    n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);
    common+=(((n+(n>>>4))&0x0F0F0F0F)*0x01010101)>>>24;
   }
   const score=2*common/(g.count+t.count)-ratioPenalty;
   if(score>best)best=score;
  }
  if(scores[t.char]===undefined || best>scores[t.char])scores[t.char]=best;
 }
 const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
 if(!ranked.length)return null;
 return {char:ranked[0][0],score:ranked[0][1],margin:ranked[0][1]-(ranked[1]?.[1]||0)};
}
function spans(s,b){
 let start=-1;const out=[];
 for(let x=b.x;x<=b.x+b.w;x++){
  let count=0;
  if(x<b.x+b.w)for(let y=b.y;y<b.y+b.h;y++)count+=s.data[y*s.width+x]?1:0;
  if(count && start<0)start=x;
  if(!count && start>=0){
   let y0=s.height,y1=-1,area=0;
   for(let yy=b.y;yy<b.y+b.h;yy++)for(let xx=start;xx<x;xx++)if(s.data[yy*s.width+xx]){y0=Math.min(y0,yy);y1=Math.max(y1,yy);area++;}
   out.push({x:start,y:y0,w:x-start,h:y1-y0+1,area});start=-1;
  }
 }
 return out;
}
function median(a){const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)];}
// Some proportional fonts leave no fully blank column between adjacent
// digits (notably 7 followed by 2, 5, 7 or 9). Split a merged run only when
// each proposed segment independently matches a digit (or leading minus)
// with strong evidence.
function splitJoined(s,p,height){
 const minW=Math.max(3,Math.floor(height*.18)),maxW=Math.ceil(height*1.02);
 if(p.w<height*.75 || p.w>maxW*3 || p.h<height*.65)return null;
 const cache=new Map(),projection=new Uint16Array(p.w);
 for(let x=0;x<p.w;x++)for(let y=p.y;y<p.y+p.h;y++)projection[x]+=s.data[y*s.width+p.x+x]?1:0;
 function part(a,b){
  const key=a+':'+b;if(cache.has(key))return cache.get(key);
  let x0=b,y0=s.height,x1=-1,y1=-1,area=0;
  for(let y=p.y;y<p.y+p.h;y++)for(let x=a;x<b;x++)if(s.data[y*s.width+p.x+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);area++;}
  if(x1<0){cache.set(key,null);return null;}
  const box={x:p.x+x0,y:y0,w:x1-x0+1,h:y1-y0+1,area};
  const center=box.y+box.h/2;
  if(box.h<=height*.30 && box.w>=height*.28 && box.w<=height*1.2 && box.w>=2.2*box.h && area/(box.w*box.h)>=.65 && center>=p.y+height*.2 && center<=p.y+height*.8){
   const result={box,m:{char:'-',score:.99,margin:.3}};cache.set(key,result);return result;
  }
  if(box.h<height*.72 || box.h>height*1.25 || box.w/box.h<.18 || box.w/box.h>1.02){cache.set(key,null);return null;}
  const m=match(glyph(s,box));
  const result=m && /^[0-9]$/.test(m.char) && m.score>=.80 && m.margin>=.02 ? {box,m} : null;
  cache.set(key,result);return result;
 }
 for(let count=2;count<=3;count++){
  if(p.w<count*minW || p.w>count*maxW)continue;
  let best=null;
  function search(a,left,found,cost){
   if(left===1){
    if(p.w-a<minW || p.w-a>maxW)return;
    const q=part(a,p.w);if(!q || q.m.char==='-')return;
    const all=found.concat(q),scores=all.map(x=>x.m.score),mean=scores.reduce((x,y)=>x+y,0)/all.length;
    if(mean<.84)return;
    const quality=.7*mean+.3*Math.min(...scores)-cost;
    if(!best || quality>best.quality)best={quality,parts:all.map(x=>({...x.box,splitMatch:x.m}))};
    return;
   }
   const lo=Math.max(a+minW,p.w-left*maxW+maxW),hi=Math.min(a+maxW,p.w-(left-1)*minW);
   for(let cut=lo;cut<=hi;cut++){
    // Reject cuts through a dense stroke; touching top bars remain admissible.
    const bridge=Math.min(projection[cut-1]||0,projection[cut]||0);
    if(bridge>height*.55)continue;
    const q=part(a,cut);if(!q || (q.m.char==='-' && a!==0))continue;
    search(cut,left-1,found.concat(q),cost+.012*bridge/height);
   }
  }
  search(0,count,[],0);
  if(best)return best.parts;
 }
 return null;
}
function recognize(s){
 if(!s || !s.data || !s.width || !s.height)return null;
 const b=bound(s);if(!b || b.h<5)return null;
 let parts=spans(s,b);
 if(!parts.length || parts.length>48)return null;
 // Ignore isolated one-pixel scan artefacts but retain short minus signs.
 const fullHeight=Math.max(...parts.map(p=>p.h));
 parts=parts.filter(p=>p.area>=Math.max(2,fullHeight*.12) && !(p.h<fullHeight*.15 && p.w<fullHeight*.14));
 if(parts.length<1)return null;
 const height=median(parts.filter(p=>p.h>=fullHeight*.55).map(p=>p.h));
 if(!Number.isFinite(height))return null;
 let repairedGroups=0;const repaired=[];
 for(const p of parts){
  if(p.w>height*1.05){
   const split=splitJoined(s,p,height);if(!split)return null;
   repaired.push(...split);repairedGroups++;
  }else if(p.w>=height*0.75 && p.h>=height*0.65){
   const direct=match(glyph(s,p));
   if(!direct || direct.score<0.85){
    const split=splitJoined(s,p,height);
    if(split){repaired.push(...split);repairedGroups++;continue;}
   }
   repaired.push(p);
  }else repaired.push(p);
 }
 parts=repaired;
 const boxes=[];let sum=0,minimum=1,digits=0,marginSum=0;
 for(const p of parts){
  if(p.w>height*1.3)return null; // Unsplittable or nonnumeric glyph.
  let m;
  if(p.h<=height*.30 && p.w>=height*.28 && p.w<=height*1.2){
   // A minus sign is aligned near the middle of the digits.
   const center=p.y+p.h/2;if(center<b.y+height*.2 || center>b.y+height*.8)return null;
   m={char:'-',score:.99,margin:.3};
  }else{
   if(p.h<height*.65 || p.h>height*1.3)return null;
   m=p.splitMatch||match(glyph(s,p));
  }
  if(!m || m.score<.70)return null;
  if(/[0-9]/.test(m.char))digits++;
  sum+=m.score;minimum=Math.min(minimum,m.score);marginSum+=m.margin;
  const {splitMatch,...box}=p;boxes.push({...box,label:m.char,confidence:Math.max(0,Math.min(1,m.score)),margin:m.margin});
 }
 if(!digits)return null;
 const mean=sum/boxes.length;
 if(mean<.82 || minimum<.75)return null;
 const baseline=median(boxes.filter(p=>/[0-9]/.test(p.label)).map(p=>p.y+p.h));
 if(boxes.some(p=>/[0-9]/.test(p.label) && Math.abs(p.y+p.h-baseline)>height*.25))return null;
 // A digit 1 often has unusually narrow ink, even in tabular fonts. Account
 // for its natural side bearings before inferring word boundaries.
 const wideDigits=boxes.filter(p=>/[023456789]/.test(p.label)).map(p=>p.w);
 const normalWidth=wideDigits.length?median(wideDigits):height*.6;
 const bearing=p=>p.label==='1'?Math.max(0,(normalWidth-p.w)/2):0;
 const gaps=boxes.map((p,i)=>i?p.x-boxes[i-1].x-boxes[i-1].w-bearing(p)-bearing(boxes[i-1]):0);
 const candidates=gaps.filter((g,i)=>i && boxes[i].label!=='/' && boxes[i-1].label!=='/' && boxes[i-1].label!=='-').sort((a,b)=>a-b);
 let spaceThreshold=height*.42, largestJump=0;
 for(let i=1;i<candidates.length;i++){
  const lo=candidates[i-1],hi=candidates[i],jump=hi-lo;
  if(lo<height*.3 && hi>=height*.2 && jump>=height*.13 && jump>largestJump){largestJump=jump;spaceThreshold=(lo+hi)/2;}
 }
 if(!largestJump && candidates.length && candidates[0]>height*.2)spaceThreshold=height*.18;
 let text='';
 for(let i=0;i<boxes.length;i++){
  const p=boxes[i],prev=boxes[i-1];
  if(p.label==='/') {text=text.trimEnd()+' / ';continue;}
  if(prev && prev.label!=='/' && prev.label!=='-' && gaps[i]>=spaceThreshold)text+=' ';
  text+=p.label;
 }
 text=text.replace(/\s+/g,' ').trim();
 // Slash separators identify whole A1Z26 entries, so spacing within an entry
 // is not a second delimiter (e.g. two narrow 1 glyphs still form 11).
 if(text.includes('/'))text=text.split('/').map(t=>t.replace(/\s/g,'')).join(' / ');
 const confidence=Math.max(0,Math.min(.995,.62*mean+.38*minimum));
 return {text,confidence,boxes,diagnostics:[`Offline glyph recognition; ${digits} digit${digits===1?'':'s'} and ${boxes.length-digits} separator${boxes.length-digits===1?'':'s'}.`, `Lowest glyph match: ${Math.round(minimum*100)}%; spacing preserved from the image.`,...(repairedGroups?[`Separated ${repairedGroups} touching or overlapping numeric group${repairedGroups===1?'':'s'}.`]:[])]};
}
global.NumericVision={recognize,version:'1.1.0'};
})(typeof window!=='undefined'?window:globalThis);

/* Offline geometry recognizer. Input uses 1=ink; it never needs an OCR service.
 * DotVision.recognize({width,height,data,components,bounds}, mode='all')
 * -> [{type,text,confidence,boxes,diagnostics}]. Coordinates are source pixels.
 */
(function (global) {
  'use strict';
  const MORSE = {
    '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G',
    '....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N',
    '---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U',
    '...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z'
  };
  const BRAILLE = {
    1:'A',3:'B',9:'C',25:'D',17:'E',11:'F',27:'G',19:'H',10:'I',26:'J',
    5:'K',7:'L',13:'M',29:'N',21:'O',15:'P',31:'Q',23:'R',14:'S',30:'T',
    37:'U',39:'V',58:'W',45:'X',61:'Y',53:'Z'
  };
  const median = values => {
    const a = values.slice().sort((x,y)=>x-y), n=a.length;
    return n ? (a[(n-1)>>1]+a[n>>1])/2 : 0;
  };
  function box(group, label) {
    const x=Math.min(...group.map(c=>c.x)),y=Math.min(...group.map(c=>c.y));
    return {x,y,w:Math.max(...group.map(c=>c.x+c.w))-x,
      h:Math.max(...group.map(c=>c.y+c.h))-y,label};
  }
  function normalize(sample) {
    let cs=(sample.components || []).map(c=>({...c,
      cx:Number.isFinite(c.cx)?c.cx:c.x+(c.w-1)/2,
      cy:Number.isFinite(c.cy)?c.cy:c.y+(c.h-1)/2}));
    if (!cs.length) return [];
    const large=Math.max(...cs.map(c=>c.area));
    cs=cs.filter(c=>c.area>=Math.max(2,large*0.06));
    return cs.sort((a,b)=>a.cx-b.cx || a.cy-b.cy);
  }
  function cluster(values,tolerance) {
    const out=[];
    for(const value of values.slice().sort((a,b)=>a-b)) {
      const g=out[out.length-1];
      if(!g || Math.abs(value-median(g))>tolerance) out.push([value]);
      else g.push(value);
    }
    return out.map(median);
  }
  function circles(cs) {
    if(!cs.length || cs.some(c=>c.w/c.h<0.72 || c.w/c.h>1.38 ||
      c.area/(c.w*c.h)<0.57 || c.area/(c.w*c.h)>0.98)) return false;
    const sizes=cs.map(c=>(c.w+c.h)/2), d=median(sizes);
    return sizes.every(s=>s>d*0.65 && s<d*1.45);
  }
  function morse(sample,cs,mode) {
    if(!cs.length || cs.length>32) return null;
    const entries=[];
    for(const c of cs) {
      const ratio=c.w/c.h, fill=c.area/(c.w*c.h);
      let symbol;
      if(ratio>=0.72 && ratio<=1.4 && fill>=0.57 && fill<=0.98) symbol='.';
      else if(ratio>=2.05 && ratio<=5.7 && fill>=0.68) symbol='-';
      else return null;
      entries.push({...c,symbol});
    }
    const dots=entries.filter(c=>c.symbol==='.'), dashes=entries.filter(c=>c.symbol==='-');
    const unit=median(dots.length ? dots.map(c=>(c.w+c.h)/2) : dashes.map(c=>c.w/2.12));
    if(unit<1) return null;
    // Morse is a left-to-right sequence, never two symbols stacked in a column.
    for(let i=1;i<entries.length;i++) if(entries[i].x < entries[i-1].x+entries[i-1].w-unit*0.3) return null;
    for(const group of [dots,dashes]) if(group.length) {
      const mid=median(group.map(c=>c.cy));
      if(group.some(c=>Math.abs(c.cy-mid)>unit*0.42)) return null;
    }
    if(dots.length && dashes.length) {
      const dy=median(dots.map(c=>c.cy))-median(dashes.map(c=>c.cy));
      // Both baseline typography and center-aligned drawn Morse are supported.
      if(dy < -unit*0.45 || dy>unit*2.0) return null;
    }
    if(dots.some(c=>Math.abs((c.w+c.h)/2-unit)>unit*0.4)) return null;
    if(dashes.some(c=>c.w<unit*1.45 || c.w>unit*3.25)) return null;
    const groups=[];
    for(const c of entries) {
      const group=groups[groups.length-1];
      if(!group || c.x-(group[group.length-1].x+group[group.length-1].w)>unit*1.55) groups.push([c]);
      else group.push(c);
    }
    const tokens=groups.map(g=>g.map(c=>c.symbol).join(''));
    if(tokens.length>8 || tokens.some(t=>!MORSE[t])) return null;
    let confidence=0.985;
    const diagnostics=[`${entries.length} Morse marks in ${groups.length} letter${groups.length===1?'':'s'}; spaces come from the larger horizontal gaps.`];
    if(!dashes.length) {
      const y=median(dots.map(c=>c.cy))/sample.height;
      if(y>=0.52 && y<=0.72) {
        diagnostics.push('The dots sit on the lower Morse baseline, rather than the upper Braille row.');
      } else if(y>=0.22 && y<=0.43) {
        confidence=mode==='morse'?0.9:0.38;
        diagnostics.push('These dots are on an upper row; their image position favors Braille in All mode.');
      } else {
        confidence=mode==='morse'?0.93:0.68;
        diagnostics.push('This dot-only image has little vertical context; use the Morse or Braille tab if the picture was tightly cropped.');
      }
    }
    return {type:'morse',text:tokens.join(' '),confidence,
      boxes:groups.map((g,i)=>box(g,tokens[i])),diagnostics};
  }
  function braille(sample,cs,mode) {
    if(cs.length>48 || !circles(cs)) return null;
    const diameter=median(cs.map(c=>(c.w+c.h)/2));
    const rows=cluster(cs.map(c=>c.cy),diameter*0.48);
    if(rows.length>3) return null;
    // In alphabetic six-dot Braille, every letter has at least one top-row dot.
    // A missing middle row is identifiable from the doubled vertical distance.
    let pitch=diameter*1.94;
    if(rows.length>=2) {
      const gaps=rows.slice(1).map((r,i)=>r-rows[i]);
      const small=Math.min(...gaps);
      pitch=small>diameter*2.95 ? small/2 : small;
      if(pitch<diameter*1.2 || pitch>diameter*2.8) return null;
    }
    const top=rows[0];
    const rowIndex=y=>Math.round((y-top)/pitch);
    if(cs.some(c=>rowIndex(c.cy)>2 || Math.abs(c.cy-(top+rowIndex(c.cy)*pitch))>diameter*0.48)) return null;
    const columns=cluster(cs.map(c=>c.cx),diameter*0.46);
    const groups=[];
    for(const x of columns) {
      const group=groups[groups.length-1];
      if(!group || x-group[group.length-1]>diameter*2.7) groups.push([x]);
      else group.push(x);
    }
    if(groups.length>8 || groups.some(g=>g.length>2)) return null;
    if(groups.some(g=>g.length===2 && (g[1]-g[0]<diameter*1.05 || g[1]-g[0]>diameter*2.4))) return null;
    const boxes=[], tokens=[], masks=[];
    for(const group of groups) {
      const glyph=cs.filter(c=>c.cx>=group[0]-diameter*0.5 && c.cx<=group[group.length-1]+diameter*0.5);
      let mask=0;
      for(const c of glyph) {
        const col=group.length===1?0:(Math.abs(c.cx-group[0])<=Math.abs(c.cx-group[1])?0:1);
        const bit=1<<(rowIndex(c.cy)+col*3);
        if(mask&bit) return null;
        mask|=bit;
      }
      if(!BRAILLE[mask]) return null;
      const cell=String.fromCharCode(0x2800+mask);
      tokens.push(cell);masks.push(mask);
      boxes.push(box(glyph,cell));
    }
    let confidence=0.987;
    const positions=masks.map(m=>[1,2,3,4,5,6].filter(n=>m&(1<<(n-1))).join(''));
    const diagnostics=[`Braille dots: ${positions.join(' / ')} (left column 1–3, right column 4–6).`];
    if(rows.length===1) {
      const y=top/sample.height;
      if(y>=0.22 && y<=0.43) {
        diagnostics.push('The dots sit on the upper Braille row, distinguishing A/C cells from Morse E/I.');
      } else if(y>=0.52 && y<=0.72) {
        confidence=mode==='braille'?0.9:0.36;
        diagnostics.push('These dots lie on a lower baseline; their image position favors Morse in All mode.');
      } else {
        confidence=mode==='braille'?0.93:0.65;
        diagnostics.push('A single dot row has little vertical context; the selected Braille tab can disambiguate a tightly cropped picture.');
      }
    }
    return {type:'braille',text:tokens.join(' '),confidence,boxes,diagnostics};
  }
  function recognize(sample,mode='all') {
    if(!sample || !sample.width || !sample.height) return [];
    const cs=normalize(sample), results=[];
    if(mode==='all' || mode==='morse') { const r=morse(sample,cs,mode); if(r) results.push(r); }
    if(mode==='all' || mode==='braille') { const r=braille(sample,cs,mode); if(r) results.push(r); }
    return results.sort((a,b)=>b.confidence-a.confidence);
  }
  global.DotVision={recognize,MORSE,BRAILLE};
})(typeof window!=='undefined'?window:globalThis);

/* Chinese-number OCR. Offline bitmap templates: Noto CJK (SIL OFL 1.1) plus the supplied sample.
 * recognize({width,height,data:Uint8Array(0|1),bounds}) -> {text,confidence,boxes,diagnostics}|null
 * decode(text) -> {ok,output,normalized,error?}; integer 1..99999999, without leading zeroes.
 * Clean, single-line printed number images are supported; no network or uploads are used.
 */
(function (global) {
  'use strict';
  const RAW = [{"c":"零","a":1.0263,"f":"NotoSansCJKsc-Black","b":"D///8A////AP///wAAPAAH////5////+f////ngDwD57+9++e/vfvnv7374H+9/AB/kfwAf/38AAH+AAAH/8AA///+D//X////Of/n+Hwfw8A8B8B///4Af///AH///gAEA/wAB8/4AA//4AAH/8AAAP/wAAAP8AAAAeAAAABgA="},{"c":"〇","a":0.9737,"f":"NotoSansCJKsc-Black","b":"AA/wAAB//gAA//8AA///wAf//+AP+B/wH+AH+B/AA/g/AAD8fgAAfn4AAH78AAA//AAAP/gAAB/4AAAf+AAAH/gAAB/4AAAf+AAAH/wAAD/8AAA/fgAAfn4AAH4/AAD8H8AD+B/gB/gP+B/wB///4AP//8AA//8AAH/+AAAP8AA="},{"c":"一","a":5.6923,"f":"NotoSansCJKsc-Black","b":"//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8="},{"c":"二","a":1.2,"f":"NotoSansCJKsc-Black","b":"H///+B////gf///4H///+B////gf///4H///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////////////////////////////8="},{"c":"三","a":1.0769,"f":"NotoSansCJKsc-Black","b":"P////D////w////8P////D////w////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//+AH///gB///4Af//+AH///gB///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////////////////////////8="},{"c":"四","a":1.0,"f":"NotoSansCJKsc-Black","b":"///////////////////////////4fn4/+H5+P/h+fj/4fn4/+Hx+P/h8fj/4fH4/+Px+P/j8fj/4/H4/+Px+P/n4f//7+H////A///vwP//54B//+cAAP/iAAD/4AAA/////////////////////////////////+AAAP/gAAD8="},{"c":"五","a":1.0746,"f":"NotoSansCJKsc-Black","b":"P////D////w////8P////D////w////8AB+AAAAfgAAAHwAAAB8AAAAfAAAP///gD///4A///8AP///AD///wA///8AAPw/AAH4PwAB+D8AAfg/AAH4PwAB+D8AA/A/AAPwPwAD8D4D///////////////////////////////8="},{"c":"六","a":0.9867,"f":"NotoSansCJKsc-Black","b":"AAOAAAAPwAAAD8AAAAfgAAAH4AAAB/AAAAPwAAADwAD//////////////////////////wAAAAAAAAAAAAAAAADABgAB/D8AAfg/gAP4H8AD+B/AB/AP4AfgB+AP4APwH8AD+B/AA/g/gAH8fwAA/v8AAP5+AAB+PAAAOBwAADA="},{"c":"七","a":1.0274,"f":"NotoSansCJKsc-Black","b":"AH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgA+AH4H/wB///8D////f/////////7///wA//8AAP/+AABwfgAAAH4AAAB+ACAAfgA4AH4APgB+AD4AfgA+AH4APgB+AH4APgB+AD///AA///wAH//4AB//+AAH/+A="},{"c":"八","a":1.0857,"f":"NotoSansCJKsc-Black","b":"AAAeAAD4HgAA+B4AAPgfAAD4HwAA+B8AAPgfAAD4HwAA+B8AAfgfAAH4HwAB8B8AAfAPgAHwD4AD8A+AA+APwAPgB8AH4AfAB+AH4AfgB+AHwAfgD8AD8A/AA/AfgAH4H4AB+D8AAPw/AAD+/gAAf/4AAH98AAA+OAAAGBgAABg="},{"c":"九","a":1.0267,"f":"NotoSansCJKsc-Black","b":"AH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAA///8AP///AD///wA///8AP///AAB8HwAAfB8AAHwfAAD8HwAA+B8AAPgfAAH4HwAB8B8AAfAfAAPwHwgH4B8fD+AfHx/AHx8/wB+ff4AP//8AD/9+AA/+PAAP/DgAA/g="},{"c":"十","a":0.9605,"f":"NotoSansCJKsc-Black","b":"AAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AA//////////////////////////8AB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AA="},{"c":"百","a":0.9861,"f":"NotoSansCJKsc-Black","b":"//////////////////////////8AD8AAAA/AAAAPwAAf///4H///+B////gf///4H///+B+AAfgfgAH4H4AB+B+AAfgf///4H///+B////gf///4H4AB+B+AAfgfgAH4H4AB+B////gf///4H///+B////gf///4H4AB+B+AAfg="},{"c":"千","a":0.9737,"f":"NotoSansCJKsc-Black","b":"AAADwAAAP8AAB//gP///+B////Af//wAH//gAB+H4AAAB+AAAAfgAAAH4AAAB+AAAAfgAP//////////////////////////AAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AA="},{"c":"万","a":1.0563,"f":"NotoSansCJKsc-Black","b":"P////z////8/////P////z////8AfAAAAHwAAAB8AAAAfAAAAHwAAAB///gAf//4AH//+AD///gA///4APgA+AD4APgA+AD4AfAB+AHwAfgD8AH4A/AB+APwAfgH4AH4D8AB8B/AAfA/gAPw/4H/8H8A/+A+AP/gPAD/wBgAf4A="},{"c":"两","a":1.0141,"f":"NotoSansCJKsc-Black","b":"//////////////////////////8AfD4AAHw+AAB8PgB////+f////n////5////+f////nx8Pn58fD5+fHw+fnx+P358f39+fP///nz/f/58///+fP///n32+f5/8fD+f/Pwfn/h8H59wOB+fIBP/nwAD/58AAf8fAAH/HwAB/A="},{"c":"兩","a":1.0278,"f":"NotoSansCJKsc-Black","b":"//////////////////////////8AB8AAAAfAAAAHwAA////8P////D////w////8PAfAPDwHxDw9x9w8PefcPDz33jw89988PP/fPDz/37w9/9+8Pf/f/D////w////8P9/7/D+f8/w9l9G8PAfAfDwHw/w8B8P8PAfD+DwAA/A="},{"c":"萬","a":0.9211,"f":"NotoSansCJKsc-Black","b":"AfAPgP////////////////////8B8A+AAAAAAA////gP///4D///+A+HwfgP///4D///+A////gPh8H4D///+A////gP///4AAfAAH////9/////f////3////98B8c/fAfPP33//799//+/ff//v3z///58AAZ+fAAAfnwAAHw="},{"c":"壹","a":1.0,"f":"NotoSansCJKsc-Black","b":"AAfgAAAH4AD///////////////8AB+AAD///8A////AP///wD///8H////5////+f////n////54AAA+e///vnv//74D//+AAAAAAAf//+AH///gB///4AfAA+AH///gB///4Af//+AA+B8AAPgfAP////////////////////8="},{"c":"贰","a":0.9615,"f":"NotoSansCJKsc-Black","b":"AAAfOAAAH/gAAB98AAAfeH////5////+f////n////4AAB8AH//PAB//zwAf/88AH//PAAAADwB//+8Af//vgH//74AAAA+AH//PgB//z4Af/8+AH//PwB4Dx8Ae88fEHvPHxh7zw+cB9gPvB/+B////4f//x/H+fwHwfDgA4Dg="},{"c":"貳","a":0.987,"f":"NotoSansCJKsc-Black","b":"AAAeIAAAHngAAB78AAAeeP////7////+/////v////4AAB4AH/8eAB//HwAAAB8Af//fAH//3wB//98AAAAfAD//nwA//58APAefAD//nwA//48APAePgD//j4A//4+IPAeHjD//h88//4fPDx4H/z+/A/7/H8P+fAfA/DgDAPw="},{"c":"叁","a":1.013,"f":"NotoSansCJKsc-Black","b":"AAwAAAAeAAAAP54AAH8/AAH+P4AH+B/AD///4A////gH///8B///+AA/AGAAPgAAf////n////5////+f////gfwD+Af///4P////v////9///98Pv//PBn//8AB///AAf//wAH//8AB///AAAAAAD////w////8P////D////w="},{"c":"參","a":1.0,"f":"NotoSansCJKsc-Black","b":"ABgAAAA+HAAB/j8AB/gfgA///8AP///gD///8AYAAIAMAAYAHwOPmB73z/w+f988P////j////4////+Afx/AAf5v8A////8///H/3//kf48/H58OHH8HAA/8QAD/+PAA/+P4AH8P4AA4f+AAD/8AA//+AAH/+AAB/4AAAPgAAA="},{"c":"肆","a":1.0,"f":"NotoSansCJKsc-Black","b":"AAAPAB/8DwAf/A8AH/3//B/9//weAf/8H/gPPB/4Dzwf+///H/v//x4D//8f+A88H/gPPB/5//wf+f/8HgH//P/8DwD//A8A//3//P/9//wPgf/8Hxj//B94DwAfe//+Hn///j////5////+f/4PAH/+DwA+Hg8AMBgPAAAADwA="},{"c":"伍","a":1.0,"f":"NotoSansCJKsc-Black","b":"AcAAAAHwAAAD7//+A+///gfv//4Hz//+B8///g+AfAAfgHwAP4B8AD+AfAB/gHgA/4D4AH+P//x/j//8N4///CeP//wHgPB8B4HweAeB8HgHgfD4B4Hw+AeB8PgHgfD4B4Hw+AeB4PgHv///B7///we///8Hv///B7///weAAAA="},{"c":"陆","a":0.9605,"f":"NotoSansCJKsc-Black","b":"AAAfgP/AH4D/4B+A//AfgP/n//zx5//88+f//PPn//zzx//898AfgPfAH4D3gB+A94AfgPPf///z////8f////H////x4B+A8eAfgPHvn5//75+f9++fn/fvn5/3z5+f8A+fn/APn5/wD///8A////AP///wD///8AAAP/AAAB8="},{"c":"陸","a":0.9474,"f":"NotoSansCJKsc-Black","b":"AAA/AP+APwD/7//8/////v////7z7//+8+A/APPgPwDz3///99////ef///3n///95////PD4fjz5/P88//g//H/gD7x7z8c8e4/CPHgPwD/7//89+///Pfv//z3z//88AA/APAAPwDwAD8A8H////B////wf///8H////B///8="},{"c":"柒","a":1.0,"f":"NotoSansCJKsc-Black","b":"DgD4AA8A+AAfwPgAD4D5/AcA//x4P//+fj///v4//8A8v/gACYD4EAPA+BwH4PgeH+D//j+A//z/AP/8fgB/+DgH4AAQB+AAAAfgAH////5////+f////n////4Af/4AAf//wAf//+Af9+/4/+fj/3+H4f4+B+B8GAfgGAAH4AA="},{"c":"捌","a":0.9481,"f":"NotoSansCJKsc-Black","b":"HgAADx4f+A8eH/gPHh/57x4f+e8eHnnvHh557//eee//3nnv/9557//f+e8eH/nvHh/57x4AAe8ej4HvH8+B7//Pge//3/3v/x/97/4f/e9eDz3vHg897x4fPe8eHjnvHh457x4eOA8ePHgPHnx4D37/+P9++/h/PnHwfzwh4Hw="},{"c":"玖","a":1.013,"f":"NotoSansCJKsc-Black","b":"AAB4AAAAfAB/+PgAf/j4AH/4+AB/+P/gf/n/8AeB//AHg//wB4P/4AeD4+AHh8Pgf//D4H//x+B//4fAf/MHwH/xD8AHgA/AB4Af4AeAH+AHgD/gB5h/8A/4//D/+P34//n8+P/7+Pz/x/B+eB/gfwAfwD4AD8A8AAcAGAACAAg="},{"c":"拾","a":0.9872,"f":"NotoSansCJKsc-Black","b":"D4AYAA+AHwAPgD8AD4A/AA+Af4APgH+A//D/wP/x++D/8fPw//fx/P//4P4Pn///D5///g+P//wPtv/oD/AAAP/wAAD/8//4//P/+P+D//h/g//4D4PA+A+DwPgPg8D4D4PA+A+DwPgPg//4f4P/+H+D//h/A//4PgPA+DgDwPg="},{"c":"佰","a":0.9481,"f":"NotoSansCJKsc-Black","b":"A8AAAAPgAAAD////A////wf///8H3///D8A/AA+APgAPgD4AH4A+AD+P//4/j//+f4///v+P//7/j4A+f4+APn+PgD4/j4A+L4///g+P//4Pj//+D4///g+PgD4Pj4A+D4+APg+PgD4Pj//+D4///g+P//4Pj//+D4+APg+PgD4="},{"c":"仟","a":1.0132,"f":"NotoSansCJKsc-Black","b":"AYAAAAHwAHAD4AP4A+H//Aff//4Hz//wD8//gA+P/wAfgB8AP4AfAD+AHwB/gB8A/4AfAH+///9/v///P7///y+///8Pv///D4AfAA+AHwAPgB8AD4AfAA+AHwAPgB8AD4AfAA+AHwAPgB8AD4AfAA+AHwAPgB8AD4AfAA+AHwA="},{"c":"零","a":1.027,"f":"NotoSansCJKsc-Bold","b":"H///+B////gf///4AAPAAH////5////+eAPAHngDwB57+9/ee/vf3gADwAAH+9/gB/gf4AAH4AAAD+AAAD/4AAf+/8A/+T/+/+eP/38D4P44AcAcB///4Af///AH///gAAAPwABwPwAA//4AAH/4AAAP/AAAAP8AAAAfAAAABgA="},{"c":"〇","a":1.0,"f":"NotoSansCJKsc-Bold","b":"AA/wAAB//gAA//8AA///wAf4H+AP4AfwH4AB+B8AAPg+AAB8PAAAPHwAAD54AAAe+AAAH/gAAB/wAAAP8AAAD/AAAA/wAAAP+AAAH/gAAB94AAAefAAAPjwAADw+AAB8HwAA+B+AAfgP4AfwB/gf4AP//8AA//8AAH/+AAAP8AA="},{"c":"一","a":7.4,"f":"NotoSansCJKsc-Bold","b":"//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8="},{"c":"二","a":1.2414,"f":"NotoSansCJKsc-Bold","b":"H///+B////gf///4H///+B////gf///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////////////////////////8="},{"c":"三","a":1.1111,"f":"NotoSansCJKsc-Bold","b":"P////D////w////8P////D////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//+AH///gB///4Af//+AH///gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//////////////////////////8="},{"c":"四","a":1.0303,"f":"NotoSansCJKsc-Bold","b":"//////////////////////h8PB/4fDwf+Hw8H/h8PB/4fDwf+Hw8H/h8PB/4fDwf+Hw8H/h4PB/4+Dwf+Pg8H/j4PB/58D//+/A////gH///wA//+4AAH/kAAB/4AAAf+AAAH///////////////////////////+AAAH/gAAB8="},{"c":"五","a":1.125,"f":"NotoSansCJKsc-Bold","b":"P////D////w////8P////AAPAAAADwAAAA8AAAAPAAAAHwAAAB8AAAAfAAAP///AD///wA///8AP///AD///wAA+B8AAPgfAAD4HwAA8B8AAfAfAAHwHwAB8B4AAfAeAAHwHgAB4B4AA+A+A//////////////////////////8="},{"c":"六","a":0.9733,"f":"NotoSansCJKsc-Bold","b":"AAGAAAAPwAAAB8AAAAfAAAAD4AAAA+AAAAPwAAABwAAAAQAA/////////////////////wAAAAAAAAAAAAAAAABgBgAA/B8AAfgfgAHwD4AD8AfAA+AH4AfgA/APwAHwD8AB+B+AAPg/AAB8fgAAfn4AAH/8AAA/OAAAHBgAABg="},{"c":"七","a":1.0278,"f":"NotoSansCJKsc-Bold","b":"ADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAfADwH/wA8//8AP///P////v///4D//+AA//wAAHg8AAAAPAAAADwAAAA8AAAAPAAQADwAHAA8AB4APAAeADwAHgA8AD4APgA+AD4AfgA///wAH//8AA//+AAH/+A="},{"c":"八","a":1.1014,"f":"NotoSansCJKsc-Bold","b":"AAAeAAD4HgAA+B4AAPgeAAD4HgAA+B4AAPgeAADwHgAA8B8AAPAfAADwHwAA8A8AAfAPAAHgDwAB4A+AAeAHgAPgB4AD4AfAA+AHwAfAA+AHwAPgB4AD4A+AAfAPAAHwHwAA+B8AAPg+AAB8fgAAfvwAAD94AAAfOAAAHDAAAAg="},{"c":"九","a":1.0267,"f":"NotoSansCJKsc-Bold","b":"ADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAA///8AP///AD///wA///8AADwPAAA8DwAAfA8AAHgPAAB4DwAAeA8AAPgPAADwDwAB8A8AAfAPAAHwDwAD4A8OB8APDwfADw8fgA8PPwAPn/4AD/98AA/+OAAH/DAAA/g="},{"c":"十","a":0.9605,"f":"NotoSansCJKsc-Bold","b":"AAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AA/////////////////////wADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAA="},{"c":"百","a":0.9722,"f":"NotoSansCJKsc-Bold","b":"/////////////////////wAHwAAAB8AAAAfAAAAHgAAP///4D///+A////gP///4DwAA+A8AAPgPAAD4DwAA+A8AAPgP///4D///+A////gP///4DwAA+A8AAPgPAAD4DwAA+A8AAPgP///4D///+A////gP///4DwAA+A8AAPg="},{"c":"千","a":0.9733,"f":"NotoSansCJKsc-Bold","b":"AAADwAAAP+AAD//wP///4D///wAf/+AAH4PAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAP////////////////////8AA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAA="},{"c":"万","a":1.058,"f":"NotoSansCJKsc-Bold","b":"f////3////9/////f////wB8AAAAfAAAAHwAAAB8AAAAfAAAAHwAAAB///gAf//4AH//+AB///gAeAB4APgAeAD4AHgA8AB4APAAeAHwAHgB4AD4AeAA8APgAPAH4ADwB8AA8A/AAPAfgAHwfwAD8P4A//D8AP/geAB/wDAAf4A="},{"c":"两","a":1.0,"f":"NotoSansCJKsc-Bold","b":"/////////////////////wB8PgAAfD4AAHw+AAB8PgB////+f////n////5////+eHw+Pnh4PD54eDw+eHg8Pnh8Pj54fj8+eP9/vnj/f/54/3v+efb7/nng8f5/4/C+f8PgPnuBwD55gMA+eAAAPngAD/x4AAf8eAAH/HgAB/A="},{"c":"兩","a":1.0,"f":"NotoSansCJKsc-Bold","b":"/////////////////////wADwAAAA8AAAAPAAAADwAA////8P////D////w////8PAPAPDzDzDw9w9w8POPOPDzzzzw88888PPPPPDzzz7w9+9+8Pfvf/D//3fw/n/n8P5/5/D8b8Pw9A9A8PAPAPDwDw/w8A8P8PAPB+DwAAeA="},{"c":"萬","a":0.9211,"f":"NotoSansCJKsc-Bold","b":"AeAPgAHgD4D///////////////8B4A+AAAAAAA////AP///wD///8A8DwPAP///wD///8A////APA8DwDwPA8A////AP///wAAPAAH////5////+f////n////54A84eeAPHHngP/555//+eef//nnn/w954AAL+eAAAfngAAHw="},{"c":"壹","a":0.9865,"f":"NotoSansCJKsc-Bold","b":"AAPAAAADwAD///////////////8AA8AAD///8A////AP///wD///8AAAAAD////+/////v////7wAAAe8///nvP//54D//+AAAAAAA///+AP///gD///4A8AA+APgAPgD///4A///+AA8A4AAPAfAAD4HgD///////////////8="},{"c":"贰","a":0.9487,"f":"NotoSansCJKsc-Bold","b":"AAAfMAAAH3gAAB94AAAfOAAAHzD////+/////v////4AAA8AP//PAD//zwA//88AAAAPAAAADwB//+8Af//vAAAADwAAAA+AP//HgD//x4A//8eAPAPHgDzzx8A888PEPPPDxDzzw8cB5APnB/+B/z/Pwf//h/D+fADgfGAAYBg="},{"c":"貳","a":0.9868,"f":"NotoSansCJKsc-Bold","b":"AAAecAAAHvgAAB58AAAeOP////7////+/////v////4f/54AH/+eAB//ngAAAB4Af//eAH//zgAAAA4AAAAPAD//jwA8A48APAOPAD//jwA8A48AP/+PgD//h4A8A4eAP/+Hxj//g8cAAAPHD44D7x+fgf/+B8H+fAPA/jABgHw="},{"c":"叁","a":1.0133,"f":"NotoSansCJKsc-Bold","b":"AAwAAAAfAAAAHwwAAH4/AAD4H4AD8A/AD///8A////gH///4Bh8AcAAeACAAPgAAf////3////9/////A/APgAfgB+Af///4P////v////9+//8+OAAAHBAAAAQD///AA///wAP//8AAAAAAAAAAAAAAAAA////8P////D////w="},{"c":"參","a":1.0,"f":"NotoSansCJKsc-Bold","b":"ABgIAAB+PAAA/D4AB/APgA///8AP///gB//54AAAAIAPAgcAH2fPMB7nz3g////8P////D/+//4Q/PwMAfg/AAfz3+Af5+f4/5+D///+GP55+H4cAIH4AAAP8QAAf8PAA/4PwAH4H4ABwP8AAA/8AAH/8AAH/4AAB/wAAAfAAAA="},{"c":"肆","a":0.9868,"f":"NotoSansCJKsc-Bold","b":"AAAPAB/8DwAf/A8AH/3//B/9//wcAf/8HAAPPB/4Dzwf+///H/v//xwD//8cAA88H/gPPB/5//wf+f/8HAH//P/8DwD//A8A//3//P/9//wPAf/8HzAPAB5wDwAee//+PHv//j3///5////+//4PAH/eDwBwHA8AAAAPAAAADwA="},{"c":"伍","a":1.0,"f":"NotoSansCJKsc-Bold","b":"AYAAAAHgAAAB4AAAA////gff//4Hn//+B4B4AA8AeAAfAHgAHwB4AD8AeAB/APgA/wD4AP8f//h/H//4bx//+A8f//gPAPB4DwDweA8B4HgPAeD4DwHg+A8B4PgPAeDwDwPg8A8D4PAPA+DwDz///w8///8PP///Dz///w8AAAA="},{"c":"陆","a":0.9605,"f":"NotoSansCJKsc-Bold","b":"AAAPAP+ADwD/4A8A/+APAP/gDwDx5//88cf//PPH//zzwA8A94APAPeADwD3AA8A94APAPPf///z3///8f////H////x4A8A8eAPAPHvDx7x7w8e/+8PHvfPDx73jw8e8A8PHvAPDx7wDw8e8A///vAP//7wD//+8AAAHvAAAB4="},{"c":"陸","a":0.9474,"f":"NotoSansCJKsc-Bold","b":"AAAeAP+AHgD/4B4A/+///P/v//zx7//888AeAPPAHgDzgB4A85////ef///3H///94DAwPPB4fDzw+H48e/A/vH/gD7x/x4M8eweDPHgHgDx4B4A/+///PfP//z3j//88AAeAPAAHgDwAB4A8AAeAPD////w////8P////AAAAA="},{"c":"柒","a":0.9737,"f":"NotoSansCJKsc-Bold","b":"DADwAB8A8AAfwPAAD4DwPgMA//54P//+/D///P4//gAcPPAABYDwCAPA8A4HwPAeH4D4Pj8A//7+AP/8fAA/+DADwAAAA8AAAAPAAH////5////+f////gA//AAAf/4AAfvfgAPzz+AP48f4f8PD//8DwP98A8A+MAPADAADwAA="},{"c":"捌","a":0.9605,"f":"NotoSansCJKsc-Bold","b":"DgAADw4f+A8OH/gPDh/5zw4f+c8OHDnPf5w5z//cOc//3DnP/9w5zw4f+c8OH/nPDh/5zw4AAc8Ox4HPD8eBz3/Hgc//3/3P/x/9z34f/c9OBz3PDgc9zw4PPc8ODz3PDg45zw4eOA8OHjgPDjw4Dw58eA9++fh/PnHwfzwhwHw="},{"c":"玖","a":1.0,"f":"NotoSansCJKsc-Bold","b":"AAB4AAAAeAAAAHgA//D4AP/w+AD/8P/g//D/8A8B//APAf/gDwPh4A8D4eAPB8PgDwfD4H/vg8B//wfAf+8HwA8DB8APAA/ADwAPwA8AH+APAB/gDwA/4A/4fPAP+Pzw//j4+P/5+Pj/w/B88A/gPwAfwD8AH4AeAA8ADAAGAAA="},{"c":"拾","a":1.0,"f":"NotoSansCJKsc-Bold","b":"BwAMAAcAHwAHAB8ABwAfAAcAP4AHAH/A//D7wP/w++D/8fHw//Pg+AcH4PwHH///Bx///gcP/+wHBP/gB/AAAB/wAAD/8AAA//P/+H8D//h3A//4BwPA+AcDwPgHA8D4BwPA+AcDwPgHA8D4BwP/+H8D//h/A//4PwPA+DwDwPg="},{"c":"佰","a":0.9605,"f":"NotoSansCJKsc-Bold","b":"AcAAAAHgAAAB////A////wPf//8HwD4AB4A+AAeAPgAPgDwAD4A8AB+P//4/j//+P4///v+PgD7/j4A+/4+APnePgD53j4A+J4///geP//4Hj//+B4///gePgD4Hj4A+B4+APgePgD4Hj4A+B4///geP//4Hj//+B4+APgePgD4="},{"c":"仟","a":1.0132,"f":"NotoSansCJKsc-Bold","b":"AYAAAAHgADAB4AH4A8B//APf//wHz//AB4/+AA+PngAfAB4AHwAeAD8AHgB/AB4A/wAeAP8///9/P///fz///w8///8PAB4ADwAeAA8AHgAPAB4ADwAeAA8AHgAPAB4ADwAeAA8AHgAPAB4ADwAeAA8AHgAPAB4ADwAeAA8AHgA="},{"c":"零","a":1.0278,"f":"NotoSansCJKsc-Regular","b":"H///+B////gAAYAAAAGAAH////5////+cAGADnABgA53+Z/Oc/mfzmABgAYAAYAAB/if4AABwAAAB8AAAA/gAAD8PgAD8x/AH8OD/P4BwH9gAIAGB///4Af///AAAAHgAAAHgAAwHwAAfjwAAB/4AAAB+AAAAHwAAAAeAAAABAA="},{"c":"〇","a":1.0,"f":"NotoSansCJKsc-Regular","b":"AB/4AAB//gAA//8AA/APwA+AAfAPAADwHgAAeBwAADg4AAAccAAADnAAAA7wAAAP4AAAB+AAAAfgAAAH4AAAB+AAAAfgAAAH4AAAB+AAAAfwAAAPcAAADnAAAA44AAAcHAAAOB4AAHgPAADwD4AB8APwD8AA//8AAH/+AAAf+AA="},{"c":"一","a":10.4286,"f":"NotoSansCJKsc-Regular","b":"//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8="},{"c":"二","a":1.3148,"f":"NotoSansCJKsc-Regular","b":"H///+B////gf///4H///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////////////////////8="},{"c":"三","a":1.1667,"f":"NotoSansCJKsc-Regular","b":"P////D////w////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH///gB///4Af//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////////8="},{"c":"四","a":1.0312,"f":"NotoSansCJKsc-Regular","b":"////////////////4Dg4B+A4OAfgODgH4Dg4B+A4OAfgODgH4Dg4B+A4OAfgODgH4HA4B+BwOAfgcDgH4PA4B+DgOAfh4B/348Af/+fAD//vgAAH7gAAB+QAAAfgAAAH4AAAB+AAAAf////////////////gAAAH4AAAB+AAAAc="},{"c":"五","a":1.1613,"f":"NotoSansCJKsc-Regular","b":"H///+B////gf///4AA8AAAAPAAAADgAAAA4AAAAOAAAADgAAAA4AAAAOAAAADAAAD///wA///8AP///AABwBwAAcAcAAHAHAABgBgAAYAYAAOAGAADgBgAA4A4AAOAOAADADgABwA4AAcAOAAHADgABwAwD///////////////8="},{"c":"六","a":0.973,"f":"NotoSansCJKsc-Regular","b":"AAcAAAAHAAAABwAAAAOAAAADwAAAAcAAAADgAAAAwAAAAAAA////////////////AAAAAAAAAAAAAAAAAAAAAABwDgAA8A8AAOAHAAHgA4ABwAPAA8ABwAeAAOAHAADwDwAAcA4AAHgeAAA8PAAAHHgAAA7wAAAP8AAADyAAAAQ="},{"c":"七","a":1.0286,"f":"NotoSansCJKsc-Regular","b":"ADgAAAA4AAAAOAAAADgAAAA4AAAAOAAAADgAAAA4AAAAOAAAADgADwA4Af8AO///AH//wA//+AD//gAA//gAAIA4AAAAOAAAADgAAAA4AAAAOAAAADgAAAA4AAAAOAAMADgADgA4AA4AOAAOADgADgAcABwAH//8AB//+AAP//A="},{"c":"八","a":1.1045,"f":"NotoSansCJKsc-Regular","b":"AAAcAABwHAAAcBwAAHAcAABwHAAAcBwAAHAcAABgDAAAYAwAAGAMAADgDgAA4A4AAOAGAADABgABwAcAAcAHAAHAAwABwAOAA8ADgAOAA4ADgAHABwABwAcAAOAOAADgDgAAcBwAAHgcAAA4PAAAPHgAAB7wAAAP4AAAB2AAAAY="},{"c":"九","a":1.0274,"f":"NotoSansCJKsc-Regular","b":"ABwAAAAcAAAAHAAAABwAAAAcAAAAHAAAABgAAAAYAAAAGAAAf//+AH///gAAGAYAADgGAAA4BgAAOAYAADgGAAAwBgAAMAYAAHAGAABwBgAAcAYAAOAGAADgBgABwAYAA8AGBAOABgcHgAYHDwAGBzwABwf8AAf/8AAD/mAAAfw="},{"c":"十","a":0.973,"f":"NotoSansCJKsc-Regular","b":"AAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAP///////////////wABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA="},{"c":"百","a":1.0,"f":"NotoSansCJKsc-Regular","b":"////////////////AAOAAAADgAAAAwAAAAcAAAAHAAAP///wD///8A////AOAAAwDgAAMA4AADAOAAAwDgAAMA4AADAP///wD///8A////AOAAAwDgAAMA4AADAOAAAwDgAAMA4AADAOAAAwD///8A////AP///wDgAAMA4AADA="},{"c":"千","a":0.9863,"f":"NotoSansCJKsc-Regular","b":"AAAA4AAAD/AAAf/wAP//AD//gAAf4YAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAD//////////wABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA="},{"c":"万","a":1.0588,"f":"NotoSansCJKsc-Regular","b":"f////3////9/////ABgAAAA4AAAAOAAAADgAAAA4AAAAOAAAADgAAAA///gAP//4AD//+AAwADAAMAAwAHAAMABwADAAcAAwAPAAMADgAHAA4ABwAOAAcAHAAHABwABwA4AAcAcAAHAPAADwHgAA4DwAAOB4AP/g8AD/wGAAf4A="},{"c":"两","a":1.0145,"f":"NotoSansCJKsc-Regular","b":"////////////////ADAcAAAwHAAAMBwAADAcAAAwHAB////+f////n////5wMBwOcDAcDnAwGA5wMBgOcHgcDnB8Pg5wfD8OcG4/jnDnc85x43HuccLg7nPA4G5zgcBudwPADncBgA5wAAAOcAAADnAAAA5wAAf+cAAH/HAAA/g="},{"c":"兩","a":1.0,"f":"NotoSansCJKsc-Regular","b":"////////////////AAGAAAABgAAAAYAAAAGAAD////w////8P////DgBgBw4AYAcOIGEHDnBjBw4wYYcOOGGHDjhhxw44YccOPGHnDnxhZw5mY3cO5mM3DsZmPw/HZj8Pg24fD4JsHw4AYAcOAGAHDgBgBw4AYP8OAGB+DgAAAA="},{"c":"萬","a":0.9459,"f":"NotoSansCJKsc-Regular","b":"AOAHAADgBwD//////////wDgBwAA4AcAAAAAAA////AP///wDgGAcA4BgHAP///wD///8A4BgHAOAYBwDgGAcA////AP///wAAGAAAABgAA////+P////jgBhA44AYYOOAGHDjgBhw45//+OOf//zjkAAc44AAAOOAAA/jgAAPw="},{"c":"壹","a":1.0,"f":"NotoSansCJKsc-Regular","b":"AAGAAAABgAD//////////wABgAAAAYAAAAGAAB////gf///4AAAAAAAAAAB////+f////nAAAA5wAAAOc///znP//84AAAAAAAAAAAf//+AH///gBwAA4AcAAOAHAADgB///4Af//+AAIAQAAOAHAABwDgAAMAwA//////////8="},{"c":"贰","a":0.973,"f":"NotoSansCJKsc-Regular","b":"AAAGcAAAB3AAAAc4AAAHGP////7////+AAAHAAAABwAAAAcAP//HAD//xwAAAAcAAAAHAP//9wD///cA///3AAAAAwAAAAMAP//DAD//wwA4AcOAOAHDgDhhwYA4YcGAOGHBwDjhwcAA4ADDAd4A4wePAOM/AeB//ADwPnAAcB4="},{"c":"貳","a":0.9865,"f":"NotoSansCJKsc-Regular","b":"AAAMYAAADHAAAAw4AAAMCP//////////AAAOAAAADgAf/44AH/+OAAAADgAAAA4Af//uAAAABgAAAAYAP//GADgBxgA4AccAOAHHAD//xwA4AccAOAHHAD//w4A4AcOAOAHDgj//w4MAAAHDBgQBww8PAOc8A8B/+AHgfnAAQDw="},{"c":"叁","a":1.0278,"f":"NotoSansCJKsc-Regular","b":"AAYAAAAPAAAAHhwAADweAADwB4AB4APAB///4A////AH/gA4AA4AGAAcAAAAHAAA//////////8A8A4AAOAHAAPAA8AHwAPgD///8B////z8AAAf8AAADmAAAAIAAAAAA///wAP//8AAAAAAAAAAAAAAAAAAAAAAP////D////w="},{"c":"參","a":0.9733,"f":"NotoSansCJKsc-Regular","b":"AAwAAAAcGAAAeBwAAeAHAAfP/4AP///AB4AA4AIAAEAHAAcADkPHcBzjjjg4Z9wYP/7//D48f44APDgGAPAPAAHgx4APh4HwPh8Afvx8CD9j4DwCAYB4AAAD4AAAH4DgAfwDwAPwB4ABAD4AAAD4AAAH8AAB/wAAB/wAAAfAAAA="},{"c":"肆","a":1.0,"f":"NotoSansCJKsc-Regular","b":"AAAGAB/8BgAf/AYAHAH//BwB//wcAAYMHAAGDB/4Bgwf+///HAP//xwABgwcAAYMH/gGDB/4BgwcAf/8HAH//BwABgD//AYA//wGAAcB//wGAf/8DiAGAAxwBgAcMAYAHDv//xg7//8/+AYAf/wGAH4MBgBACAYAAAAGAAAABgA="},{"c":"伍","a":1.0135,"f":"NotoSansCJKsc-Regular","b":"AMAAAADgAAAAwAAAAd///gOf//4DgDAABwAwAAcAMAAPAHAADwBwAB8AcAA/AHAAPwBwAPcf//jnH//4Zx//+AcA4DgHAOA4BwDgOAcAwDAHAMAwBwHAMAcBwDAHAcBwBwGAcAcBgHAHAYBwBwGAYAd///8Hf///B3///wcAAAA="},{"c":"陆","a":0.9595,"f":"NotoSansCJKsc-Regular","b":"AAAOAP+ADgD/4A4A4cAOAOHADgDhh//844f//OMADgDnAA4A5wAOAOYADgDuAA4A5wAOAOOf///jn///4Z///+DADgDgwA4A4MAOAODGDg7gxg4O48YODu+GDg7vBg4O4AYODuAGDg7gBg4O4AYODuAH//7gB//+4AAADuAAAA4="},{"c":"陸","a":0.9595,"f":"NotoSansCJKsc-Regular","b":"AAAcAP+AHAD/wBwA4c///OGP//zhj//844AcAOOAHADjABwA5wAcAOY///7mP//+5wAAAOOAwcDhg8Hg4YOAeODPAB7g/BwO4NwcBODAHADgwBwA4cAcAO+f//znH//84AAcAOAAHADgABwA4AAcAOAAHADg////4P///+AAAAA="},{"c":"柒","a":1.0,"f":"NotoSansCJKsc-Regular","b":"HADgAB8A4AAPwOAAAYDgBAAA4f5gAP/+fD//AB4/4AAEIOAAAIDgAAPA4AYDgOAGBwDgBhwA//48AH/8eAA/+CABgAAAAYAAAAGAAH////5////+f////gAf+AAAObwAAHmeAADxjwADwYPgD4GB+D4BgH74AYAeYAGABgABgAA="},{"c":"捌","a":0.9595,"f":"NotoSansCJKsc-Regular","b":"DAAAAwwf/AMMH/wDDBwcAwwcHMMMHBzDDBwcw/+cHMP/nBzDDhwcwwwf/MMMH/zDDB/8wwwDgMMMA4DDD8OAwx/DgMP/H/zD/B/8w8wDDMMMAwzDDAMMwwwDDMMMBhzDDAYcwwwGHAMMDBwDDAwcAwwcGAMMOTgHfHH4f3xh8D4="},{"c":"玖","a":0.9867,"f":"NotoSansCJKsc-Regular","b":"AAAwAAAAcAAAAHAA//BgAP/w4AD/8P/gBgD/4AYAwOAGAcDgBgGAwAYDgcAGA4HABgcBwH/nA8B/7gOABh4DgAYEB4AGAAfABgAPwAYAD8AGABzABgAc4AYQOOAH8HBwP/DwcP/A4DjwA8A4gAeAHAAPAB4APgAPABwABgAYAAI="},{"c":"拾","a":1.0,"f":"NotoSansCJKsc-Regular","b":"BwAOAAcADAAHAB4ABwAfAAcAOwAHADuABwBxwP/w4OD/8ODw/+HAeAcHgDwHB//+Bx7/7wcM/+YHCAAABxAAAAfwAAAf8AAA/8P/+P8D//hHAwA4BwMAOAcDADgHAwA4BwMAOAcDADgHAwA4BwMAOAcD//h+A//4fgMAODwDADg="},{"c":"佰","a":0.9467,"f":"NotoSansCJKsc-Regular","b":"AOAAAADAAAAA3///Ad///wGAHgADgBwAA4AcAAcAHAAHADgADwf//A8H//4fB//+PwYADn8GAA73BgAO5wYADmcGAA4HBgAOBwf//gcH//4HB//+BwYADgcGAA4HBgAOBwYADgcGAA4HBgAOBwf//gcH//4HBgAOBwYADgcGAAw="},{"c":"仟","a":1.0135,"f":"NotoSansCJKsc-Regular","b":"AMAAAADAABgBwAD4AYA/+AOH/8ADn/wABwwMAAcADAAOAAwAHgAMAB4ADAA+AAwAfgAMAOYADADmP///Rj///wYADAAGAAwABgAMAAYADAAGAAwABgAMAAYADAAGAAwABgAMAAYADAAGAAwABgAMAAYADAAGAAwABgAMAAYADAA="},{"c":"零","a":1.0,"f":"NotoSerifCJKsc-Regular","b":"AAAAYAAAAPAP///wAAOAABADgAQQA4AOH////zADgAxwA4AM8/O/mOADgBAAA4AAB/M/wAADgAAAD4AAAB5AAAA8MAAAcDgAAcOHgAcBw/wOAMD/YAADjAf//8AAAAeAAAAOAAAAGAAAcDAAAB9gAAAD4AAAAfAAAAB4AAAAOAA="},{"c":"〇","a":1.0,"f":"NotoSerifCJKsc-Regular","b":"AA/wAAB//gAA4AcAA4ABwAYAAGAMAAAwGAAAGBAAAAgwAAAMYAAABmAAAAZAAAACwAAAA8AAAAPAAAADwAAAA8AAAAPAAAADwAAAA8AAAANAAAACYAAABmAAAAYwAAAMEAAACBgAABgMAAAwBgAAYAOAAcAA4AcAAH/+AAAP8AA="},{"c":"一","a":8.0,"f":"NotoSerifCJKsc-Regular","b":"AAAACAAAAAgAAAAIAAAACAAAAAgAAAAIAAAACAAAABwAAAAcAAAAHAAAABwAAAAcAAAAHAAAABwAAAA+AAAAPgAAAD4AAAA+AAAAPwAAAD8AAAA///////////////////////////////////////////////////////////8="},{"c":"二","a":1.3846,"f":"NotoSerifCJKsc-Regular","b":"AAAAwAAAAOAAAAHwD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAcAAAAHv////8="},{"c":"三","a":1.1746,"f":"NotoSerifCJKsc-Regular","b":"AAAAAAAAADAAAAA4P////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAADwAf//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAMAAAAH/////8="},{"c":"四","a":0.9571,"f":"NotoSerifCJKsc-Regular","b":"gAAADP/////gMDgPwDAwDsAwMA7AMDAOwDAwDsAwMA7AMDAOwDAwDsAwMA7AMDAOwGAwDsBgMA7AYDAOwGAwDsDAMA7BgD/+wYA//sMAH/7GAAAOyAAADsAAAA7AAAAOwAAADsAAAA7////+wAAADsAAAA7AAAAOwAAADMAAAAA="},{"c":"五","a":1.1385,"f":"NotoSerifCJKsc-Regular","b":"AAAAMAAAADg////8AAcAAAAHAAAABgAAAAYAAAAGAAAABgAAAA4AAAAMAAAADAAAAAwAAAAMAwAP///AABgDwAAYA4AAGAOAABgDgAA4A4AAOAOAADgDgAAwA4AAMAOAADADgABwA4AAYAOAAGADgABgA4AAYAOMAOADnv////8="},{"c":"六","a":1.0141,"f":"NotoSerifCJKsc-Regular","b":"AAwAAAAHAAAAA4AAAAPAAAABwAAAAOAAAADgCAAA4AwAAAAe/////wAAAAAAAAAAAAAAAAAAAAAAMAgAAHwEAABwBgAAcAMAAOABgADgAMABwADgAYAAcAOAADADAAA4BgAAHA4AAAwMAAAOGAAADzAAAAcgAAAHQAAAB4AAAAI="},{"c":"七","a":1.0435,"f":"NotoSerifCJKsc-Regular","b":"ABwAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAMABgADwAYAB8AGAHwABg+AAA/AAAH+AAA/BgAAIAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAIABgACAAYAAgAGAAIABgAGAAYABgAHAA4AB///AAP//g="},{"c":"八","a":1.0563,"f":"NotoSerifCJKsc-Regular","b":"AAAQAAAAGAAAMBAAADgQAAAwEAAAcBAAAHAQAABwAAAAcAgAAHAIAABgCAAAYAgAAGAMAABgDAAAQAwAAMAGAADABgAAwAYAAYADAAGAAwADgAOAAwABgAMAAcAGAAHABAAA4AwAAPAMAAB4EAAAODAAADwgAAAfQAAADoAAAAQ="},{"c":"九","a":1.0135,"f":"NotoSerifCJKsc-Regular","b":"AB4AAAAcAAAAHAAAABwAAAAcAAAAHAAAABgAAAAYBgAAHA4AP///AAAYBgAAGAYAABgGAAAYBgAAOAYAADgGAAAwBgAAMAYAAHAGAABwBgAAYAYAAGAGAADABgABgAYCAYAGAgOABgICAAYCBAAGBgwABgYwAAf/YAAB+MAAAAA="},{"c":"十","a":0.9863,"f":"NotoSerifCJKsc-Regular","b":"AAHAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAOAAGAH/////8AAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA="},{"c":"百","a":0.9722,"f":"NotoSerifCJKsc-Regular","b":"AAAADAAAAB7/////AAOAAAADAAAAAwAAAAcAAAAGAAAEBABgB///8AcAAHAGAABgBgAAYAYAAGAGAABgBgAAYAYAAGAGAABgB///4AYAAGAGAABgBgAAYAYAAGAGAABgBgAAYAYAAGAGAABgBgAAYAf//+AGAABgBgAAYAYAAGA="},{"c":"千","a":0.9863,"f":"NotoSerifCJKsc-Regular","b":"AAAA4AAAD/AAAP/wAA/8AB/xgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGADAABgB7/////AAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA="},{"c":"万","a":1.0286,"f":"NotoSerifCJKsc-Regular","b":"AAAADAAAAA7/////ABwAAAAcAAAAHAAAABwAAAAcAAAAGAAAABgAAAAYAAAAH//gABgA4AA4AMAAOADAADAAwAAwAMAAcADAAHAAwABgAMAA4AHAAMABgADAAYABgAGAAwABgAMAA4AGAAMADAAHABgD/wAwAH4AYAA8AMAAEAA="},{"c":"两","a":0.9863,"f":"NotoSerifCJKsc-Regular","b":"AAAADAAAAA7/////ADA4AAAwMAAAMDAAADAwAAAwMAAwMDAIP////jAwMBwwMDAcMDAwHDAwMBwweDwcMHw2HDBuNxwwZzMcMONxnDDDYdwww2DcMIDA3DEAgNwxAIAcMgEAHDACABwwAAAcMAAAHDAAABwwAAP4MAAA+DAAAHA="},{"c":"兩","a":0.9861,"f":"NotoSerifCJKsc-Regular","b":"AAAADAAAAB7/////AAOAAAADgAAAA4AAAAOAAEADgAh////+cAOADnADgAxwA4AMcIOIDHCDjAxwQ4YMcGOCDHBzhwxwc4eMcPuNjHCbjcxxn5jMcR+QzHIPoMx0C4BMcAOADHADgAxwA4AMcAOADHADgAxwA4D8cAOAPHADgBg="},{"c":"萬","a":0.9865,"f":"NotoSerifCJKsc-Regular","b":"ADgOAAAwDAAAMAwO/////wAwDAAAMAwAADAMAAIAAGAD///wAwHAYAMBwGADAcBgA///4AMBwGADAcBgAwHAYAP//+ADAcBAAAHAABgBwBgf///+GAHAGBgBxBgYAccYGAHDmBn//5gY/gGYGIABmBgAABgYAAP4GAAAeBgAAHA="},{"c":"壹","a":0.9861,"f":"NotoSerifCJKsc-Regular","b":"AAHAAAABgAAAAYAcAAHAPgABgAAAAYAAAAGAYAABgPAAAAAAAAAAAAgAAAQIAAAOGAAADzgAAQ54AAGc8f//0MAAAAAAAAAAAQAAwAH//+ABgAHAAYABwAGAAcABgAHAAf//wAGACcABMA4AABgcAAAcGAAADDAMAAwgHv////8="},{"c":"贰","a":0.9865,"f":"NotoSerifCJKsc-Regular","b":"AAAPgAAADMAAAAxgAAAMaAAADAz////+AAAMAAACDAAABwwAH/+MAAAAjAAAAc4Af//uAAAABgAAAAYAGAHGABgBxgAYAYYAGGGHABhhhwAYYYMAGGGDgBhhg4AYYYGAGOGBwRjRgMERzgBiAYMAcgMDwH4OAcAeGADAD+AAQAc="},{"c":"貳","a":0.9865,"f":"NotoSerifCJKsc-Regular","b":"AAAcAAAAGMAAABhwAAAYMAAAGBwAABgeAAAYAAACGAAAAxgAP/+YAAAAGAAAAdwAf//cAAAADAAQAwwAH/+MABgDDgAYAwYAGAMGABgDBwAYAwcAGAMHABgDA4AYAwOAGAMBwR//AcEaAwDiB5wAcg4HAH4YA8AeMAHAD8AAgAc="},{"c":"叁","a":1.0714,"f":"NotoSerifCJKsc-Regular","b":"AAMAAAAHgAAADwAAAB4IAAA4BgAA4AHAA4AB4AcP/vAP/8BwB/4AMAQPADAADgAIABwAHv////4AMAgAAHAGAADAAwABgAnAA4Ac8AZ//nwcAAA/YAAABIAAAAAAAAGAAAADwAP//8AAAAAAAAAAAAAAAAAAAAAYAAAAOD////4="},{"c":"參","a":0.9605,"f":"NotoSerifCJKsc-Regular","b":"AAIAAAAHgAAADhAAABwOAABwB4ABwf+AAf/hwAH8AoADAAeAB4AGQAYDBjAMM8gcGB+4fH/+f45/HDgGODgYAABgjgAA4ceAAYPD4AYPAHwMHBg/YGB4BIHA8AAGA8CAAA4D4AA4B4AA4B8AAAB4AAAD4AAAHwAAAfgAAA8AAAA="},{"c":"肆","a":1.0274,"f":"NotoSerifCJKsc-Regular","b":"AAAOABAwDAAf+AwAGAAMMBgB//gYIAwwGHAMMB/4DDQYAAw2GAf//xgADDAYcAwwH/gMMBgADDAYAf/wGAgMMBgcDAD//gwABgAMMAcD//gOAAwADEAMABxgDAAYcAwIEDAMHiP4DAB/GAwAfBgMACAIDAAAAAwAAAAMAAAADAA="},{"c":"伍","a":1.0135,"f":"NotoSerifCJKsc-Regular","b":"AYAAAAHgAAABgAAQA4AAOAO///wDAHAABwBwAAYAYAAGAGAADgBgAA4AYAAeAGAAHgDgADYAwEAmP//gZgDA8MYAwOCGAcDgBgGA4AYBgOAGAYDgBgGA4AYBgOAGAYDgBgGA4AYDgOAGAwDgBgMA4AYDAOQG////BgAAAAYAAAA="},{"c":"陆","a":0.9595,"f":"NotoSerifCJKsc-Regular","b":"AAAeAIGAHAD/wBwAwYAcAMGAHADDgBwQwx///MMAHADGABwAxgAcAMQAHADAABwAwAAcAMYAHA7Df///wwAcAMGAHADBgBwAwYAcAMGcHBzBnBwYwZwcGN+cHBjHnBwYx5wcGMQcHBjAHBwYwBwcGMAcHBjAP//4wAgAGMAAABg="},{"c":"陸","a":0.9324,"f":"NotoSerifCJKsc-Regular","b":"AAAeAACAHADhwBwAwfAcMMHAHDjDj//8w4AcAMMAHADCABwAwgAcAMQAHA7EP///xAAAAMIA44DDAcDgwwOAeMGHHhzBxhwOwcgcDsDQHADAwBwwwcAcON/P//zHwBwAw4AcAMIAHADAABwAwAAcBMAAHA7A////wAAAAMAAAAA="},{"c":"柒","a":1.0,"f":"NotoSerifCJKsc-Regular","b":"CABwAAYAYAADgGAAAYhgGAEQYBwwIGA+HEBnwAzA/AAEh+AAAbhgAAMAYAQGAGAEPABgBAwAf/4MAH/+DgA/+A4BwAAOAYAAAAGACAABgB5/////AA+gAAAdkAAAOZgAAHGMAADhhwADwYPgBwGB+AwBgH8wAYAcwAGABAABgAA="},{"c":"捌","a":0.9865,"f":"NotoSerifCJKsc-Regular","b":"DgAADA4AEA8OGDgODhg5jg4YOc4OGDmOD5g5jg/YOY7/+DmODhg5jg4YOY4OH/mODhg5jg4HAY4OxgGODwYBjh4GOY5+f/2O/gY5jk4GOY4OBDmODgQ5jg4MMY4ODDGODgwxjg4YMA4OGDAODhAwDg4gMA7+b+D+HMHAPB2BwBg="},{"c":"玖","a":1.0135,"f":"NotoSerifCJKsc-Regular","b":"AABwAAAgcAAAMHAA//hgAAYAYEAGAODABgD/8AYAwMAGAYHABgGBwAYBgcAGIwGABnIBgH/2A4AGBAMABggHgAYQBoAGEA6ABgAOgAYAHMAGABjABgAwQAZwcGAHwGBgPwDAMPwBgDDgAwA4AAYAHAAMAB4AMAAPAGAABgCAAAQ="},{"c":"拾","a":1.0405,"f":"NotoSerifCJKsc-Regular","b":"B4AcAAYAHAAGABgABgA6AAYAMwAGAHEABjBhgAYw4MB/+MDgBgGAYAYBgDgGAwC8BhYB3gbN/+4HiAAEBxAAAD4AAAD+AAAA5gYAMEYGADgGBgAwBgYAMAYGADAGBgAwBgYAMAYGADAGBgAwBgYAMAYH//A+BgAwDgYAMAwGACA="},{"c":"佰","a":1.0,"f":"NotoSerifCJKsc-Regular","b":"AcAAAAHgAAQBwAAOA5///wOADAADgBwAAwAcAAYAGAAGABgADgAQCA4H//weBgAcHgYAGDYGABgmBgAYZgYAGMYGABiGBgAYBgYAGAYGABgGBgAYBgYAGAYGABgGBgAYBgYAGAYGABgGBgAYBgYAGAYH//gGBgAYBgYAGAYEABg="},{"c":"仟","a":1.0,"f":"NotoSerifCJKsc-Regular","b":"AMAAIADwAPgBwAP4AcB/gAOH+AADvBgAAwAYAAcAGAAGABgABgAYAA4AGAAeABgAHgAYABYAGA4mf///ZgAcAEYAGACGABgABgAYAAYAGAAGABgABgAYAAYAGAAGABgABgAYAAYAGAAGABgABgAYAAYAGAAGABgABgAYAAYAGAA="},{"c":"八","a":1.0597,"f":"supplied-example","b":"AH4+AAB+PwAAfj8AAH4/AAB+PwAAfD8AAHw/AAB8PwAAfD8AAHw/AAB8PwAAfB8AAPwfgAD8H4AA/B+AAPgPgAH4D8AB+A/AAfAHwAPwB+AD8APgB+AD8AfAAfAPgAH4D4AA/B8AAHw+AAA+fAAAH/gAAB/4AAAP8AAAB0AAAAE="},{"c":"万","a":1.1385,"f":"supplied-example","b":"H////x////8f////H////x////8APwAAAD8AAAA/AAAAPwAAAD//+AA///gAP//4AD//+AA///gAPgH4AH4B+AB+AfgAfAH4AHwB+AD8AfgA/AH4APgB+AH4AfgD+AH4A/AB8AfgA/APwAPwH8D/8B+A/+C+AP/gvAA/wDAAAAA="},{"c":"一","a":6.9,"f":"supplied-example","b":"//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8="},{"c":"千","a":1.1212,"f":"supplied-example","b":"AAAD+AAB//gP///4D///+Af///gH//gAAAPwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAD////8/////P////z////8AA/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAD4AA="},{"c":"四","a":1.0492,"f":"supplied-example","b":"///////////////////////////8fn4//H5+P/x+fj/8fn4//H5+P/x8fj/8fH4//Hx+P/z8fj/8/H4//Px+P/34f///+H////B////gP///gA///wAAP/wAAD/8AAA//AAAP/wAAD/8AAA////////////////+/////v////A="},{"c":"百","a":1.0794,"f":"supplied-example","b":"//////////////////////////8AD8AAAA/AAAAPgAAf///4H///+B////gf///4H///+B8AAPgfAAD4HwAA+B8AAPgfAAD4H///+B////gf///4H///+B8AAPgfAAD4HwAA+B8AAPgfAAD4H///+B////gf///4H///8B///8A="},{"c":"八","a":1.0597,"f":"supplied-example","b":"AH4+AAB+PwAAfj8AAH4/AAB+PwAAfD8AAHw/AAB8PwAAfD8AAHw/AAB8PwAAfB8AAPwfgAD8H4AA/B+AAPgPgAH4D8AB+A/AAfAHwAPwB+AD8APgB+AD8AfAAfAPgAH4D4AA/B8AAHw+AAA+fAAAH/gAAB/4AAAP8AAAB0AAAAE="},{"c":"十","a":1.0882,"f":"supplied-example","b":"AAHwAAAB8AAAAfAAAAHwAAAB8AAAAfAAAAHwAAAB8AAAAfAAAAHwAAAB8AAf////H////x////8f////H////wAB8AAAAfAAAAHwAAAB8AAAAfAAAAHwAAAB8AAAAfAAAAHwAAAB8AAAAfAAAAHwAAAB8ACAAfAAgAHwAAAB4AA="},{"c":"六","a":1.0,"f":"supplied-example","b":"AAOAAAAPwAAAD8AAAAfgAAAH4AAAB+AAAAHwAP//////////////////////////AAAAAAAAAAAAeAcAAP4fAAD8P4AB/B+AAfgfwAP4D8AD+A/gA/AH8AfgA/AH4AH4D8AB+B+AAPw/AAB+PgAAPnwAAB/8AAAP+AAAB2AAAAM="}];
  const N = 32, PIXELS = N*N;
  const DIGITS = {零:0,'〇':0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const VARIANTS = {'〇':'零',两:'二',兩:'二',壹:'一',弌:'一',贰:'二',貳:'二',弍:'二',叁:'三',參:'三',叄:'三',肆:'四',伍:'五',陆:'六',陸:'六',柒:'七',捌:'八',玖:'九',拾:'十',佰:'百',仟:'千',萬:'万'};
  const UNITS = {十:10,百:100,千:1000,万:10000};
  const words = '零一二三四五六七八九';
  const MAX_VALUE = 99999999, MAX_GLYPHS = 18;

  function canonical(number) {
    if (!Number.isInteger(number) || number < 0 || number > MAX_VALUE) throw new RangeError('Expected an integer from 0 through 99999999.');
    if (number === 0) return '零';
    function section(value, omitLeadingOne=true) {
      let result='', gap=false;
      for (const [unit,word] of [[1000,'千'],[100,'百'],[10,'十'],[1,'']]) {
        const d=Math.floor(value/unit)%10;
        if (!d) { if (result) gap=true; continue; }
        if (gap) result+='零';
        if (!(omitLeadingOne && d===1 && unit===10 && !result)) result+=words[d];
        result+=word;gap=false;
      }
      return result;
    }
    if (number<10000) return section(number);
    const high=Math.floor(number/10000),low=number%10000;
    return section(high)+'万'+(low?(low<1000?'零':'')+section(low,false):'');
  }

  function decode(input) {
    const normalized = Array.from(String(input).replace(/\s+/g,'')).map(c => VARIANTS[c] || c).join('');
    const bad = error => ({ok:false,output:'',normalized,error});
    if (!normalized) return bad('Enter a Chinese number.');
    if (!/^[零一二三四五六七八九十百千万]+$/.test(normalized)) return bad('Use Chinese numeral characters only.');
    if (!/[十百千万]/.test(normalized)) {
      const digits=Array.from(normalized).map(c => DIGITS[c]).join('').replace(/^0+/,'');
      if (!digits || digits.length>8) return bad('The result must be an integer from 1 through 99999999.');
      const output=String(Number(digits));
      return {ok:true,output,normalized};
    }
    let total=0, section=0, pending=null, last=Infinity, seenWan=false;
    const body=normalized.replace(/^零+/, '');
    if (!body) return bad('Invalid Chinese number.');
    let previous='';
    for (const c of body) {
      if (Object.prototype.hasOwnProperty.call(DIGITS,c)) {
        const d=DIGITS[c];
        if (pending!==null && pending!==0) return bad('A unit-form number cannot contain adjacent nonzero digits.');
        if (!d && previous==='零') return bad('Do not repeat a zero marker inside a place-value number.');
        pending=d;
        previous=c;
        continue;
      }
      const unit=UNITS[c];
      if (unit===10000) {
        if (seenWan || (!section && !pending) || pending===0) return bad('The ten-thousands unit needs one valid leading amount.');
        total=(section+(pending||0))*10000;
        if (total>MAX_VALUE) return bad('The result must be an integer from 1 through 99999999.');
        seenWan=true;section=0;pending=null;last=Infinity;
      } else {
        if (unit>=last) return bad('Chinese place-value units must decrease.');
        let amount=pending;
        if (amount===null && unit===10 && !section) amount=1;
        if (!amount) return bad('Each place-value unit needs a nonzero digit.');
        section+=amount*unit;pending=null;last=unit;
      }
      previous=c;
    }
    if (pending===0) return bad('A zero marker cannot end a place-value number.');
    const value=total+section+(pending||0);
    if (value<1 || value>MAX_VALUE) return bad('The result must be an integer from 1 through 99999999.');
    // These puzzles omit 零 between skipped positions. Every bare final digit is ones:
    // 七千六 = 7006, 五百一万 = 5010000. Do not apply colloquial implied trailing units.
    return {ok:true,output:String(value),normalized};
  }

  function distance(mask) {
    const d=new Uint8Array(PIXELS); d.fill(15);
    for(let i=0;i<PIXELS;i++) if(mask[i]) d[i]=0;
    for(let y=0;y<N;y++) for(let x=0;x<N;x++) {
      const i=y*N+x;
      if(x) d[i]=Math.min(d[i],d[i-1]+1);
      if(y) d[i]=Math.min(d[i],d[i-N]+1);
    }
    for(let y=N-1;y>=0;y--) for(let x=N-1;x>=0;x--) {
      const i=y*N+x;
      if(x<N-1) d[i]=Math.min(d[i],d[i+1]+1);
      if(y<N-1) d[i]=Math.min(d[i],d[i+N]+1);
    }
    return d;
  }
  const templates=RAW.map(t=>{
    const bytes=atob(t.b), data=new Uint8Array(PIXELS), positions=[];
    for(let i=0;i<PIXELS;i++) {
      data[i]=(bytes.charCodeAt(i>>3)>>(7-(i&7)))&1;
      if(data[i]) positions.push(i);
    }
    return {char:t.c,aspect:t.a,data,positions,dist:distance(data)};
  });

  // Per-column ink extents, computed once per sample, so a crop's bounding box costs O(columns) instead of O(rows × columns).
  const EXTENTS=new WeakMap();
  function extents(sample) {
    let e=EXTENTS.get(sample);
    if(e) return e;
    const {width:w,height:h,data}=sample;
    const minY=new Int32Array(w).fill(h), maxY=new Int32Array(w).fill(-1);
    for(let y=0;y<h;y++){const row=y*w; for(let x=0;x<w;x++) if(data[row+x]){ if(y<minY[x]) minY[x]=y; maxY[x]=y; }}
    e={minY,maxY}; EXTENTS.set(sample,e); return e;
  }

  // Ink bounding box of columns [x0,x1) — identical to scanning every pixel in that range.
  function inkBox(sample,x0,x1) {
    const {width:w,height:h}=sample, {minY,maxY}=extents(sample);
    x0=Math.max(0,Math.floor(x0));x1=Math.min(w,Math.ceil(x1));
    let left=x1,right=x0,top=h,bottom=-1;
    for(let x=x0;x<x1;x++) if(maxY[x]>=0){
      if(x<left) left=x; right=x;
      if(minY[x]<top) top=minY[x];
      if(maxY[x]>bottom) bottom=maxY[x];
    }
    if(bottom<top || right<left) return null;
    return {left,right,top,bottom};
  }

  // Builds the 32×32 glyph from an ink box. The result depends only on the box, so identical boxes share one classification.
  function glyphFromBox(sample,box) {
    const {width:w,data}=sample, {left,right,top,bottom}=box;
    const bw=right-left+1,bh=bottom-top+1;
    const mask=new Uint8Array(PIXELS), positions=[];
    for(let y=0;y<N;y++) for(let x=0;x<N;x++) {
      const yy=top+Math.min(bh-1,Math.floor((y+.5)*bh/N));
      const xx=left+Math.min(bw-1,Math.floor((x+.5)*bw/N));
      const i=y*N+x; mask[i]=data[yy*w+xx];
      if(mask[i]) positions.push(i);
    }
    return {mask,positions,dist:distance(mask),aspect:bw/bh,box:{x:left,y:top,w:bw,h:bh}};
  }

  // Exact-equivalent of the original exhaustive classifier, but pruned:
  //  - templates are visited nearest-aspect-first (aspect penalty is a lower bound on the score),
  //  - the glyph→template half of the chamfer sum gives a second lower bound before the other half is computed,
  //  - both sums abort early once they cannot beat the current best.
  // Ties still resolve to the earliest template, and a best score above `limit` (default 1.75) means "no match".
  const TCOUNT=templates.length, TPOS=templates.map(t=>Uint16Array.from(t.positions));
  const BYASPECT=templates.map((t,i)=>({i,l:Math.log(t.aspect)})).sort((p,q)=>p.l-q.l||p.i-q.i);
  const ASPECT_LOGS=Float64Array.from(BYASPECT,e=>e.l);
  const LIMIT=1.75, EPS=1e-9;
  function classify(glyph,limit=LIMIT) {
    if (!glyph || glyph.positions.length<3) return null;
    const gp=Uint16Array.from(glyph.positions), gn=gp.length, gd=glyph.dist;
    const lg=Math.log(glyph.aspect);
    let hi=0, top=TCOUNT;
    while(hi<top){const mid=(hi+top)>>1; if(ASPECT_LOGS[mid]<lg) hi=mid+1; else top=mid;}
    let lo=hi-1;
    let bestIdx=-1,bestScore=Infinity,bestShape=0,bestAspect=0;
    while(lo>=0 || hi<TCOUNT) {
      const dl=lo>=0?lg-ASPECT_LOGS[lo]:Infinity, dh=hi<TCOUNT?ASPECT_LOGS[hi]-lg:Infinity;
      const near=Math.min(dl,dh);
      const bound=bestIdx>=0?bestScore:limit;
      if(1.25*Math.min(1.7,near)-EPS>bound) break;           // every remaining template is at least this far in aspect
      const k=(dl<=dh?BYASPECT[lo--]:BYASPECT[hi++]).i;
      const t=templates[k], td=t.dist, tp=TPOS[k], tn=tp.length;
      const aspect=Math.min(1.7,Math.abs(Math.log(glyph.aspect/t.aspect)));
      const ap=1.25*aspect;
      if(ap-EPS>bound) continue;
      let a=0, dead=false;
      for(let n=0;n<gn;n++){
        a+=Math.min(5,td[gp[n]]);
        if((n&63)===63 && (a/gn)/2+ap-EPS>bound){dead=true;break;}
      }
      if(dead) continue;
      const A=a/gn;
      if(A/2+ap-EPS>bound) continue;
      let b=0;
      for(let n=0;n<tn;n++){
        b+=Math.min(5,gd[tp[n]]);
        if((n&63)===63 && (A+b/tn)/2+ap-EPS>bound){dead=true;break;}
      }
      if(dead) continue;
      const shape=(A+b/tn)/2;
      const score=shape+1.25*aspect;
      if(bestIdx<0 ? score<=limit : (score<bestScore || (score===bestScore && k<bestIdx))) {
        bestIdx=k;bestScore=score;bestShape=shape;bestAspect=aspect;
      }
    }
    if(bestIdx<0) return null;
    return {char:templates[bestIdx].char,score:bestScore,shape:bestShape,aspect:bestAspect,box:glyph.box};
  }

  function getBounds(sample) {
    if(sample.bounds) return sample.bounds;
    const {width,height,data}=sample;
    let x=width,y=height,r=-1,b=-1;
    for(let yy=0;yy<height;yy++) for(let xx=0;xx<width;xx++) if(data[yy*width+xx]) {
      x=Math.min(x,xx);y=Math.min(y,yy);r=Math.max(r,xx);b=Math.max(b,yy);
    }
    return r<0?null:{x,y,w:r-x+1,h:b-y+1};
  }

  function recognize(sample) {
    if(!sample || !sample.width || !sample.height || !sample.data) return null;
    const bounds=getBounds(sample);
    if(!bounds || bounds.h<2 || bounds.w<5) return null;
    // Filled dots are valid Morse/Braille geometry, never a Chinese numeral glyph.
    // Compare the silhouette to an ellipse so square Chinese components and 〇 rings stay eligible.
    if(sample.components && sample.components.length) {
      const maxArea=Math.max(...sample.components.map(c=>c.area||0));
      const relevant=sample.components.filter(c=>(c.area||0)>=Math.max(3,maxArea*.05));
      const disk=c=>{
        if(c.w/c.h<.65 || c.w/c.h>1.5 || (c.area||0)/(c.w*c.h)<.55) return false;
        let bestFit=0;
        for(const shrink of [0,1]) {
          let intersection=0,union=0;
          for(let yy=0;yy<c.h;yy++) for(let xx=0;xx<c.w;xx++) {
            const ellipse=Math.pow((xx+.5-c.w/2)/((c.w-shrink)/2),2)+Math.pow((yy+.5-c.h/2)/((c.h-shrink)/2),2)<=1;
            const ink=!!sample.data[(c.y+yy)*sample.width+c.x+xx];
            if(ellipse&&ink) intersection++;
            if(ellipse||ink) union++;
          }
          bestFit=Math.max(bestFit,intersection/union);
        }
        return bestFit>.88;
      };
      if(relevant.length && relevant.every(disk)) return null;
      const marks=relevant.map(c=>({c,kind:disk(c)?'.':(c.w/c.h>=2.05&&c.w/c.h<=5.7&&(c.area||0)/(c.w*c.h)>=.68?'-':null)}));
      if(marks.length && marks.every(m=>m.kind) && marks.some(m=>m.kind==='-')) {
        // A Morse line can have separate dash and dot baselines, but each kind is aligned.
        // This check does not reject the vertically separated bars of Chinese 二 or 三.
        const aligned=['.','-'].every(kind=>{
          const group=marks.filter(m=>m.kind===kind).map(m=>m.c);
          if(!group.length) return true;
          const centers=group.map(c=>c.y+(c.h-1)/2);
          const averageHeight=group.reduce((sum,c)=>sum+c.h,0)/group.length;
          return Math.max(...centers)-Math.min(...centers)<=averageHeight*.65;
        });
        if(aligned) return null;
      }
    }
    // Full-height Chinese glyphs generally have square cells. For horizontal-only rows,
    // use separate x-runs; a normal row is solved by a constrained character-grid search.
    let best=null;
    const candidates=[];
    const {width,height,data}=sample;
    let start=null;const runs=[];
    for(let x=bounds.x;x<bounds.x+bounds.w;x++) {
      let ink=false;for(let y=bounds.y;y<bounds.y+bounds.h;y++) if(data[y*width+x]){ink=true;break;}
      if(ink && start===null) start=x;
      if(start!==null && (!ink || x===bounds.x+bounds.w-1)) {
        runs.push([start,ink?x+1:x]);start=null;
      }
    }
    let candidateOrder=0;
    if(runs.length>=1 && runs.length<=MAX_GLYPHS) {
      // Preserve this original run-based candidate as the first tie-break choice.
      candidates.push({pieces:runs,order:candidateOrder++,priority:-1});
    }
    const offsets=[-.025,.02,.065,.11];
    for(let n=1;n<=MAX_GLYPHS;n++) {
      const pitch=bounds.w/n;
      if(pitch<bounds.h*.66 || pitch>bounds.h*1.68) continue;
      for(const l of offsets) for(const r of offsets) {
        const x0=bounds.x-bounds.h*l;
        const p=(bounds.w+bounds.h*(l+r))/n;
        // Try the most plausible character width and least-shifted grids first. A good
        // incumbent lets the existing lower-bound pruning reject more later work.
        const priority=Math.abs(Math.log((p/bounds.h)))+.02*(Math.abs(l)+Math.abs(r));
        candidates.push({pieces:Array.from({length:n},(_,i)=>[x0+i*p,x0+(i+1)*p]),order:candidateOrder++,priority});
      }
    }
    candidates.sort((a,b)=>a.priority-b.priority || a.order-b.order);
    // The result is only returned when the best candidate scores <= .78, and a candidate's score is
    // .68*mean + .32*max. So once a candidate provably exceeds min(.78, best so far) it cannot change the
    // outcome and is abandoned early; each piece is classified only up to the largest score it may still have.
    const cache=new Map(), boxCache=new Map();
    const pieceLimit=(sp,mp,n,ceil)=>{
      const s1=(ceil-.68*sp/n)/(.68/n+.32);
      const s=s1>=mp?s1:(ceil-.32*mp)*n/.68-sp;
      return Math.min(1.75,s+1e-9);
    };
    const piece=(x0,x1,lim)=>{
      const key=Math.floor(x0)+','+Math.ceil(x1);
      const e=cache.get(key);
      if(e!==undefined && (e.c!==null || e.lim>=lim)) return e.c;
      const box=inkBox(sample,x0,x1);
      let c=null,used=Infinity;
      if(box){
        const bkey=box.left+','+box.top+','+box.right+','+box.bottom;
        const be=boxCache.get(bkey);
        if(be!==undefined && (be.c!==null || be.lim>=lim)){c=be.c;used=be.lim;}
        else {c=classify(glyphFromBox(sample,box),lim);used=lim;boxCache.set(bkey,{c,lim});}
      }
      cache.set(key,{c,lim:used});
      return c;
    };
    for(const candidate of candidates) {
      const {pieces,order}=candidate;
      const letters=[];let sum=0,max=0,invalid=false;
      const n=pieces.length, ceil=best?Math.min(.78,best.score):.78;
      for(const [x0,x1] of pieces) {
        const lim=pieceLimit(sum,max,n,ceil);
        const c=piece(x0,x1,lim);
        if(!c || c.score>lim){invalid=true;break;}
        letters.push(c);sum+=c.score;max=Math.max(max,c.score);
      }
      if(invalid || !letters.length) continue;
      const text=letters.map(x=>x.char).join('');
      const decoded=decode(text);
      if(!decoded.ok) continue;
      const mean=sum/letters.length;
      const score=mean*.68+max*.32;
      if(!best || score<best.score || (score===best.score && order<best.order)) best={text,letters,score,max,mean,decoded,order};
    }
    if(!best || best.score>.78 || best.max>1.14) return null;
    const hasUnits=/[十百千万拾佰仟萬]/.test(best.text);
    const confidence=Math.max(.50,Math.min(.995,1-best.score*.30));
    // A row made entirely of thin horizontal strokes can also be Morse. Mark it low-confidence
    // so the application can use original image positions and its dedicated dot detector.
    const horizontalOnly=best.letters.every(c=>c.box.w/c.box.h>3.4);
    const possibleMorseDash=horizontalOnly&&best.letters.every(c=>c.box.w/c.box.h<=5.7);
    return {text:best.text,confidence:possibleMorseDash?Math.min(.62,confidence):confidence,
      boxes:best.letters.map(c=>({...c.box,label:c.char})),
      diagnostics:[`Chinese glyph recognition: ${best.letters.length} characters.`,
        `Offline shape score ${best.score.toFixed(3)}; ${hasUnits?'place-value':'digit-sequence'} notation.`,
        ...(possibleMorseDash?['Horizontal strokes alone need the original image position to distinguish Chinese 一 from Morse dashes.']:[])]};
  }
  global.ChineseVision={recognize,decode,canonical};
})(typeof window!=='undefined'?window:globalThis);



(function(){
'use strict';
  const C = window.CipherCore;
  const el = id => document.getElementById(id);

  // Core DOM element references
  const fileInput = el('fileInput'), dropzone = el('dropzone'), resetBtn = el('resetBtn'), pasteBtn = el('pasteBtn');
  const mobilePasteModal = el('mobilePasteModal'), mobilePasteTarget = el('mobilePasteTarget'), closePasteModal = el('closePasteModal'), pasteModalGalleryBtn = el('pasteModalGalleryBtn');
  const modalLinkInput = el('modalLinkInput'), modalLoadLinkBtn = el('modalLoadLinkBtn'), modalClipboardBtn = el('modalClipboardBtn');
  const stampWord = el('stampWord'), stampWordDesc = el('stampWordDesc'), stampMain = el('stampMain'), stampDesc = el('stampDesc'), stamps = el('stamps'), stampLabel = el('stampLabel'), stampDescLabel = el('stampDescLabel');
  const wordsStamps = [
    { key: 'normalLR', stamp: el('stampWordsNormalLR'), word: el('stampWordNormalLR'), label: 'normal lr' },
    { key: 'normalRL', stamp: el('stampWordsNormalRL'), word: el('stampWordNormalRL'), label: 'normal rl' },
    { key: 'evenLR', stamp: el('stampWordsEvenLR'), word: el('stampWordEvenLR'), label: 'even lr' },
    { key: 'evenRL', stamp: el('stampWordsEvenRL'), word: el('stampWordEvenRL'), label: 'even rl' },
    { key: 'oddLR', stamp: el('stampWordsOddLR'), word: el('stampWordOddLR'), label: 'odd lr' },
    { key: 'oddRL', stamp: el('stampWordsOddRL'), word: el('stampWordOddRL'), label: 'odd rl' },
  ];
  const colorStamps = [
    { color: 'green',  stamp: el('stampColorGreen'),  word: el('stampWordGreen') },
    { color: 'purple', stamp: el('stampColorPurple'), word: el('stampWordPurple') },
    { color: 'orange', stamp: el('stampColorOrange'), word: el('stampWordOrange') },
    { color: 'red',    stamp: el('stampColorRed'),    word: el('stampWordRed') },
    { color: 'blue',   stamp: el('stampColorBlue'),   word: el('stampWordBlue') },
    { color: 'black',  stamp: el('stampColorBlack'),  word: el('stampWordBlack') },
  ];
  const emptyColors = () => ({ green: '', purple: '', orange: '', red: '', blue: '', black: '' });
  let colorAnswers = emptyColors();
  const previewRow = el('previewRow'), previewMeta = el('previewMeta'), previewCanvas = el('preview');
  const mapPanel = el('mapPanel'), moveCopy = el('moveCopy'), mapCanvas = el('mapCanvas');
  const mapCtx = mapCanvas.getContext('2d', { willReadFrequently: true });
  const mapCount = el('mapCount'), mapUndoBtn = el('mapUndo'), mapCopyBtn = el('mapCopy'), mapSaveBtn = el('mapSave');
  const layerMapBtn = el('layerMapBtn'), layerVentBtn = el('layerVentBtn'), ventShowBtn = el('ventShowBtn'), mapClearLayerBtn = el('mapClearLayer'), mapClearSlotBtn = el('mapClearSlot');
  const results = el('results'), resultsLabel = el('resultsLabel'), cellsWrap = el('cellsWrap'), hint = el('hint'), answerStatus = el('answerStatus'), srLive = el('srLive');
  const copyToggle = el('copyToggle'), copyAnswerBtn = el('copyAnswerBtn'), copiedToast = el('copiedToast');
  const modeSub = el('modeSub'), dzIcon = el('dzIcon'), modeBtns = document.querySelectorAll('.mode-btn');
  const rawInput = el('rawInput'), manualEditor = el('manualEditor'), applyTextBtn = el('applyTextBtn'), discardTextBtn = el('discardTextBtn');
  const editStatus = el('editStatus'), manualHelp = el('manualHelp');
  const aboutBtn = el('aboutBtn'), aboutBackBtn = el('aboutBackBtn'), mainView = el('mainView'), aboutView = el('aboutView');
  const caesarControls = el('caesarControls'), caesarShiftInput = el('caesarShiftInput');
  const colortextControls = el('colortextControls');
  const captchaPanel = el('captchaPanel');
  let caesarGroups = [];
  let colorWordGroups = [];
  let lastCaesarLetters = '';
  CipherState.colorWordItems = [];
  CipherState.caesarShift = 0;
  CipherState.colorFilter = 'purple';

  // --- UI/UX MODES & SETTINGS OVERHAUL ---
  const UI_MODES_KEY = 'mann_bot_ui_modes';
  const DEFAULT_UI_MODES = {
    caesar: 'classic',
    colortext: 'enhanced',
    sort: 'enhanced',
    words: 'enhanced',
    captcha: 'enhanced',
    ciphers: 'enhanced',
    map: 'enhanced'
  };
  function loadUiModes() {
    try {
      const raw = localStorage.getItem(UI_MODES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.caesar === 'enhanced') parsed.caesar = 'classic';
        return Object.assign({}, DEFAULT_UI_MODES, parsed);
      }
    } catch (e) {}
    return Object.assign({}, DEFAULT_UI_MODES);
  }
  function saveUiModes(m) {
    try { localStorage.setItem(UI_MODES_KEY, JSON.stringify(m)); } catch (e) {}
  }
  CipherState.uiModes = loadUiModes();

  const caesarEnhancedControls = el('caesarEnhancedControls');
  const caesarStepDown = el('caesarStepDown'), caesarStepUp = el('caesarStepUp'), caesarResetBtn = el('caesarResetBtn');
  const caesarShiftNum = el('caesarShiftNum'), caesarShiftLeftTag = el('caesarShiftLeftTag'), caesarShiftRightTag = el('caesarShiftRightTag');
  const caesarShiftRange = el('caesarShiftRange');
  const caesarEnhancedLeftText = el('caesarEnhancedLeftText'), caesarEnhancedRightText = el('caesarEnhancedRightText');
  const caesarCardLeft = el('caesarCardLeft'), caesarCardRight = el('caesarCardRight');
  const caesarCopyLeftBtn = el('caesarCopyLeftBtn'), caesarCopyRightBtn = el('caesarCopyRightBtn');
  const caesarMapPairs = el('caesarMapPairs'), caesarShiftsGrid = el('caesarShiftsGrid');
  const colortextEnhancedControls = el('colortextEnhancedControls');
  const colortextSwatchesGrid = el('colortextSwatchesGrid');
  const colortextActiveName = el('colortextActiveName'), colortextActiveWords = el('colortextActiveWords');
  const colortextCopyActiveBtn = el('colortextCopyActiveBtn'), colortextCopyAllBtn = el('colortextCopyAllBtn');
  const sortEnhancedRibbon = el('sortEnhancedRibbon'), sortAscBtn = el('sortAscBtn'), sortDescBtn = el('sortDescBtn');
  const wordsEnhancedFilter = el('wordsEnhancedFilter');
  const settingsNav = el('settingsNav');

  function syncUiModesToSettings() {
    document.querySelectorAll('.mode-switch-group').forEach(grp => {
      const mod = grp.dataset.mod;
      const current = (CipherState.uiModes && CipherState.uiModes[mod]) || 'enhanced';
      grp.querySelectorAll('.mode-switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.modeVal === current);
      });
      const badge = el('badge' + mod.charAt(0).toUpperCase() + mod.slice(1) + 'Mode');
      if (badge) {
        badge.textContent = current.toUpperCase();
        badge.style.background = current === 'enhanced' ? 'rgba(173,122,46,0.15)' : 'rgba(33,29,23,0.08)';
        badge.style.borderColor = current === 'enhanced' ? 'var(--brass)' : 'var(--line)';
        badge.style.color = current === 'enhanced' ? 'var(--brass-deep)' : 'var(--ink-soft)';
      }
    });
  }

  function updateColorTextBadges() {
    const counts = { green: 0, purple: 0, orange: 0, red: 0, blue: 0, black: 0, all: 0 };
    if (CipherState.colorWordItems && CipherState.colorWordItems.length > 0) {
      CipherState.colorWordItems.forEach(it => {
        if (!it.skipped) {
          const c = String(it.color || 'black').toLowerCase();
          if (counts[c] !== undefined) counts[c]++;
          counts.all++;
        }
      });
    }
    ['green','purple','orange','red','blue','black','all'].forEach(c => {
      const b = el('badge' + c.charAt(0).toUpperCase() + c.slice(1));
      if (b) {
        b.textContent = counts[c];
        const chip = document.querySelector(`.color-swatch-chip[data-color="${c}"]`);
        if (chip) chip.style.opacity = (counts[c] > 0 || c === 'all') ? '1' : '0.5';
      }
    });
    const curColor = String(CipherState.colorFilter || 'purple').toLowerCase();
    if (colortextActiveName) colortextActiveName.textContent = curColor.toUpperCase();
    if (colortextActiveWords) {
      const words = curColor === 'all'
        ? (CipherState.colorWordItems || []).filter(it => !it.skipped).map(it => it.word).join(' ')
        : (colorAnswers[curColor] || '—');
      colortextActiveWords.textContent = words || '—';
    }
  }



  const changelogBtn = el('changelogBtn'), changelogList = el('changelogList');
  const bgColorPicker = el('bgColorPicker'), bgColorHex = el('bgColorHex'), bgColorReset = el('bgColorReset');
  const bgImageUrl = el('bgImageUrl'), bgImageApply = el('bgImageApply'), bgImageClear = el('bgImageClear'), bgImageStatus = el('bgImageStatus');
  const exampleSelect = el('exampleSelect'), loadExampleBtn = el('loadExampleBtn'), selfTestBtn = el('selfTestBtn'), selfTestOutput = el('selfTestOutput');
  const modeSelectDropdown = el('modeSelectDropdown');
  const letterCaseSelect = el('letterCaseSelect'), thresholdSelect = el('thresholdSelect'), polaritySelect = el('polaritySelect'), showBoxesCheck = el('showBoxesCheck');

  // Alphabets & conversions
  const BRAILLE_DOTS = C.brailleDots || [];
  const REVERSE_BRAILLE = {};
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const dotsStr = BRAILLE_DOTS[i];
    REVERSE_BRAILLE[dotsStr] = letter;
  }
  const MORSE_MAP = C.morse || {};
  const REVERSE_MORSE = {};
  Object.entries(MORSE_MAP).forEach(([pattern, letter]) => { REVERSE_MORSE[pattern] = letter; });

  // State
  let mode = 'all';
  let copyOnDecode = startingAutocopy(); // one switch with the bomb app, remembered (core/autocopy.js)
  let answerToCopy = '', answerDescToCopy = '';
  const emptyWords = () => ({ normalLR: '', normalRL: '', evenLR: '', evenRL: '', oddLR: '', oddRL: '' });
  let wordsAnswers = emptyWords();
  let manualDirty = false;
  let toastTimer = null, pendingCopy = null;
  let inputEpoch = 0, resultRevision = 0, activeLoad = null, isBusy = false;
  let state = { canvas: null, name: '', result: null, manual: false, job: 0 };
  let cells = [], morseGroups = [], numberGroups = [], a1z26Groups = [];
  let syncing = false;
  let drawnKey = null;

  const PLACEHOLDER = '<span class="ph">— — —</span>';
  const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

  const options = () => ({
    order: 'asc',
    letterCase: letterCaseSelect ? letterCaseSelect.value : 'preserve',
    caesarShift: typeof window !== 'undefined' ? CipherState.caesarShift : 0,
    colorFilter: typeof window !== 'undefined' ? CipherState.colorFilter : 'purple'
  });

  const descriptions = {
    all: ['One image, many ways to solve. Automatically detects Morse, A1Z26, Binary, Sort, Braille, Chinese, Words, Caesar, Color Text or Captcha, and sends <b>468×360 px</b> scout screenshots to Map.', 'DETECTED MARKS — click any mark to correct it', '✦ ✦ ✦', 'Recognized symbols will appear here…', 'All: Enter any supported puzzle format or edit detected symbols.'],
    morse: ['Read Morse code with <b>/</b> between letters. Click a mark to flip dot and dash, or edit the text below.', 'DETECTED LETTERS — click a mark to correct it', '▬ · ▬ ·', '.-.. / .. / ...-', 'Morse: separate letters with / or spaces. You can also enter a word such as LIV.'],
    a1z26: ['Read numbers <b>1–26</b> separated by <b>/</b>: A=1, B=2 … Z=26.', 'DETECTED NUMBERS — click a digit to correct it', '8 / 23', '22 / 9 / 4 / 1 / 13', 'A1Z26: separate numbers 1–26 with / or spaces, or enter the decoded word.'],
    binary: ['Read 8-bit ASCII binary groups separated by spaces.', 'DETECTED BYTES — edit the text below to correct it', '01000001', '01000001 01100010', 'Binary: separate 8-bit groups with spaces.'],
    sort: ['Read positive or negative integers, then <b>sort</b> them. Ascending and descending are both shown — click either box to copy it.', 'DETECTED NUMBERS — click a sign or digit to correct it', '−19 37', '-18 54 -91', 'Sort: separate signed whole numbers (−100 to 100) with spaces or commas.'],
    braille: ['Read Braille cells with <b>two columns and three rows</b>. Click a dot to correct it, or edit the dot numbers below.', 'DETECTED CELLS — click a dot to correct it', '⠿ ⠶ ⠦', '1 / 1346 / 135', 'Braille: enter a word (AXO) or dot numbers per cell (1 / 1346 / 135). Left column: 1,2,3; right: 4,5,6.'],
    chinese: ['Read Chinese numerals (1–99,999,999) and convert directly to regular numbers without leading zeroes.', 'DETECTED CHARACTERS', '八万一千', '八万一千四百八十六', 'Chinese: enter Chinese numerals such as 八万一千四百八十六.'],
    words: ['Read the numbers in a picture and <b>spell them out</b> in the order they appear: 1 2 3 4 9 → one two three four nine.', 'DETECTED NUMBERS — click a sign or digit to correct it', '1 2 9', '1 2 3 4 9', 'Words: separate single digits (0–9) with spaces or commas.'],
    caesar: ['Read Caesar cipher letters (<b>OXDBDI</b>). Use the shift field below to shift: <b>Left is negative shift (-) and Right is positive shift (+)</b>. Click letters to cycle them.', 'DETECTED LETTERS — click any letter to cycle A–Z', 'O X D B D I', 'OXDBDI', 'Caesar: enter letters (A–Z), shift is set using the shift field below.'],
    colortext: ['Read words printed in various colors (<b>chamber, stone, night, glass...</b>). Extracts words matching the chosen color, separated by spaces. Order does not matter.', 'DETECTED WORDS — click to view detected word colors', 'chamber crystal', 'chamber:green stone:red', 'Color Text: enter word:color pairs separated by spaces, e.g. chamber:green stone:red. A bare word uses the selected color.'],
    captcha: ['Read the <b>captcha</b> (4, 6 or 8 case-sensitive characters). Uncertain characters are outlined; tap a small alternative under a character to swap it, or edit the text below.', 'DETECTED CHARACTERS — tap an alternative to correct it', 'aB3k', 'aB3k', 'Captcha: type the characters exactly (letters and digits, case-sensitive).'],
    map: ['Paste or drop <b>map screenshots</b> in a row (<b>468×360 px</b>). Pick a <b>MAP SLOT</b> (1–5) to swap maps. For blackout, this reveals the map as you paste screenshots. Vent screenshots lay on top of the map. Your maps stay in memory until you refresh the page. Any non-map image (like a puzzle strip) swaps you to All and is decoded instead. Clear layer wipes one layer; Clear slot wipes both layers of the current slot.', '', '▧ ▧ ▧', '', 'Map: Paste or drop 468×360 px screenshots to merge layers.']
  };

  function hideCopyNotice(){
    pendingCopy = null;
    clearTimeout(toastTimer);
    copiedToast.classList.remove('show', 'copy-error');
    copiedToast.textContent = '';
  }

  function isCurrentAnswer(text){
    return !!text && (answerToCopy === text || answerDescToCopy === text || Object.values(wordsAnswers).includes(text) || Object.values(colorAnswers).includes(text));
  }

  function refreshCopyTargets(){
    const mainReady = Boolean(answerToCopy) && !manualDirty;
    const descReady = Boolean(answerDescToCopy) && !manualDirty;
    stampMain.setAttribute('aria-disabled', String(!mainReady));
    stampDesc.setAttribute('aria-disabled', String(!descReady));
    const isSortMode = mode === 'sort' || (mode === 'all' && state.result?.type === 'sort');
    const isCaesarMode = mode === 'caesar' || (mode === 'all' && state.result?.type === 'caesar');
    const shiftVal = Math.abs(parseInt(CipherState.caesarShift, 10) || 0);
    const mainName = isCaesarMode ? `Left shift (-${shiftVal})` : isSortMode ? 'Decoded, ascending' : 'Decoded answer';
    const descName = isCaesarMode ? `Right shift (+${shiftVal})` : 'Decoded, descending';
    stampMain.setAttribute('aria-label', mainName + (mainReady ? '. Click to copy.' : '.'));
    stampDesc.setAttribute('aria-label', descName + (descReady ? '. Click to copy.' : '.'));
    wordsStamps.forEach(ws => {
      const ready = Boolean(wordsAnswers[ws.key]) && !manualDirty;
      ws.stamp.setAttribute('aria-disabled', String(!ready));
      ws.stamp.setAttribute('aria-label', ws.label.toUpperCase() + (ready ? '. Click to copy.' : '.'));
    });
    colorStamps.forEach(cs => {
      const ready = Boolean(colorAnswers[cs.color]) && !manualDirty;
      cs.stamp.setAttribute('aria-disabled', String(!ready));
      cs.stamp.setAttribute('aria-label', cs.color.toUpperCase() + (ready ? '. Click to copy.' : '.'));
    });
    const isColorTextMode = mode === 'colortext' || (mode === 'all' && state.result?.type === 'colortext');
    const isWordsMode = mode === 'words' || (mode === 'all' && state.result?.type === 'words');
    if (copyAnswerBtn) {
      if (isCaesarMode) {
        copyAnswerBtn.textContent = 'COPY LEFT SHIFT';
        copyAnswerBtn.disabled = !mainReady;
      } else if (isSortMode) {
        copyAnswerBtn.textContent = 'COPY ASCENDING';
        copyAnswerBtn.disabled = !mainReady;
      } else if (isWordsMode) {
        copyAnswerBtn.textContent = 'COPY NORMAL LR';
        copyAnswerBtn.disabled = !Boolean(wordsAnswers.normalLR) || manualDirty;
      } else if (isColorTextMode) {
        const filt = String(CipherState.colorFilter || 'all').toUpperCase();
        copyAnswerBtn.textContent = filt === 'ALL' ? 'COPY ALL COLORS' : `COPY ${filt}`;
        copyAnswerBtn.disabled = !mainReady;
      } else {
        copyAnswerBtn.textContent = 'COPY ANSWER';
        copyAnswerBtn.disabled = !mainReady;
      }
    }
  }

  const flashTimers = new Map();
  function flashStamp(stamp){
    const hintText = stamp.querySelector('.stamp-hint');
    clearTimeout(flashTimers.get(stamp));
    stamp.classList.add('flash');
    if (hintText) hintText.textContent = 'COPIED ✓';
    flashTimers.set(stamp, setTimeout(() => {
      stamp.classList.remove('flash');
      if (hintText) hintText.textContent = 'CLICK TO COPY';
    }, 1500));
  }

  function setBusy(value){
    isBusy = value;
    dropzone.setAttribute('aria-busy', String(value));
    mainView.setAttribute('aria-busy', String(value));
  }

  function cancelPendingLoad(){
    inputEpoch++;
    resultRevision++;
    state.job++;
    if (activeLoad){
      const previous = activeLoad;
      activeLoad = null;
      for (const cancel of [...previous.cleanups]) { try { cancel(); } catch (_) {} }
      previous.cleanups.clear();
    }
    setBusy(false);
    hideCopyNotice();
  }

  function clearDecodedState(keepPreview = true){
    cells = []; morseGroups = []; numberGroups = []; a1z26Groups = []; caesarGroups = []; colorWordGroups = [];
    lastCaesarLetters = ''; CipherState.colorWordItems = []; CipherState.captchaInfo = null;
    answerToCopy = ''; answerDescToCopy = '';
    wordsAnswers = emptyWords();
    resultRevision++;
    state.result = null;
    results.classList.remove('show');
    cellsWrap.innerHTML = '';
    cellsWrap.inert = false;
    stampWord.innerHTML = PLACEHOLDER;
    stampWord.classList.remove('uncertain');
    stampWord.style.color = '';
    stampWordDesc.innerHTML = PLACEHOLDER;
    stampWordDesc.classList.remove('uncertain');
    wordsStamps.forEach(ws => {
      ws.word.innerHTML = PLACEHOLDER;
      ws.word.classList.remove('uncertain');
    });
    colorAnswers = emptyColors();
    colorStamps.forEach(cs => {
      cs.word.innerHTML = PLACEHOLDER;
      cs.word.classList.remove('uncertain');
      cs.stamp.hidden = true;
    });
    answerStatus.textContent = '';
    copyAnswerBtn.disabled = true;
    refreshCopyTargets();
    manualDirty = false;
    rawInput.value = '';
    rawInput.removeAttribute('aria-invalid');
    discardTextBtn.disabled = true;
    editStatus.textContent = '';
    hideCopyNotice();
    srLive.textContent = '';
    drawnKey = null;
    if (!keepPreview){
      state.canvas = null;
      state.name = '';
      previewRow.classList.remove('show');
      previewMeta.textContent = '';
      previewCanvas.classList.remove('show');
    } else drawPreview();
  }

  function failDecode(message){
    clearDecodedState(true);
    hint.textContent = message;
    setBusy(false);
  }

  function beginInput(message){
    cancelPendingLoad();
    clearDecodedState(false);
    mainView.hidden = false;
    aboutView.hidden = true;
    hint.textContent = message || 'Reading image…';
    setBusy(true);
    const request = { id: inputEpoch, mode, cleanups: new Set() };
    activeLoad = request;
    return request;
  }

  function setMode(next, { decode = true, preserve = false } = {}){
    if (!descriptions[next] || next === mode) return;
    if (preserve){ // All -> Map for a scout shot: keep the decoded answer, preview and clipboard state untouched
      mode = next;
      fileInput.value = '';
      updateModeUI();
      return;
    }
    cancelPendingLoad();
    mode = next;
    // Keep the loaded image so a wrong tab never forces a re-upload. Results are still cleared, and the
    // re-read below never auto-copies, so merely switching tabs cannot overwrite the clipboard.
    const keepImage = decode && Boolean(state.canvas);
    clearDecodedState(keepImage);
    hint.textContent = '';
    fileInput.value = '';
    updateModeUI();
    if (keepImage) readImage({ autoCopy: false });
  }

  // Shift A-Z letters by `by` places (negative = left), wrapping around the alphabet.
  const shiftLetters = (text, by) => [...text].map(c => String.fromCharCode(65 + (((c.charCodeAt(0) - 65 + by) % 26) + 26) % 26)).join('');

  // Stamp titles and the main copy button label for the current puzzle type (used by every render path).
  function applyStampLabels(isCaesar, isSort, isWords){
    if (isCaesar){
      const n = Math.abs(parseInt(CipherState.caesarShift, 10) || 0);
      stampLabel.textContent = `LEFT SHIFT (-${n})`;
      if (stampDescLabel) stampDescLabel.textContent = `RIGHT SHIFT (+${n})`;
      copyAnswerBtn.textContent = 'COPY LEFT SHIFT';
    } else {
      stampLabel.textContent = isSort ? 'DECODED · ASC ↑' : 'DECODED';
      if (stampDescLabel) stampDescLabel.textContent = 'DECODED · DESC ↓';
      copyAnswerBtn.textContent = isWords ? 'COPY NORMAL LR' : isSort ? 'COPY ASCENDING' : 'COPY ANSWER';
    }
  }

  function updateModeUI(){
    if (modeSelectDropdown && modeSelectDropdown.value !== mode) {
      modeSelectDropdown.value = mode;
    }
    modeBtns.forEach(button => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });

    const isMap = mode === 'map';
    const isCaptcha = (mode === 'captcha' || (mode === 'all' && state.result?.type === 'captcha')) && !isMap;
    const isCaesar = (mode === 'caesar' || (mode === 'all' && state.result?.type === 'caesar')) && !isMap;
    const isColorText = (mode === 'colortext' || (mode === 'all' && state.result?.type === 'colortext')) && !isMap;
    const isSortMode = (mode === 'sort' || (mode === 'all' && state.result?.type === 'sort')) && !isMap;
    const isWordsMode = (mode === 'words' || (mode === 'all' && state.result?.type === 'words')) && !isMap;
        const caesarUi = (CipherState.uiModes && CipherState.uiModes.caesar) || 'classic';
    if (caesarControls) caesarControls.classList.toggle('show', isCaesar && caesarUi === 'classic');
    if (caesarEnhancedControls) caesarEnhancedControls.classList.toggle('show', isCaesar && caesarUi === 'enhanced');

    const colorUi = (CipherState.uiModes && CipherState.uiModes.colortext) || 'enhanced';
    if (colortextControls) colortextControls.classList.toggle('show', isColorText && colorUi === 'classic');
    if (colortextEnhancedControls) colortextEnhancedControls.classList.toggle('show', isColorText && colorUi === 'enhanced');

    const sortUi = (CipherState.uiModes && CipherState.uiModes.sort) || 'enhanced';
    if (sortEnhancedRibbon) sortEnhancedRibbon.classList.toggle('show', isSortMode && sortUi === 'enhanced');

    const wordsUi = (CipherState.uiModes && CipherState.uiModes.words) || 'enhanced';
    if (wordsEnhancedFilter) wordsEnhancedFilter.classList.toggle('show', isWordsMode && wordsUi === 'enhanced');

    if (isColorText) updateColorTextBadges();
    if (captchaPanel) captchaPanel.classList.toggle('show', isCaptcha);
    if (mapPanel) mapPanel.classList.toggle('show', isMap);
    if (isMap){ mapRender(); mapUpdateInfo(); } // redraw from the stored layers every time Map is (re)entered
    if (moveCopy) moveCopy.classList.toggle('show', isMap);
    if (stamps) {
      if (isMap) {
        stamps.style.display = 'none';
      } else if (isCaesar && caesarUi === 'enhanced') {
        stamps.style.display = 'none';
      } else {
        stamps.style.display = '';
      }
    }
    if (copyToggle) copyToggle.style.display = isMap ? 'none' : '';
    if (copyAnswerBtn) copyAnswerBtn.style.display = isMap ? 'none' : '';
    if (resetBtn) resetBtn.style.display = isMap ? 'none' : ''; // Map keeps its memory until refresh; wipe it with Clear layer / Clear slot
    if (manualEditor) manualEditor.style.display = isMap ? 'none' : '';
    if (previewCanvas) {
      if (isMap) previewCanvas.classList.remove('show');
    }
    if (isMap) {
      if (previewRow) previewRow.classList.remove('show');
    }
    const isGrid = isWordsMode || isColorText;
    const isDual = isSortMode || isCaesar;
    stamps.classList.toggle('dual', isDual);
    stamps.classList.toggle('words-grid', isGrid);
    stampMain.hidden = isGrid;
    stampDesc.hidden = isGrid || !isDual;
    wordsStamps.forEach(ws => { ws.stamp.hidden = !isWordsMode; });
    colorStamps.forEach(cs => {
      cs.stamp.hidden = !isColorText || !colorAnswers[cs.color];
    });
    applyStampLabels(isCaesar, isSortMode, isWordsMode);
    refreshCopyTargets();

    const desc = descriptions[mode] || descriptions.all;
    const [sub, label, icon, placeholder, help] = desc;
    modeSub.innerHTML = sub;
    resultsLabel.textContent = label;
    dzIcon.textContent = icon;
    rawInput.placeholder = placeholder;
    rawInput.setAttribute('aria-label', 'Detected ' + mode + ' text');
    manualHelp.textContent = help;
  }

  modeBtns.forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...modeBtns], index = buttons.indexOf(button);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[target].focus();
      setMode(buttons[target].dataset.mode);
    });
  });

  if (modeSelectDropdown) {
    modeSelectDropdown.addEventListener('change', () => {
      setMode(modeSelectDropdown.value);
    });
  }


  // Caesar shift input and quick buttons
  function applyCaesarShift(copyNow = true) {
    let sVal = Math.abs(parseInt(caesarShiftInput ? caesarShiftInput.value : 0, 10) || 0) % 26;
    const caesarUi = (CipherState.uiModes && CipherState.uiModes.caesar) || 'classic';
    if (caesarUi === 'enhanced') {
      sVal = Math.min(5, Math.max(0, sVal));
    }
    CipherState.caesarShift = sVal;
    document.querySelectorAll('.caesar-qbtn').forEach(b => b.classList.toggle('active', Number(b.dataset.shift) === sVal));
    const isCaesarActive = mode === 'caesar' || (mode === 'all' && state.result?.type === 'caesar');
    if (!isCaesarActive) return;

    // 1. Determine raw letters reliably
    let rawLetters = '';
    if (caesarGroups && caesarGroups.length > 0) {
      rawLetters = caesarGroups.map(g => g.letter).join('');
    } else if (rawInput && rawInput.value && /^[A-Za-z]+$/.test(rawInput.value.replace(/[^A-Za-z]/g, ''))) {
      rawLetters = rawInput.value.replace(/[^A-Za-z]/g, '').toUpperCase();
    } else if (state.result && (state.result.reading || state.result.text)) {
      rawLetters = (state.result.reading || state.result.text).replace(/[^A-Za-z]/g, '').toUpperCase();
    } else if (lastCaesarLetters) {
      rawLetters = lastCaesarLetters;
    }
    if (rawLetters) lastCaesarLetters = rawLetters;
    if (!rawLetters) return; // nothing loaded (e.g. after Clear): don't resurrect an empty result card

    // 2. Keep state.result updated with caesar type so isCaesar stays true
    if (!state.result || state.result.type !== 'caesar') {
      state.result = { ok: true, type: 'caesar', reading: rawLetters, text: rawLetters, output: rawLetters };
    } else {
      state.result.reading = rawLetters;
      state.result.text = rawLetters;
    }

    // 3. Update UI container visibility
    updateModeUI();

    // 4. Compute left and right shifted values
    const leftShifted = shiftLetters(rawLetters, -sVal);
    const rightShifted = shiftLetters(rawLetters, sVal);

    // 5. Update labels and stamps
    applyStampLabels(true, false, false);
    copyAnswerBtn.disabled = !leftShifted;

    stampWord.textContent = leftShifted || '—';
    stampWordDesc.textContent = rightShifted || '—';
    stampWord.style.color = '';
    answerToCopy = leftShifted;
    answerDescToCopy = rightShifted;
    refreshCopyTargets();

    // 5b. Update Enhanced Caesar UI (clamped to [0, 5])
    if (caesarShiftRange && Number(caesarShiftRange.value) !== sVal) caesarShiftRange.value = sVal;
    if (caesarShiftNum) caesarShiftNum.textContent = sVal;
    if (caesarShiftLeftTag) caesarShiftLeftTag.textContent = '-' + sVal;
    if (caesarShiftRightTag) caesarShiftRightTag.textContent = '+' + sVal;
    if (caesarStepDown) {
      caesarStepDown.disabled = sVal <= 0;
      caesarStepDown.style.opacity = sVal <= 0 ? '0.4' : '1';
      caesarStepDown.style.cursor = sVal <= 0 ? 'not-allowed' : 'pointer';
    }
    if (caesarStepUp) {
      caesarStepUp.disabled = sVal >= 5;
      caesarStepUp.style.opacity = sVal >= 5 ? '0.4' : '1';
      caesarStepUp.style.cursor = sVal >= 5 ? 'not-allowed' : 'pointer';
    }
    if (caesarEnhancedLeftText) caesarEnhancedLeftText.textContent = leftShifted || '—';
    if (caesarEnhancedRightText) caesarEnhancedRightText.textContent = rightShifted || '—';
    const bLeft = el('caesarBadgeLeft'), bRight = el('caesarBadgeRight');
    if (bLeft) bLeft.textContent = sVal === 0 ? 'LEFT (ORIGINAL)' : `LEFT SHIFT (-${sVal})`;
    if (bRight) bRight.textContent = sVal === 0 ? 'RIGHT (ORIGINAL)' : `RIGHT SHIFT (+${sVal})`;
    document.querySelectorAll('.caesar-pill-tag').forEach(b => b.classList.toggle('active', Number(b.dataset.cshift) === sVal));
    document.querySelectorAll('.caesar-ticks span').forEach(t => t.classList.toggle('active', Number(t.dataset.val ?? t.textContent) === sVal));

    if (caesarMapPairs) {
      caesarMapPairs.innerHTML = '';
      [...rawLetters].forEach(ch => {
        const d = document.createElement('div');
        d.className = 'caesar-map-pair';
        if (sVal === 0) {
          d.innerHTML = `<span>${ch}</span><span class="arrow">➔</span><span class="dest">${ch}</span>`;
        } else {
          const lShift = shiftLetters(ch, -sVal);
          const rShift = shiftLetters(ch, sVal);
          d.innerHTML = `<span>${ch}</span><span class="arrow">➔</span><span class="dest">−${sVal}:${lShift}</span><span style="color:var(--line);margin:0 2px;">|</span><span class="dest" style="color:var(--ink-soft);">+${sVal}:${rShift}</span>`;
        }
        caesarMapPairs.appendChild(d);
      });
    }

    if (caesarShiftsGrid) {
      caesarShiftsGrid.innerHTML = '';
      for (let s = 0; s <= 5; s++) {
        const row = document.createElement('div');
        row.className = 'caesar-table-row' + (s === sVal ? ' active' : '');
        const lWord = shiftLetters(rawLetters, -s);
        const rWord = shiftLetters(rawLetters, s);

        if (s === 0) {
          row.innerHTML = `
            <div class="caesar-table-shift-badge" title="Set shift to 0">SHIFT 0</div>
            <div class="caesar-table-cell c-left" title="Click to copy unshifted original">
              <span class="caesar-table-dir">ORIGINAL:</span>
              <span class="caesar-table-word">${lWord}</span>
              <span class="caesar-table-copy">📋 COPY</span>
            </div>
          `;
          const cell = row.querySelector('.caesar-table-cell');
          cell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (caesarShiftInput) caesarShiftInput.value = 0;
            applyCaesarShift(false);
            copyToClipboard(lWord, true, true);
            flashStamp(caesarCardLeft || stampMain);
          });
        } else {
          row.innerHTML = `
            <div class="caesar-table-shift-badge" title="Set shift to ${s}">SHIFT ${s}</div>
            <div class="caesar-table-cell c-left" title="Click to copy Left Shift (-${s})">
              <span class="caesar-table-dir">LEFT (-${s}):</span>
              <span class="caesar-table-word">${lWord}</span>
              <span class="caesar-table-copy">📋 COPY</span>
            </div>
            <div class="caesar-table-cell c-right" title="Click to copy Right Shift (+${s})">
              <span class="caesar-table-dir">RIGHT (+${s}):</span>
              <span class="caesar-table-word">${rWord}</span>
              <span class="caesar-table-copy">📋 COPY</span>
            </div>
          `;
          const leftCell = row.querySelector('.caesar-table-cell.c-left');
          leftCell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (caesarShiftInput) caesarShiftInput.value = s;
            applyCaesarShift(false);
            copyToClipboard(lWord, true, true);
            flashStamp(caesarCardLeft || stampMain);
          });
          const rightCell = row.querySelector('.caesar-table-cell.c-right');
          rightCell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (caesarShiftInput) caesarShiftInput.value = s;
            applyCaesarShift(false);
            copyToClipboard(rWord, true, true);
            flashStamp(caesarCardRight || stampDesc);
          });
        }

        const badge = row.querySelector('.caesar-table-shift-badge');
        badge.addEventListener('click', () => {
          if (caesarShiftInput) caesarShiftInput.value = s;
          applyCaesarShift(true);
        });

        caesarShiftsGrid.appendChild(row);
      }
    }

    // 6. Ensure results area is visible
    results.classList.add('show');

    // 7. Letter cards no longer depend on the shift; only rebuild them if they are missing
    if (!caesarGroups || caesarGroups.length === 0) {
      caesarGroups = [...rawLetters].map(ch => ({ letter: ch, touched: false }));
    }
    if (caesarGroups.length > 0 && cellsWrap.querySelectorAll('.cell').length !== caesarGroups.length) {
      syncing = true;
      try { renderCaesarGroups(); } finally { syncing = false; }
    }

    // 8. Automatically update clipboard and copy notification
    if (copyNow && copyOnDecode && answerToCopy) {
      copyToClipboard(answerToCopy, true, true);
    }
  }

  if (caesarShiftInput) {
    caesarShiftInput.addEventListener('input', () => {
      applyCaesarShift(true);
    });
  }
  if (caesarShiftInput) {
    caesarShiftInput.addEventListener('focus', () => caesarShiftInput.select());
    caesarShiftInput.addEventListener('change', () => { caesarShiftInput.value = String(CipherState.caesarShift || 0); });
  }
  document.querySelectorAll('.caesar-qbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (caesarShiftInput) {
        caesarShiftInput.value = btn.dataset.shift;
        applyCaesarShift(true);
      }
    });
  });

  // Color text filter buttons
  function applyColorFilter(color, copyNow = false) {
    CipherState.colorFilter = color;
    document.querySelectorAll('.color-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.color === color);
    });
    const isColorText = mode === 'colortext' || (mode === 'all' && state.result?.type === 'colortext');
    if (!isColorText) return;
    if (CipherState.colorWordItems && CipherState.colorWordItems.length > 0) commitColorItems(copyNow ? 'force' : false);
    else if (state.result) redecodeCurrent();
  }

  document.querySelectorAll('.color-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyColorFilter(btn.dataset.color, true);
    });
  });



    // Stamp Click Copy Handlers
  function bindStampCopy(stamp, getText){
    const run = () => {
      const text = getText();
      if (!text || manualDirty) return;
      const selected = window.getSelection ? window.getSelection() : null;
      if (selected && !selected.isCollapsed && selected.anchorNode && stamp.contains(selected.anchorNode)) return;
      copyToClipboard(text, true, true);
    };
    stamp.addEventListener('click', run);
    stamp.addEventListener('keydown', event => {
      if (event.target !== stamp || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      run();
    });
  }
  bindStampCopy(stampMain, () => answerToCopy);
  bindStampCopy(stampDesc, () => answerDescToCopy);
  wordsStamps.forEach(ws => {
    bindStampCopy(ws.stamp, () => wordsAnswers[ws.key]);
  });
  colorStamps.forEach(cs => {
    bindStampCopy(cs.stamp, () => colorAnswers[cs.color]);
  });

  function fallbackCopy(text){
    const previous = document.activeElement;
    const selected = window.getSelection ? window.getSelection() : null;
    const ranges = [];
    if (selected) for (let i = 0; i < selected.rangeCount; i++) ranges.push(selected.getRangeAt(i).cloneRange());
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    let success = false;
    try { success = document.execCommand('copy'); } catch (_) {}
    textarea.remove();
    if (previous && previous.focus) previous.focus({ preventScroll: true });
    if (selected){ selected.removeAllRanges(); for (const range of ranges) selected.addRange(range); }
    return success;
  }

  function copyToClipboard(text, manual = false, inGesture = false){
    const epoch = inputEpoch, revision = resultRevision, copyMode = mode;
    const eligible = () => epoch === inputEpoch && revision === resultRevision && mode === copyMode &&
      !manualDirty && isCurrentAnswer(text) && (manual || copyOnDecode);

    const notify = stateMsg => {
      clearTimeout(toastTimer);
      copiedToast.textContent = stateMsg === 'ok' ? 'COPIED ✓' : stateMsg === 'wait' ? 'Click anywhere or press a key to copy' : 'Copy unavailable — select the answer to copy it.';
      copiedToast.classList.toggle('copy-error', stateMsg === 'fail');
      copiedToast.classList.add('show');
      if (stateMsg === 'ok'){
        if (answerToCopy === text && !stampMain.hidden) flashStamp(stampMain);
        if (answerDescToCopy === text && !stampDesc.hidden) flashStamp(stampDesc);
        wordsStamps.forEach(ws => {
          if (!ws.stamp.hidden && wordsAnswers[ws.key] === text) flashStamp(ws.stamp);
        });
        colorStamps.forEach(cs => {
          if (!cs.stamp.hidden && colorAnswers[cs.color] === text) flashStamp(cs.stamp);
        });
      }
      if (stateMsg !== 'wait') toastTimer = setTimeout(() => copiedToast.classList.remove('show'), stateMsg === 'ok' ? 1800 : 6500);
    };

    // Use the synchronous path only when a genuine user gesture is active.
    const syncOk = inGesture || Boolean(navigator.userActivation && navigator.userActivation.isActive && !isEditable(document.activeElement));
    if (syncOk && eligible()){
      if (fallbackCopy(text)){ pendingCopy = null; notify('ok'); return; }
    }

    const copyJob = async () => {
      if (!eligible()) return;
      let success = false;
      // Calling writeText happens asynchronously and is permitted by modern browsers without synchronous execCommand.
      if (navigator.clipboard && navigator.clipboard.writeText){
        try { await navigator.clipboard.writeText(text); success = true; } catch (_) {}
      }
      if (!eligible()) return;
      // Only attempt fallback execCommand if in a user gesture or navigator.userActivation is active
      const canFallback = inGesture || Boolean(navigator.userActivation && navigator.userActivation.isActive);
      if (!success && canFallback && fallbackCopy(text)) success = true;
      if (!eligible()) return;
      if (success){ pendingCopy = null; notify('ok'); }
      else if (inGesture) notify('fail');
      else { pendingCopy = text; notify('wait'); }
    };
    // Do not serialize requests: a slow or stalled write must not delay the next puzzle.
    void copyJob().catch(() => {
      if (eligible()) { pendingCopy = text; notify('wait'); }
    });
  }

  function retryPendingCopy(event){
    if (pendingCopy === null) return;
    if (isEditable(event.target)) return;
    if (event.type === 'click' && event.target.closest && event.target.closest('button, a, summary, label, select, [role="button"]')) return;
    const sel = window.getSelection ? window.getSelection() : null;
    if (sel && !sel.isCollapsed) return; // the person is selecting text to copy something else
    if (event.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey ||
        ['Shift','Control','Alt','Meta','CapsLock','Tab','Escape'].includes(event.key))) return;
    const text = pendingCopy;
    pendingCopy = null;
    if (isCurrentAnswer(text) && !manualDirty && copyOnDecode) copyToClipboard(text, true, true);
  }
  document.addEventListener('click', retryPendingCopy);
  document.addEventListener('keydown', retryPendingCopy);

  copyToggle.classList.toggle('on', copyOnDecode); // the markup says on; the remembered choice decides
  copyToggle.setAttribute('aria-checked', String(copyOnDecode));
  copyToggle.addEventListener('click', () => {
    copyOnDecode = !copyOnDecode;
    saveAutocopy(copyOnDecode);
    copyToggle.classList.toggle('on', copyOnDecode);
    copyToggle.setAttribute('aria-checked', String(copyOnDecode));
    const sAuto = el('settingsAutoCopy');
    if (sAuto) sAuto.checked = copyOnDecode;
    hideCopyNotice();
    if (copyOnDecode && answerToCopy) copyToClipboard(answerToCopy);
  });

  copyAnswerBtn.addEventListener('click', () => {
    if (answerToCopy && !manualDirty) copyToClipboard(answerToCopy, true, true);
  });

  resetBtn.addEventListener('click', () => {
    if (mode === 'map') return; // hidden on Map; the map is only ever wiped by Clear layer / Clear slot
    cancelPendingLoad();
    clearDecodedState(false);
    hint.textContent = '';
    fileInput.value = '';
  });

  // Cell and UI Building Helpers
  function cellBox(label){
    const box = document.createElement('div');
    box.className = 'cell';
    const index = document.createElement('div');
    index.className = 'cell-index';
    index.textContent = label;
    box.appendChild(index);
    return box;
  }

  function addCellValue(box, value, isWord = false){
    const result = document.createElement('div');
    result.className = 'cell-letter' + (value === null ? ' bad' : isWord ? ' word' : '');
    result.textContent = value === null ? '?' : String(value);
    box.appendChild(result);
    cellsWrap.appendChild(box);
  }

  function controlButton(className, label, id, action){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.id = id;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('click', () => {
      if (manualDirty) return;
      action();
      const next = document.getElementById(id);
      if (next) next.focus({ preventScroll: true });
    });
    return button;
  }

  function letterForMorse(symbols){ return REVERSE_MORSE[symbols.join('')] || null; }
  function letterForBraille(dots){
    const active = dots.map((on, i) => on ? i + 1 : '').filter(Boolean).join('');
    return REVERSE_BRAILLE[active] || null;
  }
  function letterForA1Z26(group){
    if (!group.digits.length || group.digits.some(d => !/^[0-9]$/.test(d === null ? '' : String(d)))) return null;
    const value = Number(group.digits.join(''));
    return Number.isInteger(value) && value >= 1 && value <= 26 ? String.fromCharCode(64 + value) : null;
  }
  function valueForNumber(group){
    if (!group.digits.length || group.digits.some(d => !/^[0-9]$/.test(d === null ? '' : String(d)))) return null;
    const value = Number(group.digits.join('')) * (group.sign ? -1 : 1);
    return Number.isSafeInteger(value) ? value : null;
  }
  function wordsForNumber(group){
    const val = valueForNumber(group);
    return val !== null && C.digitWords[val] ? C.digitWords[val] : val !== null ? String(val) : null;
  }

  function renderMorseGroups(){
    cellsWrap.innerHTML = '';
    morseGroups.forEach((group, index) => {
      const box = cellBox('LETTER ' + (index + 1));
      const row = document.createElement('div');
      row.className = 'symrow';
      group.symbols.forEach((symbol, pos) => {
        const btn = controlButton('sym ' + (symbol === '-' ? 'sym-dash' : 'sym-dot') + (group.touched[pos] ? ' touched' : ''),
          'Letter ' + (index + 1) + ', mark ' + (pos + 1) + ': ' + (symbol === '-' ? 'dash' : 'dot') + '. Click to flip.',
          'group-' + index + '-mark-' + pos, () => {
            group.symbols[pos] = symbol === '-' ? '.' : '-';
            group.touched[pos] = true;
            renderMorseGroups();
          });
        row.appendChild(btn);
      });
      box.appendChild(row);
      const letter = letterForMorse(group.symbols);
      addCellValue(box, letter ? letter.toUpperCase() : null);
    });
    results.classList.add('show');
    updateWordFromCells();
  }

  function renderBrailleCells(){
    cellsWrap.innerHTML = '';
    cells.forEach((cell, index) => {
      const box = cellBox('CELL ' + (index + 1));
      const grid = document.createElement('div');
      grid.className = 'dotgrid';
      [0, 3, 1, 4, 2, 5].forEach(dot => {
        const btn = controlButton('dot' + (cell.dots[dot] ? ' filled' : '') + (cell.touched[dot] ? ' touched' : ''),
          'Cell ' + (index + 1) + ', dot ' + (dot + 1) + (cell.dots[dot] ? ' on' : ' off') + '. Click to toggle.',
          'cell-' + index + '-dot-' + dot, () => {
            cell.dots[dot] = cell.dots[dot] ? 0 : 1;
            cell.touched[dot] = true;
            renderBrailleCells();
          });
        btn.setAttribute('aria-pressed', String(Boolean(cell.dots[dot])));
        grid.appendChild(btn);
      });
      box.appendChild(grid);
      const letter = letterForBraille(cell.dots);
      addCellValue(box, letter ? letter.toUpperCase() : null);
    });
    results.classList.add('show');
    updateWordFromCells();
  }

  function renderA1Z26Groups(){
    cellsWrap.innerHTML = '';
    a1z26Groups.forEach((group, index) => {
      const box = cellBox('NUM ' + (index + 1));
      const row = document.createElement('div');
      row.className = 'bitrow';
      group.digits.forEach((digit, pos) => {
        const unread = digit === null, guess = !unread && group.guess && group.guess[pos] && !group.touched[pos];
        const btn = controlButton('bit' + (unread ? ' unread' : '') + (guess ? ' guess' : '') + (group.touched[pos] ? ' touched' : ''),
          'Number ' + (index + 1) + ', digit ' + (pos + 1) + ': ' + (unread ? 'unread' : digit) + '. Click to cycle.',
          'group-' + index + '-digit-' + pos, () => {
            group.digits[pos] = unread ? '0' : String((Number(digit) + 1) % 10);
            group.touched[pos] = true;
            if (group.guess) group.guess[pos] = false;
            renderA1Z26Groups();
          });
        btn.textContent = unread ? '?' : digit;
        row.appendChild(btn);
      });
      box.appendChild(row);
      addCellValue(box, letterForA1Z26(group));
    });
    results.classList.add('show');
    updateWordFromCells();
  }

  function renderSorterGroups(){
    cellsWrap.innerHTML = '';
    numberGroups.forEach((group, index) => {
      const box = cellBox('NUM ' + (index + 1));
      const row = document.createElement('div');
      row.className = 'bitrow';
      const signBtn = controlButton('bit' + (group.sign ? ' one' : '') + (group.signTouched ? ' touched' : ''),
        'Number ' + (index + 1) + (group.sign ? ' negative' : ' positive') + '. Click to flip sign.',
        'group-' + index + '-sign', () => {
          group.sign = !group.sign;
          group.signTouched = true;
          renderSorterGroups();
        });
      signBtn.textContent = group.sign ? '−' : '+';
      row.appendChild(signBtn);
      group.digits.forEach((digit, pos) => {
        const unread = digit === null;
        const btn = controlButton('bit' + (unread ? ' unread' : '') + (group.digitsTouched[pos] ? ' touched' : ''),
          'Number ' + (index + 1) + ', digit ' + (pos + 1) + ': ' + (unread ? 'unread' : digit) + '. Click to cycle.',
          'group-' + index + '-digit-' + pos, () => {
            group.digits[pos] = unread ? '0' : String((Number(digit) + 1) % 10);
            group.digitsTouched[pos] = true;
            renderSorterGroups();
          });
        btn.textContent = unread ? '?' : digit;
        row.appendChild(btn);
      });
      box.appendChild(row);
      if (mode === 'words' || (mode === 'all' && state.result && state.result.type === 'words')) addCellValue(box, wordsForNumber(group), true);
      else addCellValue(box, valueForNumber(group));
    });
    results.classList.add('show');
    updateWordFromCells();
  }

  function invalidateAnswer(message){
    resultRevision++;
    hideCopyNotice();
    answerToCopy = ''; answerDescToCopy = '';
    wordsAnswers = emptyWords();
    stampWord.innerHTML = PLACEHOLDER; stampWordDesc.innerHTML = PLACEHOLDER;
    wordsStamps.forEach(ws => { ws.word.innerHTML = PLACEHOLDER; });
    copyAnswerBtn.disabled = true;
    refreshCopyTargets();
    hint.textContent = message || 'This reading could not be decoded.';
    answerStatus.textContent = 'No answer until every cell is valid.';
  }


  function renderCaesarGroups(){
    cellsWrap.innerHTML = '';
    caesarGroups.forEach((group, index) => {
      const box = cellBox('LETTER ' + (index + 1));
      const row = document.createElement('div');
      row.className = 'bitrow';
      const btn = controlButton('bit' + (group.touched ? ' touched' : ''),
        'Letter ' + (index + 1) + ': ' + group.letter + '. Click to cycle.',
        'caesar-char-' + index, () => {
          // runner-up readings first, then plain A-Z cycling
          const pool = [group.orig || (group.orig = group.letter), ...(group.alts || [])];
          const pi = pool.indexOf(group.letter);
          if (pi >= 0 && pi < pool.length - 1) group.letter = pool[pi + 1];
          else if (pi === pool.length - 1 && pool.length > 1) group.letter = pool[0];
          else group.letter = String.fromCharCode(65 + (group.letter.charCodeAt(0) - 65 + 1) % 26);
          group.touched = true;
          renderCaesarGroups();
        });
      if (group.weak && !group.touched) { btn.style.outline = '2px dashed #d97706'; btn.title = 'Unsure: click to try ' + (group.alts || []).join(', '); }
      btn.style.minWidth = '44px';
      btn.style.height = '44px';
      btn.style.fontSize = '20px';
      btn.style.fontWeight = '700';
      btn.textContent = group.letter;
      row.appendChild(btn);
      box.appendChild(row);
      cellsWrap.appendChild(box);
    });
    results.classList.add('show');
    updateWordFromCells();
  }

  const COLOR_NAMES = ['green','purple','orange','red','blue','black'];
  const COLOR_HEX = { green:'#30ad5e', purple:'#9333ea', orange:'#d97706', red:'#dc2626', blue:'#2563eb', black:'#111111' };

  // Rebuild the answer + cards from CipherState.colorWordItems (the single source of truth).
  // copyMode: 'force' (explicit filter click), 'auto' (respects Copy-on-decode), or false.
  function commitColorItems(copyMode = false){
    const items = CipherState.colorWordItems || [];
    const filt = String(CipherState.colorFilter || 'purple').toLowerCase();
    const reading = items.map(i => i.word + ':' + i.color).join(' ');
    const output = items.filter(i => !i.excluded && (filt === 'all' || i.color === filt)).map(i => i.word).join(' ');
    const prev = state.result || {};
    renderResult({ ok: true, type: 'colortext', output, normalized: reading, reading, items, trace: [], boxes: prev.boxes || [], confidence: prev.confidence },
      { manual: false, autoCopy: false, syncCells: true });
    if (copyMode && answerToCopy && (copyMode === 'force' || copyOnDecode)) copyToClipboard(answerToCopy, true, true);
  }

  function renderColorTextGroups(){
    cellsWrap.innerHTML = '';
    const items = CipherState.colorWordItems || [];
    const filt = String(CipherState.colorFilter || 'purple').toLowerCase();
    colorWordGroups = items;
    items.forEach((item, index) => {
      const box = cellBox('WORD ' + (index + 1));
      box.classList.add('word-cell');
      if (item.excluded) box.classList.add('skipped');
      else if (filt !== 'all' && item.color !== filt) box.classList.add('off-filter');
      box.tabIndex = 0;
      box.setAttribute('role', 'button');
      box.setAttribute('aria-pressed', String(!item.excluded));

      const badge = document.createElement('div');
      badge.className = 'word-badge';
      badge.tabIndex = 0;
      badge.setAttribute('role', 'button');
      badge.title = 'Click to change this word\'s color';
      const dot = document.createElement('span');
      dot.className = 'word-dot';
      dot.style.background = COLOR_HEX[item.color] || '#888';
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(item.color));
      const cycle = () => {
        item.color = COLOR_NAMES[(COLOR_NAMES.indexOf(item.color) + 1) % COLOR_NAMES.length];
        commitColorItems('auto');
      };
      badge.addEventListener('click', e => { e.stopPropagation(); cycle(); });
      badge.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); e.stopPropagation(); cycle();
      });
      box.appendChild(badge);

      const wordDiv = document.createElement('div');
      wordDiv.className = 'cell-letter color-word';
      wordDiv.textContent = item.word;
      wordDiv.style.color = COLOR_HEX[item.color] || 'inherit';
      box.appendChild(wordDiv);
      if (item.weak && (item.alt || (item.cands && item.cands.length > 1))) {
        const sw = document.createElement('button');
        sw.type = 'button'; sw.className = 'word-badge';
        const nextAlt = item.alt || (item.cands && item.cands.find(c => c !== item.word)) || '';
        sw.textContent = '≈ ' + nextAlt;
        sw.title = 'Unsure of this word: click to cycle candidate words';
        sw.style.outline = '2px dashed #d97706';
        sw.addEventListener('click', e => {
          e.stopPropagation();
          if (item.cands && item.cands.length > 1) {
            item.idx = ((item.idx || 0) + 1) % item.cands.length;
            item.word = item.cands[item.idx];
            item.alt = item.cands[(item.idx + 1) % item.cands.length];
          } else {
            const o = item.word; item.word = item.alt; item.alt = o;
          }
          commitColorItems('auto');
        });
        box.appendChild(sw);
      }

      box.title = 'Click to skip / restore this word';
      const toggle = () => { item.excluded = !item.excluded; commitColorItems('auto'); };
      box.addEventListener('click', toggle);
      box.addEventListener('keydown', e => {
        if (e.target !== box || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault(); toggle();
      });
      cellsWrap.appendChild(box);
    });
    results.classList.add('show');
  }

  function updateWordFromCells(){
    if (syncing) return;
    let rawText = '';
    // In All mode the cells belong to whichever puzzle type was detected.
    const type = mode === 'all' ? (state.result && state.result.type) : mode;
    if (type === 'morse') rawText = morseGroups.map(g => g.symbols.join('')).join(' ');
    else if (type === 'braille') {
      rawText = cells.map(c => {
        const d = c.dots.map((on, i) => on ? i + 1 : '').filter(Boolean).join('');
        return d ? '[' + d + ']' : '[0]';
      }).join(' ');
    } else if (type === 'a1z26') {
      rawText = a1z26Groups.map(g => g.digits.join('')).join(' / ');
    } else if (type === 'sort' || type === 'words') {
      rawText = numberGroups.map(g => (g.sign ? '-' : '') + g.digits.join('')).join(' ');
    } else if (type === 'caesar') {
      rawText = caesarGroups.map(g => g.letter).join('');
    } else if (type === 'colortext') {
      commitColorItems();
      return;
    }
    if (rawText) {
      const decoded = C.decodeText(rawText, type, options());
      if (decoded.ok) {
        const prev = state.result || {};
        renderResult({ ...decoded, boxes: prev.boxes, confidence: prev.confidence }, { manual: false, autoCopy: false, syncCells: false });
      } else {
        rawInput.value = rawText;
        invalidateAnswer(decoded.error);
      }
    }
  }

  // Draw detection preview
  function drawPreview(){
    if (!state.canvas) return;
    const boxes = (showBoxesCheck && showBoxesCheck.checked && state.result && state.result.boxes && state.result.boxes.length) ? state.result.boxes : null;
    // Cell corrections re-render the same boxes on the same image; skip the redundant full-image repaint.
    if (drawnKey && drawnKey.canvas === state.canvas && drawnKey.boxes === boxes) return;
    drawnKey = { canvas: state.canvas, boxes };
    previewCanvas.width = state.canvas.width;
    previewCanvas.height = state.canvas.height;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(state.canvas, 0, 0);
    if (boxes){
      const line = Math.max(1, state.canvas.width / 750);
      ctx.strokeStyle = '#3a795a';
      ctx.lineWidth = line;
      for (const b of boxes){
        if ([b.x, b.y, b.w, b.h].every(Number.isFinite)){
          ctx.strokeRect(b.x - 3 * line, b.y - 3 * line, b.w + 6 * line, b.h + 6 * line);
        }
      }
    }
    previewCanvas.classList.add('show');
  }

  if (showBoxesCheck) showBoxesCheck.addEventListener('change', drawPreview);

  const captchaCellsEl = el('captchaCells'), captchaDiffEl = el('captchaDiff'), captchaConfEl = el('captchaConf');
  function renderCaptchaCells(text, result){
    if (!captchaCellsEl) return;
    const info = CipherState.captchaInfo, slots = info && info.slots && info.slots.length === text.length ? info.slots : null;
    captchaCellsEl.innerHTML = '';
    if (captchaDiffEl) captchaDiffEl.textContent = info ? info.diff + ' · ' + info.n : '—';
    [...text].forEach((ch, i) => {
      const s = slots ? slots[i] : null, cell = document.createElement('div');
      cell.className = 'cap-cell' + (s && ch === s.ch && s.p < 0.6 ? ' low' : '');
      const big = document.createElement('div'); big.className = 'cap-ch'; big.textContent = ch; cell.appendChild(big);
      if (s){
        const alts = document.createElement('div'); alts.className = 'cap-alts';
        const altChoices = [[s.ch, s.p], ...s.alts].filter(a => a[0] !== ch).slice(0, 3);
        altChoices.forEach(([a]) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'cap-alt'; b.textContent = a;
          b.setAttribute('aria-label', 'Use ' + a + ' for character ' + (i + 1));
          b.addEventListener('click', () => {
            const nextText = text.slice(0, i) + a + text.slice(i + 1);
            rawInput.value = nextText;
            if (state.result && state.result.type === 'captcha') {
              renderResult({ ...state.result, ok: true, type: 'captcha', output: nextText, normalized: nextText, reading: nextText, needsReview: false }, { manual: false, autoCopy: true, syncCells: true });
            } else {
              decodeReading();
            }
          });
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

  function renderResult(result, { manual = false, autoCopy = true, syncCells = true } = {}){
    state.result = result;
    state.manual = manual;
    resultRevision++;
    hideCopyNotice();

    if (!result.ok){
      failDecode(result.error || 'This reading could not be decoded.');
      return;
    }

    // Ensure mode-dependent controls (Caesar shift, Color Text, etc.) update for Auto mode
    updateModeUI();

    const effectiveType = result.type || mode;
    const isSort = effectiveType === 'sort';
    const isWords = effectiveType === 'words';
    const isCaesar = effectiveType === 'caesar';
    const isColorText = effectiveType === 'colortext';
    const isGrid = isWords || isColorText;
    const isDual = isSort || isCaesar;
    stamps.classList.toggle('dual', isDual);
    stamps.classList.toggle('words-grid', isGrid);
    stampMain.hidden = isGrid;
    stampDesc.hidden = isGrid || !isDual;
    wordsStamps.forEach(ws => { ws.stamp.hidden = !isWords; });
    applyStampLabels(isCaesar, isSort, isWords);

    if (isSort){
      // Render ascending in stampWord, descending in stampWordDesc
      const nums = (result.normalized || result.reading || '').trim().split(/\s+/).map(Number);
      const asc = [...nums].sort((a,b) => a - b).join(' ');
      const desc = [...nums].sort((a,b) => b - a).join(' ');
      stampWord.textContent = asc;
      stampWordDesc.textContent = desc;
      stampWord.style.color = '';
      answerToCopy = asc;
      answerDescToCopy = desc;
      wordsAnswers = emptyWords();
    } 
    else if (isCaesar){
      const rawLetters = (result.reading || result.text || '').replace(/[^A-Za-z]/g, '').toUpperCase();
      if (rawLetters) lastCaesarLetters = rawLetters;
      let sVal = Math.abs(parseInt(CipherState.caesarShift, 10) || 0);
      const caesarUi = (CipherState.uiModes && CipherState.uiModes.caesar) || 'classic';
      if (caesarUi === 'enhanced') {
        sVal = Math.min(5, Math.max(0, sVal));
        CipherState.caesarShift = sVal;
        if (caesarShiftInput) caesarShiftInput.value = sVal;
      }
      const leftShifted = shiftLetters(rawLetters, -sVal);
      const rightShifted = shiftLetters(rawLetters, sVal);
      stampWord.textContent = leftShifted || '—';
      stampWordDesc.textContent = rightShifted || '—';
      stampWord.style.color = '';
      answerToCopy = leftShifted;
      answerDescToCopy = rightShifted;
      wordsAnswers = emptyWords();
      if (caesarEnhancedLeftText) caesarEnhancedLeftText.textContent = leftShifted || '—';
      if (caesarEnhancedRightText) caesarEnhancedRightText.textContent = rightShifted || '—';
      if (caesarShiftNum) caesarShiftNum.textContent = sVal;
      if (caesarShiftLeftTag) caesarShiftLeftTag.textContent = '-' + sVal;
      if (caesarShiftRightTag) caesarShiftRightTag.textContent = '+' + sVal;
      if (caesarShiftRange) caesarShiftRange.value = sVal;
      const bLeft = el('caesarBadgeLeft'), bRight = el('caesarBadgeRight');
      if (bLeft) bLeft.textContent = sVal === 0 ? 'LEFT (ORIGINAL)' : `LEFT SHIFT (-${sVal})`;
      if (bRight) bRight.textContent = sVal === 0 ? 'RIGHT (ORIGINAL)' : `RIGHT SHIFT (+${sVal})`;
      document.querySelectorAll('.caesar-pill-tag').forEach(b => b.classList.toggle('active', Number(b.dataset.cshift) === sVal));
    }
    else if (isWords){
      const digitWordsList = C.digitWords;
      let w = result.words;
      if (!w){
        const nums = (result.normalized || result.reading || '').trim().split(/\s+/).map(Number);
        const normalLR = nums.map(n => digitWordsList[n] || String(n)).join(' ');
        const normalRL = [...nums].reverse().map(n => digitWordsList[n] || String(n)).join(' ');
        const evens = nums.filter(n => n % 2 === 0);
        const evenLR = evens.map(n => digitWordsList[n] || String(n)).join(' ');
        const evenRL = [...evens].reverse().map(n => digitWordsList[n] || String(n)).join(' ');
        const odds = nums.filter(n => n % 2 !== 0);
        const oddLR = odds.map(n => digitWordsList[n] || String(n)).join(' ');
        const oddRL = [...odds].reverse().map(n => digitWordsList[n] || String(n)).join(' ');
        w = { normalLR, normalRL, evenLR, evenRL, oddLR, oddRL };
      }
      wordsAnswers = {
        normalLR: w.normalLR || '',
        normalRL: w.normalRL || '',
        evenLR: w.evenLR || '',
        evenRL: w.evenRL || '',
        oddLR: w.oddLR || '',
        oddRL: w.oddRL || ''
      };
      wordsStamps.forEach(ws => {
        const val = wordsAnswers[ws.key];
        ws.word.textContent = val || '—';
        ws.word.classList.remove('uncertain');
      });
      answerToCopy = wordsAnswers.normalLR || result.output;
      answerDescToCopy = '';
      stampWord.textContent = answerToCopy;
      stampWordDesc.innerHTML = PLACEHOLDER;
    }
    else if (isColorText) {
      const items = Array.isArray(result.items) ? result.items : (CipherState.colorWordItems || []);
      items.forEach((it, i) => { const bx = result.boxes && result.boxes[i]; if (bx) { if (it.weak === undefined) it.weak = !!bx.weak; if (it.alt === undefined) it.alt = bx.alt || ''; if (!it.cands && bx.cands) it.cands = bx.cands; } });
      CipherState.colorWordItems = items;
      let filt = String(CipherState.colorFilter || 'purple').toLowerCase();
      if (filt !== 'all' && !items.some(it => it.color === filt)) {
        filt = items.some(it => it.color === 'purple') ? 'purple' : (items[0] ? items[0].color : 'all');
        CipherState.colorFilter = filt;
      }
      document.querySelectorAll('.color-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.color === filt));
      colorAnswers = emptyColors();
      for (const item of items) {
        if (item.excluded || colorAnswers[item.color] === undefined) continue;
        colorAnswers[item.color] += (colorAnswers[item.color] ? ' ' : '') + item.word;
      }
      colorStamps.forEach(cs => {
        const val = colorAnswers[cs.color];
        if (val) { cs.word.textContent = val; cs.stamp.hidden = false; }
        else { cs.word.innerHTML = PLACEHOLDER; cs.stamp.hidden = true; }
      });
      answerToCopy = items.filter(it => !it.excluded && (filt === 'all' || it.color === filt)).map(it => it.word).join(' ');
      answerDescToCopy = '';
      stampWord.textContent = answerToCopy;
      stampWordDesc.innerHTML = PLACEHOLDER;
      wordsAnswers = emptyWords();
    }
    else {
      stampWord.textContent = result.output;
      stampWordDesc.innerHTML = PLACEHOLDER;
      stampWord.style.color = '';
      colorStamps.forEach(cs => { cs.stamp.hidden = true; });
      answerToCopy = result.output;
      answerDescToCopy = '';
      wordsAnswers = emptyWords();
    }

    // Start the async clipboard request the instant the final copy string exists.
    // The rest of renderResult() can now update stamps/cells/preview while the browser
    // performs the clipboard operation outside this synchronous JS stack.
    manualDirty = false;
    if (autoCopy && copyOnDecode && !result.needsReview && answerToCopy){
      copyToClipboard(answerToCopy);
    }

    stampWord.classList.remove('uncertain');
    stampWordDesc.classList.remove('uncertain');
    manualDirty = false;
    discardTextBtn.disabled = true;
    cellsWrap.inert = false;
    rawInput.removeAttribute('aria-invalid');
    editStatus.textContent = '';
    refreshCopyTargets();
    copyAnswerBtn.disabled = !answerToCopy;

    hint.textContent = result.needsReview ? 'Check reading before copying.' : 'Decoded successfully (' + C.names[effectiveType] + ').';
    answerStatus.textContent = result.needsReview ? 'Automatic copy paused: review required.' : '';

    if (!manual) rawInput.value = result.reading || result.normalized || '';

    // Build interactive cells if applicable
    if (syncCells) {
      syncing = true;
      try {
      const norm = result.normalized || result.reading || '';
      if (effectiveType === 'morse'){
        const tokens = norm.replace(/\//g, ' ').split(/\s+/).filter(Boolean);
        morseGroups = tokens.map(t => ({ symbols: t.split(''), touched: t.split('').map(() => false) }));
        renderMorseGroups();
      } else if (effectiveType === 'braille'){
        const tokens = norm.split(/\s+/).filter(Boolean);
        cells = tokens.map(t => {
          const dots = [0,0,0,0,0,0];
          if (t.startsWith('[') && t.endsWith(']')){
            for (const ch of t.slice(1,-1)) if (ch >= '1' && ch <= '6') dots[Number(ch)-1] = 1;
          } else if (t.length === 1 && t.charCodeAt(0) >= 0x2800 && t.charCodeAt(0) <= 0x28FF){
            const mask = t.charCodeAt(0) - 0x2800;
            for (let i = 0; i < 6; i++) if ((mask >> i) & 1) dots[i] = 1;
          }
          return { dots, touched: [false,false,false,false,false,false] };
        });
        renderBrailleCells();
      } else if (effectiveType === 'a1z26'){
        const tokens = norm.split('/').map(x => x.trim()).filter(Boolean);
        a1z26Groups = tokens.map(t => ({ digits: t.split(''), touched: t.split('').map(() => false), guess: t.split('').map(() => false) }));
        renderA1Z26Groups();
      } else if (effectiveType === 'sort' || effectiveType === 'words'){
        const tokens = norm.split(/[\s,;]+/).filter(Boolean);
        numberGroups = tokens.map(t => {
          const sign = t.startsWith('-') || t.startsWith('−');
          const digits = t.replace(/^[-+−]/, '').split('');
          return { sign, digits, signTouched: false, digitsTouched: digits.map(() => false) };
        });
        renderSorterGroups();
      } else if (effectiveType === 'caesar'){
        const letters = norm.replace(/[^A-Za-z]/g, '').toUpperCase().split('');
        caesarGroups = letters.map((ch, i) => { const bx = result.boxes && result.boxes[i]; return { letter: ch, touched: false, alts: (bx && bx.alts) || [], weak: !!(bx && bx.weak) }; });
        renderCaesarGroups();
      } else if (effectiveType === 'colortext'){
        renderColorTextGroups();
      } else if (effectiveType === 'captcha'){
        cellsWrap.innerHTML = '';
        results.classList.remove('show');
        renderCaptchaCells(norm, result);
      } else {
        cellsWrap.innerHTML = '';
        results.classList.remove('show');
      }
      } finally { syncing = false; }
    }

    srLive.textContent = 'Decoded ' + (C.names[effectiveType] || '') + ': ' + (isSort ? 'ascending ' + answerToCopy + ', descending ' + answerDescToCopy : answerToCopy);
    drawPreview();
  }

  function imageSample(canvas){
    const thresh = thresholdSelect ? thresholdSelect.value : 'auto';
    const pol = polaritySelect ? polaritySelect.value : 'auto';
    return C.fromRGBA(canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height), {
      threshold: thresh,
      invert: pol === 'invert' ? true : pol
    });
  }

  const yieldToUI = () => new Promise(resolve => {
    if (typeof MessageChannel !== 'function'){ setTimeout(resolve, 0); return; }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(0);
  });

  async function readImage(opts = {}){
    if (!state.canvas) return;
    const job = ++state.job;
    setBusy(true);
    hint.textContent = 'Reading image…';
    if (opts.yield !== false && typeof navigator !== 'undefined' && !(navigator.userActivation && navigator.userActivation.isActive)){
      await yieldToUI();
    }
    try {
      const sample = imageSample(state.canvas);
      sample.canvas = state.canvas;
      const r = C.recognize(sample, mode, { ...options(), canvas: state.canvas });
      if (job !== state.job) return;
      renderResult(r, { manual: false, autoCopy: opts.autoCopy !== false, syncCells: true });
      previewMeta.textContent = state.name + ' · ' + state.canvas.width + ' × ' + state.canvas.height + ' px';
    } catch (err) {
      if (job === state.job) failDecode('The image could not be read: ' + (err.message || err));
    } finally {
      if (job === state.job) setBusy(false);
    }
  }

  function markManualDirty(){
    manualDirty = true;
    resultRevision++;
    hideCopyNotice();
    copyAnswerBtn.disabled = true;
    refreshCopyTargets();
    discardTextBtn.disabled = false;
    cellsWrap.inert = true;
    rawInput.removeAttribute('aria-invalid');
    editStatus.textContent = 'Unapplied changes — click Apply text or press Ctrl+Enter.';
    answerStatus.textContent = 'Text edits have not been applied.';
  }

  function redecodeCurrent(){
    const reading = rawInput.value;
    const decoded = C.decodeText(reading, mode, options());
    if (!decoded.ok){ invalidateAnswer(decoded.error); return; }
    const prev = state.result || {};
    renderResult({ ...decoded, reading, boxes: prev.boxes, confidence: prev.confidence }, { manual: false, autoCopy: true, syncCells: false });
  }

  function decodeReading(){
    state.job++;
    setBusy(false);
    const reading = rawInput.value;
    const decoded = C.decodeText(reading, mode, options());
    if (!decoded.ok){
      markManualDirty();
      rawInput.setAttribute('aria-invalid', 'true');
      editStatus.textContent = decoded.error || 'This reading could not be decoded.';
      hint.textContent = decoded.error || 'This reading could not be decoded.';
      answerStatus.textContent = 'Text not applied — your text was kept. Fix it and apply again.';
      manualEditor.open = true;
      return;
    }
    CipherState.captchaInfo = null; // typed text has no recognizer slots
    renderResult({ ...decoded, reading, confidence: 1, boxes: [] }, { manual: true, syncCells: true });
  }

  // ── Universal Ingestion (Files, Discord/Web URLs, Clipboard from bombs.html) ──
  function extractImageSource(dt) {
    if (!dt) return null;
    if (dt.files && dt.files.length > 0) {
      for (const f of dt.files) {
        if (!f.type || f.type.startsWith('image/')) return { type: 'file', file: f };
      }
      return { type: 'file', file: dt.files[0] };
    }
    if (dt.items && dt.items.length > 0) {
      for (const it of dt.items) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) return { type: 'file', file: f };
        }
      }
    }
    const uriList = dt.getData ? dt.getData('text/uri-list') : '';
    if (uriList) {
      const urls = uriList.split(new RegExp('\r?\n')).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
      if (urls.length > 0) return { type: 'url', url: urls[0] };
    }
    const text = dt.getData ? (dt.getData('text/plain') || dt.getData('text')) : '';
    if (text) {
      const trimmed = text.trim();
      if (/^https?:\/\//i.test(trimmed)) return { type: 'url', url: trimmed };
    }
    const html = dt.getData ? dt.getData('text/html') : '';
    if (html) {
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) return { type: 'url', url: imgMatch[1] };
      const aMatch = html.match(/<a[^>]+href=["']([^"']+)["']/i);
      if (aMatch && aMatch[1] && /^https?:\/\//i.test(aMatch[1])) return { type: 'url', url: aMatch[1] };
    }
    return null;
  }

  // ── Image decoding: no base64 round-trip, and decoded off the main thread where supported ──
  const loadError = message => Object.assign(new Error(message), { userMessage: true });
  const releasable = (image, width, height, release) => ({ image, width, height, release: release || (() => {}) });
  function imageFromURL(url, crossOrigin){
    return new Promise((resolve, reject) => {
      const img = new Image();
      // A stalled request must not hang forever: loads run one at a time, so a hung one would block the next paste.
      const timer = setTimeout(() => { img.onload = img.onerror = null; img.src = ''; reject(new Error('timeout')); }, 15000);
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('decode failed')); };
      img.src = url;
    });
  }
  async function drawableFromBlob(blob){
    if (typeof createImageBitmap === 'function'){
      try {
        const bitmap = await createImageBitmap(blob);
        return releasable(bitmap, bitmap.width, bitmap.height, () => { try { bitmap.close(); } catch (_) {} });
      } catch (_) { /* unsupported type (e.g. SVG): fall back to an <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = await imageFromURL(url);
      return releasable(img, img.naturalWidth, img.naturalHeight);
    } finally { URL.revokeObjectURL(url); }
  }
  async function drawableFromSource(srcObj){
    if (srcObj.type === 'file'){
      try { return { drawable: await drawableFromBlob(srcObj.file), blob: srcObj.file }; }
      catch (_) { throw loadError("That file doesn't look like a readable image."); }
    }
    let blob = null;
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 15000) : null;
      try {
        const res = await fetch(srcObj.url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        blob = await res.blob();
      } finally { clearTimeout(timer); }
    } catch (_) {
      try {
        const img = await imageFromURL(srcObj.url, true);
        return { drawable: releasable(img, img.naturalWidth, img.naturalHeight), blob: null };
      } catch (__) {
        throw loadError('⚠️ Could not load image from URL (blocked by CORS or link expired). Tip: In Discord, right-click image → Copy Image → Ctrl+V here.');
      }
    }
    if (blob && blob.size > MAX_IMAGE_BYTES) throw loadError('That image is larger than 30 MB. Crop or shrink it first.');
    try { return { drawable: await drawableFromBlob(blob), blob }; }
    catch (_) { throw loadError('Could not parse image from URL.'); }
  }

  // Every image input (upload, drop, paste, URL, example) goes through this queue and is handled one at a
  // time, in arrival order. Before, a second image arriving while the first was still decoding cancelled it,
  // so multi-file uploads, multi-file drops and rapid pastes only kept the last screenshot.
  let loadChain = Promise.resolve();
  function loadFromSource(srcObj, name = 'Image') {
    const run = loadChain.then(() => loadOne(srcObj, name));
    loadChain = run.catch(() => {});
    return run;
  }

  async function loadOne(srcObj, name = 'Image') {
    if (!srcObj) return;
    if (srcObj.type === 'file' && srcObj.file && srcObj.file.size > MAX_IMAGE_BYTES){ failDecode('That image is larger than 30 MB. Crop or shrink it first.'); return; }
    // Decode first, then decide where the image belongs. Nothing on screen is cleared until we know it is not
    // a map screenshot, so a scout shot never wipes the current answer and a puzzle strip never touches the map.
    let baseEpoch = inputEpoch;
    let job = null, drawable = null;
    const stale = () => job ? job.id !== inputEpoch : baseEpoch !== inputEpoch;
    setBusy(true);
    hint.textContent = srcObj.type === 'url' ? 'Fetching image from URL…' : 'Opening image…';
    try {
      const loaded = await drawableFromSource(srcObj);
      drawable = loaded.drawable;
      if (!drawable.width || !drawable.height) throw new Error('The image has no readable dimensions.');

      if (mode === 'map' || mode === 'all') {
        if (looksLikeMapShot(drawable)) {
          // Map shots are additive, so they are never dropped as "stale".
          mainView.hidden = false; aboutView.hidden = true;
          if (mode !== 'map') setMode('map', { decode: false, preserve: true }); // All -> Map (keeps the current answer)
          addMapDrawable(drawable);
          return;
        }
        if (stale()) return; // the person switched tab or cleared while this was decoding
        if (mode === 'map'){
          setMode('all', { decode: false }); // not a map screenshot: leave Map (its memory stays) and decode it
          baseEpoch = inputEpoch;            // setMode cancels pending work; that was us, not the person
        }
      }
      if (stale()) return;
      job = beginInput(srcObj.type === 'url' ? 'Reading image from URL…' : 'Reading image…');

      const scale = Math.min(1, 1400 / Math.max(drawable.width, drawable.height), Math.sqrt(1200000 / (drawable.width * drawable.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(drawable.width * scale));
      canvas.height = Math.max(1, Math.round(drawable.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(drawable.image, 0, 0, canvas.width, canvas.height);

      state.canvas = canvas;
      state.name = (loaded.blob && loaded.blob.name) || name;
      state.manual = false;
      state.result = null;
      previewMeta.textContent = drawable.width + '×' + drawable.height + ' px';
      previewRow.classList.add('show');
      // Decode and copy first; the preview is painted by renderResult afterwards.
      await readImage();
    } catch (err) {
      if (!stale()) failDecode(err.message || String(err));
    } finally {
      if (drawable) drawable.release();
      if (!stale()) setBusy(false);
    }
  }

  function loadFile(file, name) {
    return loadFromSource({ type: 'file', file }, name || (file && file.name) || 'Image');
  }

  function loadImageURL(url, name = 'Image') {
    return loadFromSource({ type: 'url', url }, name);
  }

  // Bridge for the "Heist auto-send" browser extension (extension/heist-autosend): its content script posts a
  // Discord image here, the normal image pipeline solves it, and the answer goes back so the extension can put
  // it on the clipboard (this tab is usually in the background then, where the page itself can't copy).
  // Only messages this window posts to itself are accepted; without the extension nothing ever arrives.
  window.addEventListener('message', event => {
    const d = event.data;
    if (event.source !== window || !d || d.source !== 'heist-ext' || d.type !== 'image') return;
    const reply = msg => window.postMessage({ source: 'heist-app', type: 'answer', id: d.id, ...msg }, '*');
    const blob = new Blob([d.buf], { type: d.mime || 'image/png' });
    // d.mode: the puzzle type the file name says (locksmith-morse → morse). Reading in that mode skips All's
    // "is it Morse or Binary?" doubt. If it fails there, the image is read again in All. Afterwards the app
    // goes back to All, so your own pastes keep auto-detecting.
    const startMode = mode;
    const hinted = d.mode && d.mode !== mode && descriptions[d.mode] ? d.mode : null;
    const read = async (m) => {
      if (m && m !== mode) setMode(m, { decode: false });
      const before = state.result;
      await loadBlob(blob, d.name || 'Discord image');
      if (mode === 'map') return { ok: true, map: true, text: '' };
      const r = state.result;
      if (!r || r === before || !r.ok) return { ok: false, error: hint.textContent || 'Could not read the image' };
      const kind = r.type || mode;
      return {
        ok: true, text: answerToCopy, needsReview: !!r.needsReview, kind,
        words: kind === 'words' ? { ...wordsAnswers } : null,
        sorted: kind === 'sort' ? { asc: answerToCopy, desc: answerDescToCopy } : null,
        letters: kind === 'caesar' ? (r.reading || r.text || '').replace(/[^A-Za-z]/g, '').toUpperCase() : ''
      };
    };
    (async () => {
      let res = await read(hinted);
      if (!res.ok && hinted) res = await read('all');
      if (startMode === 'all' && mode !== 'all' && mode !== 'map') setMode('all', { preserve: true });
      reply(res);
    })().catch(err => reply({ ok: false, error: String((err && err.message) || err) }));
  });

  function loadBlob(blob, name = 'Pasted image') {
    return loadFromSource({ type: 'file', file: blob }, name);
  }

  function unpackSource(raw){
    let value = String(raw || '').trim();
    if (/^<img[\s>]/i.test(value)) value = new DOMParser().parseFromString(value, 'text/html').querySelector('img')?.getAttribute('src') || value;
    else value = value.replace(/^<|>$/g, '').replace(/^['"]|['"]$/g, '');
    for (let i = 0; i < 3 && /^(?:data|https?|blob)%3a/i.test(value); i++){
      try { value = decodeURIComponent(value); } catch (_) { throw new Error('The URL-encoded image is malformed.'); }
    }
    if (/^data:image\//i.test(value)){
      const comma = value.indexOf(',');
      if (comma < 0) throw new Error('Data URL is missing data.');
      if (/;base64/i.test(value.slice(0, comma))) value = value.slice(0, comma + 1) + decodeURIComponent(value.slice(comma + 1)).replace(/\s/g, '');
      return value;
    }
    const compact = value.replace(/\s+/g, '');
    if (/^(iVBORw0KGgo|\/9j\/|UklGR|R0lGOD|Qk0)/.test(compact) && /^[A-Za-z0-9+/=]+$/.test(compact)){
      return 'data:image/' + (compact.startsWith('/9j/') ? 'jpeg' : compact.startsWith('UklGR') ? 'webp' : compact.startsWith('R0lGOD') ? 'gif' : compact.startsWith('Qk0') ? 'bmp' : 'png') + ';base64,' + compact;
    }
    if (/^https?:\/\//i.test(value) || /^blob:/i.test(value)) return value;
    throw new Error('Paste an image URL, a data URL, or base64 image data.');
  }

  function isEditable(target){
    return Boolean(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  
  // ── MAP (Scout module) ──
  const MAP_BG = [5, 13, 22];
  const MAP_BG_TOL = 36; // summed per-channel difference, forgives jpeg/scaling noise
  function newLayer(){
    const c = document.createElement('canvas'); c.width = 468; c.height = 360;
    return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }), history: [], count: 0 };
  }
  const slots = Array.from({ length: 5 }, () => ({ map: newLayer(), vent: newLayer() }));
  let curSlot = 0;
  let layers = slots[0]; // the two layers of the selected map slot
  let activeLayer = 'map';
  let ventShown = true;

  function mapRender(){
    const w = Math.max(layers.map.canvas.width, layers.vent.canvas.width);
    const h = Math.max(layers.map.canvas.height, layers.vent.canvas.height);
    if (mapCanvas.width !== w || mapCanvas.height !== h){ mapCanvas.width = w; mapCanvas.height = h; }
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.drawImage(layers.map.canvas, 0, 0);
    if (ventShown) mapCtx.drawImage(layers.vent.canvas, 0, 0);
  }

  function mapUpdateInfo(){
    const total = layers.map.count + layers.vent.count;
    mapCount.textContent = total === 0
      ? 'SLOT ' + (curSlot + 1) + ' · NO SCREENSHOTS YET'
      : 'SLOT ' + (curSlot + 1) + ' · MAP ' + layers.map.count + ' · VENT ' + layers.vent.count + ' · ' + mapCanvas.width + '×' + mapCanvas.height + ' PX';
    mapUndoBtn.disabled = layers[activeLayer].history.length === 0;
    layerMapBtn.classList.toggle('active', activeLayer === 'map');
    layerVentBtn.classList.toggle('active', activeLayer === 'vent');
    document.querySelectorAll('.slot-btn').forEach(btn => {
      const n = parseInt(btn.dataset.slot, 10);
      btn.classList.toggle('active', n === curSlot);
      btn.classList.toggle('has', slots[n].map.count + slots[n].vent.count > 0);
    });
    ventShowBtn.textContent = ventShown ? 'VENT: ON' : 'VENT: OFF';
    ventShowBtn.classList.toggle('vis', ventShown);
    ventShowBtn.setAttribute('aria-pressed', String(ventShown));
  }

  function setSlot(n){
    disarmClearSlot();
    curSlot = n; layers = slots[n];
    mapRender(); mapUpdateInfo();
  }
  document.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => setSlot(parseInt(btn.dataset.slot, 10)));
  });

  function setActiveLayer(name){
    activeLayer = name;
    if (name === 'vent') ventShown = true; // pasting into vent should show it
    mapRender(); mapUpdateInfo();
  }
  layerMapBtn.addEventListener('click', () => setActiveLayer('map'));
  layerVentBtn.addEventListener('click', () => setActiveLayer('vent'));
  ventShowBtn.addEventListener('click', () => { ventShown = !ventShown; mapRender(); mapUpdateInfo(); });

  // Scratch canvases are created once and reused for every screenshot.
  const mapScratch = document.createElement('canvas');
  const mapScratchCtx = mapScratch.getContext('2d', { willReadFrequently: true });
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = probeCanvas.height = 64;
  const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
  const MAP_HISTORY_MAX = 15; // undo depth per layer; each snapshot is a full-layer copy (~0.7 MB)
  const MAP_ASPECT = 468 / 360;

  // Share of opaque pixels that are the scout-map navy. Puzzle strips (paper / white backgrounds) score ~0.
  function mapBackgroundShare(drawable){
    probeCtx.clearRect(0, 0, 64, 64);
    probeCtx.drawImage(drawable.image, 0, 0, 64, 64);
    const d = probeCtx.getImageData(0, 0, 64, 64).data;
    let hits = 0;
    for (let i = 0; i < d.length; i += 4){
      if (d[i+3] < 40 || d[i+3] > 200 && Math.abs(d[i] - MAP_BG[0]) + Math.abs(d[i+1] - MAP_BG[1]) + Math.abs(d[i+2] - MAP_BG[2]) <= MAP_BG_TOL) hits++;
    }
    return hits / 4096;
  }
  // A scout screenshot is exactly 468x360, or (if it was scaled) has that shape AND the navy background.
  // Aspect ratio alone is not enough: a puzzle image can be 4:3-ish too. A mostly navy image of any shape also counts.
  function looksLikeMapShot(drawable){
    const w = drawable.width, h = drawable.height;
    if (w === 468 && h === 360) return mapBackgroundShare(drawable) >= 0.05;
    const aspectOk = Math.abs(w / h - MAP_ASPECT) < 0.06;
    const share = mapBackgroundShare(drawable);
    return (aspectOk && share >= 0.05) || share >= 0.55;
  }

  function addMapDrawable(drawable){
    const L = layers[activeLayer], lc = L.canvas;
    const w = drawable.width, h = drawable.height;

    // Undo snapshot. null = the layer was empty, so undoing is just a reset (no pixel copy at all).
    L.history.push(L.count === 0 ? null : { w: lc.width, h: lc.height, data: L.ctx.getImageData(0, 0, lc.width, lc.height) });
    if (L.history.length > MAP_HISTORY_MAX) L.history.shift();

    // Grow the layer if this screenshot is bigger than anything so far (content stays put).
    if (w > lc.width || h > lc.height){
      const keep = L.ctx.getImageData(0, 0, lc.width, lc.height);
      lc.width = Math.max(lc.width, w); lc.height = Math.max(lc.height, h);
      L.ctx.putImageData(keep, 0, 0);
    }

    // Key the navy background out of the screenshot (alpha 0), then blit it: the layer underneath shows
    // through the background and nothing else has to be read back or rewritten.
    mapScratch.width = w; mapScratch.height = h;
    mapScratchCtx.drawImage(drawable.image, 0, 0);
    const img = mapScratchCtx.getImageData(0, 0, w, h), px = img.data;
    for (let i = 0; i < px.length; i += 4){
      const bg = px[i+3] < 40 || Math.abs(px[i] - MAP_BG[0]) + Math.abs(px[i+1] - MAP_BG[1]) + Math.abs(px[i+2] - MAP_BG[2]) <= MAP_BG_TOL;
      px[i+3] = bg ? 0 : 255;
    }
    mapScratchCtx.putImageData(img, 0, 0);
    L.ctx.drawImage(mapScratch, 0, 0);

    L.count++;
    hint.textContent = '';
    srLive.textContent = 'Screenshot added to the ' + activeLayer + ' layer of slot ' + (curSlot + 1) + '.';
    mapRender(); mapUpdateInfo();
  }

  function resetLayer(L){ L.history = []; L.count = 0; L.canvas.width = 468; L.canvas.height = 360; }
  function clearMap(){
    resetLayer(layers.map); resetLayer(layers.vent);
    hint.textContent = '';
    mapRender(); mapUpdateInfo();
  }
  mapClearLayerBtn.addEventListener('click', () => { resetLayer(layers[activeLayer]); mapRender(); mapUpdateInfo(); });

  // Clear slot wipes both layers, so it asks for a second click.
  let clearSlotTimer = null;
  function disarmClearSlot(){
    clearTimeout(clearSlotTimer); clearSlotTimer = null;
    mapClearSlotBtn.textContent = 'Clear slot';
  }
  mapClearSlotBtn.addEventListener('click', () => {
    if (clearSlotTimer === null){
      mapClearSlotBtn.textContent = 'Sure? Click again';
      clearSlotTimer = setTimeout(disarmClearSlot, 2500);
      return;
    }
    disarmClearSlot();
    clearMap();
  });

  mapUndoBtn.addEventListener('click', () => {
    const L = layers[activeLayer], snap = L.history.pop();
    if (snap === undefined) return;
    if (snap === null){
      L.canvas.width = 468; L.canvas.height = 360; L.count = 0; // the layer was empty before this screenshot
    } else {
      L.canvas.width = snap.w; L.canvas.height = snap.h;
      L.ctx.putImageData(snap.data, 0, 0);
      L.count = Math.max(0, L.count - 1);
    }
    mapRender(); mapUpdateInfo();
  });

  function mapExportCanvas(){
    const out = document.createElement('canvas');
    out.width = mapCanvas.width; out.height = mapCanvas.height;
    const o = out.getContext('2d');
    o.fillStyle = 'rgb(' + MAP_BG.join(',') + ')';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(mapCanvas, 0, 0);
    return out;
  }
  const mapHasContent = () => layers.map.count + layers.vent.count > 0;
  mapSaveBtn.addEventListener('click', () => {
    if (!mapHasContent()) return;
    mapExportCanvas().toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'merged-map.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  });
  mapCopyBtn.addEventListener('click', () => {
    if (!mapHasContent()) return;
    mapExportCanvas().toBlob(b => {
      if (navigator.clipboard && window.ClipboardItem){
        navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
          .then(() => {
            clearTimeout(toastTimer);
            copiedToast.textContent = 'COPIED ✓';
            copiedToast.classList.remove('copy-error');
            copiedToast.classList.add('show');
            toastTimer = setTimeout(() => copiedToast.classList.remove('show'), 1600);
          })
          .catch(() => { hint.textContent = "Couldn't copy the image here - use Save PNG instead."; });
      } else {
        hint.textContent = "Copying images isn't supported in this browser - use Save PNG instead.";
      }
    }, 'image/png');
  });

  // Movement rows copy a fixed string, not the decoded answer, so they skip the answer-eligibility checks in
  // copyToClipboard() (which is why they used to copy nothing).
  function copyMove(btn){
    const text = btn.dataset.move;
    const done = ok => {
      clearTimeout(toastTimer);
      copiedToast.textContent = ok ? 'COPIED ✓' : 'Copy unavailable — select the text and copy it.';
      copiedToast.classList.toggle('copy-error', !ok);
      copiedToast.classList.add('show');
      toastTimer = setTimeout(() => copiedToast.classList.remove('show'), ok ? 1600 : 6500);
      if (ok){
        btn.classList.add('flash');
        clearTimeout(btn._flash);
        btn._flash = setTimeout(() => btn.classList.remove('flash'), 900);
      }
    };
    if (fallbackCopy(text)){ done(true); return; } // synchronous, inside the click
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    else done(false);
  }
  document.querySelectorAll('#moveCopy .move-row').forEach(btn => {
    btn.addEventListener('click', () => copyMove(btn));
  });

// Upload & Drag/Drop
  fileInput.addEventListener('change', async event => {
    // Copy the list before clearing the input: clearing it empties the live FileList in Chromium.
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    fileInput.value = '';
    if (mode === 'map' || (mode === 'all' && files.length > 1)){
      for (const f of files) await loadFile(f, f.name);
    } else {
      loadFile(files[0], files[0].name).then(() => {
        if (files.length > 1) hint.textContent = (hint.textContent ? hint.textContent + ' ' : '') + 'Only the first of ' + files.length + ' images is read in this mode; use All or Map for several.';
      });
    }
  });
  const uploadLabel = document.querySelector('label.upload-btn[for="fileInput"]');
  if (uploadLabel) uploadLabel.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' '){ event.preventDefault(); fileInput.click(); }
  });
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' '){ event.preventDefault(); fileInput.click(); }
  });

  let dragDepth = 0;
  // Only files and links count as droppable images. Dragging plain text (e.g. into the editor) must not be hijacked.
  // A drag that started inside this page (e.g. selected text) is not an image drop: told per drag
  // from its data (utils/image.js), not a page-wide flag that could stay on and refuse every link.
  const isDroppable = dt => !!dt && (Array.from(dt.types || []).includes('Files') || !isInternalDrag(dt));
  // a dragged Discord link: open the connection to Discord's CDN while the drag is still in the air
  window.addEventListener('dragenter', event => {
    if (dragHasLink(event.dataTransfer)) warmImageHosts();
    if (!isDroppable(event.dataTransfer)) return;
    event.preventDefault(); dragDepth++; dropzone.classList.add('drag');
  });
  window.addEventListener('dragover', event => {
    if (!isDroppable(event.dataTransfer)) return;
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone.classList.remove('drag');
  });
  window.addEventListener('dragend', () => {
    dragDepth = 0; dropzone.classList.remove('drag');
  });

  async function handleDropDataTransfer(dt){
    if (!dt) return;
    if (dt.files && dt.files.length > 1 && (mode === 'map' || mode === 'all')){
      for (const f of Array.from(dt.files)){
        if (!f.type || f.type.startsWith('image/')) await loadFile(f, f.name);
      }
      return;
    }
    const src = extractImageSource(dt);
    if (src){
      await loadFromSource(src);
      if (dt.files && dt.files.length > 1) hint.textContent = (hint.textContent ? hint.textContent + ' ' : '') + 'Only the first of ' + dt.files.length + ' images is read in this mode; use All or Map for several.';
    } else { hint.textContent = 'Drop an image file or a direct image link.'; }
  }

  dropzone.addEventListener('drop', async event => {
    if (!isDroppable(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth = 0; dropzone.classList.remove('drag');
    await handleDropDataTransfer(event.dataTransfer);
  });

  // Global window drop (bombs.html pattern: prevent navigation and load image)
  window.addEventListener('drop', async event => {
    if (!isDroppable(event.dataTransfer)) { dragDepth = 0; dropzone.classList.remove('drag'); return; }
    event.preventDefault();
    dragDepth = 0; dropzone.classList.remove('drag');
    if (dropzone.contains(event.target)) return;
    await handleDropDataTransfer(event.dataTransfer);
  });

  const TRUSTED_IMG_HOSTS = /(^|\.)(discordapp\.com|discordapp\.net|imgur\.com|redd\.it|ibb\.co|catbox\.moe|prnt\.sc|gyazo\.com)$/i;
  // Pasting a link makes the browser contact that host, so unknown non-image links ask first.
  function remoteOk(url){
    if (!/^https?:/i.test(url)) return true;
    try {
      const u = new URL(url);
      if (/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(u.pathname) || TRUSTED_IMG_HOSTS.test(u.hostname)) return true;
      return true;
    } catch (_) { return false; }
  }
  window.addEventListener('paste', async event => {
    const cd = event.clipboardData;
    if (!cd) return;

    const src = extractImageSource(cd);
    if (src) {
      if (isEditable(event.target)) {
        if (src.type === 'file') {
          event.preventDefault();
          loadFromSource(src);
          return;
        }
        return;
      }
      event.preventDefault();
      if (src.type === 'url' && !remoteOk(src.url)) return;
      loadFromSource(src);
      return;
    }

    if (isEditable(event.target)) return;
    const text = cd.getData ? (cd.getData('text/plain') || cd.getData('text')) : '';
    if (text && text.trim()){
      try {
        const unpacked = unpackSource(text);
        if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
          event.preventDefault();
          if (!remoteOk(unpacked)) return;
          loadFromSource({ type: 'url', url: unpacked });
          return;
        }
      } catch (_) {}
    }
  });

  function isMobileDevice(){
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
      (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent || ''));
  }

  function openMobilePasteModal(){
    if (!mobilePasteModal) return;
    mobilePasteModal.hidden = false;
    if (mobilePasteTarget){
      mobilePasteTarget.innerHTML = '';
    }
  }

  function hideMobilePasteModal(){
    if (!mobilePasteModal) return;
    mobilePasteModal.hidden = true;
    if (mobilePasteTarget){
      mobilePasteTarget.innerHTML = '';
      try { mobilePasteTarget.blur(); } catch (_) {}
    }
  }

  // Paste image from button (reads clipboard directly on desktop, or opens mobile paste modal)
  async function pasteFromButton(){
    if (isMobileDevice() || !navigator.clipboard || !navigator.clipboard.read){
      openMobilePasteModal();
      return;
    }
    const job = beginInput('Reading clipboard…');
    try {
      const items = await navigator.clipboard.read();
      if (job.id !== inputEpoch) return;
      for (const item of items){
        const type = item.types.find(x => x.startsWith('image/'));
        if (type){
          const blob = await item.getType(type);
          if (job.id !== inputEpoch) return;
          await loadBlob(blob, 'Pasted image');
          return;
        }
      }
      for (const item of items){
        if (item.types.includes('text/plain')){
          const text = await (await item.getType('text/plain')).text();
          if (job.id !== inputEpoch) return;
          const trimmed = (text || '').trim();
          if (trimmed){
            try {
              const unpacked = unpackSource(trimmed);
              if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
                if (!remoteOk(unpacked)) return;
                await loadFromSource({ type: 'url', url: unpacked });
                return;
              }
            } catch (_) {}
            rawInput.value = trimmed;
            decodeReading();
            return;
          }
        }
      }
      failDecode('No image or supported reading was found in clipboard. Copy a puzzle image, then paste.');
    } catch (err){
      if (job.id === inputEpoch){
        openMobilePasteModal();
      }
    } finally {
      if (job.id === inputEpoch) setBusy(false);
    }
  }
  if (pasteBtn) pasteBtn.addEventListener('click', pasteFromButton);

  // Mobile Paste Modal Events
  if (closePasteModal){
    closePasteModal.addEventListener('click', hideMobilePasteModal);
  }
  if (mobilePasteModal){
    mobilePasteModal.addEventListener('click', event => {
      if (event.target === mobilePasteModal) hideMobilePasteModal();
    });
  }
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobilePasteModal && !mobilePasteModal.hidden){
      hideMobilePasteModal();
    }
  });
  async function handleModalLinkLoad(){
    if (!modalLinkInput) return;
    const rawVal = (modalLinkInput.value || '').trim();
    if (!rawVal){
      hint.textContent = 'Please enter an image URL or Discord image link.';
      return;
    }
    const unpacked = unpackSource(rawVal);
    hideMobilePasteModal();
    modalLinkInput.value = '';
    if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
      if (!remoteOk(unpacked)) return;
      await loadFromSource({ type: 'url', url: unpacked });
      return;
    }
    rawInput.value = unpacked;
    decodeReading();
  }

  if (modalLoadLinkBtn){
    modalLoadLinkBtn.addEventListener('click', handleModalLinkLoad);
  }
  if (modalLinkInput){
    modalLinkInput.addEventListener('keydown', event => {
      if (event.key === 'Enter'){
        event.preventDefault();
        handleModalLinkLoad();
      }
    });
  }

  async function handleModalClipboardClick(){
    if (!navigator.clipboard){
      hint.textContent = 'Direct clipboard reading not supported in this browser. Use the paste box below or choose an image file.';
      return;
    }
    const job = beginInput('Reading clipboard…');
    try {
      if (navigator.clipboard.read){
        try {
          const items = await navigator.clipboard.read();
          if (job.id !== inputEpoch) return;
          for (const item of items){
            const type = item.types.find(x => x.startsWith('image/'));
            if (type){
              const blob = await item.getType(type);
              if (job.id !== inputEpoch) return;
              hideMobilePasteModal();
              await loadBlob(blob, 'Pasted image');
              return;
            }
          }
          for (const item of items){
            if (item.types.includes('text/plain')){
              const text = await (await item.getType('text/plain')).text();
              if (job.id !== inputEpoch) return;
              const trimmed = (text || '').trim();
              if (trimmed){
                const unpacked = unpackSource(trimmed);
                hideMobilePasteModal();
                if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
                  if (!remoteOk(unpacked)) return;
                  await loadFromSource({ type: 'url', url: unpacked });
                  return;
                }
                rawInput.value = trimmed;
                decodeReading();
                return;
              }
            }
          }
        } catch (_) {}
      }
      if (navigator.clipboard.readText){
        const text = await navigator.clipboard.readText();
        if (job.id !== inputEpoch) return;
        const trimmed = (text || '').trim();
        if (trimmed){
          const unpacked = unpackSource(trimmed);
          hideMobilePasteModal();
          if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
            if (!remoteOk(unpacked)) return;
            await loadFromSource({ type: 'url', url: unpacked });
            return;
          }
          rawInput.value = trimmed;
          decodeReading();
          return;
        }
      }
      hint.textContent = 'No image or valid image link found in clipboard.';
    } catch (err){
      hint.textContent = 'Clipboard permission was blocked. Tap the paste target below or choose from Gallery.';
    } finally {
      if (job.id === inputEpoch) setBusy(false);
    }
  }

  if (modalClipboardBtn){
    modalClipboardBtn.addEventListener('click', handleModalClipboardClick);
  }

  if (pasteModalGalleryBtn){
    pasteModalGalleryBtn.addEventListener('click', () => {
      hideMobilePasteModal();
      if (fileInput) fileInput.click();
    });
  }
  // coming back to the page (from Discord) usually comes right before a paste of a link
  window.addEventListener('focus', () => warmImageHosts());
  if (mobilePasteTarget){
    mobilePasteTarget.addEventListener('focus', () => warmImageHosts());
    mobilePasteTarget.addEventListener('paste', async event => {
      event.preventDefault();
      event.stopPropagation();
      const cd = event.clipboardData;
      if (!cd) return;

      const src = extractImageSource(cd);
      if (src){
        hideMobilePasteModal();
        if (src.type === 'url' && !remoteOk(src.url)) return;
        await loadFromSource(src);
        return;
      }

      const text = cd.getData ? (cd.getData('text/plain') || cd.getData('text')) : '';
      if (text && text.trim()){
        try {
          const unpacked = unpackSource(text.trim());
          if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
            hideMobilePasteModal();
            if (!remoteOk(unpacked)) return;
            await loadFromSource({ type: 'url', url: unpacked });
            return;
          }
          hideMobilePasteModal();
          rawInput.value = unpacked;
          decodeReading();
          return;
        } catch (_) {}
      }
      failDecode('No image or valid puzzle reading found in pasted content.');
      hideMobilePasteModal();
    });

    mobilePasteTarget.addEventListener('input', async () => {
      const img = mobilePasteTarget.querySelector('img');
      if (img && img.src){
        const srcUrl = img.src;
        hideMobilePasteModal();
        if (remoteOk(srcUrl)){
          await loadFromSource({ type: 'url', url: srcUrl });
        }
        return;
      }
      const text = (mobilePasteTarget.innerText || mobilePasteTarget.textContent || '').trim();
      if (text){
        try {
          const unpacked = unpackSource(text);
          if (/^data:image\//i.test(unpacked) || /^https?:\/\//i.test(unpacked)){
            hideMobilePasteModal();
            if (!remoteOk(unpacked)) return;
            await loadFromSource({ type: 'url', url: unpacked });
            return;
          }
        } catch (_) {}
      }
    });
  }

  // Manual Editor Listeners
  rawInput.addEventListener('input', markManualDirty);

  applyTextBtn.addEventListener('click', decodeReading);
  rawInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)){
      event.preventDefault();
      decodeReading();
    }
  });
  discardTextBtn.addEventListener('click', () => {
    manualDirty = false;
    cellsWrap.inert = false;
    discardTextBtn.disabled = true;
    rawInput.removeAttribute('aria-invalid');
    if (state.result) renderResult(state.result, { manual: false, autoCopy: false, syncCells: true });
  });

  // Settings dropdowns
  if (letterCaseSelect) letterCaseSelect.addEventListener('change', () => {
    if (!rawInput.value.trim()){ if (state.canvas) readImage(); return; }
    if (manualDirty) decodeReading();
    else redecodeCurrent();
  });
  [thresholdSelect, polaritySelect].forEach(sel => {
    if (sel) sel.addEventListener('change', () => {
      if (state.canvas) readImage();
    });
  });

  // Examples & Self-Test
  // Example images live in a JSON block at the end of the page and are parsed only when first needed.
  const EXAMPLE_LABELS = ["Morse · 5 letters", "A1Z26 · 3 letters", "Binary · 3 letters", "Sort · signed integers", "Braille · LCI", "Chinese · 81486", "Words · 8 7 3", "Morse · XWDHK", "Morse · dashes only", "Morse · VNM", "Morse · BZB", "Morse · KKY", "A1Z26 · YUW", "A1Z26 · KVL", "Sort · −43, 35, −24", "Braille · JBB", "Words · 6 1 3", "Words · 0 4 2 1 9", "Words · 4 6 7 1 5", "Words · 0 2 3 1 5", "Sort · −93, −1, −100", "Sort · 23, 43, −85", "Sort · −19, −72, 75", "Sort · −10, −9, −57", "Sort · −70, −32, −99", "Sort · 6, −66, 66", "Sort · −13, 17, 25", "Sort · 69, −89, 79", "Sort · −77, 0, 77", "Sort · 63, −44, −54", "Chinese · 5013446", "Chinese · 8043224", "Chinese · 5537006", "Words · alternate sample"];
  let exampleCache = null;
  const allExamples = () => {
    if (!exampleCache){
      try { exampleCache = JSON.parse(document.getElementById('cipherExamplesData').textContent); } catch (_) { exampleCache = []; }
    }
    return exampleCache;
  };
  const examples = EXAMPLE_LABELS.map(label => ({ label }));
  if (exampleSelect){
    examples.forEach((e, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = e.label;
      exampleSelect.appendChild(opt);
    });
  }
  if (loadExampleBtn){
    loadExampleBtn.addEventListener('click', async () => {
      const e = allExamples()[Number(exampleSelect.value)];
      if (!e) return;
      setMode('all', { decode: false });
      await loadImageURL(e.data, e.label);
    });
  }
  if (selfTestBtn){
    selfTestBtn.addEventListener('click', async () => {
      selfTestBtn.disabled = true;
      selfTestOutput.hidden = false;
      selfTestOutput.textContent = 'Checking embedded example images...';
      let passed = 0; const lines = []; const examples = allExamples();
      for (const e of examples){
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = e.data; });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const sample = C.fromRGBA(ctx.getImageData(0, 0, canvas.width, canvas.height));
          const res = C.recognize(sample, 'all', { order: 'asc', letterCase: 'preserve' });
          const ok = res.ok && res.type === e.type && res.output === e.expected && !res.needsReview;
          if (ok) passed++;
          lines.push((ok ? 'PASS' : 'FAIL') + ' · ' + e.label + ' → ' + (res.output || res.error));
        } catch (err) {
          lines.push('FAIL · ' + e.label + ' · ' + (err.message || 'Image error'));
        }
        selfTestOutput.textContent = passed + ' / ' + examples.length + ' passed\n' + lines.join('\n');
        await new Promise(r => setTimeout(r, 0));
      }
      selfTestOutput.textContent = passed + ' / ' + examples.length + ' examples passed\n' + lines.join('\n');
      selfTestBtn.disabled = false;
    });
  }

  // About View and Changelog
  const settingsBtn = el('settingsBtn'), settingsBackBtn = el('settingsBackBtn'), settingsView = el('settingsView');
  const patchNotesBtn = el('patchNotesBtn'), patchNotesBackBtn = el('patchNotesBackBtn'), patchNotesView = el('patchNotesView');

  function showOnlyView(viewToShow) {
    [mainView, aboutView, settingsView, patchNotesView].forEach(v => {
      if (v) v.hidden = (v !== viewToShow);
    });
  }

  if (settingsBtn) settingsBtn.addEventListener('click', () => showOnlyView(settingsView));
  if (settingsBackBtn) settingsBackBtn.addEventListener('click', () => showOnlyView(mainView));
  if (patchNotesBtn) patchNotesBtn.addEventListener('click', () => showOnlyView(patchNotesView));
  if (patchNotesBackBtn) patchNotesBackBtn.addEventListener('click', () => showOnlyView(mainView));
  if (aboutBtn) aboutBtn.addEventListener('click', () => showOnlyView(aboutView));
  if (aboutBackBtn) aboutBackBtn.addEventListener('click', () => showOnlyView(mainView));

  // Sync settings inputs with main controls
  const settingsAutoCopy = el('settingsAutoCopy');
  if (settingsAutoCopy && copyToggle) {
    settingsAutoCopy.checked = copyToggle.classList.contains('on');
    settingsAutoCopy.addEventListener('change', () => {
      if (copyToggle.classList.contains('on') !== settingsAutoCopy.checked) {
        copyToggle.click();
      }
    });
  }
  const settingsShowBoxes = el('settingsShowBoxes');
  if (settingsShowBoxes && showBoxesCheck) {
    settingsShowBoxes.checked = showBoxesCheck.checked;
    settingsShowBoxes.addEventListener('change', () => {
      showBoxesCheck.checked = settingsShowBoxes.checked;
      showBoxesCheck.dispatchEvent(new Event('change'));
    });
    showBoxesCheck.addEventListener('change', () => {
      settingsShowBoxes.checked = showBoxesCheck.checked;
    });
  }
  const settingsCaseSelect = el('settingsCaseSelect');
  if (settingsCaseSelect && letterCaseSelect) {
    settingsCaseSelect.value = letterCaseSelect.value;
    settingsCaseSelect.addEventListener('change', () => {
      letterCaseSelect.value = settingsCaseSelect.value;
      letterCaseSelect.dispatchEvent(new Event('change'));
    });
    letterCaseSelect.addEventListener('change', () => {
      settingsCaseSelect.value = letterCaseSelect.value;
    });
  }

  // Settings UI Color controls (Freetoes style)
  const uSlider = el('uiColorSlider'), uHexInput = el('uiColorHexInput'), uResetBtn = el('uiColorResetBtn');
  const sBgImageUrl = el('settingsBgImageUrl'), sBgImageApply = el('settingsBgImageApply'), sBgImageClear = el('settingsBgImageClear');
  const sBgStatus = el('settingsBgStatus');

  if (uSlider) {
    uSlider.addEventListener('input', () => {
      applyBgColor(uSlider.value);
      if (uHexInput) uHexInput.value = uSlider.value;
    });
  }
  if (uHexInput) {
    uHexInput.addEventListener('input', () => {
      let val = uHexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (HEX_RE.test(val)) {
        applyBgColor(val);
        if (uSlider) uSlider.value = val;
      }
    });
  }
  if (uResetBtn) {
    uResetBtn.addEventListener('click', () => {
      applyBgColor(DEFAULT_BG_COLOR);
      if (uSlider) uSlider.value = DEFAULT_BG_COLOR;
      if (uHexInput) uHexInput.value = DEFAULT_BG_COLOR;
    });
  }
  if (sBgImageApply && bgImageApply) {
    sBgImageApply.addEventListener('click', () => {
      applyBgImage(sBgImageUrl.value);
      bgImageUrl.value = sBgImageUrl.value;
    });
    sBgImageClear.addEventListener('click', () => {
      applyBgImage('');
      sBgImageUrl.value = '';
      bgImageUrl.value = '';
    });
  }
  changelogBtn.addEventListener('click', () => {
    const show = changelogList.hasAttribute('hidden');
    changelogList.hidden = !show;
    changelogBtn.setAttribute('aria-expanded', String(show));
    changelogBtn.textContent = show ? 'CHANGELOG ▴' : 'CHANGELOG ▾';
  });

  const patchNotesList = document.getElementById('patchNotesList');
  if (patchNotesList && changelogList) patchNotesList.innerHTML = changelogList.innerHTML; // one changelog, shown on both pages

  // Background Customization
  const BG_COLOR_KEY = 'braillevision_bg_color', BG_IMAGE_KEY = 'braillevision_bg_image';
  const DEFAULT_BG_COLOR = '#EDE6D6', HEX_RE = /^#[0-9a-fA-F]{6}$/;
  let backgroundEpoch = 0, backgroundProbe = null, backgroundTimer = null;

  function hexToRgb(hex) {
    const num = parseInt(hex.slice(1), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  }
  function mixColors(hex1, hex2, weight) {
    const c1 = hexToRgb(hex1), c2 = hexToRgb(hex2);
    return rgbToHex(
      c1[0] * weight + c2[0] * (1 - weight),
      c1[1] * weight + c2[1] * (1 - weight),
      c1[2] * weight + c2[2] * (1 - weight)
    );
  }

  // Themes with a look of their own (Settings → Theme Colors): Cyberpunk 2077, Yuza, Dixie (core/skins.js).
  // <html data-skin="…"> turns on its CSS (Cyberpunk's in heist.css, Yuza's and Dixie's in
  // styles/skins/friends.css); its accents are set here, after applyBgColor's palette. Any colour picked by hand ends it.
  const SKIN_KEY = 'braillevision_skin';
  function applySkin(skin, opts){
    const root = document.documentElement;
    const on = isSkin(skin);
    if (on) {
      root.setAttribute('data-skin', skin);
      for (const [k, v] of Object.entries(SKINS[skin].heist)) root.style.setProperty(k, v);
      loadSkinFont(skin);
    } else if (root.getAttribute('data-skin')) {
      root.removeAttribute('data-skin');
      // the accents go back to heist.css's; borders and soft text to what applyBgColor just set
      for (const k of ['--brass', '--brass-deep', '--dropzone-active']) root.style.removeProperty(k);
    }
    const note = document.getElementById('skinNote');
    if (note) { note.hidden = !on; if (on) note.textContent = SKINS[skin].note; }
    document.querySelectorAll('.theme-preset-btn').forEach(b => b.classList.toggle('on', on && b.dataset.skin === skin));
    if (!(opts && opts.skipSave)) try { localStorage.setItem(SKIN_KEY, on ? skin : ''); } catch (_) {}
  }

  function applyBgColor(hex, opts){
    if (!HEX_RE.test(hex)) return;
    const [r, g, b] = hexToRgb(hex);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isDark = lum < 128;

    // Adapt palette based on theme brightness
    const raised = isDark ? mixColors(hex, '#ffffff', 0.85) : mixColors(hex, '#ffffff', 0.65);
    const line = isDark ? mixColors(hex, '#ffffff', 0.70) : mixColors(hex, '#000000', 0.85);
    const ink = isDark ? '#F5F5F7' : '#211D17';
    const inkSoft = isDark ? '#A1A1A6' : '#6C6255';

    document.documentElement.style.setProperty('--paper', hex);
    document.documentElement.style.setProperty('--paper-raised', raised);
    document.documentElement.style.setProperty('--line', line);
    document.documentElement.style.setProperty('--ink', ink);
    document.documentElement.style.setProperty('--ink-soft', inkSoft);
    document.body.style.backgroundColor = hex;

    // Sync all pickers & inputs
    if (typeof bgColorPicker !== 'undefined' && bgColorPicker) bgColorPicker.value = hex;
    if (typeof bgColorHex !== 'undefined' && bgColorHex) bgColorHex.value = hex;
    const uSlider = document.getElementById('uiColorSlider');
    const uInput = document.getElementById('uiColorHexInput');
    if (uSlider && uSlider.value.toLowerCase() !== hex.toLowerCase()) uSlider.value = hex;
    if (uInput && uInput.value.toLowerCase() !== hex.toLowerCase()) uInput.value = hex;

    if (!(opts && opts.skipSave)) try { localStorage.setItem(BG_COLOR_KEY, hex); } catch (_) {}
    if (!(opts && opts.keepSkin)) applySkin('', opts);
  }
  function setBgStatus(message, kind){
    bgImageStatus.textContent = message || '';
    bgImageStatus.className = 'bg-status' + (kind ? ' ' + kind : '');
  }
  function normalizeImageUrl(raw){
    let value = String(raw || '').trim();
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      if (!/(^|\.)imgur\.com$/i.test(url.hostname) || url.hostname.toLowerCase() === 'i.imgur.com') return value;
      const parts = url.pathname.split('/').filter(Boolean), id = parts[parts.length - 1];
      if (id && !id.includes('.') && parts.length === 1) return 'https://i.imgur.com/' + id + '.jpg';
      return value;
    } catch (_) { return ''; }
  }
  function applyBgImage(value, opts){
    const revision = ++backgroundEpoch;
    clearTimeout(backgroundTimer);
    if (backgroundProbe){ backgroundProbe.onload = backgroundProbe.onerror = null; backgroundProbe.src = ''; backgroundProbe = null; }
    const trimmed = (value || '').trim();
    if (!trimmed){
      for (const prop of ['backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat','backgroundAttachment']) document.body.style[prop] = '';
      document.body.classList.remove('bg-picture'); // (the Cyberpunk backdrop shows again)
      bgImageUrl.value = '';
      setBgStatus('');
      if (!(opts && opts.skipSave)) try { localStorage.setItem(BG_IMAGE_KEY, ''); } catch (_) {}
      return;
    }
    const url = normalizeImageUrl(trimmed);
    if (!url){ setBgStatus('Enter a direct image URL beginning with https:// or http://.', 'err'); return; }
    setBgStatus('Loading image…', 'info');
    const probe = new Image();
    backgroundProbe = probe;
    const failed = () => {
      if (revision === backgroundEpoch){
        clearTimeout(backgroundTimer);
        setBgStatus('Could not load that image. Use an i.imgur.com direct link.', 'err');
      }
    };
    probe.onload = () => {
      if (revision !== backgroundEpoch) return;
      clearTimeout(backgroundTimer);
      document.body.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.classList.add('bg-picture'); // a picture replaces the Cyberpunk backdrop
      bgImageUrl.value = url;
      setBgStatus('✓ background updated', 'ok');
      if (!(opts && opts.skipSave)) try { localStorage.setItem(BG_IMAGE_KEY, url); } catch (_) {}
    };
    probe.onerror = failed;
    backgroundTimer = setTimeout(() => { failed(); probe.onload = probe.onerror = null; probe.src = ''; }, 15000);
    probe.src = url;
  }

  bgColorPicker.addEventListener('input', () => applyBgColor(bgColorPicker.value));
  bgColorHex.addEventListener('change', () => {
    let val = bgColorHex.value.trim();
    if (val && !val.startsWith('#')) val = '#' + val;
    applyBgColor(val);
  });
  bgColorReset.addEventListener('click', () => applyBgColor(DEFAULT_BG_COLOR));
  bgImageApply.addEventListener('click', () => applyBgImage(bgImageUrl.value));
  bgImageUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter'){ event.preventDefault(); applyBgImage(bgImageUrl.value); }
  });
  bgImageClear.addEventListener('click', () => applyBgImage(''));

  try {
    const savedColor = localStorage.getItem(BG_COLOR_KEY);
    const savedImage = localStorage.getItem(BG_IMAGE_KEY);
    // a skin's background is its button's (a skin recoloured later reaches people who saved the old one)
    const savedSkin = isSkin(localStorage.getItem(SKIN_KEY)) ? localStorage.getItem(SKIN_KEY) : '';
    const skinBtn = savedSkin && document.querySelector(`.theme-preset-btn[data-skin="${savedSkin}"]`);
    const startColor = skinBtn ? skinBtn.dataset.color : savedColor;
    if (startColor && HEX_RE.test(startColor)) applyBgColor(startColor, { skipSave: true, keepSkin: true });
    if (savedSkin) applySkin(savedSkin, { skipSave: true });
    if (savedImage) applyBgImage(savedImage, { skipSave: true });
  } catch (_) {}

  // Initialize Mode
  updateModeUI();

  // Pure helpers exposed for external / inspect
  window.CipherDesk = {
    unpackSource,
    decodeText: C.decodeText,
    loadImageURL,
    loadBlob,
    readImage,
    pasteFromButton
  };



  // --- Enhanced Caesar Stepper, Slider & Copy Listeners (Optimized for [0, 5]) ---
  if (caesarStepDown) {
    caesarStepDown.addEventListener('click', () => {
      const cur = parseInt(CipherState.caesarShift, 10) || 0;
      const next = Math.max(0, cur - 1);
      if (caesarShiftInput) caesarShiftInput.value = next;
      applyCaesarShift(true);
    });
  }
  if (caesarStepUp) {
    caesarStepUp.addEventListener('click', () => {
      const cur = parseInt(CipherState.caesarShift, 10) || 0;
      const next = Math.min(5, cur + 1);
      if (caesarShiftInput) caesarShiftInput.value = next;
      applyCaesarShift(true);
    });
  }
  if (caesarResetBtn) {
    caesarResetBtn.addEventListener('click', () => {
      if (caesarShiftInput) caesarShiftInput.value = 0;
      applyCaesarShift(true);
    });
  }
  if (caesarShiftRange) {
    caesarShiftRange.addEventListener('input', () => {
      if (caesarShiftInput) caesarShiftInput.value = caesarShiftRange.value;
      applyCaesarShift(true);
    });
  }
  document.querySelectorAll('.caesar-ticks span').forEach(tick => {
    tick.addEventListener('click', () => {
      const v = parseInt(tick.dataset.val ?? tick.textContent, 10);
      if (!isNaN(v) && v >= 0 && v <= 5) {
        if (caesarShiftInput) caesarShiftInput.value = v;
        applyCaesarShift(true);
      }
    });
  });
  document.querySelectorAll('.caesar-pill-tag').forEach(pill => {
    pill.addEventListener('click', () => {
      const s = parseInt(pill.dataset.cshift, 10) || 0;
      if (caesarShiftInput) caesarShiftInput.value = s;
      applyCaesarShift(true);
    });
  });
  if (caesarCardLeft) {
    caesarCardLeft.addEventListener('click', () => {
      if (answerToCopy) {
        copyToClipboard(answerToCopy, true, true);
        flashStamp(caesarCardLeft);
      }
    });
  }
  if (caesarCardRight) {
    caesarCardRight.addEventListener('click', () => {
      if (answerDescToCopy) {
        copyToClipboard(answerDescToCopy, true, true);
        flashStamp(caesarCardRight);
      }
    });
  }
  if (caesarCopyLeftBtn) {
    caesarCopyLeftBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (answerToCopy) {
        copyToClipboard(answerToCopy, true, true);
        flashStamp(caesarCardLeft);
      }
    });
  }
  if (caesarCopyRightBtn) {
    caesarCopyRightBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (answerDescToCopy) {
        copyToClipboard(answerDescToCopy, true, true);
        flashStamp(caesarCardRight);
      }
    });
  }

  // --- Enhanced Color Text Listeners ---
  document.querySelectorAll('.color-swatch-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const col = chip.dataset.color;
      applyColorFilter(col, true);
      document.querySelectorAll('.color-swatch-chip').forEach(c => c.classList.toggle('active', c.dataset.color === col));
      updateColorTextBadges();
    });
  });
  if (colortextCopyActiveBtn) {
    colortextCopyActiveBtn.addEventListener('click', () => {
      const curColor = String(CipherState.colorFilter || 'purple').toLowerCase();
      const txt = curColor === 'all'
        ? (CipherState.colorWordItems || []).filter(it => !it.skipped).map(it => it.word).join(' ')
        : (colorAnswers[curColor] || '');
      if (txt) copyToClipboard(txt, true, true);
    });
  }
  if (colortextCopyAllBtn) {
    colortextCopyAllBtn.addEventListener('click', () => {
      const allTxt = (CipherState.colorWordItems || []).filter(it => !it.skipped).map(it => it.word).join(' ');
      if (allTxt) copyToClipboard(allTxt, true, true);
    });
  }

  // --- Enhanced Sorter Ribbon Listeners ---
  if (sortAscBtn) {
    sortAscBtn.addEventListener('click', () => {
      sortAscBtn.classList.add('active');
      if (sortDescBtn) sortDescBtn.classList.remove('active');
      if (answerToCopy) copyToClipboard(answerToCopy, true, true);
    });
  }
  if (sortDescBtn) {
    sortDescBtn.addEventListener('click', () => {
      sortDescBtn.classList.add('active');
      if (sortAscBtn) sortAscBtn.classList.remove('active');
      if (answerDescToCopy) copyToClipboard(answerDescToCopy, true, true);
    });
  }

  // --- Enhanced Words Filter Listeners ---
  document.querySelectorAll('.words-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.words-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filt = pill.dataset.wfilter;
      wordsStamps.forEach(ws => {
        if (filt === 'all') ws.stamp.hidden = false;
        else if (filt === 'normal') ws.stamp.hidden = !ws.key.startsWith('normal');
        else if (filt === 'even') ws.stamp.hidden = !ws.key.startsWith('even');
        else if (filt === 'odd') ws.stamp.hidden = !ws.key.startsWith('odd');
      });
    });
  });

  // --- Enhanced Settings Tab Navigation & Module Layout Switching ---
  if (settingsNav) {
    settingsNav.addEventListener('click', e => {
      const btn = e.target.closest('.settings-tab-btn');
      if (!btn) return;
      settingsNav.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      document.querySelectorAll('.settings-pane').forEach(p => {
        p.classList.toggle('active', p.id === targetId);
      });
    });
  }

  document.querySelectorAll('.mode-switch-group').forEach(grp => {
    grp.addEventListener('click', e => {
      const btn = e.target.closest('.mode-switch-btn');
      if (!btn) return;
      const mod = grp.dataset.mod;
      const val = btn.dataset.modeVal;
      CipherState.uiModes[mod] = val;
      saveUiModes(CipherState.uiModes);
      syncUiModesToSettings();
      updateModeUI();
    });
  });

  const presetAllEnhanced = el('presetAllEnhanced');
  if (presetAllEnhanced) {
    presetAllEnhanced.addEventListener('click', () => {
      for (const k in CipherState.uiModes) CipherState.uiModes[k] = 'enhanced';
      saveUiModes(CipherState.uiModes);
      syncUiModesToSettings();
      updateModeUI();
    });
  }

  const presetAllClassic = el('presetAllClassic');
  if (presetAllClassic) {
    presetAllClassic.addEventListener('click', () => {
      for (const k in CipherState.uiModes) CipherState.uiModes[k] = 'classic';
      saveUiModes(CipherState.uiModes);
      syncUiModesToSettings();
      updateModeUI();
    });
  }

  // Theme presets in Settings
  document.querySelectorAll('.theme-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.color;
      applyBgColor(col, { keepSkin: true });
      applySkin(btn.dataset.skin || '');
      const uSlider = el('uiColorSlider'), uHexInput = el('uiColorHexInput');
      if (uSlider) uSlider.value = col;
      if (uHexInput) uHexInput.value = col;
    });
  });

  // Settings Contrast and Polarity sync
  const settingsThresholdSelect = el('settingsThresholdSelect');
  if (settingsThresholdSelect && thresholdSelect) {
    settingsThresholdSelect.value = thresholdSelect.value;
    settingsThresholdSelect.addEventListener('change', () => {
      thresholdSelect.value = settingsThresholdSelect.value;
      thresholdSelect.dispatchEvent(new Event('change'));
    });
    thresholdSelect.addEventListener('change', () => {
      settingsThresholdSelect.value = thresholdSelect.value;
    });
  }

  const settingsPolaritySelect = el('settingsPolaritySelect');
  if (settingsPolaritySelect && polaritySelect) {
    settingsPolaritySelect.value = polaritySelect.value;
    settingsPolaritySelect.addEventListener('change', () => {
      polaritySelect.value = settingsPolaritySelect.value;
      polaritySelect.dispatchEvent(new Event('change'));
    });
    polaritySelect.addEventListener('change', () => {
      settingsPolaritySelect.value = polaritySelect.value;
    });
  }

  // Backup & Export / Import / Reset
  const settingsExportBtn = el('settingsExportBtn');
  if (settingsExportBtn) {
    settingsExportBtn.addEventListener('click', () => {
      const exportData = {
        uiModes: CipherState.uiModes,
        autoCopy: copyOnDecode,
        letterCase: letterCaseSelect ? letterCaseSelect.value : 'preserve',
        showBoxes: showBoxesCheck ? showBoxesCheck.checked : true,
        bgColor: bgColorHex ? bgColorHex.value : '#EDE6D6',
        skin: document.documentElement.getAttribute('data-skin') || '',
        bgImage: bgImageUrl ? bgImageUrl.value : ''
      };
      const jsonStr = JSON.stringify(exportData, null, 2);
      navigator.clipboard.writeText(jsonStr).then(() => {
        const status = el('settingsBackupStatus');
        if (status) { status.textContent = 'Settings JSON copied to clipboard!'; setTimeout(() => status.textContent = '', 3000); }
      }).catch(() => {
        prompt('Copy your settings JSON:', jsonStr);
      });
    });
  }

  const settingsImportBtn = el('settingsImportBtn');
  if (settingsImportBtn) {
    settingsImportBtn.addEventListener('click', () => {
      const input = prompt('Paste your settings JSON here:');
      if (!input) return;
      try {
        const d = JSON.parse(input);
        if (d.uiModes) { CipherState.uiModes = Object.assign({}, DEFAULT_UI_MODES, d.uiModes); saveUiModes(CipherState.uiModes); syncUiModesToSettings(); }
        if (d.autoCopy !== undefined) { copyOnDecode = !!d.autoCopy; if (copyToggle) copyToggle.classList.toggle('on', copyOnDecode); }
        if (d.letterCase && letterCaseSelect) { letterCaseSelect.value = d.letterCase; }
        if (d.showBoxes !== undefined && showBoxesCheck) { showBoxesCheck.checked = !!d.showBoxes; }
        if (d.bgColor) { applyBgColor(d.bgColor, { keepSkin: true }); }
        applySkin(isSkin(d.skin) ? d.skin : '');
        if (d.bgImage !== undefined) { applyBgImage(d.bgImage); }
        updateModeUI();
        const status = el('settingsBackupStatus');
        if (status) { status.textContent = 'Settings restored successfully!'; setTimeout(() => status.textContent = '', 3000); }
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    });
  }

  const settingsResetAllBtn = el('settingsResetAllBtn');
  if (settingsResetAllBtn) {
    settingsResetAllBtn.addEventListener('click', () => {
      if (!confirm('Reset all settings and interface preferences to default?')) return;
      localStorage.removeItem(UI_MODES_KEY);
      CipherState.uiModes = Object.assign({}, DEFAULT_UI_MODES);
      syncUiModesToSettings();
      applyBgColor(DEFAULT_BG_COLOR);
      applyBgImage('');
      updateModeUI();
      const status = el('settingsBackupStatus');
      if (status) { status.textContent = 'All settings have been reset to default.'; setTimeout(() => status.textContent = '', 3000); }
    });
  }

  // Keyboard shortcut enhancements for Caesar and Sorter
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const isCaesarActive = mode === 'caesar' || (mode === 'all' && state.result?.type === 'caesar');
    if (isCaesarActive) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (caesarStepDown && !caesarStepDown.disabled) caesarStepDown.click();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (caesarStepUp && !caesarStepUp.disabled) caesarStepUp.click();
      } else if (['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        if (caesarShiftInput) caesarShiftInput.value = e.key;
        applyCaesarShift(true);
      }
    }

    const isSortActive = mode === 'sort' || (mode === 'all' && state.result?.type === 'sort');
    if (isSortActive && (e.key === 's' || e.key === 'S')) {
      if (sortAscBtn && sortDescBtn) {
        if (sortAscBtn.classList.contains('active')) sortDescBtn.click();
        else sortAscBtn.click();
      }
    }

    const isWordsActive = mode === 'words' || (mode === 'all' && state.result?.type === 'words');
    if (isWordsActive && e.key >= '1' && e.key <= '6') {
      const idx = Number(e.key) - 1;
      if (wordsStamps[idx] && wordsAnswers[wordsStamps[idx].key]) {
        copyToClipboard(wordsAnswers[wordsStamps[idx].key], true, true);
        flashStamp(wordsStamps[idx].stamp);
      }
    }
  });

  // Initial sync of UI modes on startup
  syncUiModesToSettings();

})();

}
