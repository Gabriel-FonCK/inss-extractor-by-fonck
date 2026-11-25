# Política de Segurança e Privacidade — INSS Extractor by FonCK

Este projeto é **open source (licença MIT)** e foi construído sob o princípio de **privacidade local por padrão (*local-first*)**.

## Garantias de Arquitetura

1. **Execução 100% local no navegador**
   - A extensão não possui backend, servidor de coleta, banco de dados ou telemetria/analytics.
   - Todas as bibliotecas (incluindo `vendor/pdf-lib.min.js`) são empacotadas localmente dentro do próprio `.zip`, sem carregamento de código remoto.

2. **Permissões mínimas (`manifest.json`)**
   - `permissions`: apenas `downloads` (para salvar PDFs, imagens e planilhas na pasta `Downloads/Contratos INSS/`) e `storage` (apenas para lembrar a preferência de tema Claro/Escuro).
   - `host_permissions`: estritamente restrito aos domínios oficiais do INSS:
     - `https://meu.inss.gov.br/*`
     - `https://vip-pmeuinss-api.inss.gov.br/*`
     - `https://vip-pmeuinss-arq.inss.gov.br/*`
   - Nenhuma permissão ampla (`<all_urls>`, `tabs`, `cookies`, `history` ou `clipboardRead`) é solicitada.

3. **Zero captura de senhas ou burla de autenticação**
   - A extensão **nunca** solicita, lê, grava ou transmite senhas do `gov.br`.
   - O login e eventuais desafios reCAPTCHA ou autenticação em dois fatores (2FA) são realizados exclusivamente pelo próprio usuário na interface oficial do `meu.inss.gov.br`.
   - A comunicação entre os mundos `MAIN` (`page-bridge.js`) e `ISOLATED` (`content.js`) valida estritamente `event.source === window` e `event.origin === window.location.origin`.

4. **Uso responsável e LGPD**
   - Os arquivos extraídos contêm dados pessoais/previdenciários do titular e ficam salvos apenas localmente na pasta `Downloads` do computador em uso.
   - Quem utiliza a extensão em escritório deve contar com autorização/procuração do cliente e cumprir a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

## Reportar vulnerabilidades

Encontrou qualquer problema de segurança? Abra uma issue ou entre em contato diretamente via GitHub (`https://github.com/Gabriel-FonCK/inss-extractor-by-fonck`) ou LinkedIn (`https://www.linkedin.com/in/fonck`).
