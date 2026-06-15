const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureBtn = document.getElementById("captureBtn");
const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

const fields = {
  surnameLatin: document.getElementById("surnameLatin"),
  surnameRu: document.getElementById("surnameRu"),
  givenLatin: document.getElementById("givenLatin"),
  givenRu: document.getElementById("givenRu"),
  passportNumber: document.getElementById("passportNumber"),
  nationality: document.getElementById("nationality"),
  birthDate: document.getElementById("birthDate"),
  sex: document.getElementById("sex"),
  expiryDate: document.getElementById("expiryDate"),
  personalNumber: document.getElementById("personalNumber"),
};

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: "continuous",
      },
      audio: false,
    });
    video.srcObject = stream;

    const [track] = stream.getVideoTracks();
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
      track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
    }
  } catch (err) {
    statusEl.textContent = "Камера недоступна: " + err.message + ". Используйте загрузку фото.";
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function sendImage(blob) {
  setStatus("Распознаём...");
  resultEl.hidden = true;

  const formData = new FormData();
  formData.append("image", blob, "capture.jpg");

  try {
    const res = await fetch("/api/recognize", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok || data.error) {
      setStatus("Ошибка: " + (data.error || res.statusText));
      return;
    }

    if (!data.success) {
      setStatus(data.message || "Не удалось найти MRZ. Попробуйте сделать снимок чётче.");
      return;
    }

    fillResult(data);
    setStatus("Готово");
  } catch (err) {
    setStatus("Ошибка запроса: " + err.message);
  }
}

function fillResult(data) {
  const { mrz, translit } = data;
  fields.surnameLatin.textContent = mrz.surname;
  fields.surnameRu.textContent = translit.surname;
  fields.givenLatin.textContent = mrz.givenNames;
  fields.givenRu.textContent = translit.givenNames;
  fields.passportNumber.textContent = mrz.passportNumber;
  fields.nationality.textContent = mrz.nationality;
  fields.birthDate.textContent = mrz.birthDate || "-";
  fields.sex.textContent = mrz.sex;
  fields.expiryDate.textContent = mrz.expiryDate || "-";
  fields.personalNumber.textContent = mrz.personalNumber || "-";
  resultEl.hidden = false;
}

captureBtn.addEventListener("click", () => {
  if (!video.srcObject) {
    setStatus("Камера не запущена. Используйте загрузку фото.");
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob((blob) => sendImage(blob), "image/jpeg", 0.92);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) sendImage(file);
});

startCamera();
