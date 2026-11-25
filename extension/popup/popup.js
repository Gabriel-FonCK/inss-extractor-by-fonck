'use strict';

const cfg = globalThis.FONCK_CONFIG || {};
const statusEl = document.getElementById('status');
const btnOpen = document.getElementById('btn-open');
const btnGo = document.getElementById('btn-go');
const btnWelcome = document.getElementById('btn-welcome');
const btnTheme = document.getElementById('btn-theme');

document.getElementById('lnk-site').href = cfg.siteUrl || 'https://inss-extractor-by-fonck-site.vercel.app/';
document.getElementById('lnk-github').href = cfg.githubRepoUrl || 'https://github.com/Gabriel-FonCK/inss-extractor-by-fonck';
document.getElementById('lnk-whats').href = cfg.whatsappUrl || 'https://wa.me/5521964842518';
document.getElementById('lnk-linkedin').href = cfg.linkedinUrl || 'https://www.linkedin.com/in/fonck';

function applyTheme(theme) {
  const mode = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  btnTheme.textContent = mode === 'dark' ? '☀' : '☾';
  btnTheme.title = mode === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
}

if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['extratorTheme'], (res) => {
    applyTheme(res && res.extratorTheme);
  });
}

btnTheme.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ extratorTheme: next });
  }
});

btnOpen.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXTRATOR_TOGGLE_PANEL' }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok) {
      statusEl.textContent = 'Abra primeiro uma aba em meu.inss.gov.br e clique novamente.';
      return;
    }
    window.close();
  });
});

btnGo.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://meu.inss.gov.br/' });
  window.close();
});

btnWelcome.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXTRATOR_OPEN_WELCOME' });
  window.close();
});
