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
                                <span>⚔️ 擊殺: ${killTime}</span>
                            </div>
                            <div class="boss-info-item">
                                <span style="color: #64748b;">|</span>
                                <span>🕐 重生: ${respawnTimeRange}</span>
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

