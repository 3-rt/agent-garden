/**
 * Device pixel ratio used for HiDPI rendering.
 * Phaser game runs at css * dpr resolution with camera zoom = dpr,
 * so all world coordinates stay in CSS/logical pixels.
 */
export const GAME_DPR = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
