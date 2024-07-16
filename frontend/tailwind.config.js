// @ts-check
import { join } from "path";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import { skeleton } from "@skeletonlabs/tw-plugin";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./src/**/*.{html,js,svelte,ts}",
    join(
      require.resolve("@skeletonlabs/skeleton"),
      "../**/*.{html,js,svelte,ts}"
    ),
  ],
  theme: {
    extend: {
      colors: {
        primary: "#c3b091",
        primaryLight: "#f0e9da",
        primaryDark: "#ded2bd",
        secondary: "#c39791",
        tertiary: "#bdc391",
      },
    },
  },
  plugins: [skeleton, forms, typography],
};
