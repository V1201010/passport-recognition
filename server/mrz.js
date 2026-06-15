// Разбор машиночитаемой зоны (MRZ) паспорта формата TD3 (2 строки по 44 символа),
// который используется в паспортах Узбекистана.

const WEIGHTS = [7, 3, 1];

function checkDigit(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    let value;
    if (ch === "<") value = 0;
    else if (/[0-9]/.test(ch)) value = Number(ch);
    else value = ch.toUpperCase().charCodeAt(0) - 55; // A=10 ... Z=35
    sum += value * WEIGHTS[i % 3];
  }
  return sum % 10;
}

// expiryAlwaysFuture: даты окончания действия паспорта всегда относятся к 20XX,
// а даты рождения определяются по текущему году (граница между 19XX и 20XX).
function formatDate(yymmdd, { expiryAlwaysFuture = false } = {}) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  let year;
  if (expiryAlwaysFuture) {
    year = 2000 + yy;
  } else {
    const currentYY = new Date().getFullYear() % 100;
    year = yy <= currentYY ? 2000 + yy : 1900 + yy;
  }
  return `${dd}.${mm}.${year}`;
}

function cleanNames(field) {
  return field
    .split("<<")
    .map((part) => part.replace(/</g, " ").trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

// Находит две строки MRZ (по 44 символа, TD3) в произвольном тексте OCR.
function findMrzLines(rawText) {
  const candidates = rawText
    .split("\n")
    .map((line) => line.replace(/\s+/g, "").toUpperCase())
    .filter((line) => /^[A-Z0-9<]{30,50}$/.test(line));

  for (let i = 0; i < candidates.length - 1; i += 1) {
    const line1 = candidates[i].padEnd(44, "<").slice(0, 44);
    const line2 = candidates[i + 1].padEnd(44, "<").slice(0, 44);
    if (line1.startsWith("P") && /^[A-Z0-9<]{9}/.test(line2)) {
      return [line1, line2];
    }
  }
  return null;
}

function parseMrz(rawText) {
  const lines = findMrzLines(rawText);
  if (!lines) return null;
  const [line1, line2] = lines;

  const documentType = line1.slice(0, 1);
  const issuingCountry = line1.slice(2, 5).replace(/</g, "");
  const namesField = line1.slice(5);
  const names = cleanNames(namesField);
  const surname = names[0] || "";
  const givenNames = (names[1] || "").split(" ").filter(Boolean).join(" ");

  const passportNumberRaw = line2.slice(0, 9);
  const passportNumber = passportNumberRaw.replace(/</g, "");
  const passportNumberCheck = line2.slice(9, 10);
  const nationality = line2.slice(10, 13).replace(/</g, "");
  const birthDateRaw = line2.slice(13, 19);
  const birthDateCheck = line2.slice(19, 20);
  const sex = line2.slice(20, 21);
  const expiryDateRaw = line2.slice(21, 27);
  const expiryDateCheck = line2.slice(27, 28);
  const personalNumberRaw = line2.slice(28, 42);
  const personalNumber = personalNumberRaw.replace(/</g, "");

  const valid = {
    passportNumber: String(checkDigit(passportNumberRaw)) === passportNumberCheck,
    birthDate: String(checkDigit(birthDateRaw)) === birthDateCheck,
    expiryDate: String(checkDigit(expiryDateRaw)) === expiryDateCheck,
  };

  return {
    documentType,
    issuingCountry,
    surname,
    givenNames,
    passportNumber,
    nationality,
    birthDate: formatDate(birthDateRaw),
    sex: sex === "M" ? "M" : sex === "F" ? "F" : sex,
    expiryDate: formatDate(expiryDateRaw, { expiryAlwaysFuture: true }),
    personalNumber: personalNumber || null,
    checks: valid,
    raw: { line1, line2 },
  };
}

module.exports = { parseMrz };
