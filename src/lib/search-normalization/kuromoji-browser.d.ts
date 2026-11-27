declare module 'kuromoji/src/Tokenizer.js' {
  import type { Tokenizer } from './normalizer';
  const TokenizerConstructor: new (dictionary: unknown) => Tokenizer;
  export default TokenizerConstructor;
}
declare module 'kuromoji/src/dict/DynamicDictionaries.js' {
  export default class DynamicDictionaries {
    loadTrie(...buffers: ArrayBufferView[]): void;
    loadTokenInfoDictionaries(...buffers: ArrayBufferView[]): void;
    loadConnectionCosts(...buffers: ArrayBufferView[]): void;
    loadUnknownDictionaries(...buffers: ArrayBufferView[]): void;
  }
}
