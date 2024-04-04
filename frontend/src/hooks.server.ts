export const handleFetch = async ({ request, fetch, event }) => {
  if (request.url.startsWith("http://127.0.0.1:5000/")) {
    // Workaround: https://github.com/sveltejs/kit/issues/6608
    request.headers.set("origin", event.url.origin);
  }

  return fetch(request);
};
