// Utilitários de PDF 100% locais (sem servidores externos):
// 1) Extração de imagens JPEG embutidas no PDF "Dados de Identificação.pdf"
//    (Documento Oficial Frente, Documento Oficial Verso e Registro Biométrico Facial)
// 2) Mesclagem de múltiplos PDFs oficiais do Extrato de Pagamento (HISCRE) em um único PDF via pdf-lib

(function (global) {
  'use strict';

  function base64ToUint8Array(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  function uint8ArrayToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function bytesToDataUrl(bytes, mimeType) {
    return `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`;
  }

  // Lê largura/altura de um stream JPEG analisando marcadores SOF0/SOF2
  function parseJpegDimensions(jpegBytes) {
    if (jpegBytes.length < 4 || jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
      return null;
    }
    let pos = 2;
    while (pos + 4 < jpegBytes.length) {
      if (jpegBytes[pos] !== 0xFF) {
        pos++;
        continue;
      }
      while (pos < jpegBytes.length && jpegBytes[pos] === 0xFF) pos++;
      if (pos >= jpegBytes.length) break;
      const marker = jpegBytes[pos++];

      // Standalone markers without length
      if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
        continue;
      }
      if (pos + 2 > jpegBytes.length) break;
      const segLen = (jpegBytes[pos] << 8) | jpegBytes[pos + 1];
      if (segLen < 2 || pos + segLen > jpegBytes.length) break;

      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      const isSof =
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF);

      if (isSof && pos + 7 < jpegBytes.length) {
        const height = (jpegBytes[pos + 3] << 8) | jpegBytes[pos + 4];
        const width = (jpegBytes[pos + 5] << 8) | jpegBytes[pos + 6];
        return { width, height };
      }

      if (marker === 0xDA) {
        // Start of Scan - stop reading metadata
        break;
      }
      pos += segLen;
    }
    return null;
  }

  // Varre streams JPEG (/DCTDecode) dentro dos bytes brutos do PDF
  function extractEmbeddedJpegsFromPdf(pdfBytes) {
    const found = [];
    const n = pdfBytes.length;
    let i = 0;

    while (i < n - 10) {
      // JPEG SOI: FF D8 FF
      if (pdfBytes[i] === 0xFF && pdfBytes[i + 1] === 0xD8 && pdfBytes[i + 2] === 0xFF) {
        // Procura EOI (FF D9) respeitando segmentos com comprimento para não parar em thumbnails EXIF
        let pos = i + 2;
        let endIdx = -1;
        let inEntropy = false;

        while (pos < n - 1) {
          if (!inEntropy) {
            if (pdfBytes[pos] !== 0xFF) {
              pos++;
              continue;
            }
            while (pos < n && pdfBytes[pos] === 0xFF) pos++;
            if (pos >= n) break;
            const marker = pdfBytes[pos++];

            if (marker === 0xD9) {
              endIdx = pos;
              break;
            }
            if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
              continue;
            }
            if (pos + 2 > n) break;
            const segLen = (pdfBytes[pos] << 8) | pdfBytes[pos + 1];
            if (segLen < 2) break;
            pos += segLen;
            if (marker === 0xDA) {
              inEntropy = true;
            }
          } else {
            // Dentro dos dados comprimidos, procura FF seguido de marcador não-stuffing (00) e não-RST (D0..D7)
            if (pdfBytes[pos] === 0xFF) {
              const next = pdfBytes[pos + 1];
              if (next === 0x00 || (next >= 0xD0 && next <= 0xD7) || next === 0xFF) {
                pos += 2;
                continue;
              }
              if (next === 0xD9) {
                endIdx = pos + 2;
                break;
              }
              // Outro marcador (ex.: nova tabela DHT/DQT/SOS em JPEG progressivo)
              inEntropy = false;
              continue;
            }
            pos++;
          }
        }

        if (endIdx > i + 1024) {
          const slice = pdfBytes.subarray(i, endIdx);
          const dims = parseJpegDimensions(slice);
          if (dims && dims.width >= 120 && dims.height >= 120) {
            found.push({
              bytes: slice,
              width: dims.width,
              height: dims.height,
              size: slice.length,
              offset: i
            });
          }
          i = endIdx;
          continue;
        }
      }
      i++;
    }

    // Remove possíveis logos de cabeçalho do INSS/Gov.br (imagens muito estreitas/baixas ou idênticas repetidas)
    // Mantém imagens substanciais (documentos e biometria facial)
    const filtered = found.filter((img) => {
      const aspect = img.width / img.height;
      // Logos horizontais de cabeçalho geralmente têm proporção > 3.2 e altura pequena (< 180px)
      if (aspect > 3.2 && img.height < 200) return false;
      // Arquivos muito minúsculos (< 3 KB) raramente são fotos de documento/selfie
      if (img.size < 3072 && Math.max(img.width, img.height) < 250) return false;
      return true;
    });

    return filtered;
  }

  // Classifica as imagens extraídas de "Dados de Identificação.pdf"
  // Padrão INSS/Dataprev:
  // - 3+ imagens: [0] Documento Oficial Frente, [1] Documento Oficial Verso, [2] Registro Biométrico Facial
  //   (ou selfie em formato retrato/menor se houver 2 imagens)
  // - 2 imagens: [0] Documento Oficial Frente, [1] Registro Biométrico Facial (ou Verso)
  // - 1 imagem: Registro Biométrico Facial ou Documento Oficial Frente
  function classifyIdentificationImages(pdfBytes) {
    const images = extractEmbeddedJpegsFromPdf(pdfBytes);
    const result = {
      docFrente: null,
      docVerso: null,
      biometria: null,
      extras: []
    };

    if (images.length === 0) return result;

    if (images.length >= 3) {
      result.docFrente = images[0];
      result.docVerso = images[1];
      result.biometria = images[2];
      result.extras = images.slice(3);
    } else if (images.length === 2) {
      result.docFrente = images[0];
      // Heurística: se a 2ª imagem for retrato/quadrada (typical selfie), classifica como biometria;
      // caso contrário salva como verso, mas expõe ambos os slots claramente
      const second = images[1];
      const aspect2 = second.width / second.height;
      if (aspect2 <= 1.05) {
        result.biometria = second;
      } else {
        result.docVerso = second;
      }
    } else if (images.length === 1) {
      const only = images[0];
      const aspect = only.width / only.height;
      if (aspect <= 1.05) {
        result.biometria = only;
      } else {
        result.docFrente = only;
      }
    }

    return result;
  }

  // Mescla um array de Uint8Array (PDFs oficiais do INSS) em um único PDF preservando a ordem
  async function mergePdfBuffers(pdfBuffers) {
    if (!global.PDFLib || !global.PDFLib.PDFDocument) {
      throw new Error('Biblioteca local pdf-lib não carregada.');
    }
    const { PDFDocument } = global.PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const buf of pdfBuffers) {
      if (!buf || buf.length < 10) continue;
      const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const page of copiedPages) {
        mergedPdf.addPage(page);
      }
    }

    if (mergedPdf.getPageCount() === 0) {
      throw new Error('Nenhuma página válida encontrada nos PDFs do extrato.');
    }

    return await mergedPdf.save();
  }

  global.EXTRATOR_INSS_PDF = {
    base64ToUint8Array,
    uint8ArrayToBase64,
    bytesToDataUrl,
    extractEmbeddedJpegsFromPdf,
    classifyIdentificationImages,
    mergePdfBuffers
  };
})(globalThis);
