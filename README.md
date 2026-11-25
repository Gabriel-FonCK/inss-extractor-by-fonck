# INSS Extractor by FonCK (Open Source · v2.2.0)

[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-111111.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20%26%20Edge-Manifest%20V3-2456d6.svg)](extension/manifest.json)

Extensão gratuita e **open source** desenvolvida por **Gabriel Fonseca (FonCK)** para **Google Chrome** e **Microsoft Edge** que automatiza a extração de documentos no **Meu INSS** (`meu.inss.gov.br`), 100% localmente no navegador:

- **Contratos Consignados** separados automaticamente em `Empréstimos/`, `Cartão RMC/` e `Cartão RCC/`
- **Contratos já renomeados** no formato `01Jan21 - GABRIEL FONSECA BANCO - 0000102030.pdf`
- **Documento Oficial (frente/verso)**, **Biometria Facial**, `Resumo dos contratos.csv` e `Resumo Cartões RMC e RCC.csv`
- **Extrato de Pagamento (HISCRE)** completo desde o **1º extrato possível (`06/1994`)**, pulando anos vazios, salvo de **12 em 12 meses** + **PDF único unificado** + **planilha Excel por rubricas**
- **Visual Editorial Minimalista** com **Tema Claro** e **Tema Escuro** (`☀ / ☾`)
- **Skill de IA inclusa (`extension/skill-ia/`)** pronta para **Claude** e **ChatGPT** operarem a extensão sem cliques manuais via `window.EXTRATOR_MEU_INSS`

## Estrutura do Repositório

```text
inss-extractor-by-fonck/
  extension/          # Código-fonte da extensão (Manifest V3) — pronto para carregar no Chrome/Edge
    skill-ia/         # Skill para Claude (SKILL.md) e instruções para ChatGPT
    manuais/          # Manuais rápidos de instalação e uso
    welcome/          # Página de boas-vindas ao instalar
    SECURITY.md       # Política de segurança e privacidade
    LICENSE           # Licença MIT
  site/               # Site oficial estático pronto para deploy na Vercel (com tutoriais visuais, Pix e CTAs)
```

## Deploy do Site na Vercel (1 clique)
1. Suba este repositório para `https://github.com/Gabriel-FonCK/inss-extractor-by-fonck`.
2. Na Vercel, importe o repositório e defina **Root Directory** = `site` (Framework Preset: `Other`, sem comando de build).
3. Após publicar, atualize `siteUrl` em `extension/config.js` com o domínio final da Vercel e gere o `.zip`.

## Segurança & Privacidade
Leia [SECURITY.md](extension/SECURITY.md). Tudo roda 100% localmente no navegador, sem telemetria e sem coleta de senhas do `gov.br`.

## Consultoria (Gestão & IA — Gabriel Fonseca) e Links
- **Site Oficial:** https://inss-extractor-by-fonck-site.vercel.app/
- **WhatsApp:** [(21) 96484-2518](https://wa.me/5521964842518)
- **LinkedIn:** https://www.linkedin.com/in/fonck
- **GitHub:** https://github.com/Gabriel-FonCK/
- **Apoio voluntário (Pix NG.CASH — `@gabriel.fonck` / celular):** `+5521964842518`
