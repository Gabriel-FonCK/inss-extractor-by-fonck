'use strict';

const cfg = globalThis.FONCK_CONFIG || {};
const btnTheme = document.getElementById('btn-theme');
const btnCopyPix = document.getElementById('btn-copy-pix');
const chkCountEl = document.getElementById('chk-count');

const siteUrl = cfg.siteUrl || 'https://inss-extractor-by-fonck-site.vercel.app/';
const whatsUrl = cfg.whatsappUrl || 'https://wa.me/5521964842518';
const linkedinUrl = cfg.linkedinUrl || 'https://www.linkedin.com/in/fonck';
const githubUrl = cfg.githubRepoUrl || 'https://github.com/Gabriel-FonCK/inss-extractor-by-fonck';
const pixKey = cfg.pixKey || '+5521964842518';

['lnk-site', 'ft-site'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.href = siteUrl;
});
['lnk-whats', 'ft-whats'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.href = whatsUrl;
});
['lnk-linkedin', 'ft-linkedin'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.href = linkedinUrl;
});
const ftGithub = document.getElementById('ft-github');
if (ftGithub) ftGithub.href = githubUrl;

function applyTheme(theme) {
  const mode = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  if (btnTheme) btnTheme.textContent = mode === 'dark' ? '☀ Claro' : '☾ Escuro';
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['extratorTheme'], (res) => {
    if (res && res.extratorTheme) applyTheme(res.extratorTheme);
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  });
} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  applyTheme('dark');
}

if (btnTheme) {
  btnTheme.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ extratorTheme: next });
    }
  });
}

// Interactive onboarding checklist
const steps = Array.from(document.querySelectorAll('[data-chk]'));
function updateCount() {
  const done = steps.filter((s) => s.classList.contains('done')).length;
  if (chkCountEl) chkCountEl.textContent = `${done} de ${steps.length}`;
}
steps.forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('done');
    updateCount();
  });
});
updateCount();

if (btnCopyPix) {
  btnCopyPix.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pixKey);
      btnCopyPix.textContent = 'Chave copiada ✓';
      setTimeout(() => {
        btnCopyPix.textContent = 'Copiar chave Pix';
      }, 2200);
    } catch {
      btnCopyPix.textContent = pixKey;
    }
  });
}
