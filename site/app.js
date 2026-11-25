'use strict';

// INSS Extractor by FonCK (v2.4.0) — Editorial Interactive Product Layer

const PIX_KEY = '+5521964842518';
const prefersReducedMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 1. Theme Switch (Icon-only toggle: Editorial Light <-> Studio Obsidian) ──
const btnTheme = document.getElementById('btn-theme');
const themeMeta = document.querySelector('meta[name="theme-color"]');

function syncThemeUi(mode) {
  const dark = mode === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (btnTheme) {
    const lbl = dark ? 'Ativar tema claro' : 'Ativar tema escuro';
    btnTheme.setAttribute('aria-label', lbl);
    btnTheme.setAttribute('title', lbl);
  }
  if (themeMeta) themeMeta.setAttribute('content', dark ? '#090a0e' : '#f7f8fa');
}

syncThemeUi(document.documentElement.getAttribute('data-theme') || 'light');

if (btnTheme) {
  btnTheme.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    syncThemeUi(next);
    try {
      localStorage.setItem('fonckSiteTheme', next);
    } catch {
      // ignore
    }
  });
}

// ── 2. Mobile Menu Sheet ─────────────────────────────────────────────────────
const btnMenu = document.getElementById('btn-menu');
const mobileSheet = document.getElementById('mobile-sheet');
if (btnMenu && mobileSheet) {
  const closeSheet = () => {
    mobileSheet.classList.remove('open');
    mobileSheet.setAttribute('aria-hidden', 'true');
    btnMenu.setAttribute('aria-expanded', 'false');
  };
  btnMenu.addEventListener('click', () => {
    const open = !mobileSheet.classList.contains('open');
    mobileSheet.classList.toggle('open', open);
    mobileSheet.setAttribute('aria-hidden', String(!open));
    btnMenu.setAttribute('aria-expanded', String(open));
  });
  mobileSheet.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeSheet));
}

// ── 3. Hardware-Accelerated Sliding Tab Pills ────────────────────────────────
function positionPill(group) {
  const pill = group.querySelector('.sliding-tab-pill');
  const active = group.querySelector('.sliding-tab[aria-selected="true"]');
  if (!pill || !active) return;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.transform = `translateX(${active.offsetLeft - 3}px)`;
}

function initAllTabGroups() {
  document.querySelectorAll('[data-tab-group]').forEach((group) => positionPill(group));
}
window.addEventListener('resize', initAllTabGroups, { passive: true });
window.addEventListener('load', initAllTabGroups);
initAllTabGroups();

// ── 4. Pointer Spotlight on Interactive Editorial Cards ──────────────────────
if (!prefersReducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll('.spotlight-card').forEach((card) => {
    let rafSpot = 0;
    let lastX = 0;
    let lastY = 0;
    card.addEventListener(
      'pointermove',
      (e) => {
        const rect = card.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        if (!rafSpot) {
          rafSpot = requestAnimationFrame(() => {
            rafSpot = 0;
            card.style.setProperty('--mx', `${lastX.toFixed(1)}px`);
            card.style.setProperty('--my', `${lastY.toFixed(1)}px`);
          });
        }
      },
      { passive: true }
    );
  });
}

// ── 5. Interactive Clickable Hero Simulator ("Simular extração") ─────────────
const heroTabGroup = document.querySelector('[data-tab-group="hero"]');
function activateHeroTab(targetId) {
  if (!heroTabGroup) return;
  const tabs = heroTabGroup.querySelectorAll('.sliding-tab');
  tabs.forEach((tab) => {
    const match = tab.getAttribute('data-target') === targetId;
    tab.setAttribute('aria-selected', String(match));
    const pane = document.getElementById(tab.getAttribute('data-target'));
    if (pane) pane.classList.toggle('active', match);
  });
  positionPill(heroTabGroup);
}

if (heroTabGroup) {
  heroTabGroup.querySelectorAll('.sliding-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateHeroTab(tab.getAttribute('data-target')));
  });
}

const simRows = Array.from(document.querySelectorAll('[data-sim-row]'));
const simDocs = Array.from(document.querySelectorAll('[data-sim-doc]'));
const simProgress = document.getElementById('sim-progress');
const simActionTitle = document.getElementById('sim-action-title');
const simActionCount = document.getElementById('sim-action-count');
const liveStatusText = document.getElementById('live-status-text');
const liveDot = document.getElementById('live-dot');
const conduitPacket = document.getElementById('conduit-packet');
const cntSaved = document.getElementById('cnt-saved');
const cntCsv = document.getElementById('cnt-csv');
const btnRunSim = document.getElementById('btn-run-sim');
const simBtnLbl = document.getElementById('sim-btn-lbl');
const simBtnIco = document.getElementById('sim-btn-ico');
const btnFabSim = document.getElementById('btn-fab-sim');

const simSequence = [
  {
    row: 0,
    doc: 0,
    pct: 28,
    saved: 1,
    csv: 0,
    title: 'Renomeando 01Jan21 - GABRIEL FONSECA BANCO - 0000102030.pdf',
    status: 'Extraindo Empréstimo...',
    pillText: 'Salvo'
  },
  {
    row: 1,
    doc: 1,
    pct: 56,
    saved: 2,
    csv: 1,
    title: 'Separando Cartão RMC · FONCK CONSIGNADO (0000203040)',
    status: 'Separando Cartão RMC...',
    pillText: 'Salvo'
  },
  {
    row: 2,
    doc: 2,
    pct: 82,
    saved: 3,
    csv: 1,
    title: 'Separando Cartão RCC · FONCK CARTÕES (0000304050)',
    status: 'Separando Cartão RCC...',
    pillText: 'Salvo'
  },
  {
    row: 3,
    doc: 3,
    pct: 100,
    saved: 3,
    csv: 2,
    title: 'Lote concluído · Sem cópia salvo em CONTRATOS-PENDENTES.txt',
    status: 'Lote concluído',
    pillText: 'Pronto'
  }
];

let simRunning = false;
let simTimers = [];

function clearSimTimers() {
  simTimers.forEach((id) => clearTimeout(id));
  simTimers = [];
}

function pulseConduit() {
  if (!conduitPacket) return;
  conduitPacket.classList.remove('is-firing');
  void conduitPacket.offsetWidth;
  conduitPacket.classList.add('is-firing');
  simTimers.push(
    setTimeout(() => conduitPacket.classList.remove('is-firing'), 420)
  );
}

function applySimFinalState() {
  simRows.forEach((r, i) => {
    r.classList.toggle('is-active', i === 0);
    r.classList.remove('is-scanning');
  });
  simDocs.forEach((d) => {
    d.classList.remove('is-pending', 'is-fresh');
    d.classList.add('is-done');
  });
  if (simProgress) simProgress.style.width = '100%';
  if (simActionTitle) simActionTitle.textContent = 'Lote concluído · Arquivos renomeados e separados';
  if (simActionCount) simActionCount.textContent = '100%';
  if (cntSaved) cntSaved.textContent = '3';
  if (cntCsv) cntCsv.textContent = '2';
  if (liveStatusText) liveStatusText.textContent = 'Sessão local ativa';
  if (liveDot) liveDot.classList.remove('is-busy');
  if (simBtnLbl) simBtnLbl.textContent = 'Simular extração';
  if (simBtnIco) simBtnIco.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
  if (btnFabSim) btnFabSim.classList.add('is-pulsing');
  simRunning = false;
}

function runInteractiveSimulation(startIdx = 0, userTriggered = false) {
  clearSimTimers();
  activateHeroTab('hero-tab-contratos');

  if (prefersReducedMotion) {
    applySimFinalState();
    if (userTriggered) {
      showToast({
        title: 'Simulação concluída',
        detail: '3 contratos renomeados + 2 planilhas CSV separados.'
      });
    }
    return;
  }

  simRunning = true;
  if (liveDot) liveDot.classList.add('is-busy');
  if (btnFabSim) btnFabSim.classList.remove('is-pulsing');
  if (simBtnLbl) simBtnLbl.textContent = 'Extraindo...';
  if (simBtnIco) {
    simBtnIco.innerHTML =
      '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
  }

  // Reset docs from startIdx onward
  simDocs.forEach((d, idx) => {
    d.classList.remove('is-fresh', 'is-done');
    d.classList.toggle('is-pending', idx >= startIdx);
    const pill = d.querySelector('[data-doc-pill]');
    if (pill && idx >= startIdx) {
      pill.textContent = 'Aguardando';
      pill.className = 'pill pill--neutral';
    }
  });
  if (simProgress) simProgress.style.width = `${Math.max(8, startIdx * 25)}%`;
  if (cntSaved) cntSaved.textContent = String(startIdx);
  if (cntCsv) cntCsv.textContent = '0';

  const stepsToRun = simSequence.slice(startIdx);
  stepsToRun.forEach((step, offset) => {
    const delay = offset * 860 + 120;
    simTimers.push(
      setTimeout(() => {
        simRows.forEach((r, idx) => {
          r.classList.toggle('is-active', idx === step.row);
          r.classList.remove('is-scanning');
          if (idx === step.row) {
            void r.offsetWidth;
            r.classList.add('is-scanning');
          }
        });

        pulseConduit();

        const docEl = simDocs[step.doc];
        if (docEl) {
          docEl.classList.remove('is-pending');
          docEl.classList.add('is-done', 'is-fresh');
          const pill = docEl.querySelector('[data-doc-pill]');
          if (pill) {
            pill.textContent = step.pillText;
            pill.className = 'pill pill--ok';
          }
        }

        if (simProgress) simProgress.style.width = `${step.pct}%`;
        if (simActionTitle) simActionTitle.textContent = step.title;
        if (simActionCount) simActionCount.textContent = `${step.pct}%`;
        if (cntSaved) cntSaved.textContent = String(step.saved);
        if (cntCsv) cntCsv.textContent = String(step.csv);
        if (liveStatusText) liveStatusText.textContent = step.status;

        if (offset === stepsToRun.length - 1) {
          simTimers.push(
            setTimeout(() => {
              simRunning = false;
              if (liveDot) liveDot.classList.remove('is-busy');
              if (simBtnLbl) simBtnLbl.textContent = 'Simular novamente';
              if (simBtnIco) {
                simBtnIco.innerHTML =
                  '<path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polyline points="21 3 21 9 15 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
              }
              if (btnFabSim) btnFabSim.classList.add('is-pulsing');
              if (userTriggered) {
                showToast({
                  title: 'Lote simulado com sucesso',
                  detail: '3 PDFs renomeados + 2 planilhas CSV PT-BR prontos.'
                });
              }
            }, 680)
          );
        }
      }, delay)
    );
  });
}

if (btnRunSim) {
  btnRunSim.addEventListener('click', () => runInteractiveSimulation(0, true));
}
if (btnFabSim) {
  btnFabSim.classList.add('is-pulsing');
  btnFabSim.addEventListener('click', () => runInteractiveSimulation(0, true));
}
simRows.forEach((row) => {
  row.addEventListener('click', () => {
    const idx = Number(row.getAttribute('data-sim-row')) || 0;
    runInteractiveSimulation(idx, true);
  });
});

// Gentle single introductory showcase shortly after load (respects reduced motion)
if (!prefersReducedMotion) {
  setTimeout(() => {
    if (!simRunning) runInteractiveSimulation(0);
  }, 1100);
}

// ── 6. Centro de Tutoriais em Slides (Como instalar · 9 | Como usar · 5) ─────
const tutorialDecks = {
  instalar: {
    label: 'Instalação · Chrome & Edge',
    slides: [
      {
        title: '01 — Baixe a extensão (.zip)',
        img: 'assets/tutorial/inst-01-download.png',
        alt: 'Download concluído do arquivo zip da extensão no navegador com botão Mostrar na pasta',
        caption: 'Clique em "Baixar extensão (.zip)" no topo do site e depois em "Mostrar na pasta".',
        body: `
          <p>Clique em <b>Baixar extensão (.zip)</b> no topo desta página.</p>
          <p>Assim que o download terminar no navegador, clique no ícone de pasta (<b>Mostrar na pasta</b>) para abrir o local do arquivo.</p>
          <div class="tut-tip">O pacote já inclui o <code class="mono-tag">manifest.json</code> na raiz, os manuais e a pasta <code class="mono-tag">skill-ia/</code>.</div>
        `
      },
      {
        title: '02 — Localize o arquivo em Downloads',
        img: 'assets/tutorial/inst-02-localizar.png',
        alt: 'Arquivo zip inss-extractor-by-fonck localizado dentro da pasta Downloads do Windows',
        caption: 'Encontre o arquivo compactado na pasta Downloads (ou mova para Documentos).',
        body: `
          <p>Na pasta <b>Downloads</b>, localize o arquivo compactado <code class="mono-tag">inss-extractor-by-fonck</code>.</p>
          <div class="tut-tip"><b>Dica:</b> se quiser evitar apagar sem querer no futuro, mova a pasta extraída para um local fixo como <code class="mono-tag">Documentos</code>.</div>
        `
      },
      {
        title: '03 — Extraia o arquivo compactado',
        img: 'assets/tutorial/inst-03-extrair.png',
        alt: 'Menu de contexto do Windows mostrando Extrair Tudo e WinRAR Extrair para pasta',
        caption: 'Clique com o botão direito e escolha "Extrair Tudo..." (Windows) ou WinRAR.',
        body: `
          <p>Clique com o <b>botão direito</b> sobre o arquivo <code class="mono-tag">.zip</code> e escolha <b>Extrair Tudo...</b> (nativo do Windows) ou <b>WinRAR → Extrair para "inss-extractor-by-fonck..."</b>.</p>
          <p>No Mac, basta clicar duas vezes sobre o <code class="mono-tag">.zip</code> para descompactar.</p>
        `
      },
      {
        title: '04 — Confira a pasta extraída',
        img: 'assets/tutorial/inst-04-pasta.png',
        alt: 'Pasta de arquivos comum criada ao lado da pasta compactada',
        caption: 'Confirme que a "Pasta de arquivos" descompactada foi criada ao lado do .zip.',
        body: `
          <p>Verifique se a <b>Pasta de arquivos</b> comum foi criada logo acima do arquivo compactado.</p>
          <p>É essa pasta descompactada (onde <code class="mono-tag">manifest.json</code> aparece logo no primeiro nível) que você vai selecionar no navegador.</p>
        `
      },
      {
        title: '05 — Ative o Modo do desenvolvedor',
        img: 'assets/tutorial/inst-05-devmode.png',
        alt: 'Página chrome://extensions com a chave Modo do desenvolvedor ativada no canto superior direito',
        caption: 'Acesse chrome://extensions (ou edge://extensions) e ative o Modo do desenvolvedor.',
        body: `
          <p>Digite <code class="mono-tag">chrome://extensions</code> na barra de endereço do Chrome (ou <code class="mono-tag">edge://extensions</code> no Edge) e pressione <b>Enter</b>.</p>
          <p>Ative a chave <b>Modo do desenvolvedor</b> no canto superior direito.</p>
        `
      },
      {
        title: '06 — Carregue sem compactação',
        img: 'assets/tutorial/inst-06-carregar.png',
        alt: 'Botão Carregar sem compactação em destaque no topo de chrome://extensions',
        caption: 'Clique em "Carregar sem compactação" (Chrome) ou "Carregar sem pacote" (Edge).',
        body: `
          <p>Com o Modo do desenvolvedor ligado, surgirá a barra de opções no topo esquerdo.</p>
          <p>Clique em <b>Carregar sem compactação</b> (no Microsoft Edge o botão chama-se <b>Carregar sem pacote</b>).</p>
        `
      },
      {
        title: '07 — Selecione a pasta da extensão',
        img: 'assets/tutorial/inst-07-selecionar.png',
        alt: 'Janela do Windows para selecionar o diretório descompactado da extensão',
        caption: 'Escolha a pasta descompactada e clique em "Selecionar pasta".',
        body: `
          <p>Na janela aberta, clique na pasta descompactada <code class="mono-tag">inss-extractor-by-fonck</code> e aperte <b>Selecionar pasta</b>.</p>
          <div class="tut-tip">Assim que carregar, a página de boas-vindas da extensão abrirá automaticamente. Não apague nem mova esta pasta depois de instalada.</div>
        `
      },
      {
        title: '08 — Fixe o ícone na barra do navegador',
        img: 'assets/tutorial/inst-08-barra.png',
        alt: 'Ícone oficial INSS Extractor by FonCK fixado na barra superior do Chrome ao lado do ícone de extensões',
        caption: 'Fixe o ícone oficial na barra para abrir o guia e o painel rapidamente.',
        body: `
          <p>Clique no ícone de <b>quebra-cabeça (Extensões)</b> no canto superior direito do navegador e marque o <b>alfinete (Fixar)</b> ao lado de <b>INSS Extractor by FonCK</b>.</p>
          <p>O ícone oficial ficará sempre visível para acesso em 1 clique.</p>
        `
      },
      {
        title: '09 — Dica: desligue "Perguntar onde salvar"',
        img: 'assets/tutorial/inst-09-downloads.png',
        alt: 'Tela chrome://settings/downloads destacando a opção Perguntar onde salvar cada arquivo desativada',
        caption: 'Desligue a confirmação por arquivo em chrome://settings/downloads para baixar em lote.',
        body: `
          <p>Abra <code class="mono-tag">chrome://settings/downloads</code> (ou <code class="mono-tag">edge://settings/downloads</code>).</p>
          <p><b>Desative</b> a opção <b>"Perguntar onde salvar cada arquivo antes de fazer download"</b> — assim o navegador não abre uma janela de confirmação para cada PDF do lote.</p>
          <div class="tut-tip">Instalação concluída! Avance para ver o tutorial de <b>Como usar</b> no Meu INSS.</div>
        `
      }
    ]
  },
  usar: {
    label: 'Uso no Meu INSS · v2.4.0',
    slides: [
      {
        title: '01 — Acesse o Meu INSS',
        img: 'assets/tutorial/uso-01-login.png',
        alt: 'Página inicial do Meu INSS com o botão Entrar com gov.br',
        caption: 'Entre em meu.inss.gov.br e faça login normalmente com a conta gov.br autorizada.',
        body: `
          <p>Após concluir a instalação da extensão no navegador, acesse <code class="mono-tag">meu.inss.gov.br</code> e clique em <b>Entrar com gov.br</b>.</p>
          <p>Realize o login normalmente na conta que você está autorizado a consultar — a extensão nunca pede nem armazena senhas.</p>
        `
      },
      {
        title: '02 — Abra o INSS Extractor',
        img: 'assets/tutorial/uso-02-meu-inss.png',
        alt: 'Tela inicial do Meu INSS censurada com o botão flutuante INSS Extractor destacado no canto inferior direito',
        caption: 'Clique no botão flutuante INSS Extractor no canto inferior direito do Meu INSS.',
        body: `
          <p>Após acessar a página inicial do Meu INSS, a extensão identificará automaticamente o benefício e os contratos vinculados.</p>
          <p>Clique no botão <b>INSS Extractor</b>, localizado no canto inferior direito da tela.</p>
        `
      },
      {
        title: '03 — Configure a extração',
        img: 'assets/tutorial/uso-03-configurar.png',
        alt: 'Painel v2.2.0 do INSS Extractor by FonCK mostrando opções de documentos e dados censurados de demonstração',
        caption: 'Confira o nome da pasta, o NB detectado e marque os documentos desejados.',
        body: `
          <p>Confira o nome da pasta do cliente, selecione o <b>número do benefício (NB)</b> e escolha os documentos que deseja extrair:</p>
          <table class="tut-table" aria-label="Opções de extração">
            <thead><tr><th>Opção</th><th>Finalidade</th></tr></thead>
            <tbody>
              <tr><td>Contrato (PDF)</td><td>Baixar os contratos disponíveis já renomeados.</td></tr>
              <tr><td>Biometria facial</td><td>Extrair registros de biometria disponíveis.</td></tr>
              <tr><td>Documento oficial</td><td>Baixar documentos oficiais (frente e verso).</td></tr>
              <tr><td>Planilha resumo</td><td>Consolidar informações em planilhas Excel PT-BR.</td></tr>
              <tr><td>CONTRATOS-PENDENTES.txt</td><td>Lista única agrupada por banco dos contratos sem cópia.</td></tr>
              <tr><td>PDF geral Consignado</td><td>Incluir o extrato geral de empréstimos consignados.</td></tr>
            </tbody>
          </table>
        `
      },
      {
        title: '04 — Inicie o download',
        img: 'assets/tutorial/uso-04-download.png',
        alt: 'Painel do INSS Extractor by FonCK baixando lote de contratos com barra de progresso e selos Salvo',
        caption: 'Escolha entre baixar apenas os contratos ou o lote completo com extrato HISCRE.',
        body: `
          <p>A ferramenta oferece duas opções de extração — acompanhe todo o andamento pelo próprio painel:</p>
          <div class="tut-mode-list">
            <div class="tut-mode-card is-hl">
              <strong>Baixar contratos</strong>
              <span>Baixa os contratos (Empréstimos, RMC e RCC) e os documentos selecionados anteriormente.</span>
            </div>
            <div class="tut-mode-card">
              <strong>Baixar contratos e extrato de pagamento</strong>
              <span>Realiza a extração combinada dos contratos e do extrato HISCRE completo desde 06/1994.</span>
            </div>
          </div>
        `
      },
      {
        title: '05 — Localize os arquivos',
        img: 'assets/tutorial/uso-05-arquivos.png',
        alt: 'Estrutura organizada em Downloads/Contratos INSS/Gabriel Fonseca com pastas de Empréstimos, RMC, RCC, HISCRE e planilhas CSV',
        caption: 'Abra Downloads/Contratos INSS/ para encontrar todas as pastas prontas e sem duplicatas.',
        body: `
          <p>Após a conclusão, abra a pasta <b>Downloads</b>. O INSS Extractor organiza tudo automaticamente pelo nome do cliente:</p>
          <div class="tut-crumbs" aria-label="Caminho da pasta final">
            <span>Downloads</span><span class="sep">›</span>
            <span>Contratos INSS</span><span class="sep">›</span>
            <span class="hi">Gabriel Fonseca</span><span class="sep">›</span>
            <span>Documentos extraídos</span>
          </div>
          <span class="tut-demo-note">Nome utilizado exclusivamente para demonstração.</span>
          <div class="tut-sec-box">
            <strong>Recomendações de segurança</strong>
            <ul>
              <li>Utilize a ferramenta somente em contas cuja consulta esteja autorizada.</li>
              <li>Preserve a confidencialidade dos documentos extraídos.</li>
              <li>Confira se todos os documentos desejados foram baixados antes de encerrar a sessão.</li>
            </ul>
          </div>
        `
      }
    ]
  }
};

let activeDeckKey = 'instalar';
let activeSlideIdx = 0;

const deckTabGroup = document.querySelector('[data-tab-group="tutorial-deck"]');
const tutProgressFill = document.getElementById('tut-progress-fill');
const tutStepCounter = document.getElementById('tut-step-counter');
const tutDeckLabel = document.getElementById('tut-deck-label');
const tutSlideTitle = document.getElementById('tut-slide-title');
const tutSlideBody = document.getElementById('tut-slide-body');
const tutPanelTop = document.querySelector('.tut-panel-top');
const tutSlideImg = document.getElementById('tut-slide-img');
const tutSlideCaption = document.getElementById('tut-slide-caption');
const tutDotsEl = document.getElementById('tut-dots');
const tutPrevBtn = document.getElementById('tut-prev');
const tutNextBtn = document.getElementById('tut-next');
const tutNextLbl = document.getElementById('tut-next-lbl');
const tutViewport = document.getElementById('tut-viewport');
const tutZoomTrigger = document.getElementById('tut-zoom-trigger');

// Lightbox elements
const lightbox = document.getElementById('tut-lightbox');
const lbImg = document.getElementById('lb-img');
const lbTitle = document.getElementById('lb-title');
const lbCounter = document.getElementById('lb-counter');
const lbCaption = document.getElementById('lb-caption');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function syncLightbox() {
  if (!lightbox || !lightbox.classList.contains('open')) return;
  const deck = tutorialDecks[activeDeckKey];
  const slide = deck.slides[activeSlideIdx];
  const total = deck.slides.length;
  if (lbImg) {
    lbImg.src = slide.img;
    lbImg.alt = slide.alt;
  }
  if (lbTitle) lbTitle.textContent = slide.title;
  if (lbCounter) lbCounter.textContent = `${pad2(activeSlideIdx + 1)} / ${pad2(total)}`;
  if (lbCaption) lbCaption.textContent = slide.caption;
  if (lbPrev) lbPrev.disabled = activeSlideIdx === 0;
  if (lbNext) lbNext.disabled = activeSlideIdx === total - 1;
}

function renderTutorialSlide(direction = 'next') {
  const deck = tutorialDecks[activeDeckKey] || tutorialDecks.instalar;
  const total = deck.slides.length;
  activeSlideIdx = Math.max(0, Math.min(total - 1, activeSlideIdx));
  const slide = deck.slides[activeSlideIdx];

  if (tutProgressFill) {
    tutProgressFill.style.transform = `scaleX(${(activeSlideIdx + 1) / total})`;
  }
  if (tutStepCounter) tutStepCounter.textContent = `${pad2(activeSlideIdx + 1)} / ${pad2(total)}`;
  if (tutDeckLabel) tutDeckLabel.textContent = deck.label;
  if (tutSlideTitle) tutSlideTitle.textContent = slide.title;
  if (tutSlideBody) tutSlideBody.innerHTML = slide.body;
  if (tutSlideCaption) tutSlideCaption.textContent = slide.caption;

  if (tutPanelTop && !prefersReducedMotion) {
    tutPanelTop.classList.remove('anim-fade');
    void tutPanelTop.offsetWidth;
    tutPanelTop.classList.add('anim-fade');
  }

  if (tutSlideImg) {
    tutSlideImg.src = slide.img;
    tutSlideImg.alt = slide.alt;
    if (!prefersReducedMotion) {
      tutSlideImg.classList.remove('anim-next', 'anim-prev');
      void tutSlideImg.offsetWidth;
      tutSlideImg.classList.add(direction === 'prev' ? 'anim-prev' : 'anim-next');
    }
  }

  // Preload adjacent slide image for instantaneous next/prev flip
  if (deck.slides[activeSlideIdx + 1]) {
    const preload = new Image();
    preload.src = deck.slides[activeSlideIdx + 1].img;
  }

  if (tutPrevBtn) tutPrevBtn.disabled = activeSlideIdx === 0;
  if (tutNextBtn && tutNextLbl) {
    const isLast = activeSlideIdx === total - 1;
    if (isLast && activeDeckKey === 'instalar') {
      tutNextBtn.disabled = false;
      tutNextLbl.textContent = 'Ir para Como usar';
    } else if (isLast && activeDeckKey === 'usar') {
      tutNextBtn.disabled = false;
      tutNextLbl.textContent = 'Reiniciar slides';
    } else {
      tutNextBtn.disabled = false;
      tutNextLbl.textContent = 'Próximo';
    }
  }

  if (tutDotsEl) {
    tutDotsEl.innerHTML = deck.slides
      .map(
        (s, idx) =>
          `<button class="tut-dot" role="tab" aria-selected="${idx === activeSlideIdx}" data-go-slide="${idx}" title="${s.title}" type="button">${pad2(idx + 1)}</button>`
      )
      .join('');
    tutDotsEl.querySelectorAll('[data-go-slide]').forEach((dot) => {
      dot.addEventListener('click', () => {
        const nextIdx = Number(dot.getAttribute('data-go-slide')) || 0;
        const dir = nextIdx < activeSlideIdx ? 'prev' : 'next';
        activeSlideIdx = nextIdx;
        renderTutorialSlide(dir);
      });
    });
  }

  syncLightbox();
}

function selectTutorialDeck(key, slideIndex = 0) {
  if (!tutorialDecks[key]) return;
  activeDeckKey = key;
  activeSlideIdx = slideIndex;
  if (deckTabGroup) {
    deckTabGroup.querySelectorAll('.sliding-tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.getAttribute('data-deck') === key));
    });
    positionPill(deckTabGroup);
  }
  renderTutorialSlide('next');
}

function stepTutorial(delta) {
  const deck = tutorialDecks[activeDeckKey];
  const total = deck.slides.length;
  if (delta > 0 && activeSlideIdx === total - 1) {
    if (activeDeckKey === 'instalar') {
      selectTutorialDeck('usar', 0);
    } else {
      activeSlideIdx = 0;
      renderTutorialSlide('next');
    }
    return;
  }
  if (delta < 0 && activeSlideIdx === 0) return;
  activeSlideIdx += delta;
  renderTutorialSlide(delta < 0 ? 'prev' : 'next');
}

if (deckTabGroup) {
  deckTabGroup.querySelectorAll('.sliding-tab').forEach((tab) => {
    tab.addEventListener('click', () => selectTutorialDeck(tab.getAttribute('data-deck'), 0));
  });
}
if (tutPrevBtn) tutPrevBtn.addEventListener('click', () => stepTutorial(-1));
if (tutNextBtn) tutNextBtn.addEventListener('click', () => stepTutorial(1));

// Deep links (#instalar / #usar and mobile sheet shortcuts)
document.querySelectorAll('[data-open-deck]').forEach((lnk) => {
  lnk.addEventListener('click', () => {
    selectTutorialDeck(lnk.getAttribute('data-open-deck'), 0);
  });
});

function syncHashDeck() {
  const h = window.location.hash.replace('#', '');
  if (h === 'usar') selectTutorialDeck('usar', 0);
  else if (h === 'instalar') selectTutorialDeck('instalar', 0);
}
window.addEventListener('hashchange', syncHashDeck);

// Lightbox Open / Close
function openLightbox() {
  if (!lightbox) return;
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  syncLightbox();
}
function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
if (tutZoomTrigger) tutZoomTrigger.addEventListener('click', openLightbox);
if (lightbox) {
  lightbox.querySelectorAll('[data-lb-close]').forEach((el) => el.addEventListener('click', closeLightbox));
}
if (lbPrev) lbPrev.addEventListener('click', () => stepTutorial(-1));
if (lbNext) lbNext.addEventListener('click', () => stepTutorial(1));

// Keyboard arrows (when Lightbox is open or Tutorial stage is in view)
window.addEventListener('keydown', (e) => {
  if (lightbox && lightbox.classList.contains('open')) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') stepTutorial(1);
    else if (e.key === 'ArrowLeft') stepTutorial(-1);
    return;
  }
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const tutSec = document.getElementById('tutoriais');
  if (!tutSec) return;
  const rect = tutSec.getBoundingClientRect();
  const inView = rect.top < window.innerHeight * 0.7 && rect.bottom > window.innerHeight * 0.25;
  if (inView && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    stepTutorial(e.key === 'ArrowRight' ? 1 : -1);
  }
});

// Touch Swipe Gestures (Viewport & Lightbox)
function attachSwipe(el) {
  if (!el) return;
  let startX = 0;
  let startY = 0;
  el.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || !e.touches[0]) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );
  el.addEventListener(
    'touchend',
    (e) => {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        stepTutorial(dx < 0 ? 1 : -1);
      }
    },
    { passive: true }
  );
}
attachSwipe(tutViewport);
attachSwipe(lightbox);

// Initial render
selectTutorialDeck(window.location.hash === '#usar' ? 'usar' : 'instalar', 0);

// ── 8. Interactive MIT + AI Office Personalization Prompt Builder ────────────
const mitCatalog = {
  whitelabel: {
    label: 'White-label do escritório',
    spec: '- White-label: substitua o nome, paleta de cores e ícones (icons/icon16/48/128.png) em extension/manifest.json, extension/content/content.js e extension/welcome/welcome.html pela identidade visual do meu escritório.'
  },
  cloud: {
    label: 'Pasta sincronizada OneDrive / SharePoint',
    spec: '- Pasta na nuvem: ajuste extension/background/service-worker.js para salvar os arquivos no subdiretório sincronizado do escritório usando o padrão "{CPF} - {NOME DO CLIENTE}" sem caracteres inválidos.'
  },
  crm: {
    label: 'Padrão de nome do CRM jurídico',
    spec: '- Nomenclatura CRM: adapte a função de renomeação dos PDFs em extension/content/content.js para gerar nomes compatíveis com meu CRM (ex.: Astrea / Advbox / PJe) mantendo data, banco e número do contrato.'
  },
  alerts: {
    label: 'Alertas jurídicos de Teto & RMC/RCC',
    spec: '- Alertas jurídicos: adicione indicadores visuais no painel (extension/content/content.js) e colunas extras em extension/content/csv-utils.js destacando contratos RMC/RCC ativos e rubricas críticas do HISCRE (216, 217, 322).'
  },
  webhook: {
    label: 'Integração Webhook n8n / Google Sheets',
    spec: '- Webhook / Planilha: adicione uma opção opcional (desligada por padrão) em extension/background/service-worker.js para enviar apenas o JSON resumido do lote concluído para o webhook interno (n8n / Make / Google Sheets) do escritório.'
  },
  report: {
    label: 'Pré-análise jurídica com IA',
    spec: '- Pré-análise IA: amplie extension/skill-ia/SKILL.md com um passo pós-extração que lê Resumo dos contratos.csv e o CSV do HISCRE para produzir um relatório de triagem e viabilidade para revisão do advogado.'
  }
};

const mitCards = Array.from(document.querySelectorAll('[data-mit-key]'));
const mitOutputEl = document.getElementById('mit-prompt-output');
const mitCountEl = document.getElementById('mit-selected-count');
let currentMitPrompt = '';

function renderMitPrompt() {
  const selectedKeys = mitCards
    .filter((c) => c.classList.contains('is-selected'))
    .map((c) => c.getAttribute('data-mit-key'))
    .filter((k) => mitCatalog[k]);

  const count = selectedKeys.length;
  if (mitCountEl) {
    mitCountEl.textContent =
      count === 0 ? 'Selecione 1+ opção' : count === 1 ? '1 selecionada' : `${count} selecionadas`;
  }

  const lines = selectedKeys.length
    ? selectedKeys.map((k) => mitCatalog[k].spec).join('\n')
    : '- Escolha ao menos uma adaptação ao lado para montar seu prompt técnico sob medida.';

  currentMitPrompt = `Estou usando o repositório open source INSS Extractor by FonCK (Licença MIT) na pasta extension/.\n\nQuero personalizar a extensão para o fluxo interno do meu escritório mantendo 100% da execução local e sem coletar senhas do gov.br:\n\n${lines}\n\nRegras:\n1. Preserve os créditos da licença MIT e a compatibilidade com Manifest V3 (Chrome/Edge).\n2. Liste exatamente os arquivos alterados e valide a sintaxe JS ao concluir.`;

  if (mitOutputEl) {
    mitOutputEl.textContent = currentMitPrompt;
    mitOutputEl.style.animation = 'none';
    void mitOutputEl.offsetWidth;
    mitOutputEl.style.animation = '';
  }
}

mitCards.forEach((card) => {
  card.addEventListener('click', () => {
    const next = !card.classList.contains('is-selected');
    card.classList.toggle('is-selected', next);
    card.setAttribute('aria-pressed', String(next));
    renderMitPrompt();
  });
});
renderMitPrompt();

// ── 9. Unified Scroll Optimization (Progress + Active Nav + Story Sync + Words)
const progressBar = document.getElementById('scroll-progress');
const heroFrame = document.getElementById('hero-app-frame');
const navLinks = Array.from(document.querySelectorAll('.nav-link'));
const navEl = document.querySelector('.nav');
const trackedSections = ['tutoriais', 'impacto', 'ia', 'personalizar', 'seguranca', 'consultoria']
  .map((id) => ({ id, el: document.getElementById(id) }))
  .filter((item) => item.el);
const scrollStatement = document.querySelector('[data-scroll-words]');
const statementWords = scrollStatement ? Array.from(scrollStatement.querySelectorAll('.w')) : [];

// Progressive Scroll Reveals
const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
if (!prefersReducedMotion && 'IntersectionObserver' in window && revealEls.length) {
  document.documentElement.classList.add('has-reveal');
  const revealIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          revealIo.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  revealEls.forEach((el) => revealIo.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-revealed'));
}

let scrollRaf = 0;

function onScrollFrame() {
  scrollRaf = 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

  // 1. Reading progress hairline & dynamic navbar elevation
  if (navEl) navEl.classList.toggle('is-scrolled', scrollY > 18);
  if (progressBar) {
    progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollY / maxScroll))})`;
  }

  // 2. Active navigation underline
  let currentId = '';
  const probeY = scrollY + window.innerHeight * 0.34;
  for (const sec of trackedSections) {
    if (sec.el.offsetTop <= probeY) currentId = sec.id;
  }
  navLinks.forEach((link) => {
    link.classList.toggle('is-current', link.getAttribute('href') === `#${currentId}`);
  });

  // 3. Subtle hero frame scroll depth
  if (heroFrame && !prefersReducedMotion && window.innerWidth > 900) {
    const t = Math.min(1, Math.max(0, scrollY / 560));
    heroFrame.style.transform = `translate3d(0, ${(t * -12).toFixed(1)}px, 0) scale(${(1 - t * 0.012).toFixed(4)})`;
  } else if (heroFrame) {
    heroFrame.style.transform = '';
  }

  // 4. Scroll-linked word highlight on inverse AI peak band
  if (scrollStatement && statementWords.length) {
    if (prefersReducedMotion) {
      statementWords.forEach((w) => w.classList.add('lit'));
    } else {
      const rect = scrollStatement.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const start = vh * 0.92;
      const end = vh * 0.34;
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
      const litCount = Math.round(progress * statementWords.length);
      statementWords.forEach((w, idx) => w.classList.toggle('lit', idx < litCount));
    }
  }
}

function scheduleScrollUpdate() {
  if (!scrollRaf) scrollRaf = window.requestAnimationFrame(onScrollFrame);
}

window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
window.addEventListener('resize', scheduleScrollUpdate, { passive: true });
onScrollFrame();

// ── 10. AI Automation Prompts & Copy Actions ─────────────────────────────────
const aiPrompts = {
  claude: `# Use o arquivo skill-ia/SKILL.md incluso no .zip (ou envie este comando):

Na aba meu.inss.gov.br já logada, opere a extensão INSS Extractor by FonCK pela ponte local window.EXTRATOR_MEU_INSS sem clicar manualmente nos menus:

1. Verifique a sessão: await window.EXTRATOR_MEU_INSS.getState()
2. Se isLoggedIn for false, pause e aguarde eu concluir o login no gov.br.
3. Com a sessão ativa, execute:
   - await window.EXTRATOR_MEU_INSS.openPanel()
   - await window.EXTRATOR_MEU_INSS.runAll()
4. Acompanhe getState() a cada 5 segundos até running === false.
5. Se houver erros (summary.error > 0), rode uma retentativa:
   await window.EXTRATOR_MEU_INSS.runContracts({ onlyErrors: true })
6. Ao terminar, informe a pasta salva e o resumo dos arquivos.`,
  chatgpt: `Você vai operar a extensão INSS Extractor by FonCK na aba https://meu.inss.gov.br/ usando window.EXTRATOR_MEU_INSS, sem clicar manualmente na interface.

Regras:
- Nunca peça ou digite minha senha do gov.br nem tente resolver CAPTCHA. Se isLoggedIn for false, aguarde eu entrar.
- Assim que eu estiver logado, execute na página:
  const st = await window.EXTRATOR_MEU_INSS.openPanel();
  if (st.contractsCount === 0 && st.beneficios[0]) {
    await window.EXTRATOR_MEU_INSS.loadContracts(st.beneficios[0].nb);
  }
  await window.EXTRATOR_MEU_INSS.runAll();
- Consulte await window.EXTRATOR_MEU_INSS.getState() a cada 5s até running === false.
- Se phase === "captcha_required", pause para eu resolver o reCAPTCHA e depois chame runExtrato().
- Se restar summary.error > 0, rode runContracts({ onlyErrors: true }).
- Ao concluir, informe downloadBaseFolder e o resumo final.`
};

let activeAi = 'claude';
const aiPre = document.getElementById('ai-prompt-pre');
if (aiPre) aiPre.textContent = aiPrompts.claude;

const aiGroup = document.querySelector('[data-tab-group="ai"]');
if (aiGroup) {
  const tabs = aiGroup.querySelectorAll('.sliding-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeAi = tab.getAttribute('data-ai') || 'claude';
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      positionPill(aiGroup);
      if (aiPre) aiPre.textContent = aiPrompts[activeAi];
    });
  });
}

// ── 11. Tactile Sonner-Style Toast Stack (transitions.dev #22 & #10) ─────────
const toastStack = document.getElementById('toast-stack');

function showToast({ title, detail = '', actionLabel = '', onAction = null, duration = 3800 }) {
  if (!toastStack) return;
  const el = document.createElement('div');
  el.className = 't-toast';
  el.innerHTML = `
    <span class="t-toast-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>
    </span>
    <div class="t-toast-body">
      <strong>${title}</strong>
      ${detail ? `<span>${detail}</span>` : ''}
    </div>
    ${actionLabel ? `<button class="t-toast-act" type="button">${actionLabel}</button>` : ''}
  `;

  if (actionLabel && typeof onAction === 'function') {
    const actBtn = el.querySelector('.t-toast-act');
    if (actBtn) {
      actBtn.addEventListener('click', () => {
        onAction();
        dismiss();
      });
    }
  }

  // Keep at most 2 visible toasts
  while (toastStack.children.length >= 2) {
    toastStack.firstElementChild.remove();
  }
  toastStack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-open'));

  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 280);
  };
  setTimeout(dismiss, duration);
}

// Post-download onboarding toast
document.querySelectorAll('[data-dl-ext]').forEach((lnk) => {
  lnk.addEventListener('click', () => {
    showToast({
      title: 'Download iniciado · v2.4.0 (.zip)',
      detail: 'Extraia a pasta e siga os slides de instalação em 1 minuto.',
      actionLabel: 'Ver slides →',
      duration: 5200,
      onAction: () => {
        selectTutorialDeck('instalar', 0);
        const sec = document.getElementById('tutoriais');
        if (sec) sec.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    });
  });
});

function bindCopyButton(buttonEl, getText, defaultText, toastTitle, toastDetail) {
  if (!buttonEl) return;
  const span = buttonEl.querySelector('span') || buttonEl;
  buttonEl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      span.textContent = 'Copiado ✓';
      showToast({ title: toastTitle, detail: toastDetail });
      setTimeout(() => {
        span.textContent = defaultText;
      }, 1900);
    } catch {
      span.textContent = 'Selecione e copie';
      setTimeout(() => {
        span.textContent = defaultText;
      }, 1900);
    }
  });
}

bindCopyButton(
  document.getElementById('btn-copy-ai'),
  () => aiPrompts[activeAi],
  'Copiar instruções',
  'Instruções de IA copiadas',
  'Cole no Claude ou ChatGPT com o Meu INSS aberto.'
);
bindCopyButton(
  document.getElementById('btn-copy-mit'),
  () => currentMitPrompt,
  'Copiar prompt para IA',
  'Prompt MIT personalizado copiado',
  'Cole no Claude, ChatGPT ou Cursor com a pasta extension/.'
);
bindCopyButton(
  document.getElementById('btn-copy-pix-key'),
  () => PIX_KEY,
  'Copiar chave Pix',
  'Chave Pix copiada',
  '+55 21 96484-2518 · Gabriel Fonseca (NG.CASH)'
);

// ── 12. Interactive Before/After Drag Curtain + Office ROI Calculator ────────
const curtainStage = document.getElementById('compare-curtain');
const curtainHandle = document.getElementById('curtain-handle');
const curtainChips = Array.from(document.querySelectorAll('[data-curtain-to]'));
let curtainPct = 52;

function setCurtain(pct, animate = false) {
  curtainPct = Math.max(8, Math.min(92, pct));
  if (!curtainStage) return;
  curtainStage.classList.toggle('is-gliding', animate && !prefersReducedMotion);
  curtainStage.style.setProperty('--split', `${curtainPct.toFixed(1)}%`);
  if (curtainHandle) curtainHandle.setAttribute('aria-valuenow', String(Math.round(curtainPct)));
  curtainChips.forEach((chip) => {
    const target = Number(chip.getAttribute('data-curtain-to')) || 52;
    chip.classList.toggle('is-active', Math.abs(target - curtainPct) < 12);
  });
}

if (curtainStage) {
  let dragging = false;
  const updateFromClientX = (clientX) => {
    const rect = curtainStage.getBoundingClientRect();
    const pct = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setCurtain(pct, false);
  };
  curtainStage.addEventListener('pointerdown', (e) => {
    dragging = true;
    curtainStage.classList.add('is-dragging');
    curtainStage.classList.remove('is-gliding');
    try { curtainStage.setPointerCapture(e.pointerId); } catch {}
    updateFromClientX(e.clientX);
  });
  curtainStage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    curtainStage.classList.remove('is-dragging');
  };
  curtainStage.addEventListener('pointerup', endDrag);
  curtainStage.addEventListener('pointercancel', endDrag);
}

if (curtainHandle) {
  curtainHandle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setCurtain(curtainPct - 6, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCurtain(curtainPct + 6, true); }
  });
}

curtainChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const target = Number(chip.getAttribute('data-curtain-to')) || 52;
    setCurtain(target, true);
  });
});

// Office Time-Saved Calculator
const roiInput = document.getElementById('roi-clients');
const roiClientsPill = document.getElementById('roi-clients-pill');
const roiHoursEl = document.getElementById('roi-hours');
const roiClicksEl = document.getElementById('roi-clicks');
const roiInsightEl = document.getElementById('roi-insight');

function updateRoiCalculator() {
  if (!roiInput) return;
  const clients = Number(roiInput.value) || 30;
  const hours = Math.max(1, Math.round((clients * 41) / 60));
  const clicks = clients * 60;
  const days = (hours / 8).toFixed(1).replace('.', ',');

  if (roiClientsPill) roiClientsPill.textContent = `${clients} clientes`;
  if (roiHoursEl) roiHoursEl.textContent = `${hours}h`;
  if (roiClicksEl) roiClicksEl.textContent = clicks.toLocaleString('pt-BR');
  if (roiInsightEl) {
    roiInsightEl.innerHTML = `Equivale a cerca de <b>${days} dias úteis</b> liberados todo mês para sua equipe focar em análise jurídica.`;
  }
}
if (roiInput) {
  roiInput.addEventListener('input', updateRoiCalculator);
  updateRoiCalculator();
}

// ── 13. Command Palette (Ctrl+K / ⌘K) ────────────────────────────────────────
const cmdkModal = document.getElementById('cmdk-modal');
const cmdkInput = document.getElementById('cmdk-input');
const cmdkList = document.getElementById('cmdk-list');
const btnCmdk = document.getElementById('btn-cmdk');

const cmdkCommands = [
  {
    id: 'download',
    title: 'Baixar extensão (.zip v2.4.0)',
    sub: 'Download direto · Chrome e Microsoft Edge',
    tag: 'Download',
    keys: 'baixar download zip extensao instalar',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    run: () => {
      const dl = document.querySelector('[data-dl-ext]');
      if (dl) dl.click();
    }
  },
  {
    id: 'simulate',
    title: 'Simular extração ao vivo',
    sub: 'Ver contratos renomeados e separados em tempo real',
    tag: 'Demo',
    keys: 'simular extracao demo testar preview hero',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    run: () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      setTimeout(() => runInteractiveSimulation(0, true), 260);
    }
  },
  {
    id: 'tut-install',
    title: 'Tutorial: Como instalar (9 slides)',
    sub: 'Passo a passo ilustrado para Chrome e Edge',
    tag: 'Slides',
    keys: 'instalar tutorial slides extensoes chrome edge',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    run: () => {
      selectTutorialDeck('instalar', 0);
      const sec = document.getElementById('tutoriais');
      if (sec) sec.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  },
  {
    id: 'tut-use',
    title: 'Tutorial: Como usar no Meu INSS (5 slides)',
    sub: 'Login gov.br, opções de extração e pasta final',
    tag: 'Slides',
    keys: 'usar uso tutorial slides meu inss contratos hiscre',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    run: () => {
      selectTutorialDeck('usar', 0);
      const sec = document.getElementById('tutoriais');
      if (sec) sec.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  },
  {
    id: 'impacto',
    title: 'Comparar Antes vs. Depois + Calculadora',
    sub: 'Arraste a cortina e calcule horas economizadas no mês',
    tag: 'ROI',
    keys: 'antes depois comparar cortina calculadora horas tempo',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 3 12 9 6"/><polyline points="15 6 21 12 15 18"/></svg>',
    run: () => {
      const sec = document.getElementById('impacto');
      if (sec) sec.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  },
  {
    id: 'mit',
    title: 'Personalizar com IA (Licença MIT)',
    sub: 'Gerar prompt sob medida para seu escritório',
    tag: 'MIT + IA',
    keys: 'mit personalizar ia claude chatgpt escritorio prompt white label',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    run: () => {
      const sec = document.getElementById('personalizar');
      if (sec) sec.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }
  },
  {
    id: 'pix',
    title: 'Copiar chave Pix (NG.CASH)',
    sub: '+55 21 96484-2518 · Apoio voluntário',
    tag: 'Pix',
    keys: 'pix apoiar doar qr ngcash chave',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    run: () => {
      const btn = document.getElementById('btn-copy-pix-key');
      if (btn) btn.click();
    }
  },
  {
    id: 'whatsapp',
    title: 'Falar no WhatsApp (Consultoria Gestão & IA)',
    sub: 'Ferramentas e agentes sob medida com Gabriel Fonseca',
    tag: 'Contato',
    keys: 'whatsapp consultoria contato gabriel fonseca gestao ia',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12.03 2C6.51 2 2.04 6.47 2.04 11.98c0 1.76.46 3.48 1.34 5L2 22l5.15-1.35a9.95 9.95 0 0 0 4.88 1.27h.01c5.51 0 9.99-4.47 9.99-9.98A9.98 9.98 0 0 0 12.03 2Zm5.82 14.12c-.25.7-1.43 1.34-1.99 1.42-.51.08-1.16.11-1.88-.12-.44-.14-1-.33-1.72-.64-3.02-1.3-4.99-4.35-5.14-4.55-.15-.2-1.23-1.63-1.23-3.11 0-1.48.78-2.21 1.05-2.51.28-.3.6-.38.8-.38h.58c.19 0 .44-.07.68.52.25.6.85 2.08.93 2.23.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.17-.31.39-.45.52-.15.15-.3.31-.13.61.18.3.78 1.29 1.68 2.09 1.15 1.03 2.13 1.35 2.43 1.5.3.15.48.12.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.28.1 1.76.83 2.06.98.3.15.5.22.58.35.07.12.07.72-.18 1.42Z"/></svg>',
    run: () => {
      window.open(
        'https://wa.me/5521964842518?text=Ol%C3%A1%20Gabriel!%20Conheci%20o%20INSS%20Extractor%20by%20FonCK%20e%20gostaria%20de%20conversar%20sobre%20consultoria%20em%20Gest%C3%A3o%20%26%20IA.',
        '_blank',
        'noopener'
      );
    }
  },
  {
    id: 'theme',
    title: 'Alternar tema Claro / Escuro',
    sub: 'Trocar entre Editorial Claro e Studio Obsidian',
    tag: 'Tema',
    keys: 'tema escuro claro dark light modo',
    icon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    run: () => {
      if (btnTheme) btnTheme.click();
    }
  }
];

let cmdkFiltered = cmdkCommands.slice();
let cmdkSelected = 0;

function renderCmdkList() {
  if (!cmdkList) return;
  if (!cmdkFiltered.length) {
    cmdkList.innerHTML = '<div class="cmdk-empty">Nenhum comando encontrado.</div>';
    return;
  }
  cmdkSelected = Math.max(0, Math.min(cmdkFiltered.length - 1, cmdkSelected));
  cmdkList.innerHTML = cmdkFiltered
    .map(
      (cmd, idx) => `
        <button class="cmdk-item" role="option" aria-selected="${idx === cmdkSelected}" data-cmd-idx="${idx}" type="button">
          <div class="cmdk-item-left">
            <span class="cmdk-item-ico" aria-hidden="true">${cmd.icon}</span>
            <div><strong>${cmd.title}</strong><small>${cmd.sub}</small></div>
          </div>
          <span class="cmdk-tag">${cmd.tag}</span>
        </button>
      `
    )
    .join('');

  cmdkList.querySelectorAll('[data-cmd-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-cmd-idx')) || 0;
      const cmd = cmdkFiltered[idx];
      closeCmdk();
      if (cmd) cmd.run();
    });
  });
}

function openCmdk() {
  if (!cmdkModal) return;
  cmdkModal.classList.add('open');
  cmdkModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (cmdkInput) {
    cmdkInput.value = '';
    cmdkFiltered = cmdkCommands.slice();
    cmdkSelected = 0;
    renderCmdkList();
    setTimeout(() => cmdkInput.focus(), 20);
  }
}

function closeCmdk() {
  if (!cmdkModal) return;
  cmdkModal.classList.remove('open');
  cmdkModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (btnCmdk) btnCmdk.addEventListener('click', openCmdk);
if (cmdkModal) {
  cmdkModal.querySelectorAll('[data-cmdk-close]').forEach((el) => el.addEventListener('click', closeCmdk));
}
if (cmdkInput) {
  cmdkInput.addEventListener('input', () => {
    const q = cmdkInput.value.trim().toLowerCase();
    cmdkFiltered = q
      ? cmdkCommands.filter((c) => `${c.title} ${c.sub} ${c.keys}`.toLowerCase().includes(q))
      : cmdkCommands.slice();
    cmdkSelected = 0;
    renderCmdkList();
  });
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (cmdkModal && cmdkModal.classList.contains('open')) closeCmdk();
    else openCmdk();
    return;
  }
  if (!cmdkModal || !cmdkModal.classList.contains('open')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCmdk();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdkSelected = (cmdkSelected + 1) % Math.max(1, cmdkFiltered.length);
    renderCmdkList();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdkSelected = (cmdkSelected - 1 + Math.max(1, cmdkFiltered.length)) % Math.max(1, cmdkFiltered.length);
    renderCmdkList();
  } else if (e.key === 'Enter' && cmdkFiltered[cmdkSelected]) {
    e.preventDefault();
    const cmd = cmdkFiltered[cmdkSelected];
    closeCmdk();
    cmd.run();
  }
});
