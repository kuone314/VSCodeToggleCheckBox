import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import * as Enumerable from "linq-es2015";

import path = require('node:path');
import { getCluster, indentLevel } from '../../extension';
import { calcNewCheckBoxStatus, applyCheckBoxStatus } from '../../extension';
///////////////////////////////////////////////////////////////////////////////////////////////////
const testsRoot = path.resolve(__dirname, '../../../src/test/TestData');

///////////////////////////////////////////////////////////////////////////////////////////////////
function* range(start: number, end: number, step = 1) {
	if ((start < end && step <= 0) || (start > end && step >= 0)) {
		throw new Error();
	}

	const symbol = step > 0 ? 1 : -1;
	for (let i = start * symbol; i < end * symbol; i += step * symbol) {
		yield i && i * symbol;
	}
}

function* closedRange(start: number, end: number, step = 1) {
	if ((start < end && step <= 0) || (start > end && step >= 0)) {
		throw new Error();
	}

	const symbol = step > 0 ? 1 : -1;
	for (let i = start * symbol; i <= end * symbol; i += step * symbol) {
		yield i && i * symbol;
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
async function testGetCluster(testDataPath: string) {
	console.log(testDataPath);
	const document = await vscode.workspace.openTextDocument(testDataPath);

	for (const testLineNo of range(0, document.lineCount)) {
		if (document.lineAt(testLineNo).isEmptyOrWhitespace) { continue; }

		console.log("testLineNo:" + testLineNo.toString());
		const cluster = getCluster(document, testLineNo);
		console.log("cluster:" + cluster.toString());

		if (testLineNo < cluster[0] || cluster[1] < testLineNo) {
			assert.fail("invalid range");
		}

		for (const clusterLineNo of range(cluster[0], cluster[1])) {
			if (document.lineAt(clusterLineNo).isEmptyOrWhitespace) {
				console.log("clusterLineNo:" + clusterLineNo.toString());
				assert.fail("exist non empty line");
			}
		}
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
async function testIndentLevel() {
	const document = await vscode.workspace.openTextDocument(testsRoot + `/IndentTest.md`);
	const tabSize = 2;

	for (const testLineNo of range(0, document.lineCount)) {
		const answer = parseInt(document.lineAt(testLineNo).text);
		const calced = indentLevel(document, tabSize, testLineNo);
		assert.strictEqual(answer, calced, "");
	}
}


///////////////////////////////////////////////////////////////////////////////////////////////////
async function execEdit(
	document: vscode.TextDocument,
	lineNoAry: number[]
) {
	const tabSize = 2;
	const cluster = getCluster(document, lineNoAry[0]);
	const newCheckBoxStatus = calcNewCheckBoxStatus(document, cluster, lineNoAry, tabSize);

	let editor = await vscode.window.showTextDocument(document);
	await editor.edit(editBuilder => {
		applyCheckBoxStatus(editBuilder, document, Enumerable.from(newCheckBoxStatus));
	});
}

async function checkText(
	testName: string,
	document: vscode.TextDocument,
	expectedTextFilePath: string
) {
	const expectedDocument = await vscode.workspace.openTextDocument(expectedTextFilePath);

	assert.strictEqual(
		document.getText(),
		expectedDocument.getText(),
		testName
	);
}

async function testEdit() {
	const document = await vscode.workspace.openTextDocument(testsRoot + `/TestEdit/TestData.md`);

	await execEdit(document, [1]);
	await checkText(`Off => Mixed`, document, testsRoot + `/TestEdit/Result_1.md`);

	await execEdit(document, [2]);
	await checkText(`Mixed => On`, document, testsRoot + `/TestEdit/Result_2.md`);

	await execEdit(document, [0]);
	await checkText(`On => Off`, document, testsRoot + `/TestEdit/TestData.md`);

	await execEdit(document, [7, 9]);
	await checkText(`Off => Mixed(Deep,Multi)`, document, testsRoot + `/TestEdit/Result_3.md`);

	await execEdit(document, [8]);
	await checkText(`Mixed => Mixed`, document, testsRoot + `/TestEdit/Result_4.md`);

	await execEdit(document, [7]);
	await checkText(`Mixed => Off`, document, testsRoot + `/TestEdit/TestData.md`);

	await execEdit(document, [11]);
	await checkText(`Off => On`, document, testsRoot + `/TestEdit/Result_5.md`);

	await execEdit(document, [14]);
	await checkText(`On => Mixed`, document, testsRoot + `/TestEdit/Result_6.md`);
}

///////////////////////////////////////////////////////////////////////////////////////////////////
suite('Extension Test Suite', () => {
	// test('test get cluster', async () => {
	// 	await testGetCluster(testsRoot + `/TestData_1.md`);
	// 	await testGetCluster(testsRoot + `/TestData_2.md`);
	// 	await testGetCluster(testsRoot + `/TestData_3.md`);
	// 	await testGetCluster(testsRoot + `/TestData_4.md`);
	// });

	// test('test indent Level', async () => {
	// 	await testIndentLevel();
	// });

	test('test edit', async () => {
		await testEdit();
	});
});
