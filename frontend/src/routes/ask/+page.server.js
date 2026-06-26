import { makeSearchLoad } from "$lib/server/search.js";

// /ask runs a search only when the URL carries a ?query=.
export const load = makeSearchLoad();
