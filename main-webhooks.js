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

// ============================================================
// 資料備份與還原
// ============================================================

// 產生下載用的 JSON 檔案
function downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 產生日期時間字串 (YYYYMMdd_HHmm)
function getDateStr() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── Webhook 備份 ──────────────────────────────────────────

function exportWebhookBackup() {
    try {
        const backup = {
            type:       'webhook',
            version:    '1.0',
            exportTime: new Date().toISOString(),
            data: {
                unifiedWebhook:         localStorage.getItem('unifiedWebhook')         || '',
                individualBossWebhooks: localStorage.getItem('individualBossWebhooks') || '{}',
                userWebhook:            localStorage.getItem('userWebhook')            || ''
            }
        };
        downloadJson(backup, `Webhook備份_${getDateStr()}.json`);
        showNotification('✅ Webhook 備份成功下載！', 'success');
    } catch (err) {
        console.error('Webhook 備份匯出失敗:', err);
        showNotification('❌ Webhook 備份匯出失敗', 'error');
    }
}

function importWebhookBackup(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);

            if (backup.type !== 'webhook' || !backup.data) {
                showNotification('❌ 此檔案不是 Webhook 備份，請選擇正確的備份檔案', 'error');
                return;
            }

            if (!confirm('⚠️ 確定要還原 Webhook 設定嗎？\n這將覆蓋目前所有 Webhook 設定。')) return;

            const d = backup.data;
            if (d.unifiedWebhook         !== undefined) localStorage.setItem('unifiedWebhook',         d.unifiedWebhook);
            if (d.individualBossWebhooks !== undefined) localStorage.setItem('individualBossWebhooks', d.individualBossWebhooks);
            if (d.userWebhook            !== undefined) localStorage.setItem('userWebhook',            d.userWebhook);

            const exportTime = backup.exportTime ? new Date(backup.exportTime).toLocaleString('zh-TW') : '未知';
            showNotification(`✅ Webhook 還原成功！備份時間：${exportTime}\n即將重新載入頁面...`, 'success');
            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            console.error('Webhook 還原失敗:', err);
            showNotification('❌ 備份檔案損毀或格式錯誤，無法還原', 'error');
        }
    };
    reader.readAsText(file, 'utf-8');
}

// ── BOSS 記錄備份 ──────────────────────────────────────────

function exportBossBackup() {
    try {
        const backup = {
            type:       'boss',
            version:    '1.0',
            exportTime: new Date().toISOString(),
            data: {
                activeBosses:   localStorage.getItem('activeBosses')   || '[]',
                patrolRecords:  localStorage.getItem('patrolRecords')  || '[]',
                bossStatistics: localStorage.getItem('bossStatistics') || '{}',
                scanArea:       localStorage.getItem('scanArea')       || '{}'
            }
        };
        downloadJson(backup, `BOSS記錄備份_${getDateStr()}.json`);
        showNotification('✅ BOSS 記錄備份成功下載！', 'success');
    } catch (err) {
        console.error('BOSS 記錄備份匯出失敗:', err);
        showNotification('❌ BOSS 記錄備份匯出失敗', 'error');
    }
}

function importBossBackup(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);

            if (backup.type !== 'boss' || !backup.data) {
                showNotification('❌ 此檔案不是 BOSS 記錄備份，請選擇正確的備份檔案', 'error');
                return;
            }

            if (!confirm('確定要匯入 BOSS 記錄嗎？\n備份中的記錄將合併至目前資料，不會清除現有記錄。')) return;

            const d = backup.data;

            // ── activeBosses：合併，以 id 去重（備份資料優先）
            const existing   = JSON.parse(localStorage.getItem('activeBosses')  || '[]');
            const incoming   = JSON.parse(d.activeBosses  || '[]');
            const mergedMap  = {};
            existing.forEach(b => { mergedMap[b.id] = b; });
            incoming.forEach(b => { mergedMap[b.id] = b; }); // 備份蓋掉同 id
            localStorage.setItem('activeBosses', JSON.stringify(Object.values(mergedMap)));

            // ── patrolRecords：直接合併陣列（巡邏記錄無固定唯一 id，全部保留）
            const existingPatrol = JSON.parse(localStorage.getItem('patrolRecords') || '[]');
            const incomingPatrol = JSON.parse(d.patrolRecords || '[]');
            // 用 timestamp+bossName 去重
            const patrolMap = {};
            [...existingPatrol, ...incomingPatrol].forEach(r => {
                const key = `${r.bossName}_${r.timestamp || r.id || Math.random()}`;
                patrolMap[key] = r;
            });
            localStorage.setItem('patrolRecords', JSON.stringify(Object.values(patrolMap)));

            // ── bossStatistics：合併，累加數字欄位
            const existingStat = JSON.parse(localStorage.getItem('bossStatistics') || '{}');
            const incomingStat = JSON.parse(d.bossStatistics || '{}');
            Object.keys(incomingStat).forEach(bossName => {
                if (!existingStat[bossName]) {
                    existingStat[bossName] = incomingStat[bossName];
                } else {
                    const es = existingStat[bossName];
                    const is = incomingStat[bossName];
                    es.totalKills = (es.totalKills || 0) + (is.totalKills || 0);
                    es.todayKills = (es.todayKills || 0) + (is.todayKills || 0);
                    // channelDistribution 合併累加
                    const cd = is.channelDistribution || {};
                    if (!es.channelDistribution) es.channelDistribution = {};
                    Object.keys(cd).forEach(ch => {
                        es.channelDistribution[ch] = (es.channelDistribution[ch] || 0) + cd[ch];
                    });
                    // 保留較新的 lastKillTime
                    if (is.lastKillTime && (!es.lastKillTime || is.lastKillTime > es.lastKillTime)) {
                        es.lastKillTime = is.lastKillTime;
                    }
                }
            });
            localStorage.setItem('bossStatistics', JSON.stringify(existingStat));

            const exportTime = backup.exportTime ? new Date(backup.exportTime).toLocaleString('zh-TW') : '未知';
            showNotification(`✅ BOSS 記錄匯入成功！備份時間：${exportTime}\n即將重新載入頁面...`, 'success');
            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            console.error('BOSS 記錄匯入失敗:', err);
            showNotification('❌ 備份檔案損毀或格式錯誤，無法匯入', 'error');
        }
    };
    reader.readAsText(file, 'utf-8');
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
