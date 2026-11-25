// Geradores de relatórios e planilhas prontos para Windows/Excel PT-BR (UTF-8 com BOM)
// 1) Resumo dos contratos.csv (separador ';')
// 2) Extrato de pagamento MM-YYYY a MM-YYYY.csv (mês a mês, uma coluna por rubrica)
// 3) CONTRATOS-PENDENTES.txt (lista única agrupada por banco dos contratos sem cópia)

(function (global) {
  'use strict';

  function escapeCsvCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/\r\n|\r|\n/g, ' ').trim();
    if (str.includes(';') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function formatMoneyBR(val) {
    if (val === null || val === undefined || val === '') return '';
    const num = typeof val === 'number' ? val : Number(String(val).replace(',', '.'));
    if (!Number.isFinite(num)) return String(val);
    return num.toFixed(2).replace('.', ',');
  }

  function formatDateBR(val) {
    if (!val) return '';
    const s = String(val).trim();
    // YYYY-MM-DD -> DD/MM/YYYY
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    // DD-MM-YYYY -> DD/MM/YYYY (formato real retornado pela Dataprev em dtInclusao)
    const brDash = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (brDash) return `${brDash[1]}/${brDash[2]}/${brDash[3]}`;
    // YYYYMM -> MM/YYYY
    if (/^\d{6}$/.test(s)) return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
    return s;
  }

  function formatCompetencia(val) {
    if (!val) return '';
    const digits = String(val).replace(/\D+/g, '');
    if (digits.length === 6) {
      return `${digits.slice(4, 6)}/${digits.slice(0, 4)}`;
    }
    return String(val);
  }

  function buildCsvDataUrl(rows) {
    const csvText = '\uFEFF' + rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n');
    const bytes = new TextEncoder().encode(csvText);
    const base64 = global.EXTRATOR_INSS_PDF.uint8ArrayToBase64(bytes);
    return `data:text/csv;charset=utf-8;base64,${base64}`;
  }

  function buildTextDataUrl(text) {
    const utf8Text = '\uFEFF' + String(text || '');
    const bytes = new TextEncoder().encode(utf8Text);
    const base64 = global.EXTRATOR_INSS_PDF.uint8ArrayToBase64(bytes);
    return `data:text/plain;charset=utf-8;base64,${base64}`;
  }

  function formatMoneyDisplayBR(val) {
    if (val === null || val === undefined || val === '') return '-';
    const num = typeof val === 'number' ? val : Number(String(val).replace(',', '.'));
    if (!Number.isFinite(num)) return String(val);
    const [intPart, decPart] = num.toFixed(2).split('.');
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `R$ ${intFormatted},${decPart}`;
  }

  function formatTimestampBR(dateObj) {
    const dt = dateObj instanceof Date ? dateObj : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  function isContractSemCopia(contract) {
    const st = contract && contract.downloadStatus;
    if (!st) return false;
    return st.contratoPdf === 'Sem cópia' || st.state === 'nocopy';
  }

  // Relatório único: CONTRATOS-PENDENTES.txt (agrupado por banco)
  function generateContratosPendentesTxt(contracts, meta = {}) {
    const list = Array.isArray(contracts) ? contracts.filter(isContractSemCopia) : [];
    if (!list.length) {
      return { count: 0, bankCount: 0, banks: [], text: '', dataUrl: null };
    }

    const bankMap = new Map();
    for (const c of list) {
      const cbc = String(c.cbc || '').trim();
      const banco = String(c.banco || (cbc ? `BANCO ${cbc}` : 'BANCO NÃO INFORMADO')).trim();
      const key = `${cbc}|${banco.toUpperCase()}`;
      if (!bankMap.has(key)) {
        bankMap.set(key, { cbc, banco, items: [] });
      }
      bankMap.get(key).items.push(c);
    }

    const groups = Array.from(bankMap.values()).sort((a, b) =>
      a.banco.localeCompare(b.banco, 'pt-BR', { sensitivity: 'base' })
    );

    for (const g of groups) {
      g.items.sort((a, b) => {
        const da = String(b.dateIso || '').localeCompare(String(a.dateIso || ''));
        if (da !== 0) return da;
        return String(a.numeroContrato || '').localeCompare(String(b.numeroContrato || ''));
      });
    }

    const sep = '='.repeat(72);
    const subSep = '-'.repeat(72);
    const cliente = (meta && meta.cliente) || 'NÃO INFORMADO';
    const nb = (meta && (meta.nbFormatted || meta.nb)) || 'NÃO INFORMADO';
    const generatedAt = (meta && meta.generatedAt) || formatTimestampBR(new Date());

    const lines = [
      'CONTRATOS PENDENTES — BANCOS SEM CÓPIA DO CONTRATO NO MEU INSS',
      sep,
      `Cliente: ${cliente}`,
      `Benefício (NB): ${nb}`,
      `Data da consulta: ${generatedAt}`,
      `Total sem cópia: ${list.length} contrato(s) em ${groups.length} banco(s)`,
      sep,
      '',
      'RESUMO POR BANCO',
      subSep
    ];

    for (const g of groups) {
      const prefix = g.cbc ? `[${g.cbc}] ` : '';
      const tipos = Array.from(new Set(g.items.map((it) => it.tipoLabel || 'Empréstimo'))).join(', ');
      lines.push(`- ${prefix}${g.banco} — ${g.items.length} contrato(s) sem cópia (${tipos})`);
    }

    lines.push('', 'LISTA DETALHADA POR BANCO', subSep);

    for (const g of groups) {
      const prefix = g.cbc ? `[${g.cbc}] ` : '';
      lines.push('', `${prefix}${g.banco} (${g.items.length} contrato(s))`);

      g.items.forEach((c, idx) => {
        const st = c.downloadStatus || {};
        const tipo = c.tipoLabel || 'Empréstimo';
        const situacao = c.situacao || 'Indefinida';
        const dataInc = formatDateBR(c.dataInclusao) || '-';
        const compIni = formatCompetencia(c.competenciaInicioDesconto);
        const compFim = formatCompetencia(c.competenciaFimDesconto);
        const desconto = compIni && compFim ? `${compIni} a ${compFim}` : (compIni || compFim || '-');
        const parcelas =
          c.quantidadeParcelas !== undefined && c.quantidadeParcelas !== null && c.quantidadeParcelas !== ''
            ? String(c.quantidadeParcelas)
            : '-';
        const vParcela = formatMoneyDisplayBR(c.valorParcela);
        const vEmprestado = formatMoneyDisplayBR(c.valorEmprestado);
        const stContrato = st.contratoPdf || 'Sem cópia';
        const stId = st.dadosIdPdf || '-';

        lines.push(`  ${idx + 1}. Contrato nº ${c.numeroContrato || 'SEM_NUMERO'} | ${tipo} | ${situacao}`);
        lines.push(`     Inclusão: ${dataInc} | Desconto: ${desconto} | Parcelas: ${parcelas}`);
        lines.push(`     Parcela/Reservado: ${vParcela} | Emprestado/Limite: ${vEmprestado}`);
        lines.push(`     Status: Contrato PDF: ${stContrato} | Dados Identificação: ${stId}`);
        if (idx < g.items.length - 1) lines.push('');
      });
    }

    lines.push(
      '',
      sep,
      'Gerado localmente pelo INSS Extractor by FonCK (Licença MIT)'
    );

    const text = lines.join('\r\n');
    return {
      count: list.length,
      bankCount: groups.length,
      banks: groups.map((g) => ({ cbc: g.cbc, banco: g.banco, count: g.items.length })),
      text,
      dataUrl: buildTextDataUrl(text)
    };
  }

  // Planilha 1: Resumo dos contratos.csv
  function generateContratosResumoCsv(contracts, meta) {
    const headers = [
      'Cliente',
      'NB',
      'Tipo',
      'Situação',
      'Data Inclusão',
      'Código Banco (CBC)',
      'Banco',
      'Número do Contrato',
      'Início Desconto',
      'Fim Desconto',
      'Qtd Parcelas',
      'Valor Parcela / Reservado (R$)',
      'Valor Emprestado / Limite (R$)',
      'Status Download',
      'Contrato PDF',
      'Dados Identificação PDF',
      'Documento Oficial',
      'Biometria Facial',
      'Pasta'
    ];

    const rows = [headers];
    for (const c of contracts) {
      const st = c.downloadStatus || {};
      rows.push([
        meta.cliente || '',
        meta.nbFormatted || meta.nb || '',
        c.tipoLabel || 'Empréstimo',
        c.situacao || '',
        formatDateBR(c.dataInclusao),
        c.cbc || '',
        c.banco || '',
        c.numeroContrato || '',
        formatCompetencia(c.competenciaInicioDesconto),
        formatCompetencia(c.competenciaFimDesconto),
        c.quantidadeParcelas !== undefined && c.quantidadeParcelas !== null ? c.quantidadeParcelas : '',
        formatMoneyBR(c.valorParcela),
        formatMoneyBR(c.valorEmprestado),
        st.label || 'Pendente',
        st.contratoPdf || '-',
        st.dadosIdPdf || '-',
        st.documentoOficial || '-',
        st.biometriaFacial || '-',
        c.categoryFolder ? `${c.categoryFolder}/${c.folderName || ''}` : (c.folderName || '')
      ]);
    }

    return buildCsvDataUrl(rows);
  }

  function resolveRubricaName(rubrica) {
    const code = String(rubrica.codigoRubrica || rubrica.codigo || '').trim();
    const apiDesc =
      rubrica.descricaoRubrica ||
      rubrica.nomeRubrica ||
      rubrica.descricao ||
      rubrica.desRubrica ||
      '';
    const catalog = global.EXTRATOR_INSS_RUBRICAS || {};
    const catalogDesc = catalog[code] || '';
    const desc = String(apiDesc || catalogDesc || 'Rubrica').trim();
    return code ? `${code} - ${desc}` : desc;
  }

  function resolveSituacaoCredito(credito) {
    if (!credito) return '';
    if (credito.statusCredito && credito.statusCredito.descricao) return credito.statusCredito.descricao;
    if (credito.situacaoCredito) return String(credito.situacaoCredito);
    if (credito.dtPgtoCredito) return 'Pago';
    return '';
  }

  function resolveTipoPagamento(credito) {
    const o = credito && credito.origemCreditoTO;
    if (!o) return '';
    return o.descricao || o.nome || o.sigla || '';
  }

  function resolveEspecie(credito) {
    const e = credito && credito.especieBeneficioTO;
    if (!e) return '';
    const cod = e.codigo || e.id || '';
    const desc = e.descricao || e.nome || '';
    return cod && desc ? `${cod} - ${desc}` : (desc || String(cod));
  }

  // Planilha 2: Extrato de pagamento mês a mês (cada rubrica em uma coluna)
  function generateHiscreRubricasCsv(creditosList) {
    const rubricaColMap = new Map(); // code -> header label

    // Ordena cronologicamente (competência ascendente, depois NB)
    const sorted = [...creditosList].sort((a, b) => {
      const ca = String(a.dtCompetenciaCredito || '').padEnd(6, '0');
      const cb = String(b.dtCompetenciaCredito || '').padEnd(6, '0');
      if (ca !== cb) return ca.localeCompare(cb);
      return String(a.nb || '').localeCompare(String(b.nb || ''));
    });

    // Descobre todas as rubricas presentes no período
    for (const cred of sorted) {
      const rubricas = Array.isArray(cred.rubricasCreditoTO) ? cred.rubricasCreditoTO : [];
      for (const r of rubricas) {
        const code = String(r.codigoRubrica || r.codigo || 'SEM_COD').trim();
        if (!rubricaColMap.has(code)) {
          rubricaColMap.set(code, resolveRubricaName(r));
        }
      }
    }

    // Ordena colunas de rubricas numericamente pelo código (1xx créditos primeiro, 2xx descontos depois)
    const rubricaCodes = Array.from(rubricaColMap.keys()).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const fixedHeaders = [
      'Competência',
      'NB',
      'Espécie',
      'Data Pagamento',
      'Período Início',
      'Período Fim',
      'Situação',
      'Tipo Pagamento',
      'Total Bruto (R$)',
      'Total Descontos (R$)',
      'Valor Líquido (R$)'
    ];

    const rubricaHeaders = rubricaCodes.map((code) => rubricaColMap.get(code));
    const rows = [[...fixedHeaders, ...rubricaHeaders]];

    for (const cred of sorted) {
      const rubricas = Array.isArray(cred.rubricasCreditoTO) ? cred.rubricasCreditoTO : [];
      const sumByCode = new Map();
      let totalBruto = 0;
      let totalDescontos = 0;

      for (const r of rubricas) {
        const code = String(r.codigoRubrica || r.codigo || 'SEM_COD').trim();
        const val = Number(r.valorRubrica || 0);
        if (Number.isFinite(val)) {
          sumByCode.set(code, (sumByCode.get(code) || 0) + val);
          if (code.startsWith('1')) totalBruto += val;
          else if (code.startsWith('2')) totalDescontos += val;
        }
      }

      const fixedValues = [
        formatCompetencia(cred.dtCompetenciaCredito),
        cred.nb || '',
        resolveEspecie(cred),
        cred.dtPgtoCredito || cred.dtInicioValidade || '',
        cred.dtInicioPeriodo || '',
        cred.dtFimPeriodo || '',
        resolveSituacaoCredito(cred),
        resolveTipoPagamento(cred),
        formatMoneyBR(totalBruto),
        formatMoneyBR(totalDescontos),
        formatMoneyBR(cred.valorLiquido)
      ];

      const rubricaValues = rubricaCodes.map((code) =>
        sumByCode.has(code) ? formatMoneyBR(sumByCode.get(code)) : ''
      );

      rows.push([...fixedValues, ...rubricaValues]);
    }

    return buildCsvDataUrl(rows);
  }

  global.EXTRATOR_INSS_CSV = {
    generateContratosResumoCsv,
    generateHiscreRubricasCsv,
    generateContratosPendentesTxt,
    isContractSemCopia,
    formatMoneyBR,
    formatDateBR,
    formatCompetencia
  };
})(globalThis);
