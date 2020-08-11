// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// tslint:disable:no-require-imports no-var-requires
import { assert } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ICommandManager, IVSCodeNotebook } from '../../../client/common/application/types';
import { Commands } from '../../../client/common/constants';
import { IDisposable } from '../../../client/common/types';
import { INotebookEditorProvider } from '../../../client/datascience/types';
import { IExtensionTestApi } from '../../common';
import { EXTENSION_ROOT_DIR_FOR_TESTS, initialize } from '../../initialize';
import { canRunTests, closeNotebooksAndCleanUpAfterTests, setLinterToPylint, trustAllNotebooks } from './helper';
// tslint:disable-next-line: no-var-requires no-require-imports

// tslint:disable: no-any no-invalid-this
suite('DataScience - VSCode Notebook - (linting)', function () {
    this.timeout(15_000);
    const templateIPynb = path.join(
        EXTENSION_ROOT_DIR_FOR_TESTS,
        'src',
        'test',
        'datascience',
        'notebook',
        'linterTest.ipynb'
    );
    let api: IExtensionTestApi;
    const disposables: IDisposable[] = [];
    suiteSetup(async function () {
        this.timeout(15_000);
        api = await initialize();
        if (!(await canRunTests())) {
            return this.skip();
        }
    });
    setup(async () => {
        await trustAllNotebooks();
        sinon.restore();
    });
    teardown(async () => closeNotebooksAndCleanUpAfterTests(disposables));
    suiteTeardown(closeNotebooksAndCleanUpAfterTests);

    test('Linter runs on file', async () => {
        await setLinterToPylint(false);
        const editorProvider = api.serviceContainer.get<INotebookEditorProvider>(INotebookEditorProvider);
        await editorProvider.open(vscode.Uri.file(templateIPynb));

        const document = api.serviceContainer.get<IVSCodeNotebook>(IVSCodeNotebook).activeNotebookEditor!.document;

        // Wait for the linter to run
        await api.serviceContainer.get<ICommandManager>(ICommandManager).executeCommand(Commands.Run_Linter);

        // Each cell should have its own list of linting errors
        const cell1 = document.cells[0];
        let diagnostics = vscode.languages.getDiagnostics(cell1.document.uri);
        assert.ok(diagnostics.length >= 4, 'No linting on first cell');
        const cell2 = document.cells[1];
        diagnostics = vscode.languages.getDiagnostics(cell2.document.uri);
        assert.ok(diagnostics.length >= 3, 'No linting on second cell');
    });
});
