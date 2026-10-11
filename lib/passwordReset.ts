/**
 * Set by /auth/callback when a password-reset link is used. While it's present the
 * proxy keeps the user on /reset-password, so the email link can't be used to skip
 * straight into the app without choosing a new password.
 */
export const RESET_COOKIE = "pw_reset";
export const RESET_PATH = "/reset-password";
export const RESET_COOKIE_MAX_AGE = 60 * 60;
