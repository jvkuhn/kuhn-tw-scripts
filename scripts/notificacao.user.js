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
        btn.addEventListener('click', () => {
            log('Botão clicado — modal ainda não implementado.');
            alert('Modal de configuração será implementado na próxima task.');
        });
        document.body.appendChild(btn);
        log('Botão injetado.');
    }

    injectButton();
})();
