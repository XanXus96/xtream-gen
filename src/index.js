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
    console.log("Sending request to Gemini API...");
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
      console.log(`Successfully extracted ${jsonArray.length} Xtream codes`);
      
      const result = [];
      let verifiedCount = 0;
      
      for (const code of jsonArray) {
        try {
          const res = await axios.get(
            `${code.host}:${code.port}/player_api.php?username=${code.username}&password=${code.password}`,
            { timeout: 10000 }
          );
          
          if (res.data.user_info && res.data.user_info.auth === 1) {
            const si = res.data.server_info;
            const ui = res.data.user_info;
            result.push({
              username: ui.username,
              password: ui.password,
              expires_at: new Date(ui.exp_date * 1000).toLocaleDateString(),
              active_users: ui.active_cons,
              max_users: ui.max_connections,
              url: si.url,
              port: si.port,
              https_port: si.https_port,
              server_protocol: si.server_protocol,
              timezone: si.timezone,
              status: 'active'
            });
            verifiedCount++;
          }
        } catch (error) {
          console.log(`Failed to verify code: ${code.username} - ${error.message}`);
          // Still add the code but mark as unverified
          result.push({
            username: code.username,
            password: code.password,
            host: code.host,
            port: code.port,
            status: 'unverified',
            error: error.message
          });
        }
      }
      
      console.log(`Verified ${verifiedCount} out of ${jsonArray.length} codes`);
      return result;
    } else {
      console.log("No JSON array found in the AI response");
      return [];
    }
  } catch (error) {
    console.error("Error in extraction:", error.message);
    if (error.response) {
      console.error("API Response status:", error.response.status);
    }
    return [];
  }
}

function saveResultsToFile(results) {
  const date = new Date();
  const dateString = date.toISOString().split('T')[0];
  const filename = `${dateString}.json`;
  const resultsDir = path.join(__dirname, '..', 'results');
  
  // Create results directory if it doesn't exist
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filePath = path.join(resultsDir, filename);
  const data = {
    extraction_date: date.toISOString(),
    total_codes: results.length,
    active_codes: results.filter(r => r.status === 'active').length,
    codes: results
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
    console.log(`Starting extraction for ${date.toISOString().split('T')[0]}`);
    console.log(`Target URL: ${websiteUrl}`);
    
    const xtreamCodes = await extractXtreamCodesFromWebsite(websiteUrl);
    console.log(`\nExtracted ${xtreamCodes.length} Xtream codes`);
    
    if (xtreamCodes.length === 0) {
      console.log("No codes extracted, creating empty result file for tracking");
    }
    
    // Save results to file (even if empty)
    const filePath = saveResultsToFile(xtreamCodes);
    
    return {
      success: true,
      codesFound: xtreamCodes.length,
      activeCodes: xtreamCodes.filter(c => c.status === 'active').length,
      filePath: filePath
    };
  } catch (error) {
    console.error("Failed to extract Xtream codes:", error.message);
    
    // Save error information
    const errorResult = {
      extraction_date: new Date().toISOString(),
      error: error.message,
      codes: []
    };
    
    const errorFilePath = saveResultsToFile([]);
    console.log(`Error info saved to: ${errorFilePath}`);
    
    return {
      success: false,
      error: error.message,
      filePath: errorFilePath
    };
  }
}

// For Node.js environment
if (require.main === module) {
  main();
}

module.exports = { extractXtreamCodesFromWebsite, main, saveResultsToFile };
