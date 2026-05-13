// ============================================================
//  Attendance LIFF App
// ============================================================

let state = {
  userId: null,
  displayName: null,
  action: 'checkin',   // 'checkin' | 'checkout'
  lat: null,
  lng: null,
  accuracy: null,
  photoBase64: null,
  gpsReady: false,
};

// ==================== Init ====================

async function init() {
  try {
    // อ่าน action จาก query string (?action=checkin หรือ ?action=checkout)
    const params = new URLSearchParams(window.location.search);
    state.action = params.get('action') === 'checkout' ? 'checkout' : 'checkin';

    // ตั้งสีตาม action
    if (state.action === 'checkout') document.body.classList.add('checkout');

    // อัปเดต UI ก่อน init LIFF
    updateActionUI();
    startClock();

    // Init LIFF
    await liff.init({ liffId: CONFIG.LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    const profile = await liff.getProfile();
    state.userId = profile.userId;
    state.displayName = profile.displayName;
    document.getElementById('user-name').textContent = profile.displayName;

    showScreen('screen-main');

    // ขอ GPS
    requestGPS();

    // ตั้ง listener รูปภาพ
    document.getElementById('photo-input').addEventListener('change', handlePhoto);
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);

  } catch (err) {
    showError('ไม่สามารถเปิดได้', 'กรุณาเปิดลิงก์นี้ภายในแอป LINE\n\n(' + err.message + ')');
  }
}

// ==================== UI helpers ====================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(title, msg) {
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-msg').textContent = msg;
  showScreen('screen-error');
}

function updateActionUI() {
  const isCheckin = state.action === 'checkin';
  document.getElementById('action-icon').textContent  = isCheckin ? '🟢' : '🔴';
  document.getElementById('action-title').textContent  = isCheckin ? 'เช็คอิน' : 'เช็คเอาท์';
  document.getElementById('submit-label').textContent  = isCheckin ? 'เช็คอิน' : 'เช็คเอาท์';

  const successTitle = document.getElementById('success-title');
  if (successTitle) successTitle.textContent = isCheckin ? 'เช็คอิน สำเร็จ!' : 'เช็คเอาท์ สำเร็จ!';
}

function startClock() {
  const updateTime = () => {
    const now = new Date();
    document.getElementById('display-date').textContent = now.toLocaleDateString('th-TH', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    document.getElementById('display-time').textContent = now.toLocaleTimeString('th-TH');
  };
  updateTime();
  setInterval(updateTime, 1000);
}

function checkSubmitReady() {
  const ready = state.gpsReady && state.photoBase64;
  document.getElementById('submit-btn').disabled = !ready;
}

// ==================== GPS ====================

function requestGPS() {
  if (!navigator.geolocation) {
    setGPSStatus('error', '📡', 'อุปกรณ์นี้ไม่รองรับ GPS');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    onGPSSuccess,
    onGPSError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function onGPSSuccess(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  state.lat = latitude;
  state.lng = longitude;
  state.accuracy = Math.round(accuracy);

  if (accuracy > CONFIG.GPS_ACCURACY_THRESHOLD) {
    setGPSStatus('error', '📡', `สัญญาณ GPS ไม่แม่นยำ (${Math.round(accuracy)} ม.) กรุณาย้ายไปที่โล่ง`);
    state.gpsReady = false;
  } else {
    setGPSStatus('ok', '✅', `ระบุตำแหน่งแล้ว (±${Math.round(accuracy)} ม.)`);
    state.gpsReady = true;
  }
  checkSubmitReady();
}

function onGPSError(err) {
  const messages = {
    1: 'กรุณาอนุญาตการเข้าถึงตำแหน่งในการตั้งค่า',
    2: 'ไม่สามารถระบุตำแหน่งได้ กรุณาลองใหม่',
    3: 'หมดเวลาระบุตำแหน่ง กรุณาลองใหม่',
  };
  setGPSStatus('error', '❌', messages[err.code] || 'เกิดข้อผิดพลาด GPS');
}

function setGPSStatus(type, icon, text) {
  const box = document.getElementById('gps-status');
  box.className = 'status-box status-' + type;
  document.getElementById('gps-icon').textContent = icon;
  document.getElementById('gps-text').textContent = text;
}

// ==================== Photo ====================

async function handlePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    state.photoBase64 = await compressImage(file, CONFIG.IMAGE_MAX_WIDTH, CONFIG.IMAGE_QUALITY);

    const preview = document.getElementById('photo-preview');
    preview.src = 'data:image/jpeg;base64,' + state.photoBase64;
    preview.style.display = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';

    checkSubmitReady();
  } catch (err) {
    alert('ไม่สามารถโหลดรูปได้ กรุณาลองใหม่');
  }
}

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxWidth / img.width, 1);
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.split(',')[1]); // ตัด prefix ออก
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ==================== Submit ====================

async function handleSubmit() {
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.querySelector('#submit-label').textContent = 'กำลังส่งข้อมูล...';

  try {
    const payload = {
      userId:      state.userId,
      displayName: state.displayName,
      action:      state.action,
      lat:         state.lat,
      lng:         state.lng,
      accuracy:    state.accuracy,
      photoBase64: state.photoBase64,
    };

    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      // ใช้ text/plain เพื่อหลีกเลี่ยง CORS preflight กับ Google Apps Script
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (json.status === 'ok') {
      const branch = json.branch ? `\n🏢 ${json.branch}` : '';
      document.getElementById('success-detail').textContent =
        `👤 ${json.name || state.displayName}${branch}\n🕐 ${json.time || ''}\n📅 ${json.date || ''}`;
      showScreen('screen-success');
    } else {
      alert('❌ ' + (json.message || 'เกิดข้อผิดพลาด'));
      btn.disabled = false;
      btn.querySelector('#submit-label').textContent =
        state.action === 'checkin' ? 'เช็คอิน' : 'เช็คเอาท์';
    }
  } catch (err) {
    alert('ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบอินเทอร์เน็ต\n\n' + err.message);
    btn.disabled = false;
    btn.querySelector('#submit-label').textContent =
      state.action === 'checkin' ? 'เช็คอิน' : 'เช็คเอาท์';
  }
}

// ==================== Close ====================

function closeLiff() {
  if (liff.isInClient()) {
    liff.closeWindow();
  } else {
    window.close();
  }
}

// ==================== Start ====================

window.addEventListener('DOMContentLoaded', init);
