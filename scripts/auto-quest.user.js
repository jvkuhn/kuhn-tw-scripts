// ==UserScript==
// @name         🎯 Auto Quest TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      0.1.0
// @description  Auto-clicar botões de aceitar/concluir/resgatar missões e recompensas no Tribal Wars BR
// @author       jvkuhn
// @include      https://*.tribalwars.com.br/*
// @include      **game*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/auto-quest.user.js
// @updateURL    https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/auto-quest.user.js
// ==/UserScript==

console.log('[🎯 AutoQuest] Script carregando...');
(function () {
    'use strict';

    const SCRIPT_ID = 'kuhn-quest';
    const log = (...args) => console.log('[🎯 AutoQuest]', ...args);
    log('IIFE iniciada — versão 0.1.0');

    const ENABLED_KEY = 'kuhn-quest-enabled';
    const TICK_MS = 5000;

    // Seletores que o script vai procurar e clicar (em ordem).
    // Confirmado pelo usuário: .quest-complete-btn
    // Outros são chutes educados — adicionar/remover conforme descoberto.
    const SELECTORS = [
        '.quest-complete-btn',
        '.quest-accept-btn',
        '.quest-claim-btn',
        '.collect-btn',
        '.claim-btn',
    ];

    function isEnabled() {
        return GM_getValue(ENABLED_KEY, false) === true;
    }

    function setEnabled(v) {
        GM_setValue(ENABLED_KEY, v);
        updateButton();
        log('Estado:', v ? 'LIGADO' : 'DESLIGADO');
    }

    function isVisible(el) {
        if (!el || !el.offsetParent) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function tick() {
        if (!isEnabled()) return;
        for (const sel of SELECTORS) {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) {
                log('Clicando:', sel);
                el.click();
                return; // 1 clique por tick pra evitar spam
            }
        }
    }

    function updateButton() {
        const btn = document.getElementById(`${SCRIPT_ID}-btn`);
        if (!btn) return;
        const on = isEnabled();
        btn.textContent = on ? '🎯 ON' : '🎯 OFF';
        btn.style.background = on ? '#2a8a2a' : '#666';
    }

    function injectButton() {
        if (document.getElementById(`${SCRIPT_ID}-btn`)) return;
        const btn = document.createElement('div');
        btn.id = `${SCRIPT_ID}-btn`;
        btn.title = 'Auto Quest — clique para ligar/desligar';
        Object.assign(btn.style, {
            position: 'fixed',
            top: '270px',
            left: '8px',
            color: '#fff',
            padding: '10px 14px',
            cursor: 'pointer',
            borderRadius: '6px',
            zIndex: '99999',
            fontSize: '18px',
            border: '2px solid #fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            userSelect: 'none',
            fontWeight: 'bold',
        });
        btn.addEventListener('click', () => setEnabled(!isEnabled()));
        document.body.appendChild(btn);
        updateButton();
        log('Botão injetado.');
    }

    injectButton();
    setInterval(tick, TICK_MS);
    log(`Loop iniciado (${TICK_MS}ms). Estado inicial: ${isEnabled() ? 'LIGADO' : 'DESLIGADO'}`);
})();
