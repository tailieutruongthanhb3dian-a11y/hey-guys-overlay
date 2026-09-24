import { mount } from "svelte";
import "../app.css";
import { installGlobalErrorLog } from "../lib/errlog";
import App from "./App.svelte";
import { prepareWeb } from "../lib/web-transport";

void prepareWeb().then(() => {
  installGlobalErrorLog("main");
  mount(App, { target: document.getElementById("app")! });
});
