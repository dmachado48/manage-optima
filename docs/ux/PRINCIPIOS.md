# Princípios de interface — Optima Desk

Fonte do que já está na app. Não inventar um estilo novo.

## Tema

- Tema claro fixo: `html[data-theme="light"]`.
- Tinta `#1a1d23`, fundo `#f4f6f8`, superfície branca, texto secundário `#4b5563`.
- Azul da marca: `--blue-600` (`#2563eb`) para ação; `--blue-950` para texto sobre fundo claro.
- Texto de navegação ativa é escuro sobre um azul muito diluído. Nunca azul claro (`--blue-100` / `--blue-200`) em cima de superfície clara.

## Tipo e controlos

- Fonte: IBM Plex Sans.
- Botões do desk: maiúsculas, 28 px de altura, raio 2 px. Densidade de secretária, não de marketing.
- No telemóvel, a barra de módulos tem alvos de pelo menos 44 px.
- Componentes HeroUI primeiro. Cores e espaçamentos vêm dos tokens, não de hex solto — exceção atual: cores de estado na ficha do cliente (ver backlog).

## Língua

- pt-PT, tratamento por «tu».
- Contrato: **Pack**, **Avença**, **À hora**. Não usar «retainer» nem «horário» na interface.
- Estados do Kanban (as quatro colunas): **Pedidos**, **Em curso**, **À espera**, **Concluído**.

## Números

- Moeda: `Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })`. Há sítios que ainda usam `toFixed` + `€` (comercial, alguns totais). Não acrescentar mais.
- Duração: `formatMinutes` → `1h 30min`. É o formato único da app.
- Datas: `formatDatePt` (dia, mês curto, ano, Europe/Lisbon).

## Tempo e dinheiro

- Duração de intervenção só em múltiplos de 30 minutos (atalhos 30 / 60 / 90 / 120).
- O realizado financeiro lê horas faturáveis e propostas aprovadas. O ecrã Financeiro mostra por faturar / faturado. A meta anual está em Definições.
