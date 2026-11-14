import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChefPrototype } from "./ChefPrototype";
import "./chef-prototype.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChefPrototype />
  </StrictMode>,
);
