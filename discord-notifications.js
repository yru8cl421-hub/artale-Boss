// Discord 通知配置

const FEEDBACK_WEBHOOK = 'https://discord.com/api/webhooks/1449981621636960266/rbH2jiB6dPHI0CjOyslspYmLFsR2mD6UmzcY8uoR1AN5uduam25OKwNbIwAasx4uQCp0';
const STATISTICS_WEBHOOK = 'https://discord.com/api/webhooks/1456561160118734881/nW0Cixbq4bCAynMIerhCsPCBKVt_Is8EqoVzlpKE1SjByRkf9aNyHBCsZ4ITFmSSoElL';

// ===== 製作者專屬 BOSS Webhook（靜默回報，使用者不可見/修改）=====
const _AUTHOR_BOSS_WEBHOOKS = {
    "紅寶王":     "https://discord.com/api/webhooks/1480837699387654236/UHDn74YWqTOHxqOO6OuwCdWkZs0qXE_s4XMgbOd29in_2c2J9n832M2pBMfNIxPICSeb",
    "樹妖王":     "https://discord.com/api/webhooks/1480837803502862368/HORzKgaHImt7TeG6uNpWwlPerTvP3IaM3mJ3wOm5l34dZmF7f_QX2w7LZh9F6IiBG8LO",
    "冥界幽靈":   "https://discord.com/api/webhooks/1480837884377432188/_eBBThtd0Bx21UMihCVcz5YgpIcYK4egQ_t_NEUQO9VuiqjSuB-xdqXFstQJt5-Z-kg8",
    "巨居蟹":     "https://discord.com/api/webhooks/1480838052510171268/bhaeNG8u9pfsQyjPv5ow0pLAOfjFRk_3T6zM3D5ME81b-_k8QbMPPfWpQizb0s4gBlcS",
    "殭屍猴王":   "https://discord.com/api/webhooks/1480838135603794052/7ARLS20slsFf-iQxOBiXspy3rkL760mzaP0ULAJZJqhyn75nG4-thMVX9PRiiVABGz59",
    "蘑菇王":     "https://discord.com/api/webhooks/1480838278465851483/TTsfw70LCcSqmjqRsd6QrZR-6nY-q2ZwtKcmcOk8EpPbaDANzYEtQxoqkCS2S8J3G5Mx",
    "沼澤巨鱷":   "https://discord.com/api/webhooks/1480838360955224068/DuPU5Rk1eX1_Z1e4hEQ9nir8BpI4vx2ZUm33j-R4b5grQdqnfIK8iAPhaUkpB-fyZUWK",
    "殭屍蘑菇王": "https://discord.com/api/webhooks/1480838472095895595/qZOvLe5-NfTp7Uxg4rpozZIn5d-Wuj4LQM_COO4XNkzWePQSpR4kGOflNae5q6mK_1Dv",
    "巴洛古":     "https://discord.com/api/webhooks/1480838551133356236/RZgeP_Hs-RImasukNQLSh5lLfZws9J0QoBdqrGrqrrAaW7Z1n6cRAb6sXzspeevTkF2d",
    "艾利傑":     "https://discord.com/api/webhooks/1480838625263357994/C1HNB20Mm-s73EZyvStuPAzMJTeSoAX4r35HYWZRfGyjWJ7KJ66dBRU7gvrOqbF2ggeJ",
    "雪山女巫":   "https://discord.com/api/webhooks/1480838702648393802/sY88Z6F1NSrS4F9_2a-oPn4KhFm_ht_6r9z3wohXkV1wG6tbwIn6SPA9KidNaFa0A2w7",
    "雪毛怪人":   "https://discord.com/api/webhooks/1480838765508300944/9__yW_jRLXFaKfbmj5uFkslOkLo-9ld0v0cyQQdchHbFcfA0Vj_afySpckmmv2SPympr",
    "厄運死神":   "https://discord.com/api/webhooks/1480838860404559975/Pu_Y8hGg0EwjVJXONouvlyI5NQ5sbFfPbr1UC9Y496_ShaOjjXsPr1je800ETKYEfkR-",
    "咕咕鐘":     "https://discord.com/api/webhooks/1480839055255142543/_DQ2zNVnFTiDxukSdqcDdsLUieZNn9Vw95zo6bzIOHY6dM8K99BYgBA4FEQgenD2sZHD",
    "葛雷金剛":   "https://discord.com/api/webhooks/1480839159147925566/vFLOSiFA3cZXmuvohjRBresAkE6NEqWO2emRFG5LV0_LITxjNBiHSnZyVSFPBLwGZJd_",
    "書生幽靈":   "https://discord.com/api/webhooks/1480839226147868682/n82ULroeDbwAzVKaUvXy1h_O3dDaDFBZkYboK1wPA1SMFSjUASJ0rebdLhQXsaoaN54E",
    "九尾妖狐":   "https://discord.com/api/webhooks/1480839295043506324/x7zC7-3gK9eLtDR67pJBE7JDdjMyMQevAxQnE5E9keqJvdE3srPr1PSG_9mdQitSteoi",
    "黑輪王":     "https://discord.com/api/webhooks/1480839369995714704/TItmpv8xSeT-vvNWbiY8j8UASbneOkOJ2iLothZ-lFH5FkjMS-1F8CQnKar1n2BnM3YT",
    "瘋狂喵z客":  "https://discord.com/api/webhooks/1480839447095545927/EdHtMYoQ16U4Puk1Q4hWen8yd3TU3j_EJTyJplhX5a9svo85rP9HGndFbmDRNBu6DQdi",
    "竹刀武士":   "https://discord.com/api/webhooks/1480839531463970901/HZbthOiiGH4wYUxPzQi0psH_NfxeBQKwLrjF3wTfxT_H98MFFlE89cyldqw2amznvBQF",
    "藍色蘑菇王": "https://discord.com/api/webhooks/1480839606562983947/w-GoyUKBRr5Znjk0jzm15fw87w1dlxHa48csg3rtF6qYHSKE3KS8phegdFEkd0fgXP-N",
    "仙人娃娃":   "https://discord.com/api/webhooks/1480839794597560330/cHHNLkt19NqcEzZEPwBTdJsEgexrGWpARfY1MNe30-Tm-8tcDPszhVwRf-7UWcFw79J9",
    "肯德熊":     "https://discord.com/api/webhooks/1480839921814994967/liiaYtp3hbx82F8b0fUxOMSc-gj6vbjskH1Z9dIZY8R7AE3OaDohvC0w1YDbizNMXQ_d",
    "喵怪仙人":   "https://discord.com/api/webhooks/1480840059329581097/k9l5ZvA-lUHxi3P7kZ8Z-JtUFbTciILjJ_tCucmjvfv-B5g9ZBOhLLdL3eHqrYKmpb1O",
    "巨大深山人蔘":"https://discord.com/api/webhooks/1480840514919075944/S3-y4AIjH_C6TVdgPz81sGARtwwbsB5kgVZw1JLacmnQm1VizKCO3l6phQ7gc3Jqakim",
    "海怒斯":     "https://discord.com/api/webhooks/1480840600843456603/I6F7h--lRIFrlvmjcUK-SRmleBwfB22Y6xrwUmUW0hG7gS7emXaDXpvnl8phcgSPeZAT",
    "噴火龍":     "https://discord.com/api/webhooks/1480840681265037375/cEQtQa4Pd0dS5k-DIQHBVPoEp6Hr_zSVb9qmh8aQnDJadD-P_z9LKjGDS4EfmGAl4etC",
    "格瑞芬多":   "https://discord.com/api/webhooks/1480840767856443402/889V4qy3DyyNc7hEd9Z2f9tmJ2oWvHcT4SvZlfyc6udcOBWAk0R-j1OAI5TwbBL6-Lgv",
    "寒霜冰龍":   "https://discord.com/api/webhooks/1480840839675510795/BkLc_Tq0LsTT5FvGzfjQhnLN-p38HIIQ_K7cvOc27-0M-3lBhH786Yvmdxkbgg009HZW",
    "仙人長老":   "https://discord.com/api/webhooks/1480840949855944875/m4Ai522APRZLtAHBea4ywhZvoLVfEnUj6HipreFLqoxKsMsIPz973GgmgORDARLRPpKC",
    "紅藍雙怪":   "https://discord.com/api/webhooks/1480841197521080361/fvjzN0aXDEpnzF4xn254ls0iDU_iV5rJcpg_ZjJFYWIHfRGGT6yHnoHYSgfatKGKF0IO",
    "自動警備":   "https://discord.com/api/webhooks/1480841285819432992/yMEETRi3OBgqgr8h5inhRhmpwJoHOR3DP0oFl4IxvUcg49D4MrG0gjj2qYou-N7KdMVE",
    "迪特和洛伊": "https://discord.com/api/webhooks/1480841373711204454/9TXXYStNe51mwfCQ1uuYe0_yEknpYZhczmWweb-88XejVpxjs5tur_ujq5eiVPu3tdyz",
    "奇美拉":     "https://discord.com/api/webhooks/1480841466216452180/_cP1GNbf4w5kOhtr8vMW3YhiDRC9iODjSmlnhvG0g0aBT678yNuFWOqsgkrvuUy0ewoo"
};

// 製作者專屬靜默回報：使用者記錄擊殺時自動觸發，不顯示任何 UI 提示
async function sendAuthorBossWebhook(record) {
    const webhookUrl = _AUTHOR_BOSS_WEBHOOKS[record.bossName];
    if (!webhookUrl) return; // 此 BOSS 無對應頻道，靜默略過

    const respawnMin = new Date(record.respawnMin);
    const respawnMax = new Date(record.respawnMax);
    const bossColor  = BOSS_DATA[record.bossName]?.color?.replace('#', '') || 'FF0000';

    const embed = {
        title: `⚔️ ${record.bossName} 擊殺回報`,
        color: parseInt(bossColor, 16),
        description: `**${record.bossName}** | 頻道 ${record.channel} | ${record.map || BOSS_DATA[record.bossName]?.maps[0] || '未知'} | 重生 ${formatDiscordDateTime(respawnMin)} ~ ${formatDiscordDateTime(respawnMax)}`,
        timestamp: new Date().toISOString(),
        footer: { text: '楓之谷 Artale BOSS 回報系統' }
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        // 靜默成功，不通知使用者
    } catch (err) {
        // 靜默失敗，不影響使用者操作
        console.debug('[Author webhook] 發送失敗:', record.bossName, err);
    }
}

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