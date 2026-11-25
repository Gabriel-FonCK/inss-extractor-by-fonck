# INSS Extractor by FonCK (Open Source · v2.4.1)

[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-111111.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20%26%20Edge-Manifest%20V3-2456d6.svg)](manifest.json)

Extensão gratuita e **open source (Licença MIT)** desenvolvida por **Gabriel Fonseca (FonCK)** para **Google Chrome** e **Microsoft Edge** que automatiza a extração de documentos no **Meu INSS** (`meu.inss.gov.br`), 100% localmente no navegador:

- **Contratos Consignados** separados automaticamente em `Empréstimos/`, `Cartão RMC/` e `Cartão RCC/`
- **Contratos já renomeados** no padrão `DDMesAA - BANCO - CONTRATO.pdf`
- **Lista única `CONTRATOS-PENDENTES.txt`** agrupada por banco para contratos sem cópia no Meu INSS
- **Documento Oficial (frente/verso)**, **Biometria Facial**, `Resumo dos contratos.csv` e `Resumo Cartões RMC e RCC.csv`
- **Extrato de Pagamento (HISCRE)** completo desde o **1º extrato possível (`06/1994`)**, pulando períodos sem pagamento, salvo de **12 em 12 meses** + **PDF único unificado** + **planilha Excel por rubricas**
- **Tema Claro e Tema Escuro** (`☀ / ☾`)
- **Automação com IA inclusa (`skill-ia/`)** pronta para **Claude** e **ChatGPT** via ponte local `window.EXTRATOR_MEU_INSS`

## Instalação rápida (1 minuto)

1. Baixe o pacote `.zip` em [inss-extractor-by-fonck-site.vercel.app](https://inss-extractor-by-fonck-site.vercel.app/) (ou clique em **Code → Download ZIP** neste repositório) e extraia a pasta.
2. Abra `chrome://extensions` (Chrome) ou `edge://extensions` (Edge) e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** (Chrome) ou **Carregar sem pacote** (Edge) e selecione a pasta extraída (onde está o `manifest.json`).
4. Em `chrome://settings/downloads`, desative **"Perguntar onde salvar cada arquivo antes de fazer download"** para baixar lotes sem interrupções.

Consulte também os guias inclusos em [`manuais/MANUAL_INSTALACAO.md`](manuais/MANUAL_INSTALACAO.md) e [`manuais/MANUAL_USO.md`](manuais/MANUAL_USO.md).

## Estrutura da Extensão

```text
inss-extractor-by-fonck/
  manifest.json       # Manifesto Manifest V3 (Chrome & Edge)
  config.js           # Configuração central da extensão
  background/         # Service Worker (downloads organizados e sem duplicatas)
  content/            # Painel Shadow DOM, ponte Meu INSS, PDF, CSV e CONTRATOS-PENDENTES.txt
  popup/              # Menu rápido na barra do navegador
  welcome/            # Guia de boas-vindas ao instalar
  skill-ia/           # Skill para Claude (SKILL.md) e instruções para ChatGPT
  manuais/            # Manuais rápidos de instalação e uso
  icons/              # Ícones oficiais (16, 48 e 128 px)
  vendor/             # pdf-lib local para unificação offline de PDFs
  SECURITY.md         # Política de segurança e privacidade
  LICENSE             # Licença MIT
```

## Segurança & Privacidade
Leia [SECURITY.md](SECURITY.md). Tudo roda 100% localmente no navegador, sem backend, sem telemetria e sem coleta de senhas do `gov.br`.

## Links & Consultoria (Gestão & IA — Gabriel Fonseca)
- **Site Oficial & Tutoriais em Slides:** https://inss-extractor-by-fonck-site.vercel.app/
- **WhatsApp:** https://wa.me/5521964842518
- **LinkedIn:** https://www.linkedin.com/in/fonck
- **GitHub:** https://github.com/Gabriel-FonCK/
- **Apoio voluntário (Pix NG.CASH — `@gabriel.fonck` / celular):** `+5521964842518`

## Licença
Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE).
