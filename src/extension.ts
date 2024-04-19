import * as vscode from "vscode";
import * as Enumerable from "linq-es2015";
import { assert } from "node:console";

///////////////////////////////////////////////////////////////////////////////////////////////////
const CHECK_TYPE = {
	on: "on",
	off: "off",
	mixed: "mixed",
} as const;
type CheckType = typeof CHECK_TYPE[keyof typeof CHECK_TYPE];

function checkBoxStr(checkType: CheckType): string {
	switch (checkType) {
		case "on": return "[X]";
		case "off": return "[ ]";
		case "mixed": return "[-]";
	}
}

function getCheckType(lineStr: string): CheckType | null {
	if (lineStr.indexOf(checkBoxStr(CHECK_TYPE.on)) >= 0) { return CHECK_TYPE.on; }
	if (lineStr.indexOf(checkBoxStr(CHECK_TYPE.off)) >= 0) { return CHECK_TYPE.off; }
	if (lineStr.indexOf(checkBoxStr(CHECK_TYPE.mixed)) >= 0) { return CHECK_TYPE.mixed; }
	return null;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
const DIRECTION = {
	front: -1,
	back: +1,
};
type Direction = typeof DIRECTION[keyof typeof DIRECTION];
function serchClusterTerm(
	document: vscode.TextDocument,
	lineNo: number,
	serchDir: Direction
): number {
	const isEmptyLine = (lineNo: number) => {
		if (lineNo < 0 || document.lineCount <= lineNo) { return true; }
		return document.lineAt(lineNo).isEmptyOrWhitespace;
	}
		;
	if (isEmptyLine(lineNo)) { return lineNo; }

	const range = (serchDir === DIRECTION.front)
		? Enumerable.range(0, lineNo + 1).Reverse()
		: Enumerable.range(lineNo, document.lineCount - lineNo + 1);

	const clusterEnd = (lineNo: number) => {
		const nextLineNo = lineNo + serchDir;
		return isEmptyLine(nextLineNo);
	};

	return range.First(clusterEnd);
}

export function getCluster(
	document: vscode.TextDocument,
	lineNo: number
): LineRange {
	return [
		serchClusterTerm(document, lineNo, DIRECTION.front),
		serchClusterTerm(document, lineNo, DIRECTION.back),
	];
}

///////////////////////////////////////////////////////////////////////////////////////////////////
export function indentLevel(
	document: vscode.TextDocument,
	tabSize: number,
	lineNo: number
): number {
	const lineStr = document.lineAt(lineNo.valueOf()).text;
	var result = 0;
	for (const str of lineStr) {
		if (str !== ' ' && str !== '\t') { return result; }

		if (str === ' ') {
			result++;
		} else {
			result = result - result % tabSize + tabSize;
		}
	}
	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function isCheckBox(
	document: vscode.TextDocument,
	lineNo: Number
): boolean {
	return getCheckType(document.lineAt(lineNo.valueOf()).text) !== null;
}

function isChildCheckBox(
	document: vscode.TextDocument,
	tabSize: number,
	parentLineNo: number,
	childLineNo: number
): boolean {
	if (parentLineNo >= childLineNo) { return false; }
	if (!isCheckBox(document, parentLineNo)) { return false; }
	if (!isCheckBox(document, childLineNo)) { return false; }

	const parentIndent = indentLevel(document, tabSize, parentLineNo);
	for (var lineNo = childLineNo.valueOf(); lineNo > parentLineNo; lineNo -= 1) {
		const indent = indentLevel(document, tabSize, lineNo);
		if (indent <= parentIndent) { return false; }
	}
	return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function getChildCheckBox(
	document: vscode.TextDocument,
	tabSize: number,
	trgCluster: LineRange,
	lineNo: number
): Array<number> {
	var result = new Array<number>();
	for (var trg = lineNo.valueOf(); trg <= trgCluster[1]; trg += 1) {
		if (isChildCheckBox(document, tabSize, lineNo, trg)) { result.push(trg); }
	}

	return result;
}

function getParentCheckBox(
	document: vscode.TextDocument,
	tabSize: number,
	trgCluster: LineRange,
	lineNo: number
): Array<number> {
	var result = new Array<number>();
	for (var trg = trgCluster[0].valueOf(); trg <= lineNo; trg += 1) {
		if (isChildCheckBox(document, tabSize, trg, lineNo)) { result.push(trg); }
	}

	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function getCheckBoxStatus(
	document: vscode.TextDocument,
	lineRange: LineRange
): Map<number, CheckType> {
	var result = new Map<number, CheckType>();
	for (var lineNo = lineRange[0]; lineNo <= lineRange[1]; lineNo++) {
		const checkBoxType = getCheckType(document.lineAt(lineNo).text);
		if (!checkBoxType) { continue; }

		result.set(lineNo, checkBoxType);
	}
	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function detectChackStateFromChild(
	document: vscode.TextDocument,
	tabSize: number,
	trgCluster: LineRange,
	chackBoxState: Map<number, CheckType>,
	lineNo: number
): CheckType {
	const childCheckAry = getChildCheckBox(document, tabSize, trgCluster, lineNo);

	var result: CheckType = CHECK_TYPE.mixed;
	for (const childCheck of childCheckAry) {
		const type = chackBoxState.get(childCheck);
		if (!type) { continue; }
		if (type === CHECK_TYPE.mixed) { return CHECK_TYPE.mixed; }

		if (result === CHECK_TYPE.mixed) { result = type; continue; }
		if (type !== result) { return CHECK_TYPE.mixed; }
	}
	return result;
}

export function applyCheckBoxStatus(
	editBuilder: vscode.TextEditorEdit,
	document: vscode.TextDocument,
	checkBoxStatus: Enumerable.Enumerable<[number, CheckType]>
) {
	for (var item of checkBoxStatus) {
		const lineNo = item[0];
		const newCheckType = item[1];
		const lineString = document.lineAt(lineNo).text;

		const curCheckType = getCheckType(lineString);
		if (!curCheckType) { assert(false); continue; }

		if (newCheckType === curCheckType) { continue; }

		const newLineStr = lineString.replace(checkBoxStr(curCheckType), checkBoxStr(newCheckType));
		editBuilder.replace(document.lineAt(lineNo).range, newLineStr);
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
type LineRange = [number, number];
type Lines = number[];

function groupingLineNoAry(
	document: vscode.TextDocument,
	lineNoAry: Enumerable.Enumerable<number>
): Array<[LineRange, Lines]> {
	var result = new Array<[LineRange, Lines]>();

	const includeInLastCluster = (lineNo: number) => {
		if (result.length === 0) { return false; }

		const lastCluster = result[result.length - 1][0];
		return lastCluster[0] <= lineNo && lineNo <= lastCluster[1];
	};

	const normalizedLineNoAry = lineNoAry.Distinct().ToArray().sort();
	for (const lineNo of normalizedLineNoAry) {
		const checkType = getCheckType(document.lineAt(lineNo).text);
		if (!checkType) { continue; }

		if (includeInLastCluster(lineNo)) {
			result[result.length - 1][1].push(lineNo);
			continue;
		}

		result.push([getCluster(document, lineNo), [lineNo]]);
	}
	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
export function calcNewCheckBoxStatus(
	document: vscode.TextDocument,
	trgCluster: LineRange,
	lineNoAry: Lines,
	tabSize: number
): Map<number, CheckType> {

	const orgheckBoxStatus = getCheckBoxStatus(document, trgCluster);

	var newCheckBoxStatus = orgheckBoxStatus;

	for (const lineNo of lineNoAry) {
		const orgCheckType = getCheckType(document.lineAt(lineNo).text);
		if (!orgCheckType) { continue; }

		const newCheckType = (orgCheckType === CHECK_TYPE.on) ? CHECK_TYPE.off : CHECK_TYPE.on;
		newCheckBoxStatus.set(lineNo, newCheckType);

		const childCheckBoxLineNoAry = getChildCheckBox(document, tabSize, trgCluster, lineNo);
		for (const childCheckBoxLineNo of childCheckBoxLineNoAry) {
			newCheckBoxStatus.set(childCheckBoxLineNo, newCheckType);
		}

		let parentCheckBoxLineNoAry = getParentCheckBox(document, tabSize, trgCluster, lineNo);
		parentCheckBoxLineNoAry.sort();
		parentCheckBoxLineNoAry.reverse();
		for (const parentCheckBoxLineNo of parentCheckBoxLineNoAry) {
			const newCheckType = detectChackStateFromChild(document, tabSize, trgCluster, newCheckBoxStatus, parentCheckBoxLineNo);
			newCheckBoxStatus.set(parentCheckBoxLineNo, newCheckType);
		}
	}

	return newCheckBoxStatus;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function exec(editor: vscode.TextEditor, lineNoAry: Enumerable.Enumerable<number>) {
	const document = editor.document;

	const tabSize = (typeof editor.options.tabSize === "number")
		? editor.options.tabSize
		: 2;

	const groupAry = groupingLineNoAry(document, lineNoAry);
	if (groupAry.length === 0) { return; }

	const newCheckBoxStatus = Enumerable.from(groupAry)
		.SelectMany(group =>
			[...calcNewCheckBoxStatus(document, group[0], group[1], tabSize)]);

	editor.edit(editBuilder => {
		applyCheckBoxStatus(editBuilder, document, newCheckBoxStatus);
	});
}

///////////////////////////////////////////////////////////////////////////////////////////////////
let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {

	const disposable = vscode.commands.registerCommand('check-box-switcher.toggle check box', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) { return; }

		exec(
			editor,
			Enumerable.from(editor.selections).Select(selection => selection.active.line)
		);
	});

	context.subscriptions.push(disposable);
}