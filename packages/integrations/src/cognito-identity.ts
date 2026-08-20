import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  ApplicationError,
  type IdentityProvider,
  type IdentityProfile,
  type SignUpResult,
} from "@jingtang/application";
import { CognitoJwtVerifier } from "aws-jwt-verify";

export class CognitoIdentityProvider implements IdentityProvider {
  private readonly client: CognitoIdentityProviderClient;
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  public constructor(
    region: string,
    private readonly userPoolId: string,
    private readonly clientId: string,
  ) {
    this.client = new CognitoIdentityProviderClient({ region });
    this.verifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      tokenUse: "id",
    });
  }

  public async signUp(input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }): Promise<SignUpResult> {
    try {
      const result = await this.client.send(
        new SignUpCommand({
          ClientId: this.clientId,
          Username: input.email.trim().toLowerCase(),
          Password: input.password,
          UserAttributes: [
            { Name: "email", Value: input.email.trim().toLowerCase() },
            { Name: "name", Value: input.name.trim() },
          ],
        }),
      );
      if (!result.UserSub) throw new Error("Cognito did not return a subject");
      return { subject: result.UserSub, confirmed: result.UserConfirmed === true };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  public async confirmSignUp(input: {
    readonly email: string;
    readonly code: string;
  }): Promise<void> {
    try {
      await this.client.send(
        new ConfirmSignUpCommand({
          ClientId: this.clientId,
          Username: input.email.trim().toLowerCase(),
          ConfirmationCode: input.code,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  public async authenticate(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<IdentityProfile> {
    try {
      const result = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: this.clientId,
          AuthParameters: { USERNAME: input.email.trim().toLowerCase(), PASSWORD: input.password },
        }),
      );
      const idToken = result.AuthenticationResult?.IdToken;
      if (!idToken)
        throw new ApplicationError(
          "confirmation_required",
          "Account confirmation is required",
          409,
        );
      const payload = await this.verifier.verify(idToken);
      if (typeof payload.email !== "string" || typeof payload.name !== "string") {
        throw new ApplicationError("authentication_failed", "Identity profile is incomplete", 401);
      }
      return { subject: payload.sub, email: payload.email, name: payload.name };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw this.mapError(error);
    }
  }

  public async requestPasswordReset(email: string): Promise<void> {
    try {
      await this.client.send(
        new ForgotPasswordCommand({
          ClientId: this.clientId,
          Username: email.trim().toLowerCase(),
        }),
      );
    } catch (error) {
      const mapped = this.mapError(error);
      if (mapped.code === "rate_limited" || mapped.code === "service_unavailable") throw mapped;
    }
  }

  public async confirmPasswordReset(input: {
    readonly email: string;
    readonly code: string;
    readonly newPassword: string;
  }): Promise<void> {
    try {
      await this.client.send(
        new ConfirmForgotPasswordCommand({
          ClientId: this.clientId,
          Username: input.email.trim().toLowerCase(),
          ConfirmationCode: input.code,
          Password: input.newPassword,
        }),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): ApplicationError {
    const name = error instanceof Error ? error.name : "UnknownError";
    if (name === "UsernameExistsException")
      return new ApplicationError("conflict", "Account already exists", 409);
    if (name === "UserNotConfirmedException")
      return new ApplicationError("confirmation_required", "Account confirmation is required", 409);
    if (name === "NotAuthorizedException")
      return new ApplicationError("authentication_failed", "Invalid credentials", 401);
    if (
      name === "InvalidPasswordException" ||
      name === "CodeMismatchException" ||
      name === "ExpiredCodeException"
    ) {
      return new ApplicationError(
        "invalid_input",
        "The password or confirmation code was rejected",
        400,
      );
    }
    if (name === "UserNotFoundException")
      return new ApplicationError("not_found", "Identity was not found", 404);
    if (name === "TooManyRequestsException" || name === "LimitExceededException") {
      return new ApplicationError("rate_limited", "Try again later", 429);
    }
    return new ApplicationError("service_unavailable", "Identity service is unavailable", 503);
  }
}
