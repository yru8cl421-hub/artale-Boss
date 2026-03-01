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

