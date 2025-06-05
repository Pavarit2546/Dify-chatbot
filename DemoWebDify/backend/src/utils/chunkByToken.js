import { encode, decode } from "gpt-3-encoder";

export default function chunkByToken(text, maxTokens = 250) {
  const tokens = encode(text);
  const chunks = [];

  for (let i = 0; i < tokens.length; i += maxTokens) {
    const chunkTokens = tokens.slice(i, i + maxTokens);
    chunks.push(decode(chunkTokens));
  }

  return chunks;
}
