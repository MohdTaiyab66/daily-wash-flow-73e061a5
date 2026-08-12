import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouterWithContext() {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
}

export const router = createRouterWithContext();

export const getRouter = () => router;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

