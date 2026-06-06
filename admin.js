// 1) Cloudflare Worker를 배포한 뒤, 아래 주소를 본인 Worker 주소로 바꾸세요.
// 예: const API_BASE_URL = "https://button-survey-api.yourname.workers.dev";
const API_BASE_URL = "https://button-survey-api.oht081027.workers.dev";

const passwordInput = document.getElementById("adminPassword");
const downloadCsvButton = document.getElementById("downloadCsvButton");
const adminStatus = document.getElementById("adminStatus");

downloadCsvButton.addEventListener("click", async () => {
  const password = passwordInput.value.trim();

  if (!password) {
    showAdminStatus("관리자 비밀번호를 입력하세요.", "error");
    return;
  }

  if (!API_BASE_URL || API_BASE_URL.includes("YOUR_CLOUDFLARE_WORKER_URL")) {
    showAdminStatus("admin.js의 Cloudflare Worker URL을 먼저 설정하세요.", "error");
    return;
  }

  downloadCsvButton.disabled = true;
  downloadCsvButton.textContent = "CSV 생성 중...";
  showAdminStatus("서버에서 설문 데이터를 불러오고 있습니다.", "success");

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/export`, {
      method: "GET",
      headers: {
        "X-Admin-Password": password
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "CSV 다운로드 실패");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `button-survey-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showAdminStatus("CSV 다운로드가 완료되었습니다.", "success");
  } catch (error) {
    console.error(error);
    showAdminStatus(error.message, "error");
  } finally {
    downloadCsvButton.disabled = false;
    downloadCsvButton.textContent = "CSV 다운로드";
  }
});

function showAdminStatus(message, type) {
  adminStatus.textContent = message;
  adminStatus.className = `status-message show ${type}`;
}
