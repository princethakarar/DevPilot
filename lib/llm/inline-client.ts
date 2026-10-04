export async function getInlineSuggestion(
  prefix: string,
  suffix: string
): Promise<string> {
  try {
    const response = await fetch("https://codestral.mistral.ai/v1/fim/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "codestral-latest",
        prompt: prefix,
        suffix: suffix,
        max_tokens: 128,
        temperature: 0,
        stop: ["\n\n", "```"]
      })
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } catch (error) {
    return "";
  }
}
