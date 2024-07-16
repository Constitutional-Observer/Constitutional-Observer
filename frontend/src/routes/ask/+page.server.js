let apiLink = "";
// if local
if (import.meta.env.MODE === "development") {
  apiLink = "http://127.0.0.1:5000/";
} else {
  // if production
  apiLink = "https://constitutional-observer-backend.adhavansivaraj.xyz/";
}
apiLink = "https://constitutional-observer-backend.adhavansivaraj.xyz/";
export const load = async ({ url, fetch }) => {
  async function debates(query) {
    let resp = await fetch(
      apiLink + "debates/?query=" + encodeURIComponent(query)
    );
    return await resp.json();
  }

  async function sabha(query) {
    let resp = await fetch(
      apiLink + "/sabha/?query=" + encodeURIComponent(query)
    );

    return await resp.json();
  }
  // get query from url
  const query = url.searchParams.get("query");

  if (!query) {
    return { debates: [], sabha: [] };
  }

  return {
    debates: structuredClone(await debates(query)), // debates(),
    sabha: structuredClone(await sabha(query)), // sabha(),
  };
};
