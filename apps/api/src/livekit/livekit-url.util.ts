/**
 * LiveKit browser/SDK URL is usually `wss://…`; server SDK HTTP clients need `https://…`.
 */
export function livekitHttpHost(livekitUrl: string): string {
  if (livekitUrl.startsWith('wss://')) {
    return `https://${livekitUrl.slice('wss://'.length)}`;
  }
  if (livekitUrl.startsWith('ws://')) {
    return `http://${livekitUrl.slice('ws://'.length)}`;
  }
  return livekitUrl;
}
