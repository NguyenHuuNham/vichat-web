import { create } from 'zustand';
import { FileAttachment } from '../types';
import { getCachedTranscription, transcribeAudioMessage } from '../services/voiceTranscriptionService';

export interface VoiceTranscriptionEntry {
  text: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  visible: boolean;
  error?: string;
}

interface VoiceTranscriptionState {
  entries: Record<string, VoiceTranscriptionEntry>;
  transcribe: (messageId: string, file: FileAttachment) => Promise<string>;
  toggleVisible: (messageId: string, file: FileAttachment) => Promise<void>;
  hide: (messageId: string) => void;
  clearAll: () => void;
}

export const useVoiceTranscriptionStore = create<VoiceTranscriptionState>((set, get) => ({
  entries: {},

  async transcribe(messageId: string, file: FileAttachment) {
    const id = String(messageId || '').trim();
    if (!id) return '';

    const current = get().entries[id];
    if (current?.status === 'ready' && current.text) {
      if (!current.visible) {
        set(state => ({
          entries: {
            ...state.entries,
            [id]: { ...state.entries[id], visible: true },
          },
        }));
      }
      return current.text;
    }

    const cached = getCachedTranscription(file, id);
    if (cached) {
      set(state => ({
        entries: {
          ...state.entries,
          [id]: { text: cached, status: 'ready', visible: true },
        },
      }));
      return cached;
    }

    set(state => ({
      entries: {
        ...state.entries,
        [id]: { text: '', status: 'loading', visible: true },
      },
    }));

    try {
      const text = await transcribeAudioMessage(file, id);
      set(state => ({
        entries: {
          ...state.entries,
          [id]: { text, status: 'ready', visible: true },
        },
      }));
      return text;
    } catch (err: any) {
      const rawError = err instanceof Error ? err.message : String(err || '');
      const errorMsg = /404|downloadFileAsync|rejected/i.test(rawError)
        ? 'Chưa thể tải tệp âm thanh để chuyển văn bản · Chạm để thử lại'
        : (rawError || 'Chưa thể nhận dạng âm thanh · Chạm để thử lại');
      set(state => ({
        entries: {
          ...state.entries,
          [id]: { text: '', status: 'error', visible: true, error: errorMsg },
        },
      }));
      return '';
    }
  },

  async toggleVisible(messageId: string, file: FileAttachment) {
    const id = String(messageId || '').trim();
    if (!id) return;

    const current = get().entries[id];
    // Nếu đang mở rộng (dù ready hay error) -> Chạm nút ^ để thu gọn lại
    if (current?.visible) {
      set(state => ({
        entries: {
          ...state.entries,
          [id]: { ...state.entries[id], visible: false },
        },
      }));
      return;
    }

    // Nếu đang thu gọn -> Mở lại nếu đã có kết quả sẵn, hoặc chạy bóc băng
    if (current?.status === 'ready' && current.text) {
      set(state => ({
        entries: {
          ...state.entries,
          [id]: { ...state.entries[id], visible: true },
        },
      }));
      return;
    }

    await get().transcribe(id, file).catch(() => {});
  },

  hide(messageId: string) {
    const id = String(messageId || '').trim();
    if (!id) return;
    set(state => {
      const current = state.entries[id];
      if (!current) return state;
      return {
        entries: {
          ...state.entries,
          [id]: { ...current, visible: false },
        },
      };
    });
  },

  clearAll() {
    set({ entries: {} });
  },
}));
