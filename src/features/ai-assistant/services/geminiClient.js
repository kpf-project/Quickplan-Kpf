// Priority order strictly based on actual usable quota and capability:
// 1. gemini-3.5-flash-lite: 500 RPD, 15 RPM (Fastest & largest daily allowance)
// 2. gemini-3.1-flash-lite: 500 RPD, 15 RPM (High quota backup)
// 3. gemini-2.5-flash-lite: 20 RPD, 10 RPM (Lite backup)
// 4. gemini-3.8-flash: 20 RPD, 5 RPM (Smartest reasoning)
// 5. gemini-3.7-flash: 20 RPD, 5 RPM
// 6. gemini-3.6-flash: 20 RPD, 5 RPM
// 7. gemini-3.5-flash: 20 RPD, 5 RPM
// 8. gemini-3-flash: 20 RPD, 5 RPM
// 9. gemini-2.5-flash: 20 RPD, 5 RPM
// Total combined free tier pool: 1,140 requests/day
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash",
  "gemini-2.5-flash",
];
const GEMINI_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Resolve list of available API keys for automatic key rotation
 */
function resolveApiKeys() {
  const keys = [];
  const rawSources = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY];
  for (const src of rawSources) {
    if (src) {
      const parts = src.split(",").map((k) => k.trim()).filter(Boolean);
      for (const p of parts) {
        if (!keys.includes(p)) {
          keys.push(p);
        }
      }
    }
  }
  return keys;
}

/**
 * Call Google Gemini REST API with multi-key pool rotation and multi-model fallback on 429 quota limits
 */
export async function callGeminiGenerateContent({
  contents,
  systemInstruction,
  tools,
  temperature = 0.2,
  model = DEFAULT_GEMINI_MODEL,
}) {
  const apiKeys = resolveApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("GEMINI_API_KEY is missing from environment variables");
  }

  const primaryModel = process.env.GEMINI_CHAT_MODEL || model;
  const modelsToTry = [
    primaryModel,
    ...FALLBACK_MODELS.filter((m) => m !== primaryModel),
  ];

  const payload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  let lastError = null;

  // Try each API key in the pool
  for (const apiKey of apiKeys) {
    // Try each model candidate
    for (const currentModel of modelsToTry) {
      const url = `${GEMINI_API_ENDPOINT}/${currentModel}:generateContent?key=${apiKey}`;

      const maxRetries = 1;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            cache: "no-store",
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorJson;
            try {
              errorJson = JSON.parse(errorText);
            } catch {
              errorJson = null;
            }
            const message = errorJson?.error?.message || errorText || `Gemini API returned ${response.status}`;

            // If Rate Limit / Quota Exceeded (429), break to try next model or next API key!
            if (response.status === 429) {
              lastError = new Error(`Key ${apiKey.slice(-4)} / Model ${currentModel} 429: ${message}`);
              break;
            }

            // If High Demand (503), retry once
            if (response.status === 503 && attempt < maxRetries) {
              continue;
            }

            throw new Error(`Gemini Error (${response.status}) on ${currentModel}: ${message}`);
          }

          const data = await response.json();
          const candidate = data?.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          return {
            parts,
            finishReason: candidate?.finishReason,
            raw: data,
            modelUsed: currentModel,
          };
        } catch (err) {
          lastError = err;
          if (err.message && err.message.includes("429")) {
            // Break to try next candidate
            break;
          }
        }
      }
    }
  }

  throw lastError || new Error("Failed to call Gemini API after trying all keys and candidate models");
}
