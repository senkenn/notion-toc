import "~/lib/outline.css";
import { initToc } from "~/lib/outline";

export default defineContentScript({
  matches: ["*://*.notion.so/*", "*://*.notion.site/*"],
  main() {
    initToc();
  },
});
