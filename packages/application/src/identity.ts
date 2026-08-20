export interface IdentityProfile {
  readonly subject: string;
  readonly email: string;
  readonly name: string;
}

export interface SignUpResult {
  readonly subject: string;
  readonly confirmed: boolean;
}

export interface IdentityProvider {
  signUp(input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }): Promise<SignUpResult>;
  confirmSignUp(input: { readonly email: string; readonly code: string }): Promise<void>;
  authenticate(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<IdentityProfile>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(input: {
    readonly email: string;
    readonly code: string;
    readonly newPassword: string;
  }): Promise<void>;
}
