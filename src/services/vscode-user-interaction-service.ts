/** @format */

import * as vscode from "vscode";

/**
 * Concrete implementation for UI interactions using the vscode API.
 * This class can be used directly as a type for dependency injection.
 */
export class VSCodeUserInteractionService {
  showInputBox(
    options?: vscode.InputBoxOptions,
    token?: vscode.CancellationToken
  ): Promise<string | undefined> {
    return Promise.resolve(vscode.window.showInputBox(options, token));
  }

  showQuickPick<T extends vscode.QuickPickItem>(
    items: ReadonlyArray<T> | Thenable<ReadonlyArray<T>>,
    options?: vscode.QuickPickOptions & { canPickMany?: false },
    token?: vscode.CancellationToken
  ): Promise<T | undefined>;
  showQuickPick<T extends vscode.QuickPickItem>(
    items: ReadonlyArray<T> | Thenable<ReadonlyArray<T>>,
    options: vscode.QuickPickOptions & { canPickMany: true },
    token?: vscode.CancellationToken
  ): Promise<T[] | undefined>;
  showQuickPick<T extends vscode.QuickPickItem>(
    items: ReadonlyArray<T> | Thenable<ReadonlyArray<T>>,
    options?: vscode.QuickPickOptions,
    token?: vscode.CancellationToken
  ): Promise<T | T[] | undefined> {
    return Promise.resolve(vscode.window.showQuickPick(items, options, token));
  }

  showInformationMessage(
    message: string,
    ...items: string[]
  ): Promise<string | undefined>;
  showInformationMessage<T extends vscode.MessageItem>(
    message: string,
    ...items: T[]
  ): Promise<T | undefined>;
  showInformationMessage<T extends vscode.MessageItem>(
    message: string,
    options: vscode.MessageOptions,
    ...items: T[]
  ): Promise<T | undefined>;
  showInformationMessage(
    message: string,
    ...args: any[]
  ): Promise<any | undefined> {
    let result: Thenable<any | undefined>;
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      if (typeof (args[0] as any).modal === "boolean") {
        const options = args[0] as vscode.MessageOptions;
        const items = args.slice(1) as vscode.MessageItem[];
        result = vscode.window.showInformationMessage(
          message,
          options,
          ...items
        );
      } else {
        const items = args as vscode.MessageItem[];
        result = vscode.window.showInformationMessage(message, ...items);
      }
    } else if (args.length > 0 && typeof args[0] === "string") {
      const items = args as string[];
      result = vscode.window.showInformationMessage(message, ...items);
    } else {
      result = vscode.window.showInformationMessage(message);
    }
    return Promise.resolve(result);
  }

  showWarningMessage(
    message: string,
    ...items: string[]
  ): Promise<string | undefined>;
  showWarningMessage<T extends vscode.MessageItem>(
    message: string,
    ...items: T[]
  ): Promise<T | undefined>;
  showWarningMessage<T extends vscode.MessageItem>(
    message: string,
    options: vscode.MessageOptions,
    ...items: T[]
  ): Promise<T | undefined>;
  showWarningMessage(
    message: string,
    ...args: any[]
  ): Promise<any | undefined> {
    let result: Thenable<any | undefined>;
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      if (typeof (args[0] as any).modal === "boolean") {
        const options = args[0] as vscode.MessageOptions;
        const items = args.slice(1) as vscode.MessageItem[];
        result = vscode.window.showWarningMessage(message, options, ...items);
      } else {
        const items = args as vscode.MessageItem[];
        result = vscode.window.showWarningMessage(message, ...items);
      }
    } else if (args.length > 0 && typeof args[0] === "string") {
      const items = args as string[];
      result = vscode.window.showWarningMessage(message, ...items);
    } else {
      result = vscode.window.showWarningMessage(message);
    }
    return Promise.resolve(result);
  }

  showErrorMessage(
    message: string,
    ...items: string[]
  ): Promise<string | undefined>;
  showErrorMessage<T extends vscode.MessageItem>(
    message: string,
    ...items: T[]
  ): Promise<T | undefined>;
  showErrorMessage<T extends vscode.MessageItem>(
    message: string,
    options: vscode.MessageOptions,
    ...items: T[]
  ): Promise<T | undefined>;
  showErrorMessage(message: string, ...args: any[]): Promise<any | undefined> {
    let result: Thenable<any | undefined>;
    if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
      if (typeof (args[0] as any).modal === "boolean") {
        const options = args[0] as vscode.MessageOptions;
        const items = args.slice(1) as vscode.MessageItem[];
        result = vscode.window.showErrorMessage(message, options, ...items);
      } else {
        const items = args as vscode.MessageItem[];
        result = vscode.window.showErrorMessage(message, ...items);
      }
    } else if (args.length > 0 && typeof args[0] === "string") {
      const items = args as string[];
      result = vscode.window.showErrorMessage(message, ...items);
    } else {
      result = vscode.window.showErrorMessage(message);
    }
    return Promise.resolve(result);
  }

  withProgress<R>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => Thenable<R>
  ): Thenable<R> {
    return vscode.window.withProgress(options, task);
  }

  /**
   * Creates a custom webview with a multiline text area for entering larger text content
   * @param title Title displayed in the webview panel
   * @param placeHolder Placeholder text for the text area
   * @param value Initial value for the text area
   * @returns Promise that resolves to the entered text or undefined if canceled
   */
  async createMultilineInputBox(
    title: string,
    placeHolder: string,
    value: string = ""
  ): Promise<string | undefined> {
    // Create and show webview panel
    const panel = vscode.window.createWebviewPanel(
      "multilineInput",
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // HTML content for the webview
    panel.webview.html = this.getMultilineInputHtml(
      panel.webview,
      placeHolder,
      value
    );

    // Set up messaging and return a promise
    return new Promise<string | undefined>((resolve) => {
      // Handle messages from the webview
      panel.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
          case "save":
            resolve(message.text);
            panel.dispose();
            break;
          case "cancel":
            resolve(undefined);
            panel.dispose();
            break;
        }
      });

      // Handle panel closing
      panel.onDidDispose(() => {
        resolve(undefined);
      });
    });
  }

  /**
   * Generate the HTML for the multiline input webview
   */
  private getMultilineInputHtml(
    webview: vscode.Webview,
    placeHolder: string,
    value: string
  ): string {
    // Create a nonce to whitelist scripts
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <style>
          body {
            padding: 15px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
          }

          .container {
            display: flex;
            flex-direction: column;
            height: 50vh;
          }

          .textarea-container {
            flex: 1;
            margin-bottom: 12px;
          }

          textarea {
            width: 100%;
            height: calc(50vh - 72px);
            padding: 10px;
            resize: none;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
          }

          textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
          }

          .button-container {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
          }

          button {
            padding: 6px 14px;
            border: none;
            cursor: pointer;
          }

          .save-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }

          .cancel-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="textarea-container">
            <textarea id="input-area" placeholder="${placeHolder}">${value}</textarea>
          </div>

          <div class="button-container">
            <button class="cancel-button" id="cancel-button">Cancel</button>
            <button class="save-button" id="save-button">Save</button>
          </div>
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const textarea = document.getElementById('input-area');
          const saveButton = document.getElementById('save-button');
          const cancelButton = document.getElementById('cancel-button');

          // Focus the textarea when the webview loads
          textarea.focus();

          // Add event listeners
          saveButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'save',
              text: textarea.value
            });
          });

          cancelButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'cancel'
            });
          });

          // Handle keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            // Ctrl+Enter or Cmd+Enter to save
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              vscode.postMessage({
                command: 'save',
                text: textarea.value
              });
            }

            // Escape to cancel
            if (e.key === 'Escape') {
              vscode.postMessage({
                command: 'cancel'
              });
            }
          });
        </script>
      </body>
      </html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  openExternal(uri: vscode.Uri): Promise<boolean> {
    return Promise.resolve(vscode.env.openExternal(uri));
  }

  executeCommand<T = unknown>(
    command: string,
    ...rest: any[]
  ): Promise<T | undefined> {
    return Promise.resolve(vscode.commands.executeCommand<T>(command, ...rest));
  }

  readClipboard(): Promise<string> {
    return Promise.resolve(vscode.env.clipboard.readText());
  }

  writeClipboard(value: string): Promise<void> {
    return Promise.resolve(vscode.env.clipboard.writeText(value));
  }

  /**
   * Writes text to the cursor chat using the composer.startComposerPrompt command
   * @param text The text to write
   */
  async openCursorChat(): Promise<void> {
    await vscode.commands.executeCommand("composer.startComposerPrompt");
  }
}
