# Como automatizar com IA (Claude ou ChatGPT)

A extensão **INSS Extractor by FonCK** já inclui uma ponte interna (`window.EXTRATOR_MEU_INSS`) para que agentes de IA com acesso ao navegador executem toda a extração de forma determinística — **sem que você precise clicar manualmente em cada ferramenta ou tela do Meu INSS**.

## Usando com Claude (Claude in Chrome / Claude Desktop / Antigravity)
1. Copie o arquivo `SKILL.md` desta pasta para a pasta de skills do seu ambiente (ou anexe-o diretamente no chat do Claude).
2. Faça login normalmente na aba `meu.inss.gov.br`.
3. Peça ao Claude:
   > *"Use a skill INSS Extractor by FonCK para extrair todos os contratos e o extrato completo do benefício aberto no Meu INSS."*

## Usando com ChatGPT (Agente / Operator / Custom GPT)
1. Abra o arquivo `CHATGPT_INSTRUCOES.md` desta pasta e copie o prompt pronto.
2. Cole no início da conversa ou nas instruções do seu Custom GPT.
3. Com o Meu INSS logado no navegador, peça para extrair os contratos e o extrato completo.

## Privacidade & Segurança
- A IA **nunca** recebe sua senha do `gov.br` nem dados confidenciais fora da sessão local do navegador.
- Você faz login normalmente no `meu.inss.gov.br` e a IA apenas aciona os comandos da extensão já instalada localmente.

---

Quer montar agentes de IA sob medida para o seu escritório ou empresa?
- **Consultoria Gestão & IA (Gabriel Fonseca):** WhatsApp `(21) 96484-2518` — https://wa.me/5521964842518
- **Site Oficial:** https://inss-extractor-by-fonck-site.vercel.app/
- **LinkedIn:** https://www.linkedin.com/in/fonck
