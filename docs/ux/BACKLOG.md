# Backlog UX

Pontuação = Impacto × Frequência × Esforço × Risco (1–5; esforço e risco invertidos: 5 = rápido / sem risco de regras).

## Por decidir

### [UX-04] Ver a meta do ano no Financeiro

- **Módulo:** Financeiro
- **Problema:** A pergunta «estamos acima ou abaixo da meta?» só se responde em Definições. O Financeiro é a lista do que falta faturar. O dono abre o módulo errado para a quarta tarefa da missão.
- **Objetivo / métrica:** perceber o ritmo em ≤ 5 s no topo do Financeiro.
- **Proposta:** uma linha no topo, só com dados já gravados: realizado do ano, meta, falta X €. Sem previsões nem propostas enviadas.
- **Microcopy (pt-PT):** «Realizado», «Meta», «Faltam X €» ou «Acima da meta em X €».
- **Estados cobertos:** sem meta definida (link para Definições) / carregamento / erro.
- **Toca em regras ou dados?** Sim → leitura de `FinanceYear` já existente, sem alterar o cálculo → **requer aprovação do dono**.
- **Pontuação:** Impacto 5 × Frequência 5 × Esforço 3 × Risco 4 = 300
- **Critérios de aceitação:**
  - [ ] O realizado não inclui rascunhos nem propostas só enviadas.
  - [ ] Regras da secção 3 mantidas (30 min, realizado, rascunhos, portal).
- **Como medir depois:** abrir Financeiro e dizer em 5 s se o ano está atrás ou à frente.

### [UX-05] Saldo do pack no momento de registar

- **Módulo:** Manutenção
- **Problema:** O registo rápido pede cliente e 30 min, mas não mostra as horas que restam. A decisão de «incluído» vs «por faturar» faz-se sem o saldo.
- **Objetivo / métrica:** ver horas restantes sem sair do modal.
- **Proposta:** uma linha só de leitura por baixo do cliente: «Pack: 9 h restantes» ou «À hora — este registo fica por faturar».
- **Microcopy (pt-PT):** as frases acima.
- **Estados cobertos:** sem contrato / pack esgotado / carregamento.
- **Toca em regras ou dados?** Sim → mostra o saldo, não o altera → **requer aprovação do dono** (o modal passa a ler o contrato).
- **Pontuação:** Impacto 5 × Frequência 5 × Esforço 3 × Risco 4 = 300
- **Critérios de aceitação:**
  - [ ] Continua impossível gravar minutos que não sejam múltiplos de 30.
  - [ ] Regras da secção 3 mantidas (30 min, realizado, rascunhos, portal).
- **Como medir depois:** registar 30 min e confirmar o saldo visível antes de guardar.

### [UX-06] Euro sempre com `Intl`, nunca `toFixed`

- **Módulo:** Comercial
- **Problema:** Financeiro e projetos usam `Intl` pt-PT. Comercial e alguns totais usam `1234.50 €`.
- **Objetivo / métrica:** um único formato `1 234,50 €`.
- **Proposta:** passar os sítios com `toFixed` + `€` para o helper de moeda. Não mudar valores.
- **Microcopy (pt-PT):** sem textos novos.
- **Estados cobertos:** zero, valores com cêntimos.
- **Toca em regras ou dados?** Não (formato). O HTML da proposta enviada ao cliente muda de aspeto → confirmar antes se propostas já enviadas devem manter o formato antigo.
- **Pontuação:** Impacto 2 × Frequência 3 × Esforço 3 × Risco 4 = 72
- **Critérios de aceitação:**
  - [ ] Nenhum valor numérico muda, só o texto.
  - [ ] Regras da secção 3 mantidas (30 min, realizado, rascunhos, portal).
- **Como medir depois:** o mesmo montante lê-se igual no Financeiro e na proposta.

## Feito neste ciclo

- [UX-01] Navegação legível no tema claro e alvos de 44 px na barra móvel.
- [UX-02] «Mover para…» no cartão do Kanban, sem depender do rato.
- [UX-03] Portal e contratos em pt-PT: Avença / À hora, sem `retainer` nem origem interna.
