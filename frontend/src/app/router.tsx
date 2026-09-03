import { createBrowserRouter } from "react-router-dom";

import { FoundationScreen } from "@/routes/FoundationScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FoundationScreen />,
  },
  {
    path: "*",
    element: <FoundationScreen />,
  },
]);
