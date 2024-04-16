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

    return {
      streamed: {
        debates: await (
          await fetch(
            apiLink + "debates/?query=" + encodeURIComponent(data["query"])
          )
        ).json(),
        sabha: await (
          await fetch(
            apiLink + "/sabha/?query=" + encodeURIComponent(data["query"])
          )
        ).json(),
        courts: await (
          await fetch(
            apiLink + "/courts/?query=" + encodeURIComponent(data["query"])
          )
        ).json(),
      },
    };
  },
};
