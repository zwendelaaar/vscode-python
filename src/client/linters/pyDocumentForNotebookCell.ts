// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs-extra';
import * as hashjs from 'hash.js';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { IWorkspaceService } from '../common/application/types';
import { IDisposableRegistry } from '../common/types';

export class PyDocumentForNotebookCell implements vscode.TextDocument {
    public get uri(): vscode.Uri {
        return this.temporaryPath;
    }
    public get fileName(): string {
        return this.temporaryPath.fsPath;
    }
    public get isUntitled(): boolean {
        return this.notebookCellDocument.isUntitled;
    }
    public get languageId(): string {
        return this.notebookCellDocument.languageId;
    }
    public get version(): number {
        return this.notebookCellDocument.version;
    }
    public get isDirty(): boolean {
        return this.notebookCellDocument.isDirty;
    }
    public get isClosed(): boolean {
        return this.notebookCellDocument.isClosed;
    }
    public get eol(): vscode.EndOfLine {
        return this.notebookCellDocument.eol;
    }
    public get lineCount(): number {
        return this.notebookCellDocument.lineCount;
    }
    private static disposables = new Map<string, () => void>();
    private temporaryPath: vscode.Uri;
    private contents: string;
    private constructor(
        private notebookCellDocument: vscode.TextDocument,
        workspace: IWorkspaceService,
        disposables: IDisposableRegistry
    ) {
        this.contents = notebookCellDocument.getText();
        this.temporaryPath = vscode.Uri.file(
            path.join(
                this.computeOutputFolder(notebookCellDocument, workspace),
                `${path.basename(notebookCellDocument.fileName, '.ipynb')}.py` // .py is required for some linters to work
            )
        );

        // Make sure to cleanup all of the paths if necessary
        this.createDisposableForDir(path.dirname(path.dirname(this.temporaryPath.fsPath)), disposables);
    }
    public static async createPyDocumentForNotebookCell(
        notebookCellDocument: vscode.TextDocument,
        workspace: IWorkspaceService,
        disposables: IDisposableRegistry
    ): Promise<vscode.TextDocument> {
        const doc = new PyDocumentForNotebookCell(notebookCellDocument, workspace, disposables);
        await doc.writeContents();
        return doc;
    }
    public save(): Thenable<boolean> {
        // Rewrite our file on disk with our content
        return this.notebookCellDocument.save();
    }
    // tslint:disable-next-line: no-any
    public lineAt(position: any) {
        return this.notebookCellDocument.lineAt(position);
    }
    public offsetAt(position: vscode.Position): number {
        return this.notebookCellDocument.offsetAt(position);
    }
    public positionAt(offset: number): vscode.Position {
        return this.notebookCellDocument.positionAt(offset);
    }
    public getText(range?: vscode.Range | undefined): string {
        return this.notebookCellDocument.getText(range);
    }
    public getWordRangeAtPosition(position: vscode.Position, regex?: RegExp | undefined): vscode.Range | undefined {
        return this.notebookCellDocument.getWordRangeAtPosition(position, regex);
    }
    public validateRange(range: vscode.Range): vscode.Range {
        return this.notebookCellDocument.validateRange(range);
    }
    public validatePosition(position: vscode.Position): vscode.Position {
        return this.notebookCellDocument.validatePosition(position);
    }
    private createDisposableForDir(dir: string, disposableRegistry: IDisposableRegistry) {
        if (!PyDocumentForNotebookCell.disposables.has(dir)) {
            const disposableFunc = () => {
                fs.remove(dir).ignoreErrors();
            };
            PyDocumentForNotebookCell.disposables.set(dir, disposableFunc);
            disposableRegistry.push({ dispose: disposableFunc });
        }
    }
    private async writeContents(): Promise<void> {
        // Create root folder if necessary.
        const dir = path.dirname(this.temporaryPath.fsPath);
        if (!(await fs.pathExists(dir))) {
            await fs.mkdirs(dir);
        }

        // Write new contents. Use nodejs.fs cause we want this on the same machine as the extension
        return fs.writeFile(this.temporaryPath.fsPath, this.contents, { encoding: 'utf-8', flag: 'w' });
    }
    private computeOutputFolder(notebookCellDocument: vscode.TextDocument, workspace: IWorkspaceService): string {
        // We need to write the output file to a folder under the workspace or some of the linters will fail (like bandit).

        // So look there first
        const folder = workspace.getWorkspaceFolder(vscode.Uri.file(notebookCellDocument.uri.fsPath));

        // If not found, then use the temp dir
        const baseFolder = folder
            ? path.join(folder.uri.fsPath, '.vscode', '.notebook-linting')
            : path.join(tmpdir(), '.notebook-linting');

        // Combine this with a hash of the original URI so that
        // we end up reusing the temp folder
        return path.join(
            baseFolder,
            `${hashjs.sha1().update(notebookCellDocument.uri.toString()).digest('hex').substr(0, 12)}`
        );
    }
}
