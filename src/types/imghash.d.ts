declare module 'imghash' {
  export function hash(input: string | Buffer, bits?: number, format?: 'hex' | 'binary'): Promise<string>;
  const imghash: { hash: typeof hash };
  export default imghash;
}
