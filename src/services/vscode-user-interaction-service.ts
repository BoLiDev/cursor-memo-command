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

  async createMultilineInputBox(
    title: string,
    placeHolder: string,
    value: string = ""
  ): Promise<string | undefined> {
    const inputBox = vscode.window.createInputBox();
    inputBox.title = title;
    inputBox.placeholder = placeHolder;
    inputBox.value = value;
    inputBox.ignoreFocusOut = true;
    console.warn(
      "createMultilineInputBox currently uses a standard persistent InputBox, not true multiline."
    );

    inputBox.buttons = [
      {
        iconPath: new vscode.ThemeIcon("save"),
        tooltip: "Confirm (Enter)",
      },
    ];

    return new Promise((resolve) => {
      let resolved = false;
      inputBox.onDidAccept(() => {
        if (resolved) return;
        resolved = true;
        resolve(inputBox.value);
        inputBox.hide();
        inputBox.dispose();
      });

      inputBox.onDidTriggerButton((button) => {
        if (resolved) return;
        resolved = true;
        resolve(inputBox.value);
        inputBox.hide();
        inputBox.dispose();
      });

      inputBox.onDidHide(() => {
        if (!resolved) {
          resolve(undefined);
        }
        inputBox.dispose();
      });

      inputBox.show();
    });
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
}
