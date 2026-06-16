// ==================== GOOGLE SHEETS CONFIG ====================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbxan7JrR9PcA6wKQQcG2y4UCqOaKN5A1SojQF2ktV6gCG8mDxAdSq001Lmwhwj1L-P5/exec';

// ==================== LINGKARAN VALIDASI ====================
const VALIDATION_CIRCLES = {
  cepu: {
    center: { lat: -7.147, lng: 111.585 },
    radius: 4200,
    name: 'Kecamatan Cepu'
  },
  padangan: {
    center: { lat: -7.148, lng: 111.640 },
    radius: 4500,
    name: 'Kecamatan Padangan'
  }
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
  activeFilters: new Set(),
  map: null,
  pendingMarkers: [],
  verifiedMarkers: [],
  currentPanel: null,
  currentTheme: 'arctic',
  currentTileLayer: null,
  allData: [],
  validationCircles: [],
  currentLocation: null,
  locationWatchId: null,
  userMarker: null,
  isInValidArea: true,
  currentKecamatan: null,
  refreshInterval: null
};

/* ═══════════════════ NOTIFICATION STORAGE ═══════════════════ */
let _notifications = [];

function loadNotifications() {
  const saved = localStorage.getItem('ekrimmap_notifications');
  if (saved) {
    try { _notifications = JSON.parse(saved); } catch(e) {}
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
  saveNotifications(loadNotifications().filter(n => n.id !== id));
  updateNotifBadge();
  renderNotifications();
}

function clearAllNotifications() {
  if (!confirm('Hapus semua notifikasi?')) return;
  saveNotifications([]);
  updateNotifBadge();
  renderNotifications();
}

/* ═══════════════════ THEME ═══════════════════ */
function loadTheme() {
  const saved = localStorage.getItem('ekrimmap_theme') || 'arctic';
  return THEMES.includes(saved) ? saved : 'arctic';
}

function setTheme(themeName) {
  state.currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('ekrimmap_theme', themeName);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.className = themeName === 'light' ? 'fas fa-sun' : 'fas fa-moon';
  }
  if (state.map && state.currentTileLayer) updateMapTiles(themeName);
}

function updateMapTiles(theme) {
  if (!state.map) return;
  const config = TILE_CONFIG[theme];
  if (!config) return;
  if (state.currentTileLayer) state.map.removeLayer(state.currentTileLayer);
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

/* ═══════════════════ GEOLOKASI ═══════════════════ */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isPointInCircle(lat, lng, circleType) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;
  const circle = VALIDATION_CIRCLES[circleType];
  if (!circle) return false;
  return calculateDistance(lat, lng, circle.center.lat, circle.center.lng) <= circle.radius;
}

function checkLocationInArea(lat, lng) {
  const inCepu = isPointInCircle(lat, lng, 'cepu');
  const inPadangan = isPointInCircle(lat, lng, 'padangan');
  if (inCepu) {
    return {
      valid: true,
      kecamatan: 'cepu',
      distance: calculateDistance(lat, lng, VALIDATION_CIRCLES.cepu.center.lat, VALIDATION_CIRCLES.cepu.center.lng)
    };
  }
  if (inPadangan) {
    return {
      valid: true,
      kecamatan: 'padangan',
      distance: calculateDistance(lat, lng, VALIDATION_CIRCLES.padangan.center.lat, VALIDATION_CIRCLES.padangan.center.lng)
    };
  }
  return { valid: false, kecamatan: null, distance: null };
}

function isValidLocation(lat, lng, kecamatan) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { valid: false, message: 'Lokasi belum terdeteksi' };
  }
  let circleToCheck = kecamatan === 'cepu' ? VALIDATION_CIRCLES.cepu : kecamatan === 'padangan' ? VALIDATION_CIRCLES.padangan : null;
  if (!circleToCheck) {
    return { valid: false, message: 'Pilih kecamatan terlebih dahulu' };
  }
  const distance = calculateDistance(lat, lng, circleToCheck.center.lat, circleToCheck.center.lng);
  if (distance <= circleToCheck.radius) {
    return { valid: true, distance: Math.round(distance), message: '' };
  }
  return {
    valid: false,
    distance: Math.round(distance),
    message: `Lokasi di luar ${circleToCheck.name} (${Math.round(distance)}m)`
  };
}

function updateLocationUI(lat, lng) {
  const areaCheck = checkLocationInArea(lat, lng);
  const submitBtn = document.getElementById('submit-btn');
  const outsideWarning = document.getElementById('outside-warning');
  const liveStatusText = document.getElementById('live-status-text');
  const liveDistanceText = document.getElementById('live-distance-text');
  const kecamatanSelect = document.getElementById('f-kecamatan');
  
  state.isInValidArea = true;
  
  const totalData = state.allData?.length || 0;
  const pendingCount = getPendingReports().length;
  const totalReports = totalData + pendingCount;
  
  if (areaCheck.valid) {
    state.currentKecamatan = areaCheck.kecamatan;
    state.lastDistance = Math.round(areaCheck.distance);
    if (liveStatusText) {
      liveStatusText.innerHTML = `<i class="fas fa-check-circle"></i> Di dalam wilayah ${areaCheck.kecamatan === 'cepu' ? 'Cepu' : 'Padangan'}`;
      liveStatusText.style.color = 'var(--green)';
    }
    if (liveDistanceText) {
      liveDistanceText.textContent = `${state.lastDistance}m dari pusat • ${totalReports} laporan`;
      liveDistanceText.style.color = 'var(--green)';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
    }
    if (outsideWarning) outsideWarning.style.display = 'none';
    if (kecamatanSelect && !kecamatanSelect.value) kecamatanSelect.value = areaCheck.kecamatan;
  } else {
    if (liveStatusText) {
      liveStatusText.innerHTML = `<i class="fas fa-eye"></i> Mode Lihat (Luar Area)`;
      liveStatusText.style.color = 'var(--accent)';
    }
    if (liveDistanceText) {
      liveDistanceText.textContent = `👁️ ${totalReports} laporan dimuat`;
      liveDistanceText.style.color = 'var(--accent)';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
    }
    if (outsideWarning) {
      outsideWarning.style.display = 'flex';
      outsideWarning.style.background = 'var(--accent-glow)';
      outsideWarning.style.border = '2px solid var(--accent)';
      outsideWarning.style.color = 'var(--accent)';
      outsideWarning.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <div>
          <strong>ℹ️ Mode Lihat</strong><br>
          <small>Anda berada di luar wilayah layanan. Tetap dapat melihat semua marker (${totalReports} laporan) dan mengirim laporan dari sini.</small>
        </div>
      `;
    }
  }
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    showToast('Browser tidak mendukung geolokasi', 'error');
    return;
  }
  
  const locStatus = document.getElementById('location-status');
  const liveStatusText = document.getElementById('live-status-text');
  
  if (locStatus) {
    locStatus.style.display = 'flex';
    locStatus.className = 'location-status-loading';
    locStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendeteksi lokasi...';
  }
  if (liveStatusText) {
    liveStatusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mendeteksi lokasi...';
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      state.currentLocation = { lat: latitude, lng: longitude };
      const latField = document.getElementById('f-lat');
      const lngField = document.getElementById('f-lng');
      if (latField) latField.value = latitude.toFixed(6);
      if (lngField) lngField.value = longitude.toFixed(6);
      if (locStatus) {
        locStatus.className = 'location-status-success';
        locStatus.innerHTML = '<i class="fas fa-check-circle"></i> Lokasi terdeteksi';
        setTimeout(() => {
          if (locStatus) locStatus.style.display = 'none';
        }, 3000);
      }
      updateLocationUI(latitude, longitude);
      const areaCheck = checkLocationInArea(latitude, longitude);
      if (areaCheck.valid) {
        const kecamatanSelect = document.getElementById('f-kecamatan');
        if (kecamatanSelect && !kecamatanSelect.value) kecamatanSelect.value = areaCheck.kecamatan;
      }
      addUserLocationMarker(latitude, longitude);
      showToast('Lokasi berhasil dideteksi!', 'success');
    },
    (error) => {
      console.error('Geolocation error:', error);
      let errorMsg = 'Gagal mendapat lokasi';
      if (error.code === 1) errorMsg = 'Izin lokasi ditolak';
      else if (error.code === 2) errorMsg = 'Lokasi tidak tersedia';
      else if (error.code === 3) errorMsg = 'Waktu deteksi habis';
      if (locStatus) {
        locStatus.className = 'location-status-error';
        locStatus.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${errorMsg}`;
      }
      if (liveStatusText) {
        liveStatusText.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${errorMsg}`;
        liveStatusText.style.color = 'var(--red)';
      }
      showToast(errorMsg, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
  
  if (state.locationWatchId !== null) {
    navigator.geolocation.clearWatch(state.locationWatchId);
  }
  state.locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      state.currentLocation = { lat: latitude, lng: longitude };
      const latField = document.getElementById('f-lat');
      const lngField = document.getElementById('f-lng');
      const panelLapor = document.getElementById('panel-lapor');
      if (latField && lngField && panelLapor?.classList.contains('open')) {
        latField.value = latitude.toFixed(6);
        lngField.value = longitude.toFixed(6);
      }
      updateLocationUI(latitude, longitude);
      const areaCheck = checkLocationInArea(latitude, longitude);
      if (areaCheck.valid && panelLapor?.classList.contains('open')) {
        const kecamatanSelect = document.getElementById('f-kecamatan');
        if (kecamatanSelect && !kecamatanSelect.value) kecamatanSelect.value = areaCheck.kecamatan;
      }
      updateUserLocationMarker(latitude, longitude);
    },
    (error) => {
      console.warn('Watch error:', error);
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );
}

function refreshLocation() {
  startLocationTracking();
  showToast('Memperbarui lokasi...', 'info');
}

function addUserLocationMarker(lat, lng) {
  if (state.userMarker) {
    state.userMarker.setLatLng([lat, lng]);
  } else {
    state.userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div style="width:24px;height:24px;background:#4fc3f7;border:3px solid white;border-radius:50%;box-shadow:0 0 20px #4fc3f7;animation:pulseMarker 1.5s infinite;"></div>`,
        className: '',
        iconAnchor: [12, 12]
      })
    }).addTo(state.map).bindPopup('<b>📍 Lokasi Anda</b>');
  }
}

function updateUserLocationMarker(lat, lng) {
  if (state.userMarker) {
    state.userMarker.setLatLng([lat, lng]);
  } else {
    addUserLocationMarker(lat, lng);
  }
}

/* ═══════════════════ PENDING REPORTS ═══════════════════ */
function getPendingReports() {
  try {
    return JSON.parse(localStorage.getItem('ekrimmap_pending_reports') || '[]');
  } catch(e) {
    return [];
  }
}

function savePendingReport(report) {
  try {
    let pending = getPendingReports();
    const exists = pending.some(p =>
      p.latitude === report.latitude &&
      p.longitude === report.longitude &&
      p.timestamp === report.timestamp
    );
    if (!exists) {
      pending.push(report);
      localStorage.setItem('ekrimmap_pending_reports', JSON.stringify(pending));
    }
  } catch(e) {}
}

/* ═══════════════════ MARKER FUNCTIONS ═══════════════════ */
function createPendingIcon(kategori) {
  const color = CAT_COLORS[kategori] || '#f59e0b';
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #ffd700;box-shadow:0 0 20px #ffd700,0 0 40px ${color}66;animation:pulseMarker 1.5s infinite;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:700;">?</div>`,
    className: '',
    iconAnchor: [12, 12]
  });
}

function createVerifiedIcon(kategori, severity) {
  const color = CAT_COLORS[kategori] || '#4fc3f7';
  const size = severity === 3 ? 28 : severity === 2 ? 20 : 14;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 ${size}px ${color},0 0 ${size * 2}px ${color}55;animation:pulseMarker 2s infinite;display:flex;align-items:center;justify-content:center;font-size:${size * 0.4}px;color:white;font-weight:700;">✓</div>`,
    className: '',
    iconAnchor: [size / 2, size / 2]
  });
}

function addPendingMarker(report) {
  if (!state.map) return;
  const lat = parseFloat(report.latitude);
  const lng = parseFloat(report.longitude);
  if (isNaN(lat) || isNaN(lng)) return;
  const kat = report.kategori || 'lainnya';
  const color = CAT_COLORS[kat] || '#f59e0b';
  const marker = L.marker([lat, lng], { icon: createPendingIcon(kat) });
  marker.bindPopup(`
    <div style="min-width:180px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="background:#ffd700;color:#000;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;">⏳ PENDING</span>
        <strong style="color:${color}">${CAT_LABELS[kat] || kat}</strong>
      </div>
      <small>${report.lokasi || '-'}</small><br>
      <small style="opacity:.7;">${report.tanggal_kejadian || ''}</small>
      <div style="margin-top:6px;font-size:10px;color:#ffd700;">
        <i class="fas fa-clock"></i> Menunggu verifikasi admin
      </div>
    </div>
  `);
  marker.addTo(state.map);
  state.pendingMarkers.push(marker);
}

function addVerifiedMarker(item) {
  if (!state.map) return;
  const lat = parseFloat(item.latitude);
  const lng = parseFloat(item.longitude);
  if (isNaN(lat) || isNaN(lng)) return;
  const sev = item.severity === 'tinggi' ? 3 : (item.severity === 'sedang' ? 2 : 1);
  const kat = item.kategori || 'lainnya';
  const color = CAT_COLORS[kat] || '#4fc3f7';
  const marker = L.marker([lat, lng], { icon: createVerifiedIcon(kat, sev) });
  marker.bindPopup(`
    <div style="min-width:180px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="background:${color};color:white;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;">✓ VERIFIED</span>
        <strong style="color:${color}">${CAT_LABELS[kat] || kat}</strong>
      </div>
      <small>${item.lokasi || '-'}</small><br>
      <small style="opacity:.7;">${item.tanggal_kejadian || ''}</small>
    </div>
  `);
  marker.addTo(state.map);
  state.verifiedMarkers.push(marker);
}

function clearAllMarkers() {
  state.pendingMarkers.forEach(m => {
    if (state.map) state.map.removeLayer(m);
  });
  state.pendingMarkers = [];
  state.verifiedMarkers.forEach(m => {
    if (state.map) state.map.removeLayer(m);
  });
  state.verifiedMarkers = [];
}

function renderAllMarkers() {
  console.log('🎯 renderAllMarkers() - Total data:', state.allData?.length || 0);
  if (!state.map) return;
  
  clearAllMarkers();
  
  const pendingReports = getPendingReports();
  const hasActiveFilters = state.activeFilters.size > 0;
  
  pendingReports.forEach(report => {
    if (!hasActiveFilters || state.activeFilters.has(report.kategori)) {
      addPendingMarker(report);
    }
  });
  
  if (state.allData && state.allData.length > 0) {
    state.allData.forEach(item => {
      if (!hasActiveFilters || state.activeFilters.has(item.kategori)) {
        addVerifiedMarker(item);
      }
    });
  }
  
  updateStatsFromData(state.allData || []);
  
  console.log('✅ renderAllMarkers() - Total:', state.pendingMarkers.length + state.verifiedMarkers.length);
}

function applyFilters() {
  console.log('🎯 applyFilters() - Active filters:', [...state.activeFilters]);
  
  clearAllMarkers();
  
  const pendingReports = getPendingReports();
  const hasActiveFilters = state.activeFilters.size > 0;
  
  pendingReports.forEach(report => {
    if (!hasActiveFilters || state.activeFilters.has(report.kategori)) {
      addPendingMarker(report);
    }
  });
  
  if (state.allData && state.allData.length > 0) {
    state.allData.forEach(item => {
      if (!hasActiveFilters || state.activeFilters.has(item.kategori)) {
        addVerifiedMarker(item);
      }
    });
  }
  
  console.log('✅ applyFilters() - Pending:', state.pendingMarkers.length, 'Verified:', state.verifiedMarkers.length);
}

/* ═══════════════════ FETCH DATA - LANGSUNG DARI SERVER (TANPA CACHE) ═══════════════════ */
async function fetchVerifiedData() {
  try {
    console.log('📡 FETCHING DATA FROM SERVER...');
    
    // 🔴 FORCE: Tambahkan parameter unik untuk menghindari cache
    const url = new URL(GOOGLE_SHEET_API_URL);
    url.searchParams.append('action', 'getVerified');
    url.searchParams.append('_t', Date.now());
    url.searchParams.append('_cache', Math.random().toString(36).substring(7));
    
    console.log('🌐 URL:', url.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    const result = await response.json();
    console.log('📊 Server Response:', result);
    
    if (result.success && Array.isArray(result.data)) {
      // 🔴 SIMPAN DATA KE STATE (TANPA CACHE)
      state.allData = result.data;
      console.log('✅ Data loaded from SERVER:', state.allData.length, 'records');
      
      // 🔴 RENDER ULANG SEMUA
      renderAllMarkers();
      updateStatsFromData(state.allData);
      updateLocationUI(state.currentLocation?.lat || 0, state.currentLocation?.lng || 0);
      
      // 🔴 UPDATE RIWAYAT
      await renderRiwayat();
      
      return state.allData;
    } else {
      throw new Error('Invalid response from server');
    }
    
  } catch (error) {
    console.warn('⚠️ Fetch error:', error.message);
    
    // 🔴 JANGAN PAKAI CACHE - TAMPILKAN PESAN ERROR
    state.allData = [];
    renderAllMarkers();
    updateStatsFromData([]);
    updateLocationUI(state.currentLocation?.lat || 0, state.currentLocation?.lng || 0);
    showToast('❌ Gagal memuat data dari server', 'error');
    return [];
  }
}

/* ═══════════════════ UPDATE STATS ═══════════════════ */
function updateStatsFromData(data) {
  console.log('📊 updateStatsFromData - data:', data?.length || 0);
  
  const sTotal = document.getElementById('s-total');
  const sTinggi = document.getElementById('s-tinggi');
  const sSedang = document.getElementById('s-sedang');
  const sCepu = document.getElementById('s-cepu');
  
  const pendingCount = getPendingReports().length;
  const total = (data?.length || 0) + pendingCount;
  
  if (sTotal) sTotal.textContent = total;
  if (sTinggi) sTinggi.textContent = data?.filter(d => d.severity === 'tinggi').length || 0;
  if (sSedang) sSedang.textContent = data?.filter(d => d.severity === 'sedang').length || 0;
  if (sCepu) sCepu.textContent = data?.filter(d => d.kecamatan === 'cepu').length || 0;
  
  console.log('✅ Stats updated - Total:', total, 'Tinggi:', sTinggi?.textContent, 'Sedang:', sSedang?.textContent, 'Cepu:', sCepu?.textContent);
}

/* ═══════════════════ GOOGLE SHEETS API ═══════════════════ */
async function sendToGoogleSheets(data) {
  console.log('📤 Sending report...');
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
      
      await fetch(url.toString(), { method: 'GET', mode: 'no-cors' });
      console.log('✅ Request sent');
      
      const pendingReport = {
        ...data,
        status: 'pending',
        localId: Date.now(),
        timestamp: new Date().toISOString()
      };
      savePendingReport(pendingReport);
      addPendingMarker(pendingReport);
      updateStatsFromData(state.allData);
      
      resolve({ success: true, pending: true });
    } catch (error) {
      console.error('❌ Error:', error);
      const pendingReport = {
        ...data,
        status: 'pending',
        localId: Date.now(),
        timestamp: new Date().toISOString()
      };
      savePendingReport(pendingReport);
      addPendingMarker(pendingReport);
      resolve({ success: true, pending: true });
    }
  });
}

/* ═══════════════════ SUBMIT LAPORAN ═══════════════════ */
async function submitLaporan() {
  console.log('submitLaporan called');
  
  const kategori = document.getElementById('f-kategori')?.value;
  const kecamatan = document.getElementById('f-kecamatan')?.value;
  const lokasi = document.getElementById('f-lokasi')?.value?.trim();
  const tanggal = document.getElementById('f-tanggal')?.value;
  const lat = parseFloat(document.getElementById('f-lat')?.value) || null;
  const lng = parseFloat(document.getElementById('f-lng')?.value) || null;

  if (!kategori) { showToast('Pilih jenis kejadian', 'error'); return; }
  if (!kecamatan) { showToast('Pilih kecamatan', 'error'); return; }
  if (!lokasi) { showToast('Masukkan lokasi kejadian', 'error'); return; }
  if (!tanggal) { showToast('Masukkan tanggal kejadian', 'error'); return; }
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    showToast('Lokasi belum terdeteksi', 'error');
    return;
  }
  
  const locationValidation = isValidLocation(lat, lng, kecamatan);
  if (!locationValidation.valid) {
    if (!confirm(`⚠️ ${locationValidation.message}\n\nTetap kirim laporan?`)) {
      return;
    }
  }

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
    if (result && result.success) {
      addNotification('Laporan Terkirim', `${CAT_LABELS[kategori]} di ${lokasi} menunggu verifikasi.`, 'info');
      document.getElementById('f-kategori').value = '';
      document.getElementById('f-lokasi').value = '';
      document.getElementById('f-deskripsi').value = '';
      document.getElementById('f-pelapor').value = '';
      document.getElementById('f-tanggal').value = new Date().toISOString().split('T')[0];
      closePanel('lapor');
      showToast('Laporan terkirim! Menunggu verifikasi.', 'success');
      
      // 🔴 FORCE FETCH ULANG SETELAH SUBMIT
      await fetchVerifiedData();
    } else {
      showToast('Gagal mengirim laporan', 'error');
    }
  } catch (error) {
    console.error('Submit error:', error);
    showToast('Gagal mengirim: ' + error.message, 'error');
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

/* ═══════════════════ MANUAL SYNC ═══════════════════ */
async function manualSync() {
  console.log('🔄 MANUAL SYNC TRIGGERED');
  showToast('🔄 Menyinkronkan data dari server...', 'info');
  
  await fetchVerifiedData();
  
  const total = state.allData?.length || 0;
  showToast(`✅ Sync selesai! ${total} laporan dimuat`, 'success');
  
  return state.allData;
}

window.manualSync = manualSync;

/* ═══════════════════ BOOT & INIT ═══════════════════ */
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

async function initApp() {
  console.log('🚀 INIT APP');
  
  state.isInValidArea = true;
  
  initMap();
  initFilters();
  initLegend();
  
  // 🔴 LOAD DATA LANGSUNG DARI SERVER
  console.log('📡 FORCE LOADING DATA FROM SERVER...');
  await fetchVerifiedData();
  
  // 🔴 AUTO REFRESH SETIAP 3 DETIK (LANGSUNG DARI SERVER)
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  state.refreshInterval = setInterval(async () => {
    console.log('🔄 AUTO REFRESH (3s)...');
    await fetchVerifiedData();
  }, 3000);
  
  updateNotifBadge();
  
  const tgl = document.getElementById('f-tanggal');
  if (tgl) tgl.value = new Date().toISOString().split('T')[0];
  
  const notifs = loadNotifications();
  if (!notifs.length) {
    addNotification('Selamat Datang di E-KRIMMAP',
      'Sistem pemetaan kriminalitas Kecamatan Cepu & Padangan siap digunakan.\nData sync langsung dari server setiap 3 detik.',
      'welcome');
  }
  
  const kecamatanSelect = document.getElementById('f-kecamatan');
  if (kecamatanSelect) {
    kecamatanSelect.addEventListener('change', () => {
      const lat = parseFloat(document.getElementById('f-lat')?.value);
      const lng = parseFloat(document.getElementById('f-lng')?.value);
      if (lat && lng) {
        const validation = isValidLocation(lat, lng, kecamatanSelect.value);
        let msg = document.getElementById('location-validation-msg');
        if (!msg) {
          msg = document.createElement('div');
          msg.id = 'location-validation-msg';
          msg.style.cssText = 'margin-top:8px;padding:10px;border-radius:12px;font-size:11px;display:flex;align-items:center;gap:8px;';
          document.querySelector('.coord-inputs')?.parentNode?.appendChild(msg);
        }
        if (!validation.valid) {
          msg.style.display = 'flex';
          msg.style.background = 'var(--red-glow)';
          msg.style.border = '1px solid var(--red)';
          msg.style.color = 'var(--red)';
          msg.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${validation.message}`;
        } else {
          msg.style.display = 'flex';
          msg.style.background = 'var(--green-glow)';
          msg.style.border = '1px solid var(--green)';
          msg.style.color = 'var(--green)';
          msg.innerHTML = `<i class="fas fa-check-circle"></i> Lokasi valid! Jarak ${validation.distance}m`;
        }
      }
    });
  }
  
  startLocationTracking();
  
  // 🔴 REFRESH SAAT TAB AKTIF
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('👁️ Tab aktif, refresh dari server...');
      fetchVerifiedData();
    }
  });
  
  console.log('✅ INIT COMPLETE');
}

/* ═══════════════════ MAP ═══════════════════ */
function initMap() {
  console.log('🗺️ Init Map');
  state.map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([-7.140, 111.600], 12);
  const config = TILE_CONFIG[state.currentTheme];
  state.currentTileLayer = L.tileLayer(config.url, {
    attribution: config.attribution,
    ...config.options
  }).addTo(state.map);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.circle([-7.147, 111.585], {
    radius: 4200,
    color: '#4fc3f7',
    weight: 2,
    fillColor: '#4fc3f7',
    fillOpacity: 0.08,
    dashArray: '8,6'
  }).addTo(state.map).bindPopup(`
    <b>KECAMATAN CEPU</b><br>
    Cabeyan • Gadon • Getas • Jipang • Kapuan<br>
    Kentong • Mernung • Mulyorejo • Ngloram<br>
    Ngroto • Sumberpitu<br><br>
    Balun • Cepu • Karangboyo • Ngelo<br>
    Nglanjuk • Tambakromo
  `);
  
  L.circle([-7.148, 111.640], {
    radius: 4500,
    color: '#7e57c2',
    weight: 2,
    fillColor: '#7e57c2',
    fillOpacity: 0.08,
    dashArray: '8,6'
  }).addTo(state.map).bindPopup(`
    <b>KECAMATAN PADANGAN</b><br>
    Banjarejo • Cendono • Dengok • Kebonagung<br>
    Kendung • Kuncen • Ngasinan • Ngeper<br>
    Ngradin • Nguken • Padangan • Prangi<br>
    Purworejo • Sidorejo • Sonorejo • Tebon
  `);
  
  setTimeout(() => {
    if (state.map) {
      state.map.invalidateSize();
      renderAllMarkers();
    }
  }, 500);
}

/* ═══════════════════ FILTERS & LEGEND ═══════════════════ */
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
      applyFilters();
    };
    container.appendChild(btn);
  });
}

function initLegend() {
  const container = document.getElementById('legend-items');
  if (!container) return;
  container.innerHTML = `
    <div class="legend-item">
      <div class="legend-dot" style="background:#ffd700;border:2px solid #ffd700;"></div>
      <span style="color:#ffd700;">Pending</span>
    </div>
    ${CATS.map(k => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${CAT_COLORS[k]};color:${CAT_COLORS[k]}"></div>
        <span>${CAT_LABELS[k]}</span>
      </div>
    `).join('')}
  `;
}

/* ═══════════════════ PANELS ═══════════════════ */
function switchTab(tab) {
  ['lapor', 'statistik', 'riwayat', 'info'].forEach(closePanel);
  closeNotifPanel();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
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
    panel.classList.add('open');
    overlay.classList.add('show');
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

/* ═══════════════════ RIWAYAT ═══════════════════ */
async function renderRiwayat() {
  const container = document.getElementById('riwayat-content');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--tx3);">
      <i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:16px;"></i>
      <div>Memuat...</div>
    </div>
  `;

  try {
    const data = state.allData || [];
    const pendingReports = getPendingReports();
    const allItems = [
      ...pendingReports.map(p => ({ ...p, status: 'pending', _type: 'pending' })),
      ...data.map(d => ({ ...d, status: 'verified', _type: 'verified' }))
    ];
    if (allItems.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--tx3);">
          <i class="fas fa-inbox" style="font-size:48px;margin-bottom:16px;opacity:0.3;"></i>
          <div>Belum ada laporan</div>
        </div>
      `;
      return;
    }
    allItems.sort((a, b) => new Date(b.timestamp || b.tanggal_kejadian) - new Date(a.timestamp || a.tanggal_kejadian));
    container.innerHTML = allItems.map(item => {
      const kat = item.kategori || 'lainnya';
      const color = CAT_COLORS[kat] || '#90a4ae';
      const icon = CAT_ICONS[kat] || 'fa-circle-question';
      const label = CAT_LABELS[kat] || kat;
      const kec = item.kecamatan ? item.kecamatan.charAt(0).toUpperCase() + item.kecamatan.slice(1) : '-';
      const desk = item.deskripsi ? item.deskripsi.substring(0, 80) + (item.deskripsi.length > 80 ? '...' : '') : '';
      const isPending = item.status === 'pending';
      const statusLabel = isPending ? '⏳ PENDING' : '✓ TERVERIFIKASI';
      const statusColor = isPending ? '#ffd700' : color;
      return `
        <div class="animate-in" style="margin-bottom:12px;padding:14px 16px;background:var(--card-bg);border-radius:14px;border:1px solid var(--border-color);border-left:4px solid ${isPending ? '#ffd700' : color};${isPending ? 'opacity:0.9;' : ''}">
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
            <span style="font-size:10px;font-weight:700;padding:3px 12px;border-radius:20px;background:${statusColor}22;color:${statusColor};">
              ${statusLabel}${isPending ? ' <i class="fas fa-clock" style="font-size:9px;"></i>' : ''}
            </span>
            ${isPending ? `<span style="font-size:9px;color:var(--tx3);margin-left:8px;">Menunggu verifikasi</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--tx3);">
        <i class="fas fa-wifi" style="font-size:48px;margin-bottom:16px;opacity:0.3;"></i>
        <div>Gagal memuat</div>
      </div>
    `;
  }
}

/* ═══════════════════ STATISTIK ═══════════════════ */
function renderStatistik() {
  const container = document.getElementById('statistik-content');
  if (!container) return;
  const data = state.allData || [];
  const pendingCount = getPendingReports().length;
  const catCounts = {};
  CATS.forEach(c => catCounts[c] = data.filter(d => d.kategori === c).length);
  const maxCount = Math.max(...Object.values(catCounts), 1);
  const total = data.length + pendingCount;
  const tinggi = data.filter(d => d.severity === 'tinggi').length;
  const sedang = data.filter(d => d.severity === 'sedang').length;
  const rendah = data.filter(d => d.severity === 'rendah').length;
  const totalCepu = data.filter(d => d.kecamatan === 'cepu').length;
  const totalPadangan = data.filter(d => d.kecamatan === 'padangan').length;
  const maxKec = Math.max(totalCepu, totalPadangan, 1);

  container.innerHTML = `
    <div class="animate-in">
      <div class="chart-container glass-light">
        <div class="widget-title">Status Laporan</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">
          <div style="padding:16px;background:rgba(255,215,0,0.12);border-radius:14px;border:2px solid #ffd700;text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#ffd700;">${pendingCount}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;">PENDING</div>
          </div>
          <div style="padding:16px;background:var(--green-glow);border-radius:14px;border:2px solid var(--green);text-align:center;">
            <div style="font-size:32px;font-weight:800;color:var(--green);">${data.length}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;">VERIFIED</div>
          </div>
        </div>
      </div>
      <div class="chart-container glass-light">
        <div class="widget-title">Distribusi Kategori (Verified)</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-top:18px;">
          ${CATS.map(k => {
            const pct = data.length > 0 ? ((catCounts[k] / data.length) * 100).toFixed(0) : 0;
            return `
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:90px;font-size:12px;color:var(--tx2);font-weight:600;">${CAT_LABELS[k]}</div>
              <div style="flex:1;height:10px;background:var(--card-bg);border-radius:5px;overflow:hidden;border:1px solid var(--border-color);">
                <div style="width:${(catCounts[k] / maxCount) * 100}%;height:100%;background:${CAT_COLORS[k]};border-radius:5px;"></div>
              </div>
              <div style="width:28px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--tx1);font-weight:700;">${catCounts[k]}</div>
              <div style="width:34px;font-size:10px;color:var(--tx3);">(${pct}%)</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="chart-container glass-light">
        <div class="widget-title">Tingkat Risiko</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px;">
          <div style="padding:14px 10px;background:var(--red-glow);border-radius:14px;border:2px solid var(--red);text-align:center;">
            <div style="font-size:28px;font-weight:800;color:var(--red);">${tinggi}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;">TINGGI</div>
          </div>
          <div style="padding:14px 10px;background:rgba(255,202,40,0.12);border-radius:14px;border:2px solid #ffca28;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#ffca28;">${sedang}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;">SEDANG</div>
          </div>
          <div style="padding:14px 10px;background:rgba(102,187,106,0.12);border-radius:14px;border:2px solid #66bb6a;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#66bb6a;">${rendah}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;">RENDAH</div>
          </div>
        </div>
      </div>
      <div class="chart-container glass-light">
        <div class="widget-title">Per Kecamatan</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:80px;font-size:12px;color:var(--tx2);font-weight:600;">Cepu</div>
            <div style="flex:1;height:12px;background:var(--card-bg);border-radius:6px;overflow:hidden;border:1px solid var(--border-color);">
              <div style="width:${(totalCepu / maxKec) * 100}%;height:100%;background:#4fc3f7;border-radius:6px;"></div>
            </div>
            <div style="width:28px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--tx1);font-weight:700;">${totalCepu}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:80px;font-size:12px;color:var(--tx2);font-weight:600;">Padangan</div>
            <div style="flex:1;height:12px;background:var(--card-bg);border-radius:6px;overflow:hidden;border:1px solid var(--border-color);">
              <div style="width:${(totalPadangan / maxKec) * 100}%;height:100%;background:#7e57c2;border-radius:6px;"></div>
            </div>
            <div style="width:28px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--tx1);font-weight:700;">${totalPadangan}</div>
          </div>
        </div>
      </div>
      <div class="chart-container glass-light">
        <div class="widget-title">Ringkasan</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;">
          <div style="padding:20px;background:var(--accent-glow);border-radius:16px;border:2px solid var(--accent);text-align:center;">
            <div style="font-size:36px;font-weight:800;color:var(--accent);">${total}</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:6px;font-weight:700;">TOTAL</div>
          </div>
          <div style="padding:20px;background:var(--red-glow);border-radius:16px;border:2px solid var(--red);text-align:center;">
            <div style="font-size:36px;font-weight:800;color:var(--red);">${tinggi}</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:6px;font-weight:700;">RISIKO TINGGI</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════ TOAST & UTILITIES ═══════════════════ */
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ═══════════════════ DEBUG ═══════════════════ */
window.debugEKR = {
  data: () => {
    console.log('📊 Data dari server:', state.allData);
    return state.allData;
  },
  refresh: async () => {
    await fetchVerifiedData();
    return state.allData;
  },
  status: () => {
    console.log('Status:', {
      total: state.allData?.length,
      pending: getPendingReports().length,
      markers: state.pendingMarkers.length + state.verifiedMarkers.length,
      inArea: state.isInValidArea
    });
    return {
      total: state.allData?.length,
      pending: getPendingReports().length,
      markers: state.pendingMarkers.length + state.verifiedMarkers.length,
      inArea: state.isInValidArea
    };
  }
};

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
window.submitLaporan = submitLaporan;
window.toggleTheme = toggleTheme;
window.refreshLocation = refreshLocation;
window.focusCategory = (c) => showToast(`Filter: ${c}`, 'success');
window.fetchVerifiedData = fetchVerifiedData;
window.renderAllMarkers = renderAllMarkers;
window.manualSync = manualSync;
window.updateStatsFromData = updateStatsFromData;
window.applyFilters = applyFilters;

console.log('🔧 E-KRIMMAP siap!');
console.log('🔗 Server URL:', GOOGLE_SHEET_API_URL);
console.log('🔄 Auto refresh setiap 3 detik (langsung dari server)');
console.log('📊 Gunakan manualSync() untuk sync manual');
console.log('🔍 debugEKR.status() untuk cek status');
