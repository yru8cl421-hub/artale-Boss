// ===== 今天刷哪隻王？翻牌小遊戲 =====
(function () {
    'use strict';

    const GAME_KEY = 'flipGameSelectedBosses';
    let selectedBosses = [];
    let shuffledDeck = [];
    let isShuffling = false;
    let resultRevealed = false;

    // ─── 初始化 BOSS 勾選清單 ──────────────────────────────────────
    function initBossList() {
        const saved = JSON.parse(localStorage.getItem(GAME_KEY) || '[]');
        const allBosses = Object.keys(BOSS_DATA);
        const totalEl = document.getElementById('flip-total-count');
        if (totalEl) totalEl.textContent = allBosses.length;

        const container = document.getElementById('flip-boss-list');
        if (!container) return;
        container.innerHTML = '';

        allBosses.forEach(name => {
            const checked = saved.length === 0 ? true : saved.includes(name);
            const label = document.createElement('label');
            label.style.cssText = `
                display:flex; align-items:center; gap:5px;
                background:${checked ? 'rgba(0,153,204,0.15)' : 'rgba(0,0,0,0.25)'};
                border-radius:6px; padding:5px 8px; cursor:pointer; font-size:0.82em;
                border:1px solid ${checked ? 'rgba(0,153,204,0.4)' : 'rgba(100,116,139,0.25)'};
                transition:background 0.2s, border-color 0.2s; user-select:none;
            `;
            label.innerHTML = `
                <input type="checkbox" data-boss="${name}" ${checked ? 'checked' : ''}
                    style="accent-color:#0099cc; cursor:pointer; flex-shrink:0;">
                <img src="${BOSS_DATA[name].image}" alt="${name}"
                    style="width:20px;height:20px;object-fit:contain;border-radius:3px;">
                <span>${name}</span>
            `;
            const cb = label.querySelector('input');
            cb.addEventListener('change', function () {
                label.style.background = this.checked ? 'rgba(0,153,204,0.15)' : 'rgba(0,0,0,0.25)';
                label.style.borderColor = this.checked ? 'rgba(0,153,204,0.4)' : 'rgba(100,116,139,0.25)';
                saveBossList();
            });
            container.appendChild(label);
        });

        updateCount();
    }

    function saveBossList() {
        const checks = document.querySelectorAll('#flip-boss-list input[type=checkbox]');
        const sel = Array.from(checks).filter(c => c.checked).map(c => c.dataset.boss);
        localStorage.setItem(GAME_KEY, JSON.stringify(sel));
        selectedBosses = sel;
        updateCount();
    }

    function updateCount() {
        const checks = document.querySelectorAll('#flip-boss-list input[type=checkbox]');
        selectedBosses = Array.from(checks).filter(c => c.checked).map(c => c.dataset.boss);
        const el = document.getElementById('flip-selected-count');
        if (el) el.textContent = selectedBosses.length;
    }

    window.flipSelectAll = function () {
        document.querySelectorAll('#flip-boss-list input[type=checkbox]').forEach(c => {
            c.checked = true;
            c.closest('label').style.background = 'rgba(0,153,204,0.15)';
            c.closest('label').style.borderColor = 'rgba(0,153,204,0.4)';
        });
        saveBossList();
    };

    window.flipSelectNone = function () {
        document.querySelectorAll('#flip-boss-list input[type=checkbox]').forEach(c => {
            c.checked = false;
            c.closest('label').style.background = 'rgba(0,0,0,0.25)';
            c.closest('label').style.borderColor = 'rgba(100,116,139,0.25)';
        });
        saveBossList();
    };

    // ─── 洗牌並顯示牌背 ────────────────────────────────────────────
    window.startFlipGame = function () {
        if (isShuffling) return;
        updateCount();

        if (selectedBosses.length === 0) {
            setStatus('⚠️ 請先勾選至少一隻 BOSS！', '#ff9800');
            return;
        }

        resultRevealed = false;
        isShuffling = true;
        document.getElementById('flip-start-btn').disabled = true;

        // 重置結果區
        const resultCard = document.getElementById('flip-result-card');
        if (resultCard) {
            resultCard.style.transition = 'none';
            resultCard.style.background = 'rgba(0,0,0,0.35)';
            resultCard.style.border = '2px dashed rgba(100,116,139,0.4)';
            resultCard.style.boxShadow = 'none';
            resultCard.innerHTML = '<span style="font-size:2em;">❓</span><span style="margin-top:6px;color:#a0a0c0;font-size:0.85em;">等待翻牌...</span>';
        }
        setStatus('', '');

        // 洗牌
        shuffledDeck = [...selectedBosses];
        shuffleArray(shuffledDeck);

        // 渲染牌背（帶飛入動畫）
        renderCardBacks(() => {
            isShuffling = false;
            document.getElementById('flip-start-btn').disabled = false;
            setStatus('點擊任意一張牌揭曉今日目標！', '#66ddee');
        });
    };

    // ─── 渲染牌背（飛入） ──────────────────────────────────────────
    function renderCardBacks(onDone) {
        const grid = document.getElementById('flip-card-grid');
        grid.innerHTML = '';

        shuffledDeck.forEach((bossName, idx) => {
            const card = document.createElement('div');
            card.className = 'flip-card-simple';
            card.dataset.boss = bossName;
            card.style.cssText = `
                width:80px; height:90px;
                background:linear-gradient(135deg,#1e2a3a,#0d1b2a);
                border:2px solid rgba(0,153,204,0.3);
                border-radius:10px;
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                cursor:pointer; font-size:1.8em;
                opacity:0; transform:scale(0) rotate(-10deg);
                user-select:none;
            `;
            card.textContent = '❓';
            card.title = '點擊翻牌';

            card.addEventListener('click', () => onCardClick(card, bossName));
            card.addEventListener('mouseenter', () => {
                if (!resultRevealed) {
                    card.style.borderColor = 'rgba(0,153,204,0.8)';
                    card.style.boxShadow = '0 0 14px rgba(0,153,204,0.4)';
                    card.style.transform = 'scale(1.1) translateY(-4px)';
                }
            });
            card.addEventListener('mouseleave', () => {
                if (!resultRevealed) {
                    card.style.borderColor = 'rgba(0,153,204,0.3)';
                    card.style.boxShadow = '';
                    card.style.transform = 'scale(1)';
                }
            });

            grid.appendChild(card);

            // 飛入動畫（stagger）
            setTimeout(() => {
                card.style.transition = 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
                card.style.opacity = '1';
                card.style.transform = 'scale(1) rotate(0deg)';
            }, idx * 55 + 30);
        });

        setTimeout(onDone, shuffledDeck.length * 55 + 500);
    }

    // ─── 點牌翻開 ──────────────────────────────────────────────────
    function onCardClick(card, bossName) {
        if (resultRevealed || isShuffling) return;
        resultRevealed = true;

        const bossColor = BOSS_DATA[bossName]?.color || '#0099cc';
        const bossImg   = BOSS_DATA[bossName]?.image || '';

        // 牌本身：縮小 → 放大顯示正面
        card.style.transition = 'transform 0.15s ease';
        card.style.transform = 'scale(0.8)';

        setTimeout(() => {
            card.style.transition = 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)';
            card.style.background = `linear-gradient(135deg, ${bossColor}33 0%, #0a1929 100%)`;
            card.style.borderColor = bossColor;
            card.style.boxShadow = `0 0 20px ${bossColor}77`;
            card.style.transform = 'scale(1.15) translateY(-5px)';
            card.style.fontSize = '0';
            card.innerHTML = `
                <img src="${bossImg}" alt="${bossName}"
                    style="width:46px;height:46px;object-fit:contain;display:block;">
                <div style="font-size:10px;color:#e2e8f0;margin-top:4px;text-align:center;
                    line-height:1.2;max-width:74px;word-break:break-all;font-weight:bold;">
                    ${bossName}
                </div>
            `;

            // 暗化其他牌
            document.querySelectorAll('.flip-card-simple').forEach(c => {
                if (c !== card) {
                    c.style.transition = 'opacity 0.4s';
                    c.style.opacity = '0.2';
                    c.style.cursor = 'default';
                    c.style.pointerEvents = 'none';
                }
            });

            // 顯示結果大卡
            showResultCard(bossName, bossColor, bossImg);
        }, 150);
    }

    // ─── 結果大卡 ──────────────────────────────────────────────────
    function showResultCard(bossName, color, imgSrc) {
        const resultCard = document.getElementById('flip-result-card');
        if (!resultCard) return;

        resultCard.style.transition = 'all 0.5s cubic-bezier(0.34,1.56,0.64,1)';
        resultCard.style.background = `linear-gradient(135deg, ${color}22 0%, #0a1929 100%)`;
        resultCard.style.border = `2px solid ${color}`;
        resultCard.style.boxShadow = `0 0 28px ${color}55`;
        resultCard.innerHTML = `
            <img src="${imgSrc}" alt="${bossName}"
                style="width:72px;height:72px;object-fit:contain;
                       filter:drop-shadow(0 0 10px ${color}99);
                       animation:bossGlow 1.5s ease-in-out infinite alternate;">
            <div style="font-size:1.05em;color:#ffffff;font-weight:bold;margin-top:10px;
                text-align:center;line-height:1.3;max-width:120px;word-break:break-all;">
                ${bossName}
            </div>
            <div style="font-size:0.75em;color:${color};margin-top:6px;font-weight:bold;
                letter-spacing:1px;">✨ 今日目標！</div>
        `;

        setStatus(`🎯 今天就刷 ${bossName}！`, color);
    }

    // ─── 工具 ──────────────────────────────────────────────────────
    function setStatus(msg, color) {
        const el = document.getElementById('flip-status');
        if (!el) return;
        el.textContent = msg;
        el.style.color = color || '#66ddee';
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ─── 初始化 ────────────────────────────────────────────────────
    window.addEventListener('load', () => {
        if (typeof BOSS_DATA !== 'undefined') {
            initBossList();
        }
    });
})();
