require("dotenv").config();
const path = require("path");
const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const { parseMrz } = require("./mrz");
const { transliterateUzbekToRussian } = require("./transliterate");
const { parseViz } = require("./viz");

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const YANDEX_OCR_URL = "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText";

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/recognize", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Файл изображения не получен" });
    }
    if (!process.env.YANDEX_API_KEY) {
      return res.status(500).json({ error: "YANDEX_API_KEY не задан на сервере" });
    }

    const base64Content = req.file.buffer.toString("base64");

    const ocrResponse = await fetch(YANDEX_OCR_URL, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${process.env.YANDEX_API_KEY}`,
        "Content-Type": "application/json",
        ...(process.env.YANDEX_FOLDER_ID ? { "x-folder-id": process.env.YANDEX_FOLDER_ID } : {}),
      },
      body: JSON.stringify({
        mimeType: req.file.mimetype === "image/png" ? "PNG" : "JPEG",
        languageCodes: ["en", "ru", "uz"],
        model: "page",
        content: base64Content,
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      return res.status(502).json({ error: "Ошибка Yandex Vision OCR", details: errorText });
    }

    const ocrResult = await ocrResponse.json();
    const fullText = ocrResult?.result?.textAnnotation?.fullText || "";

    const mrz = parseMrz(fullText);

    if (!mrz) {
      return res.json({ success: false, fullText, message: "MRZ не найдена в распознанном тексте" });
    }

    console.log("=== OCR fullText ===\n" + fullText + "\n===================");

    const viz = parseViz(fullText, mrz);

    // Предпочитаем имя из VIZ (там нет артефакта слияния букв с кодом страны)
    const vizSurname = viz.surnameRaw ? transliterateUzbekToRussian(viz.surnameRaw) : null;
    const vizGivenNames = viz.givenNamesRaw ? transliterateUzbekToRussian(viz.givenNamesRaw) : null;

    res.json({
      success: true,
      mrz,
      translit: {
        surname: vizSurname || transliterateUzbekToRussian(mrz.surname),
        givenNames: vizGivenNames || transliterateUzbekToRussian(mrz.givenNames),
      },
      viz,
      fullText,
    });
  } catch (err) {
    res.status(500).json({ error: "Внутренняя ошибка сервера", details: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Сервер запущен: http://localhost:${port}`);
});
