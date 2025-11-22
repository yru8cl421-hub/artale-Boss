// Discord 通知配置文件範本
// 使用說明：
// 1. 將此檔案重新命名為 discord-notifications.js
// 2. 替換下方的 YOUR_WEBHOOK_URL_HERE 為您的實際 Discord Webhook URL
// 3. 確保 discord-notifications.js 與主HTML檔案在同一目錄

// Discord Webhook URLs
// 如何取得 Webhook URL: Discord伺服器設定 → 整合 → Webhooks → 新增Webhook
const DISCORD_WEBHOOKS = {
    "蘑菇王": "YOUR_WEBHOOK_URL_HERE",
    "殭屍蘑菇王": "YOUR_WEBHOOK_URL_HERE",
    "巴洛古": "YOUR_WEBHOOK_URL_HERE",
    "黑輪王": "YOUR_WEBHOOK_URL_HERE",
    "仙人娃娃": "YOUR_WEBHOOK_URL_HERE"
};

// 改善建議的 Webhook URL（選填）
const FEEDBACK_WEBHOOK = 'YOUR_FEEDBACK_WEBHOOK_URL_HERE';

// ========== 以下為通知功能，無需修改 ==========

// 發送擊殺記錄通知
async function sendKillNotification(record) {
    const webhookUrl = DISCORD_WEBHOOKS[record.bossName];
    
    if (!webhookUrl || webhookUrl === 'YOUR_WEBHOOK_URL_HERE') {
        return;
    }

    const deathTime = new Date(record.deathTime);
    const respawnMin = new Date(record.respawnMin);
    const respawnMax = new Date(record.respawnMax);
    const mapInfo = record.map || BOSS_DATA[record.bossName]?.maps.join(', ') || '未知';

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
                value: mapInfo,
                inline: true
            },
            {
                name: '擊殺時間',
                value: formatDateTime(deathTime),
                inline: false
            },
            {
                name: '預計重生時間',
                value: `${formatTime(respawnMin)} ~ ${formatTime(respawnMax)}`,
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
    } catch (error) {
        // 靜默處理錯誤
    }
}

// 發送重生提醒通知（目前已停用，保留代碼以備將來使用）
async function sendDiscordNotification(record) {
    const webhookUrl = DISCORD_WEBHOOKS[record.bossName];
    
    if (!webhookUrl || webhookUrl === 'YOUR_WEBHOOK_URL_HERE') {
        return;
    }

    const respawnMin = new Date(record.respawnMin);
    const respawnMax = new Date(record.respawnMax);
    const mapInfo = record.map || BOSS_DATA[record.bossName]?.maps.join(', ') || '未知';

    const embed = {
        title: '🔔 BOSS重生提醒',
        description: `**${record.bossName}** 可能已經重生！`,
        color: parseInt(BOSS_DATA[record.bossName]?.color?.replace('#', '') || 'FF0000', 16),
        fields: [
            {
                name: '頻道',
                value: record.channel,
                inline: true
            },
            {
                name: '地圖',
                value: mapInfo,
                inline: true
            },
            {
                name: '重生時間範圍',
                value: `${formatTime(respawnMin)} ~ ${formatTime(respawnMax)}`,
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
    } catch (error) {
        // 靜默處理錯誤
    }
}

// 提交改善建議
async function submitFeedback() {
    const type = document.getElementById('feedback-type').value;
    const content = document.getElementById('feedback-content').value.trim();
    const contact = document.getElementById('feedback-contact').value.trim();

    if (!content) {
        showNotification('請輸入詳細說明', 'warning');
        return;
    }

    const now = new Date();
    const embed = {
        title: '📝 新的改善建議',
        color: 0x00ccff,
        fields: [
            {
                name: '📋 建議類型',
                value: type,
                inline: true
            },
            {
                name: '🕒 提交時間',
                value: formatDateTime(now, true),
                inline: true
            },
            {
                name: '💬 詳細說明',
                value: content.length > 1024 ? content.substring(0, 1021) + '...' : content,
                inline: false
            }
        ],
        timestamp: now.toISOString(),
        footer: {
            text: '楓之谷BOSS重生時間系統 - 改善建議'
        }
    };

    if (contact) {
        embed.fields.push({
            name: '📧 聯絡方式',
            value: contact,
            inline: false
        });
    }

    if (!FEEDBACK_WEBHOOK || FEEDBACK_WEBHOOK === 'YOUR_FEEDBACK_WEBHOOK_URL_HERE') {
        showNotification('改善建議功能尚未設定 Webhook', 'warning');
        return;
    }

    try {
        const response = await fetch(FEEDBACK_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [embed]
            })
        });

        if (response.ok) {
            showNotification('感謝您的建議！已成功提交 ✨', 'success');
            clearFeedbackForm();
        } else {
            showNotification('提交失敗，請稍後再試', 'error');
        }
    } catch (error) {
        showNotification('提交失敗，請檢查網路連線', 'error');
    }
}

// 清空改善建議表單
function clearFeedbackForm() {
    document.getElementById('feedback-type').value = '功能建議';
    document.getElementById('feedback-content').value = '';
    document.getElementById('feedback-contact').value = '';
}
