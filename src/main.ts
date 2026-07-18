import "./styles.css";
import { PrototypeApp } from "./prototype-app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("App root not found.");
}

new PrototypeApp(root);
