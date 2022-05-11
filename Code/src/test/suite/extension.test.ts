import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import path = require('node:path');
import { getCluster, indentLevel } from '../../extension';

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
async function testindentLevel() {
	const document = await vscode.workspace.openTextDocument(testsRoot + `/IndentTest.md`);
	const tabSize = 2;

	for (const testLineNo of range(0, document.lineCount)) {
		const answer = parseInt(document.lineAt(testLineNo).text);
		const calced = indentLevel(document, tabSize, testLineNo);
		assert.equal(answer, calced, "");
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
suite('Extension Test Suite', () => {
	test('test get cluster', async () => {
		await testGetCluster(testsRoot + `/TestData_1.md`);
		await testGetCluster(testsRoot + `/TestData_2.md`);
		await testGetCluster(testsRoot + `/TestData_3.md`);
	});

	test('test indent Level', async () => {
		await testindentLevel();
	});
});
