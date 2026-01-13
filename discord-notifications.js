// Discord 通知配置

const FEEDBACK_WEBHOOK = 'https://discord.com/api/webhooks/1449981621636960266/rbH2jiB6dPHI0CjOyslspYmLFsR2mD6UmzcY8uoR1AN5uduam25OKwNbIwAasx4uQCp0';
const STATISTICS_WEBHOOK = 'https://discord.com/api/webhooks/1456561160118734881/nW0Cixbq4bCAynMIerhCsPCBKVt_Is8EqoVzlpKE1SjByRkf9aNyHBCsZ4ITFmSSoElL';

// 獲取或生成設備唯一 ID
function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        // 生成簡短的唯一 ID (6位英數字)
        deviceId = 'PC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

// 格式化日期時間
function formatDiscordDateTime(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
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
            { name: '📋 建議類型', value: type, inline: true },
            { name: '🕒 提交時間', value: formatDiscordDateTime(now), inline: true },
            { name: '💬 詳細說明', value: content.length > 1024 ? content.substring(0, 1021) + '...' : content, inline: false }
        ],
        timestamp: now.toISOString(),
        footer: { text: '楓之谷BOSS重生時間系統 - 改善建議' }
    };

    if (contact) {
        embed.fields.push({ name: '📧 聯絡方式', value: contact, inline: false });
    }

    try {
        const response = await fetch(FEEDBACK_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });

        if (response.ok) {
            showNotification('感謝您的建議！已成功提交 ✨', 'success');
            clearFeedbackForm();
        } else {
            showNotification('提交失敗，請稍後再試', 'error');
        }
    } catch (error) {
        console.error('提交失敗:', error);
        showNotification('提交失敗，請檢查網路連線', 'error');
    }
}

// 清空改善建議表單
function clearFeedbackForm() {
    document.getElementById('feedback-type').value = '功能建議';
    document.getElementById('feedback-content').value = '';
    document.getElementById('feedback-contact').value = '';
}

// 自動發送 BOSS 統計到 Discord（靜默發送）
async function sendStatisticsToDiscord(bossStatistics) {
    try {
        const today = new Date();
        const dateStr = today.toLocaleDateString('zh-TW');
        const deviceId = getDeviceId();
        
        // 計算今日總擊殺數
        let totalTodayKills = 0;
        const todayBossList = [];
        
        Object.keys(bossStatistics).forEach(bossName => {
            const stat = bossStatistics[bossName];
            if (stat.todayKills > 0) {
                totalTodayKills += stat.todayKills;
                todayBossList.push({
                    name: bossName,
                    kills: stat.todayKills
                });
            }
        });
        
        // 如果今日沒有擊殺，不發送
        if (totalTodayKills === 0) return;
        
        // 依擊殺次數排序
        todayBossList.sort((a, b) => b.kills - a.kills);
        
        // 建立 BOSS 列表字串
        const bossListStr = todayBossList
            .map(boss => `${boss.name}: ${boss.kills}次`)
            .join('\n');
        
        const embed = {
            title: '📊 BOSS 擊殺統計',
            color: 0x00ff88,
            fields: [
                { name: '📅 日期', value: dateStr, inline: true },
                { name: '💻 設備編號', value: deviceId, inline: true },
                { name: '🎯 今日總擊殺', value: `${totalTodayKills} 次`, inline: true },
                { name: '📋 擊殺明細', value: bossListStr || '無', inline: false }
            ],
            timestamp: today.toISOString(),
            footer: { text: '楓之谷BOSS重生時間系統' }
        };
        
        // 靜默發送，不顯示通知
        await fetch(STATISTICS_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (error) {
        // 靜默失敗，不顯示錯誤
        console.error('統計發送失敗:', error);
    }
}
