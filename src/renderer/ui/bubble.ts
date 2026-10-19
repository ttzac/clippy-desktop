export class Bubble {
  private readonly el = document.getElementById('bubble')!;
  private readonly text = document.getElementById('bubble-text')!;
  private readonly updateBtn = document.getElementById('update-btn') as HTMLButtonElement;
  private timer = 0;
  private sticky = false;

  constructor(onRestart: () => void) {
    this.updateBtn.onclick = onRestart;
  }

  /** Show a message. Sticky messages (e.g. update ready) are not replaced by transient ones. */
  say(message: string, opts: { ms?: number; sticky?: boolean; restart?: boolean } = {}) {
    if (this.sticky && !opts.sticky) return;
    this.sticky = !!opts.sticky;
    this.text.textContent = message;
    this.updateBtn.hidden = !opts.restart;
    this.el.hidden = false;
    window.clearTimeout(this.timer);
    if (!opts.sticky) this.timer = window.setTimeout(() => this.hide(), opts.ms ?? 5000);
  }

  hide() {
    this.sticky = false;
    this.updateBtn.hidden = true;
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
