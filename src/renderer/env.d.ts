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
}

declare global {
  interface Window {
    clippy?: ClippyBridge;
  }
}
