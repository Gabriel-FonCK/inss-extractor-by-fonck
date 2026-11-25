# Manual Rápido de Uso — INSS Extractor by FonCK

> Versão básica para revisão.

## 1. Abrir o Meu INSS
1. Acesse `https://meu.inss.gov.br` e faça login normalmente com a conta **gov.br**.
2. Abra **Extrato de Empréstimo Consignado** (ou **Meus Benefícios**).
3. O botão flutuante no canto inferior direito detecta o **Número do Benefício (NB)** automaticamente.

## 2. Escolher o que baixar
Clique no botão flutuante **INSS Extractor by FonCK** (você pode alternar entre **Tema Claro** e **Tema Escuro** no botão `☾ / ☀` no topo do painel):

- **Aba Contratos:**
  - Baixa os contratos já separados em pastas (`Empréstimos/`, `Cartão RMC/` e `Cartão RCC/`).
  - Cada contrato em PDF já vem renomeado no padrão: `01Jan21 - GABRIEL FONSECA BANCO - 0000102030.pdf`.
  - Também extrai `Dados de Identificação.pdf`, `Documento Oficial Frente/Verso.jpg`, `Registro Biométrico Facial.jpg`, `Resumo dos contratos.csv`, `Resumo Cartões RMC e RCC.csv` e gera um único `CONTRATOS-PENDENTES.txt` agrupado por banco quando houver contratos sem cópia.
  - Clique em **Baixar contratos** ou **Baixar contratos e extrato de pagamento**.
- **Aba Extrato de pagamento (HISCRE):**
  - Já vem configurado por padrão desde o **1º extrato possível (`06/1994`)** até o mês atual — sem limite de 5–6 anos.
  - Pula automaticamente os anos em que não houve pagamento.
  - Salva os **PDFs separados de 12 em 12 meses**, o **PDF único unificado** e a **planilha Excel (`.csv`)** mês a mês por rubrica.

## 3. Selos de resultado
- **Salvo:** arquivos gravados em `Downloads/Contratos INSS/<NOME DO CLIENTE>/`.
- **Sem cópia:** o INSS não possui cópia anexada pelo banco para aquele contrato (registrado no CSV e consolidado em `CONTRATOS-PENDENTES.txt`).
- **Erro técnico:** falha temporária do servidor do INSS — ao final do lote, clique em **Repetir erros**.

## 4. Quer automatizar sem cliques com IA?
Veja a pasta `skill-ia/` incluída neste mesmo pacote para usar o **Claude** ou o **ChatGPT** direto no navegador.
