// VIZ-парсер: дата выдачи и кем выдан — только отсюда.
// ФИО из VIZ используется только для кросс-проверки с MRZ.
// Логику не менять: MRZ — первичный источник, VIZ — поддерживающий.

const DATE_RE = /\b(\d{2})[.\s](\d{2})[.\s](\d{4})\b/;
const DATE_RE_G = /\b(\d{2})[.\s](\d{2})[.\s](\d{4})\b/g;

function normalizeDate(raw) {
  const m = raw.match(DATE_RE);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function firstLine(str) {
  if (!str) return null;
  return str.split('\n').map(l => l.trim()).find(l => l.length > 1) || null;
}

function afterLabel(fullText, pattern, windowSize = 250) {
  const m = fullText.match(pattern);
  if (!m) return null;
  return fullText.substring(m.index + m[0].length, m.index + m[0].length + windowSize).trim();
}

// Страно-специфичные конфиги
const COUNTRY_CONFIG = {
  UZB: {
    surname:       /famil\S*\s*[\/|]\s*surname|surname/i,
    givenNames:    /ism\S*\s*[\/|]\s*given\s*names|given\s*names/i,
    fathersName:   /otasining|father['']?s?\s*name/i,
    doi:           /berilgan\s*sanasi\s*[\/|]\s*date\s*of\s*issue|date\s*of\s*issue/i,
    authorityCode: /(?:MIA|PSC)\s+\d+/i,
    authority:     /kim\s*tomonidan|authority/i,
    cyrillic:      false,
  },
  TJK: {
    surname:       /фамили[яи]/i,
    givenNames:    /имя\s*[,\/|]?\s*отчество|имена/i,
    fathersName:   null,
    doi:           /дата\s*выдач/i,
    authorityCode: null,
    authority:     /место\s*выдач|орган\s*выдач|кем\s*выдан/i,
    cyrillic:      true,
  },
  KGZ: {
    surname:       /фамилияс[ыи]|фамили[яи]|surname/i,
    givenNames:    /аты[,\s]+атасынын\s*аты|имя\s+отчество|given\s+names/i,
    fathersName:   null,
    doi:           /берилген\s*күнү|дата\s*выдачи|date\s*of\s*issue/i,
    authorityCode: /MDD\s+\d+|ОМД\s+\d+|ДМД\s+\d+/i,
    authority:     /берген\s*мекеме|орган\s*выдачи|authority/i,
    cyrillic:      true,
  },
  TKM: {
    surname:       /famil[iý]asy\s*[\/|]\s*surname|surname/i,
    givenNames:    /ady\s*[\/|]\s*given\s*name|given\s*name/i,
    fathersName:   null,
    doi:           /berlen\s*senesi\s*[\/|]\s*date\s*of\s*issue|date\s*of\s*issue/i,
    authorityCode: /SMST\d*/i,
    authority:     /pasyport\s*beren\s*edara\s*[\/|]\s*authority|authority/i,
    cyrillic:      false,
  },
};

function extractLatinName(text) {
  const m = text.match(/[A-Z]{2,}(?:[\s\-'][A-Z]{2,})*/);
  return (m && m[0].length > 2) ? m[0].trim() : null;
}

function extractCyrillicName(text) {
  const m = text.match(/[А-ЯЁ]{2,}(?:[\s\-][А-ЯЁ]{2,})*/);
  return m ? m[0].trim() : null;
}

function extractNameAfterLabel(fullText, labelPattern, cyrillic) {
  if (!labelPattern) return null;
  const after = afterLabel(fullText, labelPattern, 300);
  if (!after) return null;
  const lines = after.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  for (const line of lines.slice(0, 5)) {
    if (line.includes('/') || line.includes('|')) continue; // пропускаем строки-лейблы типа "ISMI / GIVEN NAMES"
    const name = cyrillic ? extractCyrillicName(line) : extractLatinName(line);
    if (name) return name;
  }
  return null;
}

function extractDateAfterLabel(fullText, labelPattern) {
  if (!labelPattern) return null;
  const after = afterLabel(fullText, labelPattern, 150);
  return after ? normalizeDate(after) : null;
}

function extractAuthority(fullText, cfg) {
  if (!cfg) return null;
  // Ищем код органа в радиусе от метки
  if (cfg.authority) {
    const labelMatch = fullText.match(cfg.authority);
    if (labelMatch) {
      const window = fullText.substring(labelMatch.index, labelMatch.index + 400);
      if (cfg.authorityCode) {
        const code = window.match(cfg.authorityCode);
        if (code) return code[0].trim();
      }
      const after = fullText.substring(labelMatch.index + labelMatch[0].length, labelMatch.index + 300).trim();
      const line = firstLine(after);
      if (line && line.length > 2) return line;
    }
  }
  // Прямой поиск кода в тексте
  if (cfg.authorityCode) {
    const m = fullText.match(cfg.authorityCode);
    if (m) return m[0].trim();
  }
  return null;
}

// MRZ — первичный источник. VIZ — резерв если MRZ пустой.
function pickBetter(mrzValue, vizValue) {
  return mrzValue || vizValue;
}

// Для фамилии: дополнительно проверяем B-drop артефакт.
// OCR сливает одинаковые буквы на стыке страна+фамилия: UZB+BUKHOROV → UZBUKHOROV.
// Признак: последняя буква кода страны == первая буква VIZ фамилии != первая буква MRZ фамилии.
function pickBetterSurname(mrzValue, vizValue, countryCode) {
  if (!mrzValue) return vizValue;
  if (!vizValue) return mrzValue;

  const lastCountryChar = (countryCode || '').slice(-1).toUpperCase();
  if (lastCountryChar) {
    const mrzFirst = mrzValue.toUpperCase().trim()[0];
    const vizFirst = vizValue.toUpperCase().trim()[0];
    if (lastCountryChar === vizFirst && lastCountryChar !== mrzFirst) {
      return vizValue; // B-drop: фамилия из VIZ
    }
  }

  return mrzValue;
}

function parseViz(fullText, mrzData, translitFn) {
  const country = (mrzData?.issuingCountry || '').toUpperCase();
  const cfg = COUNTRY_CONFIG[country] || null;

  // --- ФИО из VIZ (только для кросс-проверки с MRZ) ---
  const vizSurnameRaw = extractNameAfterLabel(fullText, cfg?.surname, cfg?.cyrillic);
  const vizGivenNamesRaw = extractNameAfterLabel(fullText, cfg?.givenNames, cfg?.cyrillic);
  const vizFathersNameRaw = extractNameAfterLabel(fullText, cfg?.fathersName, cfg?.cyrillic);
  const vizFullGivenRaw = [vizGivenNamesRaw, vizFathersNameRaw].filter(Boolean).join(' ') || null;

  // Транслитерируем оба источника и сравниваем
  const mrzSurname = mrzData?.surname ? translitFn(mrzData.surname) : null;
  const vizSurname = vizSurnameRaw ? translitFn(vizSurnameRaw) : null;
  const surname = pickBetterSurname(mrzSurname, vizSurname, country);

  const mrzGivenNames = mrzData?.givenNames ? translitFn(mrzData.givenNames) : null;
  const vizGivenNames = vizFullGivenRaw ? translitFn(vizFullGivenRaw) : null;
  const givenNames = pickBetter(mrzGivenNames, vizGivenNames);

  // --- Дата выдачи: только VIZ ---
  let issueDate = extractDateAfterLabel(fullText, cfg?.doi);
  if (!issueDate) {
    // Запасной метод: исключаем известные даты из всех дат в тексте
    const knownDates = new Set([mrzData?.birthDate, mrzData?.expiryDate].filter(Boolean));
    const allDates = [];
    let m;
    const re = new RegExp(DATE_RE_G.source, 'g');
    while ((m = re.exec(fullText)) !== null) {
      allDates.push(`${m[1]}.${m[2]}.${m[3]}`);
    }
    issueDate = [...new Set(allDates)].find(d => !knownDates.has(d)) || null;
  }

  // --- Кем выдан: только VIZ ---
  const issuedBy = extractAuthority(fullText, cfg);

  return { surname, givenNames, issueDate, issuedBy };
}

module.exports = { parseViz };
