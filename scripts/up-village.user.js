// ==UserScript==
// @name         🏰 Up Village TW
// @namespace    https://github.com/jvkuhn/kuhn-tw-scripts
// @version      1.9.0
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
    const SCRIPT_VERSION = '1.9.0';

    // =====================================================================
    // BUILDING COSTS — fórmulas públicas TW BR (cost = base * factor^(N-1))
    // Pode variar levemente por mundo; serve pra pré-check, não decisão final.
    // =====================================================================
    const BUILDING_COSTS = {
        main:       { wood: 90,    stone: 80,    iron: 70,    pop: 5,  factor: 1.26 },
        barracks:   { wood: 200,   stone: 170,   iron: 90,    pop: 7,  factor: 1.26 },
        stable:     { wood: 270,   stone: 240,   iron: 260,   pop: 8,  factor: 1.26 },
        garage:     { wood: 300,   stone: 240,   iron: 260,   pop: 8,  factor: 1.26 },
        smith:      { wood: 220,   stone: 180,   iron: 240,   pop: 20, factor: 1.26 },
        place:      { wood: 10,    stone: 40,    iron: 30,    pop: 0,  factor: 1.26 },
        statue:     { wood: 220,   stone: 220,   iron: 220,   pop: 10, factor: 1.55 },
        market:     { wood: 100,   stone: 100,   iron: 100,   pop: 20, factor: 1.26 },
        wood:       { wood: 50,    stone: 60,    iron: 40,    pop: 5,  factor: 1.25 },
        stone:      { wood: 65,    stone: 50,    iron: 40,    pop: 10, factor: 1.27 },
        iron:       { wood: 75,    stone: 65,    iron: 70,    pop: 10, factor: 1.252 },
        farm:       { wood: 45,    stone: 40,    iron: 30,    pop: 0,  factor: 1.3 },
        storage:    { wood: 60,    stone: 50,    iron: 40,    pop: 0,  factor: 1.265 },
        hide:       { wood: 50,    stone: 60,    iron: 50,    pop: 2,  factor: 1.25 },
        wall:       { wood: 50,    stone: 100,   iron: 20,    pop: 5,  factor: 1.26 },
        snob:       { wood: 15000, stone: 25000, iron: 10000, pop: 80, factor: 2.0 },
        church:     { wood: 16000, stone: 20000, iron: 5000,  pop: 45, factor: 1.26 },
        church_f:   { wood: 0,     stone: 0,     iron: 0,     pop: 0,  factor: 1 },
        watchtower: { wood: 12000, stone: 14000, iron: 12000, pop: 30, factor: 1.17 },
    };

    function getCostForLevel(buildingId, targetLevel) {
        const cfg = BUILDING_COSTS[buildingId];
        if (!cfg || targetLevel < 1) return null;
        const exp = targetLevel - 1;
        return {
            wood: Math.round(cfg.wood * Math.pow(cfg.factor, exp)),
            stone: Math.round(cfg.stone * Math.pow(cfg.factor, exp)),
            iron: Math.round(cfg.iron * Math.pow(cfg.factor, exp)),
            pop: Math.round(cfg.pop * Math.pow(cfg.factor, exp)),
        };
    }

    function canAfford(cost) {
        if (typeof game_data === 'undefined' || !game_data.village) return { ok: false, missing: 'sem game_data' };
        const v = game_data.village;
        const haveWood = parseInt(v.wood, 10) || 0;
        const haveStone = parseInt(v.stone, 10) || 0;
        const haveIron = parseInt(v.iron, 10) || 0;
        const popFree = (parseInt(v.pop_max, 10) || 0) - (parseInt(v.pop, 10) || 0);
        const missing = [];
        if (cost.wood > haveWood) missing.push(`madeira ${cost.wood - haveWood}`);
        if (cost.stone > haveStone) missing.push(`pedra ${cost.stone - haveStone}`);
        if (cost.iron > haveIron) missing.push(`ferro ${cost.iron - haveIron}`);
        if (cost.pop > popFree) missing.push(`pop ${cost.pop - popFree}`);
        return { ok: missing.length === 0, missing: missing.join(', ') };
    }
    // =====================================================================

    // =====================================================================
    // TW ACTIONS CATALOG — auto-identifica ação capturada pela URL
    // Baseado em padrões conhecidos de endpoints do Tribal Wars BR.
    // Formato: [regex da URL, nome legível, categoria, extractor de resumo]
    // =====================================================================
    const TW_ACTIONS = [
        // CONSTRUÇÃO
        { re: /screen=main.*ajaxaction=upgrade_building/, name: 'Upar prédio', cat: '🏗️',
          extract: (u, b) => {
              const m = (b || '').match(/id=([^&]+)/);
              return m ? `prédio: ${decodeURIComponent(m[1])}` : '';
          }},
        { re: /screen=main.*action=cancel.*mode=build/, name: 'Cancelar construção', cat: '🏗️',
          extract: (u) => {
              const m = u.match(/[?&]id=(\d+)/);
              return m ? `ordem: ${m[1]}` : '';
          }},
        // MISSÕES
        { re: /screen=new_quests.*ajax=quest_popup/, name: 'Abrir popup de missão', cat: '🎯', extract: () => '' },
        { re: /screen=new_quests.*ajax=mark_opened/, name: 'Marcar missão como vista', cat: '🎯',
          extract: (u, b) => {
              const m = (b || '').match(/quest_id=(\d+)/);
              return m ? `quest_id: ${m[1]}` : '';
          }},
        { re: /screen=new_quests.*ajax=claim_reward/, name: 'Resgatar recompensa', cat: '🎁',
          extract: (u, b) => {
              const m = (b || '').match(/reward_id=(\d+)/);
              return m ? `reward_id: ${m[1]}` : '';
          }},
        { re: /screen=new_quests.*ajax=questline_complete/, name: 'Completar linha de missão', cat: '🎯',
          extract: (u) => {
              const m = u.match(/[?&]id=(\d+)/);
              return m ? `questline: ${m[1]}` : '';
          }},
        // RECRUTAMENTO
        { re: /screen=barracks.*ajaxaction=recruit/, name: 'Recrutar no Quartel', cat: '⚔️',
          extract: (u, b) => {
              const units = ['spear', 'sword', 'axe', 'archer'];
              const parts = [];
              for (const u2 of units) {
                  const m = (b || '').match(new RegExp(`(?:units\\[)?${u2}(?:\\])?=(\\d+)`));
                  if (m && m[1] !== '0') parts.push(`${u2}: ${m[1]}`);
              }
              return parts.join(', ');
          }},
        { re: /screen=stable.*ajaxaction=recruit/, name: 'Recrutar no Estábulo', cat: '🐎',
          extract: (u, b) => {
              const units = ['spy', 'light', 'marcher', 'heavy'];
              const parts = [];
              for (const u2 of units) {
                  const m = (b || '').match(new RegExp(`(?:units\\[)?${u2}(?:\\])?=(\\d+)`));
                  if (m && m[1] !== '0') parts.push(`${u2}: ${m[1]}`);
              }
              return parts.join(', ');
          }},
        { re: /screen=garage.*ajaxaction=recruit/, name: 'Recrutar na Oficina', cat: '🛠️',
          extract: (u, b) => {
              const units = ['ram', 'catapult'];
              const parts = [];
              for (const u2 of units) {
                  const m = (b || '').match(new RegExp(`(?:units\\[)?${u2}(?:\\])?=(\\d+)`));
                  if (m && m[1] !== '0') parts.push(`${u2}: ${m[1]}`);
              }
              return parts.join(', ');
          }},
        // PALADINO / ESTÁTUA
        { re: /screen=statue.*ajaxaction=new_knight/, name: 'Recrutar Paladino', cat: '🛡️', extract: () => '' },
        { re: /screen=statue.*ajaxaction=.*paladin.*/i, name: 'Ação Paladino', cat: '🛡️', extract: () => '' },
        // COMANDOS
        { re: /screen=place.*try=confirm/, name: 'Confirmar comando (envio)', cat: '🗡️',
          extract: (u, b) => {
              const m = (b || '').match(/(?:target|x|y)=([^&]+)/);
              return m ? `destino: ${decodeURIComponent(m[1])}` : '';
          }},
        { re: /screen=place.*action=command/, name: 'Criar comando', cat: '🗡️', extract: () => '' },
        // COLETA
        { re: /screen=scavenge.*ajaxaction=start_scavenging/, name: 'Iniciar coleta', cat: '🌾',
          extract: (u, b) => {
              const m = (b || '').match(/squad_id=(\d+)/);
              return m ? `squad: ${m[1]}` : '';
          }},
        { re: /screen=scavenge_api/, name: 'API Coleta', cat: '🌾', extract: () => '' },
        // MERCADO
        { re: /screen=market.*ajaxaction=trade_send/, name: 'Enviar mercadores', cat: '🛒', extract: () => '' },
        { re: /screen=market.*ajaxaction=call/, name: 'Convocar recursos', cat: '🛒', extract: () => '' },
        { re: /screen=market.*ajaxaction=other_offers_accept/, name: 'Aceitar oferta do mercado', cat: '🛒', extract: () => '' },
        // SMITHY (Ferreiro) — pesquisa
        { re: /screen=smith.*ajaxaction=research/, name: 'Pesquisar unidade', cat: '🔨', extract: () => '' },
        // ACADEMIA — moedas/nobre
        { re: /screen=snob.*ajaxaction=coin_mint/, name: 'Cunhar moedas', cat: '💰', extract: () => '' },
        { re: /screen=snob.*ajaxaction=train/, name: 'Treinar nobre', cat: '👑', extract: () => '' },
        // IGREJA
        { re: /screen=church.*ajaxaction=move/, name: 'Mover igreja', cat: '⛪', extract: () => '' },
        // REPORTS / GENÉRICOS
        { re: /screen=api.*ajax=resources_schedule/, name: 'Schedule recursos (poll)', cat: '📊', extract: () => '' },
        { re: /screen=report/, name: 'Relatório', cat: '📨', extract: () => '' },
        { re: /screen=mail/, name: 'Mensagem', cat: '✉️', extract: () => '' },
    ];

    function identifyAction(url, body) {
        for (const action of TW_ACTIONS) {
            if (action.re.test(url)) {
                const detail = action.extract(url, body || '');
                return `${action.cat} ${action.name}${detail ? ` — ${detail}` : ''}`;
            }
        }
        return null;
    }
    // =====================================================================

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
                if (!recordingEnabled) return;
                snifEventsProcessed++;
                updateButton();
                const u = (payload.url || '').replace(/^https?:\/\/[^/]+/, '');

                // Auto-identificação via catálogo TW
                const identified = identifyAction(u, payload.body);
                const header = identified
                    ? `📡 ${identified}  [${payload.status || '?'}]`
                    : `📡 UNKNOWN ${payload.method} ${u} → ${payload.status || '?'}`;
                log(header);

                // Detalhes adicionais só pra ações conhecidas OU se usuário quer ver raw
                if (!identified) {
                    // Ação desconhecida — mostra detalhes pra eu poder adicionar ao catálogo
                    if (payload.body) log(`   body: ${payload.body}`);
                    if (payload.response) log(`   resp: ${payload.response.slice(0, 200)}`);
                }
                // Sempre conta ação desconhecida separadamente (pra painel depois)
                if (!identified && typeof unsafeWindow !== 'undefined') {
                    unsafeWindow.__kuhnUnknownActions = unsafeWindow.__kuhnUnknownActions || [];
                    unsafeWindow.__kuhnUnknownActions.push({ url: u, method: payload.method, body: payload.body, response: payload.response && payload.response.slice(0, 200), t: payload.t });
                }
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

    // Auto-teste do sniffer: faz uma chamada GET trivial pro próprio TW e checa se o sniffer pegou.
    // Se pegou: confirma sniffer funcional. Se não: algo bloqueou e devolve aviso claro.
    setTimeout(() => {
        const eventsBefore = snifEventsTotal;
        const testUrl = `${location.pathname}?screen=overview&_kuhn_test=1`;
        console.log('[🏰 UpVillage] Auto-teste sniffer: enviando GET trivial pra', testUrl);
        const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        try {
            W.fetch(testUrl, { credentials: 'include' })
                .then(() => {
                    setTimeout(() => {
                        const eventsAfter = snifEventsTotal;
                        if (eventsAfter > eventsBefore) {
                            console.log(`%c[🏰 UpVillage] ✅ Sniffer FUNCIONANDO — capturou ${eventsAfter - eventsBefore} evento(s) do auto-teste.`, 'color: green; font-weight: bold;');
                        } else {
                            console.error('%c[🏰 UpVillage] ❌ Sniffer NÃO capturou o auto-teste. fetch override pode não estar ativo no contexto correto.', 'color: red; font-weight: bold;');
                        }
                    }, 1500);
                })
                .catch(err => console.error('[🏰 UpVillage] Auto-teste falhou:', err));
        } catch (e) {
            console.error('[🏰 UpVillage] Auto-teste exception:', e);
        }
    }, 2000);
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
        // Prioridade: (1) webhook da própria config, (2) localStorage compartilhado,
        // (3) GM_getValue do notificacao (falha se scripts são isolados, mas mantemos por segurança)
        try {
            const cfg = getConfig();
            if (cfg.discordWebhookUrl) return cfg.discordWebhookUrl;
        } catch {}
        try {
            const local = localStorage.getItem('kuhn_tw_shared_webhook');
            if (local) return local;
        } catch {}
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
            console.warn(`[🏰 UpVillage] flushDebug: ${DEBUG_BUFFER.length} mensagens descartadas — webhook não configurado. Cole no painel do 🏰 → "Discord Webhook URL".`);
            DEBUG_BUFFER.length = 0;
            return;
        }
        console.log(`[🏰 UpVillage] flushDebug: enviando ${DEBUG_BUFFER.length} mensagens pro Discord...`);
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
            discordWebhookUrl: '',
            modules: {
                quest: true,
                construtor: false,
                coleta: false,
                recrutamento: false,
                agendador: false,
            },
            // Coleta: tropas a enviar por squad (1-4)
            coletaUnits: 'spear:10,sword:0,axe:0,archer:0,light:0,marcher:0,heavy:0',
            // Recrutamento: alvo de cada unidade (manter no mínimo X treinando)
            recrutamentoTargets: 'spear:50,sword:0,axe:0',
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

        log(`Quest: ${newQuestCount} pendente(s)...`);

        // Formato descoberto via sniffer (v1.4.0):
        //  GET  /game.php?...&screen=new_quests&ajax=quest_popup&tab=main-tab&quest=0
        //       → retorna JSON { response: { dialog: "HTML", rewards: [...] } }
        //  POST /game.php?...&screen=new_quests&ajax=claim_reward
        //       body: reward_id=<id>&h=<csrf>
        const popup = await twFetch(buildUrl('new_quests', { ajax: 'quest_popup', tab: 'main-tab', quest: '0' }));
        if (!popup || typeof popup !== 'object' || !popup.response) {
            log('Quest: popup response inesperado.', typeof popup === 'string' ? popup.slice(0, 200) : JSON.stringify(popup).slice(0, 200));
            return;
        }

        // Extrai IDs de reward: primeiro de response.rewards se existir, depois do dialog HTML
        const rewardIds = new Set();
        const rewardsArr = popup.response.rewards;
        if (Array.isArray(rewardsArr)) {
            for (const r of rewardsArr) {
                if (r && r.id && (r.status === 'unlocked' || r.status === 'available')) {
                    rewardIds.add(String(r.id));
                }
            }
        }
        // Fallback: parse do dialog HTML
        if (rewardIds.size === 0 && typeof popup.response.dialog === 'string') {
            const d = popup.response.dialog;
            const re = /(?:data-reward[-_]?id|reward[-_]?id["']?\s*[:=]\s*["']?)(\d+)/gi;
            let m;
            while ((m = re.exec(d)) !== null) rewardIds.add(m[1]);
        }

        if (rewardIds.size === 0) {
            log('Quest: popup carregado mas nenhuma recompensa no estado "unlocked".');
            return;
        }

        log(`Quest: ${rewardIds.size} recompensa(s) pra resgatar: ${[...rewardIds].join(', ')}`);
        const url = buildUrl('new_quests', { ajax: 'claim_reward' });
        for (const id of rewardIds) {
            const body = new URLSearchParams({ reward_id: id, h: game_data.csrf }).toString();
            const r = await twFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            const ok = r && r.response !== undefined && !r.error;
            log(`Reward ${id} → ${ok ? 'OK' : 'FAIL'} ${typeof r === 'object' ? JSON.stringify(r).slice(0, 150) : ''}`);
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
        // Formato descoberto via sniffer (v1.4.0):
        //  URL:    screen=main&ajaxaction=upgrade_building&type=main
        //  Body:   id=<building>&force=1&destroy=0&source=<village_id>&h=<csrf>
        //  Headers: application/x-www-form-urlencoded
        const url = buildUrl('main', { ajaxaction: 'upgrade_building', type: 'main' });
        const body = new URLSearchParams({
            id: buildingType,
            force: '1',
            destroy: '0',
            source: String(game_data.village.id),
            h: game_data.csrf,
        }).toString();
        const result = await twFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        log(`tryUpgrade(${buildingType}) → ${typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200)}`);
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
        const targetNextLevel = current + 1;
        // Pre-check de recursos (evita tentativa fadada ao fracasso)
        const cost = getCostForLevel(next.building, targetNextLevel);
        if (cost) {
            const aff = canAfford(cost);
            if (!aff.ok) {
                log(`Construtor: ${buildingDisplayName(next.building)} ${current}→${targetNextLevel} faltando ${aff.missing} (custo: M${cost.wood}/A${cost.stone}/F${cost.iron}/Pop${cost.pop}). Aguardando recursos.`);
                return;
            }
        }
        log(`Construtor: ${buildingDisplayName(next.building)} ${current}→${targetNextLevel}, tentando upar...`);
        const result = await tryUpgrade(next.building);
        // Formato de sucesso conhecido: {"response":{"success":"...","date_complete":...}}
        // Formato de erro: {"response":{"error":"..."}} ou {"error":"..."} ou null
        const isSuccess = result
            && ((result.response && result.response.success)
                || (typeof result === 'object' && !result.error && !(result.response && result.response.error)));
        if (isSuccess) {
            const msg = result.response && result.response.success ? result.response.success : 'enfileirado';
            log(`Construtor: ${buildingDisplayName(next.building)} — ${msg}`);
        } else {
            const err = (result && result.response && result.response.error) || (result && result.error) || 'response vazio';
            log(`Construtor: ${buildingDisplayName(next.building)} falhou — ${err}`);
        }
    }

    // =====================================================================
    // MÓDULO 3: COLETA (scavenging) — EXPERIMENTAL
    // Endpoint baseado em conhecimento da comunidade TW. Pode precisar
    // ajuste após teste real (recording mode mostra a chamada certa).
    // =====================================================================
    function parseUnitMap(str) {
        // "spear:10,sword:5" → {spear: 10, sword: 5}
        const out = {};
        for (const part of (str || '').split(',')) {
            const [k, v] = part.split(':').map(s => (s || '').trim());
            if (k) out[k] = parseInt(v, 10) || 0;
        }
        return out;
    }

    async function getColetaState() {
        // Tenta endpoint AJAX conhecido pra estado dos squads
        const r = await twFetch(buildUrl('scavenge_api', { ajaxaction: 'getInfo' }));
        if (r && r.response) return r.response;
        return null;
    }

    async function startScavenge(squadId, unitAmounts) {
        const url = buildUrl('scavenge_api', { ajaxaction: 'send_squad' });
        // Comunidade reporta dois formatos possíveis: JSON encoded ou bracket notation
        const params = new URLSearchParams();
        params.append('squad_id', String(squadId));
        params.append('candidate_squad_id', String(squadId));
        for (const [unit, qty] of Object.entries(unitAmounts)) {
            params.append(`unit_amounts[${unit}]`, String(qty));
        }
        params.append('h', game_data.csrf);
        const result = await twFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        return result;
    }

    async function coletaModule() {
        const cfg = getConfig();
        if (!cfg.modules.coleta) return;
        const units = parseUnitMap(cfg.coletaUnits);
        const totalUnits = Object.values(units).reduce((a, b) => a + b, 0);
        if (totalUnits === 0) {
            log('Coleta: nenhuma unidade configurada (cfg.coletaUnits vazio).');
            return;
        }

        const state = await getColetaState();
        if (!state) {
            log('Coleta: getInfo falhou (endpoint pode estar diferente — capture via recording).');
            return;
        }

        // state.squads esperado tipo {1: {free_at: timestamp, ...}, 2: {...}, ...}
        const squads = state.squads || state;
        const now = Date.now() / 1000;
        for (const [squadId, info] of Object.entries(squads || {})) {
            if (!info || typeof info !== 'object') continue;
            const freeAt = parseInt(info.free_at, 10) || 0;
            if (freeAt > now) {
                continue; // squad ocupado
            }
            log(`Coleta: enviando squad ${squadId} com ${JSON.stringify(units)}`);
            const r = await startScavenge(squadId, units);
            log(`Coleta: squad ${squadId} resultado:`, JSON.stringify(r).slice(0, 200));
        }
    }

    // =====================================================================
    // MÓDULO 4: RECRUTAMENTO — EXPERIMENTAL
    // =====================================================================
    const RECRUIT_BUILDINGS = {
        spear: 'barracks', sword: 'barracks', axe: 'barracks', archer: 'barracks',
        spy: 'stable', light: 'stable', marcher: 'stable', heavy: 'stable',
        ram: 'garage', catapult: 'garage',
    };

    async function tryRecruit(buildingScreen, units) {
        const url = buildUrl(buildingScreen, { ajaxaction: 'recruit' });
        const params = new URLSearchParams();
        for (const [unit, qty] of Object.entries(units)) {
            if (qty > 0) params.append(`units[${unit}]`, String(qty));
        }
        params.append('h', game_data.csrf);
        return await twFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
    }

    async function recrutamentoModule() {
        const cfg = getConfig();
        if (!cfg.modules.recrutamento) return;
        const targets = parseUnitMap(cfg.recrutamentoTargets);
        const total = Object.values(targets).reduce((a, b) => a + b, 0);
        if (total === 0) {
            log('Recrutamento: nenhum alvo configurado.');
            return;
        }

        // Agrupa unidades por prédio
        const byBuilding = {};
        for (const [unit, qty] of Object.entries(targets)) {
            if (qty <= 0) continue;
            const b = RECRUIT_BUILDINGS[unit];
            if (!b) continue;
            byBuilding[b] = byBuilding[b] || {};
            byBuilding[b][unit] = qty;
        }

        for (const [building, units] of Object.entries(byBuilding)) {
            log(`Recrutamento: tentando ${building} → ${JSON.stringify(units)}`);
            const r = await tryRecruit(building, units);
            log(`Recrutamento: ${building} resultado:`, JSON.stringify(r).slice(0, 200));
        }
    }

    // =====================================================================
    // MÓDULO 5: AGENDADOR DE COMANDOS — EXPERIMENTAL
    // Lógica: usuário cadastra (alvo, unidades, hora de chegada).
    // Script calcula travel time, define hora de envio, e dispara no momento certo.
    // =====================================================================

    // Velocidades padrão TW BR em minutos/campo (sem world speed multiplier)
    const UNIT_SPEEDS = {
        spear: 18, sword: 22, axe: 18, archer: 18,
        spy: 9, light: 10, marcher: 10, heavy: 11,
        ram: 30, catapult: 30, knight: 10, snob: 35, militia: 30,
    };

    // World speed: TW expõe via game_data.speed em alguns mundos, fallback 1.0
    function getWorldSpeed() {
        if (typeof game_data !== 'undefined') {
            if (game_data.speed) return parseFloat(game_data.speed) || 1.0;
            if (game_data.world_speed) return parseFloat(game_data.world_speed) || 1.0;
        }
        return 1.0;
    }

    function calcDistance(x1, y1, x2, y2) {
        const dx = x1 - x2, dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getSlowestUnitSpeed(unitMap) {
        let max = 0;
        for (const [unit, qty] of Object.entries(unitMap)) {
            if (qty <= 0) continue;
            const s = UNIT_SPEEDS[unit];
            if (s && s > max) max = s;
        }
        return max || 18; // fallback lança
    }

    function calcTravelTimeMs(distance, unitMap) {
        const speed = getSlowestUnitSpeed(unitMap);
        const minutesPerField = speed / getWorldSpeed();
        return Math.round(distance * minutesPerField * 60 * 1000);
    }

    // Storage de comandos agendados
    const SCHEDULE_KEY = 'kuhn-village-schedule';

    function getSchedules() {
        const raw = GM_getValue(SCHEDULE_KEY, '[]');
        try {
            const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    }

    function setSchedules(arr) {
        GM_setValue(SCHEDULE_KEY, JSON.stringify(arr));
    }

    function addSchedule(item) {
        const list = getSchedules();
        item.id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        item.sent = false;
        item.created = Date.now();
        list.push(item);
        setSchedules(list);
        return item;
    }

    function deleteSchedule(id) {
        const list = getSchedules().filter(s => s.id !== id);
        setSchedules(list);
    }

    // Sender best-guess. Padrão TW: 2 etapas (preview + confirm).
    // Sem dado real do sniffer, primeiro implementa só envio direto via place&try=confirm.
    async function sendScheduledCommand(item) {
        const url = buildUrl('place', { try: 'confirm', target: `${item.x},${item.y}` });
        const params = new URLSearchParams();
        params.append('source', String(game_data.village.id));
        params.append('target', `${item.x},${item.y}`);
        for (const [unit, qty] of Object.entries(item.units)) {
            if (qty > 0) params.append(unit, String(qty));
        }
        params.append('attack', item.kind === 'support' ? 'false' : 'true');
        params.append('h', game_data.csrf);
        return await twFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
    }

    // Tick de agendamento: roda em alta frequência quando há algo próximo.
    let scheduleTickHandle = null;
    function startScheduleTicker() {
        if (scheduleTickHandle) return;
        scheduleTickHandle = setInterval(scheduleTickHigh, 250);
    }

    function stopScheduleTicker() {
        if (scheduleTickHandle) {
            clearInterval(scheduleTickHandle);
            scheduleTickHandle = null;
        }
    }

    function scheduleTickHigh() {
        const cfg = getConfig();
        if (!cfg.modules.agendador) {
            stopScheduleTicker();
            return;
        }
        const list = getSchedules();
        const now = Date.now();
        let changed = false;
        let hasPending = false;
        for (const item of list) {
            if (item.sent) continue;
            const sendAt = item.sendAt || (item.arrivalMs - calcTravelTimeMs(calcDistance(item.sourceX, item.sourceY, item.x, item.y), item.units));
            if (now >= sendAt) {
                log(`Agendador: disparando comando ${item.id} → (${item.x},${item.y})`);
                sendScheduledCommand(item).then(r => {
                    log(`Agendador: ${item.id} resultado:`, JSON.stringify(r).slice(0, 200));
                });
                item.sent = true;
                item.sentAt = now;
                changed = true;
            } else if (sendAt - now < 60000) {
                hasPending = true;
            }
        }
        if (changed) setSchedules(list);
        if (!hasPending) stopScheduleTicker(); // volta pro loop normal de 8s
    }

    // No tick normal, decide se precisa subir pra tick alta freq
    async function agendadorModule() {
        const cfg = getConfig();
        if (!cfg.modules.agendador) return;
        const list = getSchedules();
        const now = Date.now();
        for (const item of list) {
            if (item.sent) continue;
            const sendAt = item.sendAt || (item.arrivalMs - calcTravelTimeMs(calcDistance(item.sourceX, item.sourceY, item.x, item.y), item.units));
            if (sendAt - now < 60000) {
                startScheduleTicker(); // sobe pra alta freq
                return;
            }
        }
    }
    // =====================================================================

    // =====================================================================
    // MAIN TICK
    // =====================================================================
    async function tick() {
        const cfg = getConfig();
        if (!cfg.enabled) return;
        try {
            await questModule();
            await construtorModule();
            await coletaModule();
            await recrutamentoModule();
            await agendadorModule();
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
                        </label><br>
                        <label style="display:block;margin-top:8px;">
                            Discord Webhook URL (cola aqui — scripts têm storage isolado no Tampermonkey):
                            <input type="text" id="${SCRIPT_ID}-webhook" style="width:100%;padding:3px;font-family:monospace;font-size:11px;" placeholder="https://discord.com/api/webhooks/...">
                        </label>
                        <button id="${SCRIPT_ID}-test-webhook" style="margin-top:4px;">Testar Webhook</button>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Módulos</legend>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-quest"> 🎯 Quest auto-claim (background)</label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-construtor"> 🏗️ Construtor (segue plano abaixo)</label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-coleta"> 🌾 Coleta de recursos <small style="color:#a00;">(experimental)</small></label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-recrutamento"> ⚔️ Recrutamento <small style="color:#a00;">(experimental)</small></label><br>
                        <label><input type="checkbox" id="${SCRIPT_ID}-mod-agendador"> 🗓️ Agendador de comandos <small style="color:#a00;">(experimental)</small></label>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>🗓️ Agendador — Calculadora + Lista</legend>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:11px;">
                            <label>Alvo X:<input type="number" id="${SCRIPT_ID}-sched-x" style="width:100%;"></label>
                            <label>Alvo Y:<input type="number" id="${SCRIPT_ID}-sched-y" style="width:100%;"></label>
                            <label>Tipo:
                                <select id="${SCRIPT_ID}-sched-kind" style="width:100%;">
                                    <option value="attack">Ataque</option>
                                    <option value="support">Apoio</option>
                                </select>
                            </label>
                            <label>Chegada (ISO):<input type="text" id="${SCRIPT_ID}-sched-arrival" placeholder="2026-04-22T20:00:00" style="width:100%;font-size:10px;"></label>
                        </div>
                        <label style="display:block;margin-top:6px;">Unidades:
                            <input type="text" id="${SCRIPT_ID}-sched-units" style="width:100%;font-family:monospace;font-size:11px;" placeholder="spear:100,sword:50,light:30">
                        </label>
                        <div style="margin-top:6px;display:flex;gap:6px;">
                            <button id="${SCRIPT_ID}-sched-calc">Calcular tempo</button>
                            <button id="${SCRIPT_ID}-sched-add">Adicionar agendamento</button>
                        </div>
                        <div id="${SCRIPT_ID}-sched-info" style="margin-top:6px;font-size:11px;color:#603000;"></div>
                        <table style="width:100%;margin-top:8px;font-size:11px;border-collapse:collapse;">
                            <thead>
                                <tr style="background:#603000;color:#fff;">
                                    <th>Alvo</th><th>Tipo</th><th>Tropas</th><th>Envio</th><th>Chegada</th><th>Status</th><th></th>
                                </tr>
                            </thead>
                            <tbody id="${SCRIPT_ID}-sched-list"></tbody>
                        </table>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Coleta — unidades a enviar por squad</legend>
                        <input type="text" id="${SCRIPT_ID}-coleta-units" style="width:100%;font-family:monospace;font-size:11px;" placeholder="spear:10,sword:0,axe:0,archer:0,light:0,marcher:0,heavy:0">
                        <small style="color:#666;">Formato: <code>unidade:quantidade,...</code>. Aplica a todos os 4 squads.</small>
                    </fieldset>

                    <fieldset style="margin-bottom:10px;border:1px solid #999;padding:8px;">
                        <legend>Recrutamento — quantidade por turno</legend>
                        <input type="text" id="${SCRIPT_ID}-recrut-targets" style="width:100%;font-family:monospace;font-size:11px;" placeholder="spear:50,sword:0,axe:0">
                        <small style="color:#666;">Quanto solicitar a cada tick. <strong>Cuidado:</strong> consome recursos rápido.</small>
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
                                    <th style="padding:4px;width:140px;font-size:11px;">Custo p/ próx</th>
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

    function renderScheduleList() {
        const tbody = document.getElementById(`${SCRIPT_ID}-sched-list`);
        if (!tbody) return;
        const list = getSchedules();
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding:6px;text-align:center;color:#888;">Sem agendamentos</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const travelMs = calcTravelTimeMs(calcDistance(s.sourceX, s.sourceY, s.x, s.y), s.units);
            const sendAt = s.arrivalMs - travelMs;
            const tropas = Object.entries(s.units).filter(([, q]) => q > 0).map(([u, q]) => `${u}:${q}`).join(' ');
            const status = s.sent
                ? `<span style="color:#2a8a2a;">enviado</span>`
                : (sendAt < Date.now() ? '<span style="color:#a00;">PERDIDO</span>' : '<span style="color:#603000;">aguardando</span>');
            return `
                <tr>
                    <td>${s.x},${s.y}</td>
                    <td>${s.kind === 'support' ? '🛡️' : '⚔️'}</td>
                    <td style="font-size:10px;">${tropas}</td>
                    <td style="font-size:10px;">${new Date(sendAt).toLocaleString()}</td>
                    <td style="font-size:10px;">${new Date(s.arrivalMs).toLocaleString()}</td>
                    <td>${status}</td>
                    <td><button data-sched="${s.id}" class="${SCRIPT_ID}-sched-del" style="color:red;">✕</button></td>
                </tr>
            `;
        }).join('');
        tbody.querySelectorAll(`.${SCRIPT_ID}-sched-del`).forEach(el => {
            el.addEventListener('click', (e) => {
                const id = e.target.dataset.sched;
                if (confirm('Remover agendamento?')) {
                    deleteSchedule(id);
                    renderScheduleList();
                }
            });
        });
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
            // Custo do próximo nível
            const nextLvl = current + 1;
            const cost = nextLvl <= item.target ? getCostForLevel(item.building, nextLvl) : null;
            const aff = cost ? canAfford(cost) : null;
            const costCell = cost
                ? `<span style="${aff && aff.ok ? 'color:#2a8a2a' : 'color:#a00'};font-size:11px;">M${cost.wood} A${cost.stone} F${cost.iron}${cost.pop ? ` P${cost.pop}` : ''}</span>`
                : '<span style="color:#888;">—</span>';
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
                    <td style="padding:3px;text-align:center;">${costCell}</td>
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
        // Webhook: preenche com o que tiver na config, ou localStorage, ou storage do notificacao
        const webhookField = document.getElementById(`${SCRIPT_ID}-webhook`);
        if (webhookField) {
            webhookField.value = cfg.discordWebhookUrl || (typeof localStorage !== 'undefined' ? (localStorage.getItem('kuhn_tw_shared_webhook') || '') : '');
        }
        document.getElementById(`${SCRIPT_ID}-mod-quest`).checked = !!cfg.modules.quest;
        document.getElementById(`${SCRIPT_ID}-mod-coleta`).checked = !!cfg.modules.coleta;
        document.getElementById(`${SCRIPT_ID}-mod-recrutamento`).checked = !!cfg.modules.recrutamento;
        document.getElementById(`${SCRIPT_ID}-mod-agendador`).checked = !!cfg.modules.agendador;
        document.getElementById(`${SCRIPT_ID}-coleta-units`).value = cfg.coletaUnits || '';
        document.getElementById(`${SCRIPT_ID}-recrut-targets`).value = cfg.recrutamentoTargets || '';
        renderScheduleList();
        document.getElementById(`${SCRIPT_ID}-mod-construtor`).checked = !!cfg.modules.construtor;
        document.getElementById(`${SCRIPT_ID}-queue-max`).value = cfg.queueMaxItems || 2;
        hudPlan = JSON.parse(JSON.stringify(cfg.plan || []));
        renderPlanTable();
    }

    function readHud() {
        const webhookUrl = (document.getElementById(`${SCRIPT_ID}-webhook`).value || '').trim();
        // Sincroniza o webhook no localStorage pra outros scripts usarem
        try {
            if (webhookUrl) localStorage.setItem('kuhn_tw_shared_webhook', webhookUrl);
        } catch {}
        return {
            enabled: document.getElementById(`${SCRIPT_ID}-enabled`).checked,
            debug: document.getElementById(`${SCRIPT_ID}-debug`).checked,
            recording: document.getElementById(`${SCRIPT_ID}-recording`).checked,
            discordWebhookUrl: webhookUrl,
            modules: {
                quest: document.getElementById(`${SCRIPT_ID}-mod-quest`).checked,
                construtor: document.getElementById(`${SCRIPT_ID}-mod-construtor`).checked,
                coleta: document.getElementById(`${SCRIPT_ID}-mod-coleta`).checked,
                recrutamento: document.getElementById(`${SCRIPT_ID}-mod-recrutamento`).checked,
                agendador: document.getElementById(`${SCRIPT_ID}-mod-agendador`).checked,
            },
            coletaUnits: document.getElementById(`${SCRIPT_ID}-coleta-units`).value || '',
            recrutamentoTargets: document.getElementById(`${SCRIPT_ID}-recrut-targets`).value || '',
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
        document.getElementById(`${SCRIPT_ID}-sched-calc`).addEventListener('click', () => {
            const x = parseInt(document.getElementById(`${SCRIPT_ID}-sched-x`).value, 10);
            const y = parseInt(document.getElementById(`${SCRIPT_ID}-sched-y`).value, 10);
            const units = parseUnitMap(document.getElementById(`${SCRIPT_ID}-sched-units`).value);
            const arrivalIso = document.getElementById(`${SCRIPT_ID}-sched-arrival`).value;
            const info = document.getElementById(`${SCRIPT_ID}-sched-info`);
            if (!x || !y || Object.values(units).every(v => v <= 0)) {
                info.innerHTML = '<span style="color:#a00;">Preencha alvo (X,Y) e tropas.</span>';
                return;
            }
            const sourceX = game_data.village.x;
            const sourceY = game_data.village.y;
            const dist = calcDistance(sourceX, sourceY, x, y);
            const travelMs = calcTravelTimeMs(dist, units);
            const slowest = getSlowestUnitSpeed(units);
            const arrivalMs = arrivalIso ? new Date(arrivalIso).getTime() : (Date.now() + travelMs);
            const sendAt = arrivalMs - travelMs;
            const sendIso = new Date(sendAt).toLocaleString();
            const arrIso = new Date(arrivalMs).toLocaleString();
            info.innerHTML = `Distância: ${dist.toFixed(2)} campos | Mais lenta: ${slowest} min/campo | World speed: ${getWorldSpeed()}<br>` +
                `Tempo de viagem: ${(travelMs / 1000 / 60).toFixed(1)} min<br>` +
                `<strong>Envio:</strong> ${sendIso} | <strong>Chegada:</strong> ${arrIso}`;
        });

        document.getElementById(`${SCRIPT_ID}-sched-add`).addEventListener('click', () => {
            const x = parseInt(document.getElementById(`${SCRIPT_ID}-sched-x`).value, 10);
            const y = parseInt(document.getElementById(`${SCRIPT_ID}-sched-y`).value, 10);
            const kind = document.getElementById(`${SCRIPT_ID}-sched-kind`).value;
            const units = parseUnitMap(document.getElementById(`${SCRIPT_ID}-sched-units`).value);
            const arrivalIso = document.getElementById(`${SCRIPT_ID}-sched-arrival`).value;
            if (!x || !y || !arrivalIso || Object.values(units).every(v => v <= 0)) {
                alert('Preencha alvo, hora de chegada e tropas.');
                return;
            }
            const arrivalMs = new Date(arrivalIso).getTime();
            if (isNaN(arrivalMs) || arrivalMs < Date.now()) {
                alert('Hora de chegada inválida ou no passado.');
                return;
            }
            const sourceX = game_data.village.x;
            const sourceY = game_data.village.y;
            const item = {
                x, y, kind, units,
                arrivalMs,
                sourceX, sourceY,
                sourceVillage: game_data.village.id,
            };
            addSchedule(item);
            renderScheduleList();
            alert('Agendamento adicionado.');
        });

        document.getElementById(`${SCRIPT_ID}-test-webhook`).addEventListener('click', () => {
            const url = document.getElementById(`${SCRIPT_ID}-webhook`).value.trim();
            if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
                alert('URL inválida. Deve começar com https://discord.com/api/webhooks/');
                return;
            }
            // IMPORTANTE: persiste na hora, não espera usuário clicar Salvar
            try { localStorage.setItem('kuhn_tw_shared_webhook', url); } catch {}
            try {
                const cfg = getConfig();
                cfg.discordWebhookUrl = url;
                setConfig(cfg);
            } catch {}
            try {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        content: `✅ Teste do webhook UpVillage v${SCRIPT_VERSION} — ${new Date().toLocaleString()}\n(webhook persistido em localStorage + GM_setValue)`
                    }),
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) alert('Enviado + salvo. Pode fechar e as notificações do recording vão chegar.');
                        else alert(`Falhou: HTTP ${res.status}\n${res.responseText.slice(0, 200)}`);
                    },
                    onerror: () => alert('Erro de rede ao testar webhook.'),
                });
            } catch (e) {
                alert('Exception: ' + e.message);
            }
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

    // =====================================================================
    // STATUS PANEL — widget flutuante sempre visível com info da aldeia
    // =====================================================================
    function injectStatusPanel() {
        if (document.getElementById(`${SCRIPT_ID}-status`)) return;
        const panel = document.createElement('div');
        panel.id = `${SCRIPT_ID}-status`;
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '8px',
            left: '8px',
            background: 'rgba(243,228,188,0.95)',
            border: '2px solid #603000',
            borderRadius: '6px',
            padding: '6px 10px',
            zIndex: '99999',
            fontFamily: 'Verdana,sans-serif',
            fontSize: '11px',
            color: '#000',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            minWidth: '200px',
            maxWidth: '320px',
            userSelect: 'none',
        });
        document.body.appendChild(panel);
        updateStatusPanel();
    }

    function updateStatusPanel() {
        const panel = document.getElementById(`${SCRIPT_ID}-status`);
        if (!panel) return;
        if (typeof game_data === 'undefined' || !game_data.village) {
            panel.innerHTML = `<b>🏰 UpVillage v${SCRIPT_VERSION}</b><br>Esperando game_data...`;
            return;
        }
        const v = game_data.village;
        const p = game_data.player;
        const cfg = getConfig();

        // Próxima ação do plano
        let proxStr = '<span style="color:#888;">plano vazio</span>';
        const next = getNextPlannedBuilding(cfg.plan || []);
        if (next) {
            const cur = getCurrentLevel(next.building);
            const cost = getCostForLevel(next.building, cur + 1);
            const aff = cost ? canAfford(cost) : null;
            const color = aff && aff.ok ? '#2a8a2a' : '#a00';
            proxStr = `<span style="color:${color};">${buildingDisplayName(next.building)} ${cur}→${cur + 1}${aff && !aff.ok ? ' (faltam ' + aff.missing + ')' : ''}</span>`;
        } else if (cfg.plan && cfg.plan.length > 0) {
            proxStr = '<span style="color:#2a8a2a;">✓ plano completo</span>';
        }

        const masterIcon = cfg.enabled ? '🟢' : '⚪';
        const recIcon = recordingEnabled ? '🎬' : '';
        const dbgIcon = debugEnabled ? '🐛' : '';

        panel.innerHTML = `
            <div style="border-bottom:1px solid #603000;margin-bottom:3px;padding-bottom:2px;">
                <b>🏰 ${p.name || '?'} (${v.coord || '?'})</b> ${masterIcon}${recIcon}${dbgIcon}
            </div>
            <div>🌲 ${Math.floor(v.wood)} 🪨 ${Math.floor(v.stone)} ⛏️ ${Math.floor(v.iron)} | 👥 ${v.pop}/${v.pop_max}</div>
            <div>📊 ${p.points} pts | 🏆 #${p.rank} | 📨 ${p.new_report || 0} relatórios | ✉️ ${p.new_igm || 0} msgs</div>
            <div>🎯 Próx: ${proxStr}</div>
            ${p.incomings > 0 ? `<div style="color:#a00;font-weight:bold;">⚔️ ${p.incomings} ataques chegando!</div>` : ''}
        `;
    }
    // =====================================================================

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
    injectStatusPanel();
    setInterval(tick, TICK_MS);
    setInterval(updateStatusPanel, 3000); // status panel refresh independente
    log(`Loop iniciado (${TICK_MS}ms).`);
})();
