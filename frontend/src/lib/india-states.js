// Indian state/UT centroids (approximate lat, lng) and metadata
// Coordinates are used to position markers on the SVG map

export const states = {
  "Andhra Pradesh":    { code: "AP", lat: 15.9, lng: 79.7 },
  "Arunachal Pradesh": { code: "AR", lat: 28.2, lng: 94.7 },
  "Assam":             { code: "AS", lat: 26.2, lng: 92.9 },
  "Bihar":             { code: "BR", lat: 25.1, lng: 85.3 },
  "Chhattisgarh":      { code: "CG", lat: 21.3, lng: 81.6 },
  "Goa":               { code: "GA", lat: 15.3, lng: 74.0 },
  "Gujarat":           { code: "GJ", lat: 22.3, lng: 71.2 },
  "Haryana":           { code: "HR", lat: 29.1, lng: 76.1 },
  "Himachal Pradesh":  { code: "HP", lat: 31.1, lng: 77.2 },
  "Jharkhand":         { code: "JH", lat: 23.6, lng: 85.3 },
  "Karnataka":         { code: "KA", lat: 15.3, lng: 75.7 },
  "Kerala":            { code: "KL", lat: 10.9, lng: 76.3 },
  "Madhya Pradesh":    { code: "MP", lat: 22.9, lng: 78.7 },
  "Maharashtra":       { code: "MH", lat: 19.7, lng: 75.7 },
  "Manipur":           { code: "MN", lat: 24.6, lng: 93.9 },
  "Meghalaya":         { code: "ML", lat: 25.5, lng: 91.4 },
  "Mizoram":           { code: "MZ", lat: 23.2, lng: 92.9 },
  "Nagaland":          { code: "NL", lat: 26.2, lng: 94.6 },
  "Odisha":            { code: "OD", lat: 20.9, lng: 84.3 },
  "Punjab":            { code: "PB", lat: 31.1, lng: 75.3 },
  "Rajasthan":         { code: "RJ", lat: 27.0, lng: 74.2 },
  "Sikkim":            { code: "SK", lat: 27.5, lng: 88.5 },
  "Tamil Nadu":        { code: "TN", lat: 11.1, lng: 78.7 },
  "Telangana":         { code: "TG", lat: 18.1, lng: 79.0 },
  "Tripura":           { code: "TR", lat: 23.9, lng: 91.9 },
  "Uttar Pradesh":     { code: "UP", lat: 26.8, lng: 80.9 },
  "Uttarakhand":       { code: "UK", lat: 30.1, lng: 79.0 },
  "West Bengal":       { code: "WB", lat: 22.9, lng: 87.9 },
  "Delhi":             { code: "DL", lat: 28.7, lng: 77.1 },
  "Jammu and Kashmir": { code: "JK", lat: 33.7, lng: 76.0 },
  "Ladakh":            { code: "LA", lat: 34.2, lng: 77.6 },
  "Puducherry":        { code: "PY", lat: 11.9, lng: 79.8 },
  "Chandigarh":        { code: "CH", lat: 30.7, lng: 76.8 },
  "Lakshadweep":       { code: "LD", lat: 10.6, lng: 72.6 },
  "Andaman and Nicobar": { code: "AN", lat: 11.7, lng: 92.7 },
};

// Convert lat/lng to SVG coordinates
// India spans roughly 8°N-35°N lat, 68°E-97°E lng
const LAT_MIN = 7;
const LAT_MAX = 36;
const LNG_MIN = 68;
const LNG_MAX = 98;
const SVG_W = 340;
const SVG_H = 380;

export function toSvgCoords(lat, lng) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H;
  return { x, y };
}

// Get all states with their SVG positions
export function getStatePositions() {
  return Object.entries(states).map(([name, data]) => ({
    name,
    ...data,
    ...toSvgCoords(data.lat, data.lng),
  }));
}
