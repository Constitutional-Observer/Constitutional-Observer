// @ts-check
import { join } from "path";
import forms from "@tailwindcss/forms";
// 1. Import the Skeleton plugin
import { skeleton } from "@skeletonlabs/tw-plugin";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./src/**/*.{html,js,svelte,ts}",
    // 3. Append the path to the Skeleton package
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
        primaryDark: "#bdc391",
        secondary: "#c39791",
        tertiary: "#bdc391",
      },
    },
  },
  plugins: [skeleton],
};
