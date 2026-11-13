import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export const initializeWallet = async (userId: string): Promise<void> => {
  const walletUrl = new URL(
    `/api/credit/wallet/${encodeURIComponent(userId)}`,
    env.creditServiceUrl
  );

  let response: Response;
  try {
    response = await fetch(walletUrl, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError(
      503,
      "Wallet initialization failed; registration was not completed."
    );
  }

  if (!response.ok) {
    throw new AppError(
      503,
      "Wallet initialization failed; registration was not completed."
    );
  }
};
