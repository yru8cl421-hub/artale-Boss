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
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
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
let patrolRecords = []; // 恢復：巡邏記錄陣列
let bossStatistics = {};

// 初始化
function init() {
    loadData();
    populateBossSelect();
    populateBossListTable();
    initializeStatistics();
    updateAllDisplays();
    setInterval(updateAllDisplays, 1000);
    loadUserWebhook();

    // 恢復：初始化個別 BOSS Webhook 計數
    const individualWebhooks = loadIndividualWebhooks();
    const configuredCount = Object.keys(individualWebhooks).length;
    const totalCount = Object.keys(BOSS_DATA).length;
    const individualCountEl = document.getElementById('individual-webhook-count');
    const totalCountEl = document.getElementById('total-boss-count');
    if (individualCountEl) individualCountEl.textContent = configuredCount;
    if (totalCountEl) totalCountEl.textContent = totalCount;

    // 全域 Enter 鍵監聽 - 在任何地方按 Enter 都會記錄 BOSS
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            // 排除 textarea 和特定情況
            if (e.target.tagName === 'TEXTAREA') return;
            recordBoss();
        }
    });
    
    setupAutoMidnightRefresh();
}

// 螢幕監控相關變數
let screenStream = null;
let monitorInterval = null;
let isMonitoring = false;
let videoElement = null;

// 掃描區域設定
let scanArea = { x: 28, y: 18, width: 15, height: 6 };
const savedScanArea = localStorage.getItem('scanArea');
if (savedScanArea) scanArea = JSON.parse(savedScanArea);

// 視訊選擇器相關變數
let selectorStream = null;
let selectorVideo = null;
let selectorCanvas = null;
let selectorCtx = null;
let isSelecting = false;
let selectionStart = null;
let selectionRect = null;

// 調整掃描位置
async function adjustScanArea() {
    try {
        const overlay = document.createElement('div');
        overlay.id = 'scan-selector-overlay';
        overlay.innerHTML = `
            <div class="selector-container">
                <div class="selector-header">
                    <h3>🎯 請框選頻道號碼區域</h3>
                    <p>在視訊畫面上拖拉滑鼠框選「頻道的 XXXX」的文字區域</p>
                    <p style="color: #f59e0b; font-size: 0.9em; margin-top: 8px;">⚠️ 載入中,請稍候...</p>
                </div>
                <div class="selector-video-wrapper">
                    <video id="selector-video" autoplay muted playsinline></video>
                    <canvas id="selector-canvas"></canvas>
                </div>
                <div class="selector-controls">
                    <div class="selector-info">
                        <span id="selector-coords">正在載入視訊...</span>
                    </div>
                    <div class="selector-buttons">
                        <button onclick="cancelSelection()" class="btn-secondary">❌ 取消</button>
                        <button onclick="confirmSelection()" class="btn-primary" id="confirm-btn" disabled>✅ 確認</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        selectorStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "never", displaySurface: "monitor", logicalSurface: true, frameRate: 5 }
        });

        selectorVideo = document.getElementById('selector-video');
        selectorVideo.srcObject = selectorStream;
        await selectorVideo.play();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('視訊尺寸:', selectorVideo.videoWidth, 'x', selectorVideo.videoHeight);

        selectorCanvas = document.getElementById('selector-canvas');
        if (selectorVideo.videoWidth === 0 || selectorVideo.videoHeight === 0) {
            throw new Error('無法取得視訊尺寸,請重新選擇視窗');
        }
        
        selectorCanvas.width = selectorVideo.videoWidth;
        selectorCanvas.height = selectorVideo.videoHeight;
        selectorCtx = selectorCanvas.getContext('2d', { willReadFrequently: true });

        document.querySelector('.selector-header p:last-child').textContent = '✅ 視訊已載入,請開始框選區域';
        document.querySelector('.selector-header p:last-child').style.color = '#10b981';
        document.getElementById('selector-coords').textContent = '請開始框選...';

        let frameCount = 0;
        const drawFrame = () => {
            if (!selectorVideo || !selectorCanvas || !selectorCtx) return;
            
            try {
                selectorCtx.drawImage(selectorVideo, 0, 0, selectorCanvas.width, selectorCanvas.height);
                frameCount++;
                
                if (frameCount % 30 === 0) console.log('視訊繪製正常,幀數:', frameCount);
                
                if (selectionRect) {
                    selectorCtx.strokeStyle = '#10b981';
                    selectorCtx.lineWidth = 3;
                    selectorCtx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
                    selectorCtx.fillStyle = 'rgba(16, 185, 129, 0.1)';
                    selectorCtx.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height);
                    
                    const cornerSize = 10;
                    selectorCtx.fillStyle = '#10b981';
                    selectorCtx.fillRect(selectionRect.x - 1.5, selectionRect.y - 1.5, cornerSize, 3);
                    selectorCtx.fillRect(selectionRect.x - 1.5, selectionRect.y - 1.5, 3, cornerSize);
                    selectorCtx.fillRect(selectionRect.x + selectionRect.width - cornerSize + 1.5, selectionRect.y - 1.5, cornerSize, 3);
                    selectorCtx.fillRect(selectionRect.x + selectionRect.width - 1.5, selectionRect.y - 1.5, 3, cornerSize);
                    selectorCtx.fillRect(selectionRect.x - 1.5, selectionRect.y + selectionRect.height - cornerSize + 1.5, 3, cornerSize);
                    selectorCtx.fillRect(selectionRect.x - 1.5, selectionRect.y + selectionRect.height - 1.5, cornerSize, 3);
                    selectorCtx.fillRect(selectionRect.x + selectionRect.width - cornerSize + 1.5, selectionRect.y + selectionRect.height - 1.5, cornerSize, 3);
                    selectorCtx.fillRect(selectionRect.x + selectionRect.width - 1.5, selectionRect.y + selectionRect.height - cornerSize + 1.5, 3, cornerSize);
                }
            } catch (error) {
                console.error('繪製錯誤:', error);
            }
            
            requestAnimationFrame(drawFrame);
        };
        
        setTimeout(() => drawFrame(), 500);
        setupSelectionEvents();

        selectorStream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('使用者停止了螢幕共享');
            cancelSelection();
        });

    } catch (error) {
        console.error('無法開啟視訊選擇器:', error);
        let errorMessage = '無法開啟視訊選擇器';
        if (error.name === 'NotAllowedError') errorMessage = '您拒絕了螢幕共享權限,請重新嘗試並允許共享';
        else if (error.name === 'NotFoundError') errorMessage = '找不到可用的螢幕或視窗';
        else if (error.message) errorMessage += ': ' + error.message;
        showNotification(errorMessage, 'error');
        cleanupSelector();
    }
}

// 設定滑鼠選擇事件
function setupSelectionEvents() {
    const canvas = selectorCanvas;
    const rect = canvas.getBoundingClientRect();
    
    const getCanvasCoords = (e) => {
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    canvas.addEventListener('mousedown', (e) => {
        const coords = getCanvasCoords(e);
        isSelecting = true;
        selectionStart = coords;
        selectionRect = { x: coords.x, y: coords.y, width: 0, height: 0 };
        updateSelectorInfo();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isSelecting || !selectionStart) return;
        const coords = getCanvasCoords(e);
        const width = coords.x - selectionStart.x;
        const height = coords.y - selectionStart.y;
        selectionRect = {
            x: width < 0 ? coords.x : selectionStart.x,
            y: height < 0 ? coords.y : selectionStart.y,
            width: Math.abs(width),
            height: Math.abs(height)
        };
        updateSelectorInfo();
    });

    canvas.addEventListener('mouseup', () => {
        if (isSelecting && selectionRect && selectionRect.width > 10 && selectionRect.height > 10) {
            document.getElementById('confirm-btn').disabled = false;
        }
        isSelecting = false;
    });
}

// 更新選擇器資訊
function updateSelectorInfo() {
    if (!selectionRect || !selectorCanvas) return;
    const x = Math.round(selectionRect.x);
    const y = Math.round(selectionRect.y);
    const w = Math.round(selectionRect.width);
    const h = Math.round(selectionRect.height);
    
    const xPercent = ((x / selectorCanvas.width) * 100).toFixed(1);
    const yPercent = ((y / selectorCanvas.height) * 100).toFixed(1);
    const wPercent = ((w / selectorCanvas.width) * 100).toFixed(1);
    const hPercent = ((h / selectorCanvas.height) * 100).toFixed(1);
    
    document.getElementById('selector-coords').textContent = 
        `位置: ${x}, ${y} (${xPercent}%, ${yPercent}%) | 大小: ${w} x ${h} (${wPercent}% x ${hPercent}%)`;
}

// 確認選擇
function confirmSelection() {
    if (!selectionRect || !selectorCanvas) return;
    
    scanArea = {
        x: parseFloat(((selectionRect.x / selectorCanvas.width) * 100).toFixed(2)),
        y: parseFloat(((selectionRect.y / selectorCanvas.height) * 100).toFixed(2)),
        width: parseFloat(((selectionRect.width / selectorCanvas.width) * 100).toFixed(2)),
        height: parseFloat(((selectionRect.height / selectorCanvas.height) * 100).toFixed(2))
    };
    
    localStorage.setItem('scanArea', JSON.stringify(scanArea));
    showNotification(`掃描區域已更新！\n位置: ${scanArea.x}%, ${scanArea.y}%\n大小: ${scanArea.width}% x ${scanArea.height}%`, 'success');
    
    cleanupSelector();
}

// 取消選擇
function cancelSelection() {
    cleanupSelector();
}

// 清理選擇器
function cleanupSelector() {
    if (selectorStream) {
        selectorStream.getTracks().forEach(track => track.stop());
        selectorStream = null;
    }
    
    selectorVideo = null;
    selectorCanvas = null;
    selectorCtx = null;
    isSelecting = false;
    selectionStart = null;
    selectionRect = null;
    
    const overlay = document.getElementById('scan-selector-overlay');
    if (overlay) overlay.remove();
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
            video: { mediaSource: 'screen', frameRate: { ideal: 1, max: 5 } }
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

// ===== 恢復：統計功能 =====

// 初始化統計數據
function initializeStatistics() {
    Object.keys(BOSS_DATA).forEach(bossName => {
        if (!bossStatistics[bossName]) {
            bossStatistics[bossName] = {
                totalKills: 0,
                todayKills: 0,
                lastResetDate: getTodayDateString(),
                lastKillTime: null,
                channelDistribution: {}
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
function updateBossStatistics(bossName, channel) {
    if (!bossStatistics[bossName]) {
        bossStatistics[bossName] = {
            totalKills: 0,
            todayKills: 0,
            lastResetDate: getTodayDateString(),
            lastKillTime: null,
            channelDistribution: {}
        };
    }

    const today = getTodayDateString();
    if (bossStatistics[bossName].lastResetDate !== today) {
        bossStatistics[bossName].todayKills = 0;
        bossStatistics[bossName].lastResetDate = today;
    }

    bossStatistics[bossName].totalKills++;
    bossStatistics[bossName].todayKills++;
    bossStatistics[bossName].lastKillTime = new Date().toISOString();
    
    // 更新頻道分佈
    if (!bossStatistics[bossName].channelDistribution) {
        bossStatistics[bossName].channelDistribution = {};
    }
    const channelKey = String(channel);
    bossStatistics[bossName].channelDistribution[channelKey] = 
        (bossStatistics[bossName].channelDistribution[channelKey] || 0) + 1;
    
    saveData();
    
    // 自動發送統計到 Discord（靜默發送）
    if (typeof sendStatisticsToDiscord === 'function') {
        sendStatisticsToDiscord(bossStatistics);
    }
}

// 更新統計顯示
function updateStatisticsDisplay() {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;
    
    const today = getTodayDateString();
    
    document.getElementById('stats-date').textContent = new Date().toLocaleDateString('zh-TW');
    
    let totalToday = 0;
    let totalAll = 0;

    let html = '';
    Object.entries(BOSS_DATA).forEach(([bossName, info]) => {
        const stats = bossStatistics[bossName] || { totalKills: 0, todayKills: 0 };
        
        totalToday += stats.todayKills;
        totalAll += stats.totalKills;

        const bossImageHtml = info.image ? 
            `<img src="${info.image}" alt="${bossName}" class="stats-card-image">` : 
            `<span style="color: ${info.color}">●</span>`;

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
            bossStatistics[bossName].lastKillTime = null;
            bossStatistics[bossName].channelDistribution = {};
        });
        saveData();
        updateStatisticsDisplay();
        showNotification('已清空所有統計數據', 'success');
    }
}

// ===== 恢復：個別 BOSS Webhook 功能 =====

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
    if (!container) return;
    
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
    const countElement = document.getElementById('individual-webhook-count');
    const totalElement = document.getElementById('total-boss-count');
    if (countElement) countElement.textContent = configuredCount;
    if (totalElement) totalElement.textContent = totalCount;
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
    populateBossWebhooksList();
    showNotification(`✅ 已儲存 ${savedCount} 個 BOSS 的 Webhook 設定`, 'success');
}

// 測試單個 BOSS 的 Webhook
async function testSingleBossWebhook(bossName) {
    const input = document.getElementById(`webhook-${bossName}`);
    const webhookUrl = input.value.trim();

    if (!webhookUrl) {
        showNotification(`請先輸入 ${bossName} 的 Webhook URL`, 'warning');
        return;
    }

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
        
        const individualWebhooks = loadIndividualWebhooks();
        delete individualWebhooks[bossName];
        saveIndividualWebhooks(individualWebhooks);
        
        populateBossWebhooksList();
        showNotification(`已清除 ${bossName} 的 Webhook 設定`, 'success');
    }
}

// 清除所有個別 Webhook
function clearAllIndividualWebhooks() {
    if (confirm('確定要清除所有個別 BOSS 的 Webhook 設定嗎？')) {
        localStorage.removeItem('individualBossWebhooks');
        populateBossWebhooksList();
        showNotification('已清除所有個別 BOSS 的 Webhook 設定', 'success');
    }
}

// 發送個別 BOSS 的 Webhook 通知
async function sendIndividualBossWebhookNotification(record) {
    const individualWebhooks = loadIndividualWebhooks();
    const webhookUrl = individualWebhooks[record.bossName];
    
    if (!webhookUrl) return false;

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
                value: record.map || BOSS_DATA[record.bossName]?.maps[0] || '未知',
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
        return true;
    } catch (error) {
        console.error(`${record.bossName} 個別 Webhook 發送失敗:`, error);
        return false;
    }
}

// ===== 恢復：巡邏打卡功能 =====

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
        showNotification(`已記錄 ${record.bossName} 的巡邏時間`, 'success');
    }
}

// ===== 原有功能 =====

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

// BOSS選擇事件
let bossInfoTimeout = null; // 用於存儲計時器

const PAIRED_BOSS_MAP = { '書生幽靈': '九尾妖狐', '九尾妖狐': '書生幽靈' };

function swapPairedBoss() {
    const select = document.getElementById('boss-select');
    const paired = PAIRED_BOSS_MAP[select.value];
    if (!paired) return;
    select.value = paired;
    onBossSelected();
}

function onBossSelected() {
    const bossName = document.getElementById('boss-select').value;
    const mapSelectContainer = document.getElementById('map-select-container');
    const previewImage = document.getElementById('boss-preview-image');
    const bossInfoCard = document.getElementById('boss-info');

    // 切換按鈕：只有書生或九尾時顯示
    const swapBtn = document.getElementById('swap-boss-btn');
    if (swapBtn) {
        const paired = PAIRED_BOSS_MAP[bossName];
        swapBtn.style.display = paired ? 'block' : 'none';
        if (paired) swapBtn.title = `切換為 ${paired}`;
    }
    
    // 清除之前的計時器
    if (bossInfoTimeout) {
        clearTimeout(bossInfoTimeout);
        bossInfoTimeout = null;
    }
    
    if (bossName && BOSS_DATA[bossName]) {
        const info = BOSS_DATA[bossName];
        
        if (info.hasMapSelect) {
            mapSelectContainer.style.display = 'block';
            const mapSelect = document.getElementById('map-select');
            mapSelect.innerHTML = '';
            info.maps.forEach((mapName, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = mapName;
                mapSelect.appendChild(option);
            });
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
        
        // 5 秒後自動隱藏
        bossInfoTimeout = setTimeout(() => {
            bossInfoCard.style.display = 'none';
            bossInfoTimeout = null;
        }, 5000);
    } else {
        bossInfoCard.style.display = 'none';
        mapSelectContainer.style.display = 'none';
        previewImage.style.display = 'none';
    }
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

