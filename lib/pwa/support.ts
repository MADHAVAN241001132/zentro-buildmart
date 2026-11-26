/**
 * Pure helpers for the install experience. Kept free of browser APIs so they can be unit tested.
 */

export const INSTALL_DISMISSED_KEY = 'zb_install_dismissed';

/** iPhone, iPad and iPod, plus iPadOS which reports itself as a Mac with touch points. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Safari on iOS only. Other iOS browsers (Chrome, Firefox, Edge, Opera) cannot add to the home screen,
 * so they receive no instructions for it.
 */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!isIosDevice(userAgent, maxTouchPoints)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(userAgent)) return false;
  return /Safari/.test(userAgent);
}

/** True when the app is already running from a home-screen or installed window. */
export function isStandalone(displayModeStandalone: boolean, navigatorStandalone?: boolean): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export function shouldOfferInstall(input: { standalone: boolean; dismissed: boolean }): boolean {
  return !input.standalone && !input.dismissed;
}
