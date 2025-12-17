declare module 'qrcode-terminal' {
  export function generate(text: string, options?: { small?: boolean }): void;
}

declare module 'qrcode' {
  export function toDataURL(text: string): Promise<string>;
}
