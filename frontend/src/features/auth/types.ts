export type LoginPayload = {
  email: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
};

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};
