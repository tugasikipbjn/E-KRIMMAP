// ==================== GOOGLE SHEETS CONFIG ====================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycby8dIleiZo_zj0ufeKY_Ulp9632Me5xFdeX2mPV6G2qdM_Tf3P9WvrtLck02D4otYYJ/exec';

// ==================== CONSTANTS ====================
const AREA_BOUNDS = {
  cepu:    { latMin: -7.18, latMax: -7.08, lngMin: 111.55, lngMax: 111.63 },
  padangan: { latMin: -7.14, latMax: -7.06, lngMin: 111.46, lngMax: 111.54 }
};

const CATS = ['pembunuhan', 'pencurian', 'narkoba', 'kekerasan', 'penipuan', 'lainnya'];

const CAT_LABELS = {
  pembunuhan: 'Pembunuhan',
  pencurian: 'Pencurian',
  narkoba: 'Narkoba',
  kekerasan: 'Kekerasan',
  penipuan: 'Penipuan',
  lainnya: 'Lainnya'
};

const CAT_COLORS = {
  pembunuhan: '#ef5350',
  pencurian: '#ffa726',
  narkoba: '#ab47bc',
  kekerasan: '#ffca28',
  penipuan: '#66bb6a',
  lainnya: '#90a4ae'
};

const CAT_ICONS = {
  pembunuhan: 'fa-skull',
  pencurian: 'fa-mask',
  narkoba: 'fa-pills',
  kekerasan: 'fa-hand-fist',
  penipuan: 'fa-comments-dollar',
  lainnya: 'fa-circle-question'
};

const THEMES = ['arctic', 'light'];

const TILE_CONFIG = {
  arctic: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    options: { subdomains: 'abcd', maxZoom: 19 }
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    options: { maxZoom: 19 }
  }
};

/* ═══════════════════ STATE ═══════════════════ */
let state = {
  pickMode: false,
  activeFilters: new Set(),
  map: null,
  markers: [],
  currentPanel: null,
  currentTheme: 'arctic',
  currentTileLayer: null,
  allData: []
};

/* ═══════════════════ NOTIFICATION STORAGE ═══════════════════ */
let _notifications = [];

function loadNotifications() {
  const saved = localStorage.getItem('ekrimmap_notifications');
  if (saved) {
    try {
      _notifications = JSON.parse(saved);
    } catch(e) {}
  }
  return _notifications;
}

function saveNotifications(n) {
  _notifications = n;
  localStorage.setItem('ekrimmap_notifications', JSON.stringify(n));
}

function addNotification(title, body, type = 'info') {
  const notifs = loadNotifications();
  notifs.unshift({
    id: 'n' + Date.now(),
    title,
    body,
    type,
    read: false,
    timestamp: new Date().toISOString()
  });
  if (notifs.length > 50) notifs.pop();
  saveNotifications(notifs);
  updateNotifBadge();
  renderNotifications();
  return notifs[0];
}

function markNotifRead(id) {
  const notifs = loadNotifications();
  const idx = notifs.findIndex(n => n.id === id);
  if (idx > -1) {
    notifs[idx].read = true;
    saveNotifications(notifs);
    updateNotifBadge();
    renderNotifications();
  }
}

function deleteNotification(id) {
  const notifs = loadNotifications().filter(n => n.id !== id);
  saveNotifications(notifs);
  updateNotifBadge();
  renderNotifications();
}

function clearAllNotifications() {
  if (!confirm('Hapus semua notifikasi?')) return;
  saveNotifications([]);
  updateNotifBadge();
  renderNotifications();
}

/* ═══════════════════ THEME STORAGE ═══════════════════ */
let _savedTheme = localStorage.getItem('ekrimmap_theme') || 'arctic';

function loadTheme() {
  return THEMES.includes(_savedTheme) ? _savedTheme : 'arctic';
}

function saveTheme(theme) {
  _savedTheme = theme;
  localStorage.setItem('ekrimmap_theme', theme);
}

function setTheme(themeName) {
  state.currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  saveTheme(themeName);
  
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.className = themeName === 'light' ? 'fas fa-sun' : 'fas fa-moon';
  }
  
  if (state.map && state.currentTileLayer) {
    updateMapTiles(themeName);
  }
}

function updateMapTiles(theme) {
  if (!state.map) return;
  
  const config = TILE_CONFIG[theme];
  if (!config) return;
  
  if (state.currentTileLayer) {
    state.map.removeLayer(state.currentTileLayer);
  }
  
  state.currentTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    ...config.options
  }).addTo(state.map);
}

function toggleTheme() {
  const current = state.currentTheme;
  const idx = THEMES.indexOf(current);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next);
  showToast(`Tema: ${next === 'arctic' ? 'Arctic' : 'Light'}`, 'success');
}

/* ═══════════════════ GOOGLE SHEETS API ═══════════════════ */
async function sendToGoogleSheets(data) {
  console.log('📤 Sending report:', data);
  
  return new Promise(async (resolve) => {
    try {
      const url = new URL(GOOGLE_SHEET_API_URL);
      url.searchParams.append('action', 'create');
      url.searchParams.append('nama', data.nama || 'Anonim');
      url.searchParams.append('kontak', data.kontak || '-');
      url.searchParams.append('kategori', data.kategori);
      url.searchParams.append('kecamatan', data.kecamatan);
      url.searchParams.append('lokasi', data.lokasi);
      url.searchParams.append('deskripsi', data.deskripsi || '');
      url.searchParams.append('tanggal_kejadian', data.tanggal_kejadian);
      url.searchParams.append('latitude', data.latitude || '');
      url.searchParams.append('longitude', data.longitude || '');
      url.searchParams.append('severity', data.severity || 'sedang');
      url.searchParams.append('sumber', data.sumber || 'Mobile');
      url.searchParams.append('status', 'pending');
      
      console.log('🌐 Fetch URL:', url.toString());
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        mode: 'no-cors'
      });
      
      console.log('✅ Request sent');
      saveToLocalBackup(data);
      resolve({ success: true });
      
    } catch (error) {
      console.error('❌ Fetch error:', error);
      
      const FRAME_ID = 'gas-iframe';
      const FORM_ID = 'gas-form';
      
      const oldFrame = document.getElementById(FRAME_ID);
      const oldForm = document.getElementById(FORM_ID);
      if (oldFrame) oldFrame.remove();
      if (oldForm) oldForm.remove();
      
      const iframe = document.createElement('iframe');
      iframe.id = FRAME_ID;
      iframe.name = FRAME_ID;
      iframe.style.cssText = 'display:none;position:absolute;width:0;height:0;';
      document.body.appendChild(iframe);
      
      const form = document.createElement('form');
      form.id = FORM_ID;
      form.method = 'POST';
      form.action = GOOGLE_SHEET_API_URL;
      form.target = FRAME_ID;
      form.style.display = 'none';
      
      Object.entries(data).forEach(([k, v]) => {
        const inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = k;
        inp.value = (v !== null && v !== undefined) ? String(v) : '';
        form.appendChild(inp);
      });
      
      document.body.appendChild(form);
      
      const cleanup = () => {
        if (document.getElementById(FRAME_ID)) document.getElementById(FRAME_ID).remove();
        if (document.getElementById(FORM_ID)) document.getElementById(FORM_ID).remove();
      };
      
      const timer = setTimeout(() => {
        cleanup();
        saveToLocalBackup(data);
        resolve({ success: true });
      }, 3000);
      
      iframe.onload = () => {
        clearTimeout(timer);
        cleanup();
        resolve({ success: true });
      };
      
      form.submit();
    }
  });
}

function saveToLocalBackup(data) {
  try {
    let backups = JSON.parse(localStorage.getItem('ekrimmap_pending_reports') || '[]');
    backups.push({
      ...data,
      localId: Date.now(),
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('ekrimmap_pending_reports', JSON.stringify(backups));
    console.log('💾 Saved to local backup, total:', backups.length);
  } catch(e) {}
}

async function restoreLocalBackups() {
  try {
    const backups = JSON.parse(localStorage.getItem('ekrimmap_pending_reports') || '[]');
    if (backups.length === 0) return;
    
    console.log(`🔄 Trying to restore ${backups.length} pending reports`);
    
    for (const report of backups) {
      await sendToGoogleSheets(report);
    }
    
    localStorage.removeItem('ekrimmap_pending_reports');
    console.log('✅ Backups restored');
    showToast(`${backups.length} laporan berhasil dipulihkan`, 'success');
  } catch(e) {}
}

async function fetchVerifiedData() {
  try {
    const url = new URL(GOOGLE_SHEET_API_URL);
    url.searchParams.append('action', 'getVerified');
    
    console.log('📡 Fetching verified data:', url.toString());
    
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    const result = await response.json();
    console.log('Verified data result:', result);
    
    if (result.success && Array.isArray(result.data)) {
      state.allData = result.data;
      renderMarkersFromData(state.allData);
      updateStatsFromData(state.allData);
      return state.allData;
    }
    
    return [];
  } catch (error) {
    console.warn('Fetch verified error:', error);
    return [];
  }
}

/* ═══════════════════ SUBMIT LAPORAN ═══════════════════ */
async function submitLaporan() {
  console.log('submitLaporan called');
  
  const kategori = document.getElementById('f-kategori')?.value;
  const kecamatan = document.getElementById('f-kecamatan')?.value;
  const lokasi = document.getElementById('f-lokasi')?.value?.trim();
  const tanggal = document.getElementById('f-tanggal')?.value;

  if (!kategori) {
    showToast('Pilih jenis kejadian', 'error');
    return;
  }
  if (!kecamatan) {
    showToast('Pilih kecamatan', 'error');
    return;
  }
  if (!lokasi) {
    showToast('Masukkan lokasi kejadian', 'error');
    return;
  }
  if (!tanggal) {
    showToast('Masukkan tanggal kejadian', 'error');
    return;
  }

  const lat = parseFloat(document.getElementById('f-lat')?.value) || null;
  const lng = parseFloat(document.getElementById('f-lng')?.value) || null;

  const reportData = {
    action: 'create',
    nama: document.getElementById('f-pelapor')?.value?.trim() || 'Anonim',
    kontak: '-',
    kategori: kategori,
    kecamatan: kecamatan,
    lokasi: lokasi,
    deskripsi: document.getElementById('f-deskripsi')?.value?.trim() || '',
    tanggal_kejadian: tanggal,
    latitude: lat || '',
    longitude: lng || '',
    severity: 'sedang',
    sumber: 'Mobile',
    status: 'pending'
  };

  showLoading(true);

  try {
    const result = await sendToGoogleSheets(reportData);
    console.log('Send result:', result);
    
    if (result && result.success) {
      addNotification('Laporan Berhasil Dikirim', 
        `${CAT_LABELS[kategori]} di ${lokasi} telah dikirim ke admin.`, 'success');
      
      const formFields = ['f-kategori', 'f-kecamatan', 'f-lokasi', 'f-lat', 'f-lng', 'f-deskripsi', 'f-pelapor'];
      formFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const tanggalField = document.getElementById('f-tanggal');
      if (tanggalField) {
        tanggalField.value = new Date().toISOString().split('T')[0];
      }
      
      closePanel('lapor');
      showToast('Laporan terkirim! Menunggu verifikasi admin.', 'success');
      
      // Refresh riwayat setelah submit
      setTimeout(() => {
        renderRiwayat();
      }, 2000);
    } else {
      showToast('Gagal mengirim laporan', 'error');
    }
  } catch (error) {
    console.error('Submit error:', error);
    showToast('Gagal mengirim laporan: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  let loader = document.getElementById('global-loading');
  if (!loader && show) {
    loader = document.createElement('div');
    loader.id = 'global-loading';
    loader.innerHTML = '<div></div><span>Memproses...</span>';
    loader.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:100000;display:none;align-items:center;justify-content:center;flex-direction:column;gap:16px;';
    document.body.appendChild(loader);
  }
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

/* ═══════════════════ BOOT SCREEN ═══════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = loadTheme();
  setTheme(savedTheme);
  
  const bar = document.getElementById('boot-bar');
  const msg = document.getElementById('boot-msg');
  let pct = 0;
  const msgs = ['Memuat modul...', 'Menghubungkan peta...', 'Memuat data...', 'Sistem siap'];
  let mi = 0;

  const iv = setInterval(() => {
    pct += Math.random() * 8 + 5;
    if (pct > 100) pct = 100;
    if (bar) bar.style.width = pct + '%';
    if (msg && mi < msgs.length && pct > mi * 25) msg.textContent = msgs[mi++];

    if (pct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const boot = document.getElementById('boot');
        const app = document.getElementById('app');
        if (boot) boot.classList.add('out');
        if (app) app.style.display = 'block';
        initApp();
      }, 500);
    }
  }, 80);
});

/* ═══════════════════ INITIALIZATION ═══════════════════ */
async function initApp() {
  initMap();
  initFilters();
  initLegend();
  
  // Load data dari server
  await fetchVerifiedData();
  await renderRiwayat();
  
  updateNotifBadge();
  restoreLocalBackups();

  const tgl = document.getElementById('f-tanggal');
  if (tgl) tgl.value = new Date().toISOString().split('T')[0];
  
  const notifs = loadNotifications();
  if (!notifs.length) {
    addNotification(
      'Selamat Datang di E-KRIMMAP',
      'Sistem pemetaan kriminalitas Cepu & Padangan siap digunakan.',
      'welcome'
    );
  }
  
  // Auto refresh every 30 seconds
  setInterval(async () => {
    await fetchVerifiedData();
    await renderRiwayat();
  }, 30000);
}

/* ═══════════════════ MAP ═══════════════════ */
function initMap() {
  state.map = L.map('map', { 
    zoomControl: false, 
    attributionControl: false 
  }).setView([-7.115, 111.548], 12);

  const config = TILE_CONFIG[state.currentTheme];
  state.currentTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    ...config.options
  }).addTo(state.map);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.circle([-7.130, 111.591], {
    radius: 3500,
    color: '#4fc3f7',
    weight: 2,
    fillColor: '#4fc3f7',
    fillOpacity: 0.04,
    dashArray: '8,6'
  }).addTo(state.map);

  L.circle([-7.102, 111.502], {
    radius: 3000,
    color: '#7e57c2',
    weight: 2,
    fillColor: '#7e57c2',
    fillOpacity: 0.04,
    dashArray: '8,6'
  }).addTo(state.map);

  state.map.on('click', handleMapClick);
  
  setTimeout(() => {
    if (state.map) {
      state.map.invalidateSize();
    }
  }, 100);
}

function handleMapClick(e) {
  if (!state.pickMode) return;
  const { lat, lng } = e.latlng;
  const latEl = document.getElementById('f-lat');
  const lngEl = document.getElementById('f-lng');
  if (latEl) latEl.value = lat.toFixed(6);
  if (lngEl) lngEl.value = lng.toFixed(6);
  stopPickMode();
  openPanel('lapor');
  showToast('Lokasi dipilih', 'success');
}

function makeIcon(k, sev) {
  const c = CAT_COLORS[k] || '#90a4ae';
  const s = sev == 3 ? 28 : sev == 2 ? 20 : 14;
  return L.divIcon({
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 ${s}px ${c},0 0 ${s * 2}px ${c}55;animation:pulseMarker 2s infinite;"></div>`,
    className: '',
    iconAnchor: [s / 2, s / 2]
  });
}

function renderMarkersFromData(data) {
  if (!state.map) return;
  
  state.markers.forEach(m => {
    if (state.map) state.map.removeLayer(m);
  });
  state.markers = [];
  
  if (!data || !data.length) return;
  
  data.forEach(item => {
    if (state.activeFilters.size > 0 && !state.activeFilters.has(item.kategori)) return;
    
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    
    const sev = item.severity === 'tinggi' ? 3 : (item.severity === 'sedang' ? 2 : 1);
    const marker = L.marker([lat, lng], { icon: makeIcon(item.kategori, sev) });
    const kat = item.kategori || 'lainnya';
    const color = CAT_COLORS[kat] || '#90a4ae';
    
    marker.bindPopup(`
      <div style="min-width:180px;">
        <strong style="color:${color}">${CAT_LABELS[kat] || kat}</strong><br>
        <small>${item.lokasi || '-'}</small><br>
        <small style="opacity:.7">${item.tanggal_kejadian || ''}</small>
      </div>`);
    marker.addTo(state.map);
    state.markers.push(marker);
  });
}

/* ═══════════════════ FILTERS ═══════════════════ */
function initFilters() {
  const container = document.getElementById('filter-chips');
  if (!container) return;
  container.innerHTML = '';

  CATS.forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.innerHTML = `<i class="fas ${CAT_ICONS[k]}"></i> ${CAT_LABELS[k]}`;
    btn.onclick = () => {
      if (state.activeFilters.has(k)) {
        state.activeFilters.delete(k);
        btn.classList.remove('active');
      } else {
        state.activeFilters.add(k);
        btn.classList.add('active');
      }
      renderMarkersFromData(state.allData);
    };
    container.appendChild(btn);
  });
}

function initLegend() {
  const container = document.getElementById('legend-items');
  if (!container) return;
  container.innerHTML = CATS.map(k => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${CAT_COLORS[k]};color:${CAT_COLORS[k]}"></div>
      <span>${CAT_LABELS[k]}</span>
    </div>
  `).join('');
}

/* ═══════════════════ STATS ═══════════════════ */
function updateStatsFromData(data) {
  const sTotal = document.getElementById('s-total');
  const sTinggi = document.getElementById('s-tinggi');
  const sSedang = document.getElementById('s-sedang');
  const sCepu = document.getElementById('s-cepu');
  
  if (sTotal) sTotal.textContent = data.length;
  if (sTinggi) sTinggi.textContent = data.filter(d => d.severity === 'tinggi').length;
  if (sSedang) sSedang.textContent = data.filter(d => d.severity === 'sedang').length;
  if (sCepu) sCepu.textContent = data.filter(d => d.kecamatan === 'cepu').length;
}

/* ═══════════════════ PANELS ═══════════════════ */
function switchTab(tab) {
  ['lapor', 'statistik', 'riwayat', 'info'].forEach(closePanel);
  closeNotifPanel();

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.remove('active'));
  const navItem = document.getElementById('nav-' + tab);
  if (navItem) navItem.classList.add('active');

  if (tab === 'peta') return;
  openPanel(tab);

  if (tab === 'statistik') renderStatistik();
  if (tab === 'riwayat') renderRiwayat();
}

function openPanel(name) {
  state.currentPanel = name;
  const panel = document.getElementById('panel-' + name);
  const overlay = document.getElementById('overlay-' + name);
  if (panel) panel.classList.add('open');
  if (overlay) overlay.classList.add('show');
}

function closePanel(name) {
  const panel = document.getElementById('panel-' + name);
  const overlay = document.getElementById('overlay-' + name);
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
  if (state.currentPanel === name) state.currentPanel = null;
}

function toggleSidebar() {
  if (state.currentPanel) {
    closePanel(state.currentPanel);
  } else {
    openPanel('riwayat');
  }
}

/* ═══════════════════ NOTIFICATION PANEL ═══════════════════ */
function toggleAlerts() {
  const panel = document.getElementById('panel-notif');
  const overlay = document.getElementById('overlay-notif');
  
  if (panel && panel.classList.contains('open')) {
    closeNotifPanel();
  } else {
    renderNotifications();
    if (panel) panel.classList.add('open');
    if (overlay) overlay.classList.add('show');
  }
}

function closeNotifPanel() {
  const panel = document.getElementById('panel-notif');
  const overlay = document.getElementById('overlay-notif');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

function renderNotifications() {
  const container = document.getElementById('notif-content');
  if (!container) return;
  
  const notifs = loadNotifications();
  if (!notifs.length) {
    container.innerHTML = `
      <div class="notif-empty">
        <i class="fas fa-bell-slash"></i>
        <div>Belum ada notifikasi</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-item-header">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div class="notif-item-time">${formatTime(n.timestamp)}</div>
      </div>
      <div class="notif-item-body">${escapeHtml(n.body)}</div>
      <div class="notif-item-actions">
        <button class="notif-btn" onclick="event.stopPropagation(); markNotifRead('${n.id}')">
          <i class="fas fa-check"></i> Tandai Baca
        </button>
        <button class="notif-btn delete" onclick="event.stopPropagation(); deleteNotification('${n.id}')">
          <i class="fas fa-trash"></i> Hapus
        </button>
      </div>
    </div>
  `).join('');
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const unread = loadNotifications().filter(n => !n.read).length;
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff/60)} menit`;
  if (diff < 86400) return `${Math.floor(diff/3600)} jam`;
  return d.toLocaleDateString('id-ID');
}

/* ═══════════════════ LAPORAN ═══════════════════ */
function startPickMode() {
  state.pickMode = true;
  const toast = document.getElementById('pick-toast');
  if (toast) toast.classList.add('show');
  if (state.map) state.map.getContainer().style.cursor = 'crosshair';
  closePanel('lapor');
}

function stopPickMode() {
  state.pickMode = false;
  const toast = document.getElementById('pick-toast');
  if (toast) toast.classList.remove('show');
  if (state.map) state.map.getContainer().style.cursor = '';
}

async function renderRiwayat() {
  const container = document.getElementById('riwayat-content');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--tx3);">
      <i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:16px;opacity:0.5;"></i>
      <div>Memuat riwayat...</div>
    </div>`;

  try {
    const data = await fetchVerifiedData();

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--tx3);">
          <i class="fas fa-inbox" style="font-size:48px;margin-bottom:16px;opacity:0.3;"></i>
          <div>Belum ada laporan terverifikasi</div>
          <div style="font-size:12px;margin-top:8px;">Laporan akan muncul setelah diverifikasi admin</div>
        </div>`;
      return;
    }

    container.innerHTML = data.map(item => {
      const kat = item.kategori || 'lainnya';
      const color = CAT_COLORS[kat] || '#90a4ae';
      const icon = CAT_ICONS[kat] || 'fa-circle-question';
      const label = CAT_LABELS[kat] || kat;
      const kec = item.kecamatan
        ? item.kecamatan.charAt(0).toUpperCase() + item.kecamatan.slice(1) : '-';
      const desk = item.deskripsi
        ? item.deskripsi.substring(0, 80) + (item.deskripsi.length > 80 ? '...' : '') : '';
      return `
        <div class="animate-in" style="
          margin-bottom:12px;padding:14px 16px;
          background:var(--card-bg);border-radius:14px;
          border:1px solid var(--border-color);
          border-left:4px solid ${color};">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <i class="fas ${icon}" style="color:${color};font-size:14px;"></i>
            <span style="font-weight:700;font-size:13px;color:var(--tx1);">${label}</span>
            <span style="margin-left:auto;font-size:11px;color:var(--tx3);">${item.tanggal_kejadian || '-'}</span>
          </div>
          <div style="font-size:12px;color:var(--tx2);margin-bottom:4px;">
            <i class="fas fa-map-marker-alt" style="margin-right:4px;opacity:0.6;"></i>
            ${escapeHtml(item.lokasi || '-')} · ${kec}
          </div>
          ${desk ? `<div style="font-size:11px;color:var(--tx3);margin-top:6px;">${escapeHtml(desk)}</div>` : ''}
          <div style="margin-top:8px;">
            <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;
              background:${color}22;color:${color};">✓ TERVERIFIKASI</span>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.warn('renderRiwayat error:', err);
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--tx3);">
        <i class="fas fa-wifi" style="font-size:48px;margin-bottom:16px;opacity:0.3;"></i>
        <div>Gagal memuat data</div>
        <div style="font-size:12px;margin-top:8px;">${err.message}</div>
      </div>`;
  }
}

function renderStatistik() {
  const container = document.getElementById('statistik-content');
  if (!container) return;
  
  const data = state.allData || [];
  const catCounts = {};
  CATS.forEach(c => catCounts[c] = data.filter(d => d.kategori === c).length);
  const maxCount = Math.max(...Object.values(catCounts), 1);
  const total = data.length;
  const tinggi = data.filter(d => d.severity === 'tinggi').length;

  container.innerHTML = `
    <div class="animate-in">
      <div class="chart-container glass-light">
        <div class="widget-title">Distribusi Kategori</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-top:18px;">
          ${CATS.map(k => `
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:90px;font-size:12px;color:var(--tx2);font-weight:600;">${CAT_LABELS[k]}</div>
              <div style="flex:1;height:10px;background:var(--card-bg);border-radius:5px;overflow:hidden;border:1px solid var(--border-color);">
                <div style="width:${(catCounts[k] / maxCount) * 100}%;height:100%;background:${CAT_COLORS[k]};border-radius:5px;"></div>
              </div>
              <div style="width:35px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--tx1);font-weight:700;">${catCounts[k]}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="chart-container glass-light">
        <div class="widget-title">Ringkasan</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;">
          <div style="padding:20px;background:var(--accent-glow);border-radius:16px;border:2px solid var(--accent);text-align:center;">
            <div style="font-size:36px;font-weight:800;color:var(--accent);">${total}</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:6px;font-weight:700;letter-spacing:1px;">TOTAL KEJADIAN</div>
          </div>
          <div style="padding:20px;background:var(--red-glow);border-radius:16px;border:2px solid var(--red);text-align:center;">
            <div style="font-size:36px;font-weight:800;color:var(--red);">${tinggi}</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:6px;font-weight:700;letter-spacing:1px;">RISIKO TINGGI</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════ TOAST ═══════════════════ */
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-circle-xmark' : 'fa-triangle-exclamation';
  el.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 300);
  }, 4000);
}

/* ═══════════════════ UTILITIES ═══════════════════ */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ═══════════════════ GLOBAL EXPORTS ═══════════════════ */
window.switchTab = switchTab;
window.openPanel = openPanel;
window.closePanel = closePanel;
window.toggleSidebar = toggleSidebar;
window.toggleAlerts = toggleAlerts;
window.closeNotifPanel = closeNotifPanel;
window.clearAllNotifications = clearAllNotifications;
window.markNotifRead = markNotifRead;
window.deleteNotification = deleteNotification;
window.startPickMode = startPickMode;
window.stopPickMode = stopPickMode;
window.submitLaporan = submitLaporan;
window.toggleTheme = toggleTheme;
window.focusCategory = (c) => showToast(`Filter: ${c}`, 'success');

const style = document.createElement('style');
style.textContent = `
  @keyframes pulseMarker {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
  }
`;
document.head.appendChild(style);