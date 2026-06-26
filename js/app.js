/* ========================================
   主应用逻辑 (精简版)
   ======================================== */
const state = {
  browsePage: 1, practiceId: Store.getPracticePos(),
  randomIds: [], randomIdx: 0,
  examQuestions: [], examAnswers: {}, examTimer: null, examTimeLeft: 0, examEnded: false,
  currentFilter: '',
  shuffledQ: null,
};
const $ = id => document.getElementById(id), main = $('mainContent');
const LABELS = ['A','B','C','D'];
const FILL_RE = /_{2,}|（\s*）|\(\s*\)/g;  // 匹配填空占位符
const PER_PAGE = 15;
let currentRoute = 'dashboard';

// ========== UTILITY ==========
function shuffle(a) { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=Math.random()*i|0;[r[i],r[j]]=[r[j],r[i]]} return r; }
function qLabel(q) { return q.type==='fill'?'填空题':q.type==='single'?'单选题':'多选题'; }
function answerText(q) { return q.answer.join(''); }
function isCorrect(q,chosen) { const c=[...chosen].sort(),a=[...q.answer].sort(); return c.length===a.length&&c.every((v,i)=>v===a[i]); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function shuffleQuestion(q) {
  if(!q.options) return q;
  const entries=shuffle(Object.entries(q.options));
  const map={};entries.forEach(([_,v],i)=>{map[LABELS[i]]=v;});
  const ansMap={};entries.forEach(([origKey,_],i)=>{ansMap[origKey]=LABELS[i];});
  return {...q,options:map,answer:q.answer.map(k=>ansMap[k])};
}
function showModal(title,body,onConfirm) {
  $('modalTitle').textContent=title; $('modalBody').textContent=body;
  $('confirmModal').classList.remove('hidden');
  $('modalConfirm').onclick=()=>{ $('confirmModal').classList.add('hidden'); if(onConfirm)onConfirm(); };
  $('modalCancel').onclick=()=>$('confirmModal').classList.add('hidden');
}
function navigate(name) { location.hash=name; }

// ========== SUBJECT SWITCHING ==========
window.__switchSubject = (key) => {
  Store.switchSubject(key);
  state.practiceId = Store.getPracticePos();
  state.randomIds = [];
  state.currentFilter = '';
  // ponytail: 清除考试状态防科目混存
  if(state.examTimer){clearInterval(state.examTimer);state.examTimer=null;}
  state.examQuestions=[];state.examAnswers={};state.examEnded=false;
  handleRoute();
  // 更新侧栏题数和 select 状态
  const sel = $('subjectSelect');
  if(sel) sel.value = key;
  const qc = document.querySelector('.q-count');
  if(qc) qc.textContent = `共 ${QUESTION_BANK.length} 题`;
};

// ========== ROUTING ==========
function handleRoute() {
  const name=(location.hash.slice(1)||'dashboard').split('?')[0];
  currentRoute=name;
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.route===name));
  window.__optClick=null;window.__submitFill=null;window.__submitMulti=null;
  ({dashboard:renderDashboard,browse:renderBrowse,practice:renderPractice,random:renderRandom,exam:renderExam,errors:renderErrors,favorites:renderFavorites}[name]||renderDashboard)();
  const s=Store.getStats();
  $('progressDisplay').innerHTML=`<i class="fas fa-chart-line"></i> ${s.totalQuestions?Math.round(s.totalDone/s.totalQuestions*100):0}% (${s.totalDone}/${s.totalQuestions})`;
}

// ========== NAVIGATION (MERGED) ==========
function navQuestion(dir) {
  if (currentRoute==='practice') {
    state.practiceId=Math.max(1,Math.min(QUESTION_BANK.length,state.practiceId+dir));
    Store.setPracticePos(state.practiceId);
    renderPractice();
  } else if (currentRoute==='random') {
    state.randomIdx=Math.max(0,state.randomIdx+dir);
    showRandomQuestion();
  }
}

// ========== RENDER QUESTION ==========
function renderQuestion(q,opts={}) {
  const {showAnswer=false,chosen='',interactive=false,index='',noSubmit=false}=opts;
  const fav=Store.isFavorite(q.id);
  const result=Store.getQuestionResult(q.id);
  let cardClass='q-card fade-in';
  if (showAnswer) cardClass+=chosen&&isCorrect(q,chosen)?' correct':chosen?' wrong':'';
  else if (result==='correct') cardClass+=' correct';
  else if (result==='wrong') cardClass+=' wrong';

  // ---------- 填空题渲染 ----------
  let optionsHTML='';
  let submitBtnHTML='';
  if(q.type==='fill'){
    const blanks=q.answer.map((_,i)=>`<input type="text" class="fill-input${showAnswer?' disabled':''}" data-blank="${i}" placeholder="第${i+1}空" autocomplete="off" spellcheck="false"/>`).join('');
    // 将 ______ / （ ） / ( ) 替换为输入框（先转义题干防 HTML 注入）
    const safeQ=esc(q.question);
    let bi=0;
    optionsHTML=safeQ.replace(FILL_RE,()=>{
      const inp=q.answer.map((_,i)=>`<input type="text" class="fill-input${showAnswer?' disabled':''}" data-blank="${i}" placeholder="第${i+1}空" autocomplete="off" spellcheck="false"/>`);
      if(q.answer.length===1) return inp[0];
      if(bi===0){bi++;return inp.join(' ');}
      return '';
    });
    if(!FILL_RE.test(q.question)){
      optionsHTML=safeQ+'<div style="margin-top:12px">'+q.answer.map((_,i)=>`<input type="text" class="fill-input${showAnswer?' disabled':''}" data-blank="${i}" placeholder="第${i+1}空" autocomplete="off" spellcheck="false"/>`).join(' ')+'</div>';
    }
    if(interactive&&!showAnswer&&!noSubmit){
      submitBtnHTML=`<div style="text-align:center;margin-top:14px"><button class="btn btn-primary btn-sm" onclick="window.__submitFill()"><i class="fas fa-check"></i> 提交答案</button></div>`;
    }
    // 显示答案时填入正确值
    if(showAnswer){
      setTimeout(()=>{
        // ponytail: 按 data-id 限定范围，防多题场景互相覆盖
        document.querySelectorAll(`[data-id="${q.id}"] .fill-input`).forEach((inp,i)=>{
          if(chosen&&chosen[i])inp.value=chosen[i];
          inp.classList.add(chosen&&isCorrect(q,chosen)?'correct':'wrong');
        });
      },0);
    }
  } else {
    // ---------- 选择题渲染 ----------
    optionsHTML=q.options?LABELS.map(l=>{
      if(!q.options[l])return '';
      const isChosen=chosen.includes(l);
      let cls='q-option';
      if(interactive&&!showAnswer)cls+=' selectable';
      if(isChosen)cls+=' selected';
      if(showAnswer){cls+=' disabled';if(q.answer.includes(l))cls+=' reveal-correct';else if(isChosen)cls+=' reveal-wrong';}
      const onclick=interactive&&!showAnswer?` onclick="window.__optClick(this,'${l}',false)"`:'';
      return `<div class="${cls}"${onclick}><span class="q-option-label">${l}</span><span class="q-option-text">${esc(q.options[l])}</span></div>`;
    }).join(''):'<div class="text-muted">无选项</div>';

    submitBtnHTML=(interactive&&!showAnswer&&q.type==='multiple'&&!noSubmit)?`<div style="text-align:center;margin-top:12px"><button class="btn btn-primary btn-sm" onclick="window.__submitMulti()"><i class="fas fa-check"></i> 提交答案</button></div>`:'';
  }

  const sourceTag=q.source?`<span class="q-source">${q.source}</span>`:'';
  // 填空题：questionText 已含输入框，q-options 留空
  const questionText=q.type==='fill'?optionsHTML:esc(q.question);
  const optionsDiv=q.type==='fill'?'':`<div class="q-options" data-multi="${q.type==='multiple'}">${optionsHTML}</div>`;
  const answerReveal=q.type==='fill'?'':(
    showAnswer?`<div class="q-answer-reveal ${chosen&&isCorrect(q,chosen)?'correct':'wrong'}">
      <i class="fas ${chosen&&isCorrect(q,chosen)?'fa-check-circle':'fa-times-circle'}"></i>
      正确答案：${esc(answerText(q))}${chosen?` | 你的选择：${esc(chosen)}`:''}</div>`:''
  );
  const fillReveal=q.type==='fill'&&showAnswer?`<div class="q-answer-reveal ${chosen?isCorrect(q,chosen)?'correct':'wrong':''}">
      <i class="fas ${chosen?(isCorrect(q,chosen)?'fa-check-circle':'fa-times-circle'):''}"></i>
      正确答案：${q.answer.map(a=>esc(a)).join('；')}</div>`:'';
  return `<div class="${cardClass}" data-id="${q.id}">
    <div class="q-header">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="q-number">${index||'#'+q.id}</span>
        <span class="q-type-badge ${q.type}">${qLabel(q)}</span>${sourceTag}
      </div>
      <div style="display:flex;gap:6px">
        <button class="icon-btn-sm fav-btn ${fav?'active':''}" data-fav="${q.id}" title="收藏">
          <i class="fa${fav?'s':'r'} fa-star"></i>
        </button>
      </div>
    </div>
    <div class="q-text">${questionText}</div>
    ${optionsDiv}
    ${answerReveal}${fillReveal}
    ${submitBtnHTML}
  </div>`;
}

// Dynamic style
(function(){const s=document.createElement('style');s.textContent=`
.icon-btn-sm{background:none;border:none;color:var(--text-secondary);width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--transition);font-size:.9rem}
.icon-btn-sm:hover{background:var(--bg-hover);color:var(--accent)}
.icon-btn-sm.active{color:var(--gold)}
.q-option.selectable{cursor:pointer}
.q-option.selectable:hover{background:var(--bg-option-hover)}
.empty-row{text-align:center;padding:40px;color:var(--text-secondary)}
.exam-progress{margin-bottom:16px}
.exam-progress .info{display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:6px;color:var(--text-secondary)}
`;document.head.appendChild(s)})();

// ========== CLICK DELEGATION ==========
main.addEventListener('click',e=>{
  const fav=e.target.closest('.fav-btn');
  if(fav){const id=parseInt(fav.dataset.fav);const ok=Store.toggleFavorite(id);
    fav.querySelector('i').className=ok?'fas fa-star':'far fa-star';fav.classList.toggle('active',ok);return;}
  const pb=e.target.closest('.page-btn');
  if(pb&&!pb.disabled){const p=parseInt(pb.dataset.page);if(!isNaN(p)){state.browsePage=p;renderBrowse();}}
});

// ========== KEYBOARD ==========
document.addEventListener('keydown',e=>{
  // 填空题输入框：回车提交
  if(e.target.tagName==='INPUT'&&e.target.classList.contains('fill-input')){
    if(e.key==='Enter'){e.preventDefault();if(window.__submitFill)window.__submitFill();}
    return;
  }
  if(e.target.tagName==='INPUT'&&e.target.id!=='browseSearch')return;
  if(!['practice','random','exam'].includes(currentRoute))return;
  const k=e.key.toUpperCase();
  if(['A','B','C','D'].includes(k)){
    const opts=main.querySelectorAll('.q-option.selectable');
    const t=[...opts].find(o=>o.dataset&&o.dataset.opt!==undefined?o.dataset.opt===k:o.textContent.trim().startsWith(k));
    if(t&&!t.classList.contains('selected')){t.click();return;}
  }
  if(e.key==='ArrowLeft'){e.preventDefault();navQuestion(-1);}
  if(e.key==='ArrowRight'){e.preventDefault();navQuestion(1);}
  if(k==='S'){const c=main.querySelector('.q-card:last-child .fav-btn');if(c)c.click();}
});

// ========== TOUCH SWIPE (MOBILE) ==========
(function(){
  let startX=0,startY=0,moved=false;
  main.addEventListener('touchstart',e=>{
    if(!['practice','random'].includes(currentRoute))return;
    const t=e.touches[0];startX=t.clientX;startY=t.clientY;moved=false;
  },{passive:true});
  main.addEventListener('touchmove',e=>{
    if(!['practice','random'].includes(currentRoute))return;
    const t=e.touches[0],dx=t.clientX-startX,dy=t.clientY-startY;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>10)moved=true;
  },{passive:true});
  main.addEventListener('touchend',e=>{
    if(!moved)return;
    const dx=e.changedTouches[0].clientX-startX;
    if(Math.abs(dx)<50)return;
    if(dx<0)navQuestion(1);  // 左滑下一题
    else navQuestion(-1);     // 右滑上一题
  });
})();

// ========== FILL-IN ANSWER SUBMIT ==========
function handleFillSubmit(areaId, feedbackId, q, nextLabel) {
  const area = $(areaId);
  if (!area) return;
  // ponytail: 防重复提交
  if(area.dataset.fillDone)return;
  area.dataset.fillDone='1';
  const inputs = document.querySelectorAll(`#${areaId} .fill-input`);
  const userAns = [...inputs].map(inp => inp.value.trim());
  // ponytail: 标准化对比（排序 + 小写），与 isCorrect 一致
  const norm = a => [...a.map(v=>v.toLowerCase())].sort();
  const ok = userAns.length === q.answer.length &&
             norm(userAns).every((v,i) => v === norm(q.answer)[i]);
  ok ? Store.addCorrect(q.id) : Store.addError(q.id);
  // 高亮输入框
  inputs.forEach((inp, i) => {
    inp.classList.add(ok ? 'correct' : 'wrong');
    if (!ok && q.answer[i]) inp.setAttribute('title', `正确：${q.answer[i]}`);
  });
  // 追加答案揭示
  const revealHTML = `<div class="q-answer-reveal ${ok?'correct':'wrong'}">
    <i class="fas ${ok?'fa-check-circle':'fa-times-circle'}"></i>
    正确答案：${q.answer.map(a=>esc(a)).join('；')}</div>`;
  area.querySelector('.q-card').insertAdjacentHTML('beforeend', revealHTML);
  const fb = $(feedbackId);
  if(fb) fb.innerHTML=`<div style="text-align:center;padding:12px;background:${ok?'var(--bg-correct)':'var(--bg-wrong)'};border-radius:var(--radius-sm)">
    <strong style="color:${ok?'var(--green)':'var(--accent)'}"><i class="fas ${ok?'fa-check-circle':'fa-times-circle'}"></i> ${ok?'回答正确！':'回答错误'}</strong>
    <span style="margin-left:12px"><button class="btn btn-primary btn-sm" onclick="navQuestion(1)">下一题 <i class="fas fa-chevron-right"></i></button></span>
  </div>`;
}

// ========== ANSWER REVEAL HELPERS (SHARED) ==========
function revealAnswer(areaId,feedbackId,q,chosen,nextLabel) {
  const area=$(areaId);if(!area)return;
  const ok=isCorrect(q,chosen);
  ok?Store.addCorrect(q.id):Store.addError(q.id);
  area.innerHTML=renderQuestion(q,{showAnswer:true,chosen,index:nextLabel});
  const fb=$(feedbackId);
  if(fb)fb.innerHTML=`<div style="text-align:center;padding:12px;background:${ok?'var(--bg-correct)':'var(--bg-wrong)'};border-radius:var(--radius-sm)">
    <strong style="color:${ok?'var(--green)':'var(--accent)'}"><i class="fas ${ok?'fa-check-circle':'fa-times-circle'}"></i> ${ok?'回答正确！':'回答错误'}</strong>
    <span style="margin-left:12px"><button class="btn btn-primary btn-sm" onclick="navQuestion(1)">下一题 <i class="fas fa-chevron-right"></i></button></span>
  </div>`;
}

// ========== PAGE: DASHBOARD ==========
function renderDashboard() {
  const s=Store.getStats();
  const errs=Store.getErrorCounts();
  const top=Object.entries(errs).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,c])=>({id:+id,count:c,q:QUESTION_BANK.find(x=>x.id===+id)})).filter(x=>x.q);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-chart-pie"></i>统计看板</h2></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-tasks" style="color:var(--blue)"></i></div>
        <div class="stat-value">${s.totalDone}</div><div class="stat-label">已练习 / ${s.totalQuestions} 题</div>
        <div class="progress-bar" style="margin-top:10px"><div class="progress-fill" style="width:${s.totalQuestions?Math.round(s.totalDone/s.totalQuestions*100):0}%"></div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-check-circle" style="color:var(--green)"></i></div>
        <div class="stat-value">${s.accuracy}%</div><div class="stat-label">正确率</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-exclamation-circle" style="color:var(--accent)"></i></div>
        <div class="stat-value">${s.wrong}</div><div class="stat-label">错题数 / 错误 ${s.errorCount} 次</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-star" style="color:var(--gold)"></i></div>
        <div class="stat-value">${s.favCount}</div><div class="stat-label">收藏题目</div></div>
    </div>
    <div class="card"><h3 style="margin-bottom:12px"><i class="fas fa-fire" style="color:var(--accent)"></i> 高频错题 TOP 5</h3>
      ${top.length?top.map((x,i)=>`
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light)">
          <span style="font-weight:700;color:var(--accent);min-width:24px">#${i+1}</span>
          <span class="q-number" style="background:var(--accent);padding:1px 8px;font-size:.75rem">${x.id}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem">${x.q.question.slice(0,60)}...</span>
          <span style="background:var(--bg-wrong);color:var(--accent);padding:2px 10px;border-radius:10px;font-weight:600;font-size:.8rem">错 ${x.count} 次</span>
        </div>`).join(''):'<div class="empty-row"><i class="fas fa-smile"></i><br>暂无错题，继续保持！</div>'}
    </div>
    <div class="card" style="margin-top:16px"><h3 style="margin-bottom:12px"><i class="fas fa-lightbulb" style="color:var(--gold)"></i> 练习建议</h3>
      <ul style="padding-left:20px;color:var(--text-secondary);line-height:2">
        <li>${s.wrong>0?`你有 ${s.wrong} 道错题，建议前往 <a href="#errors" style="color:var(--accent)">错题本</a> 集中攻克`:'暂无错题，继续保持！'}</li>
        <li>${s.favCount>0?`已收藏 ${s.favCount} 道题，可前往 <a href="#favorites" style="color:var(--accent)">收藏夹</a> 重点复习`:'练习时可用 <i class="fas fa-star" style="color:var(--gold)"></i> 收藏重要题目'}</li>
        <li>${s.totalDone<s.totalQuestions?`剩余 ${s.totalQuestions-s.totalDone} 题未练习`:'恭喜！全部题目已练习过一遍'}</li>
        <li>快捷键：<kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd> 选答案 · <kbd>←</kbd><kbd>→</kbd> 切换题目 · <kbd>S</kbd> 收藏</li>
      </ul>
    </div>
  </div>`;
}

// ========== PAGE: BROWSE ==========
function renderBrowse() {
  const q=state.currentFilter.toLowerCase();
  const filtered=q?QUESTION_BANK.filter(x=>x.question.toLowerCase().includes(q)||Object.values(x.options||{}).some(v=>v.toLowerCase().includes(q))):QUESTION_BANK;
  const pages=Math.ceil(filtered.length/PER_PAGE),page=Math.min(state.browsePage,pages||1),start=(page-1)*PER_PAGE;
  const items=filtered.slice(start,start+PER_PAGE);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-list"></i>题库浏览</h2>
      <div class="search-box"><i class="fas fa-search"></i><input type="text" id="browseSearch" placeholder="搜索题目关键词..." value="${state.currentFilter}"></div>
    </div>
    <div style="margin-bottom:12px;color:var(--text-secondary);font-size:.85rem">共 ${filtered.length} 题 · 第 ${page}/${pages} 页</div>
    ${items.length?items.map(x=>{
      const r=Store.getQuestionResult(x.id);
      return `<div class="q-card" data-id="${x.id}">
        <div class="q-header"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="q-number">#${x.id}</span><span class="q-type-badge ${x.type}">${qLabel(x)}</span>
          ${r==='correct'?'<i class="fas fa-check-circle" style="color:var(--green);margin-left:6px"></i>':r==='wrong'?'<i class="fas fa-times-circle" style="color:var(--accent);margin-left:6px"></i>':''}
        </div><button class="icon-btn-sm fav-btn ${Store.isFavorite(x.id)?'active':''}" data-fav="${x.id}"><i class="fa${Store.isFavorite(x.id)?'s':'r'} fa-star"></i></button></div>
        <div class="q-text">${esc(x.question)}</div>
        <div class="q-options" style="margin-bottom:12px">
          ${LABELS.map(l=>x.options&&x.options[l]?`<div class="q-option disabled"><span class="q-option-label">${l}</span><span class="q-option-text">${esc(x.options[l])}</span></div>`:'').join('')}
        </div>
        <details style="cursor:pointer"><summary style="color:var(--blue);font-weight:600;font-size:.9rem"><i class="fas fa-eye"></i> 查看答案</summary>
          <div style="margin-top:10px;padding:10px 14px;background:rgba(21,101,192,.06);border:1px solid rgba(21,101,192,.15);border-radius:var(--radius-sm);color:var(--blue);font-weight:600">
            <i class="fas fa-check-circle"></i> 正确答案：${esc(answerText(x))}</div></details>
      </div>`;}).join(''):'<div class="empty-state"><i class="fas fa-search"></i><h3>未找到匹配题目</h3><p>试试其他关键词</p></div>'}
    ${pages>1?`<div class="pagination">
      <button class="page-btn" data-page="${page-1}" ${page<=1?'disabled':''}><i class="fas fa-chevron-left"></i></button>
      ${Array.from({length:Math.min(pages,8)},(_,i)=>{
        let p;if(pages<=8)p=i+1;else if(page<=4)p=i+1;else if(page>=pages-3)p=pages-7+i;else p=page-3+i;
        return `<button class="page-btn ${p===page?'active':''}" data-page="${p}">${p}</button>`;
      }).join('')}
      <button class="page-btn" data-page="${page+1}" ${page>=pages?'disabled':''}><i class="fas fa-chevron-right"></i></button>
    </div>`:''}
  </div>`;
  const inp=$('browseSearch');
  if(inp){inp.oninput=()=>{state.currentFilter=inp.value;state.browsePage=1;renderBrowse();}}
}

// ========== PAGE: PRACTICE ==========
function renderPractice() {
  const raw=QUESTION_BANK[state.practiceId-1];
  if(!raw){state.practiceId=1;renderPractice();return;}
  const q=state.shuffledQ=shuffleQuestion(raw);
  const pct=Math.round(state.practiceId/QUESTION_BANK.length*100);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-play-circle"></i>顺序练习</h2>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="navQuestion(-1)" ${state.practiceId<=1?'disabled':''}><i class="fas fa-chevron-left"></i> 上一题</button>
        <button class="btn btn-primary btn-sm" onclick="navQuestion(1)" ${state.practiceId>=QUESTION_BANK.length?'disabled':''}>下一题 <i class="fas fa-chevron-right"></i></button>
      </div></div>
    <div class="progress-bar" style="margin-bottom:4px"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-secondary);margin-bottom:16px">
      <span>第 ${state.practiceId} / ${QUESTION_BANK.length} 题</span><span>${pct}%</span></div>
    <div id="practiceArea">${renderQuestion(q,{interactive:true,index:`第 ${state.practiceId} 题`})}</div>
    <div id="practiceFeedback" style="margin-top:12px"></div>
  </div>`;

  let selected='';
  window.__optClick=(el,opt)=>{
    const sq=state.shuffledQ;
    if(sq.type==='multiple'){el.classList.toggle('selected');selected=[...document.querySelectorAll('.q-option.selected')].map(e=>e.textContent.trim()[0]).join('');}
    else{selected=opt;revealAnswer('practiceArea','practiceFeedback',sq,opt,`第 ${sq.id} 题`);Store.setPracticePos(state.practiceId);}
  };
  window.__submitMulti=()=>{
    const sq=state.shuffledQ;
    const chosen=[...document.querySelectorAll('.q-option.selected')].map(e=>e.textContent.trim()[0]).join('');
    if(!chosen)return;
    revealAnswer('practiceArea','practiceFeedback',sq,chosen,`第 ${sq.id} 题`);Store.setPracticePos(state.practiceId);
  };
  window.__submitFill=()=>{
    const sq=state.shuffledQ;
    handleFillSubmit('practiceArea','practiceFeedback',sq,`第 ${sq.id} 题`);
    Store.setPracticePos(state.practiceId);
  };
}

// ========== PAGE: RANDOM ==========
function renderRandom() {
  if(!state.randomIds.length){state.randomIds=shuffle(QUESTION_BANK.map(q=>q.id));state.randomIdx=0;}
  showRandomQuestion();
}
function showRandomQuestion() {
  if(state.randomIdx>=state.randomIds.length){
    main.innerHTML=`<div class="fade-in" style="text-align:center;padding:60px 20px"><i class="fas fa-trophy" style="font-size:3rem;color:var(--gold)"></i>
      <h2 style="margin:16px 0">本轮完成！</h2><p style="color:var(--text-secondary)">共练习 ${state.randomIds.length} 题</p>
      <button class="btn btn-primary" style="margin-top:20px" onclick="state.randomIds=shuffle(QUESTION_BANK.map(q=>q.id));state.randomIdx=0;showRandomQuestion()"><i class="fas fa-redo"></i> 再来一轮</button></div>`;
    return;
  }
  const raw=QUESTION_BANK.find(x=>x.id===state.randomIds[state.randomIdx]);
  if(!raw){state.randomIdx++;showRandomQuestion();return;}
  const q=state.shuffledQ=shuffleQuestion(raw);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-random"></i>随机练习</h2>
      <div class="page-actions">
        <span style="color:var(--text-secondary);font-size:.85rem;padding:6px 0">${state.randomIdx+1} / ${state.randomIds.length}</span>
        <button class="btn btn-secondary btn-sm" onclick="navQuestion(-1)" ${state.randomIdx<=0?'disabled':''}><i class="fas fa-chevron-left"></i></button>
        <button class="btn btn-secondary btn-sm" onclick="navQuestion(1)"><i class="fas fa-chevron-right"></i></button>
      </div></div>
    <div id="randArea">${renderQuestion(q,{interactive:true,index:`随机 #${state.randomIdx+1}`})}</div>
    <div id="randFeedback" style="margin-top:12px"></div>
  </div>`;

  let selected='';
  const curIdx=state.randomIdx;
  window.__optClick=(el,opt)=>{
    const sq=state.shuffledQ;
    if(sq.type==='multiple'){el.classList.toggle('selected');selected=[...document.querySelectorAll('.q-option.selected')].map(e=>e.textContent.trim()[0]).join('');}
    else{selected=opt;revealAnswer('randArea','randFeedback',sq,opt,`随机 #${curIdx+1}`);}
  };
  window.__submitMulti=()=>{
    const sq=state.shuffledQ;
    const chosen=[...document.querySelectorAll('.q-option.selected')].map(e=>e.textContent.trim()[0]).join('');
    if(!chosen)return;
    revealAnswer('randArea','randFeedback',sq,chosen,`随机 #${curIdx+1}`);
  };
  window.__submitFill=()=>{
    const sq=state.shuffledQ;
    handleFillSubmit('randArea','randFeedback',sq,`随机 #${curIdx+1}`);
  };
}

// ========== PAGE: EXAM ==========
function renderExam() {
  main.innerHTML=`<div class="fade-in" style="max-width:500px;margin:40px auto">
    <div class="card" style="text-align:center;padding:40px">
      <i class="fas fa-clipboard-check" style="font-size:3rem;color:var(--accent);margin-bottom:16px"></i>
      <h2 style="margin-bottom:8px">模拟考试</h2>
      <p style="color:var(--text-secondary);margin-bottom:24px">从题库中随机抽题，限时作答</p>
      <div style="margin-bottom:20px"><label style="display:block;margin-bottom:8px;font-weight:600">题目数量</label>
        <div style="display:flex;gap:8px;justify-content:center">${[10,20,40].map(n=>`<button class="btn ${n===20?'btn-primary':'btn-secondary'}" onclick="this.parentElement.querySelectorAll('.btn').forEach(b=>b.className='btn btn-secondary');this.className='btn btn-primary';window.__examCount=${n}">${n} 题</button>`).join('')}</div></div>
      <div style="margin-bottom:20px"><label style="display:block;margin-bottom:8px;font-weight:600">时间限制</label>
        <div style="display:flex;gap:8px;justify-content:center">${[{v:0,l:'不限'},{v:300,l:'5分钟'},{v:600,l:'10分钟'},{v:900,l:'15分钟'}].map(t=>`<button class="btn ${t.v===600?'btn-primary':'btn-secondary'}" onclick="this.parentElement.querySelectorAll('.btn').forEach(b=>b.className='btn btn-secondary');this.className='btn btn-primary';window.__examTime=${t.v}">${t.l}</button>`).join('')}</div></div>
      <button class="btn btn-primary" style="margin-top:16px;padding:12px 40px" onclick="startExam(window.__examCount||20,window.__examTime||600)"><i class="fas fa-play"></i> 开始考试</button>
    </div></div>`;
}

function startExam(count,timeLimit) {
  state.examQuestions=shuffle(QUESTION_BANK).slice(0,count).map(q=>shuffleQuestion(q));
  state.examAnswers={};state.examEnded=false;state.examTimeLeft=timeLimit;
  showExamQuestion(0);
}
function showExamQuestion(idx) {
  if(idx>=state.examQuestions.length||state.examEnded){finishExam();return;}
  if(idx<0)idx=0;
  const q=state.examQuestions[idx];
  const total=state.examQuestions.length,answered=Object.keys(state.examAnswers).length,chosen=state.examAnswers[idx]||'';

  if(state.examTimer)clearInterval(state.examTimer);
  if(state.examTimeLeft>0)state.examTimer=setInterval(()=>{
    state.examTimeLeft--;
    const el=$('examTimer');
    if(el){const m=Math.floor(state.examTimeLeft/60),s=state.examTimeLeft%60;
      el.textContent=`${m}:${String(s).padStart(2,'0')}`;
      el.className='timer '+(state.examTimeLeft<=30?'danger':state.examTimeLeft<=120?'warning':'normal');}
    if(state.examTimeLeft<=0){clearInterval(state.examTimer);finishExam();}
  },1000);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-clipboard-check"></i>模拟考试</h2>
      <div style="display:flex;align-items:center;gap:12px">
        ${state.examTimeLeft>0?`<span id="examTimer" class="timer normal"><i class="far fa-clock"></i> <span>${Math.floor(state.examTimeLeft/60)}:${String(state.examTimeLeft%60).padStart(2,'0')}</span></span>`:''}
        <span style="font-size:.9rem;color:var(--text-secondary)">${answered}/${total} 已答</span></div></div>
    <div class="exam-progress"><div class="info"><span>第 ${idx+1} 题</span><span>${idx+1}/${total}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${(idx+1)/total*100}%"></div></div></div>
    <div id="examArea">${renderQuestion(q,{interactive:true,chosen,index:`第 ${idx+1} 题`,noSubmit:q.type!=='fill'})}</div>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <button class="btn btn-secondary btn-sm" onclick="clearInterval(state.examTimer);showExamQuestion(${idx-1})" ${idx<=0?'disabled':''}><i class="fas fa-chevron-left"></i> 上一题</button>
      <button class="btn btn-secondary btn-sm" onclick="clearInterval(state.examTimer);showExamQuestion(${idx+1})">跳过 <i class="fas fa-forward"></i></button>
      <button class="btn btn-primary btn-sm" onclick="clearInterval(state.examTimer);showExamQuestion(${idx+1})" ${idx>=total-1?'disabled':''}>${idx<total-1?'下一题 <i class="fas fa-chevron-right"></i>':''}</button></div>
    ${idx===total-1?`<div style="text-align:center;margin-top:16px"><button class="btn btn-success" onclick="clearInterval(state.examTimer);finishExam()"><i class="fas fa-check-double"></i> 交卷</button></div>`:''}
  </div>`;

  window.__optClick=(el,opt)=>{
    const sq=state.examQuestions[idx];
    if(sq.type==='multiple'){el.classList.toggle('selected');state.examAnswers[idx]=[...document.querySelectorAll('.q-option.selected')].map(e=>e.textContent.trim()[0]).join('');}
    else state.examAnswers[idx]=opt;
    const a=Object.keys(state.examAnswers).length,tt=state.examQuestions.length;
    const hs=main.querySelector('.page-header span:last-child');if(hs)hs.textContent=`${a}/${tt} 已答`;
  };
  window.__submitMulti=()=>{}; // 考试模式无需提交按钮（已有交卷按钮）
  window.__submitFill=()=>{
    const sq=state.examQuestions[idx];
    const inputs=document.querySelectorAll('#examArea .fill-input');
    state.examAnswers[idx]=[...inputs].map(inp=>inp.value.trim());
    // 更新已答计数
    const a=Object.keys(state.examAnswers).length,tt=state.examQuestions.length;
    const hs=main.querySelector('.page-header span:last-child');if(hs)hs.textContent=`${a}/${tt} 已答`;
    // 自动跳下一题
    clearInterval(state.examTimer);
    showExamQuestion(idx+1);
  };
}

function finishExam() {
  state.examEnded=true;if(state.examTimer){clearInterval(state.examTimer);state.examTimer=null;}
  const total=state.examQuestions.length;let correct=0;
  const results=state.examQuestions.map((q,i)=>{const ch=state.examAnswers[i]||'';const ok=ch&&isCorrect(q,ch);if(ok)correct++;if(ch){ok?Store.addCorrect(q.id):Store.addError(q.id);}return{q,chosen:ch,ok};});
  const score=total?Math.round(correct/total*100):0,unanswered=total-Object.keys(state.examAnswers).length;

  main.innerHTML=`<div class="fade-in">
    <div class="exam-result card"><h2>考试结果</h2>
      <div class="exam-score">${score}<span style="font-size:1.5rem">分</span></div>
      <div class="exam-subtitle">${score>=90?'🎉 优秀！':score>=70?'👍 良好！':score>=60?'✅ 及格':'📚 继续加油！'}</div>
      <div class="exam-details">
        <div class="exam-detail-item"><div class="label">正确</div><div class="value" style="color:var(--green)">${correct}</div></div>
        <div class="exam-detail-item"><div class="label">错误</div><div class="value" style="color:var(--accent)">${total-correct-unanswered}</div></div>
        <div class="exam-detail-item"><div class="label">未答</div><div class="value" style="color:var(--text-muted)">${unanswered}</div></div></div></div>
    <h3 style="margin-bottom:12px">逐题回顾</h3>
    ${results.map((r,i)=>renderQuestion(r.q,{showAnswer:true,chosen:r.chosen,index:`第 ${i+1} 题 ${r.ok?'✅':r.chosen?'❌':'⏭️'}`})).join('')}
    <div style="text-align:center;margin-top:20px">
      <button class="btn btn-primary" onclick="navigate('exam')"><i class="fas fa-redo"></i> 再来一次</button>
      <button class="btn btn-secondary" style="margin-left:8px" onclick="navigate('errors')"><i class="fas fa-exclamation-triangle"></i> 查看错题</button></div>
  </div>`;
}

// ========== PAGE: ERRORS ==========
function renderErrors() {
  const errs=Store.getErrorCounts();
  const ids=Object.keys(errs).map(Number).sort((a,b)=>errs[b]-errs[a]);
  const questions=ids.map(id=>QUESTION_BANK.find(q=>q.id===id)).filter(Boolean);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-exclamation-triangle"></i>错题本</h2>
      <div class="page-actions">${questions.length?`<button class="btn btn-danger btn-sm" id="clearErrorsBtn"><i class="fas fa-trash"></i> 清空错题</button>
        <button class="btn btn-primary btn-sm" onclick="state.randomIds=shuffle(${JSON.stringify(ids)});state.randomIdx=0;navigate('random')"><i class="fas fa-play"></i> 练习错题</button>`:''}</div></div>
    ${questions.length?questions.map(q=>renderQuestion(q,{showAnswer:true,index:`#${q.id} <span style="background:var(--bg-wrong);color:var(--accent);padding:0 8px;border-radius:8px;font-size:.75rem">错 ${errs[q.id]} 次</span>`})).join(''):'<div class="empty-state"><i class="fas fa-smile"></i><h3>暂无错题</h3><p>继续保持！</p></div>'}
  </div>`;
  const cb=$('clearErrorsBtn');if(cb)cb.onclick=()=>showModal('清空错题','确定要清空所有错题记录吗？',()=>{Store.clearErrors();renderErrors();});
}

// ========== PAGE: FAVORITES ==========
function renderFavorites() {
  const ids=Object.keys(Store.getFavorites()).map(Number).sort((a,b)=>a-b);
  const questions=ids.map(id=>QUESTION_BANK.find(q=>q.id===id)).filter(Boolean);

  main.innerHTML=`<div class="fade-in">
    <div class="page-header"><h2 class="page-title"><i class="fas fa-star"></i>我的收藏</h2>
      <div class="page-actions">${questions.length?`<button class="btn btn-primary btn-sm" onclick="state.randomIds=shuffle(${JSON.stringify(ids)});state.randomIdx=0;navigate('random')"><i class="fas fa-play"></i> 练习收藏</button>`:''}</div></div>
    ${questions.length?questions.map(q=>renderQuestion(q,{showAnswer:true,index:`#${q.id}`})).join(''):'<div class="empty-state"><i class="far fa-star"></i><h3>暂无收藏</h3><p>练习时点击 <i class="fas fa-star" style="color:var(--gold)"></i> 收藏重要题目</p></div>'}
  </div>`;
}

// ========== INIT ==========
window.addEventListener('hashchange',handleRoute);
document.addEventListener('DOMContentLoaded',()=>{
  Store.setTheme(Store.getTheme());
  const ti=document.querySelector('#themeToggle i');
  if(Store.getTheme()==='dark')ti.className='fas fa-sun';
  $('themeToggle').onclick=()=>{const n=Store.getTheme()==='dark'?'light':'dark';Store.setTheme(n);ti.className=n==='dark'?'fas fa-sun':'fas fa-moon';};
  $('sidebarToggle').onclick=()=>{document.getElementById('sidebar').classList.toggle('open');document.getElementById('overlay').classList.toggle('show');};
  $('overlay').onclick=()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');};
  $('resetBtn').onclick=()=>showModal('重置数据','确定要重置所有练习记录、错题和收藏吗？此操作不可撤销。',()=>{Store.resetAll();navigate('dashboard');});
  // 初始化科目选择器
  const sel=$('subjectSelect');
  if(sel){sel.value=currentSubject;}
  const qc=document.querySelector('.q-count');
  if(qc){qc.textContent=`共 ${QUESTION_BANK.length} 题`;}
  // Keyboard hint
  const h=document.createElement('div');h.className='kbd-hint';
  h.innerHTML='快捷键: <kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd> 选答案 · <kbd>←</kbd><kbd>→</kbd> 翻题 · <kbd>S</kbd> 收藏';
  document.body.appendChild(h);
  handleRoute();
});