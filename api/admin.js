/** 管理 API + 管理页面 (Vercel Serverless) */
const BLOB_URL = process.env.BLOCKED_IPS_BLOB;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'exam2024';

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/admin/, '') || '/';
  const ip  = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || req.socket?.remoteAddress || 'unknown';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const ok   = token === ADMIN_TOKEN;

  // GET /api/admin — 管理页面
  if (path === '/' && req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    if (!ok) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Bearer realm="admin"'); }
    return res.end(adminHTML(ok ? token : null));
  }

  // GET /api/admin/blocked
  if (path === '/blocked' && req.method === 'GET') {
    if (!ok) return json(res, 401, { error: 'unauthorized' });
    const ips = await loadIPs();
    return json(res, 200, { ips });
  }

  // POST /api/admin/block/:ip
  const bm = path.match(/^\/block\/(.+)/);
  if (bm && req.method === 'POST') {
    if (!ok) return json(res, 401, { error: 'unauthorized' });
    const target = decodeURIComponent(bm[1]);
    if (target === ip) return json(res, 400, { error: '不能封禁自己' });
    const ips = new Set(await loadIPs());
    ips.add(target);
    await saveIPs([...ips]);
    return json(res, 200, { message: `已封禁 ${target}` });
  }

  // POST /api/admin/unblock/:ip
  const um = path.match(/^\/unblock\/(.+)/);
  if (um && req.method === 'POST') {
    if (!ok) return json(res, 401, { error: 'unauthorized' });
    const target = decodeURIComponent(um[1]);
    const ips = (await loadIPs()).filter(i => i !== target);
    await saveIPs(ips);
    return json(res, 200, { message: `已解封 ${target}` });
  }

  return json(res, 404, { error: 'not found' });
};

/** 从 Vercel Blob 读取封禁列表 */
async function loadIPs() {
  if (!BLOB_URL) return [];
  try {
    const r = await fetch(BLOB_URL, { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch { return [] }
}

/** 写入封禁列表到 Vercel Blob */
async function saveIPs(ips) {
  if (!BLOB_URL) return;
  try {
    await fetch(BLOB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ips),
    });
  } catch {}
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function adminHTML(token) { return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IP 管理 · Vercel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#111;color:#eee;padding:24px;max-width:960px;margin:auto}
h1{font-size:1.4rem;margin-bottom:16px}
.card{background:#1a1a2e;border-radius:8px;padding:16px;margin-bottom:16px}
.card h2{font-size:1rem;margin-bottom:12px;color:#aaf}
table{width:100%;border-collapse:collapse;font-size:.8rem}
td,th{padding:6px 8px;text-align:left;border-bottom:1px solid #333}
th{color:#888;font-weight:600}
tr:hover td{background:rgba(255,255,255,.03)}
.btn{padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:.75rem;font-weight:600}
.btn-block{background:#c62828;color:#fff}
.btn-unblock{background:#2e7d32;color:#fff}
.btn-sm{padding:2px 8px;font-size:.7rem}
.toolbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.toolbar input{padding:6px 10px;border-radius:4px;border:1px solid #333;background:#222;color:#eee;font-size:.8rem;flex:1;min-width:150px}
.msg{padding:8px 12px;border-radius:4px;margin-bottom:12px;display:none}
.msg.ok{background:#1b5e20;color:#a5d6a7}
.msg.err{background:#b71c1c;color:#ef9a9a}
.msg.show{display:block}
code{background:#222;padding:1px 5px;border-radius:3px;font-size:.75rem}
</style></head><body>
<h1>🛡️ IP 管理 · Vercel</h1>
<div id="msg" class="msg"></div>
<div class="card">
  <h2>🔒 封禁操作</h2>
  <div class="toolbar">
    <input id="blockInput" placeholder="输入 IP 地址..." onkeydown="if(event.key==='Enter')block()">
    <button class="btn btn-block" onclick="block()">封禁</button>
    <button class="btn btn-unblock" onclick="unblock()">解封</button>
  </div>
  <div style="font-size:.75rem;color:#888">管理密码: <code>${ADMIN_TOKEN}</code></div>
  <div id="statusMsg" style="font-size:.75rem;color:#aaa;margin-top:8px"></div>
</div>
<div class="card"><h2>📋 已封禁 IP</h2><div id="blockedList">加载中...</div></div>
<script>
const TOKEN = ${JSON.stringify(token)};
const $=id=>document.getElementById(id);
function msg(text,ok){const m=$('msg');m.textContent=text;m.className='msg show '+(ok?'ok':'err');setTimeout(()=>m.className='msg',3000)}
async function api(method,url){
  try{
    const r=await fetch(url,{method,headers:{'Authorization':'Bearer '+TOKEN}});
    const d=await r.json();
    if(!r.ok){msg(d.error||'请求失败',false);return null}
    return d;
  }catch(e){msg(e.message,false);return null}
}
async function loadBlocked(){
  const d=await api('GET','/api/admin/blocked');
  if(!d)return;
  $('blockedList').innerHTML=!d.ips.length?'<div style="color:#888;font-size:.85rem">暂无封禁 IP</div>':
    '<table><thead><tr><th>IP</th><th>操作</th></tr></thead><tbody>'+
    d.ips.map(ip=>'<tr><td><code>'+ip+'</code></td><td><button class="btn btn-unblock btn-sm" onclick="unblockIP(\\''+ip+'\\')">解封</button></td></tr>').join('')+
    '</tbody></table>';
}
async function block(){const ip=$('blockInput').value.trim();if(!ip)return;const r=await api('POST','/api/admin/block/'+encodeURIComponent(ip));if(r){msg(r.message,true);$('blockInput').value='';loadBlocked()}}
async function unblock(){const ip=$('blockInput').value.trim();if(!ip)return;const r=await api('POST','/api/admin/unblock/'+encodeURIComponent(ip));if(r){msg(r.message,true);$('blockInput').value='';loadBlocked()}}
async function unblockIP(ip){const r=await api('POST','/api/admin/unblock/'+encodeURIComponent(ip));if(r){msg(r.message,true);loadBlocked()}}
loadBlocked();
</script></body></html>`; }