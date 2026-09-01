import { staticMapDataUrl } from "./src/lib/amap.server";

const apiKey = process.env["AMAP_API_KEY"] || "";
const lat = 23.1291;
const lon = 113.2644;

console.log("Testing AMap Static Map API with key:", apiKey.slice(0, 5) + "...");
staticMapDataUrl(apiKey, lat, lon).then(url => {
  if (url) {
    console.log("Success! URL starts with:", url.slice(0, 50));
  } else {
    console.log("Failed to get URL (staticMapDataUrl returned null)");
  }
}).catch(err => {
  console.error("Error during API call:", err);
});
