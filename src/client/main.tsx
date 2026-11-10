// Монтирует приложение без постоянного хранилища и без запроса к внешним сервисам.
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { IskraWorkspace } from "./workspace/IskraWorkspace";
import "@fontsource-variable/inter";
import "./styles.css";
// Прямая ссылка на самостоятельное интервью сохраняет режим собственного API.
const standalone =
  new URLSearchParams(location.search).get("view") === "interview";
createRoot(document.getElementById("root")!).render(
  standalone ? <App /> : <IskraWorkspace />,
);
