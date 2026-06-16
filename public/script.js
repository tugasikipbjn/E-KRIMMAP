// ==================== KONFIGURASI ====================
// GANTI DENGAN URL DEPLOY GAS ANDA
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycby6mZMrNI8E1H_fh3SSi8SX6fF2kvUsV3BBiAUg9m5nLYuTOEtwD2OPgRiSOG1AjQHL/exec';

const CAT_COLORS = {
  pembunuhan: '#ef5350',
  pencurian: '#ffa726',
  narkoba: '#ab47bc',
  kekerasan: '#ffca28',
  penipuan: '#66bb6a',
  lainnya: '#90a4ae'
};

const CAT_LABELS = {
  pembunuhan: 'Pembunuhan',
  pencurian: 'Pencurian',
  narkoba: 'Narkoba',
  kekerasan: 'Kekerasan',
  penipuan: 'Penipuan',
  lainnya: 'Lainnya'
};

const CATS = ['pembunuhan', 'pencurian', 'narkoba', 'kekerasan', 'penipuan', 'lainnya'];
const CAT_ICONS = {
  pembunuhan: 'fa-skull',
  pencurian: 'fa-mask',
  narkoba: 'fa-pills',
  kekerasan: 'fa-hand-fist',
  penipuan: 'fa-comments-dollar',
  lainnya: 'fa-circle-question'
};

// ==================== STATE ====================
let state = {
  map: null,
  markers: [],
  allData: [],
  activeFilters: new Set(),
  isMapReady: false
};

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Document loaded');
  
  var bar = document.getElementById('boot-bar');
  var msg = document.getElementById('boot-msg');
  var pct = 0;
  
  var interval = setInterval(function() {
    pct += Math.random() * 10 + 5;
    if (pct > 100) pct = 100;
    if (bar) bar.style.width = pct + '%';
    if (msg) {
      if (pct < 30) msg.textContent = 'Memuat modul...';
      else if (pct < 60) msg.textContent = 'Menghubungkan peta...';
      else if (pct < 90) msg.textContent = 'Memuat data...';
      else msg.textContent = 'Sistem siap!';
    }
    if (pct >= 100) {
      clearInterval(interval);
      setTimeout(function() {
        document.getElementById('boot').classList.add('out');
        document.getElementById('app').style.display = 'block';
        initApp();
      }, 500);
    }
  }, 100);
});

// ==================== INIT ====================
function initApp() {
  console.log('🚀 initApp() called');
  console.log('📦 Leaflet available:', typeof L !== 'undefined');
  
  if (typeof L === 'undefined') {
    console.error('❌ Leaflet not loaded!');
    showToast('Leaflet tidak terload, refresh halaman', 'error');
    return;
  }
  
  createMap();
  setupFilters();
  setupLegend();
  
  setTimeout(function() {
    loadData();
  }, 1000);
  
  setInterval(function() {
    loadData();
  }, 30000);
}

// ==================== MAP ====================
function createMap() {
  console.log('🗺️ Creating map...');
  
  var mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('❌ Map element not found!');
    return;
  }
  
  try {
    state.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([-7.147, 111.585], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CartoDB',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(state.map);
    
    L.control.zoom({
      position: 'bottomright'
    }).addTo(state.map);
    
    // Lingkaran Cepu
    L.circle([-7.147, 111.585], {
      radius: 4200,
      color: '#4fc3f7',
      weight: 2,
      fillColor: '#4fc3f7',
      fillOpacity: 0.1,
      dashArray: '8,6'
    }).addTo(state.map).bindPopup('<b>Kecamatan Cepu</b>');
    
    // Lingkaran Padangan
    L.circle([-7.148, 111.640], {
      radius: 4500,
      color: '#7e57c2',
      weight: 2,
      fillColor: '#7e57c2',
      fillOpacity: 0.1,
      dashArray: '8,6'
    }).addTo(state.map).bindPopup('<b>Kecamatan Padangan</b>');
    
    state.isMapReady = true;
    window._mapLoaded = true;
    
    setTimeout(function() {
      if (state.map) {
        state.map.invalidateSize();
        console.log('✅ Map resized');
      }
    }, 500);
    
    console.log('✅ Map created successfully');
    
  } catch (error) {
    console.error('❌ Error creating map:', error);
    showToast('Gagal membuat peta: ' + error.message, 'error');
  }
}

// ==================== LOAD DATA ====================
function loadData() {
  console.log('📡 Loading data...');
  
  var url = GOOGLE_SHEET_API_URL + '?action=getVerified&_t=' + Date.now();
  
  fetch(url, {
    method: 'GET',
    cache: 'no-store'
  })
  .then(function(response) {
    console.log('📥 Response status:', response.status);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  })
  .then(function(result) {
    console.log('📦 Result:', result);
    
    if (!result || !result.success) {
      console.warn('⚠️ API error:', result);
      return;
    }
    
    if (!Array.isArray(result.data) || result.data.length === 0) {
      console.warn('⚠️ No data');
      return;
    }
    
    console.log('✅ Received', result.data.length, 'records');
    
    var validData = result.data.filter(function(item) {
      var lat = parseFloat(item.latitude);
      var lng = parseFloat(item.longitude);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });
    
    console.log('📍 Valid coordinates:', validData.length);
    
    if (validData.length === 0) {
      showToast('Tidak ada data dengan koordinat valid', 'warn');
      return;
    }
    
    state.allData = validData;
    updateStats(validData);
    renderMarkers(validData);
    updateFilterCounts(validData);
    
    showToast(validData.length + ' laporan dimuat', 'success');
    
  })
  .catch(function(error) {
    console.error('❌ Fetch error:', error);
    showToast('Gagal memuat data: ' + error.message, 'error');
  });
}

// ==================== RENDER MARKERS ====================
function renderMarkers(data) {
  console.log('🎯 Rendering markers...');
  
  if (!state.map || !state.isMapReady) {
    console.warn('⚠️ Map not ready');
    return;
  }
  
  state.markers.forEach(function(m) {
    if (state.map) state.map.removeLayer(m);
  });
  state.markers = [];
  
  if (!data || data.length === 0) {
    updateMapInfo(0);
    return;
  }
  
  var filtered = state.activeFilters.size > 0
    ? data.filter(function(item) {
        return state.activeFilters.has(item.kategori);
      })
    : data;
  
  if (filtered.length === 0) {
    updateMapInfo(0);
    return;
  }
  
  filtered.forEach(function(item, index) {
    var lat = parseFloat(item.latitude);
    var lng = parseFloat(item.longitude);
    
    if (isNaN(lat) || isNaN(lng)) return;
    
    var kategori = item.kategori || 'lainnya';
    var color = CAT_COLORS[kategori] || '#90a4ae';
    var size = item.severity === 'tinggi' ? 28 : (item.severity === 'sedang' ? 20 : 14);
    
    var icon = L.divIcon({
      html: '<div style="' +
        'width:' + size + 'px;' +
        'height:' + size + 'px;' +
        'border-radius:50%;' +
        'background:' + color + ';' +
        'border:3px solid rgba(255,255,255,0.9);' +
        'box-shadow:0 0 ' + size + 'px ' + color + ',0 0 ' + (size * 2) + 'px ' + color + '55;' +
        'animation:pulseMarker 2s infinite;' +
        'cursor:pointer;' +
      '"></div>',
      className: '',
      iconAnchor: [size/2, size/2]
    });
    
    var marker = L.marker([lat, lng], { icon: icon });
    
    marker.bindPopup(
      '<div style="min-width:180px;">' +
        '<strong style="color:' + color + '">' + (CAT_LABELS[kategori] || kategori) + '</strong><br>' +
        '<small>' + (item.lokasi || '-') + '</small><br>' +
        '<small style="opacity:0.7;">' + (item.tanggal_kejadian || '') + '</small>' +
      '</div>'
    );
    
    marker.addTo(state.map);
    state.markers.push(marker);
  });
  
  updateMapInfo(state.markers.length);
  console.log('✅ Created', state.markers.length, 'markers');
}

// ==================== UPDATE MAP INFO ====================
function updateMapInfo(count) {
  var info = document.getElementById('map-info');
  if (!info) return;
  
  if (count > 0) {
    info.style.display = 'block';
    var filterText = '';
    if (state.activeFilters.size > 0) {
      filterText = ' · Filter: ' + Array.from(state.activeFilters).map(function(f) {
        return CAT_LABELS[f] || f;
      }).join(', ');
    }
    info.innerHTML = '📍 Menampilkan <strong>' + count + '</strong> laporan' + filterText;
  } else {
    info.style.display = 'none';
  }
}

// ==================== UPDATE STATS ====================
function updateStats(data) {
  document.getElementById('s-total').textContent = data.length;
  document.getElementById('s-tinggi').textContent = data.filter(function(d) {
    return d.severity === 'tinggi';
  }).length;
  document.getElementById('s-sedang').textContent = data.filter(function(d) {
    return d.severity === 'sedang';
  }).length;
  document.getElementById('s-cepu').textContent = data.filter(function(d) {
    return d.kecamatan === 'cepu';
  }).length;
}

// ==================== FILTERS ====================
function setupFilters() {
  var container = document.getElementById('filter-chips');
  if (!container) return;
  container.innerHTML = '';
  
  CATS.forEach(function(k) {
    var btn = document.createElement('button');
    btn.className = 'filter-chip';
    btn.dataset.category = k;
    btn.innerHTML = '<i class="fas ' + CAT_ICONS[k] + '"></i> ' + CAT_LABELS[k];
    
    btn.onclick = function() {
      if (state.activeFilters.has(k)) {
        state.activeFilters.delete(k);
        btn.classList.remove('active');
      } else {
        state.activeFilters.add(k);
        btn.classList.add('active');
      }
      renderMarkers(state.allData);
    };
    
    container.appendChild(btn);
  });
  
  var resetBtn = document.createElement('button');
  resetBtn.className = 'filter-reset-btn';
  resetBtn.innerHTML = '<i class="fas fa-undo"></i> Reset';
  resetBtn.onclick = function() {
    state.activeFilters.clear();
    document.querySelectorAll('.filter-chip').forEach(function(el) {
      el.classList.remove('active');
    });
    renderMarkers(state.allData);
  };
  container.appendChild(resetBtn);
}

function updateFilterCounts(data) {
  document.querySelectorAll('.filter-chip[data-category]').forEach(function(el) {
    var cat = el.dataset.category;
    if (cat) {
      var count = data.filter(function(d) { return d.kategori === cat; }).length;
      var badge = el.querySelector('.count-badge');
      if (badge) {
        badge.textContent = count;
      } else if (count > 0) {
        el.innerHTML += ' <span class="count-badge">' + count + '</span>';
      }
    }
  });
}

// ==================== LEGEND ====================
function setupLegend() {
  var container = document.getElementById('legend-items');
  if (!container) return;
  container.innerHTML = '';
  
  CATS.forEach(function(k) {
    var div = document.createElement('div');
    div.className = 'legend-item';
    div.style.cursor = 'pointer';
    div.innerHTML = 
      '<div class="legend-dot" style="background:' + CAT_COLORS[k] + ';color:' + CAT_COLORS[k] + ';"></div>' +
      '<span>' + CAT_LABELS[k] + '</span>';
    div.onclick = function() {
      quickFilter(k);
    };
    container.appendChild(div);
  });
}

// ==================== QUICK FILTER ====================
function quickFilter(kategori) {
  state.activeFilters.clear();
  document.querySelectorAll('.filter-chip').forEach(function(el) {
    el.classList.remove('active');
  });
  
  state.activeFilters.add(kategori);
  document.querySelectorAll('.filter-chip[data-category]').forEach(function(el) {
    if (el.dataset.category === kategori) {
      el.classList.add('active');
    }
  });
  
  renderMarkers(state.allData);
  showToast('Filter: ' + (CAT_LABELS[kategori] || kategori), 'info');
}

function focusCategory(type) {
  if (type === 'all') {
    state.activeFilters.clear();
    document.querySelectorAll('.filter-chip').forEach(function(el) {
      el.classList.remove('active');
    });
    renderMarkers(state.allData);
    return;
  }
  
  var found = CATS.find(function(c) {
    return c === type || CAT_LABELS[c] === type;
  });
  if (found) quickFilter(found);
}

// ==================== PANELS ====================
function switchTab(tab) {
  ['lapor', 'statistik', 'riwayat', 'info'].forEach(function(name) {
    closePanel(name);
  });
  closeNotifPanel();
  
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.remove('active');
  });
  var navItem = document.getElementById('nav-' + tab);
  if (navItem) navItem.classList.add('active');
  
  if (tab === 'peta') return;
  openPanel(tab);
  
  if (tab === 'statistik') renderStatistik();
  if (tab === 'riwayat') renderRiwayat();
}

function openPanel(name) {
  var panel = document.getElementById('panel-' + name);
  var overlay = document.getElementById('overlay-' + name);
  if (panel) panel.classList.add('open');
  if (overlay) overlay.classList.add('show');
}

function closePanel(name) {
  var panel = document.getElementById('panel-' + name);
  var overlay = document.getElementById('overlay-' + name);
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

function toggleSidebar() {
  var panel = document.getElementById('panel-riwayat');
  if (panel && panel.classList.contains('open')) {
    closePanel('riwayat');
  } else {
    openPanel('riwayat');
    renderRiwayat();
  }
}

// ==================== RIWAYAT ====================
function renderRiwayat() {
  var container = document.getElementById('riwayat-content');
  if (!container) return;
  
  var data = state.allData || [];
  
  if (data.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--tx3);">Belum ada laporan</div>';
    return;
  }
  
  container.innerHTML = data.map(function(item) {
    var kat = item.kategori || 'lainnya';
    var color = CAT_COLORS[kat] || '#90a4ae';
    var label = CAT_LABELS[kat] || kat;
    return '<div style="' +
      'margin-bottom:12px;padding:14px 16px;' +
      'background:var(--card-bg);border-radius:14px;' +
      'border-left:4px solid ' + color + ';' +
    '">' +
      '<div style="font-weight:700;font-size:13px;color:' + color + ';">' + label + '</div>' +
      '<div style="font-size:12px;color:var(--tx2);">' + (item.lokasi || '-') + '</div>' +
      '<div style="font-size:11px;color:var(--tx3);margin-top:4px;">' + (item.tanggal_kejadian || '') + '</div>' +
    '</div>';
  }).join('');
}

// ==================== STATISTIK ====================
function renderStatistik() {
  var container = document.getElementById('statistik-content');
  if (!container) return;
  
  var data = state.allData || [];
  var total = data.length;
  var tinggi = data.filter(function(d) { return d.severity === 'tinggi'; }).length;
  var sedang = data.filter(function(d) { return d.severity === 'sedang'; }).length;
  
  container.innerHTML = 
    '<div style="padding:20px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        '<div style="padding:20px;background:var(--accent-glow);border-radius:16px;text-align:center;">' +
          '<div style="font-size:36px;font-weight:800;color:var(--accent);">' + total + '</div>' +
          '<div style="font-size:11px;color:var(--tx3);">TOTAL</div>' +
        '</div>' +
        '<div style="padding:20px;background:var(--red-glow);border-radius:16px;text-align:center;">' +
          '<div style="font-size:36px;font-weight:800;color:var(--red);">' + tinggi + '</div>' +
          '<div style="font-size:11px;color:var(--tx3);">TINGGI</div>' +
        '</div>' +
        '<div style="padding:20px;background:rgba(255,202,40,0.12);border-radius:16px;text-align:center;">' +
          '<div style="font-size:36px;font-weight:800;color:#ffca28;">' + sedang + '</div>' +
          '<div style="font-size:11px;color:var(--tx3);">SEDANG</div>' +
        '</div>' +
        '<div style="padding:20px;background:rgba(102,187,106,0.12);border-radius:16px;text-align:center;">' +
          '<div style="font-size:36px;font-weight:800;color:#66bb6a;">' + (total - tinggi - sedang) + '</div>' +
          '<div style="font-size:11px;color:var(--tx3);">RENDAH</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// ==================== TOAST ====================
function showToast(msg, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  if (!container) return;
  
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  var icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-circle-xmark' : 'fa-triangle-exclamation');
  el.innerHTML = '<i class="fas ' + icon + '"></i><span>' + msg + '</span>';
  container.appendChild(el);
  
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(function() {
      if (el.parentNode) el.remove();
    }, 300);
  }, 4000);
}

// ==================== DUMMY FUNCTIONS ====================
function toggleTheme() {
  var theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'arctic');
    document.getElementById('theme-icon').className = 'fas fa-moon';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('theme-icon').className = 'fas fa-sun';
  }
}

function toggleAlerts() {
  var panel = document.getElementById('panel-notif');
  var overlay = document.getElementById('overlay-notif');
  if (panel) panel.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function closeNotifPanel() {
  var panel = document.getElementById('panel-notif');
  var overlay = document.getElementById('overlay-notif');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

function clearAllNotifications() {
  showToast('Notifikasi dibersihkan', 'info');
}

function refreshLocation() {
  showToast('Memperbarui lokasi...', 'info');
}

function submitLaporan() {
  showToast('Fitur laporan sedang dikembangkan', 'info');
}

// ==================== EXPOSE GLOBAL ====================
window.switchTab = switchTab;
window.openPanel = openPanel;
window.closePanel = closePanel;
window.toggleSidebar = toggleSidebar;
window.toggleAlerts = toggleAlerts;
window.closeNotifPanel = closeNotifPanel;
window.clearAllNotifications = clearAllNotifications;
window.submitLaporan = submitLaporan;
window.toggleTheme = toggleTheme;
window.refreshLocation = refreshLocation;
window.focusCategory = focusCategory;
window.quickFilter = quickFilter;

console.log('✅ E-KRIMMAP loaded');
console.log('🔧 Commands: loadData(), renderMarkers(state.allData)');
