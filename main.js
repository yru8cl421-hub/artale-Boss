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

function onBossSelected() {
    const bossName = document.getElementById('boss-select').value;
    const mapSelectContainer = document.getElementById('map-select-container');
    const previewImage = document.getElementById('boss-preview-image');
    const bossInfoCard = document.getElementById('boss-info');
    
    // 清除之前的計時器
    if (bossInfoTimeout) {
        clearTimeout(bossInfoTimeout);
        bossInfoTimeout = null;
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

// 記錄BOSS擊殺
function recordBoss() {
    const bossName = document.getElementById('boss-select').value;
    const channel = document.getElementById('channel-input').value;
    const customTimeInput = document.getElementById('custom-time-input').value.trim();

    if (!bossName) {
        showNotification('請選擇BOSS', 'warning');
        return;
    }

    if (!channel) {
        showNotification('請輸入頻道', 'warning');
        return;
    }

    const info = BOSS_DATA[bossName];
    
    // 使用自訂時間或當前時間
    let deathTime;
    if (customTimeInput) {
        // 解析多種時間格式
        let hours, minutes;
        
        // 格式1: 純數字 (例如: 1106, 906, 2359)
        if (/^\d{3,4}$/.test(customTimeInput)) {
            const timeStr = customTimeInput.padStart(4, '0'); // 906 -> 0906
            hours = parseInt(timeStr.substring(0, 2));
            minutes = parseInt(timeStr.substring(2, 4));
        }
        // 格式2: HH:MM 或 H:MM (例如: 11:06, 9:06)
        else if (/^\d{1,2}:\d{2}$/.test(customTimeInput)) {
            const parts = customTimeInput.split(':');
            hours = parseInt(parts[0]);
            minutes = parseInt(parts[1]);
        }
        // 格式3: HH.MM 或 H.MM (例如: 11.06, 9.06)
        else if (/^\d{1,2}\.\d{2}$/.test(customTimeInput)) {
            const parts = customTimeInput.split('.');
            hours = parseInt(parts[0]);
            minutes = parseInt(parts[1]);
        }
        // 格式4: HH MM 或 H MM (例如: 11 06, 9 06)
        else if (/^\d{1,2}\s+\d{2}$/.test(customTimeInput)) {
            const parts = customTimeInput.split(/\s+/);
            hours = parseInt(parts[0]);
            minutes = parseInt(parts[1]);
        }
        else {
            showNotification('時間格式錯誤，支援格式：1106、11:06、11.06 或 11 06', 'error');
            return;
        }
        
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            showNotification('時間範圍錯誤（小時: 0-23，分鐘: 0-59）', 'error');
            return;
        }
        
        deathTime = new Date();
        deathTime.setHours(hours, minutes, 0, 0);
        
        // 如果輸入的時間比現在晚很多，可能是昨天的時間
        const now = new Date();
        if (deathTime > now) {
            const timeDiff = deathTime - now;
            // 如果未來時間超過12小時，假設是昨天
            if (timeDiff > 12 * 60 * 60 * 1000) {
                deathTime.setDate(deathTime.getDate() - 1);
            }
        }
    } else {
        deathTime = new Date();
    }
    
    const respawnMin = new Date(deathTime.getTime() + info.min * 60000);
    const respawnMax = new Date(deathTime.getTime() + info.max * 60000);

    let mapLocation = info.maps[0];
    if (info.hasMapSelect) {
        const selectedMap = document.getElementById('map-select').value;
        mapLocation = selectedMap === '7' ? '夜市徒步區7' : '夜市徒步區7-1';
    }

    const existingRecordIndex = activeBosses.findIndex(
        b => b.bossName === bossName && b.channel === channel && b.map === mapLocation
    );

    if (existingRecordIndex !== -1) {
        const existingRecord = activeBosses[existingRecordIndex];
        existingRecord.map = mapLocation;
        existingRecord.deathTime = deathTime.toISOString();
        existingRecord.respawnMin = respawnMin.toISOString();
        existingRecord.respawnMax = respawnMax.toISOString();
        existingRecord.notified = false;
        existingRecord.lastPatrolTime = null;
        
        updateBossStatistics(bossName, channel);
        
        saveData();
        updateAllDisplays();

        sendIndividualBossWebhookNotification(existingRecord).catch(err => {});
        sendUserWebhookNotification(existingRecord).catch(err => {});
        sendToGoogleSheets(existingRecord).catch(err => {});

        showNotification(
            `頻道 ${channel} - ${bossName}\n地圖: ${mapLocation}\n已更新擊殺時間！`,
            'success'
        );
    } else {
        const record = {
            id: Date.now(),
            channel: channel,
            bossName: bossName,
            map: mapLocation,
            deathTime: deathTime.toISOString(),
            respawnMin: respawnMin.toISOString(),
            respawnMax: respawnMax.toISOString(),
            notified: false,
            lastPatrolTime: null
        };

        activeBosses.push(record);
        
        updateBossStatistics(bossName, channel);
        
        saveData();
        updateAllDisplays();

        sendIndividualBossWebhookNotification(record).catch(err => {});
        sendUserWebhookNotification(record).catch(err => {});
        sendToGoogleSheets(record).catch(err => {});

        showNotification(
            `頻道 ${channel} - ${bossName}\n地圖: ${mapLocation}\n擊殺時間已記錄！`,
            'success'
        );
    }

    document.getElementById('channel-input').value = '';
    document.getElementById('custom-time-input').value = '';
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
        
        updateBossStatistics(record.bossName, record.channel);
        
        saveData();
        updateAllDisplays();
        
        sendIndividualBossWebhookNotification(record).catch(err => {});
        sendUserWebhookNotification(record).catch(err => {});
        sendToGoogleSheets(record).catch(err => {});
        
        showNotification(`已重新計時 ${record.bossName}！`, 'success');
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

// 更新所有顯示
function updateAllDisplays() {
    checkAndResetDailyStats();
    updateRecordDisplay();
    updateStatisticsDisplay();
    updateBossCount();
}

// 更新記錄顯示
function updateRecordDisplay() {
    const container = document.getElementById('record-container');
    const now = new Date();

    if (activeBosses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #a0a0c0; padding: 40px 0;">目前沒有記錄中的BOSS</p>';
        return;
    }

    const sorted = [...activeBosses].sort((a, b) => 
        new Date(a.respawnMin) - new Date(b.respawnMin)
    );

    container.innerHTML = sorted.map(record => {
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

        const respawnBtnHtml = showRespawnBtn ? 
            `<button type="button" class="boss-icon-btn" onclick="respawnSingleBoss(${record.id})" title="重新計時">🔄</button>` : '';
        const patrolBtnHtml = showPatrolBtn ? 
            `<button type="button" class="boss-icon-btn" onclick="patrolSingleBoss(${record.id})" title="巡邏打卡">👀</button>` : '';

        const bossImage = bossInfo && bossInfo.image ? 
            `<img src="${bossInfo.image}" alt="${record.bossName}" class="boss-image">` : '';

        return `
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
    }).join('');
}

// 更新BOSS計數
function updateBossCount() {
    document.getElementById('boss-count').textContent = activeBosses.length;
}

// 格式化時間差
function formatTimeDiff(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}小時${minutes}分` : `${minutes}分鐘`;
}

// 格式化日期
function formatDate(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
}

// 格式化時間
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatDateTime(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
}

// 顯示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 顯示頻道偵測使用說明
function showChannelDetectionHelp() {
    const overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    overlay.innerHTML = `
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
                    border-radius: 16px; 
                    padding: 30px; 
                    max-width: 700px; 
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                    border: 2px solid #00ccff;
                    box-shadow: 0 8px 32px rgba(0, 204, 255, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
                <h2 style="color: #00ff99; margin: 0; font-size: 1.8em;">📖 頻道偵測使用說明</h2>
                <button onclick="this.closest('#help-overlay').remove()" 
                        style="background: #ef4444; 
                               border: none; 
                               color: white; 
                               width: 36px; 
                               height: 36px; 
                               border-radius: 50%; 
                               cursor: pointer; 
                               font-size: 1.3em;
                               display: flex;
                               align-items: center;
                               justify-content: center;
                               transition: all 0.3s;">✕</button>
            </div>
            
            <div style="color: #e0e0e0; line-height: 1.8; font-size: 1.05em;">
                <div style="background: rgba(16, 185, 129, 0.15); 
                            padding: 20px; 
                            border-radius: 12px; 
                            border-left: 4px solid #10b981; 
                            margin-bottom: 25px;">
                    <h3 style="color: #10b981; margin: 0 0 15px 0; font-size: 1.3em;">✨ 功能介紹</h3>
                    <p style="margin: 0; color: #d1d5db;">
                        頻道偵測功能可以自動識別遊戲畫面中的「頻道的 XXXX」文字，自動填入頻道號碼，讓你不用手動輸入！
                    </p>
                </div>

                <div style="background: rgba(59, 130, 246, 0.15); 
                            padding: 20px; 
                            border-radius: 12px; 
                            border-left: 4px solid #3b82f6; 
                            margin-bottom: 25px;">
                    <h3 style="color: #3b82f6; margin: 0 0 15px 0; font-size: 1.3em;">🎯 按鈕功能說明</h3>
                    <div style="display: grid; gap: 15px;">
                        <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px;">
                            <div style="color: #fbbf24; font-weight: bold; margin-bottom: 8px;">🎯 螢幕監控</div>
                            <div style="color: #d1d5db; font-size: 0.95em;">開始/停止自動偵測頻道號碼。點擊後會要求分享螢幕，然後每秒自動掃描並填入頻道號碼。</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px;">
                            <div style="color: #a78bfa; font-weight: bold; margin-bottom: 8px;">⚙️ 調整掃描位置</div>
                            <div style="color: #d1d5db; font-size: 0.95em;">首次使用必須設定！用滑鼠框選遊戲畫面中「頻道的 XXXX」的文字區域，系統會記住這個位置。</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px;">
                            <div style="color: #f59e0b; font-weight: bold; margin-bottom: 8px;">👁️ 預覽掃描區域</div>
                            <div style="color: #d1d5db; font-size: 0.95em;">查看當前設定的掃描區域是否正確，可以確認框選位置有沒有偏移。</div>
                        </div>
                    </div>
                </div>

                <div style="background: rgba(245, 158, 11, 0.15); 
                            padding: 20px; 
                            border-radius: 12px; 
                            border-left: 4px solid #f59e0b; 
                            margin-bottom: 25px;">
                    <h3 style="color: #f59e0b; margin: 0 0 15px 0; font-size: 1.3em;">📋 使用步驟</h3>
                    <ol style="margin: 0; padding-left: 25px; color: #d1d5db;">
                        <li style="margin-bottom: 12px;">
                            <strong style="color: #fbbf24;">第一次使用：</strong>點擊 ⚙️ 調整掃描位置，框選「頻道的 XXXX」文字區域
                        </li>
                        <li style="margin-bottom: 12px;">
                            <strong style="color: #fbbf24;">開始偵測：</strong>點擊 🎯 螢幕監控，選擇要分享的遊戲視窗
                        </li>
                        <li style="margin-bottom: 12px;">
                            <strong style="color: #fbbf24;">自動填入：</strong>系統會每秒自動識別頻道號碼並填入
                        </li>
                        <li style="margin-bottom: 12px;">
                            <strong style="color: #fbbf24;">停止偵測：</strong>再次點擊 🎯 螢幕監控即可停止
                        </li>
                    </ol>
                </div>

                <div style="background: rgba(239, 68, 68, 0.15); 
                            padding: 20px; 
                            border-radius: 12px; 
                            border-left: 4px solid #ef4444;">
                    <h3 style="color: #ef4444; margin: 0 0 15px 0; font-size: 1.3em;">⚠️ 注意事項</h3>
                    <ul style="margin: 0; padding-left: 25px; color: #d1d5db;">
                        <li style="margin-bottom: 10px;">請確保「頻道的 XXXX」文字清晰可見</li>
                        <li style="margin-bottom: 10px;">框選區域時盡量貼合文字邊緣</li>
                        <li style="margin-bottom: 10px;">如果識別不準確，可以重新調整掃描位置</li>
                        <li style="margin-bottom: 10px;">分享螢幕時請選擇遊戲視窗（不要選整個螢幕）</li>
                    </ul>
                </div>

                <div style="text-align: center; margin-top: 25px;">
                    <button onclick="this.closest('#help-overlay').remove()" 
                            style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                                   border: 2px solid #10b981; 
                                   color: white; 
                                   padding: 12px 40px; 
                                   border-radius: 8px; 
                                   cursor: pointer; 
                                   font-size: 1.1em; 
                                   font-weight: bold;
                                   transition: all 0.3s;
                                   box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
                        我知道了
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 點擊背景關閉
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}


// 切換分頁
function switchTab(index) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach((tab, i) => {
        if (i === index) {
            tab.classList.add('active');
            contents[i].classList.add('active');
        } else {
            tab.classList.remove('active');
            contents[i].classList.remove('active');
        }
    });
    if (index === 2) updateStatistics();
}

// 填充 BOSS 列表表格
function populateBossListTable() {
    const tbody = document.getElementById('boss-list-tbody');
    tbody.innerHTML = Object.entries(BOSS_DATA)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, data]) => {
            const imageHtml = data.image ? 
                `<img src="${data.image}" alt="${name}" style="width:50px;height:50px;object-fit:contain;" onerror="this.style.display='none'">` : 
                '<span style="color:#666;">無圖片</span>';
            return `
                <tr>
                    <td style="text-align:center;">${imageHtml}</td>
                    <td><strong>${name}</strong></td>
                    <td>${formatTimeRange(data.min, data.max)}</td>
                    <td>${data.maps.join(', ')}</td>
                </tr>
            `;
        }).join('');
}

// 更新統計資料
function updateStatistics() {
    const tbody = document.getElementById('stats-tbody');
    if (!tbody) return;
    
    const entries = Object.entries(bossStatistics)
        .filter(([_, stats]) => stats.totalKills > 0)
        .sort(([_, a], [__, b]) => b.totalKills - a.totalKills);
    
    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">尚無擊殺記錄</td></tr>';
        return;
    }
    
    tbody.innerHTML = entries.map(([bossName, stats]) => {
        const lastKill = stats.lastKillTime ? formatDate(new Date(stats.lastKillTime)) : '無';
        const topChannels = Object.entries(stats.channelDistribution || {})
            .sort(([_, a], [__, b]) => b - a)
            .slice(0, 3)
            .map(([ch, count]) => `${ch}頻 (${count}次)`)
            .join(', ');
        return `
            <tr>
                <td><strong>${bossName}</strong></td>
                <td style="text-align:center;">${stats.totalKills}</td>
                <td>${lastKill}</td>
                <td>${topChannels || '無'}</td>
            </tr>
        `;
    }).join('');
}

// ========== 統一通知設定 ==========

// 載入統一 Webhook
function loadUnifiedWebhook() {
    const saved = localStorage.getItem('unifiedWebhook');
    if (saved) {
        const input = document.getElementById('unified-webhook');
        if (input) input.value = saved;
        updateUnifiedWebhookStatus(true);
    } else {
        updateUnifiedWebhookStatus(false);
    }
    updateWebhookList();
}

// 更新統一 Webhook 狀態顯示
function updateUnifiedWebhookStatus(hasWebhook) {
    const statusDiv = document.getElementById('unified-webhook-status');
    const statusText = document.getElementById('unified-webhook-status-text');
    
    if (!statusDiv || !statusText) return;
    
    statusDiv.style.display = 'block';
    
    if (hasWebhook) {
        statusDiv.style.background = 'rgba(16, 185, 129, 0.2)';
        statusDiv.style.border = '1px solid #10b981';
        statusText.innerHTML = '✅ Webhook 已設定並保存';
        statusText.style.color = '#10b981';
    } else {
        statusDiv.style.background = 'rgba(100, 116, 139, 0.2)';
        statusDiv.style.border = '1px solid #64748b';
        statusText.innerHTML = '⚙️ 尚未設定 Webhook';
        statusText.style.color = '#94a3b8';
    }
}

// 保存統一 Webhook
function saveUnifiedWebhook() {
    const input = document.getElementById('unified-webhook');
    const url = input.value.trim();
    
    if (url && !url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        updateUnifiedWebhookStatus(false);
        return;
    }
    
    localStorage.setItem('unifiedWebhook', url);
    
    if (url) {
        showNotification('統一通知 Webhook 已保存 ✅', 'success');
        updateUnifiedWebhookStatus(true);
    } else {
        updateUnifiedWebhookStatus(false);
    }
    
    updateWebhookList();
}

// 測試統一 Webhook
async function testUnifiedWebhook() {
    const input = document.getElementById('unified-webhook');
    const url = input.value.trim();
    
    if (!url) {
        showNotification('請先輸入 Webhook URL', 'warning');
        return;
    }
    
    if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        return;
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: '🧪 統一通知測試',
                    description: '這是統一通知的測試訊息，如果您看到這則訊息，表示設定成功！',
                    color: 0x00ff99,
                    timestamp: new Date().toISOString(),
                    footer: { text: '楓之谷BOSS重生時間系統 - 統一通知' }
                }]
            })
        });
        
        if (response.ok) {
            showNotification('✅ 測試成功！請檢查您的 Discord 頻道', 'success');
        } else {
            showNotification('❌ 測試失敗，請檢查 Webhook URL 是否正確', 'error');
        }
    } catch (error) {
        console.error('測試失敗:', error);
        showNotification('❌ 測試失敗，請檢查網路連線', 'error');
    }
}

// 清除統一 Webhook
function clearUnifiedWebhook() {
    if (confirm('確定要清除統一通知設定嗎？')) {
        localStorage.removeItem('unifiedWebhook');
        const input = document.getElementById('unified-webhook');
        if (input) input.value = '';
        showNotification('統一通知設定已清除', 'success');
        updateUnifiedWebhookStatus(false);
        updateWebhookList();
    }
}

// ========== 個別 BOSS 通知設定 ==========

// 載入個別 BOSS Webhook
function loadBossWebhook() {
    const select = document.getElementById('boss-webhook-select');
    const bossName = select.value;
    const configDiv = document.getElementById('boss-webhook-config');
    const urlInput = document.getElementById('boss-webhook-url');
    
    if (!bossName) {
        configDiv.style.display = 'none';
        return;
    }
    
    configDiv.style.display = 'block';
    
    const individualWebhooks = loadIndividualWebhooks();
    urlInput.value = individualWebhooks[bossName] || '';
}

// 保存個別 BOSS Webhook
function saveBossWebhook() {
    const select = document.getElementById('boss-webhook-select');
    const bossName = select.value;
    const urlInput = document.getElementById('boss-webhook-url');
    const url = urlInput.value.trim();
    
    if (!bossName) {
        showNotification('請先選擇 BOSS', 'warning');
        return;
    }
    
    if (url && !url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        return;
    }
    
    const individualWebhooks = loadIndividualWebhooks();
    
    if (url) {
        individualWebhooks[bossName] = url;
        showNotification(`${bossName} 的 Webhook 已保存 ✅`, 'success');
    } else {
        delete individualWebhooks[bossName];
        showNotification(`${bossName} 的 Webhook 已清除`, 'success');
    }
    
    saveIndividualWebhooks(individualWebhooks);
    updateWebhookList();
}

// 測試個別 BOSS Webhook
async function testBossWebhook() {
    const select = document.getElementById('boss-webhook-select');
    const bossName = select.value;
    const urlInput = document.getElementById('boss-webhook-url');
    const url = urlInput.value.trim();
    
    if (!bossName) {
        showNotification('請先選擇 BOSS', 'warning');
        return;
    }
    
    if (!url) {
        showNotification('請先輸入 Webhook URL', 'warning');
        return;
    }
    
    if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        return;
    }
    
    try {
        const bossData = BOSS_DATA[bossName];
        const color = parseInt(bossData.color.replace('#', ''), 16);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: `🧪 ${bossName} 專屬通知測試`,
                    description: `這是 **${bossName}** 的測試訊息，如果您看到這則訊息，表示設定成功！`,
                    color: color,
                    fields: [
                        { name: '地圖位置', value: bossData.maps.join('、'), inline: false },
                        { name: '重生時間', value: `${bossData.min} ~ ${bossData.max} 分鐘`, inline: false }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: `楓之谷BOSS重生時間系統 - ${bossName} 專屬通知` }
                }]
            })
        });
        
        if (response.ok) {
            showNotification('✅ 測試成功！請檢查您的 Discord 頻道', 'success');
        } else {
            showNotification('❌ 測試失敗，請檢查 Webhook URL 是否正確', 'error');
        }
    } catch (error) {
        console.error('測試失敗:', error);
        showNotification('❌ 測試失敗，請檢查網路連線', 'error');
    }
}

// 清除個別 BOSS Webhook
function clearBossWebhook() {
    const select = document.getElementById('boss-webhook-select');
    const bossName = select.value;
    
    if (!bossName) {
        showNotification('請先選擇 BOSS', 'warning');
        return;
    }
    
    if (confirm(`確定要清除 ${bossName} 的 Webhook 設定嗎？`)) {
        const individualWebhooks = loadIndividualWebhooks();
        delete individualWebhooks[bossName];
        saveIndividualWebhooks(individualWebhooks);
        
        const urlInput = document.getElementById('boss-webhook-url');
        if (urlInput) urlInput.value = '';
        
        showNotification(`${bossName} 的 Webhook 設定已清除`, 'success');
        updateWebhookList();
    }
}

// 更新 Webhook 列表顯示
function updateWebhookList() {
    const container = document.getElementById('webhook-list');
    if (!container) return;
    
    const unifiedWebhook = localStorage.getItem('unifiedWebhook');
    const individualWebhooks = loadIndividualWebhooks();
    
    let html = '';
    
    // 統一通知狀態
    if (unifiedWebhook) {
        html += `
            <div style="background: rgba(16, 185, 129, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #10b981; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="color: #10b981; font-weight: bold; margin-bottom: 5px;">✅ 統一通知</p>
                        <p style="color: #a0a0c0; font-size: 0.9em;">所有 BOSS 擊殺都會發送到此 Webhook</p>
                    </div>
                    <span style="color: #10b981; font-size: 2em;">📢</span>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="background: rgba(239, 68, 68, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="color: #ef4444; font-weight: bold; margin-bottom: 5px;">❌ 統一通知未設定</p>
                        <p style="color: #a0a0c0; font-size: 0.9em;">請在上方設定統一通知 Webhook</p>
                    </div>
                    <span style="color: #ef4444; font-size: 2em;">📢</span>
                </div>
            </div>
        `;
    }
    
    // 個別 BOSS 通知列表
    const individualCount = Object.keys(individualWebhooks).length;
    if (individualCount > 0) {
        html += `
            <div style="background: rgba(168, 85, 247, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #a855f7; margin-bottom: 10px;">
                <p style="color: #a855f7; font-weight: bold; margin-bottom: 10px;">🎯 已設定個別通知的 BOSS (${individualCount})</p>
                <div style="display: grid; gap: 8px;">
        `;
        
        for (const [bossName, webhookUrl] of Object.entries(individualWebhooks)) {
            const bossData = BOSS_DATA[bossName];
            html += `
                <div style="background: rgba(0, 0, 0, 0.3); padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${bossData.image ? `<img src="${bossData.image}" alt="${bossName}" style="width: 32px; height: 32px; object-fit: contain;">` : ''}
                        <span style="color: ${bossData.color}; font-weight: bold;">${bossName}</span>
                    </div>
                    <span style="color: #10b981;">✅</span>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="background: rgba(100, 116, 139, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #64748b;">
                <p style="color: #94a3b8; font-weight: bold; margin-bottom: 5px;">🎯 個別通知</p>
                <p style="color: #a0a0c0; font-size: 0.9em;">尚未設定任何個別 BOSS 通知</p>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// 載入用戶 Webhook 設定 (更新以支持新介面)
function loadUserWebhook() {
    // 載入統一通知設定
    loadUnifiedWebhook();
    
    // 生成所有 BOSS 的 Webhook 設定卡片
    generateAllBossWebhookCards();
    
    // 保留舊版 webhook-url 的兼容性
    const saved = localStorage.getItem('userWebhook');
    if (saved) {
        const input = document.getElementById('webhook-url');
        if (input) input.value = saved;
        updateWebhookStatus();
    }
}

// 展開/收起狀態
let allBossWebhooksExpanded = false;

// 切換展開/收起所有 BOSS Webhook
function toggleAllBossWebhooks() {
    allBossWebhooksExpanded = !allBossWebhooksExpanded;
    const button = document.getElementById('toggle-all-boss-webhooks');
    
    if (allBossWebhooksExpanded) {
        button.innerHTML = '📂 收起全部';
        button.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        button.style.borderColor = '#ef4444';
    } else {
        button.innerHTML = '📋 展開全部';
        button.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
        button.style.borderColor = '#8b5cf6';
    }
    
    // 更新所有卡片的展開狀態
    const allCards = document.querySelectorAll('.boss-webhook-card-content');
    allCards.forEach(card => {
        card.style.display = allBossWebhooksExpanded ? 'block' : 'none';
    });
}

// 切換單個 BOSS Webhook 卡片
function toggleBossWebhookCard(bossName) {
    const content = document.getElementById(`boss-webhook-content-${bossName.replace(/\s/g, '-')}`);
    const icon = document.getElementById(`boss-webhook-icon-${bossName.replace(/\s/g, '-')}`);
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// 生成所有 BOSS 的 Webhook 設定卡片
function generateAllBossWebhookCards() {
    const container = document.getElementById('all-boss-webhooks-container');
    if (!container) return;
    
    const individualWebhooks = loadIndividualWebhooks();
    let html = '';
    
    for (const [bossName, bossData] of Object.entries(BOSS_DATA)) {
        const webhookUrl = individualWebhooks[bossName] || '';
        const hasWebhook = webhookUrl !== '';
        const statusColor = hasWebhook ? '#10b981' : '#64748b';
        const statusText = hasWebhook ? '✅ 已設定' : '⚙️ 未設定';
        const cardId = bossName.replace(/\s/g, '-');
        
        html += `
            <div class="boss-webhook-card" style="margin-bottom: 12px; border-radius: 12px; overflow: hidden; 
                 background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.3) 100%); 
                 border: 2px solid ${hasWebhook ? '#10b981' : '#374151'};
                 box-shadow: 0 4px 15px ${hasWebhook ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 0, 0, 0.3)'};
                 transition: all 0.3s ease;">
                
                <!-- 卡片標題 (可點擊展開/收起) -->
                <div onclick="toggleBossWebhookCard('${bossName}')" 
                     style="padding: 15px 18px; cursor: pointer; display: flex; justify-content: space-between; 
                            align-items: center; 
                            background: ${hasWebhook ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)' : 'linear-gradient(135deg, rgba(55, 65, 81, 0.3) 0%, rgba(31, 41, 55, 0.2) 100%)'}; 
                            transition: all 0.3s ease;"
                     onmouseover="this.style.background='${hasWebhook ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.15) 100%)' : 'linear-gradient(135deg, rgba(75, 85, 99, 0.4) 0%, rgba(55, 65, 81, 0.3) 100%)'}'"
                     onmouseout="this.style.background='${hasWebhook ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)' : 'linear-gradient(135deg, rgba(55, 65, 81, 0.3) 0%, rgba(31, 41, 55, 0.2) 100%)'}'">
                    
                    <div style="display: flex; align-items: center; gap: 15px;">
                        ${bossData.image ? `<img src="${bossData.image}" alt="${bossName}" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">` : ''}
                        <div>
                            <div style="color: ${bossData.color}; font-weight: bold; font-size: 1.15em; 
                                        text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${bossName}</div>
                            <div style="color: #94a3b8; font-size: 0.85em; margin-top: 2px;">
                                ⏱️ 重生: ${bossData.min}~${bossData.max} 分鐘
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="color: ${statusColor}; font-weight: bold; font-size: 0.95em; 
                                     padding: 4px 12px; background: ${hasWebhook ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)'};
                                     border-radius: 20px; border: 1px solid ${statusColor};">
                            ${statusText}
                        </span>
                        <span id="boss-webhook-icon-${cardId}" 
                              style="color: #a0a0c0; font-size: 1em; font-weight: bold;">▶</span>
                    </div>
                </div>
                
                <!-- 卡片內容 (預設收起) -->
                <div id="boss-webhook-content-${cardId}" class="boss-webhook-card-content" 
                     style="display: none; padding: 20px; border-top: 2px solid ${hasWebhook ? 'rgba(16, 185, 129, 0.3)' : '#374151'};
                            background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%);">
                    
                    <!-- 美化的 Webhook URL 輸入區域 -->
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                            <span style="font-size: 1.2em;">🔗</span>
                            <label style="color: #cbd5e1; font-weight: bold; font-size: 0.95em;">
                                Discord Webhook URL
                            </label>
                        </div>
                        
                        <div style="position: relative;">
                            <input type="url" 
                                   id="individual-webhook-${cardId}" 
                                   value="${webhookUrl}"
                                   placeholder="https://discord.com/api/webhooks/..."
                                   style="width: 100%; padding: 12px 18px; padding-left: 45px;
                                          background: rgba(10, 10, 26, 0.8); 
                                          border: 2px solid ${hasWebhook ? '#10b981' : '#4b5563'}; 
                                          border-radius: 8px; 
                                          color: #ffffff; 
                                          font-size: 0.9em;
                                          font-family: 'Courier New', monospace;
                                          transition: all 0.3s ease;
                                          box-shadow: 0 2px 8px ${hasWebhook ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 0, 0, 0.3)'};"
                                   onfocus="this.style.borderColor='${bossData.color}'; this.style.boxShadow='0 0 0 3px ${bossData.color}33';"
                                   onblur="this.style.borderColor='${hasWebhook ? '#10b981' : '#4b5563'}'; this.style.boxShadow='0 2px 8px ${hasWebhook ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 0, 0, 0.3)'}';">
                            <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); 
                                         color: ${hasWebhook ? '#10b981' : '#6b7280'}; font-size: 1.1em;">🌐</span>
                        </div>
                    </div>
                    
                    <!-- 操作按鈕 -->
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                        <button type="button" onclick="saveIndividualBossWebhook('${bossName}')"
                                style="flex: 1; min-width: 100px; padding: 10px 16px; 
                                       background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                                       border: 2px solid #10b981; border-radius: 8px; color: white; cursor: pointer;
                                       font-weight: bold; transition: all 0.3s ease;
                                       box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);"
                                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(16, 185, 129, 0.4)';"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)';">
                            💾 儲存
                        </button>
                        <button type="button" onclick="testIndividualBossWebhook('${bossName}')"
                                style="flex: 1; min-width: 100px; padding: 10px 16px; 
                                       background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                                       border: 2px solid #3b82f6; border-radius: 8px; color: white; cursor: pointer;
                                       font-weight: bold; transition: all 0.3s ease;
                                       box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);"
                                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(59, 130, 246, 0.4)';"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.3)';">
                            🧪 測試
                        </button>
                        <button type="button" onclick="clearIndividualBossWebhook('${bossName}')"
                                style="flex: 1; min-width: 100px; padding: 10px 16px; 
                                       background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); 
                                       border: 2px solid #ef4444; border-radius: 8px; color: white; cursor: pointer;
                                       font-weight: bold; transition: all 0.3s ease;
                                       box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);"
                                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.4)';"
                                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)';">
                            🗑️ 清除
                        </button>
                    </div>
                    
                    <!-- BOSS 資訊卡片 -->
                    <div style="padding: 12px 15px; 
                                background: linear-gradient(135deg, ${bossData.color}15 0%, ${bossData.color}08 100%); 
                                border-radius: 8px; border-left: 4px solid ${bossData.color};
                                box-shadow: 0 2px 8px ${bossData.color}20;">
                        <p style="color: ${bossData.color}; font-size: 0.9em; margin: 0; font-weight: 500;">
                            📍 地圖位置: ${bossData.maps.join(' / ')}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// 保存個別 BOSS Webhook (新版 - 用於全部展開的卡片)
function saveIndividualBossWebhook(bossName) {
    const cardId = bossName.replace(/\s/g, '-');
    const input = document.getElementById(`individual-webhook-${cardId}`);
    const url = input.value.trim();
    
    if (url && !url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        return;
    }
    
    const individualWebhooks = loadIndividualWebhooks();
    
    if (url) {
        individualWebhooks[bossName] = url;
        showNotification(`${bossName} 的 Webhook 已保存 ✅`, 'success');
    } else {
        delete individualWebhooks[bossName];
        showNotification(`${bossName} 的 Webhook 已清除`, 'success');
    }
    
    saveIndividualWebhooks(individualWebhooks);
    
    // 重新生成卡片以更新狀態
    generateAllBossWebhookCards();
    updateWebhookList();
}

// 測試個別 BOSS Webhook (新版)
async function testIndividualBossWebhook(bossName) {
    const cardId = bossName.replace(/\s/g, '-');
    const input = document.getElementById(`individual-webhook-${cardId}`);
    const url = input.value.trim();
    
    if (!url) {
        showNotification(`請先輸入 ${bossName} 的 Webhook URL`, 'warning');
        return;
    }
    
    if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        return;
    }
    
    try {
        const bossData = BOSS_DATA[bossName];
        const color = parseInt(bossData.color.replace('#', ''), 16);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: `🧪 ${bossName} 專屬通知測試`,
                    description: `這是 **${bossName}** 的測試訊息，如果您看到這則訊息，表示設定成功！`,
                    color: color,
                    fields: [
                        { name: '地圖位置', value: bossData.maps.join('、'), inline: false },
                        { name: '重生時間', value: `${bossData.min} ~ ${bossData.max} 分鐘`, inline: false }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: `楓之谷BOSS重生時間系統 - ${bossName} 專屬通知` }
                }]
            })
        });
        
        if (response.ok) {
            showNotification(`✅ ${bossName} 測試成功！請檢查您的 Discord 頻道`, 'success');
        } else {
            showNotification('❌ 測試失敗，請檢查 Webhook URL 是否正確', 'error');
        }
    } catch (error) {
        console.error('測試失敗:', error);
        showNotification('❌ 測試失敗，請檢查網路連線', 'error');
    }
}

// 清除個別 BOSS Webhook (新版)
function clearIndividualBossWebhook(bossName) {
    if (confirm(`確定要清除 ${bossName} 的 Webhook 設定嗎？`)) {
        const individualWebhooks = loadIndividualWebhooks();
        delete individualWebhooks[bossName];
        saveIndividualWebhooks(individualWebhooks);
        
        const cardId = bossName.replace(/\s/g, '-');
        const input = document.getElementById(`individual-webhook-${cardId}`);
        if (input) input.value = '';
        
        showNotification(`${bossName} 的 Webhook 設定已清除`, 'success');
        
        // 重新生成卡片以更新狀態
        generateAllBossWebhookCards();
        updateWebhookList();
    }
}

// 保存用戶 Webhook
function saveUserWebhook() {
    const url = document.getElementById('webhook-url').value.trim();
    if (url && !url.startsWith('https://discord.com/api/webhooks/')) {
        showNotification('請輸入有效的 Discord Webhook URL', 'error');
        return;
    }
    localStorage.setItem('userWebhook', url);
    updateWebhookStatus();
    showNotification('Webhook 設定已保存', 'success');
}

// 更新 Webhook 狀態
function updateWebhookStatus() {
    const url = localStorage.getItem('userWebhook');
    const statusEl = document.getElementById('webhook-status');
    const statusTextEl = document.getElementById('webhook-status-text');
    if (!statusEl || !statusTextEl) return;
    
    if (url) {
        statusEl.style.display = 'block';
        statusTextEl.innerHTML = '✅ 已設定 (將接收所有BOSS通知)';
        statusTextEl.style.color = '#10b981';
    } else {
        statusEl.style.display = 'block';
        statusTextEl.innerHTML = '❌ 未設定';
        statusTextEl.style.color = '#ef4444';
    }
}

// 清除用戶 Webhook
function clearUserWebhook() {
    if (confirm('確定要清除統一通知 Webhook 設定嗎？')) {
        localStorage.removeItem('userWebhook');
        document.getElementById('webhook-url').value = '';
        updateWebhookStatus();
        showNotification('Webhook 設定已清除', 'success');
    }
}

// 測試用戶 Webhook
async function testUserWebhook() {
    const url = document.getElementById('webhook-url').value.trim();
    if (!url) {
        showNotification('請先輸入 Webhook URL', 'warning');
        return;
    }
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: '🧪 測試通知',
                    description: '這是一則測試訊息，如果您看到這則訊息，表示 Webhook 設定成功！',
                    color: 0x00ff00,
                    timestamp: new Date().toISOString(),
                    footer: { text: '楓之谷BOSS重生時間系統' }
                }]
            })
        });
        if (response.ok) showNotification('✅ 測試成功！請檢查您的 Discord 頻道', 'success');
        else showNotification('❌ 測試失敗，請檢查 Webhook URL 是否正確', 'error');
    } catch (error) {
        console.error('測試失敗:', error);
        showNotification('❌ 測試失敗，請檢查網路連線', 'error');
    }
}

// 發送用戶 Webhook 通知 (支持統一通知)
async function sendUserWebhookNotification(record) {
    // 優先使用新的統一通知
    let webhookUrl = localStorage.getItem('unifiedWebhook');
    
    // 如果沒有統一通知，檢查是否有舊的 userWebhook (向下兼容)
    if (!webhookUrl) {
        webhookUrl = localStorage.getItem('userWebhook');
    }
    
    if (!webhookUrl) return;
    
    const deathTime = new Date(record.deathTime);
    const respawnMin = new Date(record.respawnMin);
    const respawnMax = new Date(record.respawnMax);
    const embed = {
        title: '⚔️ BOSS擊殺記錄',
        description: `**${record.bossName}** 已被擊殺！`,
        color: parseInt(BOSS_DATA[record.bossName]?.color?.replace('#', '') || 'FF0000', 16),
        fields: [
            { name: '頻道', value: String(record.channel), inline: true },
            { name: '地圖', value: record.map, inline: true },
            { name: '⏰ 預計重生時間', value: `**${formatDate(respawnMin)} ~ ${formatDate(respawnMax)}**`, inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: '楓之谷BOSS重生時間系統 - 統一通知' }
    };
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (error) {
        console.error('統一 Webhook 發送失敗:', error);
    }
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

// 設定每天 00:00 自動重新整理
function setupAutoMidnightRefresh() {
    const now = new Date();
    const night = new Date();
    night.setHours(24, 0, 0, 0);
    const msToMidnight = night.getTime() - now.getTime();
    setTimeout(() => location.reload(), msToMidnight);
}

// 當頁面載入完成時初始化
window.addEventListener('load', init);
