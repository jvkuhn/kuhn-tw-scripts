// ==UserScript==
// @name         🏰 Up Village TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      1.1.0
// @description  Automação de evolução de aldeia em background — quest claim, construtor (sem precisar de Premium AM) + debug pro Discord
// @author       jvkuhn
// @include      https://*.tribalwars.com.br/*
// @include      **game*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/up-village.user.js
// @updateURL    https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/up-village.user.js
// ==/UserScript==

console.log('[🏰 UpVillage] Script carregando...');
(function () {
    'use strict';

    const SCRIPT_ID = 'kuhn-village';
    const SCRIPT_VERSION = '1.1.0';

    // log() wrappa console.log + push pro buffer Discord (se debug ON)
    const log = (...args) => {
        console.log('[🏰 UpVillage]', ...args);
        debugPush('INFO', args);
    };

    // ---------------- Discord debug logger ----------------
    const DEBUG_BUFFER = [];
    const DEBUG_FLUSH_MS = 10000;
    const DEBUG_MAX_BUFFER = 20;
    const DEBUG_MAX_MSG_CHARS = 1800;

    function getDiscordWebhook() {
        // Compartilha webhook configurado no notificacao.user.js
        const raw = GM_getValue('kuhn-notif-config', null);
        if (!raw) return null;
        try {
            const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return cfg.discordWebhookUrl || null;
        } catch {
            return null;
        }
    }

    function debugPush(level, args) {
        const cfg = getConfig();
        if (!cfg.debug) return;
        const ts = new Date().toLocaleTimeString();
        const text = args.map(a => {
            if (a instanceof Error) return a.message;
            if (typeof a === 'object') {
                try { return JSON.stringify(a); } catch { return String(a); }
            }
            return String(a);
        }).join(' ');
        DEBUG_BUFFER.push(`[${ts}] [${level}] ${text}`);
        if (DEBUG_BUFFER.length >= DEBUG_MAX_BUFFER) flushDebug();
    }

    function flushDebug() {
        if (DEBUG_BUFFER.length === 0) return;
        const webhook = getDiscordWebhook();
        if (!webhook) {
            DEBUG_BUFFER.length = 0; // descarta se sem webhook
            return;
        }

        const village = (typeof game_data !== 'undefined' && game_data.village) ? game_data.village.coord : '?';
        const player = (typeof game_data !== 'undefined' && game_data.player) ? game_data.player.name : '?';
        const header = `🏰 UpVillage v${SCRIPT_VERSION} [${player} / ${village}]`;
        let body = DEBUG_BUFFER.splice(0).join('\n');
        const wrap = `\`\`\`\n${header}\n${body}\n\`\`\``;
        const content = wrap.length > DEBUG_MAX_MSG_CHARS
            ? wrap.slice(0, DEBUG_MAX_MSG_CHARS) + '\n...(truncado)```'
            : wrap;

        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: webhook,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ content }),
                onerror: () => { /* silencioso, evita loop */ },
            });
        } catch {}
    }

    setInterval(flushDebug, DEBUG_FLUSH_MS);
    // ---------------- /Discord debug ----------------

    log(`IIFE iniciada — versão ${SCRIPT_VERSION}`);

    const STORAGE_KEY = 'kuhn-village-config';
    const QUEUE_STATE_KEY = 'kuhn-village-queue-state';
    const TICK_MS = 8000; // 8s entre ticks (não agressivo)

    // =====================================================================
    // CONFIG
    // =====================================================================
    function getDefaultConfig() {
        return {
            enabled: false,
            debug: false,
            modules: {
                quest: true,
                construtor: false,
            },
            buildPlan: '# Cole aqui a sequência de construção, um por linha.\n# Aliases aceitos: madeireira/wood, barro/stone, ferro/iron, granja/farm,\n# armazem/storage, esconderijo/hide, muralha/wall, principal/main,\n# quartel/barracks, estabulo/stable, oficina/garage, ferreiro/smith,\n# praca/place, estatua/statue, mercado/market, academia/snob, igreja/church\n#\n# Exemplo de início típico de mundo:\nmadeireira\nbarro\nferro\nmadeireira\nbarro\nferro\ngranja\narmazem\nmadeireira\nbarro\nferro\n',
            queueMaxItems: 2, // free account = 2 slots de fila
        };
    }

    function getConfig() {
        const raw = GM_getValue(STORAGE_KEY, null);
        if (!raw) return getDefaultConfig();
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return {
                ...getDefaultConfig(),
                ...parsed,
                modules: { ...getDefaultConfig().modules, ...(parsed.modules || {}) },
            };
        } catch (e) {
            log('Config corrompida, restaurando defaults.', e);
            return getDefaultConfig();
        }
    }

    function setConfig(cfg) {
        GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
        log('Config salva.');
    }

    // =====================================================================
    // BUILDING ALIASES
    // =====================================================================
    const ALIASES = {
        madeireira: 'wood', wood: 'wood', madeira: 'wood',
        barro: 'stone', argila: 'stone', stone: 'stone', poco: 'stone',
        ferro: 'iron', iron: 'iron', mina: 'iron',
        granja: 'farm', farm: 'farm', fazenda: 'farm',
        armazem: 'storage', storage: 'storage', deposito: 'storage',
        esconderijo: 'hide', hide: 'hide',
        muralha: 'wall', wall: 'wall', muro: 'wall',
        principal: 'main', main: 'main', edificio: 'main',
        quartel: 'barracks', barracks: 'barracks',
        estabulo: 'stable', stable: 'stable',
        oficina: 'garage', garage: 'garage', workshop: 'garage',
        ferreiro: 'smith', smith: 'smith',
        praca: 'place', place: 'place', reuniao: 'place',
        estatua: 'statue', statue: 'statue',
        mercado: 'market', market: 'market',
        academia: 'snob', snob: 'snob',
        igreja: 'church', church: 'church',
        atalaia: 'watchtower', watchtower: 'watchtower',
    };

    function normalizeBuilding(name) {
        const k = name.trim().toLowerCase().replace(/[^a-z]/g, '');
        return ALIASES[k] || null;
    }

    function parsePlan(planText) {
        return planText
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'))
            .map(normalizeBuilding)
            .filter(Boolean);
    }

    // =====================================================================
    // FETCH HELPERS (TW internal API)
    // =====================================================================
    function buildUrl(screen, params = {}) {
        const base = (typeof game_data !== 'undefined' && game_data.link_base_pure)
            ? game_data.link_base_pure + screen
            : `${location.pathname}?screen=${screen}`;
        const qs = new URLSearchParams(params).toString();
        return qs ? `${base}&${qs}` : base;
    }

    async function twFetch(url, opts = {}) {
        try {
            const res = await fetch(url, {
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'TribalWars-Ajax': '1',
                    ...(opts.headers || {}),
                },
                ...opts,
            });
            if (!res.ok) {
                log(`HTTP ${res.status} em ${url}`);
                return null;
            }
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch {
                return text;
            }
        } catch (e) {
            log('Erro de fetch:', e.message);
            return null;
        }
    }

    // =====================================================================
    // MÓDULO 1: QUEST (em background — sem abrir popup)
    // =====================================================================
    async function questModule() {
        const cfg = getConfig();
        if (!cfg.modules.quest) return;

        if (typeof game_data === 'undefined' || !game_data.player) return;
        const newQuestCount = parseInt(game_data.player.new_quest, 10) || 0;
        if (newQuestCount <= 0) return;

        log(`Quest: ${newQuestCount} pendente(s), buscando IDs...`);

        // Fetch a lista de quests pra descobrir IDs disponíveis
        const html = await twFetch(buildUrl('new_quests'));
        if (typeof html !== 'string') return;

        // Procura quest IDs no HTML (padrão data-quest-id="N" ou href com quest=N)
        const ids = new Set();
        const reA = /data-quest[-_]?id\s*=\s*["'](\d+)["']/gi;
        const reB = /quest=(\d+)/g;
        let m;
        while ((m = reA.exec(html)) !== null) ids.add(m[1]);
        while ((m = reB.exec(html)) !== null) ids.add(m[1]);

        if (ids.size === 0) {
            log('Quest: nenhum ID encontrado no HTML.');
            return;
        }

        for (const id of ids) {
            const url = buildUrl('api', { ajaxaction: 'quest_complete', quest: id, skip: 'false', h: game_data.csrf });
            const result = await twFetch(url, { method: 'POST' });
            log(`Quest ${id} claim →`, result ? 'OK' : 'FAIL');
        }
    }

    // =====================================================================
    // MÓDULO 2: CONSTRUTOR (em background — submete upgrades via API)
    // =====================================================================
    async function getQueueCount() {
        // Fetch screen=main e conta itens em #buildqueue
        const html = await twFetch(buildUrl('main'));
        if (typeof html !== 'string') return null;
        // Conta linhas <tr class="lit nodrag buildorder_*"> — cada uma é um item na fila
        const matches = html.match(/<tr[^>]*\bbuildorder_\w+/g);
        return matches ? matches.length : 0;
    }

    async function tryUpgrade(buildingType) {
        const url = buildUrl('main', { ajaxaction: 'upgrade_building', type: buildingType, h: game_data.csrf });
        const result = await twFetch(url, { method: 'POST' });
        return result;
    }

    async function construtorModule() {
        const cfg = getConfig();
        if (!cfg.modules.construtor) return;

        const plan = parsePlan(cfg.buildPlan);
        if (plan.length === 0) return;

        const queueCount = await getQueueCount();
        if (queueCount === null) {
            log('Construtor: não consegui ler fila.');
            return;
        }

        if (queueCount >= cfg.queueMaxItems) {
            log(`Construtor: fila cheia (${queueCount}/${cfg.queueMaxItems}).`);
            return;
        }

        // Quantos prédios já foram enfileirados desde o início do plano?
        // Estratégia simples: usa o índice = (total_já_enfileirado) que guardamos
        const state = JSON.parse(GM_getValue(QUEUE_STATE_KEY, '{}') || '{}');
        const planHash = plan.join('|');
        if (state.planHash !== planHash) {
            // Plano mudou, reseta progresso
            state.planHash = planHash;
            state.nextIndex = 0;
        }

        if (state.nextIndex >= plan.length) {
            log('Construtor: plano completo!');
            return;
        }

        const nextBuilding = plan[state.nextIndex];
        log(`Construtor: tentando upar ${nextBuilding} (passo ${state.nextIndex + 1}/${plan.length})`);

        const result = await tryUpgrade(nextBuilding);
        if (result && (typeof result === 'object' ? !result.error : true)) {
            state.nextIndex++;
            GM_setValue(QUEUE_STATE_KEY, JSON.stringify(state));
            log(`Construtor: ${nextBuilding} enfileirado. Próximo passo: ${state.nextIndex + 1}`);
        } else {
            log(`Construtor: ${nextBuilding} falhou (recursos? requisitos?). Tentando de novo no próximo tick.`);
        }
    }

    // =====================================================================
    // MAIN TICK
    // =====================================================================
    async function tick() {
        const cfg = getConfig();
        if (!cfg.enabled) return;
        try {
            await questModule();
            await construtorModule();
        } catch (e) {
            log('Erro no tick:', e);
        }
    }

    // =====================================================================
    // HUD MODAL
    // =====================================================================
    function buildHudHtml() {
        return `
            <div id="${SCRIPT_ID}-overlay" style="
                position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.6);z-index:99998;display:flex;
                align-items:center;justify-content:center;">
                <div style="
                    background:#f4e4bc;border:2px solid #603000;border-radius:6px;
                    padding:20px;width:560px;max-width:90vw;max-height:85vh;
                    overflow:auto;font-family:Verdana,sans-serif;color:#000;">
                    <h3 style="margin:0 0 12px 0;color:#603000;">🏰 Up Village — Painel de Controle</h3>

                    <fieldset style="margin-bottom:10px;border:2px solid #603000;padding:8px;background:#fff8e0;">
                        <legend><strong>Master</strong></legend>
                        <label style="font-size:16px;">
                            <input type="checkbox" id="${SCRIPT_ID}-enabled" style="transform:scale(1.4);margin-right:8px;">
                            Ligar automação
                        </label><br>
                        <label style="margin-top:6px;display:inline-block;">
                            <input type="checkbox" id="${SCRIPT_ID}-debug" style="margin-right:6px;">
                            🐛 Enviar logs pro Discord (usa o webhook do notificacao)
                        </label>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Módulos</legend>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-quest"> 🎯 Quest auto-claim (background)</label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-construtor"> 🏗️ Construtor (segue plano abaixo)</label>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Plano de Construção</legend>
                        <small>Um prédio por linha. Linhas com # são comentários.<br>Aliases: madeireira/barro/ferro/granja/armazem/muralha/principal/quartel/etc.</small>
                        <textarea id="${SCRIPT_ID}-plan" style="width:100%;height:200px;font-family:monospace;margin-top:6px;"></textarea>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Fila</legend>
                        <label>Slots máximos da fila (free=2, premium=5):
                            <input type="number" id="${SCRIPT_ID}-queue-max" min="1" max="5" style="width:60px;">
                        </label>
                        <button id="${SCRIPT_ID}-reset-progress" style="margin-left:12px;">Resetar progresso do plano</button>
                    </fieldset>

                    <div style="text-align:right;">
                        <button id="${SCRIPT_ID}-cancel">Fechar</button>
                        <button id="${SCRIPT_ID}-save" style="margin-left:8px;">Salvar</button>
                    </div>
                </div>
            </div>
        `;
    }

    function populateHud() {
        const cfg = getConfig();
        document.getElementById(`${SCRIPT_ID}-enabled`).checked = !!cfg.enabled;
        document.getElementById(`${SCRIPT_ID}-debug`).checked = !!cfg.debug;
        document.getElementById(`${SCRIPT_ID}-mod-quest`).checked = !!cfg.modules.quest;
        document.getElementById(`${SCRIPT_ID}-mod-construtor`).checked = !!cfg.modules.construtor;
        document.getElementById(`${SCRIPT_ID}-plan`).value = cfg.buildPlan || '';
        document.getElementById(`${SCRIPT_ID}-queue-max`).value = cfg.queueMaxItems || 2;
    }

    function readHud() {
        return {
            enabled: document.getElementById(`${SCRIPT_ID}-enabled`).checked,
            debug: document.getElementById(`${SCRIPT_ID}-debug`).checked,
            modules: {
                quest: document.getElementById(`${SCRIPT_ID}-mod-quest`).checked,
                construtor: document.getElementById(`${SCRIPT_ID}-mod-construtor`).checked,
            },
            buildPlan: document.getElementById(`${SCRIPT_ID}-plan`).value,
            queueMaxItems: Math.max(1, Math.min(5, parseInt(document.getElementById(`${SCRIPT_ID}-queue-max`).value, 10) || 2)),
        };
    }

    function openHud() {
        if (document.getElementById(`${SCRIPT_ID}-overlay`)) return;
        document.body.insertAdjacentHTML('beforeend', buildHudHtml());
        populateHud();

        document.getElementById(`${SCRIPT_ID}-cancel`).addEventListener('click', closeHud);
        document.getElementById(`${SCRIPT_ID}-overlay`).addEventListener('click', (e) => {
            if (e.target.id === `${SCRIPT_ID}-overlay`) closeHud();
        });
        document.getElementById(`${SCRIPT_ID}-save`).addEventListener('click', () => {
            setConfig(readHud());
            updateButton();
            alert('Salvo.');
            closeHud();
        });
        document.getElementById(`${SCRIPT_ID}-reset-progress`).addEventListener('click', () => {
            GM_setValue(QUEUE_STATE_KEY, '{}');
            alert('Progresso do plano resetado. Próximo tick recomeça do início.');
        });
    }

    function closeHud() {
        const o = document.getElementById(`${SCRIPT_ID}-overlay`);
        if (o) o.remove();
    }

    function updateButton() {
        const btn = document.getElementById(`${SCRIPT_ID}-btn`);
        if (!btn) return;
        const cfg = getConfig();
        btn.textContent = cfg.enabled ? '🏰 ON' : '🏰 OFF';
        btn.style.background = cfg.enabled ? '#2a8a2a' : '#666';
    }

    function injectButton() {
        if (document.getElementById(`${SCRIPT_ID}-btn`)) return;
        const btn = document.createElement('div');
        btn.id = `${SCRIPT_ID}-btn`;
        btn.title = 'Up Village — clique para abrir painel';
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
        btn.addEventListener('click', openHud);
        document.body.appendChild(btn);
        updateButton();
        log('Botão injetado.');
    }

    injectButton();
    setInterval(tick, TICK_MS);
    log(`Loop iniciado (${TICK_MS}ms).`);
})();
