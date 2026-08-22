import {
  ApplicationError,
  type YouTubeAuthorizationTokens,
  type YouTubeChannelIdentity,
  type YouTubeOAuthProvider,
  type YouTubeTestFault,
  type YouTubeUploadResult,
  type YouTubeVideoStatus,
} from "@jingtang/application";

const controlledVideoId = "controlled-test-video";

export class DeterministicYouTubeTestAdapter implements YouTubeOAuthProvider {
  public constructor(
    private readonly delegate: YouTubeOAuthProvider,
    private readonly fault: Exclude<YouTubeTestFault, "none">,
  ) {}

  public authorizationUrl(input: {
    readonly state: string;
    readonly codeChallenge: string;
    readonly redirectUri: string;
  }): URL {
    return this.delegate.authorizationUrl(input);
  }

  public exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<YouTubeAuthorizationTokens> {
    return this.delegate.exchangeAuthorizationCode(input);
  }

  public readAuthorizedChannel(accessToken: string): Promise<YouTubeChannelIdentity> {
    return this.delegate.readAuthorizedChannel(accessToken);
  }

  public refreshAuthorization(refreshToken: string): Promise<YouTubeAuthorizationTokens> {
    if (this.fault === "oauth_expired") {
      return Promise.reject(
        new ApplicationError("authentication_failed", "Controlled authorization expiry", 401),
      );
    }
    return this.delegate.refreshAuthorization(refreshToken);
  }

  public revokeAuthorization(token: string): Promise<void> {
    return this.delegate.revokeAuthorization(token);
  }

  public uploadPrivateVideo(input: {
    readonly accessToken: string;
    readonly title: string;
    readonly description: string;
    readonly madeForKids: boolean;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly body: ReadableStream<Uint8Array>;
  }): Promise<YouTubeUploadResult> {
    if (this.fault === "timeout") {
      return Promise.reject(
        new ApplicationError("service_unavailable", "Controlled YouTube timeout", 503),
      );
    }
    if (this.fault === "quota") {
      return Promise.reject(new ApplicationError("rate_limited", "Controlled quota limit", 429));
    }
    if (this.fault === "oauth_expired") {
      return Promise.reject(
        new ApplicationError("authentication_failed", "Controlled authorization expiry", 401),
      );
    }
    if (this.fault === "ambiguous_upload") {
      return Promise.reject(
        new ApplicationError("conflict", "Controlled ambiguous upload result", 409),
      );
    }
    if (this.fault === "processing_failed") {
      return Promise.resolve({
        videoId: controlledVideoId,
        videoUrl: `https://www.youtube.com/watch?v=${controlledVideoId}`,
      });
    }
    return this.delegate.uploadPrivateVideo(input);
  }

  public readVideoStatus(accessToken: string, videoId: string): Promise<YouTubeVideoStatus> {
    if (this.fault === "processing_failed" && videoId === controlledVideoId) {
      return Promise.resolve({ state: "failed", failureCategory: "controlled_test_fault" });
    }
    return this.delegate.readVideoStatus(accessToken, videoId);
  }
}
