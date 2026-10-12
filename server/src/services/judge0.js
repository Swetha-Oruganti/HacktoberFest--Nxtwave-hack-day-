const baseUrl = () => (process.env.JUDGE0_API_URL || "https://ce.judge0.com").replace(/\/+$/, "");
let languageCache;
let languageCacheExpires = 0;
const supportedLanguages = [
  { value: "c", match: /^c \(/i, monaco: "c" },
  { value: "cpp", match: /^c\+\+/i, monaco: "cpp" },
  { value: "csharp", match: /^c#|^c sharp/i, monaco: "csharp" },
  { value: "java", match: /^java/i, monaco: "java" },
  { value: "javascript", match: /^javascript/i, monaco: "javascript" },
  { value: "typescript", match: /^typescript/i, monaco: "typescript" },
  { value: "python", match: /^python \(3/i, monaco: "python" },
  { value: "go", match: /^go \(/i, monaco: "go" },
  { value: "rust", match: /^rust \(/i, monaco: "rust" },
  { value: "ruby", match: /^ruby \(/i, monaco: "ruby" },
  { value: "php", match: /^php \(/i, monaco: "php" },
];

function headers() {
  const value = { "Content-Type": "application/json" };
  if (process.env.JUDGE0_API_TOKEN) value[process.env.JUDGE0_TOKEN_HEADER || "X-Auth-Token"] = process.env.JUDGE0_API_TOKEN;
  if (process.env.JUDGE0_API_USER) value[process.env.JUDGE0_USER_HEADER || "X-Auth-User"] = process.env.JUDGE0_API_USER;
  if (process.env.JUDGE0_RAPIDAPI_KEY) {
    value["X-RapidAPI-Key"] = process.env.JUDGE0_RAPIDAPI_KEY;
    value["X-RapidAPI-Host"] = process.env.JUDGE0_RAPIDAPI_HOST || "judge0-ce.p.rapidapi.com";
  }
  return value;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl()}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) }, signal: AbortSignal.timeout(12000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || body.message || `Code runner returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function listRunnerLanguages() {
  if (languageCache && Date.now() < languageCacheExpires) return languageCache;
  const all = await request("/languages");
  languageCache = supportedLanguages.flatMap((supported) => {
    const match = all.find((language) => supported.match.test(language.name));
    return match ? [{ value: supported.value, id: match.id, monaco: supported.monaco, label: match.name }] : [];
  });
  languageCacheExpires = Date.now() + 15 * 60 * 1000;
  return languageCache;
}

export async function executeCode({ sourceCode, languageId, stdin = "" }) {
  const language = (await listRunnerLanguages()).find((item) => item.id === Number(languageId));
  if (!language) throw new Error("Choose a supported language from the editor list.");
  const submission = await request("/submissions?base64_encoded=false&wait=false", {
    method: "POST",
    body: JSON.stringify({
      language_id: language.id,
      source_code: sourceCode,
      stdin,
      cpu_time_limit: 5,
      cpu_extra_time: 1,
      wall_time_limit: 8,
      memory_limit: 128000,
      enable_network: false,
    }),
  });
  if (!submission.token) throw new Error("Code runner did not return a submission token.");
  let result;
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    result = await request(`/submissions/${encodeURIComponent(submission.token)}?base64_encoded=false&fields=stdout,stderr,compile_output,message,status,time,memory`);
    const statusId = result.status?.id || result.status_id;
    if (statusId >= 3) break;
  }
  if (!result || (result.status?.id || result.status_id) < 3) return { complete: false, output: "Still queued. Run again in a moment.", language: language.label };
  return {
    complete: true,
    ok: (result.status?.id || result.status_id) === 3,
    status: result.status?.description || "Finished",
    output: result.stdout || result.compile_output || result.stderr || result.message || "Program finished with no output.",
    stderr: result.stderr || "",
    compileOutput: result.compile_output || "",
    time: result.time,
    memory: result.memory,
    language: language.label,
  };
}
