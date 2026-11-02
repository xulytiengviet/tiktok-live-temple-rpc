/* Google admin login + TikTok LIVE shortcut. Never ask for Gmail/TikTok passwords. */
(() => {
  const ui = document.createElement('section');
  ui.id = 'browserLoginPanel';
  ui.style.cssText = 'position:fixed;right:15px;bottom:15px;z-index:9999;max-width:370px;width:calc(100% - 30px);background:#180b0d;color:#fff2ca;border:1px solid #d5a341;border-radius:14px;padding:16px;font:14px system-ui;box-shadow:0 6px 24px #0008';
  const q = new URLSearchParams(location.search);
  if (q.get('obs') === '1' || q.get('view') === 'stage') return;
  ui.innerHTML = '<strong style="font-size:17px">🔐 Google × TikTok LIVE</strong><div id="authStatus" role="status" style="margin:10px 0">Đang kiểm tra đăng nhập...</div><div id="googleSignin" style="margin:10px 0"></div><div id="linkedLive" hidden><label for="authTikTok">Tài khoản TikTok đang LIVE</label><input id="authTikTok" placeholder="@username" autocomplete="off" style="width:100%;padding:10px;margin:8px 0;background:#28191c;color:white;border:1px solid #b98b42;border-radius:8px"><div style="display:flex;gap:6px;flex-wrap:wrap"><button id="authLiveStart" style="flex:1;background:#e8b953;color:#221300;padding:10px;border:0;border-radius:8px;cursor:pointer;font-weight:bold">▶ Mở LIVE & đồng bộ</button><button id="authLogout" style="padding:10px;border-radius:8px">Đăng xuất</button></div><small style="display:block;margin-top:8px">Google xác minh quản trị; TikTok LIVE đồng bộ theo @username, không tự tạo phiên đăng nhập TikTok hoặc bắt đầu phát sóng.</small></div>';
  document.body.appendChild(ui);
  const $ = id => document.getElementById(id);
  const status = text => { $('authStatus').textContent = text; };
  async function api(url, options = {}) {
    const res = await fetch(url, { credentials:'same-origin', ...options });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }
  const post = (url, data) => api(url, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data) });
  let initialized = false;
  async function refresh() {
    try {
      const s = await api('/api/auth/session');
      $('linkedLive').hidden = !s.user && !s.localDevMode;
      $('googleSignin').hidden = !!s.user || !!s.localDevMode;
      if (s.user) {
        status('✅ ' + (s.user.name || s.user.email) + ' · ' + s.user.email);
        $('authTikTok').value = s.tiktokUsername || '';
      } else if (s.localDevMode) status('⚠️ Chế độ phát triển localhost; không dùng công khai');
      else if (!s.configured) status('Cần cấu hình GOOGLE_CLIENT_ID và ADMIN_EMAILS trong máy chủ');
      else {
        status('Đăng nhập tài khoản Google quản trị');
        if (!initialized && s.googleClientId) {
          initialized = true;
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.onload = () => {
            if (!window.google?.accounts?.id) { status('Không tải được Google Identity Services'); return; }
            google.accounts.id.initialize({ client_id:s.googleClientId, callback: async response => {
              try { await post('/api/auth/google',{credential:response.credential}); await refresh(); }
              catch (e) { status('❌ ' + e.message); }
            }});
            google.accounts.id.renderButton($('googleSignin'), { theme:'outline', size:'large', text:'signin_with', width:300 });
          };
          script.onerror = () => status('Không tải được dịch vụ đăng nhập Google');
          document.head.appendChild(script);
        }
      }
    } catch (e) { status('❌ ' + e.message); }
  }
  $('authLiveStart').onclick = async () => {
    const btn = $('authLiveStart');
    btn.disabled = true;
    const tab = window.open('about:blank','_blank');
    try {
      const username = $('authTikTok').value.trim();
      status('Đang kết nối TikTok LIVE...');
      const data = await post('/api/live/start',{username});
      if (tab) tab.location.href = data.liveUrl;
      status('✅ Đã đồng bộ sự kiện LIVE @' + data.username);
      const input = $('inputTikTokUser') || $('ttUser');
      if (input) input.value = '@' + data.username;
    } catch (e) {
      if (tab) tab.close();
      status('❌ ' + e.message + ' — cần tài khoản đang phát LIVE và máy chủ có thể truy cập TikTok');
    } finally { btn.disabled = false; }
  };
  $('authLogout').onclick = async () => {
    try { await post('/api/auth/logout',{}); $('linkedLive').hidden = true; initialized = false; $('googleSignin').replaceChildren(); await refresh(); }
    catch (e) { status('❌ ' + e.message); }
  };
  refresh();
})();
