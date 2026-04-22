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
