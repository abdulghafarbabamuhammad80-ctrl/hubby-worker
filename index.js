const SEARX_INSTANCES = [
  "https://searx.be",
  "https://searx.tiekoetter.com",
  "https://searx.priv.au",
  "https://searx.baczek.me",
  "https://searx.rodeo",
];

async function fetchSearchResults(query) {
  for (const base of SEARX_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HubbyAI/1.0)" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results.slice(0, 4);
      }
    } catch (e) {
      // This instance failed or timed out — try the next one
      continue;
    }
  }
  return [];
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight (needed once frontend moves to GitHub Pages)
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

      // Pull in live web results before asking the AI
      const searchResults = await fetchSearchResults(message);

      let searchContext = "";
      if (searchResults.length > 0) {
        searchContext =
          "Here is some current information from the web that may help answer the question:\n\n" +
          searchResults
            .map((r, i) => `${i + 1}. ${r.title}: ${r.content || ""}`)
            .join("\n\n") +
          "\n\nUse this information if it's relevant to the question. If it's not relevant, ignore it and answer normally.";
      }

      const systemPrompt =
        "You are Hubby AI, a helpful, friendly and intelligent AI assistant. Give clear, useful and accurate answers. Keep your answers natural and easy to understand. If you do not know something, say so instead of making it up." +
        (searchContext ? "\n\n" + searchContext : "");

      const response = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: message,
          },
        ],
        chat_template_kwargs: {
          enable_thinking: false,
        },
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
        JSON.stringify({
          success: false,
          reply: "Server error: " + err.message,
        }),
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
