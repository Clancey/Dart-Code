'use strict';

import * as channels from "./channels";
import * as child_process from "child_process";
import * as os from "os";
import * as path from "path";
import * as project from "./project";
import * as vs from "vscode";

export class PubManager {
	private sdk: string;

	constructor(sdk: string) {
		this.sdk = sdk;
	}

	registerCommands(context: vs.ExtensionContext) {
		context.subscriptions.push(vs.commands.registerCommand("pub.get", selection => {
			this.runPub("get", selection);
		}));
		context.subscriptions.push(vs.commands.registerCommand("pub.upgrade", selection => {
			this.runPub("upgrade", selection);
		}));
	}

	private runPub(command: String, selection?) {
		let root = vs.workspace.rootPath;
		let projectPath = selection
			? path.dirname(selection.path)
			: project.locateBestProjectRoot();
		let shortPath = path.join(path.basename(root), path.relative(root, projectPath));
		let channel = channels.getCreateChannel("Pub");
		channel.show(true);

		// TODO: Add a wrapper around the Dart SDK? It could do things like
		// return the paths for tools in the bin/ dir. 
		let pubPath = os.platform() == "win32"
			? path.join(this.sdk, "bin", "pub.bat")
			: path.join(this.sdk, "bin", "pub");
		channel.appendLine(`[${shortPath}] pub ${command}`);
		let process = child_process.exec(`${pubPath} ${command}`, { "cwd": projectPath });
		channels.runProcessInChannel(process, channel);
	}
}
