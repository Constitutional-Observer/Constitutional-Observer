let apiLink =  "https://constitutional-observer-backend.adhavansivaraj.xyz";


export const load = async ({ url, fetch }) => {
  async function debates(query) {
    const endpoint = apiLink + "/debates/?query=" + encodeURIComponent(query);
    console.log("[debates] fetching:", endpoint);
    const resp = await fetch(endpoint);
    console.log("[debates] status:", resp.status, resp.statusText);
    if (!resp.ok) {
      const body = await resp.text();
      console.error("[debates] error body:", body);
      return [];
    }
    return await resp.json();
  }

  async function sabha(query) {
    const endpoint = apiLink + "/sabhadebates/?query=" + encodeURIComponent(query);
    console.log("[sabha] fetching:", endpoint);
    const resp = await fetch(endpoint);
    console.log("[sabha] status:", resp.status, resp.statusText);
    if (!resp.ok) {
      const body = await resp.text();
      console.error("[sabha] error body:", body);
      return [];
    }
    return await resp.json();
  }

  const query = url.searchParams.get("query");
  console.log("[load] query:", query, "| apiLink:", apiLink);

  if (!query) {
    return { debates: [], sabha: [] };
  }

  try {
    const [debatesResult, sabhaResult] = await Promise.all([
      debates(query),
      sabha(query),
    ]);
    return {
      debates: structuredClone(debatesResult),
      sabha: structuredClone(sabhaResult),
    };
  } catch (e) {
    console.error("[load] uncaught error:", e);
    return { debates: [], sabha: [] };
  }
};
