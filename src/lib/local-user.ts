import { createMiddleware } from "@tanstack/react-start";

export const LOCAL_USER_ID = "local-user";

export const localUserMiddleware = createMiddleware({ type: "function" }).server(
  ({ next }) => next({ context: { userId: LOCAL_USER_ID } }),
);
