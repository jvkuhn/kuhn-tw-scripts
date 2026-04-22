// ==UserScript==
// @name         🏰 Up Village TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      0.3.0
// @description  Automação de evolução de aldeia no Tribal Wars BR (claim de missões/recompensas; futuras: construção, recrutamento, coleta)
// @author       jvkuhn
// @include      https://*.tribalwars.com.br/*
// @include      **game*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/up-village.user.js
// @updateURL    https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/up-village.user.js
// ==/UserScript==

console.log('[🏰 UpVillage] Script carregando...');
(function () {
    'use strict';

    const SCRIPT_ID = 'kuhn-village';
    const log = (...args) => console.log('[🏰 UpVillage]', ...args);
    log('IIFE iniciada — versão 0.3.0');

    const ENABLED_KEY = 'kuhn-village-enabled';
    const TICK_MS = 4000;

    // =====================================================================
    // MÓDULO 1: AUTO-QUEST (resgatar missões/recompensas)
    // Sequência: clica no popup pra resgatar; se popup fechado, abre.
    // Ordem importa: '.quest-complete-btn' antes de '#new_quest'.
    // =====================================================================
    const QUEST_SELECTORS = [
        '.quest-complete-btn',  // botão verde "Concluir/Resgatar" dentro do popup
        '#new_quest',           // ícone de quest pendente (abre popup)
    ];

    // =====================================================================
    // MÓDULOS FUTUROS (a implementar):
    // - Auto Construtor: fila de construção baseada em plano
    // - Auto Coleta: pegar recursos da coleta a cada X horas
    // - Auto Recrutamento: manter tropas-alvo treinando
    // =====================================================================

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

    function tryClick(selectors, label) {
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) {
                log(`[${label}] Clicando:`, sel);
                el.click();
                return true;
            }
        }
        return false;
    }

    function tick() {
        if (!isEnabled()) return;
        // Módulo 1: quest
        if (tryClick(QUEST_SELECTORS, 'quest')) return;
        // (futuros módulos entram aqui)
    }

    function updateButton() {
        const btn = document.getElementById(`${SCRIPT_ID}-btn`);
        if (!btn) return;
        const on = isEnabled();
        btn.textContent = on ? '🏰 ON' : '🏰 OFF';
        btn.style.background = on ? '#2a8a2a' : '#666';
    }

    function injectButton() {
        if (document.getElementById(`${SCRIPT_ID}-btn`)) return;
        const btn = document.createElement('div');
        btn.id = `${SCRIPT_ID}-btn`;
        btn.title = 'Up Village — clique para ligar/desligar evolução automática';
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
