/**
 * 访客 IP 记录 & Windows 防火墙封禁中间件
 *
 * 使用方式（需要管理员权限才能封禁 IP）:
 *   运行: node server.js
 *   管理员运行: npx cross-elevate node server.js  或右键"以管理员身份运行"
 *
 * 管理页: http://localhost:8080/admin
 * API:
 *   GET  /api/logs?lines=50     — 最近 N 条访问日志
 *   GET  /api/blocked           — 列出已封禁的 IP
 *   POST /api/block/:ip         — 封禁某 IP
 *   POST /api/unblock/:ip       — 解封某 IP
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const { execSync } = require('child_process');
const URL = require('url').URL;

const PORT = 8080;
const ROOT = __dirname;
const LOG_DIR  = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'access.log');
const MIME = {
  '.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8',
  '.js':'application/javascript;charset=utf-8','.json':'application/json;charset=utf-8',
  '.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml',
};

// ---- 确保 logs 目录存在 ----
try { fs.mkdirSync(LOG_DIR, {recursive:true}) } catch {}

// ---- 权限检测 ----
let isAdmin = false;
try {
  execSync('net session', {stdio:'ignore',timeout:3000});
  isAdmin = true;
} catch {}
console.log(`[server] 管理员权限: ${isAdmin ? '是 ✓ (可封禁 IP)' : '否 ✗ (仅记录, 封禁需以管理员身份运行)'}`);

// ============================================================
//  日志
// ============================================================
function appendLog(line) {
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf8') } catch {}
}

function readLogs(n) {
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);
    return lines.slice(-n).reverse();
  } catch { return [] }
}

// ============================================================
//  Windows 防火墙操作
// ============================================================
const RULE_PREFIX = 'block_exam_';

function blockedIPs() {
  try {
    const out = execSync(
      `netsh advfirewall firewall show rule name="${RULE_PREFIX}*" dir=in`,
      {encoding:'utf8',timeout:5000}
    );
    const ips = [];
    const lines = out.split('\n');
    for (const l of lines) {
      const m = l.match(/^规则名称:\s+block_exam_(.+)/);
      if (m) ips.push(m[1]);
    }
    return ips;
  } catch { return [] }
}

function blockIP(ip) {
  const name = RULE_PREFIX + ip;
  execSync(
    `netsh advfirewall firewall add rule name="${name}" dir=in action=block remoteip="${ip}" protocol=any`,
    {encoding:'utf8',timeout:5000}
  );
  appendLog(`[BLOCK] ${ip}`);
}

function unblockIP(ip) {
  execSync(
    `netsh advfirewall firewall delete rule name="${RULE_PREFIX}${ip}"`,
    {encoding:'utf8',timeout:5000}
  );
  appendLog(`[UNBLOCK] ${ip}`);
}

// ============================================================
//  静态文件服务
// ============================================================
function serveFile(res, reqPath) {
  let filePath = path.join(ROOT, reqPath);
  // 默认 index.html (SPA fallback)
  if (reqPath === '/' || reqPath === '') filePath = path.join(ROOT, 'index.html');
  // 如果文件不存在也返回 index.html（SPA 路由）
  if (!fs.existsSync(filePath)) filePath = path.join(ROOT, 'index.html');

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'no-cache'});
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not Found');
  }
}

// ============================================================
//  管理页面 HTML
// ============================================================
function adminPage() {
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IP 管理 · 考试系统</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#111;color:#eee;padding:24px;max-width:960px;margin:auto}
h1{font-size:1.4rem;margin-bottom:16px;display:flex;align-items:center;gap:8px}
h1 small{font-size:.75rem;color:#888;font-weight:400}
.card{background:#1a1a2e;border-radius:8px;padding:16px;margin-bottom:16px}
.card h2{font-size:1rem;margin-bottom:12px;color:#aaf}
table{width:100%;border-collapse:collapse;font-size:.8rem}
td,th{padding:6px 8px;text-align:left;border-bottom:1px solid #333;word-break:break-all}
th{color:#888;font-weight:600;position:sticky;top:0;background:#1a1a2e}
tr:hover td{background:rgba(255,255,255,.03)}
.badge{display:inline-block;padding:1px 8px;border-radius:4px;font-size:.7rem;font-weight:600}
.badge-ok{background:#1b5e20;color:#a5d6a7}
.badge-no{background:#b71c1c;color:#ef9a9a}
.btn{padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:.75rem;font-weight:600}
.btn-block{background:#c62828;color:#fff}
.btn-unblock{background:#2e7d32;color:#fff}
.btn-sm{padding:2px 8px;font-size:.7rem}
.toolbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.toolbar input{padding:6px 10px;border-radius:4px;border:1px solid #333;background:#222;color:#eee;font-size:.8rem;flex:1;min-width:150px}
.toolbar input:focus{outline:none;border-color:#666}
.msg{padding:8px 12px;border-radius:4px;margin-bottom:12px;display:none}
.msg.ok{background:#1b5e20;color:#a5d6a7}
.msg.err{background:#b71c1c;color:#ef9a9a}
.msg.show{display:block}
code{background:#222;padding:1px 5px;border-radius:3px;font-size:.75rem}
.refresh{color:#888;font-size:.75rem;cursor:pointer;margin-left:auto}
.refresh:hover{color:#fff}
</style></head><body>
<h1>🛡️ IP 访问管理 <small>考试系统 · 管理员面板</small></h1>

<div id="msg" class="msg"></div>

<div class="card">
  <h2>🔒 封禁操作</h2>
  <div class="toolbar">
    <input id="blockInput" placeholder="输入 IP 地址..." onkeydown="if(event.key==='Enter')block()">
    <button class="btn btn-block" onclick="block()">封禁 IP</button>
    <button class="btn btn-unblock" onclick="unblock()">解封 IP</button>
  </div>
  <div style="font-size:.75rem;color:#888">
    管理员状态: <span class="badge ${isAdmin?'badge-ok':'badge-no'}" id="adminBadge">${isAdmin?'是':'否'}</span>
    ${isAdmin?'':'<span style="color:#ef9a9a"> 需以管理员身份运行才能封禁</span>'}
  </div>
</div>

<div class="card">
  <h2>📋 已封禁 IP <span class="refresh" onclick="loadBlocked()">↻ 刷新</span></h2>
  <div id="blockedList">加载中...</div>
</div>

<div class="card">
  <h2>📄 最近访问 <span class="refresh" onclick="loadLogs()">↻ 刷新</span></h2>
  <div style="max-height:400px;overflow-y:auto" id="logContainer">
    <table><thead><tr><th>时间</th><th>IP</th><th>路径</th><th>UA</th></tr></thead>
    <tbody id="logBody"></tbody></table>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
function msg(text,ok){const m=$('msg');m.textContent=text;m.className='msg show '+(ok?'ok':'err');setTimeout(()=>m.className='msg',3000)}

async function api(method,url){
  try{
    const r=await fetch(url,{method});
    if(!r.ok){const t=await r.text();msg(t,false)}
    return await r.json()
  }catch(e){msg(e.message,false)}
}

async function loadLogs(){
  const data=await api('GET','/api/logs?lines=100');
  if(!data)return;
  $('logBody').innerHTML=data.logs.map(l=>{
    const p=l.split('|');
    return '<tr><td>'+p[0]+'</td><td><code>'+p[1]+'</code></td><td>'+p[2]+'</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+p[3]+'">'+p[3]+'</td></tr>'
  }).join('');
}

async function loadBlocked(){
  const data=await api('GET','/api/blocked');
  if(!data)return;
  if(!data.ips.length){$('blockedList').innerHTML='<div style="color:#888;font-size:.85rem">暂无封禁的 IP</div>';return}
  $('blockedList').innerHTML='<table><thead><tr><th>IP</th><th>操作</th></tr></thead><tbody>'+
    data.ips.map(ip=>'<tr><td><code>'+ip+'</code></td><td><button class="btn btn-unblock btn-sm" onclick="unblockIP(\\''+ip+'\\')">解封</button></td></tr>').join('')+
    '</tbody></table>';
}

async function block(){
  const ip=$('blockInput').value.trim();
  if(!ip)return;
  const r=await api('POST','/api/block/'+ip);
  if(r)msg(r.message||'封禁成功',true);
  loadBlocked();$('blockInput').value='';
}

async function unblock(){
  const ip=$('blockInput').value.trim();
  if(!ip)return;
  const r=await api('POST','/api/unblock/'+ip);
  if(r)msg(r.message||'解封成功',true);
  loadBlocked();$('blockInput').value='';
}

async function unblockIP(ip){
  const r=await api('POST','/api/unblock/'+ip);
  if(r)msg(r.message||'解封成功',true);
  loadBlocked();
}

loadLogs();loadBlocked();
setInterval(loadLogs,5000);
</script></body></html>`;
}

// ============================================================
//  路由
// ============================================================
function route(req, res) {
  const start = Date.now();
  const ip   = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const ua   = (req.headers['user-agent']||'').slice(0,120);
  const p    = new URL(req.url, `http://${req.headers.host||'localhost'}`);
  const pathname = p.pathname;

  // ---- API: 日志 ----
  if (pathname === '/api/logs' && req.method === 'GET') {
    const n = Math.min(parseInt(p.searchParams.get('lines')) || 50, 500);
    const logs = readLogs(n);
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({logs}));
    return appendLog(`${new Date().toISOString().slice(0,19)}|${ip}|${pathname}|${ua}`);
  }

  // ---- API: 已封禁列表 ----
  if (pathname === '/api/blocked' && req.method === 'GET') {
    const ips = isAdmin ? blockedIPs() : [];
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ips, admin: isAdmin}));
    return;
  }

  // ---- API: 封禁 ----
  const blockMatch = pathname.match(/^\/api\/block\/(.+)/);
  if (blockMatch && req.method === 'POST') {
    if (!isAdmin) {
      res.writeHead(403, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'需要管理员权限',admin:false}));
      return;
    }
    try {
      const targetIP = decodeURIComponent(blockMatch[1]);
      if (targetIP === ip) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:'不能封禁自己'})); return;
      }
      blockIP(targetIP);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({message:`已封禁 ${targetIP}`}));
    } catch (e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:e.message}));
    }
    return;
  }

  // ---- API: 解封 ----
  const unblockMatch = pathname.match(/^\/api\/unblock\/(.+)/);
  if (unblockMatch && req.method === 'POST') {
    if (!isAdmin) {
      res.writeHead(403, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'需要管理员权限',admin:false}));
      return;
    }
    try {
      unblockIP(decodeURIComponent(unblockMatch[1]));
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({message:`已解封 ${decodeURIComponent(unblockMatch[1])}`}));
    } catch (e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:e.message}));
    }
    return;
  }

  // ---- 管理页 ----
  if (pathname === '/admin') {
    const html = adminPage().replace('${isAdmin}', JSON.stringify(isAdmin));
    res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
    res.end(html);
    return appendLog(`${new Date().toISOString().slice(0,19)}|${ip}|/admin|${ua}`);
  }

  // ---- 静态文件 ----
  serveFile(res, pathname);
  const elapsed = Date.now() - start;
  appendLog(`${new Date().toISOString().slice(0,19)}|${ip}|${pathname}|${ua}`);
}

// ============================================================
//  启动
// ============================================================
const server = http.createServer(route);
server.listen(PORT, () => {
  console.log(`[server] 考试系统已启动`);
  console.log(`[server] 本地:   http://localhost:${PORT}`);
  console.log(`[server] 管理页: http://localhost:${PORT}/admin`);
  console.log(`[server] 日志:   ${LOG_FILE}`);
});
