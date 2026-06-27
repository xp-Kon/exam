/* ========================================
   数据持久化 (localStorage)
   按科目前缀隔离：mk_{subject}_{key}
   ======================================== */
const LS  = k => { try { return JSON.parse(localStorage.getItem('mk_'+k)) } catch { return null } };
const LSS = (k,v) => { try { localStorage.setItem('mk_'+k, JSON.stringify(v)) } catch {} };

const Store = {
  /* ---- 科目前缀 ---- */
  _p() { return currentSubject + '_'; },

  /* ---- 切换科目 ---- */
  switchSubject(key) {
    currentSubject = key;
    QUESTION_BANK = SUBJECTS[key].questions;
  },

  /* ---- 进度（正确/错误）---- */
  getProgress()        { return LS(this._p()+'progress') || {}; },
  markQuestion(id, r)  { const p = Store.getProgress(); p[id]=r; LSS(this._p()+'progress', p); },
  getQuestionResult(id){ return Store.getProgress()[id]; },

  /* ---- 错题计数 ---- */
  getErrorCounts()     { return LS(this._p()+'errors') || {}; },
  addError(id)         { const e = Store.getErrorCounts(); e[id]=(e[id]||0)+1; LSS(this._p()+'errors', e); Store.markQuestion(id,'wrong'); },
  addCorrect(id)       { Store.markQuestion(id,'correct'); },
  clearErrors(ids) {
    const e = Store.getErrorCounts();
    if (ids) ids.forEach(id=>delete e[id]); else Object.keys(e).forEach(k=>delete e[k]);
    LSS(this._p()+'errors', e);
  },

  /* ---- 收藏 ---- */
  getFavorites()       { return LS(this._p()+'favs') || {}; },
  toggleFavorite(id)   {
    const f = Store.getFavorites();
    if (f[id]) { delete f[id]; LSS(this._p()+'favs', f); return false; }
    else       { f[id]=true;  LSS(this._p()+'favs', f); return true;  }
  },
  isFavorite(id)       { return !!Store.getFavorites()[id]; },

  /* ---- 主题（全局，不分科）---- */
  getTheme()           { return LS('theme') || 'light'; },
  setTheme(t)          { LSS('theme', t); document.documentElement.dataset.theme = t; },

  /* ---- 顺序练习位置 ---- */
  getPracticePos()     { return LS(this._p()+'practicePos') || 1; },
  setPracticePos(p)    { LSS(this._p()+'practicePos', p); },

  /* ---- 统计 ---- */
  getStats() {
    const p = Store.getProgress(), e = Store.getErrorCounts(), f = Store.getFavorites();
    const total = Object.keys(p).length, correct = Object.values(p).filter(v=>v==='correct').length;
    // ponytail: wrong 字段保持原语义（progress 中标记为 wrong 的数量），与 errorCount（累计错误次数）区分
    return {
      totalDone: total, correct, wrong: total - correct,
      accuracy: total ? Math.round(correct/total*100) : 0,
      errorCount: Object.values(e).reduce((a,b)=>a+b,0),
      favCount: Object.keys(f).length,
      totalQuestions: QUESTION_BANK.length,
    };
  },

  /* ---- 重置当前科目 ---- */
  resetAll() {
    ['progress','errors','favs','practicePos'].forEach(k=>{
      try { localStorage.removeItem('mk_'+this._p()+k) } catch {}
    });
  },
};
