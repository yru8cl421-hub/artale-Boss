// Discord 通知配置

const FEEDBACK_WEBHOOK = 'https://discord.com/api/webhooks/1449981621636960266/rbH2jiB6dPHI0CjOyslspYmLFsR2mD6UmzcY8uoR1AN5uduam25OKwNbIwAasx4uQCp0';

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
