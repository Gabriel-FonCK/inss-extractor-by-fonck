// INSS Extractor by FonCK — Content Script (ISOLATED world)
// Renderiza o botão flutuante amarelo e o painel em Shadow DOM sobre meu.inss.gov.br.
// Orquestra consultas sequenciais (devagar, uma de cada vez) via page-bridge.js
// e salva os arquivos organizados em Downloads/Contratos INSS/<CLIENTE>/...

(function () {
  'use strict';

  if (window.__EXTRATOR_MEU_INSS_MOUNTED__) return;
  window.__EXTRATOR_MEU_INSS_MOUNTED__ = true;

  const CHANNEL_REQ = 'EXTRATOR_INSS_BRIDGE_REQ';
  const CHANNEL_RES = 'EXTRATOR_INSS_BRIDGE_RES';
  const DELAY_BETWEEN_REQUESTS_MS = 1100;
  const DELAY_BETWEEN_HISCRE_MS = 1500;
  const DELAY_EMPTY_HISCRE_MS = 550;
  const HISCRE_MIN_YEAR = 1994;
  const HISCRE_MIN_MONTH = 6; // Limite oficial mais antigo aceito pela API HISCRE do Meu INSS (06/1994)

  const MONTHS = [
    { value: 1, label: 'JANEIRO' },
    { value: 2, label: 'FEVEREIRO' },
    { value: 3, label: 'MARÇO' },
    { value: 4, label: 'ABRIL' },
    { value: 5, label: 'MAIO' },
    { value: 6, label: 'JUNHO' },
    { value: 7, label: 'JULHO' },
    { value: 8, label: 'AGOSTO' },
    { value: 9, label: 'SETEMBRO' },
    { value: 10, label: 'OUTUBRO' },
    { value: 11, label: 'NOVEMBRO' },
    { value: 12, label: 'DEZEMBRO' }
  ];
  const SHORT_MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // -------------------- Bridge Communication --------------------
  const pendingCalls = new Map();
  let reqSeq = 0;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL_RES || !data.id) return;
    const entry = pendingCalls.get(data.id);
    if (!entry) return;
    pendingCalls.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || 'Erro na comunicação com a página do Meu INSS.'));
  });

  function callBridge(action, payload = {}, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = `ext_${Date.now()}_${++reqSeq}`;
      const timer = setTimeout(() => {
        pendingCalls.delete(id);
        reject(new Error(`Tempo esgotado na ação ${action}.`));
      }, timeoutMs);
      pendingCalls.set(id, { resolve, reject, timer });
      window.postMessage({ channel: CHANNEL_REQ, id, action, payload }, window.location.origin);
    });
  }

  function downloadViaBackground(dataUrl, filename) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'EXTRATOR_DOWNLOAD', dataUrl, filename }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp || !resp.ok) {
          reject(new Error((resp && resp.error) || 'Falha ao salvar arquivo no navegador.'));
          return;
        }
        if (resp.filename && !state.savedFiles.includes(resp.filename)) {
          state.savedFiles.push(resp.filename);
        }
        resolve(resp);
      });
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // -------------------- Formatting & Helpers --------------------
  function sanitizeName(str) {
    return String(str || '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '');
  }

  function formatNb(nbDigits) {
    const d = String(nbDigits || '').replace(/\D+/g, '');
    if (d.length === 10) {
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    return d;
  }

  function formatDateIsoFolder(rawDate) {
    if (!rawDate) return '0000-00-00';
    const s = String(rawDate).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const brSlash = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brSlash) return `${brSlash[3]}-${brSlash[2]}-${brSlash[1]}`;
    const brDash = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (brDash) return `${brDash[3]}-${brDash[2]}-${brDash[1]}`;
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return sanitizeName(s) || '0000-00-00';
  }

  function formatContractShortDate(rawDate, fallbackCompetencia) {
    const iso = formatDateIsoFolder(rawDate);
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m && m[1] !== '0000') {
      const monthIdx = Number(m[2]) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${m[3]}${SHORT_MONTHS_PT[monthIdx]}${m[1].slice(-2)}`;
      }
    }
    const comp = String(fallbackCompetencia || '').replace(/\D+/g, '');
    if (/^(19|20)\d{4}$/.test(comp)) {
      const monthIdx = Number(comp.slice(4, 6)) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `01${SHORT_MONTHS_PT[monthIdx]}${comp.slice(2, 4)}`;
      }
    }
    return 'SemData';
  }

  function buildContractPdfFilename(rawDate, banco, numeroContrato, fallbackCompetencia) {
    const shortDate = formatContractShortDate(rawDate, fallbackCompetencia);
    const safeBanco = sanitizeName(banco || 'BANCO');
    const safeNumero = sanitizeName(String(numeroContrato || 'SEM_NUMERO').replace(/\//g, '-'));
    return `${sanitizeName(`${shortDate} - ${safeBanco} - ${safeNumero}`)}.pdf`;
  }

  function isNoCopyResponse(res) {
    if (!res) return false;
    if (res.status === 404 || res.status === 204 || res.status === 400 || res.status === 422) {
      return true;
    }
    if (res.ok && !res.isPdf && !res.jsonError) {
      return true;
    }
    // Alguns contratos excluídos/antigos fazem a Dataprev devolver HTTP 500 com mensagem textual de ausência de documento
    const msg = JSON.stringify(res.jsonError || '') + ' ' + String(res.errorText || '');
    if (/n[aã]o\s+encontrad|sem\s+c[oó]pia|inexistente|n[aã]o\s+possui|n[aã]o\s+dispon[ií]vel|documento\s+ausente/i.test(msg)) {
      return true;
    }
    return false;
  }

  async function fetchContratoDocWithRetry(payload, maxRetries = 2) {
    let lastRes = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (state.cancelRequested) break;
      try {
        const res = await callBridge('FETCH_CONTRATO_DOC', payload);
        lastRes = res;
        if (res.ok || isNoCopyResponse(res) || res.status === 401 || res.status === 403) {
          return res;
        }
        // Retry automático apenas para falhas transitórias (500, 502, 503, 504, 429)
        if (attempt < maxRetries && (res.status >= 500 || res.status === 429)) {
          await sleep(2500 * (attempt + 1));
          continue;
        }
        return res;
      } catch (err) {
        if (attempt < maxRetries) {
          await sleep(2500 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    return lastRes;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function buildTwelveMonthChunks(startYear, startMonth, endYear, endMonth) {
    // Limite oficial do Meu INSS: mínimo 06/1994 e máximo 12 meses por consulta
    let sy = startYear;
    let sm = startMonth;
    if (sy < 1994 || (sy === 1994 && sm < 6)) {
      sy = 1994;
      sm = 6;
    }

    const startTotal = sy * 12 + (sm - 1);
    const endTotal = endYear * 12 + (endMonth - 1);
    if (startTotal > endTotal) return [];

    const chunks = [];
    let cur = startTotal;
    while (cur <= endTotal) {
      const chunkEnd = Math.min(cur + 11, endTotal);
      const y1 = Math.floor(cur / 12);
      const m1 = (cur % 12) + 1;
      const y2 = Math.floor(chunkEnd / 12);
      const m2 = (chunkEnd % 12) + 1;

      chunks.push({
        startMonth: m1,
        startYear: y1,
        endMonth: m2,
        endYear: y2,
        dataInicioApi: `01-${pad2(m1)}-${y1}`,
        dataFimApi: `${pad2(lastDayOfMonth(y2, m2))}-${pad2(m2)}-${y2}`,
        label: `${pad2(m1)}-${y1} a ${pad2(m2)}-${y2}`,
        labelSlash: `${pad2(m1)}/${y1} a ${pad2(m2)}/${y2}`
      });
      cur = chunkEnd + 1;
    }
    return chunks;
  }

  function parseConsignadoPayload(raw, nbDigits) {
    if (!raw || typeof raw !== 'object') return { beneficioNome: '', contracts: [] };

    const ben = raw.beneficio || {};
    const beneficioNome = ben.nome || '';
    const contracts = [];
    const seenKeys = new Set();

    function pushContract(item, tipoLabel, categoryFolder, extraSuffix) {
      if (!item) return;
      const ifObj = item.ifConcessora || {};
      const sitObj = item.situacaoEmprestimo || {};
      const cbc = String(ifObj.codigo || item.cbc || '').trim();
      const banco = sanitizeName(ifObj.descricao || item.nomeIFConcessora || item.nomeIF || `BANCO ${cbc || 'DESCONHECIDO'}`);
      const numeroContrato = String(item.nuContrato || item.numeroEmprestimo || item.numeroContrato || '').trim();
      const situacao = sanitizeName(sitObj.descricao || item.descricaoSituacao || item.situacao || 'Indefinida');
      const dataInclusao = item.dtInclusao || item.dataInclusao || '';

      if (!numeroContrato) return;
      const dedupKey = `${cbc}|${numeroContrato}|${tipoLabel}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const datePrefix = formatDateIsoFolder(dataInclusao);
      const suffixPart = extraSuffix ? ` - ${extraSuffix}` : '';
      const folderName = sanitizeName(`${datePrefix} - ${banco} - ${numeroContrato} - ${situacao}${suffixPart}`);
      const compIni = item.competenciaIniDesconto || item.competenciaInicioDesconto || '';
      const contractPdfName = buildContractPdfFilename(dataInclusao, banco, numeroContrato, compIni);

      contracts.push({
        id: dedupKey,
        nb: nbDigits,
        cbc,
        banco,
        numeroContrato,
        tipoLabel,
        categoryFolder,
        extraSuffix: extraSuffix || '',
        situacao,
        dataInclusao,
        dateIso: datePrefix,
        competenciaInicioDesconto: compIni,
        competenciaFimDesconto: item.competenciaFimDesconto || '',
        quantidadeParcelas: item.qtTotalParcelas ?? item.quantidadeParcelas ?? '',
        valorParcela: item.valorParcela ?? item.valorReservado ?? item.valor ?? '',
        valorEmprestado: item.valorEmprestado ?? item.valorLimiteCartao ?? item.valorLimite ?? '',
        folderName,
        contractPdfName,
        downloadStatus: null // { state: 'ok'|'nocopy'|'error', label, detail, ... }
      });
    }

    (raw.listaEmprestimos || []).forEach((it) => pushContract(it, 'Empréstimo', 'Empréstimos', ''));
    (raw.listaRMC || []).forEach((it) => pushContract(it, 'Cartão RMC', 'Cartão RMC', 'Cartão RMC'));
    (raw.listaRCC || []).forEach((it) => pushContract(it, 'Cartão RCC', 'Cartão RCC', 'Cartão RCC'));
    (raw.listaRMA || []).forEach((it) => pushContract(it, 'Cartão RMA', 'Cartão RMA', 'Cartão RMA'));

    // Ordena do mais recente para o mais antigo (ou por número se sem data)
    contracts.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

    return { beneficioNome, contracts };
  }

  function findOldestDiscountStart(contracts) {
    let bestYear = null;
    let bestMonth = null;

    function consider(y, m) {
      if (!y || !m || y < 1994 || (y === 1994 && m < 6)) return;
      if (bestYear === null || y < bestYear || (y === bestYear && m < bestMonth)) {
        bestYear = y;
        bestMonth = m;
      }
    }

    for (const c of contracts) {
      const comp = String(c.competenciaInicioDesconto || '').replace(/\D+/g, '');
      if (comp.length === 6) {
        consider(Number(comp.slice(0, 4)), Number(comp.slice(4, 6)));
        continue;
      }
      const iso = String(c.dateIso || '').match(/^(\d{4})-(\d{2})-/);
      if (iso) {
        consider(Number(iso[1]), Number(iso[2]));
      }
    }

    return bestYear ? { year: bestYear, month: bestMonth } : null;
  }

  // -------------------- Application State --------------------
  const CFG = globalThis.FONCK_CONFIG || {
    brandName: 'INSS Extractor by FonCK',
    authorName: 'Gabriel Fonseca',
    siteUrl: 'https://inss-extractor-by-fonck-site.vercel.app/',
    githubRepoUrl: 'https://github.com/Gabriel-FonCK/inss-extractor-by-fonck',
    linkedinUrl: 'https://www.linkedin.com/in/fonck',
    whatsappUrl: 'https://wa.me/5521964842518',
    whatsappDisplay: '(21) 96484-2518'
  };

  const now = new Date();
  const state = {
    open: false,
    theme: 'light', // 'light' (Editorial Paper) | 'dark' (Studio Obsidian)
    activeTab: 'contratos', // 'contratos' | 'extrato'
    session: null,
    clientName: '',
    nb: '',
    contracts: [],
    loadingContracts: false,
    contractsError: '',
    opts: {
      contratoPdf: true,
      documentoOficial: true,
      biometriaFacial: true,
      planilhaResumo: true,
      listaPendentesTxt: true,
      extratoConsignadoPdf: false,
      hiscrePdfUnico: true,
      hiscrePlanilhaExcel: true,
      hiscrePdfsSeparados: true
    },
    period: {
      startMonth: HISCRE_MIN_MONTH,
      startYear: HISCRE_MIN_YEAR,
      endMonth: now.getMonth() + 1,
      endYear: now.getFullYear()
    },
    running: false,
    phase: 'idle', // 'idle' | 'loading' | 'running' | 'captcha_required' | 'completed' | 'error'
    cancelRequested: false,
    progressTitle: '',
    progressStatus: '',
    progressPct: 0,
    bannerNotice: null, // { type: 'info'|'ok'|'warn'|'error', text }
    filterErrorsOnly: false,
    savedFiles: []
  };

  // -------------------- Shadow DOM UI (Editorial Minimalist · Claro & Escuro) --------------------
  const hostEl = document.createElement('div');
  hostEl.id = 'extrator-meu-inss-host';
  hostEl.setAttribute('data-theme', 'light');
  hostEl.style.cssText = 'all:initial;position:fixed;z-index:2147483645;bottom:0;right:0;pointer-events:none;';
  document.documentElement.appendChild(hostEl);
  const shadow = hostEl.attachShadow({ mode: 'open' });

  function applyTheme(theme) {
    const mode = theme === 'dark' ? 'dark' : 'light';
    state.theme = mode;
    hostEl.setAttribute('data-theme', mode);
  }

  function toggleTheme() {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ extratorTheme: next });
      }
    } catch {
      // ignore storage errors
    }
    render();
  }

  try {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['extratorTheme'], (res) => {
        if (res && res.extratorTheme) {
          applyTheme(res.extratorTheme);
          render();
        }
      });
      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.extratorTheme && changes.extratorTheme.newValue) {
            applyTheme(changes.extratorTheme.newValue);
            render();
          }
        });
      }
    }
  } catch {
    // ignore storage errors
  }

  const STYLES = `
    :host {
      --bg: #f6f7f9;
      --branco: #ffffff;
      --off: #f6f7f9;
      --off-profundo: #edf0f5;
      --tinta: #101218;
      --grafite: #555b69;
      --cinza: #7c8394;
      --linha: #dfe3ec;
      --linha-forte: #101218;
      --accent: #2456d6;
      --pri-bg: #101218;
      --pri-fg: #f6f7f9;
      --pri-hover: #252936;
      --fab-bg: #101218;
      --fab-fg: #f6f7f9;
      --fab-accent: #5e8bff;
      --ok: #15803d;
      --ok-fundo: #eaf8ef;
      --alerta: #875900;
      --alerta-fundo: #fbf4e4;
      --erro: #b42318;
      --erro-fundo: #fdf1ef;
      --shadow-panel: 0 28px 70px -24px rgba(16, 18, 24, 0.34);
      --shadow-fab: 0 14px 32px -10px rgba(16, 18, 24, 0.45);
      --serif: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--tinta);
      font-size: 13.2px;
      line-height: 1.46;
    }
    :host([data-theme="dark"]) {
      --bg: #0a0b0f;
      --branco: #12141b;
      --off: #0e1016;
      --off-profundo: #1a1d27;
      --tinta: #f3f5fa;
      --grafite: #9ca3b5;
      --cinza: #6f7688;
      --linha: #252936;
      --linha-forte: #394052;
      --accent: #5e8bff;
      --pri-bg: #f3f5fa;
      --pri-fg: #0a0b0f;
      --pri-hover: #dde3f0;
      --fab-bg: #12141b;
      --fab-fg: #f3f5fa;
      --fab-accent: #5e8bff;
      --ok: #4ade80;
      --ok-fundo: #12291c;
      --alerta: #f3c86b;
      --alerta-fundo: #292112;
      --erro: #fca5a5;
      --erro-fundo: #2c1517;
      --shadow-panel: 0 30px 76px -20px rgba(0, 0, 0, 0.72);
      --shadow-fab: 0 14px 34px -10px rgba(0, 0, 0, 0.65);
    }
    * { box-sizing: border-box; }
    button, input, select { font: inherit; color: inherit; }

    .fab {
      pointer-events: auto;
      position: fixed;
      right: 22px;
      bottom: 22px;
      background: var(--fab-bg);
      color: var(--fab-fg);
      border: 1px solid var(--fab-accent);
      border-radius: 999px;
      padding: 10px 18px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.01em;
      display: inline-flex;
      align-items: center;
      gap: 9px;
      cursor: pointer;
      box-shadow: var(--shadow-fab);
      transition: transform 0.16s ease, opacity 0.16s ease;
    }
    .fab:hover { transform: translateY(-2px); opacity: 0.96; }
    .fab svg { width: 15px; height: 15px; flex: none; color: var(--fab-accent); }

    .panel {
      pointer-events: auto;
      position: fixed;
      right: 22px;
      bottom: 74px;
      width: 416px;
      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 96px);
      background: var(--branco);
      border: 1px solid var(--linha-forte);
      border-radius: 14px;
      box-shadow: var(--shadow-panel);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .panel.hidden { display: none; }

    .panel-hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 13px 16px;
      border-bottom: 1px solid var(--linha);
      background: var(--off);
    }
    .panel-tit {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .tit-stack {
      display: flex;
      flex-direction: column;
      line-height: 1.12;
    }
    .tit-eyebrow {
      font-size: 9px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }
    .tit-name {
      font-family: var(--serif);
      font-size: 16.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .ico-circle {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      overflow: hidden;
      display: grid;
      place-items: center;
      flex: none;
    }
    .ico-circle img { width: 28px; height: 28px; display: block; }
    .ico-circle svg { width: 14px; height: 14px; color: var(--accent); }

    .hdr-actions { display: flex; gap: 4px; }
    .icon-btn {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      display: grid;
      place-items: center;
      color: var(--grafite);
      font-size: 14px;
      line-height: 1;
    }
    .icon-btn:hover { background: var(--off-profundo); color: var(--tinta); border-color: var(--linha); }

    .panel-body {
      padding: 14px 16px 15px;
      display: grid;
      gap: 11px;
      overflow-y: auto;
    }

    .field-row { display: grid; gap: 4px; }
    .field-row label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--grafite);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .field-grid-2 { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }

    input[type="text"], select {
      width: 100%;
      border: 1px solid var(--linha);
      border-radius: 8px;
      padding: 7px 10px;
      background: var(--off);
      color: var(--tinta);
      font-weight: 500;
      font-size: 12.8px;
    }
    input[type="text"]:focus, select:focus {
      outline: none;
      border-color: var(--tinta);
      background: var(--branco);
    }

    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--off-profundo);
      border: 1px solid var(--linha);
      border-radius: 9px;
      padding: 3px;
      gap: 3px;
    }
    .tab-btn {
      padding: 7px 6px;
      border-radius: 6px;
      border: 0;
      background: transparent;
      color: var(--grafite);
      font-weight: 600;
      font-size: 12.6px;
      cursor: pointer;
      transition: background 0.14s ease, color 0.14s ease;
    }
    .tab-btn.active {
      background: var(--branco);
      color: var(--tinta);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    .info-box {
      border: 1px solid var(--linha);
      border-radius: 8px;
      padding: 8px 10px;
      background: var(--off);
      font-size: 12.2px;
      color: var(--tinta);
    }
    .info-box.ok { background: var(--ok-fundo); border-color: transparent; color: var(--ok); }
    .info-box.warn { background: var(--alerta-fundo); border-color: transparent; color: var(--alerta); }
    .info-box.error { background: var(--erro-fundo); border-color: transparent; color: var(--erro); }

    .checks {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px 10px;
    }
    .checks.single { grid-template-columns: 1fr; }
    .chk {
      display: flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
      user-select: none;
      font-size: 12.6px;
    }
    .chk input[type="checkbox"] {
      width: 14px;
      height: 14px;
      accent-color: var(--accent);
      cursor: pointer;
      margin: 0;
      flex: none;
    }

    .btn-primary {
      width: 100%;
      background: var(--pri-bg);
      color: var(--pri-fg);
      border: 1px solid var(--pri-bg);
      border-radius: 8px;
      padding: 9.5px 12px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition: background 0.14s ease, opacity 0.14s ease;
    }
    .btn-primary:hover:not(:disabled) { background: var(--pri-hover); }
    .btn-primary:disabled { opacity: 0.42; cursor: not-allowed; }

    .btn-secondary {
      width: 100%;
      background: transparent;
      color: var(--tinta);
      border: 1px solid var(--linha);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 12.6px;
      cursor: pointer;
    }
    .btn-secondary:hover:not(:disabled) { background: var(--off-profundo); border-color: var(--tinta); }
    .btn-secondary:disabled { opacity: 0.42; cursor: not-allowed; }

    .btn-small {
      background: var(--branco);
      color: var(--tinta);
      border: 1px solid var(--linha);
      border-radius: 7px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-small:hover:not(:disabled) { background: var(--off-profundo); border-color: var(--tinta); }
    .btn-small:disabled { opacity: 0.42; cursor: not-allowed; }

    .btn-danger {
      background: var(--erro-fundo);
      color: var(--erro);
      border: 1px solid transparent;
      border-radius: 7px;
      padding: 6px 10px;
      font-size: 11.8px;
      font-weight: 700;
      cursor: pointer;
    }

    .periodo-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .periodo-pair {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 5px;
    }

    .link-btn {
      background: none;
      border: 0;
      padding: 0;
      color: var(--accent);
      text-decoration: underline;
      font-size: 11.8px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
    }

    .progress-wrap { display: grid; gap: 6px; }
    .progress-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.2px;
      gap: 8px;
    }
    .progress-bar {
      height: 5px;
      border-radius: 999px;
      background: var(--off-profundo);
      overflow: hidden;
    }
    .progress-bar i {
      display: block;
      height: 100%;
      background: var(--accent);
      transition: width 0.2s ease;
    }

    .results-hdr {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .contract-list {
      border: 1px solid var(--linha);
      border-radius: 8px;
      overflow: hidden;
      background: var(--off);
      max-height: 205px;
      overflow-y: auto;
    }
    .contract-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border-top: 1px solid var(--linha);
      font-size: 12.2px;
    }
    .contract-item:first-child { border-top: 0; }
    .contract-meta { min-width: 0; }
    .contract-meta b {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .contract-meta small { color: var(--grafite); display: block; font-size: 11.2px; }

    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .pill.ok { color: var(--ok); background: var(--ok-fundo); }
    .pill.nocopy { color: var(--alerta); background: var(--alerta-fundo); }
    .pill.error { color: var(--erro); background: var(--erro-fundo); }
    .pill.pending { color: var(--grafite); background: var(--off-profundo); border-color: var(--linha); }

    .foot-note {
      font-size: 11.2px;
      color: var(--grafite);
      border-top: 1px solid var(--linha);
      padding-top: 9px;
      display: grid;
      gap: 6px;
    }
    .foot-links {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
    }
    .foot-ico-bar {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .foot-ico-btn {
      width: 25px;
      height: 25px;
      border-radius: 6px;
      border: 1px solid var(--linha);
      background: var(--off);
      color: var(--grafite);
      display: grid;
      place-items: center;
      text-decoration: none;
      transition: color 0.14s ease, border-color 0.14s ease, background 0.14s ease;
    }
    .foot-ico-btn:hover { color: var(--tinta); border-color: var(--tinta); background: var(--off-profundo); }
    .foot-ico-btn svg { width: 13px; height: 13px; }
  `;

  const APP_ICON_URL =
    typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('icons/icon48.png')
      : '';
  const DOWNLOAD_SVG = APP_ICON_URL
    ? `<img src="${APP_ICON_URL}" alt="" style="width:20px;height:20px;border-radius:5px;display:block;flex:none">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"></path><path d="M7 10.5l5 5 5-5"></path><path d="M4.5 17v2.5h15V17"></path></svg>`;

  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div id="root"></div>
    <button id="fab" class="fab" type="button" title="Abrir INSS Extractor by FonCK">
      ${DOWNLOAD_SVG}
      <span>INSS Extractor by FonCK</span>
    </button>
  `;

  const rootEl = shadow.getElementById('root');
  const fabEl = shadow.getElementById('fab');

  fabEl.addEventListener('click', () => {
    state.open = !state.open;
    if (state.open) {
      refreshSessionAndAutoLoad();
    }
    render();
  });

  // Escuta clique no popup da extensão
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'EXTRATOR_OPEN_PANEL') {
      state.open = true;
      refreshSessionAndAutoLoad();
      render();
      sendResponse({ ok: true });
    }
  });

  // Atualiza automaticamente se o usuário mudar de NB na URL ou no DOM do Meu INSS
  let domScanTimer = null;
  function scheduleAutoDetectNb() {
    if (state.running) return;
    clearTimeout(domScanTimer);
    domScanTimer = setTimeout(async () => {
      try {
        const session = await callBridge('GET_SESSION');
        state.session = session;
        if (session.nome && !state.clientName) {
          state.clientName = session.nome.toUpperCase();
        }
        const detected = session.nbFromUrl || session.nbFromDom || session.activeNb || '';
        const prevNb = state.nb;
        if (detected && (session.nbFromUrl || session.nbFromDom || !state.nb)) {
          state.nb = detected;
        }
        updateFabLabel();
        publishAgentState();
        if (state.open && state.nb && state.nb !== prevNb && !state.running) {
          await refreshSessionAndAutoLoad();
        }
      } catch {
        // ignore transient page load errors
      }
    }, 600);
  }

  function updateFabLabel() {
    const labelSpan = fabEl.querySelector('span');
    if (!labelSpan) return;
    labelSpan.textContent = state.nb
      ? `INSS Extractor · NB ${formatNb(state.nb)}`
      : 'INSS Extractor by FonCK';
  }

  window.addEventListener('hashchange', scheduleAutoDetectNb);
  window.addEventListener('popstate', scheduleAutoDetectNb);

  // Observa renderização dinâmica do React SPA do Meu INSS para localizar o NB automaticamente
  const spaRoot = document.getElementById('root') || document.body;
  if (spaRoot && typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(() => {
      if (!state.running) scheduleAutoDetectNb();
    });
    mo.observe(spaRoot, { childList: true, subtree: true });
  }
  scheduleAutoDetectNb();

  // -------------------- Session & Contract Loading --------------------
  async function refreshSessionAndAutoLoad() {
    try {
      const session = await callBridge('GET_SESSION');
      state.session = session;

      if (session.nome && !state.clientName) {
        state.clientName = session.nome.toUpperCase();
      }

      const detectedNb =
        session.nbFromUrl ||
        session.nbFromDom ||
        state.nb ||
        session.activeNb ||
        (session.beneficios && session.beneficios[0] ? session.beneficios[0].nb : '');

      const nbChanged = detectedNb && detectedNb !== state.nb;
      if (detectedNb) state.nb = detectedNb;
      updateFabLabel();

      if (session.cachedConsignado && detectedNb && (nbChanged || state.contracts.length === 0)) {
        const parsed = parseConsignadoPayload(session.cachedConsignado, detectedNb);
        if (parsed.beneficioNome) state.clientName = parsed.beneficioNome.toUpperCase();
        state.contracts = parsed.contracts;
        state.contractsError = '';
      } else if (session.isLoggedIn && detectedNb && (nbChanged || state.contracts.length === 0)) {
        await loadContractsForNb(detectedNb);
      }
    } catch (err) {
      state.contractsError = err.message || 'Erro ao ler sessão do Meu INSS.';
    }
    render();
  }

  async function loadContractsForNb(nbInput) {
    const nb = String(nbInput || state.nb || '').replace(/\D+/g, '');
    if (!nb) {
      state.contractsError = 'Abra um benefício no Extrato de Empréstimo Consignado ou informe o NB.';
      render();
      return;
    }

    state.nb = nb;
    state.loadingContracts = true;
    state.contractsError = '';
    render();

    try {
      const res = await callBridge('FETCH_CONSIGNADOS', { nb });
      if (!res.ok || !res.json) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Sessão expirada ou não autorizada. Faça login novamente no Meu INSS.');
        }
        if (res.status === 404) {
          state.contracts = [];
          state.contractsError = 'Nenhum consignado encontrado para este benefício.';
        } else {
          throw new Error(`Erro HTTP ${res.status} ao consultar contratos consignados.`);
        }
      } else {
        const parsed = parseConsignadoPayload(res.json, nb);
        if (parsed.beneficioNome && !state.clientName) {
          state.clientName = parsed.beneficioNome.toUpperCase();
        } else if (parsed.beneficioNome && state.session && state.clientName === state.session.nome.toUpperCase()) {
          state.clientName = parsed.beneficioNome.toUpperCase();
        }
        state.contracts = parsed.contracts;
      }
    } catch (err) {
      state.contractsError = err.message || String(err);
    } finally {
      state.loadingContracts = false;
      render();
    }
  }

  // -------------------- Extraction Workflows --------------------
  function getClientBaseFolder() {
    const client = sanitizeName(state.clientName || (state.session && state.session.nome) || 'CLIENTE_INSS') || 'CLIENTE_INSS';
    return `Contratos INSS/${client}`;
  }

  function getNbFolder() {
    return `${getClientBaseFolder()}/NB ${formatNb(state.nb)}`;
  }

  function isContractMissingCopy(contract) {
    if (globalThis.EXTRATOR_INSS_CSV && typeof globalThis.EXTRATOR_INSS_CSV.isContractSemCopia === 'function') {
      return globalThis.EXTRATOR_INSS_CSV.isContractSemCopia(contract);
    }
    const st = contract && contract.downloadStatus;
    return Boolean(st && (st.contratoPdf === 'Sem cópia' || st.state === 'nocopy'));
  }

  async function downloadPendingContractsTxt(folderOverride) {
    const nbFolder = folderOverride || getNbFolder();
    const res = globalThis.EXTRATOR_INSS_CSV.generateContratosPendentesTxt(state.contracts, {
      cliente: state.clientName,
      nb: state.nb,
      nbFormatted: formatNb(state.nb)
    });
    if (!res || res.count === 0 || !res.dataUrl) {
      return { count: 0, bankCount: 0, filename: '' };
    }
    const filename = `${nbFolder}/CONTRATOS-PENDENTES.txt`;
    await downloadViaBackground(res.dataUrl, filename);
    return { count: res.count, bankCount: res.bankCount, filename };
  }

  async function downloadContractsBatch(onlyErrors = false) {
    if (state.running) return;
    if (!state.nb) {
      state.bannerNotice = { type: 'warn', text: 'Informe ou selecione um Número de Benefício (NB) primeiro.' };
      render();
      return;
    }
    if (!state.contracts.length) {
      await loadContractsForNb(state.nb);
      if (!state.contracts.length) return;
    }

    const targets = onlyErrors
      ? state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'error')
      : state.contracts;

    if (!targets.length) {
      state.bannerNotice = { type: 'ok', text: 'Não há contratos com erro técnico para repetir.' };
      render();
      return;
    }

    state.running = true;
    state.phase = 'running';
    state.cancelRequested = false;
    state.bannerNotice = null;
    state.progressPct = 0;
    if (!onlyErrors) state.savedFiles = [];
    const nbFolder = getNbFolder();

    try {
      // Opcional: Extrato consolidado completo do benefício
      if (!onlyErrors && state.opts.extratoConsignadoPdf) {
        state.progressTitle = 'Extrato consolidado';
        state.progressStatus = 'Baixando PDF geral dos consignados...';
        render();
        const extRes = await callBridge('FETCH_EXTRATO_CONSIGNADO_PDF', { nb: state.nb, filtro: 3 });
        if (extRes.ok && extRes.isPdf && extRes.base64) {
          await downloadViaBackground(
            `data:application/pdf;base64,${extRes.base64}`,
            `${nbFolder}/Extrato Consignado Completo.pdf`
          );
        }
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }

      const wantContrato = state.opts.contratoPdf;
      const wantIdDocs = state.opts.documentoOficial || state.opts.biometriaFacial;

      for (let i = 0; i < targets.length; i++) {
        if (state.cancelRequested) {
          state.bannerNotice = { type: 'warn', text: 'Extração interrompida pelo usuário.' };
          break;
        }

        const c = targets[i];
        state.progressTitle = `Contrato ${i + 1} de ${targets.length}`;
        state.progressStatus = `${c.banco} (${c.numeroContrato})...`;
        state.progressPct = Math.round((i / targets.length) * 100);
        render();

        const contractFolder = `${nbFolder}/${c.categoryFolder || 'Empréstimos'}/${c.folderName}`;
        let requestedTypes = 0;
        let savedTypes = 0;
        let hadTechError = false;
        let errorReason = '';

        const statusRecord = {
          state: 'ok',
          label: 'Salvo',
          contratoPdf: wantContrato ? 'Sem cópia' : '-',
          dadosIdPdf: wantIdDocs ? 'Sem cópia' : '-',
          documentoOficial: state.opts.documentoOficial ? 'Sem cópia' : '-',
          biometriaFacial: state.opts.biometriaFacial ? 'Sem cópia' : '-'
        };

        // 1) Contrato em PDF (tipo = 2)
        if (wantContrato) {
          requestedTypes++;
          try {
            const pdfRes = await fetchContratoDocWithRetry({
              nb: state.nb,
              cbc: c.cbc,
              numeroContrato: c.numeroContrato,
              tipo: 2
            });

            if (pdfRes && pdfRes.ok && pdfRes.isPdf && pdfRes.base64) {
              const pdfFileName = c.contractPdfName || buildContractPdfFilename(c.dataInclusao, c.banco, c.numeroContrato, c.competenciaInicioDesconto);
              await downloadViaBackground(
                `data:application/pdf;base64,${pdfRes.base64}`,
                `${contractFolder}/${pdfFileName}`
              );
              savedTypes++;
              statusRecord.contratoPdf = 'Salvo';
            } else if (isNoCopyResponse(pdfRes)) {
              statusRecord.contratoPdf = 'Sem cópia';
            } else {
              hadTechError = true;
              const code = pdfRes ? pdfRes.status : 'rede';
              errorReason = `HTTP ${code}`;
              statusRecord.contratoPdf = `Erro (${code})`;
            }
          } catch (err) {
            hadTechError = true;
            errorReason = err.message || 'Falha de rede';
            statusRecord.contratoPdf = 'Erro técnico';
          }
          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        }

        // 2) Dados de Identificação (tipo = 1) -> PDF + extração local de Documento Oficial & Biometria Facial
        if (wantIdDocs && !state.cancelRequested) {
          const wantDoc = state.opts.documentoOficial;
          const wantBio = state.opts.biometriaFacial;
          if (wantDoc) requestedTypes++;
          if (wantBio) requestedTypes++;

          try {
            const idRes = await fetchContratoDocWithRetry({
              nb: state.nb,
              cbc: c.cbc,
              numeroContrato: c.numeroContrato,
              tipo: 1
            });

            if (idRes && idRes.ok && idRes.isPdf && idRes.base64) {
              // Sempre salva o PDF oficial Dados de Identificação.pdf
              await downloadViaBackground(
                `data:application/pdf;base64,${idRes.base64}`,
                `${contractFolder}/Dados de Identificação.pdf`
              );
              statusRecord.dadosIdPdf = 'Salvo';

              // Extrai imagens JPEG embutidas no PDF (Documento Oficial Frente/Verso + Biometria Facial)
              const pdfBytes = globalThis.EXTRATOR_INSS_PDF.base64ToUint8Array(idRes.base64);
              const imgs = globalThis.EXTRATOR_INSS_PDF.classifyIdentificationImages(pdfBytes);

              if (wantDoc) {
                let docCount = 0;
                if (imgs.docFrente) {
                  await downloadViaBackground(
                    globalThis.EXTRATOR_INSS_PDF.bytesToDataUrl(imgs.docFrente.bytes, 'image/jpeg'),
                    `${contractFolder}/Documento Oficial Frente.jpg`
                  );
                  docCount++;
                }
                if (imgs.docVerso) {
                  await downloadViaBackground(
                    globalThis.EXTRATOR_INSS_PDF.bytesToDataUrl(imgs.docVerso.bytes, 'image/jpeg'),
                    `${contractFolder}/Documento Oficial Verso.jpg`
                  );
                  docCount++;
                }
                if (docCount > 0) {
                  savedTypes++;
                  statusRecord.documentoOficial = docCount === 2 ? 'Frente e Verso' : 'Frente';
                } else {
                  statusRecord.documentoOficial = 'No PDF de Identificação';
                }
              }

              if (wantBio) {
                if (imgs.biometria) {
                  await downloadViaBackground(
                    globalThis.EXTRATOR_INSS_PDF.bytesToDataUrl(imgs.biometria.bytes, 'image/jpeg'),
                    `${contractFolder}/Registro Biométrico Facial.jpg`
                  );
                  savedTypes++;
                  statusRecord.biometriaFacial = 'Salvo';
                } else {
                  statusRecord.biometriaFacial = 'Sem cópia';
                }
              }

              if (savedTypes === 0 && !wantContrato) {
                savedTypes = 1;
              }
            } else if (isNoCopyResponse(idRes)) {
              statusRecord.dadosIdPdf = 'Sem cópia';
            } else {
              hadTechError = true;
              const code = idRes ? idRes.status : 'rede';
              errorReason = errorReason || `HTTP ${code}`;
              statusRecord.dadosIdPdf = `Erro (${code})`;
              if (wantDoc) statusRecord.documentoOficial = 'Erro técnico';
              if (wantBio) statusRecord.biometriaFacial = 'Erro técnico';
            }
          } catch (err) {
            hadTechError = true;
            errorReason = errorReason || (err.message || 'Falha de rede');
            statusRecord.dadosIdPdf = 'Erro técnico';
          }
          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        }

        // Define badge final do contrato (Salvo / Salvo X de Y / Sem cópia / Erro técnico)
        if (hadTechError) {
          statusRecord.state = 'error';
          statusRecord.label = errorReason ? `Erro técnico (${errorReason})` : 'Erro técnico';
        } else if (requestedTypes > 0 && savedTypes === 0 && statusRecord.dadosIdPdf !== 'Salvo') {
          statusRecord.state = 'nocopy';
          statusRecord.label = 'Sem cópia';
        } else if (requestedTypes > 1 && savedTypes < requestedTypes) {
          statusRecord.state = 'ok';
          statusRecord.label = `Salvo, ${savedTypes} de ${requestedTypes}`;
        } else {
          statusRecord.state = 'ok';
          statusRecord.label = 'Salvo';
        }

        c.downloadStatus = statusRecord;
        state.progressPct = Math.round(((i + 1) / targets.length) * 100);
        render();
      }

      // 3) Planilha resumo (sempre atualizada ao fim do lote, se marcada)
      if (state.opts.planilhaResumo && !state.cancelRequested) {
        state.progressTitle = 'Planilha resumo';
        state.progressStatus = 'Gerando Resumo dos contratos.csv...';
        render();
        const meta = {
          cliente: state.clientName,
          nb: state.nb,
          nbFormatted: formatNb(state.nb)
        };
        const csvDataUrl = globalThis.EXTRATOR_INSS_CSV.generateContratosResumoCsv(state.contracts, meta);
        await downloadViaBackground(csvDataUrl, `${nbFolder}/Resumo dos contratos.csv`);

        // Planilha dedicada de Cartões RMC e RCC quando presentes
        const cartoes = state.contracts.filter((c) => c.tipoLabel === 'Cartão RMC' || c.tipoLabel === 'Cartão RCC');
        if (cartoes.length > 0) {
          const cartoesCsv = globalThis.EXTRATOR_INSS_CSV.generateContratosResumoCsv(cartoes, meta);
          await downloadViaBackground(cartoesCsv, `${nbFolder}/Resumo Cartões RMC e RCC.csv`);
        }
      }

      // 4) Lista única CONTRATOS-PENDENTES.txt com os bancos sem cópia do contrato
      let pendentesSaved = null;
      if (state.opts.listaPendentesTxt && !state.cancelRequested) {
        const missingCount = state.contracts.filter(isContractMissingCopy).length;
        if (missingCount > 0) {
          state.progressTitle = 'Contratos pendentes';
          state.progressStatus = `Gerando CONTRATOS-PENDENTES.txt (${missingCount} sem cópia)...`;
          render();
          pendentesSaved = await downloadPendingContractsTxt(nbFolder);
        }
      }

      if (!state.cancelRequested) {
        const errCount = state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'error').length;
        const pendMsg =
          pendentesSaved && pendentesSaved.count > 0
            ? ` · ${pendentesSaved.count} sem cópia em CONTRATOS-PENDENTES.txt (${pendentesSaved.bankCount} banco(s))`
            : '';
        state.phase = errCount > 0 ? 'error' : 'completed';
        state.bannerNotice = errCount > 0
          ? { type: 'warn', text: `Concluído com ${errCount} erro(s) técnico(s)${pendMsg}. Use o botão "Repetir erros".` }
          : { type: 'ok', text: `Arquivos salvos em Downloads/${nbFolder}/${pendMsg}` };
      } else {
        state.phase = 'idle';
      }
    } catch (err) {
      state.phase = 'error';
      state.bannerNotice = { type: 'error', text: err.message || String(err) };
    } finally {
      state.running = false;
      state.progressTitle = '';
      state.progressStatus = '';
      render();
    }
  }

  async function extractHiscrePaymentStatement() {
    if (state.running) return;
    const session = state.session || (await callBridge('GET_SESSION'));
    state.session = session;

    if (!session || !session.isLoggedIn || !session.cpf) {
      state.bannerNotice = { type: 'error', text: 'Faça login no Meu INSS (gov.br) antes de extrair o extrato de pagamento.' };
      render();
      return;
    }

    const chunks = buildTwelveMonthChunks(
      state.period.startYear,
      state.period.startMonth,
      state.period.endYear,
      state.period.endMonth
    );

    if (!chunks.length) {
      state.bannerNotice = { type: 'warn', text: 'A data inicial deve ser anterior ou igual à data final (mínimo 06/1994).' };
      render();
      return;
    }

    if (!state.opts.hiscrePdfUnico && !state.opts.hiscrePlanilhaExcel && !state.opts.hiscrePdfsSeparados) {
      state.bannerNotice = { type: 'warn', text: 'Marque ao menos um formato de saída (PDF ou Planilha).' };
      render();
      return;
    }

    state.running = true;
    state.phase = 'running';
    state.cancelRequested = false;
    state.bannerNotice = null;
    state.progressPct = 0;

    const extratoFolder = `${getClientBaseFolder()}/Extrato de pagamento`;
    const fullRangeLabel = `${pad2(chunks[0].startMonth)}-${chunks[0].startYear} a ${pad2(chunks[chunks.length - 1].endMonth)}-${chunks[chunks.length - 1].endYear}`;
    const collectedPdfBuffers = [];
    const collectedCreditos = [];
    const nonEmptyChunks = [];
    let captchaBlocked = false;

    async function callHiscreWithRetry(action, payload) {
      let lastRes = null;
      for (let attempt = 0; attempt <= 1; attempt++) {
        if (state.cancelRequested) break;
        const res = await callBridge(action, payload);
        lastRes = res;
        const errCode = (res.json && res.json.erro) || (res.jsonError && res.jsonError.erro);
        if (errCode === 432 || errCode === 430 || res.status === 401 || res.status === 403 || res.ok) {
          return res;
        }
        if (attempt === 0 && (res.status >= 500 || res.status === 429)) {
          await sleep(2200);
          continue;
        }
        return res;
      }
      return lastRes;
    }

    function parseCreditoYm(cred) {
      if (!cred || typeof cred !== 'object') return null;
      const raw = String(cred.dtCompetenciaCredito || cred.competencia || cred.dtInicioPeriodo || cred.dtPgtoCredito || '').trim();
      const digits = raw.replace(/\D+/g, '');
      if (/^(19|20)\d{4}$/.test(digits)) {
        return { year: Number(digits.slice(0, 4)), month: Number(digits.slice(4, 6)) };
      }
      const br = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
      if (br) return { year: Number(br[3]), month: Number(br[2]) };
      const iso = raw.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
      if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
      return null;
    }

    try {
      const wantAnyPdf = state.opts.hiscrePdfUnico || state.opts.hiscrePdfsSeparados;
      const wantCsv = state.opts.hiscrePlanilhaExcel;

      for (let i = 0; i < chunks.length; i++) {
        if (state.cancelRequested) {
          state.bannerNotice = { type: 'warn', text: 'Extração do extrato interrompida pelo usuário.' };
          break;
        }

        const chunk = chunks[i];
        state.progressTitle = `Período ${i + 1} de ${chunks.length}`;
        state.progressStatus = `Consultando ${chunk.labelSlash}...`;
        state.progressPct = Math.round((i / chunks.length) * 100);
        render();

        // A) Consulta JSON primeiro (sempre) para detectar o 1º pagamento real e pular anos sem registro
        let knownEmpty = false;
        const jsonRes = await callHiscreWithRetry('FETCH_HISCRE_JSON', {
          cpf: session.cpf,
          dataInicio: chunk.dataInicioApi,
          dataFim: chunk.dataFimApi
        });

        const jsonErrCode = jsonRes && jsonRes.json && jsonRes.json.erro;
        if (jsonErrCode === 432 || jsonErrCode === 430) {
          captchaBlocked = true;
          state.bannerNotice = {
            type: 'warn',
            text: 'O Meu INSS solicitou verificação humana (reCAPTCHA) no Extrato de Pagamento. Abra "Extrato de Pagamento de Benefício" no site, resolva o desafio normalmente e clique em Extrair extrato novamente.'
          };
          break;
        }

        if (jsonRes && (jsonRes.status === 401 || jsonRes.status === 403)) {
          throw new Error('Sessão do Meu INSS expirada. Recarregue a página e faça login novamente.');
        }

        if (jsonRes && jsonRes.ok && jsonRes.json && Array.isArray(jsonRes.json.creditosTO)) {
          if (jsonRes.json.creditosTO.length > 0) {
            collectedCreditos.push(...jsonRes.json.creditosTO);
            nonEmptyChunks.push(chunk);
          } else {
            knownEmpty = true;
          }
        }

        if (state.cancelRequested) break;

        // Se não há pagamentos neste período de 12 meses, pula o PDF e avança mais rápido
        if (knownEmpty) {
          state.progressStatus = `Sem registros em ${chunk.labelSlash} (pulando)...`;
          state.progressPct = Math.round(((i + 1) / chunks.length) * 100);
          render();
          await sleep(DELAY_EMPTY_HISCRE_MS);
          continue;
        }

        await sleep(DELAY_BETWEEN_HISCRE_MS);
        if (state.cancelRequested) break;

        // B) Consulta PDF oficial do período de até 12 meses (somente períodos com pagamento)
        if (wantAnyPdf) {
          state.progressStatus = `Baixando PDF oficial ${chunk.labelSlash}...`;
          render();

          const pdfRes = await callHiscreWithRetry('FETCH_HISCRE_PDF', {
            cpf: session.cpf,
            dataInicio: chunk.dataInicioApi,
            dataFim: chunk.dataFimApi
          });

          const errCode = pdfRes && pdfRes.jsonError && pdfRes.jsonError.erro;
          if (errCode === 432 || errCode === 430) {
            captchaBlocked = true;
            state.bannerNotice = {
              type: 'warn',
              text: 'O Meu INSS solicitou verificação humana (reCAPTCHA) para emitir o PDF. Resolva o desafio na tela de Extrato de Pagamento do site e tente novamente.'
            };
            break;
          }

          if (pdfRes && pdfRes.ok && pdfRes.isPdf && pdfRes.base64) {
            const pdfBytes = globalThis.EXTRATOR_INSS_PDF.base64ToUint8Array(pdfRes.base64);
            collectedPdfBuffers.push(pdfBytes);
            if (!nonEmptyChunks.includes(chunk)) nonEmptyChunks.push(chunk);

            if (state.opts.hiscrePdfsSeparados) {
              await downloadViaBackground(
                `data:application/pdf;base64,${pdfRes.base64}`,
                `${extratoFolder}/Periodos 12 em 12 meses/Extrato de pagamento ${chunk.label}.pdf`
              );
            }
          } else if (pdfRes && (pdfRes.status === 401 || pdfRes.status === 403)) {
            throw new Error('Sessão do Meu INSS expirada. Recarregue a página e faça login novamente.');
          }

          await sleep(DELAY_BETWEEN_HISCRE_MS);
        }

        state.progressPct = Math.round(((i + 1) / chunks.length) * 100);
        render();
      }

      if (!captchaBlocked && !state.cancelRequested) {
        // Determina o intervalo real do 1º ao último extrato encontrado para nomear os arquivos
        let minYm = null;
        let maxYm = null;
        for (const cred of collectedCreditos) {
          const ym = parseCreditoYm(cred);
          if (!ym) continue;
          const total = ym.year * 12 + ym.month;
          if (!minYm || total < minYm.year * 12 + minYm.month) minYm = ym;
          if (!maxYm || total > maxYm.year * 12 + maxYm.month) maxYm = ym;
        }

        let effectiveRangeLabel = fullRangeLabel;
        let effectiveRangeSlash = `${pad2(chunks[0].startMonth)}/${chunks[0].startYear} a ${pad2(chunks[chunks.length - 1].endMonth)}/${chunks[chunks.length - 1].endYear}`;
        if (minYm && maxYm) {
          effectiveRangeLabel = `${pad2(minYm.month)}-${minYm.year} a ${pad2(maxYm.month)}-${maxYm.year}`;
          effectiveRangeSlash = `${pad2(minYm.month)}/${minYm.year} a ${pad2(maxYm.month)}/${maxYm.year}`;
        } else if (nonEmptyChunks.length > 0) {
          const firstC = nonEmptyChunks[0];
          const lastC = nonEmptyChunks[nonEmptyChunks.length - 1];
          effectiveRangeLabel = `${pad2(firstC.startMonth)}-${firstC.startYear} a ${pad2(lastC.endMonth)}-${lastC.endYear}`;
          effectiveRangeSlash = `${pad2(firstC.startMonth)}/${firstC.startYear} a ${pad2(lastC.endMonth)}/${lastC.endYear}`;
        }

        let savedCount = 0;

        if (state.opts.hiscrePdfUnico && collectedPdfBuffers.length > 0) {
          state.progressTitle = 'Unificando PDFs';
          state.progressStatus = `Juntando ${collectedPdfBuffers.length} período(s) com pagamentos em um único PDF oficial...`;
          render();

          const mergedBytes = await globalThis.EXTRATOR_INSS_PDF.mergePdfBuffers(collectedPdfBuffers);
          const mergedDataUrl = globalThis.EXTRATOR_INSS_PDF.bytesToDataUrl(mergedBytes, 'application/pdf');
          await downloadViaBackground(mergedDataUrl, `${extratoFolder}/Extrato de pagamento ${effectiveRangeLabel}.pdf`);
          savedCount++;
        }

        if (wantCsv && collectedCreditos.length > 0) {
          state.progressTitle = 'Gerando planilha Excel';
          state.progressStatus = `Organizando ${collectedCreditos.length} competência(s) por rubrica...`;
          render();

          const csvDataUrl = globalThis.EXTRATOR_INSS_CSV.generateHiscreRubricasCsv(collectedCreditos);
          await downloadViaBackground(csvDataUrl, `${extratoFolder}/Extrato de pagamento ${effectiveRangeLabel}.csv`);
          savedCount++;
        }

        if (savedCount === 0 && collectedPdfBuffers.length === 0 && collectedCreditos.length === 0) {
          state.phase = 'completed';
          state.bannerNotice = { type: 'warn', text: 'Nenhum crédito de pagamento encontrado no período selecionado.' };
        } else {
          state.phase = 'completed';
          state.bannerNotice = {
            type: 'ok',
            text: `Extrato salvo (${effectiveRangeSlash}) em Downloads/${extratoFolder}/ (${collectedCreditos.length || collectedPdfBuffers.length} registro(s)).`
          };
        }
      } else if (captchaBlocked) {
        state.phase = 'captcha_required';
      } else {
        state.phase = 'idle';
      }
    } catch (err) {
      state.phase = 'error';
      state.bannerNotice = { type: 'error', text: err.message || String(err) };
    } finally {
      state.running = false;
      state.progressTitle = '';
      state.progressStatus = '';
      render();
    }
  }

  async function downloadContractsAndExtrato() {
    if (state.running) return;
    await downloadContractsBatch(false);
    if (state.cancelRequested) return;

    const oldest = findOldestDiscountStart(state.contracts);
    if (oldest) {
      state.period.startYear = oldest.year;
      state.period.startMonth = oldest.month;
      state.period.endYear = now.getFullYear();
      state.period.endMonth = now.getMonth() + 1;
    }
    state.activeTab = 'extrato';
    render();
    await extractHiscrePaymentStatement();
  }

  // -------------------- Rendering --------------------
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderYearOptions(selectedYear) {
    const maxY = new Date().getFullYear();
    let html = '';
    for (let y = maxY; y >= 1994; y--) {
      html += `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`;
    }
    return html;
  }

  function renderMonthOptions(selectedMonth) {
    return MONTHS.map(
      (m) => `<option value="${m.value}" ${m.value === selectedMonth ? 'selected' : ''}>${m.label}</option>`
    ).join('');
  }

  function buildAgentStateSnapshot() {
    const okCount = state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'ok').length;
    const nocopyCount = state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'nocopy').length;
    const missingCopyCount = state.contracts.filter(isContractMissingCopy).length;
    const errCount = state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'error').length;
    const chunks = buildTwelveMonthChunks(
      state.period.startYear,
      state.period.startMonth,
      state.period.endYear,
      state.period.endMonth
    );

    return {
      ready: true,
      name: 'INSS Extractor by FonCK',
      version: '2.4.0',
      theme: state.theme,
      open: state.open,
      activeTab: state.activeTab,
      isLoggedIn: Boolean(state.session && state.session.isLoggedIn),
      clientName: state.clientName,
      nb: state.nb,
      nbFormatted: state.nb ? formatNb(state.nb) : '',
      nbSource: state.session && state.session.nbFromUrl
        ? 'url'
        : (state.session && state.session.nbFromDom ? 'dom' : (state.nb ? 'session' : 'none')),
      beneficios: ((state.session && state.session.beneficios) || []).map((b) => ({
        nb: b.nb,
        nbFormatted: formatNb(b.nb),
        especie: b.especie || '',
        situacao: b.situacao || ''
      })),
      contractsCount: state.contracts.length,
      period: { ...state.period },
      twelveMonthChunks: chunks.map((c) => c.label),
      opts: { ...state.opts },
      running: state.running,
      phase: state.running ? 'running' : (state.loadingContracts ? 'loading' : state.phase),
      progressPct: state.progressPct,
      progressTitle: state.progressTitle,
      progressStatus: state.progressStatus,
      downloadBaseFolder: `Downloads/${getClientBaseFolder()}/`,
      summary: { ok: okCount, nocopy: nocopyCount, missingContractCopy: missingCopyCount, error: errCount },
      savedFiles: [...state.savedFiles],
      notice: state.bannerNotice
    };
  }

  function publishAgentState() {
    try {
      let el = document.getElementById('extrator-inss-agent-state');
      if (!el) {
        el = document.createElement('script');
        el.id = 'extrator-inss-agent-state';
        el.type = 'application/json';
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = JSON.stringify(buildAgentStateSnapshot());
    } catch {
      // ignore DOM write errors
    }
  }

  function render() {
    updateFabLabel();
    publishAgentState();

    if (!state.open) {
      rootEl.innerHTML = '';
      return;
    }

    const isLoggedIn = Boolean(state.session && state.session.isLoggedIn);
    const chunks = buildTwelveMonthChunks(
      state.period.startYear,
      state.period.startMonth,
      state.period.endYear,
      state.period.endMonth
    );
    const oldestDiscount = findOldestDiscountStart(state.contracts);
    const errorCount = state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'error').length;
    const missingCopyCount = state.contracts.filter(isContractMissingCopy).length;
    const visibleContracts = state.filterErrorsOnly
      ? state.contracts.filter((c) => c.downloadStatus && c.downloadStatus.state === 'error')
      : state.contracts;

    const beneficios = (state.session && state.session.beneficios) || [];

    rootEl.innerHTML = `
      <div class="panel" role="dialog" aria-label="INSS Extractor by FonCK">
        <div class="panel-hdr">
          <div class="panel-tit">
            <span class="ico-circle">${DOWNLOAD_SVG}</span>
            <span class="tit-stack">
              <span class="tit-eyebrow">Open Source · v2.4.0</span>
              <span class="tit-name">INSS Extractor by FonCK</span>
            </span>
          </div>
          <div class="hdr-actions">
            <button class="icon-btn" id="btn-theme" type="button" title="${state.theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}">${state.theme === 'dark' ? '☀' : '☾'}</button>
            <button class="icon-btn" id="btn-refresh" type="button" title="Atualizar sessão e benefício">↻</button>
            <button class="icon-btn" id="btn-close" type="button" title="Fechar painel">×</button>
          </div>
        </div>

        <div class="panel-body">
          ${!isLoggedIn ? `
            <div class="info-box warn">
              Faça login com a conta <b>gov.br</b> do cliente no Meu INSS. A extensão usa a sessão já aberta no navegador, sem pedir senha.
            </div>
          ` : ''}

          <div class="field-row">
            <label for="inp-client">Nome da pasta (cliente)</label>
            <input id="inp-client" type="text" value="${escapeHtml(state.clientName)}" placeholder="Ex.: GABRIEL FONSECA (DEMO)" ${state.running ? 'disabled' : ''}>
          </div>

          <div class="field-row">
            <label for="inp-nb">
              <span>Número do Benefício (NB)</span>
              ${beneficios.length > 1 ? `<span>${beneficios.length} benefícios detectados</span>` : ''}
            </label>
            <div class="field-grid-2">
              ${beneficios.length > 0 ? `
                <select id="sel-nb" ${state.running ? 'disabled' : ''}>
                  ${beneficios.map((b) => `<option value="${escapeHtml(b.nb)}" ${b.nb === state.nb ? 'selected' : ''}>NB ${escapeHtml(formatNb(b.nb))}${b.situacao ? ' · ' + escapeHtml(b.situacao.toLowerCase()) : ''}</option>`).join('')}
                  ${state.nb && !beneficios.some((b) => b.nb === state.nb) ? `<option value="${escapeHtml(state.nb)}" selected>NB ${escapeHtml(formatNb(state.nb))}</option>` : ''}
                </select>
              ` : `
                <input id="inp-nb" type="text" value="${escapeHtml(state.nb)}" placeholder="Ex.: 1234567890" ${state.running ? 'disabled' : ''}>
              `}
              <button id="btn-load-nb" class="btn-small" type="button" ${state.running || state.loadingContracts ? 'disabled' : ''}>
                ${state.loadingContracts ? 'Buscando...' : 'Carregar'}
              </button>
            </div>
          </div>

          <div class="tabs" role="tablist">
            <button class="tab-btn ${state.activeTab === 'contratos' ? 'active' : ''}" data-tab="contratos" type="button" ${state.running ? 'disabled' : ''}>Contratos</button>
            <button class="tab-btn ${state.activeTab === 'extrato' ? 'active' : ''}" data-tab="extrato" type="button" ${state.running ? 'disabled' : ''}>Extrato de pagamento</button>
          </div>

          ${state.bannerNotice ? `
            <div class="info-box ${state.bannerNotice.type}">
              ${escapeHtml(state.bannerNotice.text)}
            </div>
          ` : ''}

          ${state.running ? `
            <div class="progress-wrap">
              <div class="progress-top">
                <b>${escapeHtml(state.progressTitle || 'Processando...')}</b>
                <button id="btn-cancel" class="btn-danger" type="button">Parar</button>
              </div>
              <div style="font-size:12px;color:var(--grafite)">${escapeHtml(state.progressStatus)}</div>
              <div class="progress-bar"><i style="width:${state.progressPct}%"></i></div>
            </div>
          ` : ''}

          ${state.activeTab === 'contratos' ? `
            ${state.contractsError ? `
              <div class="info-box warn">${escapeHtml(state.contractsError)}</div>
            ` : `
              <div class="info-box">
                ${state.loadingContracts
                  ? 'Consultando contratos consignados do benefício...'
                  : (() => {
                      const empN = state.contracts.filter((c) => c.tipoLabel === 'Empréstimo').length;
                      const rmcN = state.contracts.filter((c) => c.tipoLabel === 'Cartão RMC').length;
                      const rccN = state.contracts.filter((c) => c.tipoLabel === 'Cartão RCC').length;
                      const parts = [];
                      if (empN) parts.push(`${empN} Empréstimo(s)`);
                      if (rmcN) parts.push(`${rmcN} RMC`);
                      if (rccN) parts.push(`${rccN} RCC`);
                      const breakdown = parts.length ? ` (${parts.join(' · ')})` : '';
                      return `${state.contracts.length} contrato(s) encontrados${state.clientName ? ' de ' + escapeHtml(state.clientName) : ''}${escapeHtml(breakdown)}.`;
                    })()}
              </div>
            `}

            <div class="checks">
              <label class="chk"><input type="checkbox" data-opt="contratoPdf" ${state.opts.contratoPdf ? 'checked' : ''} ${state.running ? 'disabled' : ''}>Contrato (PDF)</label>
              <label class="chk"><input type="checkbox" data-opt="documentoOficial" ${state.opts.documentoOficial ? 'checked' : ''} ${state.running ? 'disabled' : ''}>Documento oficial</label>
              <label class="chk"><input type="checkbox" data-opt="biometriaFacial" ${state.opts.biometriaFacial ? 'checked' : ''} ${state.running ? 'disabled' : ''}>Biometria facial</label>
              <label class="chk"><input type="checkbox" data-opt="planilhaResumo" ${state.opts.planilhaResumo ? 'checked' : ''} ${state.running ? 'disabled' : ''}>Planilha resumo</label>
            </div>
            <div class="checks single" style="margin-top:-3px">
              <label class="chk">
                <input type="checkbox" data-opt="listaPendentesTxt" ${state.opts.listaPendentesTxt ? 'checked' : ''} ${state.running ? 'disabled' : ''}>
                Gerar <b>CONTRATOS-PENDENTES.txt</b> (bancos sem cópia)
              </label>
              <label class="chk">
                <input type="checkbox" data-opt="extratoConsignadoPdf" ${state.opts.extratoConsignadoPdf ? 'checked' : ''} ${state.running ? 'disabled' : ''}>
                Incluir PDF geral do Extrato Consignado (todos)
              </label>
            </div>

            <button id="btn-dl-contratos" class="btn-primary" type="button" ${state.running || !isLoggedIn || !state.contracts.length ? 'disabled' : ''}>
              Baixar ${state.contracts.length} contrato(s)
            </button>
            <button id="btn-dl-ambos" class="btn-secondary" type="button" ${state.running || !isLoggedIn || !state.contracts.length ? 'disabled' : ''}>
              Baixar contratos e extrato de pagamento
            </button>

            ${state.contracts.length > 0 ? `
              <div class="results-hdr">
                <span style="font-size:12px;font-weight:700;color:var(--grafite)">Contratos do benefício</span>
                ${(missingCopyCount > 0 || errorCount > 0) ? `
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                    ${missingCopyCount > 0 ? `
                      <button id="btn-dl-pendentes" class="btn-small" type="button" ${state.running ? 'disabled' : ''} title="Baixar CONTRATOS-PENDENTES.txt com os bancos sem cópia">PENDENTES.txt (${missingCopyCount})</button>
                    ` : ''}
                    ${errorCount > 0 ? `
                      <button id="btn-filter-err" class="btn-small" type="button">${state.filterErrorsOnly ? 'Mostrar todos' : `Só erros (${errorCount})`}</button>
                      <button id="btn-retry-err" class="btn-danger" type="button" ${state.running ? 'disabled' : ''}>Repetir erros</button>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
              <div class="contract-list">
                ${visibleContracts.map((c) => {
                  const st = c.downloadStatus;
                  const pillCls = st ? st.state : 'pending';
                  const pillTxt = st ? st.label : 'Aguardando';
                  return `
                    <div class="contract-item">
                      <div class="contract-meta">
                        <b title="${escapeHtml(c.banco)} · ${escapeHtml(c.numeroContrato)}">${escapeHtml(c.banco)} · ${escapeHtml(c.dateIso)}</b>
                        <small>${escapeHtml(c.tipoLabel)} · ${escapeHtml(c.situacao)} · Nº ${escapeHtml(c.numeroContrato)}</small>
                      </div>
                      <span class="pill ${pillCls}">${escapeHtml(pillTxt)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}
          ` : `
            <div class="periodo-grid">
              <div class="field-row">
                <label>De</label>
                <div class="periodo-pair">
                  <select id="sel-start-m" ${state.running ? 'disabled' : ''}>${renderMonthOptions(state.period.startMonth)}</select>
                  <select id="sel-start-y" ${state.running ? 'disabled' : ''}>${renderYearOptions(state.period.startYear)}</select>
                </div>
              </div>
              <div class="field-row">
                <label>Até</label>
                <div class="periodo-pair">
                  <select id="sel-end-m" ${state.running ? 'disabled' : ''}>${renderMonthOptions(state.period.endMonth)}</select>
                  <select id="sel-end-y" ${state.running ? 'disabled' : ''}>${renderYearOptions(state.period.endYear)}</select>
                </div>
              </div>
            </div>

            ${(state.period.startYear !== HISCRE_MIN_YEAR || state.period.startMonth !== HISCRE_MIN_MONTH) ? `
              <button id="btn-first-possible" class="link-btn" type="button" ${state.running ? 'disabled' : ''}>
                Usar 1º extrato possível do Meu INSS (06/1994)
              </button>
            ` : ''}

            ${oldestDiscount ? `
              <button id="btn-oldest-shortcut" class="link-btn" type="button" ${state.running ? 'disabled' : ''}>
                Usar desconto mais antigo dos contratos (${pad2(oldestDiscount.month)}/${oldestDiscount.year})
              </button>
            ` : ''}

            <div class="info-box">
              ${chunks.length
                ? `Período total: <b>${pad2(chunks[0].startMonth)}/${chunks[0].startYear} a ${pad2(chunks[chunks.length - 1].endMonth)}/${chunks[chunks.length - 1].endYear}</b> · ${chunks.length} período(s) de 12 meses<div style="margin-top:4px;font-size:11.5px;color:var(--grafite)">Padrão sem limite de 5 anos: busca desde o 1º extrato possível e pula automaticamente períodos sem pagamento.</div>`
                : 'Período inválido: escolha uma data inicial menor ou igual à data final.'}
            </div>

            <div class="checks single">
              <label class="chk"><input type="checkbox" data-opt="hiscrePdfsSeparados" ${state.opts.hiscrePdfsSeparados ? 'checked' : ''} ${state.running ? 'disabled' : ''}>PDFs separados por período de 12 meses (padrão)</label>
              <label class="chk"><input type="checkbox" data-opt="hiscrePdfUnico" ${state.opts.hiscrePdfUnico ? 'checked' : ''} ${state.running ? 'disabled' : ''}>PDF único oficial do INSS (unificado)</label>
              <label class="chk"><input type="checkbox" data-opt="hiscrePlanilhaExcel" ${state.opts.hiscrePlanilhaExcel ? 'checked' : ''} ${state.running ? 'disabled' : ''}>Planilha de competências e rubricas (Excel)</label>
            </div>

            <button id="btn-dl-extrato" class="btn-primary" type="button" ${state.running || !isLoggedIn || !chunks.length ? 'disabled' : ''}>
              Extrair extrato
            </button>
          `}

          <div class="foot-note">
            <div>Destino: <b>Downloads/${escapeHtml(getClientBaseFolder())}/</b> · 100% local</div>
            <div class="foot-links">
              <span>por <b>Gabriel Fonseca</b></span>
              <div class="foot-ico-bar">
                <a class="foot-ico-btn" href="${escapeHtml(CFG.siteUrl)}" target="_blank" rel="noopener" title="Site Oficial" aria-label="Site Oficial">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </a>
                <a class="foot-ico-btn" href="${escapeHtml(CFG.githubRepoUrl || 'https://github.com/Gabriel-FonCK/inss-extractor-by-fonck')}" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                </a>
                <a class="foot-ico-btn" href="${escapeHtml(CFG.linkedinUrl)}" target="_blank" rel="noopener" title="LinkedIn" aria-label="LinkedIn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                </a>
                <a class="foot-ico-btn" href="${escapeHtml(CFG.whatsappUrl)}" target="_blank" rel="noopener" title="Consultoria WhatsApp" aria-label="WhatsApp">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const byId = (id) => shadow.getElementById(id);

    const closeBtn = byId('btn-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { state.open = false; render(); });

    const themeBtn = byId('btn-theme');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const refreshBtn = byId('btn-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshSessionAndAutoLoad());

    const clientInput = byId('inp-client');
    if (clientInput) {
      clientInput.addEventListener('input', (e) => {
        state.clientName = e.target.value;
      });
    }

    const selNb = byId('sel-nb');
    if (selNb) {
      selNb.addEventListener('change', (e) => {
        state.nb = e.target.value;
        loadContractsForNb(state.nb);
      });
    }

    const inpNb = byId('inp-nb');
    if (inpNb) {
      inpNb.addEventListener('input', (e) => {
        state.nb = e.target.value.replace(/\D+/g, '');
      });
    }

    const loadNbBtn = byId('btn-load-nb');
    if (loadNbBtn) loadNbBtn.addEventListener('click', () => loadContractsForNb(state.nb));

    shadow.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        render();
      });
    });

    shadow.querySelectorAll('input[data-opt]').forEach((chk) => {
      chk.addEventListener('change', () => {
        state.opts[chk.dataset.opt] = chk.checked;
      });
    });

    const dlContratosBtn = byId('btn-dl-contratos');
    if (dlContratosBtn) dlContratosBtn.addEventListener('click', () => downloadContractsBatch(false));

    const dlAmbosBtn = byId('btn-dl-ambos');
    if (dlAmbosBtn) dlAmbosBtn.addEventListener('click', () => downloadContractsAndExtrato());

    const dlPendentesBtn = byId('btn-dl-pendentes');
    if (dlPendentesBtn) {
      dlPendentesBtn.addEventListener('click', async () => {
        try {
          const res = await downloadPendingContractsTxt();
          if (res.count > 0) {
            state.bannerNotice = {
              type: 'ok',
              text: `CONTRATOS-PENDENTES.txt salvo em Downloads/${getNbFolder()}/ (${res.count} contrato(s) em ${res.bankCount} banco(s)).`
            };
          } else {
            state.bannerNotice = { type: 'ok', text: 'Nenhum contrato sem cópia pendente no momento.' };
          }
        } catch (err) {
          state.bannerNotice = { type: 'error', text: err.message || String(err) };
        }
        render();
      });
    }

    const filterErrBtn = byId('btn-filter-err');
    if (filterErrBtn) {
      filterErrBtn.addEventListener('click', () => {
        state.filterErrorsOnly = !state.filterErrorsOnly;
        render();
      });
    }

    const retryErrBtn = byId('btn-retry-err');
    if (retryErrBtn) retryErrBtn.addEventListener('click', () => downloadContractsBatch(true));

    const cancelBtn = byId('btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        state.cancelRequested = true;
        state.progressStatus = 'Interrompendo após a consulta atual...';
        render();
      });
    }

    const bindPeriod = (id, key) => {
      const el = byId(id);
      if (el) {
        el.addEventListener('change', () => {
          state.period[key] = Number(el.value);
          if (state.period.startYear === HISCRE_MIN_YEAR && state.period.startMonth < HISCRE_MIN_MONTH) {
            state.period.startMonth = HISCRE_MIN_MONTH;
          }
          render();
        });
      }
    };
    bindPeriod('sel-start-m', 'startMonth');
    bindPeriod('sel-start-y', 'startYear');
    bindPeriod('sel-end-m', 'endMonth');
    bindPeriod('sel-end-y', 'endYear');

    const firstPossibleBtn = byId('btn-first-possible');
    if (firstPossibleBtn) {
      firstPossibleBtn.addEventListener('click', () => {
        state.period.startYear = HISCRE_MIN_YEAR;
        state.period.startMonth = HISCRE_MIN_MONTH;
        render();
      });
    }

    const oldestBtn = byId('btn-oldest-shortcut');
    if (oldestBtn) {
      oldestBtn.addEventListener('click', () => {
        const oldest = findOldestDiscountStart(state.contracts);
        if (oldest) {
          state.period.startYear = oldest.year;
          state.period.startMonth = oldest.month;
          render();
        }
      });
    }

    const dlExtratoBtn = byId('btn-dl-extrato');
    if (dlExtratoBtn) dlExtratoBtn.addEventListener('click', () => extractHiscrePaymentStatement());
  }

  // -------------------- Universal AI-Agent Command Handler --------------------
  const AGENT_CMD_CHANNEL = 'EXTRATOR_INSS_AGENT_CMD';
  const AGENT_RES_CHANNEL = 'EXTRATOR_INSS_AGENT_RES';

  async function handleAgentCommand(command, params = {}) {
    switch (command) {
      case 'GET_STATE': {
        if (!state.running) {
          try {
            const session = await callBridge('GET_SESSION');
            state.session = session;
            if (session.nome && !state.clientName) state.clientName = session.nome.toUpperCase();
            if (!state.nb && (session.nbFromUrl || session.nbFromDom || session.activeNb)) {
              state.nb = session.nbFromUrl || session.nbFromDom || session.activeNb;
            }
          } catch {
            // keep last known session
          }
        }
        render();
        return buildAgentStateSnapshot();
      }

      case 'OPEN_PANEL':
        state.open = true;
        await refreshSessionAndAutoLoad();
        return buildAgentStateSnapshot();

      case 'CLOSE_PANEL':
        state.open = false;
        render();
        return buildAgentStateSnapshot();

      case 'CONFIGURE': {
        if (state.running) throw new Error('Não é possível reconfigurar durante uma extração em andamento.');
        if (typeof params.clientName === 'string' && params.clientName.trim()) {
          state.clientName = params.clientName.trim();
        }
        if (params.nb !== undefined) {
          const digits = String(params.nb).replace(/\D+/g, '');
          if (digits) state.nb = digits;
        }
        if (Number.isInteger(params.startMonth) && params.startMonth >= 1 && params.startMonth <= 12) {
          state.period.startMonth = params.startMonth;
        }
        if (Number.isInteger(params.startYear) && params.startYear >= 1994) {
          state.period.startYear = params.startYear;
        }
        if (Number.isInteger(params.endMonth) && params.endMonth >= 1 && params.endMonth <= 12) {
          state.period.endMonth = params.endMonth;
        }
        if (Number.isInteger(params.endYear) && params.endYear >= 1994) {
          state.period.endYear = params.endYear;
        }
        if (params.opts && typeof params.opts === 'object') {
          for (const key of Object.keys(state.opts)) {
            if (typeof params.opts[key] === 'boolean') {
              state.opts[key] = params.opts[key];
            }
          }
        }
        render();
        return buildAgentStateSnapshot();
      }

      case 'LOAD_CONTRACTS':
        state.open = true;
        await loadContractsForNb(params.nb || state.nb);
        return buildAgentStateSnapshot();

      case 'RUN_CONTRACTS':
        state.open = true;
        state.activeTab = 'contratos';
        render();
        // Dispara em segundo plano para a IA poder acompanhar via getState() sem timeout de IPC
        downloadContractsBatch(Boolean(params.onlyErrors));
        return buildAgentStateSnapshot();

      case 'RUN_EXTRATO':
        state.open = true;
        state.activeTab = 'extrato';
        if (params.useOldestDiscount) {
          const oldest = findOldestDiscountStart(state.contracts);
          if (oldest) {
            state.period.startYear = oldest.year;
            state.period.startMonth = oldest.month;
          }
        }
        render();
        extractHiscrePaymentStatement();
        return buildAgentStateSnapshot();

      case 'RUN_ALL':
        state.open = true;
        render();
        downloadContractsAndExtrato();
        return buildAgentStateSnapshot();

      case 'CANCEL':
        state.cancelRequested = true;
        render();
        return buildAgentStateSnapshot();

      default:
        throw new Error(`Comando de agente desconhecido: ${command}`);
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== AGENT_CMD_CHANNEL || !data.id) return;

    try {
      const result = await handleAgentCommand(data.command, data.params || {});
      window.postMessage({ channel: AGENT_RES_CHANNEL, id: data.id, ok: true, result }, window.location.origin);
    } catch (err) {
      window.postMessage(
        { channel: AGENT_RES_CHANNEL, id: data.id, ok: false, error: err && err.message ? err.message : String(err) },
        window.location.origin
      );
    }
  });
})();
