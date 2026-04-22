# 🔔 Notificação TW — Guia de configuração

## O que faz

Envia mensagem no Discord e/ou Telegram quando:
- Um ataque chega na sua aldeia (a cada 30s, configurável)
- Um captcha (anti-bot) aparece no jogo

O script **apenas observa e notifica** — nunca clica ou submete nada dentro da página.

## Instalação

1. Tampermonkey instalado no Chrome
2. Clicar no link de instalação (raw do GitHub):
   `https://raw.githubusercontent.com/jvkuhn/kuhn-tw-scripts/main/scripts/notificacao.user.js`
3. Tampermonkey abre — clicar "Instalar"
4. Acessar qualquer mundo BR — botão 🔔 aparece no canto superior direito

## Configurar Discord

1. Ir num servidor Discord seu (criar um pessoal se não tiver)
2. Em um canal: ⚙️ → Integrações → Webhooks → Novo webhook
3. Dar um nome (ex: "TW Bot"), copiar URL do webhook
4. Clicar 🔔 no TW → colar URL no campo Discord → "Testar Discord" → confirmar mensagem chega
5. "Salvar"

## Configurar Telegram

1. No Telegram, conversar com [@BotFather](https://t.me/BotFather)
2. `/newbot` → seguir instruções → copiar **token** (formato `123456:ABC-DEF...`)
3. Iniciar conversa com seu bot novo (mandar qualquer mensagem)
4. Abrir no navegador: `https://api.telegram.org/bot<TOKEN>/getUpdates` (substituir `<TOKEN>`)
5. Procurar `"chat":{"id":<NUMERO>}` — esse `<NUMERO>` é seu **chat ID**
6. Clicar 🔔 no TW → colar token e chat ID → "Testar Telegram" → confirmar mensagem
7. "Salvar"

## Indicadores no botão 🔔

- 🔔 (marrom) — funcionando normalmente
- ⏸️ (cinza) — sessão TW expirou, recarregue a página
- ⚠️ (vermelho) — vários erros consecutivos, verificar console (F12)

## Troubleshooting

**Botão não aparece:**
- Confirmar mundo é `*.tribalwars.com.br/game.php*`
- Verificar Tampermonkey ativo no ícone do navegador
- F12 → Console → procurar mensagens `[🔔 Notif]`

**Notificação não chega:**
- Modal → "Testar" no canal correspondente. Se teste passa mas eventos não, ver console.
- Confirmar evento marcado nos checkboxes do modal

**Captcha não detectado:**
- Inspecionar o popup do captcha (F12 → Elements), ver `id` ou `class`
- Adicionar seletor em `CAPTCHA_SELECTORS` no script

## Limitações conhecidas

- "Ataque chegando" só notifica que **chegou um novo** — não dá detalhes (quem/quando/onde). Esses detalhes virão em V2.
- Múltiplas abas TW abertas: cada uma roda seu loop, mas dedupe compartilhado evita spam.
- Resolução automática de captcha NÃO faz parte deste script (por questão de risco de ban). Será feita por um pyautogui externo no futuro.
