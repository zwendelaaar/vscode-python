// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs-extra';
import * as hashjs from 'hash.js';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
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
    private constructor(private notebookCellDocument: vscode.TextDocument, disposables: IDisposableRegistry) {
        // Create a hash of the fsPath for our temporary file name. This hash should
        // remain the same so future creations of this same object should write to the same file.
        this.contents = notebookCellDocument.getText();
        this.temporaryPath = vscode.Uri.file(
            path.join(
                tmpdir(),
                `${hashjs.sha1().update(notebookCellDocument.uri.toString()).digest('hex').substr(0, 12)}.py`
            )
        );
        if (!PyDocumentForNotebookCell.disposables.has(this.temporaryPath.fsPath)) {
            const disposableFunc = () => {
                fs.remove(this.temporaryPath.fsPath).ignoreErrors();
            };
            PyDocumentForNotebookCell.disposables.set(this.temporaryPath.fsPath, disposableFunc);
            disposables.push({ dispose: disposableFunc });
        }
    }
    public static async createPyDocumentForNotebookCell(
        notebookCellDocument: vscode.TextDocument,
        disposables: IDisposableRegistry
    ): Promise<vscode.TextDocument> {
        const doc = new PyDocumentForNotebookCell(notebookCellDocument, disposables);
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
    private writeContents(): Promise<void> {
        return fs.writeFile(this.temporaryPath.fsPath, this.contents, { encoding: 'utf-8', flag: 'w' });
    }
}
