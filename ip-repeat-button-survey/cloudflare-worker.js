export default {
  async fetch(request, env) {
    const corsHeaders = makeCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/ping" && request.method === "GET") {
        return jsonResponse({ ok: true, message: "survey worker is running" }, 200, corsHeaders);
      }

      if (url.pathname === "/api/submit" && request.method === "POST") {
        return await handleSubmit(request, env, corsHeaders);
      }

      if (url.pathname === "/api/admin/export" && request.method === "GET") {
        return await handleCsvExport(request, env, corsHeaders);
      }

      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error(error);
      return new Response(error.message || "Server error", {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

async function handleSubmit(request, env, corsHeaders) {
  if (!env.SURVEY_KV) {
    return new Response("SURVEY_KV binding is missing", { status: 500, headers: corsHeaders });
  }

  const body = await request.json();
  const clientIp = getClientIp(request);
  const salt = env.HASH_SALT || "CHANGE_THIS_SALT";
  const ipHash = await sha256(`${salt}:${clientIp}`);

  const now = new Date();
  const submittedAtMs = now.getTime();
  const sessionId = cleanText(body.sessionId, 120) || crypto.randomUUID();
  const key = `submission:${String(submittedAtMs).padStart(13, "0")}:${sessionId}`;

  const answers = Array.isArray(body.answers)
    ? body.answers.slice(0, 50).map(normalizeAnswer)
    : [];

  if (!answers.length) {
    return new Response("answers are required", { status: 400, headers: corsHeaders });
  }

  const summary = normalizeSummary(body.summary || {}, answers);

  const record = {
    sessionId,
    completed: body.completed === true,
    totalQuestions: toNumber(body.totalQuestions, answers.length),
    platform: cleanText(body.platform, 80) || "unknown",
    language: cleanText(body.language, 80) || "unknown",
    timezone: cleanText(body.timezone, 120) || "unknown",
    answers,
    summary,
    ipHash,
    submittedAt: now.toISOString(),
    submittedAtMs,
    clientSubmittedAt: cleanText(body.clientSubmittedAt, 80) || "",
    userAgentHash: await sha256(`${salt}:${request.headers.get("User-Agent") || "unknown"}`)
  };

  await env.SURVEY_KV.put(key, JSON.stringify(record));

  return jsonResponse({ ok: true, sessionId, submittedAt: record.submittedAt }, 200, corsHeaders);
}

async function handleCsvExport(request, env, corsHeaders) {
  if (!env.SURVEY_KV) {
    return new Response("SURVEY_KV binding is missing", { status: 500, headers: corsHeaders });
  }

  const password = request.headers.get("X-Admin-Password") || "";
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return new Response("관리자 비밀번호가 올바르지 않습니다.", {
      status: 401,
      headers: corsHeaders
    });
  }

  const submissions = await readAllSubmissions(env);
  const csv = makeCsv(submissions);
  const fileName = `button-survey-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}

async function readAllSubmissions(env) {
  let cursor = undefined;
  const submissions = [];

  do {
    const listResult = await env.SURVEY_KV.list({
      prefix: "submission:",
      cursor,
      limit: 1000
    });

    for (const key of listResult.keys) {
      const raw = await env.SURVEY_KV.get(key.name);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        submissions.push(parsed);
      } catch (error) {
        console.error(`Invalid JSON at ${key.name}`, error);
      }
    }

    cursor = listResult.cursor;
    if (listResult.list_complete) break;
  } while (cursor);

  return submissions.sort((a, b) => Number(a.submittedAtMs || 0) - Number(b.submittedAtMs || 0));
}

function makeCsv(submissions) {
  const headers = [
    "sessionOrder",
    "repeatStatus",
    "sessionId",
    "completed",
    "submittedAt",
    "platform",
    "language",
    "timezone",
    "totalQuestions",
    "questionNumber",
    "pairName",
    "deepSide",
    "chosenSide",
    "chosenTone",
    "responseMs",
    "deepCount",
    "softCount",
    "leftCount",
    "rightCount",
    "averageResponseMs",
    "dominantTone",
    "dominantSide"
  ];

  const rows = [headers];
  const repeatStatuses = computeRepeatStatuses(submissions);

  submissions.forEach((submission, index) => {
    const summary = submission.summary || {};
    const answers = Array.isArray(submission.answers) ? submission.answers : [];
    const repeatStatus = repeatStatuses[index];

    if (!answers.length) {
      rows.push([
        index + 1,
        repeatStatus,
        submission.sessionId || "",
        submission.completed === true ? "true" : "false",
        submission.submittedAt || "",
        submission.platform || "",
        submission.language || "",
        submission.timezone || "",
        submission.totalQuestions || "",
        "",
        "",
        "",
        "",
        "",
        "",
        summary.deepCount ?? "",
        summary.softCount ?? "",
        summary.leftCount ?? "",
        summary.rightCount ?? "",
        summary.averageResponseMs ?? "",
        summary.dominantTone ?? "",
        summary.dominantSide ?? ""
      ]);
      return;
    }

    answers.forEach(answer => {
      rows.push([
        index + 1,
        repeatStatus,
        submission.sessionId || "",
        submission.completed === true ? "true" : "false",
        submission.submittedAt || "",
        submission.platform || "",
        submission.language || "",
        submission.timezone || "",
        submission.totalQuestions || "",
        answer.questionNumber ?? "",
        answer.pairName ?? "",
        answer.deepSide ?? "",
        answer.chosenSide ?? "",
        answer.chosenTone ?? "",
        answer.responseMs ?? "",
        summary.deepCount ?? "",
        summary.softCount ?? "",
        summary.leftCount ?? "",
        summary.rightCount ?? "",
        summary.averageResponseMs ?? "",
        summary.dominantTone ?? "",
        summary.dominantSide ?? ""
      ]);
    });
  });

  return rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
}

function computeRepeatStatuses(submissions) {
  return submissions.map((submission, index) => {
    const currentHash = submission.ipHash || "";
    if (!currentHash) return "정상";

    const prevHash = submissions[index - 1]?.ipHash || "";
    const nextHash = submissions[index + 1]?.ipHash || "";

    if (currentHash === prevHash || currentHash === nextHash) {
      return "연속";
    }

    return "정상";
  });
}

function normalizeAnswer(answer) {
  return {
    questionNumber: toNumber(answer.questionNumber, 0),
    pairName: cleanText(answer.pairName, 80),
    deepSide: normalizeChoice(answer.deepSide, ["left", "right"]),
    chosenSide: normalizeChoice(answer.chosenSide, ["left", "right"]),
    chosenTone: normalizeChoice(answer.chosenTone, ["deep", "soft"]),
    responseMs: toNumber(answer.responseMs, 0)
  };
}

function normalizeSummary(summary, answers) {
  const deepCount = toNumber(summary.deepCount, answers.filter(answer => answer.chosenTone === "deep").length);
  const softCount = toNumber(summary.softCount, answers.filter(answer => answer.chosenTone === "soft").length);
  const leftCount = toNumber(summary.leftCount, answers.filter(answer => answer.chosenSide === "left").length);
  const rightCount = toNumber(summary.rightCount, answers.filter(answer => answer.chosenSide === "right").length);
  const averageResponseMs = toNumber(
    summary.averageResponseMs,
    Math.round(answers.reduce((sum, answer) => sum + toNumber(answer.responseMs, 0), 0) / Math.max(1, answers.length))
  );

  return {
    deepCount,
    softCount,
    leftCount,
    rightCount,
    averageResponseMs,
    dominantTone: normalizeChoice(summary.dominantTone, ["deep", "soft", "neutral"]),
    dominantSide: normalizeChoice(summary.dominantSide, ["left", "right", "neutral"])
  };
}

function normalizeChoice(value, allowed) {
  const text = cleanText(value, 30);
  return allowed.includes(text) ? text : "";
}

function getClientIp(request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;

  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();

  return "unknown";
}

async function sha256(text) {
  const input = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function makeCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOriginSetting = env.ALLOWED_ORIGIN || "*";
  let allowOrigin = "*";

  if (allowedOriginSetting !== "*") {
    const allowedOrigins = allowedOriginSetting.split(",").map(item => item.trim()).filter(Boolean);
    allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || "*";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Max-Age": "86400"
  };
}
