/** @format */

import * as vscode from "vscode";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { MemoItem } from "../models/memo-item";
import { createMultilineInputBox, directPaste } from "../utils";

/**
 * Creates the save command handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The save command handler function
 */
export function createSaveCommandHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    let clipboardText = "";
    try {
      clipboardText = await vscode.env.clipboard.readText();
    } catch (error) {
      // Ignore clipboard errors
    }

    const commandText = await createMultilineInputBox(
      "Save Command",
      "Enter or paste the command content",
      clipboardText
    );

    if (commandText) {
      await dataService.addCommand(commandText);
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage("Command saved");
    }
  };
}

/**
 * Creates the remove command handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The remove command handler function
 */
export function createRemoveCommandHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const success = await dataService.removeCommand(item.id);

    if (success) {
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage("Command deleted");
    }
  };
}

/**
 * Creates the rename command handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The rename command handler function
 */
export function createRenameCommandHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const alias = await vscode.window.showInputBox({
      placeHolder: "Enter new alias for the command",
      prompt: "This will change how the command appears in the list",
      value: item.alias || item.label,
    });

    if (alias !== undefined) {
      const success = await dataService.renameCommand(item.id, alias);

      if (success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage("Command renamed");
      }
    }
  };
}

/**
 * Creates the paste to editor command handler
 * @returns The paste to editor command handler function
 */
export function createPasteToEditorHandler(): (
  ...args: any[]
) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    await vscode.env.clipboard.writeText(item.command);
    await directPaste();
  };
}

/**
 * Creates the edit command handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The edit command handler function
 */
export function createEditCommandHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const editedCommand = await createMultilineInputBox(
      "Edit Command Content",
      "Modify command content",
      item.command
    );

    if (editedCommand !== undefined && editedCommand !== item.command) {
      const success = await dataService.editCommand(item.id, editedCommand);

      if (success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage("Command updated");
      }
    }
  };
}
