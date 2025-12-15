// Google Apps Script 部署 URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwFZwmhsF2xiD-WomecYjO_bw5aeQ05MXPnpofonZ0jiMDnE7GTrXu8ua19X8mfHPdl/exec';

// 發送記錄到 Google Sheets
async function sendToGoogleSheets(record) {
    try {
        const payload = {
            action: 'add',
            data: {
                bossName: record.bossName,
                channel: record.channel,
                map: record.map || '未知',
                deathTime: record.deathTime,
                respawnMin: record.respawnMin,
                respawnMax: record.respawnMax,
                timestamp: new Date().toISOString()
            }
        };

        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // 重要：Google Apps Script 需要 no-cors 模式
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        console.log('✅ 已同步到雲端:', record.bossName);
        return true;
    } catch (error) {
        console.error('❌ 雲端同步失敗:', error);
        return false;
    }
}

// 存儲數據
let activeBosses = [];
let patrolRecords = [];
let bossStatistics = {};

// 初始化
function init() {
    loadData();
    populateBossSelect();
    populateBossListTable();
    initializeStatistics();
    updateAllDisplays();
    setInterval(updateAllDisplays, 1000);
    loadUserWebhook(); // 載入用戶 Webhook 設定
    
    // 初始化個別 BOSS Webhook 計數
    const individualWebhooks = loadIndividualWebhooks();
    const configuredCount = Object.keys(individualWebhooks).length;
    const totalCount = Object.keys(BOSS_DATA).length;
    document.getElementById('individual-webhook-count').textContent = configuredCount;
    document.getElementById('total-boss-count').textContent = totalCount;

    document.getElementById('channel-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            recordBoss();
        }
    });
    
    // 設定每天 00:00 自動重新整理
    setupAutoMidnightRefresh();
}

// 螢幕監控相關變數
let screenStream = null;
let monitorInterval = null;
let isMonitoring = false;
let videoElement = null;

// 掃描區域設定（百分比）
let scanArea = {
    x: 28,
    y: 18,
    width: 15,
    height: 6
};

const savedScanArea = localStorage.getItem('scanArea');
if (savedScanArea) {
    scanArea = JSON.parse(savedScanArea);
}

// 調整掃描位置
function adjustScanArea() {
    const input = prompt(
        '請輸入掃描區域（格式：X%, Y%, 寬%, 高%）\n' +
        '目前設定：' + scanArea.x + ', ' + scanArea.y + ', ' + scanArea.width + ', ' + scanArea.height + '\n\n' +
        '提示：X=左邊距離, Y=上邊距離\n' +
        '例如：30, 20, 15, 6',
        scanArea.x + ', ' + scanArea.y + ', ' + scanArea.width + ', ' + scanArea.height
    );
    
    if (input) {
        const parts = input.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 4 && parts.every(n => !isNaN(n) && n >= 0 && n <= 100)) {
            scanArea = {
                x: parts[0],
                y: parts[1],
                width: parts[2],
                height: parts[3]
            };
            localStorage.setItem('scanArea', JSON.stringify(scanArea));
            showNotification('掃描區域已更新！', 'success');
        } else {
            showNotification('格式錯誤，請輸入4個0-100的數字', 'error');
        }
    }
}

// 預覽掃描區域
let previewTimer = null;
async function previewScanArea() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { mediaSource: 'screen' }
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        await new Promise(r => setTimeout(r, 300));
        
        const fullWidth = video.videoWidth;
        const fullHeight = video.videoHeight;
        
        const startX = Math.floor(fullWidth * scanArea.x / 100);
        const startY = Math.floor(fullHeight * scanArea.y / 100);
        const cropWidth = Math.floor(fullWidth * scanArea.width / 100);
        const cropHeight = Math.floor(fullHeight * scanArea.height / 100);
        
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        
        stream.getTracks().forEach(t => t.stop());
        
        const previewDiv = document.getElementById('scan-preview');
        const previewImg = document.getElementById('preview-img');
        const countdown = document.getElementById('preview-countdown');
        previewImg.src = canvas.toDataURL('image/png');
        previewDiv.style.display = 'block';
        
        let seconds = 10;
        countdown.textContent = `(${seconds}秒後自動關閉)`;
        
        if (previewTimer) clearInterval(previewTimer);
        previewTimer = setInterval(() => {
            seconds--;
            countdown.textContent = `(${seconds}秒後自動關閉)`;
            if (seconds <= 0) {
                clearInterval(previewTimer);
                previewDiv.style.display = 'none';
            }
        }, 1000);
        
    } catch (error) {
        console.error('預覽失敗:', error);
    }
}

// 使用說明
function showOcrHelp() {
    const helpText = `
【螢幕監控 OCR 使用說明】

📌 功能說明：
自動辨識遊戲中「選擇頻道」視窗的頻道號碼

📌 使用步驟：
1️⃣ 在遊戲中打開「選擇頻道」視窗
2️⃣ 點擊 👁️ 預覽，選擇遊戲視窗
3️⃣ 確認預覽圖片只有「頻道 XXXX」區域
4️⃣ 如果位置不對，點 ⚙️ 調整掃描位置
5️⃣ 點擊 🎯 開始監控
6️⃣ 再次點擊 🎯 停止監控

📌 按鈕說明：
🎯 開始/停止監控（綠色=待機，紅色=監控中）
⚙️ 調整掃描位置（輸入 X%, Y%, 寬%, 高%）
👁️ 預覽掃描區域（確認位置是否正確）
❓ 顯示此說明

📌 調整位置提示：
• X = 從左邊算起的距離百分比
• Y = 從上面算起的距離百分比
• 數字越大 = 越往右/下移動

📌 注意事項：
• 監控時請保持「選擇頻道」視窗開啟
• 頻道改變時輸入框會閃綠光
• 設定會自動儲存，下次不用重新設定
    `.trim();
    
    alert(helpText);
}

// 切換螢幕監控
async function toggleScreenMonitor() {
    if (isMonitoring) {
        stopScreenMonitor();
    } else {
        await startScreenMonitor();
    }
}

// 開始螢幕監控
async function startScreenMonitor() {
    const monitorBtn = document.getElementById('monitor-btn');
    
    try {
        monitorBtn.innerHTML = '⏳';
        
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                mediaSource: 'screen',
                frameRate: { ideal: 1, max: 5 }
            }
        });
        
        videoElement = document.createElement('video');
        videoElement.srcObject = screenStream;
        videoElement.muted = true;
        await videoElement.play();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopScreenMonitor();
        });
        
        isMonitoring = true;
        monitorBtn.innerHTML = '🔴';
        monitorBtn.classList.add('monitoring');
        
        await captureAndRecognize();
        monitorInterval = setInterval(captureAndRecognize, 1000);
        
        showNotification('螢幕監控已開始', 'success');
        
    } catch (error) {
        console.error('無法開始監控:', error);
        monitorBtn.innerHTML = '🎯';
    }
}

// 停止螢幕監控
function stopScreenMonitor() {
    const monitorBtn = document.getElementById('monitor-btn');
    
    isMonitoring = false;
    
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement = null;
    }
    
    monitorBtn.innerHTML = '🎯';
    monitorBtn.classList.remove('monitoring');
    
    showNotification('螢幕監控已停止', 'success');
}

// 擷取並辨識
async function captureAndRecognize() {
    if (!isMonitoring || !videoElement) return;
    
    try {
        const fullWidth = videoElement.videoWidth;
        const fullHeight = videoElement.videoHeight;
        
        const startX = Math.floor(fullWidth * scanArea.x / 100);
        const startY = Math.floor(fullHeight * scanArea.y / 100);
        const cropWidth = Math.floor(fullWidth * scanArea.width / 100);
        const cropHeight = Math.floor(fullHeight * scanArea.height / 100);
        
        if (cropWidth < 10 || cropHeight < 10) return;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropWidth;
        tempCanvas.height = cropHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(videoElement, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth * scale;
        canvas.height = cropHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            if (r > 200 && g > 200 && b > 200) {
                data[i] = data[i+1] = data[i+2] = 0;
            } else {
                data[i] = data[i+1] = data[i+2] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        
        const result = await Tesseract.recognize(
            canvas.toDataURL('image/png'),
            'eng',
            { tessedit_char_whitelist: '0123456789' }
        );
        
        const text = result.data.text.trim();
        const match = text.match(/(\d{1,4})/);
        if (match) {
            const channelNumber = match[1];
            const channelInput = document.getElementById('channel-input');
            if (channelInput.value !== channelNumber) {
                channelInput.value = channelNumber;
                channelInput.style.background = 'rgba(16, 185, 129, 0.3)';
                setTimeout(() => { channelInput.style.background = ''; }, 300);
            }
        }
        
    } catch (error) {
        console.error('辨識錯誤:', error);
    }
}

// 初始化統計數據
function initializeStatistics() {
    Object.keys(BOSS_DATA).forEach(bossName => {
        if (!bossStatistics[bossName]) {
            bossStatistics[bossName] = {
                totalKills: 0,
                todayKills: 0,
                lastResetDate: getTodayDateString()
            };
        }
    });
}

// 獲取今天的日期字串
function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// 檢查並重置每日統計
function checkAndResetDailyStats() {
    const today = getTodayDateString();
    let needsReset = false;

    Object.keys(bossStatistics).forEach(bossName => {
        if (bossStatistics[bossName].lastResetDate !== today) {
            bossStatistics[bossName].todayKills = 0;
            bossStatistics[bossName].lastResetDate = today;
            needsReset = true;
        }
    });

    if (needsReset) {
        saveData();
    }
}

// 更新BOSS統計
function updateBossStatistics(bossName) {
    if (!bossStatistics[bossName]) {
        bossStatistics[bossName] = {
            totalKills: 0,
            todayKills: 0,
            lastResetDate: getTodayDateString()
        };
    }

    const today = getTodayDateString();
    if (bossStatistics[bossName].lastResetDate !== today) {
        bossStatistics[bossName].todayKills = 0;
        bossStatistics[bossName].lastResetDate = today;
    }

    bossStatistics[bossName].totalKills++;
    bossStatistics[bossName].todayKills++;
    
    saveData();
}

// 更新統計顯示
function updateStatisticsDisplay() {
    const statsGrid = document.getElementById('stats-grid');
    const today = getTodayDateString();
    
    document.getElementById('stats-date').textContent = new Date().toLocaleDateString('zh-TW');
    
    let totalToday = 0;
    let totalAll = 0;

    let html = '';
    Object.entries(BOSS_DATA).forEach(([bossName, info]) => {
        const stats = bossStatistics[bossName] || { totalKills: 0, todayKills: 0 };
        
        totalToday += stats.todayKills;
        totalAll += stats.totalKills;

        const bossImageHtml = info.image ? `<img src="${info.image}" alt="${bossName}" class="stats-card-image">` : `<span style="color: ${info.color}">●</span>`;

        html += `
            <div class="stats-card">
                <h3 style="display: flex; align-items: center;">
                    ${bossImageHtml}
                    ${bossName}
                </h3>
                <div>
                    <p class="stats-label">今日擊殺</p>
                    <p class="stats-number stats-today">${stats.todayKills}</p>
                </div>
                <div>
                    <p class="stats-label">累積擊殺</p>
                    <p class="stats-number stats-total">${stats.totalKills}</p>
                </div>
            </div>
        `;
    });

    statsGrid.innerHTML = html;
    
    document.getElementById('total-today-kills').textContent = totalToday;
    document.getElementById('total-all-kills').textContent = totalAll;
}

// 重置今日統計
function resetTodayStats() {
    if (confirm('確定要重置今日所有BOSS的擊殺統計嗎？')) {
        const today = getTodayDateString();
        Object.keys(bossStatistics).forEach(bossName => {
            bossStatistics[bossName].todayKills = 0;
            bossStatistics[bossName].lastResetDate = today;
        });
        saveData();
        updateStatisticsDisplay();
        showNotification('已重置今日統計', 'success');
    }
}

// 重置所有統計
function resetAllStats() {
    if (confirm('確定要清空所有BOSS的擊殺統計嗎？此操作無法復原！')) {
        const today = getTodayDateString();
        Object.keys(bossStatistics).forEach(bossName => {
            bossStatistics[bossName].totalKills = 0;
            bossStatistics[bossName].todayKills = 0;
            bossStatistics[bossName].lastResetDate = today;
        });
        saveData();
        updateStatisticsDisplay();
        showNotification('已清空所有統計數據', 'success');
    }
}

// 填充BOSS選擇列表
function populateBossSelect() {
    const select = document.getElementById('boss-select');
    Object.keys(BOSS_DATA).forEach(boss => {
        const option = document.createElement('option');
        option.value = boss;
        option.textContent = boss;
        select.appendChild(option);
    });
}

// 填充BOSS列表表格
function populateBossListTable() {
    const tbody = document.getElementById('boss-list-tbody');
    tbody.innerHTML = '';
    Object.entries(BOSS_DATA).forEach(([name, info]) => {
        const row = tbody.insertRow();
        
        const imgCell = row.insertCell(0);
        if (info.image) {
            imgCell.innerHTML = `<img src="${info.image}" alt="${name}" class="boss-list-image">`;
        }
        
        row.insertCell(1).textContent = name;
        row.insertCell(2).textContent = formatTimeRange(info.min, info.max);
        row.insertCell(3).textContent = info.maps.join(', ');
    });
}

// 格式化時間範圍
function formatTimeRange(min, max) {
    const minHour = Math.floor(min/60);
    const minMin = min%60;
    const maxHour = Math.floor(max/60);
    const maxMin = max%60;
    
    let minStr = minHour > 0 ? (minMin > 0 ? `${minHour}小時${minMin}分` : `${minHour}小時`) : `${minMin}分`;
    let maxStr = maxHour > 0 ? (maxMin > 0 ? `${maxHour}小時${maxMin}分` : `${maxHour}小時`) : `${maxMin}分`;
    
    return `${minStr} ~ ${maxStr}`;
}

// BOSS資訊卡片自動關閉計時器
let bossInfoTimer = null;

// BOSS選擇事件
function onBossSelected() {
    const bossName = document.getElementById('boss-select').value;
    const mapSelectContainer = document.getElementById('map-select-container');
    const previewImage = document.getElementById('boss-preview-image');
    const bossInfoCard = document.getElementById('boss-info');
    
    if (bossInfoTimer) {
        clearTimeout(bossInfoTimer);
        bossInfoTimer = null;
    }
    
    if (bossName && BOSS_DATA[bossName]) {
        const info = BOSS_DATA[bossName];
        
        if (info.hasMapSelect) {
            mapSelectContainer.style.display = 'block';
        } else {
            mapSelectContainer.style.display = 'none';
        }
        
        if (info.image) {
            previewImage.src = info.image;
            previewImage.alt = bossName;
            previewImage.style.display = 'block';
        } else {
            previewImage.style.display = 'none';
        }
        
        document.getElementById('map-info').textContent = `地圖: ${info.maps.join(', ')}`;
        document.getElementById('time-info').textContent = `重生時間: ${formatTimeRange(info.min, info.max)}`;
        bossInfoCard.style.display = 'block';
        
        bossInfoTimer = setTimeout(() => {
            bossInfoCard.style.display = 'none';
        }, 10000);
    } else {
        bossInfoCard.style.display = 'none';
        mapSelectContainer.style.display = 'none';
        previewImage.style.display = 'none';
    }
}

// 記錄BOSS擊殺
function recordBoss() {
    const bossName = document.getElementById('boss-select').value;
    const channel = document.getElementById('channel-input').value;
    const notification = true;

    if (!bossName) {
        showNotification('請選擇BOSS', 'warning');
        return;
    }

    if (!channel) {
        showNotification('請輸入頻道', 'warning');
        return;
    }

    const info = BOSS_DATA[bossName];
    const now = new Date();
    const respawnMin = new Date(now.getTime() + info.min * 60000);
    const respawnMax = new Date(now.getTime() + info.max * 60000);

    let mapLocation = info.maps[0];
    if (info.hasMapSelect) {
        const selectedMap = document.getElementById('map-select').value;
        mapLocation = selectedMap === '7' ? '夜市徒步區7' : '夜市徒步區7-1';
    }

    // 檢查是否已有相同頻道的相同BOSS（不管地圖，只保留最新記錄）
    const existingRecordIndex = activeBosses.findIndex(
        b => b.bossName === bossName && b.channel === channel
    );

    if (existingRecordIndex !== -1) {
        const existingRecord = activeBosses[existingRecordIndex];
        existingRecord.map = mapLocation; // 更新地圖位置
        existingRecord.deathTime = now.toISOString();
        existingRecord.respawnMin = respawnMin.toISOString();
        existingRecord.respawnMax = respawnMax.toISOString();
        existingRecord.notified = false;
        existingRecord.lastPatrolTime = null;
        
        updateBossStatistics(bossName);
        
        saveData();
        updateAllDisplays();

        // 發送 Discord 通知（整合個別和統一）
        // 1. 先檢查並發送個別 BOSS 專屬的 Discord 通知
        if (typeof sendKillNotification === 'function') {
            sendKillNotification(existingRecord).catch(err => {});
        }

        // 2. 發送使用者設定的個別 BOSS Webhook（如果有設定）
        sendIndividualBossWebhookNotification(existingRecord).catch(err => {});

        // 3. 發送使用者自訂的統一 Webhook 通知（如果有設定，無論個別是否有設定都會發送）
        sendUserWebhookNotification(existingRecord).catch(err => {});

        // 發送到 Google Sheets（更新記錄）
        sendToGoogleSheets(existingRecord).catch(err => {
            console.error("Google Sheets 同步失敗:", err);
        });

        showNotification(
            `頻道 ${channel} - ${bossName}\n地圖: ${mapLocation}\n已更新擊殺時間！（覆蓋舊記錄）\n預計重生: ${formatTime(respawnMin)} ~ ${formatTime(respawnMax)}`,
            'success'
        );
    } else {
        const record = {
            id: Date.now(),
            channel: channel,
            bossName: bossName,
            map: mapLocation,
            deathTime: now.toISOString(),
            respawnMin: respawnMin.toISOString(),
            respawnMax: respawnMax.toISOString(),
            notified: false,
            notificationEnabled: notification,
            lastPatrolTime: null
        };

        activeBosses.push(record);
        
        updateBossStatistics(bossName);
        
        saveData();
        updateAllDisplays();

        // 發送 Discord 通知（整合個別和統一）
        // 1. 先檢查並發送個別 BOSS 專屬的 Discord 通知
        if (typeof sendKillNotification === 'function') {
            sendKillNotification(record).catch(err => {});
        }

        // 2. 發送使用者設定的個別 BOSS Webhook（如果有設定）
        sendIndividualBossWebhookNotification(record).catch(err => {});

        // 3. 發送使用者自訂的統一 Webhook 通知（如果有設定，無論個別是否有設定都會發送）
        sendUserWebhookNotification(record).catch(err => {});

        // 發送到 Google Sheets
        sendToGoogleSheets(record).catch(err => {
            console.error("Google Sheets 同步失敗:", err);
        });

        showNotification(
            `頻道 ${channel} - ${bossName}\n地圖: ${mapLocation}\n擊殺時間已記錄！\n預計重生: ${formatTime(respawnMin)} ~ ${formatTime(respawnMax)}`,
            'success'
        );
    }

    document.getElementById('channel-input').value = '';
    document.getElementById('channel-input').focus();
}

// 刪除單個記錄
function deleteRecord(id) {
    if (confirm('確定要刪除此記錄嗎？')) {
        activeBosses = activeBosses.filter(b => b.id !== id);
        saveData();
        updateAllDisplays();
        showNotification('已刪除BOSS記錄', 'success');
    }
}

// 重新計時單個BOSS
function respawnSingleBoss(id) {
    const record = activeBosses.find(b => b.id === id);
    if (record) {
        const info = BOSS_DATA[record.bossName];
        const now = new Date();
        record.deathTime = now.toISOString();
        record.respawnMin = new Date(now.getTime() + info.min * 60000).toISOString();
        record.respawnMax = new Date(now.getTime() + info.max * 60000).toISOString();
        record.notified = false;
        
        updateBossStatistics(record.bossName);
        
        saveData();
        updateAllDisplays();
        
        // 發送 Discord 通知（整合個別和統一）
        // 1. 先檢查並發送個別 BOSS 專屬的 Discord 通知
        if (typeof sendKillNotification === 'function') {
            sendKillNotification(record).catch(err => {});
        }

        // 2. 發送使用者設定的個別 BOSS Webhook（如果有設定）
        sendIndividualBossWebhookNotification(record).catch(err => {});

        // 3. 發送使用者自訂的統一 Webhook 通知（如果有設定，無論個別是否有設定都會發送）
        sendUserWebhookNotification(record).catch(err => {});

        // 發送到 Google Sheets
        sendToGoogleSheets(record).catch(err => {
            console.error("Google Sheets 同步失敗:", err);
        });
        
        showNotification(`已重新計時 ${record.bossName}！`, 'success');
    }
}

// 巡邏打卡單個BOSS
function patrolSingleBoss(id) {
    const record = activeBosses.find(b => b.id === id);
    if (record) {
        const now = new Date();
        record.lastPatrolTime = now.toISOString();
        
        patrolRecords.push({
            timestamp: now.toISOString(),
            bossName: record.bossName,
            channel: record.channel,
            map: record.map,
            result: '未重生',
            note: '從BOSS記錄巡邏打卡'
        });

        saveData();
        updateAllDisplays();
        showNotification(
            `巡邏打卡記錄已儲存！\nBOSS: ${record.bossName}\n頻道: ${record.channel}\n地圖: ${record.map}`,
            'success'
        );
    }
}

// 清空所有記錄
function clearAll() {
    if (activeBosses.length === 0) {
        showNotification('目前沒有記錄', 'warning');
        return;
    }

    if (confirm('確定要清空所有BOSS記錄嗎？')) {
        activeBosses = [];
        saveData();
        updateAllDisplays();
        showNotification('已清空所有記錄', 'success');
    }
}

// 清空建議表單
function clearFeedbackForm() {
    document.getElementById('feedback-type').value = '功能建議';
    document.getElementById('feedback-content').value = '';
    document.getElementById('feedback-contact').value = '';
}

// ===== 用戶 Webhook 管理函數 =====

// 載入用戶 Webhook
function loadUserWebhook() {
    const savedWebhook = localStorage.getItem('userDiscordWebhook');
    if (savedWebhook) {
        document.getElementById('user-webhook-url').value = savedWebhook;
        showWebhookStatus('✅ 已載入儲存的 Webhook 設定', 'success');
    }
}

// ===== 個別 BOSS Webhook 管理函數 =====

// 載入個別 BOSS Webhook 設定
function loadIndividualWebhooks() {
    const saved = localStorage.getItem('individualBossWebhooks');
    let individualWebhooks = {};
    
    if (saved) {
        try {
            individualWebhooks = JSON.parse(saved);
        } catch (e) {
            console.error('載入個別 Webhook 失敗:', e);
        }
    }
    
    return individualWebhooks;
}

// 儲存個別 BOSS Webhook 設定
function saveIndividualWebhooks(webhooks) {
    localStorage.setItem('individualBossWebhooks', JSON.stringify(webhooks));
}

// 生成個別 BOSS Webhook 列表
function populateBossWebhooksList() {
    const container = document.getElementById('boss-webhooks-list');
    const individualWebhooks = loadIndividualWebhooks();
    
    let html = '';
    let configuredCount = 0;
    let totalCount = 0;

    Object.entries(BOSS_DATA).forEach(([bossName, info]) => {
        totalCount++;
        const webhookUrl = individualWebhooks[bossName] || '';
        const isConfigured = webhookUrl ? 'webhook-configured' : '';
        if (webhookUrl) configuredCount++;

        const bossImageHtml = info.image 
            ? `<img src="${info.image}" alt="${bossName}" class="boss-image">` 
            : `<span style="color: ${info.color}; font-size: 2em;">●</span>`;

        html += `
            <div class="boss-webhook-card ${isConfigured}" id="boss-webhook-${bossName.replace(/\s/g, '-')}">
                <div class="boss-webhook-info">
                    ${bossImageHtml}
                    <div>
                        <div style="font-weight: bold; color: #e2e8f0;">${bossName}</div>
                        <div style="font-size: 0.85em; color: #94a3b8;">${info.maps[0]}</div>
                    </div>
                </div>
                <div class="boss-webhook-input">
                    <input type="text" 
                           id="webhook-${bossName}" 
                           value="${webhookUrl}"
                           placeholder="https://discord.com/api/webhooks/..."
                           style="width: 100%;">
                </div>
                <div class="boss-webhook-actions">
                    <button type="button" 
                            class="boss-webhook-btn" 
                            onclick="testSingleBossWebhook('${bossName}')"
                            style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-color: #f59e0b;">
                        🧪 測試
                    </button>
                    <button type="button" 
                            class="boss-webhook-btn" 
                            onclick="clearSingleBossWebhook('${bossName}')"
                            style="background: rgba(220, 38, 38, 0.2); border-color: rgba(220, 38, 38, 0.5); color: #fca5a5;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    
    // 更新計數
    document.getElementById('individual-webhook-count').textContent = configuredCount;
    document.getElementById('total-boss-count').textContent = totalCount;
}

// 切換個別 Webhook 區塊顯示
function toggleIndividualWebhooks() {
    const container = document.getElementById('individual-webhooks-container');
    const btn = document.getElementById('toggle-individual-btn');
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.innerHTML = '📁 收起設定';
        populateBossWebhooksList();
    } else {
        container.style.display = 'none';
        btn.innerHTML = '📂 展開設定';
    }
}

// 儲存所有個別 Webhook 設定
function saveAllIndividualWebhooks() {
    const individualWebhooks = {};
    let savedCount = 0;

    Object.keys(BOSS_DATA).forEach(bossName => {
        const input = document.getElementById(`webhook-${bossName}`);
        if (input) {
            const url = input.value.trim();
            if (url) {
                // 驗證 URL 格式
                if (url.startsWith('https://discord.com/api/webhooks/') || 
                    url.startsWith('https://discordapp.com/api/webhooks/')) {
                    individualWebhooks[bossName] = url;
                    savedCount++;
                } else {
                    showNotification(`${bossName} 的 Webhook URL 格式不正確`, 'warning');
                    return;
                }
            }
        }
    });

    saveIndividualWebhooks(individualWebhooks);
    populateBossWebhooksList(); // 重新載入以更新 ✅ 標記
    showNotification(`✅ 已儲存 ${savedCount} 個 BOSS 的 Webhook 設定`, 'success');
    showWebhookStatus(`✅ 已儲存 ${savedCount} 個 BOSS 的個別 Webhook 設定`, 'success');
}

// 測試單個 BOSS 的 Webhook
async function testSingleBossWebhook(bossName) {
    const input = document.getElementById(`webhook-${bossName}`);
    const webhookUrl = input.value.trim();

    if (!webhookUrl) {
        showNotification(`請先輸入 ${bossName} 的 Webhook URL`, 'warning');
        return;
    }

    // 驗證 URL 格式
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && 
        !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification(`${bossName} 的 Webhook URL 格式不正確`, 'error');
        return;
    }

    const now = new Date();
    const bossInfo = BOSS_DATA[bossName];
    const testEmbed = {
        title: '🧪 測試通知 - ' + bossName,
        description: `這是 **${bossName}** 的測試通知`,
        color: parseInt(bossInfo.color.replace('#', ''), 16),
        fields: [
            {
                name: '📅 測試時間',
                value: formatDateTime(now),
                inline: true
            },
            {
                name: '🗺️ 地圖',
                value: bossInfo.maps[0],
                inline: true
            }
        ],
        timestamp: now.toISOString(),
        footer: {
            text: `楓之谷BOSS重生時間系統 - ${bossName} 專屬通知`
        }
    };

    try {
        showNotification(`正在發送 ${bossName} 的測試通知...`, 'success');
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [testEmbed]
            })
        });

        if (response.ok) {
            showNotification(`✅ ${bossName} 的測試通知已成功發送！`, 'success');
            
            // 標記為已設定
            const card = document.getElementById(`boss-webhook-${bossName.replace(/\s/g, '-')}`);
            if (card && !card.classList.contains('webhook-configured')) {
                card.classList.add('webhook-configured');
            }
        } else {
            showNotification(`❌ ${bossName} 的測試失敗`, 'error');
        }
    } catch (error) {
        console.error(`${bossName} Webhook 測試失敗:`, error);
        showNotification(`❌ ${bossName} 發送失敗`, 'error');
    }
}

// 清除單個 BOSS 的 Webhook
function clearSingleBossWebhook(bossName) {
    const input = document.getElementById(`webhook-${bossName}`);
    if (input) {
        input.value = '';
        const card = document.getElementById(`boss-webhook-${bossName.replace(/\s/g, '-')}`);
        if (card) {
            card.classList.remove('webhook-configured');
        }
        
        // 從儲存中移除
        const individualWebhooks = loadIndividualWebhooks();
        delete individualWebhooks[bossName];
        saveIndividualWebhooks(individualWebhooks);
        
        populateBossWebhooksList(); // 更新計數
        showNotification(`已清除 ${bossName} 的 Webhook 設定`, 'success');
    }
}

// 清除所有個別 Webhook
function clearAllIndividualWebhooks() {
    if (confirm('確定要清除所有個別 BOSS 的 Webhook 設定嗎？')) {
        localStorage.removeItem('individualBossWebhooks');
        populateBossWebhooksList();
        showNotification('已清除所有個別 BOSS 的 Webhook 設定', 'success');
        showWebhookStatus('ℹ️ 所有個別 BOSS 的 Webhook 設定已清除', 'warning');
    }
}

// 發送個別 BOSS 的 Webhook 通知（優先級高於統一通知）
async function sendIndividualBossWebhookNotification(record) {
    const individualWebhooks = loadIndividualWebhooks();
    const webhookUrl = individualWebhooks[record.bossName];
    
    if (!webhookUrl) return false; // 沒有設定就返回 false

    const deathTime = new Date(record.deathTime);
    const respawnMin = new Date(record.respawnMin);
    const respawnMax = new Date(record.respawnMax);

    const embed = {
        title: '⚔️ BOSS擊殺記錄',
        description: `**${record.bossName}** 已被擊殺！`,
        color: parseInt(BOSS_DATA[record.bossName]?.color?.replace('#', '') || 'FF0000', 16),
        fields: [
            {
                name: '頻道',
                value: String(record.channel),
                inline: true
            },
            {
                name: '地圖',
                value: record.map || BOSS_DATA[record.bossName]?.map || '未知',
                inline: true
            },
            {
                name: '⏰ 預計重生時間',
                value: `**${formatDateTime(respawnMin)} ~ ${formatDateTime(respawnMax)}**`,
                inline: false
            }
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: `楓之谷BOSS重生時間系統 - ${record.bossName} 專屬通知`
        }
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [embed]
            })
        });
        return true; // 發送成功
    } catch (error) {
        console.error(`${record.bossName} 個別 Webhook 發送失敗:`, error);
        return false; // 發送失敗
    }
}

// 儲存用戶 Webhook
function saveUserWebhook() {
    const webhookUrl = document.getElementById('user-webhook-url').value.trim();
    
    if (!webhookUrl) {
        showNotification('請輸入 Webhook URL', 'warning');
        return;
    }

    // 驗證 Webhook URL 格式
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && 
        !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入正確的 Discord Webhook URL', 'error');
        showWebhookStatus('❌ URL 格式不正確，請確認是否為 Discord Webhook 網址', 'error');
        return;
    }

    localStorage.setItem('userDiscordWebhook', webhookUrl);
    showNotification('✅ Webhook 已儲存！', 'success');
    showWebhookStatus('✅ Webhook 設定已成功儲存，現在記錄 BOSS 時會自動發送通知到您的 Discord 頻道', 'success');
}

// 測試用戶 Webhook
async function testUserWebhook() {
    const webhookUrl = document.getElementById('user-webhook-url').value.trim();
    
    if (!webhookUrl) {
        showNotification('請先輸入並儲存 Webhook URL', 'warning');
        return;
    }

    const now = new Date();
    const testEmbed = {
        title: '🧪 測試通知',
        description: '這是一則測試訊息，如果您看到這則訊息，表示 Webhook 設定成功！',
        color: 0x10b981,
        fields: [
            {
                name: '📅 測試時間',
                value: formatDateTime(now),
                inline: true
            },
            {
                name: '✅ 狀態',
                value: '設定正常',
                inline: true
            }
        ],
        timestamp: now.toISOString(),
        footer: {
            text: '楓之谷BOSS重生時間系統 - 測試通知'
        }
    };

    try {
        showNotification('正在發送測試通知...', 'success');
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [testEmbed]
            })
        });

        if (response.ok) {
            showNotification('✅ 測試通知已成功發送！請檢查您的 Discord 頻道', 'success');
            showWebhookStatus('✅ 測試成功！已發送測試訊息到您的 Discord 頻道', 'success');
        } else {
            const errorText = await response.text();
            console.error('Webhook 測試失敗:', response.status, errorText);
            showNotification('❌ 測試失敗，請檢查 Webhook URL 是否正確', 'error');
            showWebhookStatus(`❌ 測試失敗 (錯誤代碼: ${response.status})，請確認 Webhook URL 是否正確`, 'error');
        }
    } catch (error) {
        console.error('發送測試通知時發生錯誤:', error);
        showNotification('❌ 發送失敗，請檢查網路連線', 'error');
        showWebhookStatus('❌ 發送失敗，請檢查網路連線或 Webhook URL 是否正確', 'error');
    }
}

// 清除用戶 Webhook
function clearUserWebhook() {
    if (confirm('確定要清除 Webhook 設定嗎？')) {
        localStorage.removeItem('userDiscordWebhook');
        document.getElementById('user-webhook-url').value = '';
        showNotification('已清除 Webhook 設定', 'success');
        showWebhookStatus('ℹ️ Webhook 設定已清除', 'warning');
    }
}

// 顯示 Webhook 狀態訊息
function showWebhookStatus(message, type) {
    const statusDiv = document.getElementById('webhook-status');
    const statusText = document.getElementById('webhook-status-text');
    
    statusText.textContent = message;
    statusDiv.style.display = 'block';
    
    // 根據類型設定樣式
    if (type === 'success') {
        statusDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        statusDiv.style.borderLeftColor = '#10b981';
        statusText.style.color = '#34d399';
    } else if (type === 'error') {
        statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        statusDiv.style.borderLeftColor = '#ef4444';
        statusText.style.color = '#f87171';
    } else if (type === 'warning') {
        statusDiv.style.background = 'rgba(245, 158, 11, 0.1)';
        statusDiv.style.borderLeftColor = '#f59e0b';
        statusText.style.color = '#fbbf24';
    }

    // 5秒後自動隱藏（除非是錯誤訊息）
    if (type !== 'error') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// 發送用戶 Webhook 通知
async function sendUserWebhookNotification(record) {
    const webhookUrl = localStorage.getItem('userDiscordWebhook');
    if (!webhookUrl) return; // 如果沒有設定就不發送

    const deathTime = new Date(record.deathTime);
    const respawnMin = new Date(record.respawnMin);
    const respawnMax = new Date(record.respawnMax);

    const embed = {
        title: '⚔️ BOSS擊殺記錄',
        description: `**${record.bossName}** 已被擊殺！`,
        color: parseInt(BOSS_DATA[record.bossName]?.color?.replace('#', '') || 'FF0000', 16),
        fields: [
            {
                name: '頻道',
                value: String(record.channel),
                inline: true
            },
            {
                name: '地圖',
                value: record.map || BOSS_DATA[record.bossName]?.map || '未知',
                inline: true
            },
            {
                name: '⏰ 預計重生時間',
                value: `**${formatDateTime(respawnMin)} ~ ${formatDateTime(respawnMax)}**`,
                inline: false
            }
        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: '楓之谷BOSS重生時間系統'
        }
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [embed]
            })
        });
        // 靜默處理，不顯示通知
    } catch (error) {
        // 靜默處理錯誤
        console.error('用戶 Webhook 發送失敗:', error);
    }
}

// 更新所有顯示
function updateAllDisplays() {
    checkAndResetDailyStats();
    updateRecordDisplay();
    updateStatisticsDisplay();
}

// 更新記錄顯示
function updateRecordDisplay() {
    const container = document.getElementById('record-container');
    const now = new Date();
    
    document.getElementById('boss-count').textContent = activeBosses.length;

    if (activeBosses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0a0c0; padding: 40px 0;">目前沒有記錄中的BOSS</p>';
        return;
    }

    const sorted = [...activeBosses].sort((a, b) => 
        new Date(a.respawnMin) - new Date(b.respawnMin)
    );

    let html = '';
    sorted.forEach(record => {
        const respawnMin = new Date(record.respawnMin);
        const respawnMax = new Date(record.respawnMax);
        const bossInfo = BOSS_DATA[record.bossName];
        const bossColor = bossInfo ? bossInfo.color : '#0099cc';
        
        let statusText = '';
        let statusClass = '';
        let countdownText = '';
        let showRespawnBtn = false;
        let showPatrolBtn = false;
        
        if (now < respawnMin) {
            statusText = '即將重生';
            statusClass = 'waiting';
            
            const totalSeconds = Math.floor((respawnMin - now) / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            countdownText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else if (now >= respawnMin && now <= respawnMax) {
            statusText = '可能重生';
            statusClass = 'possible';
            showRespawnBtn = true;
            showPatrolBtn = true;
            
            const totalSeconds = Math.floor((respawnMax - now) / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            countdownText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            statusText = '確定重生';
            statusClass = 'confirmed';
            showRespawnBtn = true;
            
            const diffMin = Math.floor((now - respawnMax) / 60000);
            countdownText = `+${diffMin}分`;
        }

        const mapInfo = record.map ? ` | ${record.map}` : '';
        const killTime = formatDateTime(new Date(record.deathTime));
        
        let patrolInfo = '';
        if (record.lastPatrolTime) {
            const diff = Math.floor((now - new Date(record.lastPatrolTime)) / 60000);
            patrolInfo = `
                <div class="boss-info-item">
                    <span style="color: #64748b;">|</span>
                    <span>👀 巡邏: ${diff}分鐘前</span>
                </div>
            `;
        }

        const respawnBtnHtml = showRespawnBtn ? `<button type="button" class="boss-icon-btn" onclick="respawnSingleBoss(${record.id})" title="重新計時">🔄</button>` : '';
        const patrolBtnHtml = showPatrolBtn ? `<button type="button" class="boss-icon-btn" onclick="patrolSingleBoss(${record.id})" title="巡邏打卡">👀</button>` : '';

        const bossImage = bossInfo && bossInfo.image ? `<img src="${bossInfo.image}" alt="${record.bossName}" class="boss-image">` : '';

        html += `
            <div class="boss-status-card" style="--boss-color: ${bossColor};">
                <div class="boss-card-header">
                    <div class="boss-info-left">
                        ${bossImage}
                        <div class="boss-info-row">
                            <div class="boss-info-item">
                                <span>頻道 ${record.channel}${mapInfo}</span>
                            </div>
                            <div class="boss-info-item">
                                <span style="color: #64748b;">|</span>
                                <span>⚔️ 擊殺: ${killTime}</span>
                            </div>
                            ${patrolInfo}
                            <div class="boss-info-item">
                                <span style="color: #64748b;">|</span>
                                <span class="boss-status-badge ${statusClass}">${statusText}</span>
                                <span style="font-family: 'Courier New', monospace; font-weight: 600;">${countdownText}</span>
                            </div>
                        </div>
                    </div>
                    <div class="boss-action-btns">
                        ${respawnBtnHtml}
                        ${patrolBtnHtml}
                        <button type="button" class="boss-icon-btn delete" onclick="deleteRecord(${record.id})" title="刪除">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 顯示通知
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<p style="white-space: pre-line;">${message}</p>`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// 切換標籤
function switchTab(index) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => tab.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));

    tabs[index].classList.add('active');
    contents[index].classList.add('active');
}

// 格式化時間
function formatTime(date) {
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateTime(date, withSeconds = false) {
    const options = { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    };
    if (withSeconds) {
        options.second = '2-digit';
    }
    return date.toLocaleString('zh-TW', options).replace(/\//g, '/');
}

// 保存數據到localStorage
function saveData() {
    localStorage.setItem('activeBosses', JSON.stringify(activeBosses));
    localStorage.setItem('patrolRecords', JSON.stringify(patrolRecords));
    localStorage.setItem('bossStatistics', JSON.stringify(bossStatistics));
}

// 載入數據
function loadData() {
    const savedBosses = localStorage.getItem('activeBosses');
    const savedPatrols = localStorage.getItem('patrolRecords');
    const savedStatistics = localStorage.getItem('bossStatistics');

    if (savedBosses) {
        try {
            activeBosses = JSON.parse(savedBosses);
        } catch (e) {
            console.error('載入BOSS數據失敗:', e);
        }
    }

    if (savedPatrols) {
        try {
            patrolRecords = JSON.parse(savedPatrols);
        } catch (e) {
            console.error('載入巡邏記錄失敗:', e);
        }
    }

    if (savedStatistics) {
        try {
            bossStatistics = JSON.parse(savedStatistics);
        } catch (e) {
            console.error('載入統計數據失敗:', e);
            bossStatistics = {};
        }
    }
}

// 頁面載入時初始化
window.addEventListener('DOMContentLoaded', init);

// 按 Enter 鍵記錄擊殺
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        recordBoss();
    }
});

// 設定每天 00:00 自動重新整理
function setupAutoMidnightRefresh() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // 設定為下一個午夜
    
    const timeUntilMidnight = midnight.getTime() - now.getTime();
    
    console.log(`[自動重新整理] 將在 ${Math.floor(timeUntilMidnight / 1000 / 60)} 分鐘後的 00:00 自動重新整理頁面`);
    
    setTimeout(() => {
        console.log('[自動重新整理] 已到達 00:00，重新整理頁面...');
        location.reload();
    }, timeUntilMidnight);
}
