declare module 'jsdoc' {
  interface DocToText {
    (input: ArrayBuffer | Uint8Array): string | null;
  }

  const docToText: DocToText;
  export = docToText;
}
