// ==UserScript==
// @name         🏰 Up Village TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      0.3.1
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
    log('IIFE iniciada — versão 0.3.1');

    const ENABLED_KEY = 'kuhn-village-enabled';
    const TICK_MS = 4000;
    const QUEST_OPEN_COOLDOWN_MS = 30000; // 30s entre tentativas de abrir popup vazio

    // =====================================================================
    // MÓDULO 1: AUTO-QUEST (resgatar missões/recompensas)
    // Lógica nova (v0.3.1):
    //  1. Se popup tá ABERTO → procura botão de claim. Se achar, clica.
    //                          Se NÃO achar, NÃO faz nada (espera o popup fechar).
    //  2. Se popup tá FECHADO → só clica em #new_quest se passou o cooldown
    //                          (evita ficar abrindo popup vazio toda hora).
    // =====================================================================
    const QUEST_POPUP_SELECTOR = '.quest-popup-content, #main-tab.quest-popup-content';
    const QUEST_CLAIM_SELECTOR = '.quest-complete-btn';
    const QUEST_OPENER_SELECTOR = '#new_quest';
    let lastQuestOpenAttempt = 0;

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

    function tryClick(selector, label) {
        const el = document.querySelector(selector);
        if (el && isVisible(el)) {
            log(`[${label}] Clicando:`, selector);
            el.click();
            return true;
        }
        return false;
    }

    function questModule() {
        const popupOpen = isVisible(document.querySelector(QUEST_POPUP_SELECTOR));

        if (popupOpen) {
            // Popup aberto: tenta claim. Se não tem botão, espera popup fechar (não força nada).
            if (tryClick(QUEST_CLAIM_SELECTOR, 'quest-claim')) return true;
            return false;
        }

        // Popup fechado: só abre se passou o cooldown
        const now = Date.now();
        if (now - lastQuestOpenAttempt < QUEST_OPEN_COOLDOWN_MS) return false;

        if (tryClick(QUEST_OPENER_SELECTOR, 'quest-open')) {
            lastQuestOpenAttempt = now;
            return true;
        }
        return false;
    }

    function tick() {
        if (!isEnabled()) return;
        // Módulo 1: quest
        if (questModule()) return;
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
