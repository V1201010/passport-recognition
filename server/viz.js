// Парсер визуальной зоны (VIZ) паспорта из OCR-текста.
// VIZ узбекского паспорта — только латиница (узбекский алфавит).

const SURNAME_LABEL_PATTERNS = [
  /familiyasi/i,
  /surname/i,
];

const GIVEN_NAMES_LABEL_PATTERNS = [
  /ismi/i,
  /given[\s\S]{0,5}names/i,
];

const ISSUE_DATE_LABEL_PATTERNS = [
  /berilgan[\s\S]{0,8}sana/i,
  /date[\s\S]{0,5}of[\s\S]{0,5}issue/i,
  /дата[\s\S]{0,8}выдач/i,
];

const ISSUED_BY_LABEL_PATTERNS = [
  /berilgan[\s\S]{0,8}joy/i,
  /tomonidan[\s\S]{0,8}berilgan/i,
  /beruvchi[\s\S]{0,8}organ/i,
  /place[\s\S]{0,5}of[\s\S]{0,5}issue/i,
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

// Извлекает латинское имя (заглавные буквы) после метки поля
function extractLatinAfterLabel(fullText, labelPatterns) {
  for (const labelPattern of labelPatterns) {
    const labelMatch = fullText.match(labelPattern);
    if (!labelMatch) continue;
    const after = fullText.substring(
      labelMatch.index + labelMatch[0].length,
      labelMatch.index + labelMatch[0].length + 300
    ).trim();
    const lines = after.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    for (const line of lines.slice(0, 5)) {
      // Ищем строку из латинских заглавных букв (имя в VIZ)
      const latinMatch = line.match(/[A-Z]{2,}(?:[\s\-'][A-Z]{2,})*/);
      if (latinMatch && !/^[A-Z]{2}$/.test(latinMatch[0])) { // исключаем двухбуквенные коды
        return latinMatch[0].trim();
      }
    }
  }
  return null;
}

function extractIssueDateFromText(fullText, knownDates) {
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
  // Запасной метод: исключаем известные даты
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
        .substring(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 300)
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
    surnameRaw: extractLatinAfterLabel(fullText, SURNAME_LABEL_PATTERNS),
    givenNamesRaw: extractLatinAfterLabel(fullText, GIVEN_NAMES_LABEL_PATTERNS),
    issueDate: extractIssueDateFromText(fullText, knownDates),
    issuedBy: extractIssuedByFromText(fullText),
  };
}

module.exports = { parseViz };
