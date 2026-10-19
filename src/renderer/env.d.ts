export interface UpdateStatus {
  state: 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'dev' | 'error';
  manual?: boolean;
  version?: string;
  percent?: number;
  message?: string;
}

export interface ClippyBridge {
  getVersion(): Promise<string>;
  checkForUpdates(): void;
  installUpdate(): void;
  quit(): void;
  setIgnoreMouse(ignore: boolean): void;
  dragStart(): void;
  dragMove(dx: number, dy: number): void;
  dragEnd(): void;
  onCursor(cb: (pos: { x: number; y: number }) => void): void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): void;
  getSettings(): Promise<{ chattiness: 'quiet' | 'low' | 'normal' | 'high' }>;
  onSettings(cb: (s: { chattiness: 'quiet' | 'low' | 'normal' | 'high' }) => void): void;
  /** Tray Quit: speak a goodbye, then call quitNow(). */
  onClosing(cb: () => void): void;
  onSay(cb: (req: { category: string }) => void): void;
  quitNow(): void;
  /** Tray debug menu: play an animation state ('stop' fades the current one out). */
  onPlay(cb: (req: { id: string; duration?: number }) => void): void;
}

declare global {
  interface Window {
    clippy?: ClippyBridge;
  }
}
