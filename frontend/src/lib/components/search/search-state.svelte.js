export const searchBox = $state({ query: "" });
export const ui = $state({ showBookmarks: false });
class SearchParams {
  hybrid = $state(false);
  semanticRatio = $state(0.5);
  limit = $state(200);
  scoreThreshold = $state(0.1);
  indexIds = $state(new Set());

  build(query) {
    const params = new URLSearchParams({
      query,
      hybrid: String(this.hybrid),
      semanticRatio: String(this.semanticRatio),
      limit: String(this.limit),
      scoreThreshold: String(this.scoreThreshold),
    });
    if (this.indexIds.size > 0)
      params.set("indices", [...this.indexIds].join(","));
    return params;
  }
}

export const searchParams = new SearchParams();
