---
name: inss-extractor-by-fonck
description: Automatiza a extração completa de contratos consignados (Empréstimos, Cartão RMC e Cartão RCC) e extratos de pagamento multi-anos (HISCRE desde 06/1994) no meu.inss.gov.br usando a API local da extensão INSS Extractor by FonCK (window.EXTRATOR_MEU_INSS), sem precisar clicar manualmente nas telas do navegador.
---

# INSS Extractor by FonCK — Skill para Claude & Agentes de Navegador

Use esta skill sempre que o usuário pedir para extrair contratos consignados, documentos de identificação, biometria facial, planilhas CSV ou extratos de pagamento (HISCRE) do portal `meu.inss.gov.br` sem cliques manuais repetitivos.

## Regras de Segurança (Obrigatórias)

1. **Nunca peça, leia ou digite senhas do `gov.br`.** Se o usuário ainda não estiver autenticado (`isLoggedIn: false`), abra `https://meu.inss.gov.br/`, aguarde o usuário concluir o login (e eventual 2FA/reCAPTCHA) normalmente e retome assim que a sessão estiver ativa.
2. **Nunca tente burlar CAPTCHA.** Se a extensão retornar `phase: "captcha_required"`, avise o usuário para resolver o reCAPTCHA na tela do Meu INSS e então chame `runExtrato()` novamente.
3. **Respeite o ritmo da extensão:** a própria extensão já aplica pausas seguras entre requisições para evitar bloqueios da Dataprev.

## Passo a Passo Determinístico (Zero Cliques Manuais)

A extensão **INSS Extractor by FonCK** expõe a ponte JavaScript `window.EXTRATOR_MEU_INSS` e o estado JSON `#extrator-inss-agent-state` diretamente na aba `https://meu.inss.gov.br/`.

### 1. Verificar se a extensão está instalada e o usuário está logado
Execute no contexto da página `meu.inss.gov.br`:
```js
await window.EXTRATOR_MEU_INSS.getState()
```
- Se `window.EXTRATOR_MEU_INSS` não existir: oriente o usuário a instalar a extensão em `chrome://extensions` (ou `edge://extensions`) e recarregar a aba do Meu INSS.
- Se `state.isLoggedIn === false`: peça ao usuário para fazer login no `gov.br` na aba aberta e aguarde até `isLoggedIn === true`.

### 2. Abrir o painel e carregar o Número do Benefício (NB)
```js
const st = await window.EXTRATOR_MEU_INSS.openPanel();
// Se o usuário informou um NB específico ou houver múltiplos benefícios em st.beneficios:
await window.EXTRATOR_MEU_INSS.loadContracts(st.nb || st.beneficios[0].nb);
```
Opcionalmente, configure o nome da pasta do cliente ou período antes de iniciar (por padrão a extensão já começa em **`06/1994` — 1º extrato possível**, pulando automaticamente anos vazios):
```js
await window.EXTRATOR_MEU_INSS.configure({
  clientName: 'NOME DO CLIENTE', // opcional (já detectado automaticamente)
  opts: {
    contratoPdf: true,
    documentoOficial: true,
    biometriaFacial: true,
    planilhaResumo: true,
    listaPendentesTxt: true,
    hiscrePdfsSeparados: true,
    hiscrePdfUnico: true,
    hiscrePlanilhaExcel: true
  }
});
```

### 3. Disparar extração completa (Contratos + Extrato de Pagamento)
```js
await window.EXTRATOR_MEU_INSS.runAll();
```
*(Ou use `runContracts()` apenas para contratos consignados, ou `runExtrato()` apenas para o HISCRE.)*

### 4. Acompanhar até concluir (sem cliques)
Consulte `await window.EXTRATOR_MEU_INSS.getState()` a cada ~5 segundos enquanto `state.running === true`:
- `phase === "completed"`: extração concluída!
- `phase === "captcha_required"`: peça ao usuário resolver o reCAPTCHA no site e chame `await window.EXTRATOR_MEU_INSS.runExtrato()`.
- Se `summary.error > 0` ao final dos contratos: rode 1 retentativa automática com:
```js
await window.EXTRATOR_MEU_INSS.runContracts({ onlyErrors: true });
```

### 5. Entregar o resumo ao usuário
Informe de forma objetiva:
- Pasta de saída: `Downloads/Contratos INSS/<NOME DO CLIENTE>/`
- Quantidade de contratos salvos, `Sem cópia` e eventuais `Erro técnico` (já detalhados em `Resumo dos contratos.csv`, `Resumo Cartões RMC e RCC.csv` e na lista consolidada `CONTRATOS-PENDENTES.txt` agrupada por banco).
- Contratos salvos já renomeados no padrão `DDMesAA - NOME DO BANCO - NÚMERO DO CONTRATO.pdf` (separados em `Empréstimos/`, `Cartão RMC/` e `Cartão RCC/`).
- Extratos HISCRE de 12 em 12 meses + PDF unificado + planilha Excel `.csv`.
