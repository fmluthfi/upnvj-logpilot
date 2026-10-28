declare namespace chrome {
  type MessageListener = (
    message: unknown,
    sender: { tab?: tabs.Tab },
    sendResponse: (response: unknown) => void,
  ) => boolean | void;

  interface ChromeEvent<T> {
    addListener(callback: T): void;
  }

  namespace runtime {
    const onMessage: ChromeEvent<MessageListener>;
    const onInstalled: ChromeEvent<() => void>;
    const onStartup: ChromeEvent<() => void>;
    function sendMessage(message: unknown): Promise<unknown>;
  }

  namespace storage {
    interface StorageArea {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
      setAccessLevel(options: { accessLevel: "TRUSTED_CONTEXTS" | "TRUSTED_AND_UNTRUSTED_CONTEXTS" }): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function query(queryInfo: { active: boolean; lastFocusedWindow: boolean }): Promise<Tab[]>;
    function create(properties: { url: string; active?: boolean }): Promise<Tab>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }
}

declare const chrome: {
  runtime: typeof chrome.runtime;
  storage: typeof chrome.storage;
  tabs: typeof chrome.tabs;
};

declare function importScripts(...urls: string[]): void;
