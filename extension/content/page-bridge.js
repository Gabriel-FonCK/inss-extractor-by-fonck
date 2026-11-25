// Page Bridge (MAIN world) - Meu INSS
// Executa no contexto da página meu.inss.gov.br usando EXCLUSIVAMENTE a sessão autenticada
// aberta pelo próprio usuário (ifs_auth + miToken) e os endpoints oficiais do Meu INSS.
// Não armazena senhas e nunca tenta burlar desafios CAPTCHA.

(function () {
  'use strict';

  const CHANNEL_REQ = 'EXTRATOR_INSS_BRIDGE_REQ';
  const CHANNEL_RES = 'EXTRATOR_INSS_BRIDGE_RES';
  const DEFAULT_API_BASE = 'https://vip-pmeuinss-api.inss.gov.br/apis/';

  // Cache leve capturado de respostas que a própria página do Meu INSS faz
  const runtimeState = {
    lastConsignadoByNb: Object.create(null),
    discoveredNbs: new Map(), // nbDigits -> { nb, especie, situacao }
    lastAuthHeaders: null
  };

  function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string' || token === 'undefined' || token === 'null') {
      return null;
    }
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const jsonStr = new TextDecoder('utf-8').decode(bytes);
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  function safeJsonParse(val) {
    if (!val || typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  function getApiBase() {
    const envBase = window.env && window.env.REACT_APP__URL_API;
    if (typeof envBase === 'string' && envBase.startsWith('https://')) {
      return envBase.endsWith('/') ? envBase : envBase + '/';
    }
    return DEFAULT_API_BASE;
  }

  function ensureClientIds() {
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = (Date.now() + '-' + Math.random().toString(36).substring(2)).substring(0, 25);
      localStorage.setItem('userId', userId);
    }
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = (Date.now() + '-' + Math.random().toString(36).substring(2)).substring(0, 25);
      sessionStorage.setItem('sessionId', sessionId);
    }
    return { userId, sessionId };
  }

  function buildOfficialHeaders(acceptHeader) {
    const token = localStorage.getItem('ifs_auth');
    const miToken = localStorage.getItem('miToken');
    const { userId, sessionId } = ensureClientIds();

    const headers = {
      Accept: acceptHeader || 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      userId,
      sessionId,
      miReferer: window.location.href
    };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (miToken) headers.miToken = miToken;
    if (window.miVersion) headers.miVersion = String(window.miVersion);
    if (window.miPlatform) headers.miPlatform = String(window.miPlatform);

    // Fallback: merge non-sensitive headers observed from Meu INSS XHR if missing
    if (!headers.Authorization && runtimeState.lastAuthHeaders && runtimeState.lastAuthHeaders.Authorization) {
      headers.Authorization = runtimeState.lastAuthHeaders.Authorization;
    }
    if (!headers.miToken && runtimeState.lastAuthHeaders && runtimeState.lastAuthHeaders.miToken) {
      headers.miToken = runtimeState.lastAuthHeaders.miToken;
    }

    return headers;
  }

  function extractNbFromHash() {
    const hash = window.location.hash || '';
    const href = window.location.href || '';
    const m =
      hash.match(/extrato-consignado\/(\d{9,12})/i) ||
      hash.match(/beneficio\/(\d{9,12})/i) ||
      hash.match(/\/(\d{10})(?:\/|$|\?)/) ||
      href.match(/[?&]nb=(\d{9,12})/i);
    return m ? m[1] : '';
  }

  function extractNbsFromDom() {
    const found = [];
    const seen = new Set();

    function addNb(rawDigits, especie = '', situacao = '') {
      const digits = String(rawDigits || '').replace(/\D+/g, '');
      // NB oficial do INSS tem 10 dígitos (evita CPFs de 11 dígitos)
      if (digits.length !== 10 || seen.has(digits)) return;
      seen.add(digits);
      found.push({ nb: digits, especie, situacao });
    }

    try {
      // 1) Cards oficiais do Meu INSS usam aria-label="Número do Benefício (NB) 123.456.789-0, ..."
      const labeledEls = document.querySelectorAll('[aria-label*="Benef"], [aria-label*="NB"]');
      for (const el of labeledEls) {
        const lbl = el.getAttribute('aria-label') || '';
        const m = lbl.match(/(?:NB|Benef[ií]cio)\)?\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d)/i);
        if (m) {
          const sit = (lbl.match(/Situa[cç][aã]o[^,]*?([A-Za-zÀ-ÿ]+)/i) || [])[1] || '';
          addNb(m[1], '', sit);
        }
      }

      // 2) Texto visível da área principal da página (ex.: Extrato Consignado, Meus Benefícios, HISCRE)
      const root = document.querySelector('#conteudo-principal, main, #root') || document.body;
      const text = (root && root.innerText) ? root.innerText : '';
      if (text) {
        const patterns = [
          /N[uú]mero\s+do\s+Benef[ií]cio\s*(?:\(NB\))?\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d)/gi,
          /\bNB\b\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d)/gi,
          /\bBenef[ií]cio\b\s*(?:n[º°]?|NB)?\s*:?\s*(\d{3}\.\d{3}\.\d{3}-\d|\d{10})\b/gi
        ];
        for (const re of patterns) {
          let m;
          while ((m = re.exec(text)) !== null) {
            addNb(m[1]);
          }
        }
      }
    } catch {
      // ignore DOM read errors
    }

    return found;
  }

  function normalizeNbsList(rawNbs) {
    const parsed = safeJsonParse(rawNbs);
    const arr = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    return arr
      .map((item) => {
        if (!item) return null;
        const nb = String(item.nb || item.numeroBeneficio || '').replace(/\D+/g, '');
        if (!nb) return null;
        return {
          nb,
          especie: item.especie || item.descricaoEspecie || (item.especieBeneficio && item.especieBeneficio.descricao) || '',
          situacao: item.situacao || item.descricaoSituacao || ''
        };
      })
      .filter(Boolean);
  }

  function mergeBeneficiosLists(...lists) {
    const map = new Map();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || !item.nb) continue;
        const nb = String(item.nb).replace(/\D+/g, '');
        if (!nb) continue;
        const prev = map.get(nb);
        if (!prev) {
          map.set(nb, { nb, especie: item.especie || '', situacao: item.situacao || '' });
        } else {
          if (!prev.especie && item.especie) prev.especie = item.especie;
          if (!prev.situacao && item.situacao) prev.situacao = item.situacao;
        }
      }
    }
    return Array.from(map.values());
  }

  function getSessionContext() {
    const ifsAuth = localStorage.getItem('ifs_auth');
    const miToken = localStorage.getItem('miToken');
    const authPayload = decodeJwtPayload(ifsAuth);
    const miPayload = decodeJwtPayload(miToken);

    const nowSec = Math.floor(Date.now() / 1000);
    const isLoggedIn = Boolean(authPayload && (!authPayload.exp || authPayload.exp > nowSec));

    let nome = '';
    let cpf = '';
    let tokenBeneficios = [];

    if (authPayload) {
      cpf = String(authPayload.sub || authPayload.cpf || '').replace(/\D+/g, '');
      nome = authPayload.name || authPayload.nome || '';
    }

    if (miPayload) {
      if (!cpf && miPayload.cpf) cpf = String(miPayload.cpf).replace(/\D+/g, '');
      const pessoa = safeJsonParse(miPayload.pessoa);
      if (pessoa && typeof pessoa === 'object') {
        nome = pessoa.nome || pessoa.nomeCompleto || pessoa.nomeSegurado || nome;
      }
      if (miPayload.nbsJson && miPayload.nbsJson !== 'erro') {
        tokenBeneficios = normalizeNbsList(miPayload.nbsJson);
      }
    }

    const nbFromUrl = extractNbFromHash();
    const domBeneficios = extractNbsFromDom();
    const nbFromDom = domBeneficios.length > 0 ? domBeneficios[0].nb : '';
    const cachedBeneficios = Array.from(runtimeState.discoveredNbs.values());

    const beneficios = mergeBeneficiosLists(
      nbFromUrl ? [{ nb: nbFromUrl }] : [],
      domBeneficios,
      tokenBeneficios,
      cachedBeneficios
    );

    const activeNb = nbFromUrl || nbFromDom || (beneficios[0] ? beneficios[0].nb : '');
    const cachedConsignado = activeNb ? runtimeState.lastConsignadoByNb[activeNb] : null;
    if (!nome && cachedConsignado && cachedConsignado.beneficio && cachedConsignado.beneficio.nome) {
      nome = cachedConsignado.beneficio.nome;
    }

    return {
      isLoggedIn,
      cpf,
      nome: String(nome || '').trim(),
      nbFromUrl,
      nbFromDom,
      activeNb,
      beneficios,
      apiBase: getApiBase(),
      captchaAtivo: Boolean(window.env && window.env.REACT_APP__CAPTCHA_ATIVO),
      hasGrecaptcha: Boolean(window.grecaptcha && typeof window.grecaptcha.execute === 'function'),
      cachedConsignado
    };
  }

  // Observação passiva das respostas da própria SPA do Meu INSS para reaproveitar cache de contratos e NBs
  (function hookXhrPassively() {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__extUrl = typeof url === 'string' ? url : String(url || '');
      this.__extHeaders = {};
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      if (this.__extHeaders && /^(authorization|mitoken)$/i.test(k)) {
        this.__extHeaders[k.toLowerCase() === 'authorization' ? 'Authorization' : 'miToken'] = v;
      }
      return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      if (this.__extHeaders && (this.__extHeaders.Authorization || this.__extHeaders.miToken)) {
        runtimeState.lastAuthHeaders = { ...(runtimeState.lastAuthHeaders || {}), ...this.__extHeaders };
      }
      const url = this.__extUrl || '';
      if (url.includes('extratoConsignacoesService/historicoconsignacoes/')) {
        this.addEventListener('load', function () {
          try {
            if (this.status === 200 && this.responseText) {
              const m = url.match(/historicoconsignacoes\/(\d+)/);
              if (m) {
                const json = JSON.parse(this.responseText);
                runtimeState.lastConsignadoByNb[m[1]] = json;
                const ben = json && json.beneficio;
                runtimeState.discoveredNbs.set(m[1], {
                  nb: m[1],
                  especie: ben && ben.especieBeneficio ? ben.especieBeneficio.descricao || '' : '',
                  situacao: ben && ben.situacaoBeneficio ? ben.situacaoBeneficio.descricao || '' : ''
                });
              }
            }
          } catch {
            // ignore passive cache errors
          }
        });
      } else if (url.includes('hiscreServices/historicocreditos/')) {
        this.addEventListener('load', function () {
          try {
            if (this.status === 200 && this.responseText) {
              const json = JSON.parse(this.responseText);
              const list = Array.isArray(json && json.creditosTO) ? json.creditosTO : [];
              for (const cred of list) {
                const nb = String(cred && cred.nb ? cred.nb : '').replace(/\D+/g, '');
                if (nb.length === 10 && !runtimeState.discoveredNbs.has(nb)) {
                  runtimeState.discoveredNbs.set(nb, {
                    nb,
                    especie: cred.especieBeneficioTO ? cred.especieBeneficioTO.descricao || '' : '',
                    situacao: ''
                  });
                }
              }
            }
          } catch {
            // ignore
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  })();

  async function getSilentRecaptchaToken(actionName) {
    const siteKey = window.env && window.env.REACT_APP__CAPTCHA_SITE_KEY_INVISIVEL;
    if (!siteKey) return null;

    // Carrega o script oficial do reCAPTCHA v3 da página caso ainda não tenha sido carregado
    if (!window.grecaptcha || typeof window.grecaptcha.execute !== 'function') {
      await new Promise((resolve) => {
        if (document.getElementById('recaptcha-script')) {
          setTimeout(resolve, 1200);
          return;
        }
        const s = document.createElement('script');
        s.id = 'recaptcha-script';
        s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
        s.async = true;
        s.defer = true;
        s.onload = () => setTimeout(resolve, 400);
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    }

    if (!window.grecaptcha) return null;
    try {
      await new Promise((resolve) => {
        if (typeof window.grecaptcha.ready === 'function') {
          window.grecaptcha.ready(resolve);
        } else {
          resolve();
        }
      });
      if (typeof window.grecaptcha.execute !== 'function') return null;
      return await window.grecaptcha.execute(siteKey, { action: actionName || 'consultar_hiscre' });
    } catch {
      return null;
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function apiFetchJson(relativePath) {
    const url = getApiBase() + relativePath.replace(/^\/+/, '');
    const resp = await fetch(url, {
      method: 'GET',
      headers: buildOfficialHeaders('application/json'),
      credentials: 'omit',
      cache: 'no-store'
    });

    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      status: resp.status,
      ok: resp.ok,
      json,
      text: json ? undefined : text.slice(0, 500)
    };
  }

  async function apiFetchBinary(relativePath) {
    const url = getApiBase() + relativePath.replace(/^\/+/, '');
    const resp = await fetch(url, {
      method: 'GET',
      headers: buildOfficialHeaders('application/pdf, application/octet-stream, image/*, application/json'),
      credentials: 'omit',
      cache: 'no-store'
    });

    const contentType = resp.headers.get('content-type') || '';
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Verifica se o corpo é JSON de erro/captcha em vez de binário (ex.: HISCRE retorna JSON 200 com erro 432)
    let jsonError = null;
    let errorText = '';
    const isPdf = bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isPng = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;

    if (!isPdf && !isJpeg && !isPng && bytes.length < 65536) {
      try {
        const decoded = new TextDecoder('utf-8').decode(bytes).trim();
        errorText = decoded.slice(0, 400);
        if (decoded.startsWith('{') || decoded.startsWith('[')) {
          jsonError = JSON.parse(decoded);
        }
      } catch {
        // not json
      }
    }

    return {
      status: resp.status,
      ok: resp.ok,
      contentType,
      byteLength: bytes.length,
      isPdf,
      isJpeg,
      isPng,
      jsonError,
      errorText,
      base64: bytes.length > 0 && (isPdf || isJpeg || isPng || (resp.ok && !jsonError))
        ? arrayBufferToBase64(buf)
        : null
    };
  }

  async function handleAction(action, payload) {
    switch (action) {
      case 'GET_SESSION':
        return getSessionContext();

      case 'FETCH_CONSIGNADOS': {
        const nb = String(payload.nb || '').replace(/\D+/g, '');
        if (!nb) throw new Error('Número do benefício (NB) não informado.');
        const res = await apiFetchJson(`extratoConsignacoesService/historicoconsignacoes/${nb}`);
        if (res.ok && res.json) {
          runtimeState.lastConsignadoByNb[nb] = res.json;
        }
        return res;
      }

      case 'FETCH_CONTRATO_DOC': {
        const nb = String(payload.nb || '').replace(/\D+/g, '');
        const cbc = String(payload.cbc || '').trim();
        const numeroContrato = String(payload.numeroContrato || '').trim();
        const tipo = Number(payload.tipo); // 1 = DADOS_IDENTIFICACAO, 2 = COPIA_CONTRATO
        const path = `extratoConsignacoesService/contratoconsignacoesPdf/${nb}/${encodeURIComponent(cbc)}/${encodeURIComponent(numeroContrato)}/${tipo}`;
        return await apiFetchBinary(path);
      }

      case 'FETCH_EXTRATO_CONSIGNADO_PDF': {
        const nb = String(payload.nb || '').replace(/\D+/g, '');
        const filtro = Number(payload.filtro || 3); // 1=ATIVOS_SUSPENSOS, 2=ENCERRADOS, 3=TODOS
        return await apiFetchBinary(`formDinServices/historicoConsignado/${nb}/${filtro}`);
      }

      case 'FETCH_HISCRE_JSON': {
        const cpf = String(payload.cpf || '').replace(/\D+/g, '');
        const dataInicio = payload.dataInicio; // DD-MM-YYYY
        const dataFim = payload.dataFim;       // DD-MM-YYYY
        const useCaptcha = Boolean(window.env && window.env.REACT_APP__CAPTCHA_ATIVO);

        let path = `hiscreServices/historicocreditos/${cpf}/${dataInicio}/${dataFim}`;
        if (useCaptcha) {
          const token = await getSilentRecaptchaToken('consultar_hiscre');
          if (token) {
            path += `/captcha-silencioso?captcha=${encodeURIComponent(token)}`;
          }
        }
        return await apiFetchJson(path);
      }

      case 'FETCH_HISCRE_PDF': {
        const cpf = String(payload.cpf || '').replace(/\D+/g, '');
        const dataInicio = payload.dataInicio; // DD-MM-YYYY
        const dataFim = payload.dataFim;       // DD-MM-YYYY
        const useCaptcha = Boolean(window.env && window.env.REACT_APP__CAPTCHA_ATIVO);

        let path = `hiscreServices/historicocreditosPdf/${cpf}/${dataInicio}/${dataFim}`;
        if (useCaptcha) {
          const token = await getSilentRecaptchaToken('consultar_hiscre');
          if (token) {
            path += `/captcha-silencioso?captcha=${encodeURIComponent(token)}`;
          }
        }
        return await apiFetchBinary(path);
      }

      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL_REQ || !data.id) return;

    try {
      const result = await handleAction(data.action, data.payload || {});
      window.postMessage({ channel: CHANNEL_RES, id: data.id, ok: true, result }, window.location.origin);
    } catch (err) {
      window.postMessage(
        { channel: CHANNEL_RES, id: data.id, ok: false, error: err && err.message ? err.message : String(err) },
        window.location.origin
      );
    }
  });

  // -------------------- Universal AI-Agent Browser API (MAIN world) --------------------
  // Permite que qualquer IA operando o navegador (Antigravity, Claude, Playwright MCP,
  // Chrome DevTools MCP etc.) acione a extensão de forma determinística, sem expor tokens ou senhas.
  const AGENT_CMD_CHANNEL = 'EXTRATOR_INSS_AGENT_CMD';
  const AGENT_RES_CHANNEL = 'EXTRATOR_INSS_AGENT_RES';
  const pendingAgentCalls = new Map();
  let agentSeq = 0;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== AGENT_RES_CHANNEL || !data.id) return;
    const entry = pendingAgentCalls.get(data.id);
    if (!entry) return;
    pendingAgentCalls.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error || 'Erro no comando da extensão.'));
  });

  function sendAgentCommand(command, params = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = `ag_${Date.now()}_${++agentSeq}`;
      const timer = setTimeout(() => {
        pendingAgentCalls.delete(id);
        reject(new Error(`Timeout aguardando comando ${command}.`));
      }, timeoutMs);
      pendingAgentCalls.set(id, { resolve, reject, timer });
      window.postMessage({ channel: AGENT_CMD_CHANNEL, id, command, params }, window.location.origin);
    });
  }

  Object.defineProperty(window, 'EXTRATOR_MEU_INSS', {
    configurable: true,
    enumerable: true,
    value: Object.freeze({
      name: 'INSS Extractor by FonCK',
      version: '2.2.0',
      getState: () => sendAgentCommand('GET_STATE'),
      openPanel: () => sendAgentCommand('OPEN_PANEL'),
      closePanel: () => sendAgentCommand('CLOSE_PANEL'),
      configure: (params) => sendAgentCommand('CONFIGURE', params || {}),
      loadContracts: (nb) => sendAgentCommand('LOAD_CONTRACTS', { nb }),
      runContracts: (params) => sendAgentCommand('RUN_CONTRACTS', params || {}),
      runExtrato: (params) => sendAgentCommand('RUN_EXTRATO', params || {}),
      runAll: (params) => sendAgentCommand('RUN_ALL', params || {}),
      cancel: () => sendAgentCommand('CANCEL')
    })
  });
})();
