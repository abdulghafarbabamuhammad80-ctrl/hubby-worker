const SEARX_INSTANCES = [
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://searx.priv.au",
  "https://searx.baczek.me",
  "https://searx.rodeo",
];

function getCurrentDateString() {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function fetchFromSearx(query) {
  for (const base of SEARX_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HubbyAI/1.0)" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results
          .slice(0, 4)
          .map((r) => ({ title: r.title, content: r.content || "" }));
      }
    } catch (e) {
      continue;
    }
  }
  return [];
}

async function fetchFromDuckDuckGo(query) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query
    )}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = await res.json();

    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading || query, content: data.AbstractText });
    }
    if (data.Answer) {
      results.push({ title: "Quick answer", content: data.Answer });
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function fetchSearchResults(query) {
  const searxResults = await fetchFromSearx(query);
  if (searxResults.length > 0) return searxResults;

  const ddgResults = await fetchFromDuckDuckGo(query);
  return ddgResults;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, reply: "Method not allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    try {
      const { message } = await request.json();

      const searchResults = await fetchSearchResults(message);

      let searchContext = "";
      if (searchResults.length > 0) {
        searchContext =
          "Here is some current information from the web that may help answer the question:\n\n" +
          searchResults
            .map((r, i) => `${i + 1}. ${r.title}: ${r.content}`)
            .join("\n\n") +
          "\n\nUse this information if it's relevant. If it's not relevant, ignore it and answer normally.";
      }

      const systemPrompt =
        `You are Hubby AI, a helpful, friendly and intelligent AI assistant. Give clear, useful and accurate answers. Keep your answers natural and easy to understand. If you do not know something, say so instead of making it up.\n\nToday's real date is: ${getCurrentDateString()}. Always use this as the true current date if asked.` +
        (searchContext ? "\n\n" + searchContext : "");

      const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        chat_template_kwargs: { enable_thinking: false },
      });

      const reply =
        response?.choices?.[0]?.message?.content ||
        "Sorry, I received an empty response from the AI.";

      return new Response(JSON.stringify({ success: true, reply }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, reply: "Server error: " + err.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
