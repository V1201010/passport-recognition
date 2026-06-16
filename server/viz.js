// Парсер визуальной зоны (VIZ) паспорта из OCR-текста.
// Ищет дату выдачи и орган выдачи по названию поля, с запасным методом исключения для дат.

const ISSUE_DATE_LABEL_PATTERNS = [
  /berilgan[\s\S]{0,8}sana/i,
  /date[\s\S]{0,5}of[\s\S]{0,5}issue/i,
  /дата[\s\S]{0,8}выдач/i,
];

const ISSUED_BY_LABEL_PATTERNS = [
  /berilgan[\s\S]{0,8}joy/i,
  /place[\s\S]{0,5}of[\s\S]{0,5}issue/i,
  /lieu[\s\S]{0,5}de[\s\S]{0,5}d[eé]livrance/i,
  /место[\s\S]{0,8}выдач/i,
  /орган[\s\S]{0,8}выдач/i,
  /кем[\s\S]{0,5}выдан/i,
];

const DATE_RE = /\b(\d{2})[.\-](\d{2})[.\-](\d{4})\b/;
const DATE_RE_GLOBAL = /\b(\d{2})[.\-](\d{2})[.\-](\d{4})\b/g;

function normalizeDate(raw) {
  const m = raw.match(DATE_RE);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function firstTextLine(str) {
  return (str || '')
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 2) || null;
}

function extractIssueDateFromText(fullText, knownDates) {
  // Primary: find by field label, then grab the nearest date within 150 chars after it
  for (const labelPattern of ISSUE_DATE_LABEL_PATTERNS) {
    const labelMatch = fullText.match(labelPattern);
    if (labelMatch) {
      const afterLabel = fullText.substring(
        labelMatch.index + labelMatch[0].length,
        labelMatch.index + labelMatch[0].length + 150
      );
      const dateMatch = afterLabel.match(DATE_RE);
      if (dateMatch) return normalizeDate(dateMatch[0]);
    }
  }

  // Fallback: collect all dates, exclude birth date and expiry date
  const allDates = [];
  let m;
  const re = new RegExp(DATE_RE_GLOBAL.source, 'g');
  while ((m = re.exec(fullText)) !== null) {
    allDates.push(`${m[1]}.${m[2]}.${m[3]}`);
  }
  const known = new Set(knownDates.filter(Boolean));
  const candidates = [...new Set(allDates)].filter(d => !known.has(d));
  return candidates[0] || null;
}

function extractIssuedByFromText(fullText) {
  for (const labelPattern of ISSUED_BY_LABEL_PATTERNS) {
    const labelMatch = fullText.match(labelPattern);
    if (labelMatch) {
      const afterLabel = fullText
        .substring(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 250)
        .trim();
      const line = firstTextLine(afterLabel);
      if (line && line.length > 2) return line;
    }
  }
  return null;
}

function parseViz(fullText, mrzData) {
  const knownDates = mrzData ? [mrzData.birthDate, mrzData.expiryDate] : [];
  return {
    issueDate: extractIssueDateFromText(fullText, knownDates),
    issuedBy: extractIssuedByFromText(fullText),
  };
}

module.exports = { parseViz };
