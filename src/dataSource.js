// src/dataSource.js
import defaultQuestions from "./questions.json";
import defaultHints from "./hints.json";

// module load log
try { console.log("[dataSource] module loaded, isDev=", typeof window !== 'undefined' ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') : 'no-window'); } catch(e) {}

let cache = null;

// Robust environment detection: consider non-production and localhost as development.
const isDev = (
  (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE !== "production") ||
  (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"))
);

/**
 * 获取题目数据
 * @returns {Promise<Array>} 题目数据
 */
export async function getQuestions() {
  if (cache) return cache;

  console.log("[dataSource] getQuestions() called, isDev=", isDev);

  if (isDev) {
    // 开发环境：从 localStorage 或本地 JSON 文件加载
    try {
      // 优先新 key
      const localData = localStorage.getItem("questions");
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          // if parsed is a non-empty array, use it; otherwise treat as missing
          if (Array.isArray(parsed) && parsed.length > 0) {
            cache = parsed;
            console.log("[dataSource] getQuestions -> localStorage (questions)", cache.length);
            return cache;
          }
          console.log("[dataSource] getQuestions -> localStorage present but empty, will fallback");
          // remove empty placeholder so next time we can fetch bundled/public data
          try { localStorage.removeItem("questions"); } catch (e) {}
        } catch (e) {
          console.warn("[dataSource] failed to parse localStorage questions, will fallback", e);
        }
      }

      // 兼容旧 key：ipquiz.questions.v1
      const oldKey = "ipquiz.questions.v1";
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        try {
          const parsed = JSON.parse(oldData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            cache = parsed;
            // 迁移到新 key
            try { localStorage.setItem("questions", JSON.stringify(cache)); } catch {}
            console.log("[dataSource] getQuestions -> localStorage (old key)", cache.length);
            return cache;
          }
          console.log("[dataSource] old questions key present but empty, will fallback");
          try { localStorage.removeItem(oldKey); } catch (e) {}
        } catch (err) {
          console.warn("Failed to parse old questions key:", err);
        }
      }
    } catch (err) {
      console.warn("Failed to read questions from localStorage:", err);
    }

    // If public/questions.json isn't available, fall back to bundled src JSON
    try {
      // prefer fetching from public if present
      const response = await fetch("/questions.json");
      if (response.ok) {
        const data = await response.json();
        try { localStorage.setItem("questions", JSON.stringify(data)); } catch {};
        try { localStorage.setItem("ipquiz.questions.v1", JSON.stringify(data)); } catch {}
        cache = data;
  console.log("[dataSource] getQuestions -> public /questions.json", data?.length);
        return data;
      }
    } catch (err) {
      // ignore and fallback to bundled data
    }

    // fallback to bundled JSON in src
    try {
      const data = defaultQuestions || [];
      try { localStorage.setItem("questions", JSON.stringify(data)); } catch {};
      try { localStorage.setItem("ipquiz.questions.v1", JSON.stringify(data)); } catch {}
      cache = data;
  console.log("[dataSource] getQuestions -> bundled src/questions.json", data?.length);
      return data;
    } catch (err) {
      console.error("Failed to load bundled questions:", err);
      cache = [];
      return [];
    }
  }

  // 生产环境：从 API 获取数据
  try {
    const response = await fetch("/api/questions");
    if (!response.ok) {
      console.error(`/api/questions returned ${response.status}`);
      cache = [];
      return [];
    }
    try {
      const data = await response.json();
      cache = data;
      return data;
    } catch (err) {
      console.error("Failed to parse /api/questions as JSON:", err);
      cache = [];
      return [];
    }
  } catch (err) {
    console.error("Network error fetching /api/questions:", err);
    cache = [];
    return [];
  }
}

/**
 * 保存题目数据
 * @param {Array} newQuestions 新的题目数据
 */
export async function saveQuestions(newQuestions) {
  cache = newQuestions;

  if (isDev) {
  // 开发环境：保存到 localStorage（同时写入旧 key 以兼容历史数据）
  try { localStorage.setItem("questions", JSON.stringify(newQuestions)); } catch (err) { console.warn(err); }
  try { localStorage.setItem("ipquiz.questions.v1", JSON.stringify(newQuestions)); } catch (err) { /* ignore */ }
    return;
  }

  // 生产环境：通过 API 保存到 KV
  await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newQuestions),
  });
}

/**
 * 获取提示数据
 * @returns {Promise<Object>} 提示数据
 */
export async function getHints() {
  console.log("[dataSource] getHints() called, isDev=", isDev);
  if (isDev) {
    try {
      const localData = localStorage.getItem("hints");
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          // if parsed is a non-empty object, use it
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            console.log("[dataSource] getHints -> localStorage (hints)", Object.keys(parsed).length);
            return parsed;
          }
          console.log("[dataSource] getHints -> localStorage present but empty, will fallback");
          try { localStorage.removeItem("hints"); } catch (e) {}
        } catch (e) {
          console.warn("[dataSource] failed to parse localStorage hints, will fallback", e);
        }
      }

      // 兼容旧 key
      const oldKey = "ipquiz.hints.v1";
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        try {
          const parsed = JSON.parse(oldData);
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            try { localStorage.setItem("hints", JSON.stringify(parsed)); } catch {}
            console.log("[dataSource] getHints -> localStorage (old key)", Object.keys(parsed).length);
            return parsed;
          }
          console.log("[dataSource] old hints key present but empty, will fallback");
          try { localStorage.removeItem(oldKey); } catch (e) {}
        } catch (err) { console.warn("Failed to parse old hints key:", err); }
      }
    } catch (err) { console.warn("Failed to read hints from localStorage:", err); }

    try {
      const response = await fetch("/hints.json");
      if (response.ok) {
        const data = await response.json();
        try { localStorage.setItem("hints", JSON.stringify(data)); } catch {}
        try { localStorage.setItem("ipquiz.hints.v1", JSON.stringify(data)); } catch {}
  console.log("[dataSource] getHints -> public /hints.json", Object.keys(data || {}).length);
        return data;
      }
    } catch (err) {
      // ignore and fallback to bundled
    }

    try {
  const data = defaultHints || {};
  try { localStorage.setItem("hints", JSON.stringify(data)); } catch {}
  try { localStorage.setItem("ipquiz.hints.v1", JSON.stringify(data)); } catch {}
  console.log("[dataSource] getHints -> bundled src/hints.json", Object.keys(data || {}).length);
  return data;
    } catch (err) {
      console.error("Failed to load bundled hints:", err);
      return {};
    }
  }

  // 生产环境：从 API 获取数据
  try {
    const response = await fetch("/api/hints");
    if (!response.ok) {
      console.error(`/api/hints returned ${response.status}`);
      return {};
    }
    try {
      return await response.json();
    } catch (err) {
      console.error("Failed to parse /api/hints as JSON:", err);
      return {};
    }
  } catch (err) {
    console.error("Network error fetching /api/hints:", err);
    return {};
  }
}

/**
 * 保存提示数据
 * @param {Object} newHints 新的提示数据
 */
export async function saveHints(newHints) {
  if (isDev) {
  try { localStorage.setItem("hints", JSON.stringify(newHints)); } catch (err) { console.warn(err); }
  try { localStorage.setItem("ipquiz.hints.v1", JSON.stringify(newHints)); } catch (err) { /* ignore */ }
    return;
  }

  // 生产环境：通过 API 保存到 KV
  await fetch("/api/hints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newHints),
  });
}
