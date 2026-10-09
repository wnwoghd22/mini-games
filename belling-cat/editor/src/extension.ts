import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("bellingCat.sceneEditor", new SceneEditorProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand("bellingCat.openSceneEditor", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) {
        await vscode.commands.executeCommand("vscode.openWith", target, "bellingCat.sceneEditor");
      }
    })
  );
}

type ToWebview =
  | { type: "init" | "update"; text: string; version: number; assetsBase?: string }
  | { type: "dialogue"; text: string };
type FromWebview =
  | { type: "edit"; text: string; version: number }
  | { type: "ready" }
  | { type: "openText" }
  | { type: "loadDialogue"; path: string };

class SceneEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    // Scenes live in <assets>/scenes/, so <assets> is two levels up; the webview may load
    // sprite atlases from <assets>/art/.
    const assetsDir = vscode.Uri.joinPath(document.uri, "..", "..");
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "out"), vscode.Uri.joinPath(this.context.extensionUri, "media"), assetsDir],
    };
    panel.webview.html = this.html(panel.webview);

    // Edits that came from the webview are echoed back by onDidChangeTextDocument; skip those.
    let lastSentVersion = -1;
    let pendingFromWebview = false;

    const post = (message: ToWebview) => panel.webview.postMessage(message);
    const send = (type: "init" | "update") => {
      lastSentVersion = document.version;
      post({ type, text: document.getText(), version: document.version, assetsBase: panel.webview.asWebviewUri(assetsDir).toString() });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (pendingFromWebview) {
        pendingFromWebview = false;
        lastSentVersion = document.version;
        return;
      }
      if (document.version !== lastSentVersion) send("update");
    });

    const messageSub = panel.webview.onDidReceiveMessage(async (message: FromWebview) => {
      switch (message.type) {
        case "ready":
          send("init");
          break;
        case "edit": {
          if (message.text === document.getText()) return;
          const edit = new vscode.WorkspaceEdit();
          const whole = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
          edit.replace(document.uri, whole, message.text);
          pendingFromWebview = true;
          const ok = await vscode.workspace.applyEdit(edit);
          if (!ok) pendingFromWebview = false;
          break;
        }
        case "openText":
          await vscode.commands.executeCommand("vscode.openWith", document.uri, "default", vscode.ViewColumn.Beside);
          break;
        case "loadDialogue": {
          const uri = vscode.Uri.joinPath(document.uri, "..", message.path);
          try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            post({ type: "dialogue", text: Buffer.from(bytes).toString("utf8") });
          } catch {
            post({ type: "dialogue", text: "" });
          }
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      changeSub.dispose();
      messageSub.dispose();
    });
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "out", "webview.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "editor.css"));
    const nonce = Math.random().toString(36).slice(2);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<link rel="stylesheet" href="${style}">
<title>Cut Editor</title>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <button data-tool="select" class="tool active" title="V">Select</button>
    <button data-tool="draw" class="tool" title="P">Draw cut</button>
    <button id="btn-play" title="Play selected trigger (Space = next Z)">&#9654; Play</button>
    <button id="btn-stop" disabled>&#9632;</button>
    <span id="status"></span>
    <span class="spacer"></span>
    <button id="btn-fit">Fit</button>
    <button id="btn-text">JSON</button>
  </div>
  <div id="main">
    <canvas id="canvas" tabindex="0"></canvas>
    <aside id="side">
      <section id="cuts-panel"><h3>Cuts</h3><ul id="cut-list"></ul></section>
      <section id="props-panel"><h3>Cut</h3><div id="props"></div></section>
      <section id="flow-panel"><h3>Flow</h3><div id="flow"></div></section>
    </aside>
  </div>
</div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
