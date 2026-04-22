// ==UserScript==
// @name         🔔 Notificação TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      0.1.0
// @description  Envia alertas Discord/Telegram para ataques chegando e captcha no Tribal Wars BR
// @author       jvkuhn
// @match        https://*.tribalwars.com.br/game.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @connect      api.telegram.org
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/notificacao.user.js
// @updateURL    https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/notificacao.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_ID = 'kuhn-notif';
    const log = (...args) => console.log('[🔔 Notif]', ...args);

    const STORAGE_KEY = 'kuhn-notif-config';

    function getDefaultConfig() {
        return {
            discordWebhookUrl: '',
            telegramBotToken: '',
            telegramChatId: '',
            intervalSec: 30,
            events: {
                ataqueChegando: true,
                captcha: true,
            },
        };
    }

    function getConfig() {
        const raw = GM_getValue(STORAGE_KEY, null);
        if (!raw) return getDefaultConfig();
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return { ...getDefaultConfig(), ...parsed, events: { ...getDefaultConfig().events, ...(parsed.events || {}) } };
        } catch (e) {
            log('Config corrompida, restaurando defaults:', e);
            return getDefaultConfig();
        }
    }

    function setConfig(cfg) {
        GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
        log('Config salva:', cfg);
    }

    function isDiscordConfigured(cfg) {
        return /^https:\/\/discord\.com\/api\/webhooks\//.test(cfg.discordWebhookUrl || '');
    }

    function isTelegramConfigured(cfg) {
        return Boolean(cfg.telegramBotToken && cfg.telegramChatId);
    }

    const DEDUPE_KEY = 'kuhn-notif-dedupe';
    const DEDUPE_TTL_MS = 10 * 60 * 1000;

    function getDedupeMap() {
        const raw = GM_getValue(DEDUPE_KEY, null);
        if (!raw) return {};
        try {
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
            return {};
        }
    }

    function pruneDedupeMap(map) {
        const now = Date.now();
        const out = {};
        for (const [k, expiry] of Object.entries(map)) {
            if (expiry > now) out[k] = expiry;
        }
        return out;
    }

    function eventHash(eventType, eventId) {
        return `${eventType}::${eventId}`;
    }

    function wasRecentlyNotified(hash) {
        const map = pruneDedupeMap(getDedupeMap());
        return Boolean(map[hash]);
    }

    function markNotified(hash) {
        const map = pruneDedupeMap(getDedupeMap());
        map[hash] = Date.now() + DEDUPE_TTL_MS;
        GM_setValue(DEDUPE_KEY, JSON.stringify(map));
    }

    function sendDiscord(webhookUrl, title, message, onResult) {
        const payload = buildDiscordPayload(title, message);
        GM_xmlhttpRequest({
            method: 'POST',
            url: webhookUrl,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(payload),
            onload: (res) => {
                if (res.status >= 200 && res.status < 300) {
                    onResult(null);
                } else if (res.status === 429) {
                    let retry = 5;
                    try { retry = JSON.parse(res.responseText).retry_after || 5; } catch {}
                    onResult(new Error(`Discord rate limited, retry após ${retry}s`));
                } else {
                    onResult(new Error(`Discord HTTP ${res.status}: ${res.responseText.slice(0, 100)}`));
                }
            },
            onerror: () => onResult(new Error('Discord network error')),
        });
    }

    function sendTelegram(token, chatId, title, message, onResult) {
        const url = buildTelegramUrl(token, chatId, title, message);
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload: (res) => {
                if (res.status >= 200 && res.status < 300) {
                    onResult(null);
                } else if (res.status === 429) {
                    onResult(new Error('Telegram rate limited'));
                } else {
                    onResult(new Error(`Telegram HTTP ${res.status}: ${res.responseText.slice(0, 100)}`));
                }
            },
            onerror: () => onResult(new Error('Telegram network error')),
        });
    }

    function notify(title, message, eventType, eventId) {
        const hash = eventHash(eventType, eventId);
        if (wasRecentlyNotified(hash)) {
            log('Dedupe — já notificado:', hash);
            return;
        }
        markNotified(hash);

        const cfg = getConfig();

        if (isDiscordConfigured(cfg)) {
            sendDiscord(cfg.discordWebhookUrl, title, message, (err) => {
                if (err) log('Erro Discord:', err.message);
                else log('Discord enviado:', title);
            });
        }

        if (isTelegramConfigured(cfg)) {
            sendTelegram(cfg.telegramBotToken, cfg.telegramChatId, title, message, (err) => {
                if (err) log('Erro Telegram:', err.message);
                else log('Telegram enviado:', title);
            });
        }
    }

    function buildDiscordPayload(title, message) {
        return {
            username: '🔔 TW Notif',
            content: `**${title}**\n${message}`,
        };
    }

    function buildTelegramUrl(token, chatId, title, message) {
        const text = `🔔 ${title}\n${message}`;
        const params = new URLSearchParams({ chat_id: chatId, text });
        return `https://api.telegram.org/bot${token}/sendMessage?${params.toString()}`;
    }

    function buildModalHtml() {
        return `
            <div id="${SCRIPT_ID}-overlay" style="
                position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.6);z-index:99998;display:flex;
                align-items:center;justify-content:center;">
                <div style="
                    background:#f4e4bc;border:2px solid #603000;border-radius:6px;
                    padding:20px;width:480px;max-width:90vw;max-height:85vh;
                    overflow:auto;font-family:Verdana,sans-serif;color:#000;">
                    <h3 style="margin:0 0 12px 0;color:#603000;">🔔 Configuração de Notificações</h3>

                    <div style="margin-bottom:8px;">
                        <strong>Status:</strong>
                        <span id="${SCRIPT_ID}-status-discord">Discord: ❌</span> |
                        <span id="${SCRIPT_ID}-status-telegram">Telegram: ❌</span>
                    </div>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Discord</legend>
                        <label style="display:block;margin-bottom:4px;">Webhook URL:</label>
                        <input type="text" id="${SCRIPT_ID}-discord-url" style="width:100%;padding:4px;" placeholder="https://discord.com/api/webhooks/...">
                        <button id="${SCRIPT_ID}-test-discord" style="margin-top:6px;">Testar Discord</button>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Telegram</legend>
                        <label style="display:block;margin-bottom:4px;">Token do Bot:</label>
                        <input type="text" id="${SCRIPT_ID}-tg-token" style="width:100%;padding:4px;" placeholder="123456:ABC-DEF...">
                        <label style="display:block;margin:6px 0 4px 0;">Chat ID:</label>
                        <input type="text" id="${SCRIPT_ID}-tg-chatid" style="width:100%;padding:4px;" placeholder="123456789">
                        <button id="${SCRIPT_ID}-test-telegram" style="margin-top:6px;">Testar Telegram</button>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Eventos</legend>
                        <label><input type="checkbox" id="${SCRIPT_ID}-evt-ataque"> Ataque chegando</label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-evt-captcha"> Captcha apareceu</label>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Avançado</legend>
                        <label>Intervalo de verificação (segundos, mín 10):
                            <input type="number" id="${SCRIPT_ID}-interval" min="10" style="width:80px;">
                        </label>
                    </fieldset>

                    <div style="text-align:right;">
                        <button id="${SCRIPT_ID}-cancel">Cancelar</button>
                        <button id="${SCRIPT_ID}-save" style="margin-left:8px;">Salvar</button>
                    </div>
                </div>
            </div>
        `;
    }

    function populateModalFromConfig() {
        const cfg = getConfig();
        document.getElementById(`${SCRIPT_ID}-discord-url`).value = cfg.discordWebhookUrl || '';
        document.getElementById(`${SCRIPT_ID}-tg-token`).value = cfg.telegramBotToken || '';
        document.getElementById(`${SCRIPT_ID}-tg-chatid`).value = cfg.telegramChatId || '';
        document.getElementById(`${SCRIPT_ID}-evt-ataque`).checked = !!cfg.events.ataqueChegando;
        document.getElementById(`${SCRIPT_ID}-evt-captcha`).checked = !!cfg.events.captcha;
        document.getElementById(`${SCRIPT_ID}-interval`).value = cfg.intervalSec || 30;
        updateStatusBadges(cfg);
    }

    function updateStatusBadges(cfg) {
        const dEl = document.getElementById(`${SCRIPT_ID}-status-discord`);
        const tEl = document.getElementById(`${SCRIPT_ID}-status-telegram`);
        if (dEl) dEl.textContent = `Discord: ${isDiscordConfigured(cfg) ? '✅' : '❌'}`;
        if (tEl) tEl.textContent = `Telegram: ${isTelegramConfigured(cfg) ? '✅' : '❌'}`;
    }

    function readModalToConfig() {
        const interval = parseInt(document.getElementById(`${SCRIPT_ID}-interval`).value, 10) || 30;
        return {
            discordWebhookUrl: document.getElementById(`${SCRIPT_ID}-discord-url`).value.trim(),
            telegramBotToken: document.getElementById(`${SCRIPT_ID}-tg-token`).value.trim(),
            telegramChatId: document.getElementById(`${SCRIPT_ID}-tg-chatid`).value.trim(),
            intervalSec: Math.max(10, interval),
            events: {
                ataqueChegando: document.getElementById(`${SCRIPT_ID}-evt-ataque`).checked,
                captcha: document.getElementById(`${SCRIPT_ID}-evt-captcha`).checked,
            },
        };
    }

    function openModal() {
        if (document.getElementById(`${SCRIPT_ID}-overlay`)) return;
        document.body.insertAdjacentHTML('beforeend', buildModalHtml());
        populateModalFromConfig();

        document.getElementById(`${SCRIPT_ID}-cancel`).addEventListener('click', closeModal);
        document.getElementById(`${SCRIPT_ID}-overlay`).addEventListener('click', (e) => {
            if (e.target.id === `${SCRIPT_ID}-overlay`) closeModal();
        });
        document.getElementById(`${SCRIPT_ID}-save`).addEventListener('click', () => {
            const newCfg = readModalToConfig();
            setConfig(newCfg);
            updateStatusBadges(newCfg);
            startLoop();
            alert('Configuração salva.');
            closeModal();
        });

        document.getElementById(`${SCRIPT_ID}-test-discord`).addEventListener('click', () => {
            const url = document.getElementById(`${SCRIPT_ID}-discord-url`).value.trim();
            if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
                alert('Webhook inválido. Cole a URL completa do webhook do Discord.');
                return;
            }
            sendDiscord(url, 'Teste', 'Mensagem de teste do kuhn-tw-scripts', (err) => {
                alert(err ? `Falhou: ${err.message}` : 'Enviado! Verifique o canal do Discord.');
            });
        });

        document.getElementById(`${SCRIPT_ID}-test-telegram`).addEventListener('click', () => {
            const token = document.getElementById(`${SCRIPT_ID}-tg-token`).value.trim();
            const chatId = document.getElementById(`${SCRIPT_ID}-tg-chatid`).value.trim();
            if (!token || !chatId) {
                alert('Preencha token e chat ID antes de testar.');
                return;
            }
            sendTelegram(token, chatId, 'Teste', 'Mensagem de teste do kuhn-tw-scripts', (err) => {
                alert(err ? `Falhou: ${err.message}` : 'Enviado! Verifique o Telegram.');
            });
        });

        log('Modal aberto.');
    }

    function closeModal() {
        const overlay = document.getElementById(`${SCRIPT_ID}-overlay`);
        if (overlay) overlay.remove();
        log('Modal fechado.');
    }

    const ATAQUE_LAST_KEY = 'kuhn-notif-ataque-last';

    function getCurrentIncomingsCount() {
        if (typeof game_data !== 'undefined' && game_data.player && game_data.player.incomings != null) {
            return parseInt(game_data.player.incomings, 10) || 0;
        }
        const el = document.querySelector('#incomings_amount, .incoming_amount');
        if (el) {
            const m = el.textContent.match(/\d+/);
            if (m) return parseInt(m[0], 10);
        }
        return null;
    }

    function checkAtaqueChegando() {
        const cfg = getConfig();
        if (!cfg.events.ataqueChegando) return;

        const current = getCurrentIncomingsCount();
        if (current === null) {
            log('Não foi possível ler incomings (game_data e DOM falharam).');
            return;
        }

        const last = parseInt(GM_getValue(ATAQUE_LAST_KEY, '0'), 10) || 0;
        GM_setValue(ATAQUE_LAST_KEY, String(current));

        if (current > last) {
            const novos = current - last;
            const msg = `Você tem ${current} ataque${current > 1 ? 's' : ''} chegando${novos > 1 ? ` (+${novos} novo${novos > 1 ? 's' : ''})` : ''}.`;
            notify('⚔️ Ataque chegando', msg, 'ataque', `count-${current}-at-${Date.now()}`);
        }
    }

    let consecutiveErrors = 0;
    const MAX_ERRORS = 3;

    function setButtonState(state) {
        const btn = document.getElementById(`${SCRIPT_ID}-btn`);
        if (!btn) return;
        if (state === 'error') {
            btn.textContent = '⚠️';
            btn.style.background = '#a00';
            btn.title = 'Erros consecutivos — clique para ver config / recarregar';
        } else if (state === 'paused') {
            btn.textContent = '⏸️';
            btn.style.background = '#666';
            btn.title = 'Sessão expirou — recarregue a página';
        } else {
            btn.textContent = '🔔';
            btn.style.background = '#603000';
            btn.title = 'Notificações TW (clique para configurar)';
        }
    }

    function isSessionLost() {
        return typeof game_data === 'undefined' || !game_data.player;
    }

    let loopHandle = null;

    function loopTick() {
        if (isSessionLost()) {
            log('Sessão TW perdida — pausando loop.');
            setButtonState('paused');
            stopLoop();
            return;
        }
        try {
            checkAtaqueChegando();
            consecutiveErrors = 0;
            setButtonState('ok');
        } catch (e) {
            consecutiveErrors++;
            log(`Erro no tick (${consecutiveErrors}/${MAX_ERRORS}):`, e);
            if (consecutiveErrors >= MAX_ERRORS) {
                setButtonState('error');
            }
        }
    }

    function startLoop() {
        const cfg = getConfig();
        if (!isDiscordConfigured(cfg) && !isTelegramConfigured(cfg)) {
            log('Nenhum canal configurado — loop NÃO iniciado.');
            return;
        }
        stopLoop();
        const ms = Math.max(10, cfg.intervalSec) * 1000;
        loopHandle = setInterval(loopTick, ms);
        log(`Loop iniciado (intervalo ${ms}ms).`);
        loopTick();
    }

    function stopLoop() {
        if (loopHandle !== null) {
            clearInterval(loopHandle);
            loopHandle = null;
            log('Loop parado.');
        }
    }

    const CAPTCHA_SELECTORS = [
        '#popup_box_bot_protection',
        '#bot_check',
        '[class*="bot_protection"]',
        '#botprotection_quest',
    ];

    function findCaptchaElement(node) {
        if (!(node instanceof Element)) return null;
        for (const sel of CAPTCHA_SELECTORS) {
            if (node.matches && node.matches(sel)) return node;
            const found = node.querySelector ? node.querySelector(sel) : null;
            if (found) return found;
        }
        return null;
    }

    function startCaptchaObserver() {
        const cfg = getConfig();
        if (!cfg.events.captcha) return;

        for (const sel of CAPTCHA_SELECTORS) {
            if (document.querySelector(sel)) {
                notify('🤖 Captcha apareceu', 'Verificação anti-bot detectada — resolva no jogo.', 'captcha', `present-${Date.now()}`);
                break;
            }
        }

        const observer = new MutationObserver((mutations) => {
            if (!getConfig().events.captcha) return;
            for (const m of mutations) {
                for (const added of m.addedNodes) {
                    if (findCaptchaElement(added)) {
                        notify(
                            '🤖 Captcha apareceu',
                            'Verificação anti-bot detectada — resolva no jogo.',
                            'captcha',
                            `mutation-${Date.now()}`,
                        );
                        return;
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        log('Observer de captcha ativo.');
    }

    function injectButton() {
        if (document.getElementById(`${SCRIPT_ID}-btn`)) return;

        const btn = document.createElement('div');
        btn.id = `${SCRIPT_ID}-btn`;
        btn.textContent = '🔔';
        btn.title = 'Notificações TW (clique para configurar)';
        Object.assign(btn.style, {
            position: 'fixed',
            top: '8px',
            right: '8px',
            background: '#603000',
            color: '#fff',
            padding: '6px 10px',
            cursor: 'pointer',
            borderRadius: '4px',
            zIndex: '99999',
            fontSize: '18px',
            border: '1px solid #2c1810',
            userSelect: 'none',
        });
        btn.addEventListener('click', openModal);
        document.body.appendChild(btn);
        log('Botão injetado.');
    }

    injectButton();
    startLoop();
    startCaptchaObserver();
})();
