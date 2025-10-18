const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Get API key from environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is not set");
  process.exit(1);
}

async function extractXtreamCodesFromWebsite(url) {
  try {
    // Step 1: Fetch the website content
    console.log(`Fetching content from: ${url}`);
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 30000,
    });

    const websiteContent = response.data;
    console.log("Website content fetched successfully");

    // Step 2: Prepare the prompt for AI API
    const prompt = `
        From this website page content, extract all xtream codes available in a json array in formatted objects containing the host and port, the username, and the password and the expiration date if available.

        Website Content:
        ${websiteContent}

        Return only the JSON array, no additional text or explanation.
        `;

    // Step 3: Send to AI API
    console.log("Sending request to AI API...");
    const aiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Step 4: Extract and parse the JSON response
    const responseText = aiResponse.data.candidates[0].content.parts[0].text;

    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const jsonArray = JSON.parse(jsonMatch[0]);
      console.log("Successfully extracted Xtream codes:");
      console.log(JSON.stringify(jsonArray, null, 2));

      const result = [];
      for (const code of jsonArray) {
        try {
          const res = await axios.get(
            `${code.host}:${code.port}/player_api.php?username=${code.username}&password=${code.password}`,
            { timeout: 10000 }
          );
          const si = res.data.server_info;
          const ui = res.data.user_info;
          result.push({
            username: ui.username,
            password: ui.password,
            expires_at: new Date(ui.exp_date * 1000).toLocaleDateString(), // Convert timestamp to date
            active_users: ui.active_cons,
            max_users: ui.max_connections,
            url: si.url,
            port: si.port,
            https_port: si.https_port,
            server_protocol: si.server_protocol,
            timezone: si.timezone,
          });
        } catch (error) {
          console.log(`Failed to verify code: ${code.username}`);
          continue;
        }
      }
      return result;
    } else {
      throw new Error("No JSON array found in the response");
    }
  } catch (error) {
    console.error("Error:", error.message);
    if (error.response) {
      console.error("API Response status:", error.response.status);
      console.error("API Response data:", error.response.data);
    }
    throw error;
  }
}

function saveResultsToFile(results) {
  const date = new Date();
  const dateString = date.toISOString().split("T")[0]; // YYYY-MM-DD format
  const filename = `${dateString}.json`;
  const resultsDir = path.join(__dirname, "..", "results");

  // Create results directory if it doesn't exist
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const filePath = path.join(resultsDir, filename);
  const data = {
    extraction_date: date.toISOString(),
    total_codes: results.length,
    codes: results,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Results saved to: ${filePath}`);

  return filePath;
}

async function main() {
  const date = new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const websiteUrl =
    "https://stbemucode.com/" +
    day +
    "/" +
    month +
    "/" +
    year +
    "/xtream-codes-iptv-m3u-playlists-" +
    day +
    "-" +
    month +
    "-" +
    year +
    ".html";

  try {
    console.log(`Starting extraction for ${date.toISOString().split("T")[0]}`);
    const xtreamCodes = await extractXtreamCodesFromWebsite(websiteUrl);
    console.log(`\nExtracted ${xtreamCodes.length} Xtream codes`);

    // Save results to file
    const filePath = saveResultsToFile(xtreamCodes);

    return {
      success: true,
      codesFound: xtreamCodes.length,
      filePath: filePath,
    };
  } catch (error) {
    console.error("Failed to extract Xtream codes:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// For Node.js environment
if (require.main === module) {
  main();
}

module.exports = { extractXtreamCodesFromWebsite, main, saveResultsToFile };
