import { Terminal, TerminalOptions, window } from "vscode";

export class TerminalProvider {
  private activeTerminal: Terminal = null;

  public get(terminalOptions: TerminalOptions): Terminal {
    if (this.activeTerminal) {
      this.activeTerminal.dispose();
    }

    this.activeTerminal = window.createTerminal(terminalOptions);

    return this.activeTerminal;
  }
}
