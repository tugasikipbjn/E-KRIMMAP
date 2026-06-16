// ==================== GOOGLE SHEETS CONFIG ====================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycby6mZMrNI8E1H_fh3SSi8SX6fF2kvUsV3BBiAUg9m5nLYuTOEtwD2OPgRiSOG1AjQHL/exec';

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
  markers: [],
  currentPanel: null,
  currentTheme: 'arctic',
  currentTileLayer: null,
  allData: [],
  validationCircles: [],
  currentLocation: null,
  locationWatchId: null,
  userMarker: null,
  isInValidArea: false,
  currentKecamatan: null,
  lastDistance: null
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

/* ═══════════════════ GEOLOKASI & VALIDASI ═══════════════════ */
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

function checkLocationInArea(lat, lng) {
  const inCepu = isPointInCircle(lat, lng, 'cepu');
  const inPadangan = isPointInCircle(lat, lng, 'padangan');
  
  if (inCepu) return { valid: true, kecamatan: 'cepu', distance: calculateDistance(lat, lng, VALIDATION_CIRCLES.cepu.center.lat, VALIDATION_CIRCLES.cepu.center.lng) };
  if (inPadangan) return { valid: true, kecamatan: 'padangan', distance: calculateDistance(lat, lng, VALIDATION_CIRCLES.padangan.center.lat, VALIDATION_CIRCLES.padangan.center.lng) };
  return { valid: false, kecamatan: null, distance: null };
}

function isValidLocation(lat, lng, kecamatan) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { valid: false, message: 'Lokasi belum terdeteksi' };
  }
  
  let circleToCheck = null;
  if (kecamatan === 'cepu') {
    circleToCheck = VALIDATION_CIRCLES.cepu;
  } else if (kecamatan === 'padangan') {
    circleToCheck = VALIDATION_CIRCLES.padangan;
  } else {
    return { valid: false, message: 'Pilih kecamatan terlebih dahulu' };
  }
  
  const distance = calculateDistance(lat, lng, circleToCheck.center.lat, circleToCheck.center.lng);
  
  if (distance <= circleToCheck.radius) {
    return { valid: true, distance: Math.round(distance), message: '' };
  } else {
    return { 
      valid: false, 
      distance: Math.round(distance),
      message: `Lokasi Anda berada di luar ${circleToCheck.name} (jarak ${Math.round(distance)}m, maksimal ${circleToCheck.radius}m)`
    };
  }
}

function isPointInCircle(lat, lng, circleType) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;
  const circle = VALIDATION_CIRCLES[circleType];
  if (!circle) return false;
  const distance = calculateDistance(lat, lng, circle.center.lat, circle.center.lng);
  return distance <= circle.radius;
}

// Update UI berdasarkan status lokasi
function updateLocationUI(lat, lng) {
  const areaCheck = checkLocationInArea(lat, lng);
  const submitBtn = document.getElementById('submit-btn');
  const disabledMsg = document.getElementById('submit-disabled-msg');
  const outsideWarning = document.getElementById('outside-warning');
  const liveStatusText = document.getElementById('live-status-text');
  const liveDistanceText = document.getElementById('live-distance-text');
  const kecamatanSelect = document.getElementById('f-kecamatan');
  
  state.isInValidArea = areaCheck.valid;
  
  if (areaCheck.valid) {
    state.currentKecamatan = areaCheck.kecamatan;
    state.lastDistance = Math.round(areaCheck.distance);
    
    if (liveStatusText) {
      liveStatusText.innerHTML = `<i class="fas fa-check-circle"></i> Di dalam wilayah ${areaCheck.kecamatan === 'cepu' ? 'Cepu' : 'Padangan'}`;
      liveStatusText.style.color = 'var(--green)';
    }
    if (liveDistanceText) {
      liveDistanceText.textContent = `${state.lastDistance}m dari pusat`;
      liveDistanceText.style.color = 'var(--green)';
    }
    
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
    }
    if (disabledMsg) disabledMsg.style.display = 'none';
    if (outsideWarning) outsideWarning.style.display = 'none';
    
    if (kecamatanSelect && !kecamatanSelect.value) {
      kecamatanSelect.value = areaCheck.kecamatan;
    }
  } else {
    if (liveStatusText) {
      liveStatusText.innerHTML = `<i class="fas fa-circle-exclamation"></i> Di luar wilayah layanan`;
      liveStatusText.style.color = 'var(--red)';
    }
    if (liveDistanceText) {
      liveDistanceText.textContent = '';
    }
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('disabled');
    }
    if (disabledMsg) disabledMsg.style.display = 'block';
    if (outsideWarning) outsideWarning.style.display = 'flex';
  }
  
  validateCurrentLocation();
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
        if (kecamatanSelect && !kecamatanSelect.value) {
          kecamatanSelect.value = areaCheck.kecamatan;
        }
      }
      
      addUserLocationMarker(latitude, longitude);
      showToast('Lokasi Anda berhasil dideteksi!', 'success');
    },
    (error) => {
      console.error('Geolocation error:', error);
      let errorMsg = 'Gagal mendapat lokasi';
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = 'Izin lokasi ditolak. Aktifkan lokasi untuk melanjutkan.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg = 'Lokasi tidak tersedia';
          break;
        case error.TIMEOUT:
          errorMsg = 'Waktu deteksi lokasi habis';
          break;
      }
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
        if (kecamatanSelect && !kecamatanSelect.value) {
          kecamatanSelect.value = areaCheck.kecamatan;
        }
      }
      
      updateUserLocationMarker(latitude, longitude);
    },
    (error) => {
      console.warn('Watch position error:', error);
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
    }).addTo(state.map).bindPopup('<b>📍 Lokasi Anda Saat Ini</b>');
  }
}

function updateUserLocationMarker(lat, lng) {
  if (state.userMarker) {
    state.userMarker.setLatLng([lat, lng]);
  } else {
    addUserLocationMarker(lat, lng);
  }
}

function validateCurrentLocation() {
  const kecamatan = document.getElementById('f-kecamatan')?.value;
  const lat = parseFloat(document.getElementById('f-lat')?.value);
  const lng = parseFloat(document.getElementById('f-lng')?.value);
  let validationMsg = document.getElementById('location-validation-msg');
  
  if (!kecamatan || !lat || !lng || isNaN(lat) || isNaN(lng)) {
    if (validationMsg) validationMsg.style.display = 'none';
    return;
  }
  
  const validation = isValidLocation(lat, lng, kecamatan);
  
  if (!validationMsg) {
    const newMsg = document.createElement('div');
    newMsg.id = 'location-validation-msg';
    newMsg.style.cssText = 'margin-top: 8px; padding: 10px; border-radius: 12px; font-size: 11px; display: flex; align-items: center; gap: 8px;';
    const coordDiv = document.querySelector('.coord-inputs');
    if (coordDiv && coordDiv.parentNode) {
      coordDiv.parentNode.appendChild(newMsg);
    }
    validationMsg = document.getElementById('location-validation-msg');
  }
  
  if (validationMsg) {
    if (!validation.valid) {
      validationMsg.style.display = 'flex';
      validationMsg.style.background = 'var(--red-glow)';
      validationMsg.style.border = '1px solid var(--red)';
      validationMsg.style.color = 'var(--red)';
      validationMsg.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${validation.message}`;
    } else {
      validationMsg.style.display = 'flex';
      validationMsg.style.background = 'var(--green-glow)';
      validationMsg.style.border = '1px solid var(--green)';
      validationMsg.style.color = 'var(--green)';
      validationMsg.innerHTML = `<i class="fas fa-check-circle"></i> Lokasi valid! Jarak ${validation.distance}m dari pusat ${kecamatan}`;
    }
  }
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
    console.log('📡 Fetching verified data...');
    
    const url = new URL(GOOGLE_SHEET_API_URL);
    url.searchParams.append('action', 'getVerified');
    url.searchParams.append('_t', Date.now());
    
    console.log('🌐 URL:', url.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('📥 Response status:', response.status);
    
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    const result = await response.json();
    console.log('📦 Raw result:', result);
    
    if (!result || !result.success) {
      console.warn('⚠️ API returned error:', result);
      return [];
    }
    
    if (!Array.isArray(result.data)) {
      console.warn('⚠️ Data is not array:', result.data);
      return [];
    }
    
    console.log(`✅ Received ${result.data.length} records`);
    
    // VALIDASI: Cek setiap data
    const validData = result.data.filter(item => {
      const lat = parseFloat(item.latitude);
      const lng = parseFloat(item.longitude);
      const isValid = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      
      if (!isValid) {
        console.warn('⚠️ Invalid coordinates for:', item);
        console.warn(`   lat: ${item.latitude} (${typeof item.latitude}), lng: ${item.longitude} (${typeof item.longitude})`);
      }
      
      return isValid;
    });
    
    console.log(`📍 Valid coordinates: ${validData.length}/${result.data.length}`);
    
    if (validData.length === 0) {
      console.warn('⚠️ No valid data found!');
      if (result.data.length > 0) {
        console.log('📌 Sample record:', result.data[0]);
        console.log('   latitude:', result.data[0].latitude);
        console.log('   longitude:', result.data[0].longitude);
        console.log('   kategori:', result.data[0].kategori);
      }
      state.allData = [];
      renderMarkersFromData(state.allData);
      updateStatsFromData(state.allData);
      return [];
    }
    
    state.allData = validData;
    
    renderMarkersFromData(state.allData);
    updateStatsFromData(state.allData);
    updateFilterCounts(state.allData);
    
    if (validData.length > 0) {
      const first = validData[0];
      const lat = parseFloat(first.latitude);
      const lng = parseFloat(first.longitude);
      if (!isNaN(lat) && !isNaN(lng) && state.map) {
        state.map.setView([lat, lng], 13);
        console.log(`🔍 Zoom to: ${lat}, ${lng}`);
      }
    }
    
    showToast(`${validData.length} laporan dimuat`, 'success');
    return state.allData;
    
  } catch (error) {
    console.error('❌ Fetch error:', error);
    showToast('Gagal memuat data: ' + error.message, 'error');
    return [];
  }
}

/* ═══════════════════ SUBMIT LAPORAN ═══════════════════ */
async function submitLaporan() {
  console.log('submitLaporan called');
  
  if (!state.isInValidArea) {
    showToast('Anda berada di luar wilayah layanan! Laporan tidak dapat dikirim.', 'error');
    return;
  }
  
  const kategori = document.getElementById('f-kategori')?.value;
  const kecamatan = document.getElementById('f-kecamatan')?.value;
  const lokasi = document.getElementById('f-lokasi')?.value?.trim();
  const tanggal = document.getElementById('f-tanggal')?.value;
  const lat = parseFloat(document.getElementById('f-lat')?.value) || null;
  const lng = parseFloat(document.getElementById('f-lng')?.value) || null;

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
  
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    showToast('Lokasi belum terdeteksi. Tunggu sebentar...', 'error');
    return;
  }
  
  const locationValidation = isValidLocation(lat, lng, kecamatan);
  
  if (!locationValidation.valid) {
    showToast(locationValidation.message, 'error');
    return;
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
    console.log('Send result:', result);
    
    if (result && result.success) {
      addNotification('Laporan Berhasil Dikirim', 
        `${CAT_LABELS[kategori]} di ${lokasi} (${locationValidation.distance}m dari pusat ${kecamatan}) telah dikirim ke admin.`, 'success');
      
      const formFields = ['f-kategori', 'f-lokasi', 'f-deskripsi', 'f-pelapor'];
      formFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const tanggalField = document.getElementById('f-tanggal');
      if (tanggalField) {
        tanggalField.value = new Date().toISOString().split('T')[0];
      }
      
      closePanel('lapor');
      showToast(`Laporan terkirim! Lokasi valid (${locationValidation.distance}m dari pusat ${kecamatan})`, 'success');
      
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

/* ═══════════════════ BOOT SCREEN & INIT ═══════════════════ */
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
  initMap();
  initFilters();
  initLegend();
  
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
      'Sistem pemetaan kriminalitas Kecamatan Cepu & Padangan siap digunakan.\nLokasi Anda akan terdeteksi otomatis. Laporan hanya dapat dikirim dari dalam wilayah layanan.',
      'welcome'
    );
  }
  
  const kecamatanSelect = document.getElementById('f-kecamatan');
  if (kecamatanSelect) {
    kecamatanSelect.addEventListener('change', validateCurrentLocation);
  }
  
  const latField = document.getElementById('f-lat');
  const lngField = document.getElementById('f-lng');
  if (latField && lngField) {
    latField.addEventListener('input', validateCurrentLocation);
    lngField.addEventListener('input', validateCurrentLocation);
  }
  
  startLocationTracking();
  
  setInterval(async () => {
    await fetchVerifiedData();
    await renderRiwayat();
  }, 10000);
}

/* ═══════════════════ MAP ═══════════════════ */
function initMap() {
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

  const cepuCircle = L.circle([-7.147, 111.585], {
    radius: 4200,
    color: '#4fc3f7',
    weight: 2,
    fillColor: '#4fc3f7',
    fillOpacity: 0.08,
    dashArray: '8,6'
  }).addTo(state.map).bindPopup(`
    <b>KECAMATAN CEPU</b><br>
    <hr style="margin:4px 0">
    <b>🗺️ 11 Desa:</b><br>
    Cabeyan • Gadon • Getas • Jipang • Kapuan<br>
    Kentong • Mernung • Mulyorejo • Ngloram<br>
    Ngroto • Sumberpitu<br><br>
    <b>🏙️ 6 Kelurahan:</b><br>
    Balun • Cepu • Karangboyo • Ngelo<br>
    Nglanjuk • Tambakromo
  `);
  
  state.validationCircles.push(cepuCircle);

  const padanganCircle = L.circle([-7.148, 111.640], {
    radius: 4500,
    color: '#7e57c2',
    weight: 2,
    fillColor: '#7e57c2',
    fillOpacity: 0.08,
    dashArray: '8,6'
  }).addTo(state.map).bindPopup(`
    <b>KECAMATAN PADANGAN</b><br>
    <hr style="margin:4px 0">
    <b>🗺️ 16 Desa:</b><br>
    Banjarejo • Cendono • Dengok • Kebonagung<br>
    Kendung • Kuncen • Ngasinan • Ngeper<br>
    Ngradin • Nguken • Padangan • Prangi<br>
    Purworejo • Sidorejo • Sonorejo • Tebon
  `);
  
  state.validationCircles.push(padanganCircle);
  
  setTimeout(() => {
    if (state.map) {
      state.map.invalidateSize();
    }
  }, 100);
}

/* ═══════════════════ RENDER MARKERS (REAL-TIME COLOR) ═══════════════════ */
function renderMarkersFromData(data) {
  console.log('🔍 [DEBUG] renderMarkersFromData called');
  console.log('📊 Data length:', data?.length || 0);
  console.log('🎯 Active filters:', Array.from(state.activeFilters));
  
  if (!state.map) {
    console.error('❌ Map not initialized!');
    return;
  }
  
  state.markers.forEach(m => {
    if (state.map) state.map.removeLayer(m);
  });
  state.markers = [];
  
  if (!data || !data.length) {
    console.warn('⚠️ No data to render');
    updateMapInfo(0);
    return;
  }
  
  const filteredData = state.activeFilters.size > 0 
    ? data.filter(item => state.activeFilters.has(item.kategori))
    : data;
  
  console.log('📊 Filtered data length:', filteredData.length);
  
  if (filteredData.length === 0) {
    updateMapInfo(0);
    if (state.activeFilters.size > 0) {
      showToast('Tidak ada laporan untuk kategori yang dipilih', 'info');
    }
    return;
  }
  
  let successCount = 0;
  filteredData.forEach((item, index) => {
    console.log(`📍 Item ${index}:`, item);
    
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    
    console.log(`   Lat: ${lat}, Lng: ${lng}, Type: ${typeof lat}`);
    
    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`⚠️ Invalid coordinates for item ${index}:`, item);
      return;
    }
    
    if (lat === 0 && lng === 0) {
      console.warn(`⚠️ Zero coordinates for item ${index}`);
      return;
    }
    
    const kat = item.kategori || 'lainnya';
    const color = CAT_COLORS[kat] || '#90a4ae';
    const sev = item.severity === 'tinggi' ? 3 : (item.severity === 'sedang' ? 2 : 1);
    const size = sev === 3 ? 28 : sev === 2 ? 20 : 14;
    
    console.log(`   ✅ Creating marker: ${kat}, color: ${color}, size: ${size}`);
    
    const icon = L.divIcon({
      html: `
        <div style="
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          background:${color};
          border:3px solid rgba(255,255,255,0.9);
          box-shadow: 0 0 ${size}px ${color}, 0 0 ${size * 2}px ${color}55;
          animation: pulseMarker 2s infinite;
          transition: all 0.3s ease;
          cursor: pointer;
        ">
          <span style="position:absolute;top:-8px;right:-8px;font-size:8px;background:rgba(0,0,0,0.7);color:white;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.3);">${index + 1}</span>
        </div>
      `,
      className: 'custom-marker',
      iconAnchor: [size / 2, size / 2]
    });
    
    try {
      const marker = L.marker([lat, lng], { icon });
      
      marker.bindPopup(`
        <div style="min-width:200px;padding:4px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:12px;height:12px;border-radius:50%;background:${color};"></div>
            <strong style="color:${color}">${CAT_LABELS[kat] || kat}</strong>
            <span style="margin-left:auto;font-size:10px;background:${color}22;padding:2px 8px;border-radius:12px;color:${color};">
              ${sev === 3 ? '🔴 TINGGI' : sev === 2 ? '🟡 SEDANG' : '🟢 RENDAH'}
            </span>
          </div>
          <div style="font-size:12px;color:var(--tx2);">
            <i class="fas fa-map-marker-alt" style="margin-right:4px;opacity:0.6;"></i>
            ${escapeHtml(item.lokasi || '-')}
          </div>
          <div style="font-size:11px;color:var(--tx3);margin-top:4px;">
            <i class="far fa-calendar-alt" style="margin-right:4px;"></i>
            ${item.tanggal_kejadian || ''}
          </div>
          <div style="margin-top:6px;font-size:10px;color:var(--tx3);">
            ✅ Terverifikasi · ${item.kecamatan || '-'}
          </div>
        </div>
      `);
      
      marker.addTo(state.map);
      state.markers.push(marker);
      successCount++;
      
    } catch (err) {
      console.error(`❌ Error creating marker ${index}:`, err);
    }
  });
  
  console.log(`✅ Successfully created ${successCount} markers`);
  updateMapInfo(state.markers.length);
  
  if (state.activeFilters.size > 0 && successCount > 0) {
    const filterNames = Array.from(state.activeFilters).map(f => CAT_LABELS[f]).join(', ');
    showToast(`${successCount} laporan ditampilkan (${filterNames})`, 'success');
  }
}

/* ═══════════════════ MAP INFO & FILTER HELPERS ═══════════════════ */
function updateMapInfo(count) {
  let info = document.getElementById('map-info');
  if (!info) {
    info = document.createElement('div');
    info.id = 'map-info';
    document.getElementById('map').appendChild(info);
  }
  
  if (count > 0) {
    info.style.display = 'block';
    let filterText = '';
    if (state.activeFilters.size > 0) {
      filterText = ` · Filter: ${Array.from(state.activeFilters).map(f => CAT_LABELS[f]).join(', ')}`;
    }
    info.innerHTML = `
      <i class="fas fa-map-marker-alt" style="color:var(--accent);margin-right:6px;"></i>
      Menampilkan <strong style="color:var(--tx1);">${count}</strong> laporan${filterText}
    `;
  } else {
    info.style.display = 'none';
  }
}

function updateFilterCounts(data) {
  document.querySelectorAll('.filter-chip[data-category]').forEach(el => {
    const cat = el.dataset.category;
    if (cat) {
      const count = data.filter(d => d.kategori === cat).length;
      let badge = el.querySelector('.count-badge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
      } else if (count > 0) {
        el.innerHTML += ` <span class="count-badge">${count}</span>`;
      }
    }
  });
}

function resetFilters() {
  state.activeFilters.clear();
  document.querySelectorAll('.filter-chip').forEach(el => {
    el.classList.remove('active');
    el.style.transform = 'scale(1)';
  });
  renderMarkersFromData(state.allData);
  showToast('Semua filter direset', 'info');
}

function quickFilter(kategori) {
  if (!kategori) return;
  
  state.activeFilters.clear();
  document.querySelectorAll('.filter-chip').forEach(el => {
    el.classList.remove('active');
    el.style.transform = 'scale(1)';
  });
  
  state.activeFilters.add(kategori);
  const chips = document.querySelectorAll('.filter-chip[data-category]');
  chips.forEach(el => {
    if (el.dataset.category === kategori) {
      el.classList.add('active');
      el.style.transform = 'scale(1.05)';
    }
  });
  
  renderMarkersFromData(state.allData);
  showToast(`Filter: ${CAT_LABELS[kategori]}`, 'success');
}

/* ═══════════════════ FILTERS & LEGEND ═══════════════════ */
function initFilters() {
  const container = document.getElementById('filter-chips');
  if (!container) return;
  container.innerHTML = '';

  CATS.forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.category = k;
    btn.innerHTML = `<i class="fas ${CAT_ICONS[k]}"></i> ${CAT_LABELS[k]}`;
    
    const count = state.allData.filter(d => d.kategori === k).length;
    if (count > 0) {
      btn.innerHTML += ` <span class="count-badge">${count}</span>`;
    }
    
    btn.onclick = () => {
      if (state.activeFilters.has(k)) {
        state.activeFilters.delete(k);
        btn.classList.remove('active');
        btn.style.transform = 'scale(1)';
      } else {
        state.activeFilters.add(k);
        btn.classList.add('active');
        btn.style.transform = 'scale(1.05)';
        showToast(`Menampilkan: ${CAT_LABELS[k]}`, 'info');
      }
      
      renderMarkersFromData(state.allData);
      
      if (state.currentPanel === 'statistik') {
        renderStatistik();
      }
    };
    
    container.appendChild(btn);
  });
  
  const resetBtn = document.createElement('button');
  resetBtn.className = 'filter-reset-btn';
  resetBtn.innerHTML = '<i class="fas fa-undo"></i> Reset Filter';
  resetBtn.onclick = resetFilters;
  container.appendChild(resetBtn);
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

/* ═══════════════════ RIWAYAT & STATISTIK ═══════════════════ */
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
  const tinggi  = data.filter(d => d.severity === 'tinggi').length;
  const sedang  = data.filter(d => d.severity === 'sedang').length;
  const rendah  = data.filter(d => d.severity === 'rendah').length;
  const totalCepu     = data.filter(d => d.kecamatan === 'cepu').length;
  const totalPadangan = data.filter(d => d.kecamatan === 'padangan').length;
  const maxKec = Math.max(totalCepu, totalPadangan, 1);

  container.innerHTML = `
    <div class="animate-in">
      <div class="chart-container glass-light">
        <div class="widget-title">Distribusi Kategori</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-top:18px;">
          ${CATS.map(k => {
            const pct = total > 0 ? ((catCounts[k] / total) * 100).toFixed(0) : 0;
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
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;letter-spacing:0.5px;">TINGGI</div>
          </div>
          <div style="padding:14px 10px;background:rgba(255,202,40,0.12);border-radius:14px;border:2px solid #ffca28;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#ffca28;">${sedang}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;letter-spacing:0.5px;">SEDANG</div>
          </div>
          <div style="padding:14px 10px;background:rgba(102,187,106,0.12);border-radius:14px;border:2px solid #66bb6a;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#66bb6a;">${rendah}</div>
            <div style="font-size:10px;color:var(--tx3);margin-top:4px;font-weight:700;letter-spacing:0.5px;">RENDAH</div>
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
window.focusCategory = focusCategory;
window.resetFilters = resetFilters;
window.quickFilter = quickFilter;
