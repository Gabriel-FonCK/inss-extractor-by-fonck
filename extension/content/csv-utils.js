// Geradores de planilhas CSV prontas para Excel PT-BR (UTF-8 com BOM + separador ';')
// 1) Resumo dos contratos.csv
// 2) Extrato de pagamento MM-YYYY a MM-YYYY.csv (mês a mês, uma coluna por rubrica)

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
    formatMoneyBR,
    formatDateBR,
    formatCompetencia
  };
})(globalThis);
