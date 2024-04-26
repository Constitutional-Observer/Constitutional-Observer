export const actions = {
  query: async ({ request, fetch }) => {
    const body = await request.formData();
    const data = Object.fromEntries(body);

    let apiLink = "";
    // if local
    if (import.meta.env.MODE === "development") {
      apiLink = "http://127.0.0.1:5000/";
    } else {
      // if production
      apiLink = "https://constitutional-observer-backend.adhavansivaraj.xyz/";
    }

    async function debates() {
      let resp = await fetch(
        apiLink + "debates/?query=" + encodeURIComponent(data["query"])
      );
      return await resp.json();
    }

    async function sabha() {
      let resp = await fetch(
        apiLink + "/sabha/?query=" + encodeURIComponent(data["query"])
      );

      return await resp.json();
    }

    return {
      debates: structuredClone(await debates()), // debates(),
      sabha: structuredClone(await sabha()), // sabha(),
    };
  },
};
