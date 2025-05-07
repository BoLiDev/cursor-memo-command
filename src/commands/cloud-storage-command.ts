import * as vscode from "vscode";
import { CloudService } from "../services/cloud-service";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";

/**
 * This command is used to clear the local storage of cloud memos and categories.
 * It will show a confirmation dialog to the user and if the user confirms, it will clear the local data.
 * @param cloudService The cloud service
 * @param uiService The UI service
 * @returns A function that clears the local cloud storage
 */
export function createClearCloudStorageHandler(
  cloudService: CloudService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const confirmSelection =
      await uiService.showQuickPick<vscode.QuickPickItem>(
        [{ label: "Yes" }, { label: "No" }],
        {
          placeHolder:
            "Are you sure you want to clear all local cloud memo data? This will not affect data on GitLab.",
        }
      );

    if (confirmSelection && confirmSelection.label === "Yes") {
      try {
        await cloudService.clearAllCloudData();
        uiService.showInformationMessage(
          "Local cloud memo storage has been cleared."
        );
      } catch (error: any) {
        uiService.showErrorMessage(
          `Error clearing local cloud storage: ${error.message || error}`
        );
      }
    }
  };
}
