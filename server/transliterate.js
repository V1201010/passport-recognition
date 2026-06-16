// Транслитерация узбекского текста (латиница) в русский (кириллица).
// Источник правил: соответствие латинской и кириллической графики узбекского
// алфавита + стандартная передача узбекских кириллических букв на русском.

// Сначала проверяются многосимвольные сочетания (важен порядок — от длинных к коротким).
const MULTI_CHAR_RULES = [
  ["yo", "ё"],
  ["yu", "ю"],
  ["ya", "я"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["kh", "х"],
  ["gh", "г"],
  ["ng", "нг"],
  ["o'", "у"], ["oʻ", "у"], ["oʼ", "у"], ["o`", "у"],
  ["g'", "г"], ["gʻ", "г"], ["gʼ", "г"], ["g`", "г"],
];

const SINGLE_CHAR_RULES = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "х",
  i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о",
  p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в",
  x: "х", y: "й", z: "з",
  "'": "ъ", "ʻ": "ъ", "ʼ": "ъ", "`": "ъ",
  "ғ": "г",
};

function applyCase(sample, replacement) {
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (sample[0] === sample[0].toUpperCase() && sample[0] !== sample[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function transliterateUzbekToRussian(text) {
  if (!text) return "";
  let result = "";
  let i = 0;
  const lower = text.toLowerCase();

  while (i < text.length) {
    let matched = false;

    for (const [latin, cyrillic] of MULTI_CHAR_RULES) {
      const chunk = lower.slice(i, i + latin.length);
      if (chunk === latin) {
        result += applyCase(text.slice(i, i + latin.length), cyrillic);
        i += latin.length;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    const ch = text[i];
    const lowerCh = lower[i];
    if (SINGLE_CHAR_RULES[lowerCh]) {
      result += applyCase(ch, SINGLE_CHAR_RULES[lowerCh]);
    } else {
      result += ch;
    }
    i += 1;
  }

  return result;
}

module.exports = { transliterateUzbekToRussian };
