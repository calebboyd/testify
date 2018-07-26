import * as mm from "micromatch";
import * as path from "path";
import {
  FileSystemWatcher,
  Uri,
  window,
  workspace,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent
} from "vscode";

import {
  ITestFrameworkConfig,
  IWorkspaceConfig
} from "../interfaces/IWorkspaceConfig";
import { parseConfig } from "../parser/configParser";
import TestRunnerCodeLensProvider from "../providers/TestRunnerCodeLensProvider";

export class PluginConfig {
  private testFrameworkConfig: { [key: number]: IWorkspaceConfig } = {};
  private fileWatchers: { [key: number]: FileSystemWatcher } = {};

  constructor() {
    // Register workspace folder change listener to detect added/removed workspaces during runtime
    workspace.onDidChangeWorkspaceFolders(this.onWorkspaceChanged);
    // Check existing workspace for mocha/jest dependency
    if (workspace.workspaceFolders) {
      const p = [];
      workspace.workspaceFolders.forEach(ws => {
        p.push(this.updateWorkspace(ws));
      });
      Promise.all(p)
        .then(() => this.refreshCodeLenseOnActiveEditor())
        .catch(() => this.refreshCodeLenseOnActiveEditor());
    }
  }

  public getWorkspaceConfig(ws: WorkspaceFolder) {
    return this.testFrameworkConfig[ws.index];
  }

  public getTestRunner(uri: Uri) {
    const config = this.getTestFrameworkConfig(uri);
    if (config) {
      return config.runner;
    }
  }

  /**
   * Get the framwork config for the given file
   *
   * @param uri File uri for which the framework config should be retrieved
   */
  public getTestFrameworkConfig(uri: Uri): ITestFrameworkConfig {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    const workspaceConfig = this.getWorkspaceConfig(workspaceFolder);
    const relativePath = path.relative(workspaceFolder.uri.path, uri.path);
    if (workspaceConfig) {
      for (const c of workspaceConfig.frameworkConfigs) {
        if (this.isTestFrameworkFile(relativePath, c)) {
          return c;
        }
      }
    }
  }

  /**
   * Check if the given file is a test file
   *
   * @param uri File uri that should be checked
   */
  public isTestFile(uri: Uri) {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    const workspaceConfig = this.getWorkspaceConfig(workspaceFolder);
    const relativePath = path.relative(workspaceFolder.uri.path, uri.path);
    if (workspaceConfig) {
      for (const c of workspaceConfig.frameworkConfigs) {
        if (this.isTestFrameworkFile(relativePath, c)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if the given file is a test file of the given test framework
   *
   * @param relativePath
   * @param config
   */
  private isTestFrameworkFile(
    relativePath: string,
    config: ITestFrameworkConfig
  ) {
    for (const ignorePattern of config.ignorePatterns) {
      if (
        typeof ignorePattern === "string" &&
        mm.isMatch(relativePath, ignorePattern)
      ) {
        return false;
      } else if (
        typeof ignorePattern === "object" &&
        ignorePattern.test(relativePath)
      ) {
        return false;
      }
    }
    for (const pattern of config.patterns) {
      if (typeof pattern === "string" && mm.isMatch(relativePath, pattern)) {
        return true;
      } else if (typeof pattern === "object" && pattern.test(relativePath)) {
        return true;
      }
    }
    return false;
  }

  private updateWorkspace(ws: WorkspaceFolder) {
    const config = workspace.getConfiguration("javascript-test-runner", ws.uri);
    if (!this.fileWatchers[ws.index]) {
      const fileWatcher = workspace.createFileSystemWatcher(
        path.join(ws.uri.fsPath, config.get("packageJson", "package.json"))
      );
      fileWatcher.onDidChange((uri: Uri) => {
        // tslint:disable-next-line:no-console
        console.log("Update package.json");
        this.updateWorkspace(workspace.getWorkspaceFolder(uri));
      });
      fileWatcher.onDidCreate((uri: Uri) => {
        // tslint:disable-next-line:no-console
        console.log("create package.json");
        this.updateWorkspace(workspace.getWorkspaceFolder(uri));
      });
      fileWatcher.onDidDelete((uri: Uri) => {
        // tslint:disable-next-line:no-console
        console.log("delete package.json");
        this.updateWorkspace(workspace.getWorkspaceFolder(uri));
      });
      this.fileWatchers[ws.index] = fileWatcher;
    }
    return this.parseWorkspaceConfig(ws);
  }

  /**
   * Parse all require files (package.json ....) to build a pligin config
   *
   * @param ws Workspace that should be parsed
   */
  private async parseWorkspaceConfig(ws: WorkspaceFolder) {
    const c = await parseConfig(ws);
    this.testFrameworkConfig[ws.index] = c;
    this.refreshCodeLenseOnActiveEditor();
  }

  /**
   * Event handler executed when a workspace is added/removed
   *
   * Responsible to remove/add the workspace plugin config
   *
   * @param event
   */
  private onWorkspaceChanged(event: WorkspaceFoldersChangeEvent) {
    window.showInformationMessage("Worspace was changed " + event);
    if (event.removed) {
      event.removed.forEach(ws => {
        delete this.testFrameworkConfig[ws.index];
        this.fileWatchers[ws.index].dispose();
        delete this.fileWatchers[ws.index];
      });
    }
    if (event.added) {
      event.added.forEach(ws => {
        this.updateWorkspace(ws);
      });
    }
  }

  /**
   * Refresh the code lense on the current active editor window
   */
  private refreshCodeLenseOnActiveEditor() {
    if (window.activeTextEditor) {
      new TestRunnerCodeLensProvider(this).provideCodeLenses(
        window.activeTextEditor.document
      );
    }
  }
}