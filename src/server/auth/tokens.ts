
/**
 * 64文字のランダムトークンの生成
 */
export const randomToken = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * SHA-256でハッシュ化し、16進数文字列として返却
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashBytes = new Uint8Array(hashBuffer);
  return Array.from(hashBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}