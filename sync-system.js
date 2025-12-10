// sync-system.js - BOSS追蹤系統同步核心
// 
// 功能：
// 1. 將本地記錄同步到 Google Sheets
// 2. 從 Google Sheets 獲取其他用戶的記錄
// 3. 雙向資料同步（避免衝突）

// Google Apps Script Web App URL
const SYNC_API_URL = 'https://script.google.com/macros/s/AKfycbw2FsYqnOg12nkUWbynSN7lczSq5Hw-0cSVBFWNHkQGn7DGSsqTWEM0YRg4FJfHbNKz/exec';

// 同步設定
const SYNC_CONFIG = {
    autoSync: true,           // 自動同步
    syncInterval: 60000,      // 同步間隔（毫秒）- 60秒
    maxRetries: 3,            // 最大重試次數
    retryDelay: 2000,         // 重試延遲（毫秒）
    enableUpload: true,       // 啟用上傳
    enableDownload: true      // 啟用下載
};

// 同步狀態
let syncStatus = {
    lastSyncTime: null,
    isSyncing: false,
    syncTimer: null,
    uploadEnabled: true,
    downloadEnabled: true
};

// 用戶 ID（用於識別記錄來源）
let USER_ID = localStorage.getItem('userId');
if (!USER_ID) {
    USER_ID = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userId', USER_ID);
}

// 初始化同步系統
function initSyncSystem() {
    console.log('[SYNC] 初始化同步系統...');
    
    // 載入同步設定
    loadSyncConfig();
    
    // 更新同步狀態顯示
    updateSyncStatusDisplay();
    
    // 如果啟用自動同步，開始定時同步
    if (SYNC_CONFIG.autoSync) {
        startAutoSync();
    }
    
    console.log('[SYNC] 同步系統初始化完成');
}

// 載入同步設定
function loadSyncConfig() {
    const saved = localStorage.getItem('syncConfig');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            Object.assign(SYNC_CONFIG, config);
        } catch (e) {
            console.error('[SYNC] 載入設定失敗:', e);
        }
    }
}

// 保存同步設定
function saveSyncConfig() {
    localStorage.setItem('syncConfig', JSON.stringify(SYNC_CONFIG));
}

// 開始自動同步
function startAutoSync() {
    if (syncStatus.syncTimer) {
        clearInterval(syncStatus.syncTimer);
    }
    
    // 立即執行一次同步
    performSync();
    
    // 設定定時同步
    syncStatus.syncTimer = setInterval(() => {
        performSync();
    }, SYNC_CONFIG.syncInterval);
    
    console.log('[SYNC] 自動同步已啟動');
}

// 停止自動同步
function stopAutoSync() {
    if (syncStatus.syncTimer) {
        clearInterval(syncStatus.syncTimer);
        syncStatus.syncTimer = null;
        console.log('[SYNC] 自動同步已停止');
    }
}

// 執行同步
async function performSync() {
    if (syncStatus.isSyncing) {
        console.log('[SYNC] 同步進行中，跳過此次同步');
        return;
    }
    
    syncStatus.isSyncing = true;
    updateSyncStatusDisplay();
    
    try {
        console.log('[SYNC] 開始同步...');
        
        // 上傳本地記錄
        if (SYNC_CONFIG.enableUpload) {
            await uploadLocalRecords();
        }
        
        // 下載遠端記錄
        if (SYNC_CONFIG.enableDownload) {
            await downloadRemoteRecords();
        }
        
        syncStatus.lastSyncTime = new Date();
        console.log('[SYNC] 同步完成');
        
    } catch (error) {
        console.error('[SYNC] 同步失敗:', error);
    } finally {
        syncStatus.isSyncing = false;
        updateSyncStatusDisplay();
    }
}

// 上傳本地記錄到雲端
async function uploadLocalRecords() {
    if (!activeBosses || activeBosses.length === 0) {
        console.log('[SYNC] 沒有本地記錄需要上傳');
        return;
    }
    
    console.log(`[SYNC] 準備上傳 ${activeBosses.length} 筆記錄...`);
    
    // 為每筆記錄添加記錄者資訊
    const recordsToUpload = activeBosses.map(record => ({
        ...record,
        recorder: USER_ID
    }));
    
    try {
        // 使用 GET 請求代替 POST 來避免 CORS 預檢
        const params = new URLSearchParams({
            action: 'batchSync',
            data: JSON.stringify(recordsToUpload)
        });
        
        const response = await fetchWithRetry(`${SYNC_API_URL}?${params.toString()}`);
        const result = await response.json();
        
        if (result.success) {
            console.log(`[SYNC] 上傳成功: ${result.message}`);
        } else {
            console.error('[SYNC] 上傳失敗:', result.message);
        }
    } catch (error) {
        console.error('[SYNC] 上傳過程出錯:', error);
    }
}

// 從雲端下載記錄
async function downloadRemoteRecords() {
    console.log('[SYNC] 正在下載遠端記錄...');
    
    try {
        const response = await fetchWithRetry(`${SYNC_API_URL}?action=getActiveRecords`);
        const result = await response.json();
        
        if (!result.success) {
            console.error('[SYNC] 下載失敗:', result.message);
            return;
        }
        
        console.log(`[SYNC] 下載到 ${result.records.length} 筆記錄`);
        
        // 處理遠端記錄（不覆蓋本地記錄）
        processRemoteRecords(result.records);
        
    } catch (error) {
        console.error('[SYNC] 下載過程出錯:', error);
    }
}

// 處理遠端記錄
function processRemoteRecords(remoteRecords) {
    let imported = 0;
    let skipped = 0;
    
    remoteRecords.forEach(remote => {
        // 檢查是否為本地用戶的記錄
        if (remote.recorder === USER_ID) {
            skipped++;
            return;
        }
        
        // 檢查本地是否已有相同的記錄（同BOSS、同頻道）
        const existingIndex = activeBosses.findIndex(local => 
            local.bossName === remote.bossName && 
            local.channel === remote.channel
        );
        
        if (existingIndex !== -1) {
            // 比較時間，保留較新的記錄
            const localTime = new Date(activeBosses[existingIndex].deathTime);
            const remoteTime = new Date(remote.deathTime);
            
            if (remoteTime > localTime) {
                // 遠端記錄較新，更新本地記錄
                activeBosses[existingIndex] = {
                    ...remote,
                    syncedFrom: 'remote'
                };
                imported++;
                console.log(`[SYNC] 更新記錄: ${remote.bossName} CH${remote.channel}`);
            } else {
                skipped++;
            }
        } else {
            // 本地沒有此記錄，新增
            activeBosses.push({
                ...remote,
                syncedFrom: 'remote'
            });
            imported++;
            console.log(`[SYNC] 新增記錄: ${remote.bossName} CH${remote.channel}`);
        }
    });
    
    if (imported > 0) {
        saveData();
        updateAllDisplays();
        console.log(`[SYNC] 匯入 ${imported} 筆記錄，跳過 ${skipped} 筆`);
    } else {
        console.log(`[SYNC] 沒有新記錄需要匯入`);
    }
}

// 帶重試機制的 fetch
async function fetchWithRetry(url, options = {}, retries = SYNC_CONFIG.maxRetries) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response;
        } catch (error) {
            console.warn(`[SYNC] 請求失敗 (${i + 1}/${retries}):`, error);
            if (i === retries - 1) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.retryDelay));
        }
    }
}

// 更新同步狀態顯示
function updateSyncStatusDisplay() {
    const statusElement = document.getElementById('sync-status');
    if (!statusElement) return;
    
    let statusHtml = '';
    
    if (syncStatus.isSyncing) {
        statusHtml = `
            <div style="color: #fbbf24; display: flex; align-items: center; gap: 8px;">
                <div class="sync-spinner"></div>
                <span>同步中...</span>
            </div>
        `;
    } else if (syncStatus.lastSyncTime) {
        const diff = Math.floor((new Date() - syncStatus.lastSyncTime) / 1000);
        const timeText = diff < 60 ? `${diff}秒前` : `${Math.floor(diff / 60)}分鐘前`;
        statusHtml = `
            <div style="color: #10b981;">
                ✓ 最後同步: ${timeText}
            </div>
        `;
    } else {
        statusHtml = `
            <div style="color: #64748b;">
                尚未同步
            </div>
        `;
    }
    
    statusElement.innerHTML = statusHtml;
}

// 手動觸發同步
async function manualSync() {
    if (syncStatus.isSyncing) {
        if (typeof showNotification === 'function') {
            showNotification('同步進行中，請稍候...', 'info');
        }
        return;
    }
    
    if (typeof showNotification === 'function') {
        showNotification('開始同步資料...', 'info');
    }
    await performSync();
    if (typeof showNotification === 'function') {
        showNotification('同步完成！', 'success');
    }
}

// 切換自動同步
function toggleAutoSync(enabled) {
    SYNC_CONFIG.autoSync = enabled;
    saveSyncConfig();
    
    if (enabled) {
        startAutoSync();
        if (typeof showNotification === 'function') {
            showNotification('已啟用自動同步', 'success');
        }
    } else {
        stopAutoSync();
        if (typeof showNotification === 'function') {
            showNotification('已停用自動同步', 'info');
        }
    }
}

// 切換上傳功能
function toggleUpload(enabled) {
    SYNC_CONFIG.enableUpload = enabled;
    saveSyncConfig();
    if (typeof showNotification === 'function') {
        showNotification(enabled ? '已啟用上傳功能' : '已停用上傳功能', 'info');
    }
}

// 切換下載功能
function toggleDownload(enabled) {
    SYNC_CONFIG.enableDownload = enabled;
    saveSyncConfig();
    if (typeof showNotification === 'function') {
        showNotification(enabled ? '已啟用下載功能' : '已停用下載功能', 'info');
    }
}

// 設定同步間隔
function setSyncInterval(seconds) {
    SYNC_CONFIG.syncInterval = seconds * 1000;
    saveSyncConfig();
    
    if (SYNC_CONFIG.autoSync) {
        stopAutoSync();
        startAutoSync();
    }
    
    if (typeof showNotification === 'function') {
        showNotification(`同步間隔已設為 ${seconds} 秒`, 'success');
    }
}

// 清除所有雲端資料（管理用）
async function clearCloudData() {
    if (!confirm('確定要清除所有雲端資料嗎？此操作無法復原！')) {
        return;
    }
    
    // 這個功能需要在 Google Apps Script 中實作
    console.warn('[SYNC] 清除雲端資料功能待實作');
}

// CSS 動畫（同步轉圈）
const syncSpinnerStyle = `
<style>
.sync-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(251, 191, 36, 0.3);
    border-top-color: #fbbf24;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
`;

// 將樣式注入到頁面
if (!document.getElementById('sync-spinner-style')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'sync-spinner-style';
    styleElement.textContent = `
        .sync-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(251, 191, 36, 0.3);
            border-top-color: #fbbf24;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styleElement);
}

// 導出函數供其他模組使用
if (typeof window !== 'undefined') {
    window.SyncSystem = {
        init: initSyncSystem,
        performSync: performSync,
        manualSync: manualSync,
        toggleAutoSync: toggleAutoSync,
        toggleUpload: toggleUpload,
        toggleDownload: toggleDownload,
        setSyncInterval: setSyncInterval,
        clearCloudData: clearCloudData
    };
}
