// ==UserScript==
// @name         🏰 Up Village TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      1.3.2
// @description  Automação de evolução de aldeia + recording mode (sniffer de rede) + uso de funções nativas do TW
// @author       jvkuhn
// @include      https://*.tribalwars.com.br/*
// @include      **game*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      discord.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/up-village.user.js
// @updateURL    https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/up-village.user.js
// ==/UserScript==

console.log('[🏰 UpVillage] Script carregando...');
(function () {
    'use strict';

    const SCRIPT_ID = 'kuhn-village';
    const SCRIPT_VERSION = '1.3.2';

    // Flags globais — atualizadas ao ler/salvar config
    let debugEnabled = false;
    let recordingEnabled = false;

    const STORAGE_KEY = 'kuhn-village-config';
    const TICK_MS = 8000;
    const SNIFF_FLAG = '__kuhnSnifferInjected_v3';

    // =====================================================================
    // SNIFFER DE REDE (recording mode) — v1.3.2
    // Override DIRETO via unsafeWindow (sem injetar <script>, evita CSP).
    // Diretamente atribui callbacks que o sandbox processa.
    // =====================================================================
    function installSniffer() {
        const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        if (W.__kuhnSnifferLoaded) {
            console.log('[🏰 UpVillage] Sniffer já estava instalado (skip).');
            return;
        }
        W.__kuhnSnifferLoaded = true;

        function trim(s, n) { return s ? String(s).slice(0, n) : ''; }
        function isGame(url) { return typeof url === 'string' && url.includes('game.php'); }

        // Callback chamado pelo override — roda no contexto onde foi atribuído (sandbox)
        W.__kuhnSniffPush = function (payload) {
            try {
                snifEventsTotal++;
                console.log('[🏰 UpVillage] sniff capturado. recordingEnabled =', recordingEnabled, 'payload:', payload);
                if (!recordingEnabled) return;
                snifEventsProcessed++;
                updateButton();
                const u = (payload.url || '').replace(/^https?:\/\/[^/]+/, '');
                log(`📡 ${payload.kind.toUpperCase()} ${payload.method} ${u} → ${payload.status || '?'}`);
                if (payload.body) log(`   body: ${payload.body}`);
                if (payload.response) log(`   resp: ${payload.response}`);
            } catch (e) {
                console.error('[🏰 UpVillage] sniff push erro:', e);
            }
        };

        try {
            const origFetch = W.fetch;
            W.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                const method = (init && init.method) || (input && input.method) || 'GET';
                const body = trim(init && init.body, 500);
                if (!isGame(url)) return origFetch.apply(this, arguments);
                const t0 = Date.now();
                const promise = origFetch.apply(this, arguments);
                promise.then(res => {
                    res.clone().text().then(text => {
                        W.__kuhnSniffPush({
                            kind: 'fetch', t: t0, method,
                            url: trim(url, 300), body,
                            status: res.status,
                            response: trim(text, 500),
                        });
                    }).catch(() => {});
                }).catch(err => {
                    W.__kuhnSniffPush({ kind: 'fetch-error', t: t0, method, url: trim(url, 300), error: String(err) });
                });
                return promise;
            };
            console.log('[🏰 UpVillage] Sniffer fetch instalado via unsafeWindow.');
        } catch (e) {
            console.error('[🏰 UpVillage] Override fetch falhou:', e);
        }

        try {
            const XHR = W.XMLHttpRequest;
            const origOpen = XHR.prototype.open;
            const origSend = XHR.prototype.send;
            XHR.prototype.open = function (method, url) {
                this.__kuhnUrl = url;
                this.__kuhnMethod = method;
                return origOpen.apply(this, arguments);
            };
            XHR.prototype.send = function (body) {
                if (isGame(this.__kuhnUrl)) {
                    const t0 = Date.now();
                    const url = this.__kuhnUrl;
                    const method = this.__kuhnMethod;
                    const sentBody = trim(body, 500);
                    const xhr = this;
                    this.addEventListener('load', () => {
                        W.__kuhnSniffPush({
                            kind: 'xhr', t: t0, method,
                            url: trim(url, 300), body: sentBody,
                            status: xhr.status,
                            response: trim(xhr.responseText || '', 500),
                        });
                    });
                    this.addEventListener('error', () => {
                        W.__kuhnSniffPush({ kind: 'xhr-error', t: t0, method, url: trim(url, 300) });
                    });
                }
                return origSend.apply(this, arguments);
            };
            console.log('[🏰 UpVillage] Sniffer XHR instalado via unsafeWindow.');
        } catch (e) {
            console.error('[🏰 UpVillage] Override XHR falhou:', e);
        }
    }

    // Contador global de eventos sniff (mostrado no botão pra confirmar funcionamento)
    let snifEventsTotal = 0;
    let snifEventsProcessed = 0;

    // Instala sniffer via unsafeWindow (sem injetar <script>, evita CSP)
    try { installSniffer(); } catch (e) { console.error('[🏰 UpVillage] installSniffer falhou:', e); }
    // =====================================================================

    // Mover ALIASES pra cá (era declarado depois — causava TDZ na migração de config antiga)
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

    const BUILDINGS = [
        { id: 'main', name: 'Edifício Principal' },
        { id: 'barracks', name: 'Quartel' },
        { id: 'stable', name: 'Estábulo' },
        { id: 'garage', name: 'Oficina' },
        { id: 'church', name: 'Igreja' },
        { id: 'watchtower', name: 'Atalaia' },
        { id: 'snob', name: 'Academia' },
        { id: 'smith', name: 'Ferreiro' },
        { id: 'place', name: 'Praça de Reuniões' },
        { id: 'statue', name: 'Estátua' },
        { id: 'market', name: 'Mercado' },
        { id: 'wood', name: 'Madeireira' },
        { id: 'stone', name: 'Poço de Argila' },
        { id: 'iron', name: 'Mina de Ferro' },
        { id: 'farm', name: 'Granja' },
        { id: 'storage', name: 'Armazém' },
        { id: 'hide', name: 'Esconderijo' },
        { id: 'wall', name: 'Muralha' },
    ];

    function buildingDisplayName(id) {
        const b = BUILDINGS.find(x => x.id === id);
        return b ? b.name : id;
    }

    function getCurrentLevel(buildingId) {
        if (typeof game_data === 'undefined' || !game_data.village || !game_data.village.buildings) return 0;
        return parseInt(game_data.village.buildings[buildingId], 10) || 0;
    }

    // log() wrappa console.log + push pro buffer Discord
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
        if (!debugEnabled) return; // checa flag global, não chama getConfig (evita recursão)
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
            DEBUG_BUFFER.length = 0;
            return;
        }
        const village = (typeof game_data !== 'undefined' && game_data.village) ? game_data.village.coord : '?';
        const player = (typeof game_data !== 'undefined' && game_data.player) ? game_data.player.name : '?';
        const header = `🏰 UpVillage v${SCRIPT_VERSION} [${player} / ${village}]`;
        const body = DEBUG_BUFFER.splice(0).join('\n');
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
                onerror: () => {},
            });
        } catch {}
    }

    setInterval(flushDebug, DEBUG_FLUSH_MS);
    // ---------------- /Discord debug ----------------

    // Inicializa flag debugEnabled lendo a config (síncrono, antes do primeiro log)
    try { getConfig(); } catch {}
    log(`IIFE iniciada — versão ${SCRIPT_VERSION}`);

    // =====================================================================
    // CONFIG
    // =====================================================================
    function getDefaultConfig() {
        return {
            enabled: false,
            debug: false,
            recording: false,
            modules: {
                quest: true,
                construtor: false,
            },
            // Plano agora é lista de { building, target }
            // Construtor compara com nível atual e só constrói o que falta.
            plan: [
                { building: 'wood', target: 5 },
                { building: 'stone', target: 5 },
                { building: 'iron', target: 5 },
                { building: 'farm', target: 5 },
                { building: 'storage', target: 5 },
                { building: 'wood', target: 10 },
                { building: 'stone', target: 10 },
                { building: 'iron', target: 10 },
            ],
            queueMaxItems: 2,
        };
    }

    function getConfig() {
        const raw = GM_getValue(STORAGE_KEY, null);
        if (!raw) {
            const def = getDefaultConfig();
            debugEnabled = !!def.debug;
            recordingEnabled = !!def.recording;
            return def;
        }
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const merged = {
                ...getDefaultConfig(),
                ...parsed,
                modules: { ...getDefaultConfig().modules, ...(parsed.modules || {}) },
            };
            // Migração de versões antigas que tinham buildPlan (string)
            if (parsed.buildPlan && (!parsed.plan || parsed.plan.length === 0)) {
                try {
                    merged.plan = migrateBuildPlanText(parsed.buildPlan);
                } catch (e) {
                    console.error('[🏰 UpVillage] migrateBuildPlanText falhou:', e);
                    merged.plan = [];
                }
            }
            if (!Array.isArray(merged.plan)) merged.plan = [];
            debugEnabled = !!merged.debug;
            recordingEnabled = !!merged.recording;
            return merged;
        } catch (e) {
            // NÃO chama log() aqui — log → debugPush → getConfig = recursão infinita
            console.error('[🏰 UpVillage] Config corrompida, restaurando defaults.', e);
            const def = getDefaultConfig();
            debugEnabled = !!def.debug;
            recordingEnabled = !!def.recording;
            return def;
        }
    }

    function setConfig(cfg) {
        GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
        debugEnabled = !!cfg.debug;
        recordingEnabled = !!cfg.recording;
        log('Config salva.');
    }

    function migrateBuildPlanText(text) {
        // Converte formato antigo (linhas) em plano de niveis incrementais
        // Cada linha "wood" vira target = (count anterior + 1)
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const counts = {};
        const plan = [];
        for (const raw of lines) {
            const id = ALIASES[raw.toLowerCase().replace(/[^a-z]/g, '')];
            if (!id) continue;
            counts[id] = (counts[id] || 0) + 1;
            plan.push({ building: id, target: counts[id] });
        }
        return plan;
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
            try { return JSON.parse(text); } catch { return text; }
        } catch (e) {
            log('Erro de fetch:', e.message);
            return null;
        }
    }

    // =====================================================================
    // MÓDULO 1: QUEST (background)
    // =====================================================================
    async function questModule() {
        const cfg = getConfig();
        if (!cfg.modules.quest) return;
        if (typeof game_data === 'undefined' || !game_data.player) return;
        const newQuestCount = parseInt(game_data.player.new_quest, 10) || 0;
        if (newQuestCount <= 0) return;

        log(`Quest: ${newQuestCount} pendente(s), buscando IDs...`);
        const html = await twFetch(buildUrl('new_quests'));
        if (typeof html !== 'string') {
            log(`Quest: response não é string (tipo: ${typeof html}). Body: ${JSON.stringify(html).slice(0, 200)}`);
            return;
        }
        log(`Quest: HTML tem ${html.length} chars. Snippet: ${html.slice(0, 300).replace(/\s+/g, ' ')}`);

        // Extrai quest IDs e questline IDs do HTML retornado
        const questIds = new Set();
        const questlineIds = new Set();
        let m;
        const reQuestData = /data-quest[-_]?id\s*=\s*["'](\d+)["']/gi;
        const reQuestUrl = /[?&]quest=(\d+)/g;
        const reQuestlineData = /data-questline[-_]?id\s*=\s*["'](\d+)["']/gi;
        const reQuestlineUrl = /questline_complete[^"'\s]*[?&]id=(\d+)/gi;

        while ((m = reQuestData.exec(html)) !== null) questIds.add(m[1]);
        while ((m = reQuestUrl.exec(html)) !== null) questIds.add(m[1]);
        while ((m = reQuestlineData.exec(html)) !== null) questlineIds.add(m[1]);
        while ((m = reQuestlineUrl.exec(html)) !== null) questlineIds.add(m[1]);

        // Fallback: se não achar questline ID, tenta id=1 (mais comum no início)
        if (questlineIds.size === 0) questlineIds.add('1');

        if (questIds.size === 0) {
            log('Quest: nenhum ID de missão encontrado no HTML.');
            return;
        }

        // Passo 1: completa cada missão (quest_complete)
        for (const id of questIds) {
            const url = buildUrl('api', { ajaxaction: 'quest_complete', quest: id, skip: 'false' });
            const r = await twFetch(url, { method: 'POST' });
            log(`Quest ${id} complete →`, r === null ? 'FAIL' : 'OK');
        }

        // Passo 2: resgata recompensa de cada questline (questline_complete)
        for (const id of questlineIds) {
            const url = buildUrl('new_quests', { ajax: 'questline_complete', id: id });
            const r = await twFetch(url, { method: 'POST' });
            log(`Questline ${id} resgate →`, r === null ? 'FAIL' : 'OK');
        }
    }

    // =====================================================================
    // MÓDULO 2: CONSTRUTOR
    // Lógica nova: percorre plano, pula prédios já no nível-alvo,
    // tenta upar o primeiro que tá abaixo do alvo.
    // =====================================================================
    async function getQueueCount() {
        const html = await twFetch(buildUrl('main'));
        if (typeof html !== 'string') return null;
        const matches = html.match(/<tr[^>]*\bbuildorder_\w+/g);
        return matches ? matches.length : 0;
    }

    async function tryUpgrade(buildingType) {
        // Tentativa 1: usar BuildingMain.upgrade() nativo do TW (se disponível na página)
        try {
            const bm = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.BuildingMain : window.BuildingMain;
            if (bm && typeof bm.upgrade === 'function') {
                log(`tryUpgrade(${buildingType}) → usando BuildingMain.upgrade nativo`);
                bm.upgrade(buildingType);
                return { source: 'native', ok: true };
            }
        } catch (e) {
            log(`BuildingMain.upgrade(${buildingType}) lançou: ${e.message}`);
        }

        // Tentativa 2: fetch direto pra API
        const url = buildUrl('main', { ajaxaction: 'upgrade_building', type: buildingType, h: game_data.csrf });
        const result = await twFetch(url, { method: 'POST' });
        log(`tryUpgrade(${buildingType}) → URL: ${url}`);
        log(`tryUpgrade(${buildingType}) → response: ${typeof result === 'string' ? result.slice(0, 300) : JSON.stringify(result).slice(0, 300)}`);
        return result;
    }

    function getNextPlannedBuilding(plan) {
        // Considera nível atual + quantos já estão em construção (na fila)
        // Por simplicidade, só usa game_data.village.buildings (níveis efetivos).
        // Fila em construção é tratada pelo limite queueMaxItems.
        for (const item of plan) {
            const current = getCurrentLevel(item.building);
            if (current < item.target) return item;
        }
        return null;
    }

    async function construtorModule() {
        const cfg = getConfig();
        if (!cfg.modules.construtor) return;
        const plan = cfg.plan || [];
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

        const next = getNextPlannedBuilding(plan);
        if (!next) {
            log('Construtor: plano completo (todos os prédios atingiram o alvo).');
            return;
        }

        const current = getCurrentLevel(next.building);
        log(`Construtor: ${buildingDisplayName(next.building)} ${current}→${next.target}, tentando upar...`);
        const result = await tryUpgrade(next.building);
        if (result && (typeof result === 'object' ? !result.error : true)) {
            log(`Construtor: ${buildingDisplayName(next.building)} enfileirado.`);
        } else {
            log(`Construtor: ${buildingDisplayName(next.building)} falhou (recursos? requisitos?). Tenta de novo no próximo tick.`);
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
    // HUD MODAL — visual editor pro plano
    // =====================================================================
    let hudPlan = []; // estado local enquanto modal aberto

    function buildHudHtml() {
        return `
            <div id="${SCRIPT_ID}-overlay" style="
                position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.6);z-index:99998;display:flex;
                align-items:center;justify-content:center;">
                <div style="
                    background:#f4e4bc;border:2px solid #603000;border-radius:6px;
                    padding:20px;width:680px;max-width:95vw;max-height:90vh;
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
                        </label><br>
                        <label style="margin-top:6px;display:inline-block;">
                            <input type="checkbox" id="${SCRIPT_ID}-recording" style="margin-right:6px;">
                            🎬 Modo Recording — captura toda chamada AJAX do TW (use junto com 🐛 pra ver no Discord)
                        </label>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Módulos</legend>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-quest"> 🎯 Quest auto-claim (background)</label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-construtor"> 🏗️ Construtor (segue plano abaixo)</label>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Plano de Construção</legend>
                        <table id="${SCRIPT_ID}-plan-table" style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:#603000;color:#fff;">
                                    <th style="padding:4px;width:30px;">#</th>
                                    <th style="padding:4px;">Prédio</th>
                                    <th style="padding:4px;width:90px;">Alvo</th>
                                    <th style="padding:4px;width:60px;">Atual</th>
                                    <th style="padding:4px;width:90px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="${SCRIPT_ID}-plan-tbody"></tbody>
                        </table>
                        <button id="${SCRIPT_ID}-add-row" style="margin-top:6px;">+ Adicionar prédio</button>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Importar template do Account Manager <small>(beta)</small></legend>
                        <textarea id="${SCRIPT_ID}-import" placeholder="Cole aqui um [construction_template]...[/construction_template]" style="width:100%;height:60px;font-family:monospace;font-size:11px;"></textarea>
                        <button id="${SCRIPT_ID}-import-btn" style="margin-top:4px;">Importar</button>
                        <small style="display:block;color:#666;margin-top:4px;">⚠️ Decoder do formato AM em desenvolvimento. Por enquanto edite manualmente acima.</small>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Fila</legend>
                        <label>Slots máximos da fila (free=2, premium=5):
                            <input type="number" id="${SCRIPT_ID}-queue-max" min="1" max="5" style="width:60px;">
                        </label>
                    </fieldset>

                    <div style="text-align:right;">
                        <button id="${SCRIPT_ID}-cancel">Fechar</button>
                        <button id="${SCRIPT_ID}-save" style="margin-left:8px;">Salvar</button>
                    </div>
                </div>
            </div>
        `;
    }

    function buildBuildingDropdownOptions(selectedId) {
        return BUILDINGS.map(b =>
            `<option value="${b.id}"${b.id === selectedId ? ' selected' : ''}>${b.name}</option>`
        ).join('');
    }

    function renderPlanTable() {
        const tbody = document.getElementById(`${SCRIPT_ID}-plan-tbody`);
        if (!tbody) return;
        tbody.innerHTML = hudPlan.map((item, idx) => {
            const current = getCurrentLevel(item.building);
            const reachedClass = current >= item.target ? 'color:#888;text-decoration:line-through;' : '';
            return `
                <tr style="${reachedClass}">
                    <td style="padding:3px;text-align:center;">${idx + 1}</td>
                    <td style="padding:3px;">
                        <select data-row="${idx}" class="${SCRIPT_ID}-row-building" style="width:100%;">
                            ${buildBuildingDropdownOptions(item.building)}
                        </select>
                    </td>
                    <td style="padding:3px;">
                        <input type="number" data-row="${idx}" class="${SCRIPT_ID}-row-target" min="1" max="30" value="${item.target}" style="width:60px;">
                    </td>
                    <td style="padding:3px;text-align:center;">${current}</td>
                    <td style="padding:3px;text-align:center;">
                        <button data-row="${idx}" class="${SCRIPT_ID}-row-up" title="Mover pra cima">↑</button>
                        <button data-row="${idx}" class="${SCRIPT_ID}-row-down" title="Mover pra baixo">↓</button>
                        <button data-row="${idx}" class="${SCRIPT_ID}-row-del" title="Remover" style="color:red;">✕</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Wiring por linha
        tbody.querySelectorAll(`.${SCRIPT_ID}-row-building`).forEach(el => {
            el.addEventListener('change', (e) => {
                const i = parseInt(e.target.dataset.row, 10);
                hudPlan[i].building = e.target.value;
                renderPlanTable();
            });
        });
        tbody.querySelectorAll(`.${SCRIPT_ID}-row-target`).forEach(el => {
            el.addEventListener('change', (e) => {
                const i = parseInt(e.target.dataset.row, 10);
                hudPlan[i].target = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1));
                renderPlanTable();
            });
        });
        tbody.querySelectorAll(`.${SCRIPT_ID}-row-up`).forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.row, 10);
                if (i > 0) {
                    [hudPlan[i - 1], hudPlan[i]] = [hudPlan[i], hudPlan[i - 1]];
                    renderPlanTable();
                }
            });
        });
        tbody.querySelectorAll(`.${SCRIPT_ID}-row-down`).forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.row, 10);
                if (i < hudPlan.length - 1) {
                    [hudPlan[i + 1], hudPlan[i]] = [hudPlan[i], hudPlan[i + 1]];
                    renderPlanTable();
                }
            });
        });
        tbody.querySelectorAll(`.${SCRIPT_ID}-row-del`).forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.target.dataset.row, 10);
                hudPlan.splice(i, 1);
                renderPlanTable();
            });
        });
    }

    function populateHud() {
        const cfg = getConfig();
        document.getElementById(`${SCRIPT_ID}-enabled`).checked = !!cfg.enabled;
        document.getElementById(`${SCRIPT_ID}-debug`).checked = !!cfg.debug;
        document.getElementById(`${SCRIPT_ID}-recording`).checked = !!cfg.recording;
        document.getElementById(`${SCRIPT_ID}-mod-quest`).checked = !!cfg.modules.quest;
        document.getElementById(`${SCRIPT_ID}-mod-construtor`).checked = !!cfg.modules.construtor;
        document.getElementById(`${SCRIPT_ID}-queue-max`).value = cfg.queueMaxItems || 2;
        hudPlan = JSON.parse(JSON.stringify(cfg.plan || []));
        renderPlanTable();
    }

    function readHud() {
        return {
            enabled: document.getElementById(`${SCRIPT_ID}-enabled`).checked,
            debug: document.getElementById(`${SCRIPT_ID}-debug`).checked,
            recording: document.getElementById(`${SCRIPT_ID}-recording`).checked,
            modules: {
                quest: document.getElementById(`${SCRIPT_ID}-mod-quest`).checked,
                construtor: document.getElementById(`${SCRIPT_ID}-mod-construtor`).checked,
            },
            plan: hudPlan,
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
        document.getElementById(`${SCRIPT_ID}-add-row`).addEventListener('click', () => {
            hudPlan.push({ building: 'wood', target: 1 });
            renderPlanTable();
        });
        document.getElementById(`${SCRIPT_ID}-import-btn`).addEventListener('click', () => {
            alert('Decoder do template do Account Manager ainda não implementado. Vai estar na próxima versão.');
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
        const recBadge = recordingEnabled ? ` 🎬${snifEventsProcessed}` : '';
        btn.textContent = (cfg.enabled ? '🏰 ON' : '🏰 OFF') + recBadge;
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
