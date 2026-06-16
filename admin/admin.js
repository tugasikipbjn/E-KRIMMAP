'use strict';

// ==================== CONSTANTS ====================
const ADMIN_PASS = 'admin123';

const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbxan7JrR9PcA6wKQQcG2y4UCqOaKN5A1SojQF2ktV6gCG8mDxAdSq001Lmwhwj1L-P5/exec';

const CATEGORIES = ['pencurian', 'kekerasan', 'narkoba', 'penipuan', 'pembunuhan', 'lainnya'];
const CAT_LABELS = {
  pencurian: 'Pencurian', kekerasan: 'Kekerasan', narkoba: 'Narkoba',
  penipuan: 'Penipuan', pembunuhan: 'Pembunuhan', lainnya: 'Lainnya'
};
const CAT_COLORS = {
  pencurian: '#f59e0b', kekerasan: '#ef4444', narkoba: '#8b5cf6',
  penipuan: '#10b981', pembunuhan: '#dc2626', lainnya: '#64748b'
};
const RISK_LABELS = { 1: 'Rendah', 2: 'Sedang', 3: 'Tinggi' };
const RISK_COLORS = { 1: '#10b981', 2: '#f59e0b', 3: '#ef4444' };

let dataStore = [];
let reportsStore = [];
let editingId = null;
let currentTab = 'dashboard';
let isAdmin = false;
let syncInterval = null;

// ==================== GOOGLE SHEETS API ====================
async function fetchFromSheet(action, params = {}) {
  try {
    const url = new URL(GOOGLE_SHEET_API_URL);
    url.searchParams.append('action', action);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });
    url.searchParams.append('_t', Date.now());
    
    console.log(`📡 Fetching ${action}:`, url.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    console.log(`✅ ${action} result:`, result);
    return result;
    
  } catch (error) {
    console.warn(`Fetch error for ${action}:`, error);
    return { success: false, error: error.message, data: [] };
  }
}

async function postToSheet(data) {
  try {
    const url = new URL(GOOGLE_SHEET_API_URL);
    Object.entries(data).forEach(([k, v]) => {
      url.searchParams.append(k, (v !== null && v !== undefined) ? v : '');
    });
    
    console.log('📤 POST to:', url.toString());
    
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    return await response.json();
  } catch (error) {
    console.warn('Post error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== SYNC DATA ====================
async function syncDataFromSheet() {
  showLoading(true);
  console.log('🔄 Starting sync...');
  
  try {
    // Ambil data verified
    const result = await fetchFromSheet('getVerified');
    console.log('getVerified result:', result);
    
    if (result.success && result.data && Array.isArray(result.data)) {
      dataStore = result.data.map(row => ({
        id: row.id || `row_${row.rowNumber || Math.random()}`,
        judul: `${CAT_LABELS[row.kategori] || 'Kejadian'} di ${row.lokasi}`,
        kategori: row.kategori || 'lainnya',
        lokasi: row.lokasi || '-',
        kecamatan: row.kecamatan || 'cepu',
        tanggal: row.tanggal_kejadian || new Date().toISOString().split('T')[0],
        severity: row.severity === 'tinggi' ? 3 : (row.severity === 'sedang' ? 2 : 1),
        deskripsi: row.deskripsi || '',
        source: row.sumber || 'Web',
        status: row.status || 'verified',
        rowNumber: row.rowNumber,
        latitude: row.latitude,
        longitude: row.longitude,
        timestamp: row.timestamp || new Date().toISOString()
      }));
      console.log(`✅ Loaded ${dataStore.length} verified records`);
    } else {
      dataStore = [];
    }
    
    // Ambil data pending
    const pendingResult = await fetchFromSheet('getPending');
    console.log('getPending result:', pendingResult);
    
    if (pendingResult.success && pendingResult.data && Array.isArray(pendingResult.data)) {
      reportsStore = pendingResult.data.map(row => ({
        id: `pending_${row.rowNumber || Math.random()}`,
        kategori: row.kategori || 'lainnya',
        kecamatan: row.kecamatan || 'cepu',
        lokasi: row.lokasi || '-',
        tanggal: row.tanggal_kejadian || new Date().toISOString().split('T')[0],
        deskripsi: row.deskripsi || '',
        pelapor: row.nama || 'Anonim',
        kontak: row.kontak || '-',
        severity: row.severity === 'tinggi' ? 3 : (row.severity === 'sedang' ? 2 : 1),
        status: row.status || 'pending',
        submitted: row.timestamp || new Date().toISOString(),
        rowNumber: row.rowNumber,
        latitude: row.latitude,
        longitude: row.longitude
      }));
      console.log(`✅ Loaded ${reportsStore.length} pending reports`);
    } else {
      reportsStore = [];
    }
    
    renderCurrentTab();
    
    if (dataStore.length === 0 && reportsStore.length === 0) {
      showToast('Tidak ada data. Pastikan Google Apps Script sudah dideploy dengan benar.', 'warning');
    } else {
      showToast(`Sync selesai: ${dataStore.length} terverifikasi, ${reportsStore.length} pending`, 'success');
    }
    
  } catch (error) {
    console.error('Sync error:', error);
    showToast('Gagal sinkronisasi: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ==================== VERIFIKASI ====================
async function approveReport(id) {
  const report = reportsStore.find(r => r.id === id);
  if (!report) {
    showToast('Laporan tidak ditemukan', 'error');
    return;
  }
  
  if (!confirm(`Setujui laporan ini?\n\nKategori: ${CAT_LABELS[report.kategori] || report.kategori}\nLokasi: ${report.lokasi}\nPelapor: ${report.pelapor}`)) {
    return;
  }
  
  showLoading(true);
  try {
    // Update status di sheet
    if (report.rowNumber) {
      const result = await postToSheet({ 
        action: 'updateStatus', 
        rowNumber: report.rowNumber, 
        status: 'verified' 
      });
      console.log('Approve result:', result);
    }
    
    // Kirim notifikasi ke user (via API jika ada)
    // Tampilkan notifikasi sukses
    await syncDataFromSheet();
    showToast(`✅ Laporan ${CAT_LABELS[report.kategori]} telah diverifikasi dan ditambahkan ke data kejadian`, 'success');
    
  } catch (error) {
    console.error('Approve error:', error);
    showToast('Gagal menyetujui: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function rejectReport(id) {
  const report = reportsStore.find(r => r.id === id);
  if (!report) {
    showToast('Laporan tidak ditemukan', 'error');
    return;
  }
  
  if (!confirm(`Tolak laporan ini?\n\nKategori: ${CAT_LABELS[report.kategori] || report.kategori}\nLokasi: ${report.lokasi}\n\nLaporan akan dihapus.`)) {
    return;
  }
  
  showLoading(true);
  try {
    // Hapus dari sheet
    if (report.rowNumber) {
      await postToSheet({ action: 'delete', rowNumber: report.rowNumber });
    }
    
    await syncDataFromSheet();
    showToast(`Laporan ${CAT_LABELS[report.kategori]} ditolak dan dihapus`, 'warning');
    
  } catch (error) {
    console.error('Reject error:', error);
    showToast('Gagal menolak: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteReport(id) {
  if (!confirm('Hapus laporan ini dari sistem?')) return;
  showLoading(true);
  try {
    const report = reportsStore.find(r => r.id === id);
    if (report?.rowNumber) {
      await postToSheet({ action: 'delete', rowNumber: report.rowNumber });
    }
    await syncDataFromSheet();
    showToast('Laporan dihapus', 'warning');
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Gagal menghapus', 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteData(id) {
  if (!confirm('Hapus data ini?')) return;
  showLoading(true);
  try {
    const item = dataStore.find(d => d.id === id);
    if (item?.rowNumber) {
      await postToSheet({ action: 'delete', rowNumber: item.rowNumber });
    }
    await syncDataFromSheet();
    showToast('Data dihapus', 'warning');
  } catch (error) {
    console.error('Delete error:', error);
    showToast('Gagal menghapus', 'error');
  } finally {
    showLoading(false);
  }
}

// ==================== RENDER FUNCTIONS ====================
function renderCurrentTab() {
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'reports') renderReportsTable();
  else if (currentTab === 'data') renderDataTable();
  else if (currentTab === 'statistics') renderStatistics();
}

function renderDashboard() {
  const data = dataStore || [];
  const reports = reportsStore || [];
  
  document.getElementById('statTotal').textContent = data.length + reports.length;
  document.getElementById('statPending').textContent = reports.length;
  document.getElementById('statProcessed').textContent = data.filter(d => d.severity === 3).length;
  document.getElementById('statCompleted').textContent = data.length;
  
  const kecamatanData = {
    cepu: data.filter(d => d.kecamatan === 'cepu').length,
    padangan: data.filter(d => d.kecamatan === 'padangan').length
  };
  const maxKec = Math.max(kecamatanData.cepu, kecamatanData.padangan, 1);
  
  const kecChart = document.getElementById('kecamatanChart');
  if (kecChart) {
    kecChart.innerHTML = `
      <div class="bar-item"><div class="bar-label">Cepu</div><div class="bar-fill-container"><div class="bar-fill" style="width: ${(kecamatanData.cepu / maxKec) * 100}%">${kecamatanData.cepu}</div></div><div class="bar-value">${kecamatanData.cepu}</div></div>
      <div class="bar-item"><div class="bar-label">Padangan</div><div class="bar-fill-container"><div class="bar-fill" style="width: ${(kecamatanData.padangan / maxKec) * 100}%">${kecamatanData.padangan}</div></div><div class="bar-value">${kecamatanData.padangan}</div></div>
    `;
  }
  
  const categoryCounts = {};
  CATEGORIES.forEach(cat => { categoryCounts[cat] = data.filter(d => d.kategori === cat).length; });
  const totalCat = data.length || 1;

  const categoryChart = document.getElementById('categoryChart');
  if (categoryChart) {
    const cx = 70, cy = 70, r = 55, stroke = 28;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    const slices = CATEGORIES.map(cat => {
      const count = categoryCounts[cat];
      const pct = count / totalCat;
      const dash = pct * circumference;
      const slice = { cat, count, pct, dash, offset };
      offset += dash;
      return slice;
    }).filter(s => s.count > 0);

    const svgSlices = slices.map(s => `
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none"
        stroke="${CAT_COLORS[s.cat]}"
        stroke-width="${stroke}"
        stroke-dasharray="${s.dash} ${circumference - s.dash}"
        stroke-dashoffset="${-s.offset}"
        transform="rotate(-90 ${cx} ${cy})"
      />`).join('');

    const legendHtml = CATEGORIES.map(cat => {
      const count = categoryCounts[cat];
      const pct = ((count / totalCat) * 100).toFixed(0);
      return `<div class="legend-item">
        <div class="legend-color" style="background:${CAT_COLORS[cat]}"></div>
        <div class="legend-label">${CAT_LABELS[cat]}</div>
        <div class="legend-value">${count} (${pct}%)</div>
      </div>`;
    }).join('');

    categoryChart.innerHTML = `
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
        <svg width="140" height="140" viewBox="0 0 140 140" style="flex-shrink:0;">
          ${data.length === 0
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${stroke}"/>`
            : svgSlices}
          <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="18" font-weight="800" fill="#1e293b">${totalCat}</text>
          <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" fill="#64748b">TOTAL</text>
        </svg>
        <div class="pie-legend" style="flex:1;">${legendHtml}</div>
      </div>`;
  }
  
  const kecList = document.getElementById('kecamatanList');
  if (kecList) {
    kecList.innerHTML = `
      <div class="kecamatan-badge"><span class="kecamatan-name">Cepu</span><span class="kecamatan-count">${kecamatanData.cepu}</span></div>
      <div class="kecamatan-badge"><span class="kecamatan-name">Padangan</span><span class="kecamatan-count">${kecamatanData.padangan}</span></div>
    `;
  }
}

function renderReportsTable() {
  const searchInput = document.getElementById('reportSearch');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  let filtered = (reportsStore || []).filter(r => r.status === 'pending');
  
  if (search) {
    filtered = filtered.filter(r => 
      (r.lokasi || '').toLowerCase().includes(search) || 
      (r.pelapor || '').toLowerCase().includes(search) ||
      (CAT_LABELS[r.kategori] || '').toLowerCase().includes(search)
    );
  }
  
  const tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">✨ Tidak ada laporan pending</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><span class="status-badge" style="background:${CAT_COLORS[r.kategori] || '#64748b'}20;color:${CAT_COLORS[r.kategori] || '#64748b'}">${CAT_LABELS[r.kategori] || r.kategori}</span></td>
      <td>${escapeHtml(r.lokasi || '-')}</td>
      <td>${capitalize(r.kecamatan || '')}</td>
      <td>${r.tanggal || '-'}</td>
      <td>${escapeHtml(r.pelapor || 'Anonim')}</td>
      <td><span class="status-badge status-pending">⏳ PENDING</span></td>
      <td class="action-buttons">
        <button class="btn-icon" onclick="approveReport('${r.id}')" style="background:${CAT_COLORS[r.kategori] || '#10b981'}20;color:${CAT_COLORS[r.kategori] || '#10b981'};border-color:${CAT_COLORS[r.kategori] || '#10b981'};">
          <i class="fas fa-check-circle"></i> Verifikasi
        </button>
        <button class="btn-icon danger" onclick="rejectReport('${r.id}')">
          <i class="fas fa-times-circle"></i> Tolak
        </button>
      </td>
    </tr>
  `).join('');
}

function renderDataTable() {
  const searchInput = document.getElementById('dataSearch');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  let filtered = [...(dataStore || [])];
  
  if (search) {
    filtered = filtered.filter(d => 
      (d.judul || '').toLowerCase().includes(search) || 
      (d.lokasi || '').toLowerCase().includes(search) ||
      (CAT_LABELS[d.kategori] || '').toLowerCase().includes(search)
    );
  }
  
  const tbody = document.getElementById('dataTableBody');
  if (!tbody) return;
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">📭 Tidak ada data terverifikasi</td></tr>';
    return;
  }
  
  const riskIcons = { 1: '🟢', 2: '🟠', 3: '🔴' };
  
  tbody.innerHTML = filtered.map(d => `
    <tr>
      <td><span class="status-badge" style="background:${CAT_COLORS[d.kategori] || '#64748b'}20;color:${CAT_COLORS[d.kategori] || '#64748b'}">${CAT_LABELS[d.kategori] || d.kategori}</span></td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(d.judul || '-')}</td>
      <td>${escapeHtml(d.lokasi || '-')}</td>
      <td>${capitalize(d.kecamatan || '')}</td>
      <td>${d.tanggal || '-'}</td>
      <td>${riskIcons[d.severity] || '🟡'} ${RISK_LABELS[d.severity] || 'Sedang'}</td>
      <td class="action-buttons">
        <button class="btn-icon" onclick="editData('${d.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-icon danger" onclick="deleteData('${d.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function renderStatistics() {
  const container = document.getElementById('statistikContent');
  if (!container) return;
  
  const data = dataStore || [];
  const pendingCount = reportsStore.filter(r => r.status === 'pending').length;
  const catCounts = {};
  CATEGORIES.forEach(c => catCounts[c] = data.filter(d => d.kategori === c).length);
  const maxCount = Math.max(...Object.values(catCounts), 1);

  const totalTinggi  = data.filter(d => d.severity === 3).length;
  const totalSedang  = data.filter(d => d.severity === 2).length;
  const totalRendah  = data.filter(d => d.severity === 1).length;
  const totalCepu    = data.filter(d => d.kecamatan === 'cepu').length;
  const totalPadangan= data.filter(d => d.kecamatan === 'padangan').length;
  const maxKec       = Math.max(totalCepu, totalPadangan, 1);

  container.innerHTML = `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Status Laporan</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div style="padding:20px;background:rgba(255,215,0,0.12);border-radius:16px;border:2px solid #ffd700;text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#ffd700;">${pendingCount}</div>
            <div style="font-size:10px;color:#64748b;">PENDING</div>
          </div>
          <div style="padding:20px;background:rgba(16,185,129,0.12);border-radius:16px;border:2px solid #10b981;text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#10b981;">${data.length}</div>
            <div style="font-size:10px;color:#64748b;">VERIFIED</div>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Ringkasan</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div style="padding:20px;background:rgba(59,130,246,0.1);border-radius:16px;border:2px solid #3b82f6;text-align:center;">
            <div style="font-size:36px;font-weight:800;color:#3b82f6;">${data.length + pendingCount}</div>
            <div style="font-size:11px;color:#64748b;">TOTAL LAPORAN</div>
          </div>
          <div style="padding:20px;background:rgba(239,68,68,0.1);border-radius:16px;border:2px solid #ef4444;text-align:center;">
            <div style="font-size:36px;font-weight:800;color:#ef4444;">${totalTinggi}</div>
            <div style="font-size:11px;color:#64748b;">RISIKO TINGGI</div>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Distribusi Kategori (Verified)</div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${CATEGORIES.map(k => `
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:90px;font-size:12px;font-weight:600;">${CAT_LABELS[k]}</div>
              <div style="flex:1;height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;">
                <div style="width:${(catCounts[k] / maxCount) * 100}%;height:100%;background:${CAT_COLORS[k]};border-radius:5px;"></div>
              </div>
              <div style="width:35px;text-align:right;font-size:12px;font-weight:700;">${catCounts[k]}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Per Kecamatan (Verified)</div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:90px;font-size:12px;font-weight:600;">Cepu</div>
            <div style="flex:1;height:14px;background:#f1f5f9;border-radius:7px;overflow:hidden;">
              <div style="width:${(totalCepu / maxKec) * 100}%;height:100%;background:#4fc3f7;border-radius:7px;"></div>
            </div>
            <div style="width:35px;text-align:right;font-size:12px;font-weight:700;">${totalCepu}</div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:90px;font-size:12px;font-weight:600;">Padangan</div>
            <div style="flex:1;height:14px;background:#f1f5f9;border-radius:7px;overflow:hidden;">
              <div style="width:${(totalPadangan / maxKec) * 100}%;height:100%;background:#7e57c2;border-radius:7px;"></div>
            </div>
            <div style="width:35px;text-align:right;font-size:12px;font-weight:700;">${totalPadangan}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==================== CRUD ====================
async function saveModal() {
  const judul = document.getElementById('modalJudul')?.value.trim();
  const lokasi = document.getElementById('modalLokasi')?.value.trim();
  
  if (!judul || !lokasi) {
    showToast('Judul dan lokasi wajib diisi', 'error');
    return;
  }
  
  showLoading(true);
  
  const severityMap = { '1': 'rendah', '2': 'sedang', '3': 'tinggi' };
  const selectedRisk = document.getElementById('modalRisiko')?.value || '2';
  
  const formData = {
    action: 'create',
    nama: 'Admin',
    kontak: '-',
    kategori: document.getElementById('modalKategori')?.value || 'lainnya',
    kecamatan: document.getElementById('modalKecamatan')?.value || 'cepu',
    lokasi: lokasi,
    deskripsi: document.getElementById('modalDeskripsi')?.value || '',
    tanggal_kejadian: document.getElementById('modalTanggal')?.value || new Date().toISOString().split('T')[0],
    severity: severityMap[selectedRisk],
    sumber: 'Admin',
    status: 'verified'
  };
  
  try {
    const result = await postToSheet(formData);
    console.log('Save result:', result);
    
    if (result && result.success) {
      await syncDataFromSheet();
      closeModal();
      showToast(editingId ? 'Data diupdate' : 'Data ditambahkan', 'success');
    } else {
      showToast('Gagal menyimpan: ' + ((result && result.error) || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showToast('Gagal menyimpan: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ==================== UI ====================
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}

function showLoading(show) {
  const loader = document.getElementById('loadingOverlay');
  if (loader) loader.classList.toggle('show', show);
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''; }
function escapeHtml(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

function openLogin() {
  document.getElementById('loginOverlay').classList.add('show');
}

function closeLogin() {
  document.getElementById('loginOverlay').classList.remove('show');
}

function doLogin() {
  const input = document.getElementById('adminPassword');
  const error = document.getElementById('loginError');
  
  if (input && input.value === ADMIN_PASS) {
    isAdmin = true;
    closeLogin();
    document.getElementById('adminContainer').style.display = 'flex';
    initAdminPanel();
    showToast('Login berhasil!', 'success');
  } else {
    if (error) error.style.display = 'block';
    if (input) input.value = '';
    setTimeout(() => { if (error) error.style.display = 'none'; }, 3000);
  }
}

function doLogout() {
  isAdmin = false;
  if (syncInterval) clearInterval(syncInterval);
  document.getElementById('adminContainer').style.display = 'none';
  openLogin();
  showToast('Logout berhasil', 'warning');
}

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Tambah Kejadian';
  document.getElementById('modalJudul').value = '';
  document.getElementById('modalKategori').value = 'pencurian';
  document.getElementById('modalLokasi').value = '';
  document.getElementById('modalKecamatan').value = 'cepu';
  document.getElementById('modalTanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('modalRisiko').value = '2';
  document.getElementById('modalDeskripsi').value = '';
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  editingId = null;
}

function editData(id) {
  const data = dataStore.find(d => d.id === id);
  if (data) {
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Kejadian';
    document.getElementById('modalJudul').value = data.judul || '';
    document.getElementById('modalKategori').value = data.kategori || 'pencurian';
    document.getElementById('modalLokasi').value = data.lokasi || '';
    document.getElementById('modalKecamatan').value = data.kecamatan || 'cepu';
    document.getElementById('modalTanggal').value = data.tanggal || '';
    document.getElementById('modalRisiko').value = data.severity || 2;
    document.getElementById('modalDeskripsi').value = data.deskripsi || '';
    document.getElementById('modalOverlay').style.display = 'flex';
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.tab === tab) item.classList.add('active');
  });
  
  document.getElementById('dashboardTab').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('reportsTab').style.display = tab === 'reports' ? 'block' : 'none';
  document.getElementById('statisticsTab').style.display = tab === 'statistics' ? 'block' : 'none';
  document.getElementById('dataTab').style.display = tab === 'data' ? 'block' : 'none';
  
  renderCurrentTab();
  
  if (window.innerWidth <= 1024) {
    closeMobileMenu();
  }
}

function closeMobileMenu() {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.getElementById('mobileOverlay')?.classList.remove('active');
}

function openMobileMenu() {
  document.querySelector('.sidebar')?.classList.add('mobile-open');
  document.getElementById('mobileOverlay')?.classList.add('active');
}

async function initAdminPanel() {
  showLoading(true);
  try {
    await syncDataFromSheet();
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => { if (isAdmin) syncDataFromSheet(); }, 30000);
    switchTab('dashboard');
  } catch (error) {
    console.error('Init error:', error);
    showToast('Gagal memuat data', 'error');
  } finally {
    showLoading(false);
  }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  dataStore = [];
  reportsStore = [];
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
  
  document.getElementById('logoutBtn')?.addEventListener('click', doLogout);
  document.getElementById('addDataBtn')?.addEventListener('click', openAddModal);
  document.getElementById('reportSearch')?.addEventListener('input', () => renderReportsTable());
  document.getElementById('dataSearch')?.addEventListener('input', () => renderDataTable());
  document.getElementById('modalSaveBtn')?.addEventListener('click', saveModal);
  
  // Mobile Menu
  document.getElementById('mobileMenuToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const sidebar = document.querySelector('.sidebar');
    if (sidebar?.classList.contains('mobile-open')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });
  
  document.getElementById('mobileOverlay')?.addEventListener('click', closeMobileMenu);
  
  // Close mobile menu on nav item click
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 1024) closeMobileMenu();
    });
  });
  
  // Reset mobile menu on resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeMobileMenu();
  });
  
  openLogin();
});

// ==================== GLOBAL EXPORTS ====================
window.doLogin = doLogin;
window.doLogout = doLogout;
window.approveReport = approveReport;
window.rejectReport = rejectReport;
window.deleteReport = deleteReport;
window.deleteData = deleteData;
window.editData = editData;
window.openAddModal = openAddModal;
window.closeModal = closeModal;
window.saveModal = saveModal;
window.switchTab = switchTab;
window.syncDataFromSheet = syncDataFromSheet;
