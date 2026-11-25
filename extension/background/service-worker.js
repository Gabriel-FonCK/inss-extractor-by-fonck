'use strict';

// Background Service Worker (Manifest V3) — INSS Extractor by FonCK (v2.4.0)
// Gerencia downloads organizados em Downloads/Contratos INSS/ com conflictAction: 'overwrite'
// e abre a página de boas-vindas (welcome/welcome.html) ao instalar a extensão.

function sanitizePathSegment(segment) {
  return (
    String(segment || '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 120) || 'SEM_NOME'
  );
}

function sanitizeRelativeFilename(relativePath) {
  const parts = String(relativePath || '')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..');

  if (!parts.length) {
    throw new Error('Caminho de arquivo vazio.');
  }

  return parts
    .map((part, idx) => {
      if (idx === parts.length - 1) {
        const dotIdx = part.lastIndexOf('.');
        if (dotIdx > 0 && dotIdx < part.length - 1) {
          const base = sanitizePathSegment(part.slice(0, dotIdx));
          const ext =
            part
              .slice(dotIdx + 1)
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 10) || 'bin';
          return `${base}.${ext}`;
        }
      }
      return sanitizePathSegment(part);
    })
    .join('/');
}

function downloadFile({ dataUrl, filename }) {
  return new Promise((resolve, reject) => {
    let safePath;
    try {
      safePath = sanitizeRelativeFilename(filename);
    } catch (err) {
      reject(err);
      return;
    }

    chrome.downloads.download(
      {
        url: dataUrl,
        filename: safePath,
        conflictAction: 'overwrite',
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (typeof downloadId !== 'number') {
          reject(new Error('Falha ao iniciar download no navegador.'));
          return;
        }

        const onChanged = (delta) => {
          if (delta.id !== downloadId) return;
          if (delta.state && delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve({ downloadId, filename: safePath });
          } else if (delta.error && delta.error.current) {
            chrome.downloads.onChanged.removeListener(onChanged);
            reject(new Error(`Erro no download (${delta.error.current})`));
          }
        };
        chrome.downloads.onChanged.addListener(onChanged);

        setTimeout(() => {
          chrome.downloads.onChanged.removeListener(onChanged);
          resolve({ downloadId, filename: safePath, pending: true });
        }, 15000);
      }
    );
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details && details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'EXTRATOR_DOWNLOAD') {
    downloadFile({ dataUrl: msg.dataUrl, filename: msg.filename })
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (msg.type === 'EXTRATOR_OPEN_WELCOME') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'EXTRATOR_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (msg.type === 'EXTRATOR_TOGGLE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        sendResponse({ ok: false, error: 'Nenhuma aba ativa encontrada.' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRATOR_OPEN_PANEL' }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, resp });
      });
    });
    return true;
  }

  return false;
});
