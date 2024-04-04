import { writable } from "svelte/store";
import { browser } from "$app/environment";

export let query;
if (browser) {
  query = writable(localStorage.getItem("query") || "");
  query.subscribe((value) => localStorage.setItem("query", value));
}
