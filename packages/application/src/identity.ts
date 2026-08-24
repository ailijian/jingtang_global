export interface IdentityProfile {
  readonly subject: string;
  readonly email: string;
  readonly name: string;
}

export interface SignUpResult {
  readonly confirmed: boolean;
  readonly profile?: IdentityProfile;
  readonly challenge?: string;
}

export interface IdentityDeletionProvider {
  deleteAccount(input: { readonly email: string; readonly subject: string }): Promise<void>;
}

export interface IdentityProvider extends IdentityDeletionProvider {
  signUp(input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }): Promise<SignUpResult>;
  confirmSignUp(input: {
    readonly email: string;
    readonly code: string;
    readonly password?: string;
    readonly name?: string;
    readonly challenge?: string;
  }): Promise<IdentityProfile>;
  authenticate(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<IdentityProfile>;
  requestPasswordReset(email: string): Promise<{ readonly challenge?: string }>;
  confirmPasswordReset(input: {
    readonly email: string;
    readonly code: string;
    readonly newPassword: string;
    readonly challenge?: string;
  }): Promise<void>;
}
