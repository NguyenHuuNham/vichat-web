import { create } from 'zustand';
import { ChatMessage, MessageTranslation, TranslationLanguage } from '../types';
import { clearTranslationCache, translateText } from '../services/translationService';

export type TranslationStatus = 'loading' | 'ready' | 'same' | 'error';

export interface TranslationEntry extends Partial<MessageTranslation> {
  status: TranslationStatus;
  error?: string;
}

interface TranslationState {
  targets: Record<string, TranslationLanguage>;
  entries: Record<string, TranslationEntry>;
  setTarget: (conversationId: string, language: TranslationLanguage | null) => void;
  translateMessage: (conversationId: string, messageId: string, text: string, language: TranslationLanguage) => Promise<void>;
  translateConversation: (conversationId: string, messages: ChatMessage[], language: TranslationLanguage) => Promise<void>;
  hideTranslation: (key: string) => void;
  clearAll: () => void;
}

const pending = new Map<string, Promise<void>>();
let sessionGeneration = 0;

export function translationKey(conversationId: string, messageId: string, text: string) {
  return `${conversationId}:${messageId}:${text}`;
}

function conversationPrefix(conversationId: string) {
  return `${conversationId}:`;
}

function removeConversationEntries(entries: Record<string, TranslationEntry>, conversationId: string) {
  const prefix = conversationPrefix(conversationId);
  return Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(prefix)));
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  targets: {},
  entries: {},

  setTarget(conversationId, language) {
    const id = String(conversationId || '').trim();
    if (!id) return;
    sessionGeneration += 1;
    set(state => ({
      targets: language ? { ...state.targets, [id]: language } : Object.fromEntries(Object.entries(state.targets).filter(([key]) => key !== id)),
      entries: removeConversationEntries(state.entries, id),
    }));
  },

  async translateMessage(conversationId, messageId, text, language) {
    const id = String(conversationId || '').trim();
    const message = String(messageId || '').trim();
    const value = String(text || '').trim();
    if (!id || !message || !value) return;
    const key = translationKey(id, message, value);
    const requestKey = `${key}:${language}`;
    const current = get().entries[key];
    if (current?.status === 'loading') {
      const pendingRequest = pending.get(requestKey);
      if (pendingRequest) return pendingRequest;
    }
    if (current?.status === 'ready' && current.language === language) return;

    const generation = sessionGeneration;
    set(state => ({ entries: { ...state.entries, [key]: { status: 'loading', language } } }));
    const request = translateText(value, language).then(result => {
      if (generation !== sessionGeneration) return;
      const same = result.text.trim() === value;
      set(state => ({ entries: { ...state.entries, [key]: {
        status: same ? 'same' : 'ready',
        text: result.text,
        language,
        sourceLanguage: result.sourceLanguage,
        translatedAt: Date.now(),
      } } }));
    }).catch(error => {
      if (generation === sessionGeneration) {
        set(state => ({ entries: { ...state.entries, [key]: { status: 'error', language, error: error instanceof Error ? error.message : 'Dịch tin nhắn tạm thời không khả dụng.' } } }));
      }
      throw error;
    }).finally(() => {
      if (pending.get(requestKey) === request) pending.delete(requestKey);
    });
    pending.set(requestKey, request);
    return request;
  },

  async translateConversation(conversationId, messages, language) {
    const candidates = messages.filter(message => message.type === 'text' && Boolean(message.text?.trim())).slice(-20);
    for (const message of candidates) {
      await get().translateMessage(conversationId, message.id, message.text, language).catch(() => {});
    }
  },

  hideTranslation(key) {
    set(state => {
      const entries = { ...state.entries };
      delete entries[key];
      return { entries };
    });
  },

  clearAll() {
    sessionGeneration += 1;
    pending.clear();
    clearTranslationCache();
    set({ targets: {}, entries: {} });
  },
}));
