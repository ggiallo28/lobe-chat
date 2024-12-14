import { Auth } from "aws-amplify";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";

/**
 * Retrieve Cognito session details in a pseudo-synchronous manner.
 * @param identityPoolId - The Cognito Identity Pool ID.
 * @returns A simulated synchronous object containing userIdToken and userPoolId.
 */
export const getCognitoSessionDetailsSync = (identityPoolId: string) => {
  if (!identityPoolId) {
    throw new Error("Identity Pool ID is required");
  }

  let sessionDetails: { userIdToken: string; userPoolId: string } | undefined;

  // Attempt to retrieve the current session
  Auth.currentSession()
    .then((session) => {
      const idToken = session.getIdToken().getJwtToken();
      const userPoolId = session.getIdToken().payload.iss.split("/")[3];

      sessionDetails = {
        userIdToken: idToken,
        userPoolId,
      };
    })
    .catch((error) => {
      console.error("Failed to get Cognito session details:", error);
      throw new Error("Unable to retrieve session details.");
    });

  if (!sessionDetails) {
    throw new Error("Session details are not available yet. This function does not block.");
  }

  return sessionDetails;
};

/**
 * Retrieve AWS credentials using Cognito Identity Pool and User Pool details.
 * @param userIdToken - The Cognito User Pool ID token.
 * @param userPoolId - The Cognito User Pool ID.
 * @param identityPoolId - The Cognito Identity Pool ID.
 * @param region - The AWS region.
 * @returns AWS credentials from Cognito Identity Pool.
 */
export const getCognitoCredentials = (
  userIdToken: string,
  userPoolId: string,
  identityPoolId: string,
  region: string
) => {
  if (!userIdToken || !userPoolId || !identityPoolId || !region) {
    throw new Error(
      "All parameters (userIdToken, userPoolId, identityPoolId, region) are required."
    );
  }

  return fromCognitoIdentityPool({
    identityPoolId,
    logins: {
      [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: userIdToken,
    },
    clientConfig: { region },
  });
};

/**
 * Retrieve Cognito session details asynchronously (preferred approach).
 * @param identityPoolId - The Cognito Identity Pool ID.
 * @returns A promise resolving to an object containing userIdToken and userPoolId.
 */
export const getCognitoSessionDetailsAsync = async (identityPoolId: string) => {
  try {
    if (!identityPoolId) {
      throw new Error("Identity Pool ID is required");
    }

    const session = await Auth.currentSession();
    const idToken = session.getIdToken().getJwtToken();
    const userPoolId = session.getIdToken().payload.iss.split("/")[3];

    return {
      userIdToken: idToken,
      userPoolId,
    };
  } catch (error) {
    console.error("Failed to get Cognito session details:", error);
    throw error;
  }
};