export const actions = {
  query: async ({ request, fetch }) => {
    const body = await request.formData();
    const data = Object.fromEntries(body);

    let debates = await fetch(
      "http://127.0.0.1:8000/debates/?query=" + data["query"] + '"'
    );
    let hwdb = await fetch(
      "http://127.0.0.1:8000/hwdb/?query=" + data["query"] + '"'
    );
    let sabha = await fetch(
      "http://127.0.0.1:8000/sabha/?query=" + data["query"] + '"'
    );
    let courts = await fetch(
      "http://127.0.0.1:8000/courts/?query=" + data["query"] + '"'
    );
    return {
      debates: await debates.json(),
      hwdb: await hwdb.json(),
      sabha: await sabha.json(),
      courts: await courts.json(),
    };
  },
};
