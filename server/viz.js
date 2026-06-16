// Парсер визуальной зоны (VIZ) паспорта.
// Поддерживает UZB, TJK, KGZ, TKM с кросс-проверкой данных MRZ и VIZ.

// Дата: DD.MM.YYYY или DD MM YYYY
const DATE_RE = /\b(\d{2})[.\s](\d{2})[.\s](\d{4})\b/;
const DATE_RE_G = /\b(\d{2})[.\s](\d{2})[.\s](\d{4})\b/g;

function normalizeDate(raw) {
  const m = raw.match(DATE_RE);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

// Страно-специфичные конфиги меток VIZ
const COUNTRY_CONFIG = {
  UZB: {
    // Метки допускают OCR-искажения (FAMELIYAS вместо FAMILIYASI и т.п.)
    surname:         /famil\S*\s*[\/|]\s*surname|surname/i,
    givenNames:      /ism\S*\s*[\/|]\s*given\s*names|given\s*names/i,
    fathersName:     /otasining|father['']?s?\s*name/i,
    dob:             /tug\S*\s*[\/|]\s*date\s*of\s*birth|date\s*of\s*birth/i,
    doi:             /berilgan\s*sanasi\s*[\/|]\s*date\s*of\s*issue|date\s*of\s*issue/i,
    authority:       /kim\s*tomonidan|authority/i,
    // Прямой паттерн кода органа — MIA (МВД) или PSC (паспортный сервисный центр)
    authorityCode:   /(?:MIA|PSC)\s+\d+/i,
    passportNo:      /pasport\s*raqami|passport\s*no/i,
    cyrillic:        false,
  },
  TJK: {
    surname:         /фамили[яи]/i,
    givenNames:      /имя\s*[,/|]?\s*отчество|имена/i,
    fathersName:     /отчество/i,
    dob:             /дата\s*рождени/i,
    doi:             /дата\s*выдач/i,
    authority:       /место\s*выдач|орган\s*выдач|кем\s*выдан/i,
    authorityCode:   null,
    passportNo:      /серия\s*и\s*номер|№\s*паспорта|номер\s*паспорта/i,
    cyrillic:        true,
  },
  KGZ: {
    surname:         /фамилияс[ыи]|фамили[яи]|surname/i,
    givenNames:      /аты[,\s]+атасынын\s*аты|имя\s+отчество|given\s+names/i,
    fathersName:     /атасынын\s*аты|отчество/i,
    dob:             /туулган\s*күнү|дата\s*рождени|date\s*of\s*birth/i,
    doi:             /берилген\s*күнү|дата\s*выдачи|date\s*of\s*issue/i,
    authority:       /берген\s*мекеме|орган\s*выдачи|authority/i,
    authorityCode:   /MDD\s+\d+|ОМД\s+\d+|ДМД\s+\d+/i,
    passportNo:      /паспортун\s*№|passport\s*no/i,
    cyrillic:        true,
  },
  TKM: {
    surname:         /famil[iý]asy\s*[\/|]\s*surname|surname/i,
    givenNames:      /ady\s*[\/|]\s*given\s*name|given\s*name/i,
    fathersName:     null,
    dob:             /doglan\s*senesi\s*[\/|]\s*date\s*of\s*birth|date\s*of\s*birth/i,
    doi:             /berlen\s*senesi\s*[\/|]\s*date\s*of\s*issue|date\s*of\s*issue/i,
    authority:       /pasyport\s*beren\s*edara\s*[\/|]\s*authority|authority/i,
    authorityCode:   /SMST\d*/i,
    passportNo:      /pasport\s*no\b|passport\s*no\b/i,
    cyrillic:        false,
  },
};

// Общие запасные метки (если страна не определена или метка не нашлась)
const FALLBACK = {
  surname:    [/surname/i, /фамили[яи]/i, /familiyasi/i, /famil[iý]asy/i],
  givenNames: [/given\s*names/i, /имена|имя/i, /ismi/i],
  dob:        [/date\s*of\s*birth/i, /дата\s*рождени/i],
  doi:        [/date\s*of\s*issue/i, /дата\s*выдач/i, /berilgan\s*sana/i, /berlen\s*senesi/i, /берилген\s*күнү/i],
  authority:  [/authority/i, /орган\s*выдач/i, /кем\s*выдан/i, /место\s*выдач/i],
  passportNo: [/passport\s*no/i, /паспортун\s*№/i, /pasport\s*raqami/i],
};

function afterLabel(fullText, pattern, windowSize = 200) {
  const m = fullText.match(pattern);
  if (!m) return null;
  return fullText.substring(m.index + m[0].length, m.index + m[0].length + windowSize).trim();
}

function firstLine(str) {
  if (!str) return null;
  return str.split('\n').map(l => l.trim()).find(l => l.length > 1) || null;
}

// Извлекает имя из текста после метки
// useCyrillic=true → ищем кириллицу, иначе латиницу
function extractName(fullText, labelPattern, useCyrillic) {
  const after = afterLabel(fullText, labelPattern, 300);
  if (!after) return null;
  const lines = after.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  for (const line of lines.slice(0, 5)) {
    if (useCyrillic) {
      const m = line.match(/[А-ЯЁа-яё]{2,}(?:[\s\-][А-ЯЁа-яё]{2,})*/);
      if (m) return m[0].toUpperCase().trim();
    } else {
      const m = line.match(/[A-Z]{2,}(?:[\s\-'][A-Z]{2,})*/);
      if (m && m[0].length > 2) return m[0].trim();
    }
  }
  return null;
}

function extractDate(fullText, labelPattern) {
  const after = afterLabel(fullText, labelPattern, 150);
  if (!after) return null;
  return normalizeDate(after);
}

function extractText(fullText, labelPattern) {
  const after = afterLabel(fullText, labelPattern, 300);
  return firstLine(after);
}

function tryPatterns(fullText, patterns, fn) {
  for (const p of patterns) {
    const result = fn(fullText, p);
    if (result) return result;
  }
  return null;
}

// Определяет, содержит ли строка только цифры и буквы паспортного номера
function looksLikePassportNo(str) {
  return str && /^[A-Z]{1,2}\d{6,9}$/.test(str.replace(/\s/g, ''));
}

// Кросс-проверка фамилии: исправляет выпадение первой буквы в MRZ
// (артефакт: UZB+B... → OCR сливает две B → UZBOLTAEV вместо UZBBOLTAEV)
function reconcileSurname(mrzSurname, vizSurnameRaw, issuingCountry, translitFn) {
  if (!vizSurnameRaw) return { value: mrzSurname, source: 'mrz' };

  const vizTranslit = translitFn(vizSurnameRaw);

  // Проверяем артефакт слияния: последняя буква кода страны = первая буква фамилии
  const lastCountryChar = issuingCountry.slice(-1).toUpperCase();
  if (
    vizSurnameRaw.toUpperCase().startsWith(lastCountryChar) &&
    mrzSurname.toUpperCase() === vizSurnameRaw.toUpperCase().slice(1)
  ) {
    return { value: vizTranslit, source: 'viz_fixed', original: mrzSurname };
  }

  // Если VIZ и MRZ совпадают — отлично
  if (mrzSurname.toUpperCase() === vizSurnameRaw.toUpperCase()) {
    return { value: vizTranslit, source: 'both' };
  }

  // В любом случае предпочитаем VIZ (нет артефакта слияния с кодом страны)
  return { value: vizTranslit, source: 'viz', mrzValue: mrzSurname };
}

function extractAuthorityFromViz(fullText, cfg) {
  if (!cfg) return null;

  // 1. Метка + поиск кода в радиусе 400 символов
  if (cfg.authority) {
    const labelMatch = fullText.match(cfg.authority);
    if (labelMatch) {
      const window = fullText.substring(labelMatch.index, labelMatch.index + 400);
      if (cfg.authorityCode) {
        const codeMatch = window.match(cfg.authorityCode);
        if (codeMatch) return codeMatch[0].trim();
      }
      // Нет прямого кода — берём первую текстовую строку после метки
      const after = fullText.substring(labelMatch.index + labelMatch[0].length, labelMatch.index + 300).trim();
      const line = firstLine(after);
      if (line && line.length > 2) return line;
    }
  }

  // 2. Прямой поиск кода органа в тексте (если метка не найдена)
  if (cfg.authorityCode) {
    const m = fullText.match(cfg.authorityCode);
    if (m) return m[0].trim();
  }

  return null;
}

function parseViz(fullText, mrzData, translitFn) {
  const country = (mrzData?.issuingCountry || '').toUpperCase();
  const cfg = COUNTRY_CONFIG[country];
  const knownDates = mrzData ? [mrzData.birthDate, mrzData.expiryDate] : [];

  // Фамилия
  const surnameRaw = cfg
    ? extractName(fullText, cfg.surname, cfg.cyrillic)
    : tryPatterns(fullText, FALLBACK.surname, (t, p) => extractName(t, p, false));

  // Имя
  const givenNamesRaw = cfg
    ? extractName(fullText, cfg.givenNames, cfg.cyrillic)
    : tryPatterns(fullText, FALLBACK.givenNames, (t, p) => extractName(t, p, false));

  // Отчество (отдельное поле в VIZ узбекских паспортов)
  const fathersNameRaw = cfg?.fathersName
    ? extractName(fullText, cfg.fathersName, cfg.cyrillic)
    : null;

  // Объединяем имя + отчество в одну строку (как в MRZ)
  const fullGivenNamesRaw = [givenNamesRaw, fathersNameRaw].filter(Boolean).join(' ') || null;

  // Дата выдачи
  const issueDate = cfg
    ? extractDate(fullText, cfg.doi) || tryPatterns(fullText, FALLBACK.doi, extractDate)
    : tryPatterns(fullText, FALLBACK.doi, extractDate);

  // Кем выдан — сначала ищем код органа рядом с меткой, потом напрямую в тексте
  const issuedBy = cfg
    ? extractAuthorityFromViz(fullText, cfg) || tryPatterns(fullText, FALLBACK.authority, extractText)
    : tryPatterns(fullText, FALLBACK.authority, extractText);

  // Дата рождения из VIZ (для кросс-проверки)
  const dobViz = cfg
    ? extractDate(fullText, cfg.dob) || tryPatterns(fullText, FALLBACK.dob, extractDate)
    : tryPatterns(fullText, FALLBACK.dob, extractDate);

  // Кросс-проверка фамилии
  const surnameResult = mrzData && surnameRaw
    ? reconcileSurname(mrzData.surname, surnameRaw, country, translitFn)
    : { value: surnameRaw ? translitFn(surnameRaw) : null, source: 'viz' };

  // Кросс-проверка даты рождения
  let dobSource = 'mrz';
  if (dobViz && mrzData?.birthDate && dobViz !== mrzData.birthDate) {
    dobSource = 'mismatch';
    console.warn(`DOB mismatch: MRZ=${mrzData.birthDate} VIZ=${dobViz}`);
  } else if (dobViz) {
    dobSource = 'both';
  }

  // Запасной метод для даты выдачи: исключение известных дат
  let issueDateFinal = issueDate;
  if (!issueDateFinal) {
    const allDates = [];
    let m;
    const re = new RegExp(DATE_RE_G.source, 'g');
    while ((m = re.exec(fullText)) !== null) {
      allDates.push(`${m[1]}.${m[2]}.${m[3]}`);
    }
    const known = new Set(knownDates.filter(Boolean));
    const candidates = [...new Set(allDates)].filter(d => !known.has(d));
    issueDateFinal = candidates[0] || null;
  }

  return {
    surnameRaw,
    surname: surnameResult,
    givenNamesRaw: fullGivenNamesRaw,
    fathersNameRaw,
    givenNames: fullGivenNamesRaw ? translitFn(fullGivenNamesRaw) : null,
    issueDate: issueDateFinal,
    issuedBy,
    dobViz,
    dobSource,
    country,
  };
}

module.exports = { parseViz };
