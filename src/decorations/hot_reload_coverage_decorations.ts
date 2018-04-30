import * as vs from "vscode";
import { DebugCommands } from "../commands/debug";
import { fsPath } from "../utils";

export class HotReloadCoverageDecorations implements vs.Disposable {
	private subscriptions: vs.Disposable[] = [];
	private fileState: {
		[key: string]: {
			modified: CodeRange[],
			notRun: CodeRange[],
		},
	} = {};
	private isDebugging = false;

	// TODO: Move these to gutter
	private readonly modifiedDecorationType = vs.window.createTextEditorDecorationType({
		backgroundColor: "grey",
		rangeBehavior: vs.DecorationRangeBehavior.OpenOpen,
	});
	private readonly notRunDecorationType = vs.window.createTextEditorDecorationType({
		backgroundColor: "red",
		rangeBehavior: vs.DecorationRangeBehavior.OpenOpen,
	});

	constructor(debug: DebugCommands) {
		this.subscriptions.push(vs.workspace.onDidChangeTextDocument((e) => this.onDidChangeTextDocument(e)));
		this.subscriptions.push(debug.onDidHotReload(() => this.onDidHotReload()));
		this.subscriptions.push(debug.onDidFullRestart(() => this.onDidFullRestart()));
		this.subscriptions.push(vs.debug.onDidStartDebugSession((e) => this.onDidStartDebugSession()));
		this.subscriptions.push(vs.debug.onDidTerminateDebugSession((e) => this.onDidTerminateDebugSession()));
		// TODO: On execution, remove RELOADED_NOT_RUN
		// TODO: On open editor, restore all marks from fileState
		// TODO: Does format and other code actions call this?
		// TODO: If file modified externally, we may need to drop all markers?
	}

	private onDidChangeTextDocument(e: vs.TextDocumentChangeEvent) {
		if (!this.isDebugging)
			return;

		const editor = vs.window.activeTextEditor.document === e.document ? vs.window.activeTextEditor : null;
		if (!editor)
			return;

		let fileState = this.fileState[fsPath(e.document.uri)];
		if (!fileState) {
			fileState = this.fileState[fsPath(e.document.uri)] = { modified: [], notRun: [] };
		}

		// Update all exisint ranges offsets.
		for (const change of e.contentChanges) {
			const diff = change.text.length - change.rangeLength;
			if (diff === 0)
				continue;

			fileState.modified = this.translateChanges(fileState.modified, change);
			fileState.notRun = this.translateChanges(fileState.notRun, change);
		}

		// Append the new ranges.
		for (const change of e.contentChanges) {
			fileState.modified.push({ offset: change.rangeOffset, length: change.text.length });
		}

		this.redrawDecorations([editor]);
	}

	private translateChanges(ranges: CodeRange[], change: vs.TextDocumentContentChangeEvent): CodeRange[] {
		const diff = change.text.length - change.rangeLength;
		return ranges
			// TODO: Handle intersections (where content from the existing range was replaced by the new one).
			.map((r) => {
				if (change.rangeOffset >= r.offset) {
					// If the new change is after the old one, we don't need to map.
					return r;
				} else if (change.rangeOffset <= r.offset && change.rangeOffset + change.rangeLength > r.offset + r.length) {
					// If this new change contains the whole of the old change, we don't need the old change.
					return undefined;
				} else {
					// Otherwise, just need to offset it.
					return { offset: r.offset + diff, length: r.length };
				}
			})
			.filter((r) => r);
	}

	private onDidHotReload(): void {
		for (const file of Object.keys(this.fileState)) {
			for (const line of Object.keys(this.fileState[file]).map((k) => parseInt(k, 10))) {
				const fileState = this.fileState[file];
				fileState.modified.forEach((r) => fileState.notRun.push(r));
				fileState.modified.length = 0;
			}
		}

		this.redrawDecorations(vs.window.visibleTextEditors);
	}

	private onDidFullRestart(): void {
		this.clearAllMarkers();
	}

	private onDidStartDebugSession(): void {
		this.isDebugging = true;
	}

	private onDidTerminateDebugSession(): void {
		this.isDebugging = false;
		this.clearAllMarkers();
	}

	private clearAllMarkers(): void {
		for (const file of Object.keys(this.fileState)) {
			delete this.fileState[file];
		}

		this.redrawDecorations(vs.window.visibleTextEditors);
	}

	private redrawDecorations(editors: vs.TextEditor[]): void {
		for (const editor of editors) {
			const fileState = this.fileState[fsPath(editor.document.uri)];
			editor.setDecorations(
				this.modifiedDecorationType,
				fileState ? this.toRanges(editor, fileState.modified) : [],
			);
			editor.setDecorations(
				this.notRunDecorationType,
				fileState ? this.toRanges(editor, fileState.notRun) : [],
			);
		}
	}

	private toRanges(editor: vs.TextEditor, rs: CodeRange[]): vs.Range[] {
		return rs.map((r) => new vs.Range(editor.document.positionAt(r.offset), editor.document.positionAt(r.offset + r.length)));
	}

	public dispose() {
		this.subscriptions.forEach((s) => s.dispose());
	}
}

interface CodeRange {
	offset: number;
	length: number;
}
