declare namespace chrome {
  type MessageListener = (
    message: unknown,
    sender: { id?: string; url?: string; tab?: tabs.Tab },
    sendResponse: (response: unknown) => void,
  ) => boolean | void;

  interface ChromeEvent<T> {
    addListener(callback: T): void;
  }

  namespace runtime {
    const id: string;
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
      active?: boolean;
    }
    interface TabChangeInfo { status?: "loading" | "complete" }
    const onUpdated: ChromeEvent<(tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void>;
    const onRemoved: ChromeEvent<(tabId: number) => void>;
    function query(queryInfo: { active?: boolean; lastFocusedWindow?: boolean; url?: string | string[] }): Promise<Tab[]>;
    function create(properties: { url: string; active?: boolean }): Promise<Tab>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }

  namespace alarms {
    interface Alarm { name: string }
    const onAlarm: ChromeEvent<(alarm: Alarm) => void>;
    function create(name: string, alarmInfo: { periodInMinutes: number }): void;
  }
}

declare const chrome: {
  runtime: typeof chrome.runtime;
  storage: typeof chrome.storage;
  tabs: typeof chrome.tabs;
  alarms: typeof chrome.alarms;
};

declare function importScripts(...urls: string[]): void;
