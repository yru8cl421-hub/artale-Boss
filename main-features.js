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
        
        // 可能重生時間範圍
        const respawnTimeRange = `${formatDateTime(respawnMin)} ~ ${formatDateTime(respawnMax)}`;
        
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
                                <span>⚔️ ${killTime}</span>
                            </div>
                            <div class="boss-info-item">
                                <span style="color: #64748b;">|</span>
                                <span>🕐 ${respawnTimeRange}</span>
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

