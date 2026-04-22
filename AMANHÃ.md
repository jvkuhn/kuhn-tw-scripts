# Plano de Amanhã (sessão de 2026-04-22)

## Estado deixado em 2026-04-21 ~01h

### Versões publicadas no GitHub
- **🔔 notificacao.user.js** v1.1.1 — funcionando (notificações Discord/Telegram, ataques, captcha, mensagens)
- **🏰 up-village.user.js** v1.3.3 — instalado + sniffer com auto-teste, mas funcionalidade real ainda não comprovada

### O que está funcionando
- ✅ Notificacao: ataques chegando, captcha apareceu, mensagens novas (com `new_igm`)
- ✅ Up-village: HUD visual (modal com toggles), editor de plano em tabela, debug logger pro Discord
- ✅ Distribuição via GitHub raw com auto-update
- ✅ Permissões de git no allowlist do projeto

### O que NÃO está funcionando
- ❌ Quest claim em background — chamada não retorna o esperado, regex de IDs não acha nada no HTML de `screen=new_quests`
- ❌ Construtor — falha ao tentar upgrade (motivo não confirmado: pode ser CSRF, formato de URL, recursos, requisitos)
- ❓ Sniffer (recording mode) — usuário diz que não capturou nada na v1.3.0 e v1.3.1; v1.3.2 e v1.3.3 mudaram pra `unsafeWindow` direto + auto-teste, mas não foram testadas ainda

## Primeiro passo amanhã (5 minutos)

1. F12 → Console (deixa aberto)
2. F5 no jogo
3. Esperar 3 segundos
4. Procurar uma das duas linhas:
   - **Verde** "✅ Sniffer FUNCIONANDO" → ✅ tudo certo, prossegue pra captura de dados
   - **Vermelho** "❌ Sniffer NÃO capturou o auto-teste" → ❌ unsafeWindow approach também falhou; precisamos de plano C

## Se sniffer funcionou: capturar dados pra cada feature

Pra cada feature abaixo, **fazer 1 ação manualmente no jogo** com Recording + Debug ON. Os logs no Discord vão mostrar a chamada real do TW:

### A. Construir prédio (pra fechar o construtor)
1. Vai na aldeia → Edifício Principal
2. Clica em "construir madeireira"
3. Espera 5s, copia o que apareceu no Discord
4. Manda pro próximo turno

### B. Resgatar missão (pra fechar quest claim)
1. Quando tiver missão pendente
2. Abre popup, clica "Concluir/Resgatar"
3. Copia o que apareceu

### C. Recrutar tropas (pra construir módulo recrutamento)
1. Vai no Quartel
2. Recruta 1 lanceiro (1 unidade só, custo mínimo)
3. Copia o que apareceu

### D. Upar paladino (pra construir módulo paladino)
1. Vai na Estátua / Paladino
2. Faz o que precisa fazer pra ele upar
3. Copia o que apareceu

### E. Agendar comando (pra construir agendador)
1. Vai na Praça de Reuniões
2. Tenta agendar um comando (qualquer um)
3. Copia o que apareceu

## Se sniffer NÃO funcionou: plano C

Tampermonkey pode estar bloqueando override de `unsafeWindow.fetch` por algum motivo (modo strict do sandbox, política do Chrome). Alternativa:

1. Verificar nas opções do Tampermonkey: **modo do sandbox** deve estar em "JavaScript" (não "DOM" ou "Strict")
2. Se persistir: tentar **Violentmonkey** em vez de Tampermonkey (alguns overrides funcionam diferente)
3. Última alternativa: manter o método antigo (usuário usa F12 → Network → captura cURL → cola pra mim). Mais trabalhoso mas funciona.

## Features que dá pra construir (assumindo sniffer funcionando)

Ordem sugerida (do mais simples pro mais complexo):

1. **Coleta** — clicar nos botões "iniciar coleta" a cada N horas. Endpoint provável: `screen=place&mode=scavenge` ou `screen=scavenge`. Pequena variação do upgrade.
2. **Recrutamento** — manter quantidade-alvo de cada unidade. Endpoint provável: `screen=barracks&action=recruit`.
3. **Paladino** — upar paladino quando atinge nível ou tem nivelamento. Mais simples se tiver dados.
4. **Construtor real** — depois que sabemos o formato exato.
5. **Agendador** — o mais complexo. Precisa precisão de millisegundos. Última prioridade.

## Notas técnicas

- CSRF token disponível em `game_data.csrf` (regenera por sessão, não cachear)
- Village ID em `game_data.village.id`
- Building levels em `game_data.village.buildings.<id>`
- Resources: `game_data.village.{wood, stone, iron, pop, pop_max}`
- Player flags: `game_data.player.{new_igm, new_quest, new_report, incomings}`
- Premium AM **inativo** nessa conta (free) — confirmado em `game_data.features.AccountManager.active = false`

## Lições aprendidas (não repetir)

- ⚠️ Sempre declarar `const` no topo do IIFE antes de qualquer função que possa ser chamada cedo (evita TDZ)
- ⚠️ `log()` não pode chamar `getConfig()` direta ou indiretamente — vira recursão
- ⚠️ `@match` do Tampermonkey é mais estrito que `@include` (preferir include)
- ⚠️ Tampermonkey precisa de "modo desenvolvedor" ativo no Chrome pra rodar scripts custom
- ⚠️ Construir 4 features sem testar uma só = 4× mais bugs amanhã
