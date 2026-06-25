/* ========================================
   数据持久化 (localStorage)
   ======================================== */
const LS = k => { try { return JSON.parse(localStorage.getItem('mk_'+k)) } catch { return null }};
const LSS = (k, v) => { try { localStorage.setItem('mk_'+k, JSON.stringify(v)) } catch {} };

const Store = {
  getProgress() { return LS('progress') || {}; },
  markQuestion(id, r) { const p = Store.getProgress(); p[id]=r; LSS('progress',p); },
  getQuestionResult(id) { return Store.getProgress()[id]; },

  getErrorCounts() { return LS('errors') || {}; },
  addError(id) { const e = Store.getErrorCounts(); e[id]=(e[id]||0)+1; LSS('errors',e); Store.markQuestion(id,'wrong'); },
  addCorrect(id) { Store.markQuestion(id,'correct'); },
  clearErrors(ids) {
    const e = Store.getErrorCounts();
    if (ids) ids.forEach(id=>delete e[id]); else Object.keys(e).forEach(k=>delete e[k]);
    LSS('errors',e);
  },

  getFavorites() { return LS('favs') || {}; },
  toggleFavorite(id) {
    const f = Store.getFavorites();
    if (f[id]) { delete f[id]; LSS('favs',f); return false; }
    else { f[id]=true; LSS('favs',f); return true; }
  },
  isFavorite(id) { return !!Store.getFavorites()[id]; },

  getTheme() { return LS('theme')||'light'; },
  setTheme(t) { LSS('theme',t); document.documentElement.dataset.theme=t; },

  getPracticePos() { return LS('practicePos')||1; },
  setPracticePos(p) { LSS('practicePos',p); },

  getStats() {
    const p = Store.getProgress(), e = Store.getErrorCounts(), f = Store.getFavorites();
    const total = Object.keys(p).length, correct = Object.values(p).filter(v=>v==='correct').length;
    return {
      totalDone: total, correct, wrong: total-correct,
      accuracy: total ? Math.round(correct/total*100) : 0,
      errorCount: Object.values(e).reduce((a,b)=>a+b,0),
      favCount: Object.keys(f).length,
      totalQuestions: QUESTION_BANK.length,
    };
  },

  resetAll() { ['progress','errors','favs','practicePos'].forEach(k=>{ try { localStorage.removeItem('mk_'+k) } catch {} }); },
};