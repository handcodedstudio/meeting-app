// Chat streaming is handled inside `useChatStore` (subscribes to onChatChunk / onChatError
// at store creation). This module is intentionally a thin re-export so consumers can
// access streaming-related state via the store.
export { useChatStore } from '../stores/chat';
