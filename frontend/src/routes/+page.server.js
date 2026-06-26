import { makeSearchLoad } from "$lib/server/search.js";

// The home page shows the search UI inline; seed it with a default query so the
// landing section has results before the user picks a theme or searches.
export const load = makeSearchLoad("MGNREGA women");
