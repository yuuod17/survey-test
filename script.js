// 1) Cloudflare Worker를 배포한 뒤, 아래 주소를 본인 Worker 주소로 바꾸세요.
// 예: const API_BASE_URL = "https://button-survey-api.yourname.workers.dev";
const API_BASE_URL = "https://button-survey-api.oht081027.workers.dev";

const TOTAL_QUESTIONS = 10;
const BUTTON_TEXT = "선택하기";

const colorPairs = [
  { name: "blue", deep: "#1d4ed8", soft: "#93c5fd" },
  { name: "green", deep: "#047857", soft: "#86efac" },
  { name: "purple", deep: "#6d28d9", soft: "#c4b5fd" },
  { name: "red", deep: "#b91c1c", soft: "#fca5a5" },
  { name: "orange", deep: "#c2410c", soft: "#fdba74" },
  { name: "pink", deep: "#be185d", soft: "#f9a8d4" },
  { name: "teal", deep: "#0f766e", soft: "#5eead4" },
  { name: "indigo", deep: "#4338ca", soft: "#a5b4fc" },
  { name: "slate", deep: "#334155", soft: "#cbd5e1" },
  { name: "yellow", deep: "#a16207", soft: "#fde68a" }
];

const surveyCard = document.getElementById("surveyCard");
const doneCard = document.getElementById("doneCard");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");
const questionTitle = document.getElementById("questionTitle");
const buttonRow = document.getElementById("buttonRow");
const statusMessage = document.getElementById("statusMessage");
const restartButton = document.getElementById("restartButton");

let sessionId = "";
let questions = [];
let answers = [];
let currentIndex = 0;
let questionStartedAt = 0;
let isSaving = false;

restartButton.addEventListener("click", () => {
  startSurvey();
});

startSurvey();

function startSurvey() {
  sessionId = makeSessionId();
  questions = makeQuestions();
  answers = [];
  currentIndex = 0;
  isSaving = false;
  hideStatus();
  doneCard.classList.add("hidden");
  surveyCard.classList.remove("hidden");
  renderQuestion();
}

function makeSessionId() {
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeQuestions() {
  return shuffle(colorPairs).slice(0, TOTAL_QUESTIONS).map((pair, index) => ({
    questionNumber: index + 1,
    pairName: pair.name,
    deepColor: pair.deep,
    softColor: pair.soft,
    deepSide: Math.random() < 0.5 ? "left" : "right"
  }));
}

function renderQuestion() {
  const question = questions[currentIndex];
  const percent = Math.round(((currentIndex + 1) / TOTAL_QUESTIONS) * 100);

  progressText.textContent = `${currentIndex + 1} / ${TOTAL_QUESTIONS}`;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  questionTitle.textContent = "더 끌리는 버튼을 선택해 주세요.";

  buttonRow.innerHTML = "";
  const leftTone = question.deepSide === "left" ? "deep" : "soft";
  const rightTone = question.deepSide === "right" ? "deep" : "soft";

  buttonRow.appendChild(createChoiceButton("left", leftTone, question));
  buttonRow.appendChild(createChoiceButton("right", rightTone, question));

  questionStartedAt = performance.now();
}

function createChoiceButton(side, tone, question) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice-button";
  button.textContent = BUTTON_TEXT;
  button.style.background = tone === "deep" ? question.deepColor : question.softColor;
  button.setAttribute("aria-label", `${side === "left" ? "왼쪽" : "오른쪽"} 버튼 선택`);

  button.addEventListener("click", () => {
    handleChoice(side, tone);
  });

  return button;
}

function handleChoice(chosenSide, chosenTone) {
  if (isSaving) return;

  const question = questions[currentIndex];
  const responseMs = Math.max(0, Math.round(performance.now() - questionStartedAt));

  answers.push({
    questionNumber: question.questionNumber,
    pairName: question.pairName,
    deepSide: question.deepSide,
    chosenSide,
    chosenTone,
    responseMs
  });

  currentIndex += 1;

  if (currentIndex >= TOTAL_QUESTIONS) {
    finishSurvey();
    return;
  }

  renderQuestion();
}

async function finishSurvey() {
  isSaving = true;
  setButtonsDisabled(true);
  showStatus("응답을 저장하는 중입니다.", "success");

  const payload = buildPayload();

  try {
    await submitSurvey(payload);
    showDone();
  } catch (error) {
    console.error(error);
    showStatus(
      "저장에 실패했습니다. takportfolio1027@gmail.com으로 Cloudflare Worker 주소와 배포 상태를 확인해 달라고 알려주세요.",
      "error"
    );
    setButtonsDisabled(false);
    isSaving = false;
  }
}

function buildPayload() {
  const summary = summarizeAnswers(answers);

  return {
    sessionId,
    completed: true,
    totalQuestions: TOTAL_QUESTIONS,
    platform: getPlatform(),
    language: navigator.language || "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    answers,
    summary,
    clientSubmittedAt: new Date().toISOString()
  };
}

function summarizeAnswers(list) {
  const deepCount = list.filter(answer => answer.chosenTone === "deep").length;
  const softCount = list.filter(answer => answer.chosenTone === "soft").length;
  const leftCount = list.filter(answer => answer.chosenSide === "left").length;
  const rightCount = list.filter(answer => answer.chosenSide === "right").length;
  const averageResponseMs = Math.round(
    list.reduce((sum, answer) => sum + answer.responseMs, 0) / Math.max(1, list.length)
  );

  return {
    deepCount,
    softCount,
    leftCount,
    rightCount,
    averageResponseMs,
    dominantTone: getDominant(deepCount, softCount, "deep", "soft"),
    dominantSide: getDominant(leftCount, rightCount, "left", "right")
  };
}

function getDominant(a, b, aName, bName) {
  if (a > b) return aName;
  if (b > a) return bName;
  return "neutral";
}

async function submitSurvey(payload) {
  if (!API_BASE_URL || API_BASE_URL.includes("YOUR_CLOUDFLARE_WORKER_URL")) {
    throw new Error("Cloudflare Worker URL이 설정되지 않았습니다.");
  }

  const response = await fetch(`${API_BASE_URL}/api/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "응답 저장 실패");
  }

  return response.json();
}

function getPlatform() {
  if (navigator.userAgentData && navigator.userAgentData.platform) {
    return navigator.userAgentData.platform;
  }
  return navigator.platform || "unknown";
}

function setButtonsDisabled(disabled) {
  const buttons = buttonRow.querySelectorAll("button");
  buttons.forEach(button => {
    button.disabled = disabled;
  });
}

function showDone() {
  surveyCard.classList.add("hidden");
  doneCard.classList.remove("hidden");
}

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message show ${type}`;
}

function hideStatus() {
  statusMessage.className = "status-message";
  statusMessage.textContent = "";
}

function shuffle(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}
