import * as vscode from "vscode";
import { LocalService } from "../services/local-service";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";

/**
 * This command is used to clear the local storage of the extension.
 * It will show a confirmation dialog to the user and if the user confirms, it will clear the local storage.
 * @param localService The local service
 * @param uiService The UI service
 * @returns A function that clears the local storage
 */
export function clearLocalStorageCommand(
  localService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const confirmSelection =
      await uiService.showQuickPick<vscode.QuickPickItem>(
        [{ label: "Yes" }, { label: "No" }],
        {
          placeHolder:
            "Are you sure you want to clear all local memo data? This cannot be undone.",
        }
      );

    if (confirmSelection && confirmSelection.label === "Yes") {
      try {
        await localService.clearAllLocalData();
        vscode.window.showInformationMessage(
          "Local memo storage has been cleared."
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error clearing local storage: ${error.message || error}`
        );
      }
    }
  };
}
