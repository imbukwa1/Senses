import { ApiError } from "@/features/auth/api";

type MessageOptions = {
  action?: string;
  badRequest?: string;
  conflict?: string;
  forbidden?: string;
  notFound?: string;
  payloadTooLarge?: string;
  server?: string;
  unauthenticated?: string;
  validation?: string;
};

export function userFacingErrorMessage(error: Error | null | undefined, options: MessageOptions = {}) {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return options.badRequest ?? options.validation ?? defaultActionMessage(options.action);
    }
    if (error.status === 401) {
      return options.unauthenticated ?? "Your session has expired. Please sign in again.";
    }
    if (error.status === 403) {
      return options.forbidden ?? "You do not have access to this resource.";
    }
    if (error.status === 404) {
      return options.notFound ?? "The requested record could not be found.";
    }
    if (error.status === 409) {
      return options.conflict ?? "This change conflicts with existing data.";
    }
    if (error.status === 413) {
      return options.payloadTooLarge ?? "The selected file is too large.";
    }
    if (error.status === 422) {
      return options.validation ?? defaultActionMessage(options.action);
    }
    if (error.status >= 500) {
      return options.server ?? "The server is unavailable. Please try again shortly.";
    }

    return defaultActionMessage(options.action);
  }

  return "Unable to reach the server. Please try again.";
}

function defaultActionMessage(action: string | undefined) {
  return action ? `Please check ${action} and try again.` : "Please check your request and try again.";
}
