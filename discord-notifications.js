// Discord 通知配置文件
// 
// ⚠️ 重要說明：
// 1. 此檔案包含開發者設定的個別 BOSS 專屬 Webhook URLs
// 2. 這些是「額外的」通知，會發送到各個 BOSS 專屬的頻道
// 3. 使用者可以在系統的「通知設定」頁面設定自己的統一 Webhook
// 4. 使用者的 Webhook 會接收所有 BOSS 的擊殺通知
// 5. 兩種通知互不影響，可以同時使用
// 
// 注意：請勿將此檔案上傳到公開的 GitHub repository
// 建議在 .gitignore 中添加此文件

// ===== 個別 BOSS 專屬的 Discord Webhook URLs =====
// 以下是各個 BOSS 專屬的通知 Webhook（開發者使用）
const DISCORD_WEBHOOKS = {
    "蘑菇王": "https://discord.com/api/webhooks/1438472081003118653/4KS7P2dGU_7KF-6tIQRgUuaLQYGPf8AZD0oDhYnUNGAJFFZKY6FhAs96O1UnLYnV9TvC",
    "殭屍蘑菇王": "https://discord.com/api/webhooks/1440712167279165441/Csi_R_VtZOCEMCxfdxJzZVnFMdb2mAZQ8ePupNFVsZSpar8Y7nlgaOmrpzcwBzNy8i2D",
    "巴洛古": "https://discord.com/api/webhooks/1440712283356397629/Avw1nV_Gfuh8MUsMjroAVUCydVyEDDQlvPEjEk3b16uvaSxuChBGlhWwc7Mta4rRFBBn",
    "黑輪王": "https://discord.com/api/webhooks/1440712399899328512/bkmJ2wqFZB5PRUo7wbhrt9I1dMQsEYKHfPc6bZRWfwbWle6fzosXHyEHzkFXXQickWIc",
    "仙人娃娃": "https://discord.com/api/webhooks/1440712496410525706/hTjO-fV43ekEg7suq6tZJw5FAFC5kRYWUAhBuEMMycBLztCjem8R_720E4sSpW8IwVFA",
    "肯德熊": "https://discord.com/api/webhooks/1444677508313382922/1BAuub-382pozgdn5ykJhqBQ_Nm93tiODhvohkHWV1ubMcW7dN53QR8iR3p9GOA302nm"
};

const FEEDBACK_WEBHOOK = 'https://discord.com/api/webhooks/1438760814466039910/iYegYu_LoPALQokZnyEjFJKuVXU9MxBHhMKvcQpZx0Ny3sKeVvUjmob0ozV5-BBHsxsj';

// 格式化日期時間為 月/日 24小時制
function formatDiscordDateTime(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
}

// 發送擊殺記錄通知
async function sendKillNotification(record) {
    // 獲取該BOSS專屬的webhook URL
    const webhookUrl = DISCORD_WEBHOOKS[record.bossName];
    
    // 如果該BOSS沒有專屬webhook，不發送通知
    if (!webhookUrl) {
        return;
    }

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
                value: `**${formatDiscordDateTime(respawnMin)} ~ ${formatDiscordDateTime(respawnMax)}**`,
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
        // 靜默處理，不輸出任何訊息
    } catch (error) {
        // 靜默處理錯誤
    }
}

// 提交改善建議
async function submitFeedback() {
    console.log('[DEBUG] submitFeedback 函數被調用');
    
    const type = document.getElementById('feedback-type').value;
    const content = document.getElementById('feedback-content').value.trim();
    const contact = document.getElementById('feedback-contact').value.trim();

    console.log('[DEBUG] 表單數據:', { type, content, contact });

    if (!content) {
        console.log('[DEBUG] 內容為空，顯示警告');
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
                value: formatDiscordDateTime(now),
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

    console.log('[DEBUG] 準備發送的 embed:', JSON.stringify(embed, null, 2));
    console.log('[DEBUG] Webhook URL:', FEEDBACK_WEBHOOK);

    try {
        console.log('[DEBUG] 開始發送請求...');
        const response = await fetch(FEEDBACK_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [embed]
            })
        });

        console.log('[DEBUG] 回應狀態:', response.status, response.statusText);
        
        const responseText = await response.text();
        console.log('[DEBUG] 回應內容:', responseText);

        if (response.ok) {
            console.log('[DEBUG] 提交成功！');
            showNotification('感謝您的建議！已成功提交 ✨', 'success');
            clearFeedbackForm();
        } else {
            console.error('[ERROR] 提交失敗 - 狀態碼:', response.status);
            console.error('[ERROR] 錯誤訊息:', responseText);
            showNotification('提交失敗，請稍後再試', 'error');
        }
    } catch (error) {
        console.error('[ERROR] 發生異常:', error);
        console.error('[ERROR] 錯誤堆疊:', error.stack);
        showNotification('提交失敗，請檢查網路連線', 'error');
    }
}

// 清空改善建議表單
function clearFeedbackForm() {
    document.getElementById('feedback-type').value = '功能建議';
    document.getElementById('feedback-content').value = '';
    document.getElementById('feedback-contact').value = '';
}
