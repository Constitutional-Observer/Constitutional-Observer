export const actions = {
  query: async ({ request, fetch }) => {
    const body = await request.formData();
    const data = Object.fromEntries(body);

    let apiLink = "";
    // if local
    if (process.env.NODE_ENV === "development") {
      apiLink = "http://127.0.0.1:5000/";
    } else {
      // if production
      apiLink = "https://constitutional-observer.adhavansivaraj.xyz/";
    }
    // if production

    let debates = await fetch(
      apiLink + "debates/?query='" + data["query"] + "'"
    );

    // let hwdb = await fetch(
    //   apiLink + "/hwdb/?query='" + data["query"] + "'"
    // ).json();
    // hwdb = await hwdb;
    let sabha = await fetch(apiLink + "/sabha/?query='" + data["query"] + "'");

    let courts = await fetch(
      apiLink + "/courts/?query='" + data["query"] + "'"
    );

    debates = await debates.json();
    courts = await courts.json();
    sabha = await sabha.json();

    // parse through each df and share only if score>70\

    return {
      debates: debates,
      sabha: sabha,
      courts: courts,
    };
  },
};
