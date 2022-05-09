import * as vscode from "vscode";

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
function isEmptyLine(document: vscode.TextDocument, lineNo: Number): boolean {
	return document.lineAt(lineNo.valueOf()).isEmptyOrWhitespace;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
const DIR = {
	front: -1,
	back: +1,
};
type Dir = typeof DIR[keyof typeof DIR];
function serchClusterTerm(document: vscode.TextDocument, lineNo: number, serchDir: Dir): number {
	const validLineNo = (line: number) => {
		return (serchDir === DIR.front)
			? (line >= 0)
			: (line < document.lineCount);
	};

	var result = lineNo.valueOf();
	if (isEmptyLine(document, result)) { return result; }
	while (validLineNo(result)) {
		const checkLineNo = result + serchDir;
		if (!validLineNo(checkLineNo)) { return result; }
		if (isEmptyLine(document, checkLineNo)) { return result; }
		result = checkLineNo;
	}
	return result;
}

export function getCluster(document: vscode.TextDocument, lineNo: number): [number, number] {
	return [
		serchClusterTerm(document, lineNo, DIR.front),
		serchClusterTerm(document, lineNo, DIR.back),
	];
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function indentLevel(document: vscode.TextDocument, lineNo: number): number {
	const lineStr = document.lineAt(lineNo.valueOf()).text;
	var result = 0;
	for (const str of lineStr) {
		if (str === ' ') { result++; }
		//TODO:タブの考慮
		else { return result; }
	}
	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function isCheckBox(document: vscode.TextDocument, lineNo: Number): boolean {
	return getCheckType(document.lineAt(lineNo.valueOf()).text) !== null;
}

function isChildCheckBox(document: vscode.TextDocument, parentLineNo: number, childLineNo: number): boolean {
	if (parentLineNo >= childLineNo) { return false; }
	if (!isCheckBox(document, parentLineNo)) { return false; }
	if (!isCheckBox(document, childLineNo)) { return false; }

	const parentIndent = indentLevel(document, parentLineNo);
	for (var lineNo = childLineNo.valueOf(); lineNo > parentLineNo; lineNo -= 1) {
		const indent = indentLevel(document, lineNo);
		if (indent <= parentIndent) { return false; }
	}
	return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function getChildCheckBox(document: vscode.TextDocument, lineNo: number): Array<number> {
	const trgCluster = getCluster(document, lineNo);

	var result = new Array<number>();
	for (var trg = lineNo.valueOf(); trg <= trgCluster[1]; trg += 1) {
		if (isChildCheckBox(document, lineNo, trg)) { result.push(trg); }
	}

	return result;
}

function getParentCheckBox(document: vscode.TextDocument, lineNo: number): Array<number> {
	const trgCluster = getCluster(document, lineNo);

	var result = new Array<number>();
	for (var trg = trgCluster[0].valueOf(); trg <= lineNo; trg += 1) {
		if (isChildCheckBox(document, trg, lineNo)) { result.push(trg); }
	}

	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function getCheckBoxStatus(document: vscode.TextDocument, lineRange: [number, number]): Map<number, CheckType> {
	var result = new Map<number, CheckType>();
	for (var lineNo = lineRange[0]; lineNo <= lineRange[1]; lineNo++) {
		const checkBoxType = getCheckType(document.lineAt(lineNo).text);
		if (!checkBoxType) { continue; }

		result.set(lineNo, checkBoxType);
	}
	return result;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
function detectChackStateFromChild(document: vscode.TextDocument, chackBoxState: Map<number, CheckType>, lineNo: number): CheckType {
	const childCheckAry = getChildCheckBox(document, lineNo);

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

function applyCheckBoxStatus(editBuilder: vscode.TextEditorEdit,  document: vscode.TextDocument, checkBoxStatus: Map<number, CheckType>) {
	for(var item of checkBoxStatus){
		const lineNo=item[0];
		const newCheckType=item[1];
		const lineString = document.lineAt(lineNo).text;
	
		const curCheckType = getCheckType(lineString);
		if (!curCheckType) { return; }
		
		const newLineStr = lineString.replace(checkBoxStr(curCheckType), checkBoxStr(newCheckType));
		editBuilder.replace(document.lineAt(lineNo).range, newLineStr);
	}
}

function exec(editor: vscode.TextEditor, lineNo: number) {
	const document = editor.document;

	const type = getCheckType(document.lineAt(lineNo).text);
	if (!type) { return; }

	const trgCluster = getCluster(document, lineNo);
	const orgheckBoxStatus = getCheckBoxStatus(document, trgCluster);

	var newCheckBoxStatus = orgheckBoxStatus;

	const newCheckType = (type === CHECK_TYPE.on) ? CHECK_TYPE.off : CHECK_TYPE.on;
	newCheckBoxStatus.set(lineNo, newCheckType);

	const childCheckBocLineNoAry = getChildCheckBox(document, lineNo);
	for (const childCheckBocLineNo of childCheckBocLineNoAry) {
		newCheckBoxStatus.set(childCheckBocLineNo, newCheckType);
	}

	let parentCheckBocLineNoAry = getParentCheckBox(document, lineNo);
	parentCheckBocLineNoAry.sort();
	parentCheckBocLineNoAry.reverse();
	for (const parentCheckBocLineNo of parentCheckBocLineNoAry) {
		const newCheckType = detectChackStateFromChild(document, newCheckBoxStatus, parentCheckBocLineNo);
		newCheckBoxStatus.set(parentCheckBocLineNo, newCheckType);
	}

	editor.edit(editBuilder => {
		applyCheckBoxStatus(editBuilder,document, newCheckBoxStatus);
	});
}

///////////////////////////////////////////////////////////////////////////////////////////////////
let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {

	const disposable = vscode.commands.registerCommand('check-box-switcher.toggle check box', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) { return; }

		// const selections = editor.selections;
		const trgLineNo = editor.selection.active.line;
		exec(editor, trgLineNo);
	});

	context.subscriptions.push(disposable);
}