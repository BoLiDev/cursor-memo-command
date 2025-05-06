/** @format */

import * as vscode from "vscode";

/**
 * Service for managing access to the extension's configuration settings.
 * Provides type-safe accessors and handles configuration changes.
 */
export class ConfigurationService {
  private readonly configSection = "cursorMemo";
  private _onDidChangeConfiguration = new vscode.EventEmitter<void>();
  readonly onDidChangeConfiguration: vscode.Event<void> =
    this._onDidChangeConfiguration.event;

  private gitlabDomain!: string;
  private gitlabProjectId!: string;
  private gitlabFilePath!: string;
  private gitlabBranch!: string;

  constructor(context: vscode.ExtensionContext) {
    this.loadConfiguration();

    // Register listener for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(this.configSection)) {
          this.loadConfiguration();
          this._onDidChangeConfiguration.fire();
        }
      })
    );
  }

  /**
   * Loads (or reloads) the configuration values from VS Code settings.
   */
  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration(this.configSection);
    this.gitlabDomain = normalizeGitLabDomain(
      config.get<string>("gitlabDomain")
    );
    this.gitlabProjectId = config.get<string>("gitlabProjectId") || "9993";
    this.gitlabFilePath = config.get<string>("gitlabFilePath") || "prompt.json";
    this.gitlabBranch = config.get<string>("gitlabBranch") || "master";
  }

  public getGitlabDomain(): string {
    return this.gitlabDomain;
  }

  public getGitlabProjectId(): string {
    return this.gitlabProjectId;
  }

  public getGitlabFilePath(): string {
    return this.gitlabFilePath;
  }

  public getGitlabBranch(): string {
    return this.gitlabBranch;
  }
}

/**
 * Normalize GitLab API URL (copied from gitlab-service.ts, should be centralized)
 * TODO: Move this helper to a shared utility module if needed elsewhere.
 */
function normalizeGitLabDomain(url?: string): string {
  if (!url) {
    return "https://gitlab.com/api/v4";
  }

  let normalizedUrl = url.trim();
  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  if (!normalizedUrl.endsWith("/api/v4")) {
    normalizedUrl = `${normalizedUrl}/api/v4`;
  }

  return normalizedUrl;
}
